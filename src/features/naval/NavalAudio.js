// Cannon and impact sounds (public/audio/naval/CannonShot_V01.mp3, ShipImpact_V01.mp3: the owner's ElevenLabs
// generations). Played through the game's SoundScape context when there is one: positional (HRTF panner) into its
// sfx bus, so the sfx volume, the mute switch and the underwater muffle apply. Buffers are fetched and decoded
// on first use. Everything is a no-op without app.audio (the ?noAudio flag, node tests).
//
//   const audio = new NavalAudio( app );
//   audio.cannon( x, y, z, gain )     a shot at that world position (heard `distance / 343` seconds later, capped)
//   audio.impact( x, y, z, gain )     a ball into a hull
//   audio.dispose();   audio.played   [ { name, x, y, z, delay } ] log of requests (tests)

const FILES = { cannon: 'audio/naval/CannonShot_V01.mp3', impact: 'audio/naval/ShipImpact_V01.mp3' };
const MAX_VOICES = 10;

function baseUrl() {

	try {

		return ( import.meta.env && import.meta.env.BASE_URL ) || '/';

	} catch ( e ) {

		return '/';

	}

}

export class NavalAudio {

	constructor( app, { base = baseUrl() } = {} ) {

		this.app = app;
		this.base = base;
		this.buffers = new Map();
		this.loading = new Map();
		this.voices = [];
		this.played = [];
		this.failed = new Set();

	}

	get ctx() {

		const a = this.app && this.app.audio;
		return a && a.ctx && ! a._failed ? a.ctx : null;

	}

	_load( name ) {

		const ctx = this.ctx;
		if ( ! ctx || this.failed.has( name ) ) return null;
		if ( this.buffers.has( name ) ) return Promise.resolve( this.buffers.get( name ) );
		if ( ! this.loading.has( name ) ) {

			this.loading.set( name, fetch( this.base + FILES[ name ] )
				.then( ( r ) => r.arrayBuffer() )
				.then( ( b ) => ctx.decodeAudioData( b ) )
				.then( ( buf ) => {

					this.buffers.set( name, buf );
					return buf;

				} )
				.catch( ( e ) => {

					this.failed.add( name );
					console.warn( 'naval: could not load ' + name, e );
					return null;

				} ) );

		}

		return this.loading.get( name );

	}

	_play( name, x, y, z, gain ) {

		const a = this.app && this.app.audio;
		const ctx = this.ctx;
		// distance from the listener, for the speed of sound
		const L = a && a.env ? a.env : null;
		const d = L ? Math.hypot( x - L.lx, y - L.ly, z - L.lz ) : 0;
		const delay = Math.min( d / 343, 1.6 );
		this.played.push( { name, x, y, z, delay, gain } );
		if ( this.played.length > 64 ) this.played.shift();
		if ( ! ctx || a._muted ) return;
		const p = this._load( name );
		if ( ! p ) return;
		p.then( ( buf ) => {

			if ( ! buf || ! this.ctx ) return;
			const src = ctx.createBufferSource();
			src.buffer = buf;
			src.playbackRate.value = 0.94 + Math.random() * 0.12;
			const g = ctx.createGain();
			g.gain.value = gain;
			const pan = ctx.createPanner();
			pan.panningModel = 'HRTF';
			pan.distanceModel = 'inverse';
			pan.refDistance = 22;
			pan.rolloffFactor = 1.1;
			pan.maxDistance = 4000;
			if ( pan.positionX ) {

				pan.positionX.value = x;
				pan.positionY.value = y;
				pan.positionZ.value = z;

			} else pan.setPosition( x, y, z );

			src.connect( g );
			g.connect( pan );
			pan.connect( a.sfxAbove || a.master || ctx.destination );
			const voice = { src, g, pan };
			this.voices.push( voice );
			if ( this.voices.length > MAX_VOICES ) {

				const old = this.voices.shift();
				try { old.src.stop(); } catch ( e ) { /* already ended */ }

			}

			src.onended = () => {

				const i = this.voices.indexOf( voice );
				if ( i >= 0 ) this.voices.splice( i, 1 );
				try { pan.disconnect(); g.disconnect(); } catch ( e ) { /* ignore */ }

			};
			src.start( ctx.currentTime + delay );

		} );

	}

	cannon( x, y, z, gain = 0.8 ) {

		this._play( 'cannon', x, y, z, gain );

	}

	impact( x, y, z, gain = 0.8 ) {

		this._play( 'impact', x, y, z, gain );

	}

	dispose() {

		for ( const v of this.voices ) {

			try { v.src.stop(); } catch ( e ) { /* ignore */ }

		}

		this.voices.length = 0;
		this.buffers.clear();
		this.loading.clear();

	}

}
