// The music bus: lazy fetch + decode of one track at a time, looped playback, crossfades and voice ducking, through the
// SoundScape's reserved `music` category node (audio.music -> master), so the master volume, the mute switch and the Music
// slider already apply in the graph. A context without that node plays into the master (or destination) with the volumes
// applied here. Nothing is fetched until a track is wanted, only while the audio is running, unmuted and the Music slider is
// up; the buffers kept are the playing, the wanted and the fading ones (a phone never holds more than two or three).
//
//   const p = new MusicPlayer( app, { url, fetchImpl, fade: 3.5 } );
//   p.request( 'tavern', 0.8 );    // the wanted track (null = silence) and its level; every frame is fine
//   p.update( dt, { duck: 0..1 } ) // fades, stops, retries; duck = how far the voices pull the music down (0 none, 1 full)
//   p.stats() -> { playing, fading, loaded, loading, failed, fetched, duck, started }

import { TRACKS } from './Director.js';

const clamp = ( v, a, b ) => ( v < a ? a : v > b ? b : v );
const num = ( v, d ) => ( typeof v === 'number' && Number.isFinite( v ) ? v : d );

export const DUCK_DEPTH = 0.3; // the music bus gain while a voice speaks
export const TRIM = 0.5; // the music sits about 6 dB under the sfx at equal sliders (tracks are -16 LUFS)

function baseUrl() {

	try {

		return ( ( import.meta.env && import.meta.env.BASE_URL ) || '/' ) + 'audio/music/';

	} catch ( e ) {

		return 'audio/music/';

	}

}

export class MusicPlayer {

	constructor( app, { url = baseUrl(), fetchImpl = null, fade = 3.5 } = {} ) {

		this.app = app || null;
		this.url = url;
		this.fetchImpl = fetchImpl;
		this.fade = clamp( fade, 3, 4 );
		this.buffers = new Map();
		this.loading = new Map();
		this.failed = new Map(); // name -> time of the failure (retry after 30 s)
		this.fetched = []; // names fetched, in order (tests, debugging)
		this.want = null;
		this.wantLevel = 0;
		this.cur = null; // { name, src, gain, level }
		this.out = []; // tracks fading out: { name, src, gain, until }
		this.duck = 1;
		this.duckNode = null;
		this.time = 0;
		this.started = 0; // tracks started
		this.bus = null;
		this.bare = false;

	}

	get audio() {

		return this.app && this.app.audio ? this.app.audio : null;

	}

	get ctx() {

		const a = this.audio;
		return a && a.ctx && ! a._failed ? a.ctx : null;

	}

	level( kind ) {

		const a = this.audio;
		if ( ! a || typeof a.getVolume !== 'function' ) return 1;
		try {

			return clamp( num( a.getVolume( kind ), 1 ), 0, 1 );

		} catch ( e ) {

			return 1;

		}

	}

	// the audio runs, is not muted, master and music are up: worth fetching and playing
	get active() {

		const a = this.audio, c = this.ctx;
		if ( ! a || ! c ) return false;
		if ( a.muted === true || a.enabled === false || c.state === 'suspended' || c.state === 'closed' ) return false;
		return this.level( 'master' ) > 0.001 && this.level( 'music' ) > 0.001;

	}

	request( name, level = 1 ) {

		this.want = name && TRACKS[ name ] ? name : null;
		this.wantLevel = clamp( num( level, 1 ), 0, 1 );

	}

	_load( name ) {

		if ( this.buffers.has( name ) ) return Promise.resolve( this.buffers.get( name ) );
		if ( ! TRACKS[ name ] || ! this.ctx ) return Promise.resolve( null );
		if ( this.loading.has( name ) ) return this.loading.get( name );
		const ft = this.failed.get( name );
		if ( ft !== undefined && this.time - ft < 30 ) return Promise.resolve( null );
		const f = this.fetchImpl || ( typeof fetch === 'function' ? fetch : null );
		if ( ! f ) return Promise.resolve( null );
		const ctx = this.ctx;
		let p;
		try {

			this.fetched.push( name );
			p = Promise.resolve( f( this.url + TRACKS[ name ].file ) )
				.then( ( r ) => { if ( ! r.ok ) throw new Error( 'HTTP ' + r.status ); return r.arrayBuffer(); } )
				.then( ( ab ) => new Promise( ( res, rej ) => {

					const r = ctx.decodeAudioData( ab, res, rej );
					if ( r && typeof r.then === 'function' ) r.then( res, rej );

				} ) )
				.then( ( buf ) => { this.buffers.set( name, buf ); this.loading.delete( name ); this._trim(); return buf; } )
				.catch( () => { this.failed.set( name, this.time ); this.loading.delete( name ); return null; } );

		} catch ( e ) {

			this.failed.set( name, this.time );
			return Promise.resolve( null );

		}

		this.loading.set( name, p );
		return p;

	}

