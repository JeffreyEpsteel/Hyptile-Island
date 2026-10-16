// Voices (wave 26B): ElevenLabs speech (model eleven_v4, a distinct voice per character) for the people of the game, played
// on the game's existing events, rate-limited, spatialised by the sfx feature's player and subtitled through the
// accessibility layer (the toast when it is missing). Files: public/audio/voices/<id>.ogg (mono 64 kbps, lazy: a line is
// fetched the first time it is wanted, nothing is loaded up front on a phone); the subtitle text is Catalog.js.
// Also installs the ElevenLabs effect samples (Samples.js) over the weakest synthesised cues.
//
//   features.add( 'voices', voices );          (after 'sfx', 'navy', 'cars', 'crew'; ?noVoices turns it off)
//   const v = features.get( 'voices' );
//   v.say( 'navy', 'hail', { force } ) -> line | null      v.stats() / v.director / v.bank / v.lastLine
//
// Who speaks when (events and polled state; the speaker groups are Catalog.js SPEAKERS):
//   a vendor panel opens        poorgoat (fish stand) / ethena (chandlery) / roid (the yard) / agent (a harbour desk): greet;
//                               fishSold / shotBought / flaresBought: sold; the panel closing after a real visit: bye
//   residentTalked              tavern keepers (tavern), Lieutenant Hale (hale), anyone else a townsperson; rumourHeard: tavern rumour
//   townsfolkTalked             a townsperson's greeting; weatherChanged to rain / storm: a rain complaint; in a town by day: market cries
//   navyHail (hail/warn/board)  navy ("Heave to!", "Prepare to be audited!"); a press gang beside you: press
//   crewBanter                  the crew line of the speaker's first trait (seasick, drunkard, brave, ...), at most every 38 s
//   police chase / bust         police (Meridian); agentDelivery: agent; planeTookOff: the radio (intro, then the forecast line)
// Rate limits: Rules.js (2.2 s between voices, a speaker's own gap, 75 s before the same line, nobody talks over a line).

import { Director, crewTraitOf, radioKind, residentSpeaker } from './Rules.js';
import { LINES, SPEAKERS } from './Catalog.js';
import { SampleBank, preferSamples, preferThunder } from './Samples.js';
import { SfxPlayer, FILES } from '../sfx/SfxPlayer.js';

export { Director, GAP, SPEAKER_GAP, CREW_TRAITS, crewTraitOf, radioKind, residentSpeaker } from './Rules.js';
export { LINES, SPEAKERS, MODEL } from './Catalog.js';
export { SampleBank, preferSamples, preferThunder } from './Samples.js';

const base = ( dir ) => {

	try {

		return ( ( import.meta.env && import.meta.env.BASE_URL ) || '/' ) + 'audio/' + dir + '/';

	} catch ( e ) {

		return 'audio/' + dir + '/';

	}

};

const VENDOR_SPEAKER = { buyer: 'poorgoat', shop: 'ethena' };
const wordsSecs = ( text ) => Math.max( 1.2, text.split( /\s+/ ).length * 0.42 );

export class Voices {

	constructor( app, features, { manifest = null, sampleManifest = null, fetchImpl = null, rng = Math.random, player = null, noSamples = false } = {} ) {

		this.app = app;
		this.features = features || null;
		this.rng = rng;
		this.fetchImpl = fetchImpl;
		this.time = 0;
		this.director = new Director( LINES, { rng } );
		this.manifest = manifest;
		this.player = player;
		this.bank = null;
		this.noSamples = noSamples;
		this.lastLine = null;
		this.log = []; // last lines said: { id, who, at }
		this.pending = []; // { at (time), fn }
		this.off = [];
		this.prev = { vendor: null, openAt: 0, police: 0, busted: 0, press: false };
		this.marketAt = 40 + rng() * 40;
		this.rainAt = - 1e9;
		this.hooked = { synth: false, thunder: false };
		if ( manifest ) this._makePlayer();
		if ( sampleManifest ) this._makeBank( sampleManifest );
		this._wire();

	}

	// ---- loading (lazy, off the critical path)

	loadManifests() {

		const f = this.fetchImpl || ( typeof fetch === 'function' ? fetch : null );
		if ( ! f ) return Promise.resolve( false );
		const get = ( dir ) => Promise.resolve( f( base( dir ) + 'manifest.json' ) ).then( ( r ) => ( r.ok ? r.json() : null ) ).catch( () => null );
		return Promise.all( [ this.manifest ? null : get( 'voices' ), this.bank || this.noSamples ? null : get( 'sfx11' ) ] ).then( ( [ v, s ] ) => {

			if ( v && ! this.manifest ) { this.manifest = v; this._makePlayer(); }
			if ( s && ! this.bank ) this._makeBank( s );
			return !! ( v || s );

		} );

	}

	_makePlayer() {

		if ( ! this.player ) this.player = new SfxPlayer( this.app, { url: base( 'voices' ), fetchImpl: this.fetchImpl } );
		for ( const [ id, o ] of Object.entries( this.manifest.files || {} ) ) {

			if ( ! FILES[ id ] ) FILES[ id ] = { cat: 'sfx', gain: 1, ref: 7, max: 55, voices: 1, fade: 0.01 };
			void o;

		}

	}