	// keep only the playing, the wanted and the fading buffers
	_trim() {

		const live = new Set( [ this.want, this.cur && this.cur.name, ...this.out.map( ( o ) => o.name ) ] );
		for ( const k of [ ...this.buffers.keys() ] ) if ( ! live.has( k ) ) this.buffers.delete( k );

	}

	_bus() {

		if ( this.bus ) return this.bus;
		const a = this.audio, c = this.ctx;
		if ( ! a || ! c ) return null;
		const dest = a.music || a.master || c.destination;
		this.bare = ! a.music;
		const d = c.createGain();
		d.gain.value = 1;
		d.connect( dest );
		this.duckNode = d;
		this.bus = d;
		return d;

	}

	_ramp( param, to, secs ) {

		const c = this.ctx;
		const now = num( c && c.currentTime, 0 );
		try {

			if ( param.cancelScheduledValues ) param.cancelScheduledValues( now );
			if ( param.setValueAtTime && param.linearRampToValueAtTime ) {

				param.setValueAtTime( num( param.value, 0 ), now );
				param.linearRampToValueAtTime( to, now + Math.max( 0.01, secs ) );

			} else param.value = to;

		} catch ( e ) {

			param.value = to;

		}

	}

	_gain( level ) {

		const g = clamp( level, 0, 1 ) * TRIM;
		return this.bare ? g * this.level( 'master' ) ** 2 * this.level( 'music' ) ** 2 : g;

	}

	_start( name ) {

		const ctx = this.ctx, bus = this._bus(), buf = this.buffers.get( name );
		if ( ! ctx || ! bus || ! buf ) return false;
		try {

			const src = ctx.createBufferSource();
			src.buffer = buf;
			src.loop = true;
			const g = ctx.createGain();
			g.gain.value = 0;
			src.connect( g );
			g.connect( bus );
			src.start( num( ctx.currentTime, 0 ) + 0.02 );
			const lv = this._gain( this.wantLevel );
			this.cur = { name, src, gain: g, level: lv };
			this._ramp( g.gain, lv, this.fade );
			this.started ++;
			return true;

		} catch ( e ) {

			this.failed.set( name, this.time );
			this.cur = null;
			return false;

		}

	}

	_fadeOut( o, secs ) {

		this._ramp( o.gain.gain, 0, secs );
		o.until = this.time + secs + 0.25;
		this.out.push( o );

	}

	_kill( o ) {

		try { o.src.stop(); } catch ( e ) { /* not started */ }
		try { o.src.disconnect(); o.gain.disconnect(); } catch ( e ) { /* gone */ }

	}

	update( dt, { duck = 0 } = {} ) {

		dt = clamp( num( dt, 0 ), 0, 0.25 );
		this.time += dt;
		let gone = false;
		for ( let i = this.out.length - 1; i >= 0; i -- ) if ( this.time >= this.out[ i ].until ) { this._kill( this.out.splice( i, 1 )[ 0 ] ); gone = true; }
		if ( gone ) this._trim();
		const act = this.active;
		const want = act ? this.want : null;
		const cur = this.cur;

		if ( cur && cur.name !== want ) {

			// leaving (silence, another track, or the audio stopped): fade out, quickly when the audio is off
			this.cur = null;
			this._fadeOut( cur, act ? this.fade : 0.4 );

		}

		if ( want && ! this.cur ) {

			if ( this.buffers.has( want ) ) this._start( want );
			else this._load( want );

		}

		if ( this.cur ) {

			const g = this._gain( this.wantLevel );
			if ( Math.abs( g - this.cur.level ) > 0.01 ) {

				this._ramp( this.cur.gain.gain, g, 0.8 );
				this.cur.level = g;

			}

		}

		// the voices pull the whole bus down quickly and let it back slowly
		const target = 1 - clamp( duck, 0, 1 ) * ( 1 - DUCK_DEPTH );
		if ( Math.abs( target - this.duck ) > 0.005 ) {

			const down = target < this.duck;
			this.duck = target;
			if ( this.duckNode ) this._ramp( this.duckNode.gain, target, down ? 0.25 : 1.4 );

		}

	}

	stats() {

		return { playing: this.cur ? this.cur.name : null, fading: this.out.map( ( o ) => o.name ), loaded: [ ...this.buffers.keys() ], loading: [ ...this.loading.keys() ], failed: [ ...this.failed.keys() ], fetched: [ ...this.fetched ], duck: this.duck, started: this.started };

	}

	stop() {

		if ( this.cur ) { this._kill( this.cur ); this.cur = null; }
		for ( const o of this.out ) this._kill( o );
		this.out.length = 0;

	}

	dispose() {

		this.stop();
		this.buffers.clear();
		this.loading.clear();
		try { if ( this.bus ) this.bus.disconnect(); } catch ( e ) { /* gone */ }
		this.bus = this.duckNode = null;

	}

}