	_makeBank( manifest ) {

		this.bank = new SampleBank( this.app, manifest, { fetchImpl: this.fetchImpl } );

	}

	_hookSamples() {

		if ( ! this.bank ) return;
		const sfx = this.features && this.features.get ? this.features.get( 'sfx' ) : null;
		if ( sfx && ! this.hooked.synth ) this.hooked.synth = preferSamples( sfx, this.bank ) || this.hooked.synth;
		const weather = this.features && this.features.get ? this.features.get( 'weather' ) : null;
		if ( weather && ! this.hooked.thunder ) this.hooked.thunder = preferThunder( weather, this.bank ) || this.hooked.thunder;

	}

	// ---- speaking

	_secs( id, text ) {

		const f = this.manifest && this.manifest.files && this.manifest.files[ id ];
		return f ? f.secs : wordsSecs( text );

	}

	// say( who, kind ): picks a line (Rules.js), subtitles it and plays it; null when rate-limited or nothing fits
	say( who, kind, { force = false, at = null, gain = 1, name = null, delay = 0 } = {} ) {

		if ( delay > 0 ) { this.pending.push( { at: this.time + delay, fn: () => this.say( who, kind, { force, at, gain, name } ) } ); return null; }
		const peek = this.director.pick( who, kind, this.time );
		if ( ! peek ) return null;
		const line = this.director.say( who, kind, this.time, { force, secs: this._secs( peek.id, peek.text ) + 0.3 } );
		if ( ! line ) return null;
		this.lastLine = { ...line, at: this.time };
		this.log.push( { id: line.id, who, at: this.time } );
		if ( this.log.length > 40 ) this.log.shift();
		this._subtitle( line, name );
		this._play( line, at, gain );
		return line;

	}

	_subtitle( line, name ) {

		const who = name || ( SPEAKERS[ line.who ] && SPEAKERS[ line.who ].name ) || '';
		const ms = Math.max( 2200, this._secs( line.id, line.text ) * 1000 + 900 );
		try {

			const ax = this.app && this.app.accessibility;
			// the accessibility layer owns captions (size, background, off): when it exists its choice stands
			if ( ax && typeof ax.subtitle === 'function' ) { ax.subtitle( line.text, ms, { speaker: who } ); return; }
			const g = this.app && this.app.game;
			if ( g && typeof g.toast === 'function' && this.player && this.player.active ) g.toast( `${ who }: ${ line.text }`, ms );

		} catch ( e ) { /* subtitles must never break the game */ }

	}

	_play( line, at, gain ) {

		const p = this.player;
		if ( ! p ) return;
		const opts = { gain, jitter: 0 };
		if ( at ) opts.at = at;
		Promise.resolve( p.preload( [ line.id ] ) ).then( () => { try { p.play( line.id, opts ); } catch ( e ) { /* ignore */ } } ).catch( () => {} );

	}

	// ---- wiring

	_on( name, fn ) {

		const f = this.features;
		if ( f && typeof f.on === 'function' ) this.off.push( f.on( name, ( e ) => { try { fn( e || {} ); } catch ( err ) { console.warn( 'voices', name, err ); } } ) );

	}

	_wire() {

		this._on( 'fishSold', () => { if ( this.prev.vendor === 'poorgoat' ) this.say( 'poorgoat', 'sold', { delay: 0.6, force: true } ); } );
		this._on( 'shotBought', () => { if ( this.prev.vendor === 'ethena' ) this.say( 'ethena', 'sold', { delay: 0.4, force: true } ); } );
		this._on( 'flaresBought', () => { if ( this.prev.vendor === 'ethena' ) this.say( 'ethena', 'sold', { delay: 0.4, force: true } ); } );
		this._on( 'agentDelivery', () => this.say( 'agent', 'delivery', { delay: 0.8 } ) );
		this._on( 'residentTalked', ( e ) => this.say( residentSpeaker( e, this.rng ), 'greet', { name: e.name } ) );
		this._on( 'townsfolkTalked', ( e ) => this.say( [ 'townA', 'townB', 'townC', 'townD' ][ Math.floor( this.rng() * 4 ) % 4 ], 'greet', { name: e.name } ) );
		this._on( 'rumourHeard', () => this.say( 'tavern', 'rumour', { delay: 0.5 } ) );
		this._on( 'navyHail', ( e ) => this.say( 'navy', e.say === 'warn' ? 'warn' : e.say === 'board' ? 'board' : 'hail', { force: true, delay: 0.3 } ) );
		this._on( 'crewBanter', ( e ) => this._crew( e ) );
		this._on( 'planeTookOff', () => this._radio() );
		this._on( 'weatherChanged', ( e ) => { if ( e.kind === 'rain' || e.kind === 'storm' ) this.rainAt = this.time + 8 + this.rng() * 6; } );

	}

	_crew( e ) {

		const crew = this.features && this.features.get ? this.features.get( 'crew' ) : null;
		const cm = crew && crew.crew;
		const m = cm && cm.member ? cm.member( e.id ) : null;
		const trait = crewTraitOf( m && m.traits );
		if ( ! trait ) return;
		this.say( 'crew', 'crew:' + trait, { name: cm.nameOf ? cm.nameOf( e.id ) : null, delay: 0.5 } );

	}

	_radio() {

		const weather = this.features && this.features.get ? this.features.get( 'weather' ) : null;
		const kind = radioKind( weather && weather.kind );
		if ( ! this.director.ready( 'radio', this.time ) ) return;
		this.say( 'radio', 'intro', { force: true } );
		this.pending.push( { at: this.time + 3.4, fn: () => this.say( 'radio', kind, { force: true } ) } );

	}

	// ---- per frame: polled moments (panels, police, the press gang, the market, rain)

	update( dt ) {

		dt = Math.min( Math.max( Number.isFinite( dt ) ? dt : 0, 0 ), 0.25 );
		this.time += dt;
		if ( ! this.hooked.synth || ! this.hooked.thunder ) this._hookSamples();
		for ( let i = this.pending.length - 1; i >= 0; i -- ) {

			if ( this.pending[ i ].at <= this.time ) { const p = this.pending.splice( i, 1 )[ 0 ]; try { p.fn(); } catch ( e ) { /* ignore */ } }

		}

		this._vendors();
		this._police();
		this._press();
		this._ambient();

	}

	_vendors() {

		const hud = this.app && this.app.game && this.app.game.hud;
		const open = !! ( hud && hud.standOpen && hud.vendor );
		let who = null;
		if ( open ) {

			const v = hud.vendor;
			who = VENDOR_SPEAKER[ v.kind ] || ( v.kind === 'yard' ? ( v.port ? 'agent' : 'roid' ) : null );

		}

		const p = this.prev;
		if ( who && who !== p.vendor ) {

			p.openAt = this.time;
			this.say( who, 'greet', { delay: who === 'roid' ? 1.8 : 0.35 } );

		} else if ( ! who && p.vendor && this.time - p.openAt > 3 && this.rng() < 0.45 ) this.say( p.vendor, 'bye', { force: false } );
		p.vendor = who;

	}

	_police() {

		const cars = this.features && this.features.get ? this.features.get( 'cars' ) : null;
		if ( ! cars ) return;
		const lv = typeof cars.policeLevel === 'function' ? cars.policeLevel() : 0;
		const busted = ( cars.stats && cars.stats.busted ) || 0;
		const p = this.prev;
		if ( lv > 0 && p.police === 0 ) this.say( 'police', 'chase', { force: true } );
		if ( busted > p.busted ) this.say( 'police', 'bust', { force: true } );
		p.police = lv > 0 ? lv : 0;
		p.busted = busted;

	}

	_press() {

		const navy = this.features && this.features.get ? this.features.get( 'navy' ) : null;
		const on = !! ( navy && navy.press );
		if ( on && ! this.prev.press ) this.say( 'press', 'press', { force: true, delay: 1.2 } );
		this.prev.press = on;

	}

	_ambient() {

		const tl = this.features && this.features.get ? this.features.get( 'townlife' ) : null;
		const pl = this.app && this.app.player && this.app.player.position;
		const inTown = !! ( tl && pl && typeof tl.townAt === 'function' && tl.townAt( pl.x, pl.z ) );
		if ( this.time >= this.rainAt && this.rainAt > 0 ) {

			this.rainAt = - 1e9;
			if ( inTown ) this.say( [ 'townB', 'townC', 'townD' ][ Math.floor( this.rng() * 3 ) % 3 ], 'rain' );

		}

		if ( this.time >= this.marketAt ) {

			this.marketAt = this.time + 60 + this.rng() * 70;
			if ( inTown ) this.say( this.rng() < 0.5 ? 'townA' : 'townC', 'market', { gain: 0.55 } );

		}

	}

	stats() {

		return { said: this.director.said, refused: this.director.refused, pending: this.pending.length, samples: this.bank ? this.bank.played : 0, hooked: { ...this.hooked }, last: this.lastLine ? this.lastLine.id : null };

	}

	reset() {

		this.director.reset();
		this.pending.length = 0;
		this.prev = { vendor: null, openAt: 0, police: 0, busted: 0, press: false };

	}

	dispose() {

		for ( const f of this.off ) try { f(); } catch ( e ) { /* ignore */ }
		this.off.length = 0;
		this.pending.length = 0;
		if ( this.player ) this.player.dispose();
		if ( this.bank ) this.bank.dispose();

	}

}

export function install( app, features, options = {} ) {

	try {

		if ( typeof location !== 'undefined' && /(^|[?&])noVoices\b/.test( location.search || '' ) ) return null;

	} catch ( e ) { /* no location */ }

	const v = new Voices( app, features, options );
	// no audio context (?noAudio, node tests): nothing to fetch
	if ( ! options.manifest && app && app.audio ) v.loadManifests();
	return v;

}

export default { install };
