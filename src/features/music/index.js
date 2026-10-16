// Music director (wave 26C): six ElevenLabs Music tracks (eleven_music_v2_5, generated for the project owner, OGG Vorbis
// about 128 kbps, -16 LUFS, public/audio/music) chosen by what the player is doing, crossfaded over 3.5 s, lazy-loaded one
// at a time. It listens only: it changes no game state and draws nothing.
//
//   features.add( 'music', music );        (after sfx, voices, navy, cars, interiors, night, harbour; ?noMusic turns it off)
//   const m = features.get( 'music' );
//   m.track -> name | null     m.why     m.state() -> { track, level, why, ctx, player }     m.player / m.selector
//
// Which track (Director.js has the table and the hysteresis):
//   main menu                                       menu-theme      app.menuOpen with no session (the pause menu lowers it)
//   home island and the small islands, by day       island-day      WORLD.islands, the player inside the shore
//   at sea (boat, swimming off an island) or flying sailing         player.mode boat / plane, the helicopter's piloted flag
//   inside a tavern, or within 22 m of one at night tavern          interiors.inside (service tavern), harbour.sites.tavern
//   Meridian after dusk (not flying)                meridian-night  WORLD.islands meridian, night factor >= 0.3
//   a navy chase, police chase, dogfight, naval fight combat        navy.isWanted() with a navy ship hunting within 600 m,
//                                                   cars.policeLevel() > 0, dogfight.engaged, a pirate ship in chase / hunt /
//                                                   broadside within 300 m, cannonFired by the player or a near pirate and
//                                                   playerBoatDamaged (a 10 s pulse); held 16 s so it does not flicker
//   island at night away from a tavern             silence ("quiet by night in the wild"); sailing is 25% lower at night
// Mix: it plays on the SoundScape's music category (audio.music -> master): the master volume and the mute switch apply and the
// Music slider in settings (set.music, the SoundScape's 'music' volume) is its own. It sits under the sfx and the voices:
// the bus is pulled to 30% while a voice line plays (the voices feature's player) and let back over 1.4 s.

import { WORLD } from '../../world/WorldLayout.js';
import { MusicPlayer, DUCK_DEPTH, TRIM } from './MusicPlayer.js';
import { Selector, TRACKS, TRACK_NAMES, TUNE, pick, locate } from './Director.js';

export { MusicPlayer, DUCK_DEPTH, TRIM, Selector, TRACKS, TRACK_NAMES, TUNE, pick, locate };

const FIGHT_STATES = new Set( [ 'chase', 'hunt', 'broadside' ] );
const TAVERN_STYLES = new Set( [ 'tavern', 'rumhole', 'keel' ] );
const PULSE = 10; // s a cannon shot or a hit on the player's hull counts as a fight

export class Music {

	constructor( app, features, { player = null, fetchImpl = null, islands = null, noMusic = null } = {} ) {

		this.app = app;
		this.features = features || null;
		this.player = player || new MusicPlayer( app, { fetchImpl } );
		this.selector = new Selector();
		this.islands = islands || WORLD.islands || [];
		this.off = false;
		try { this.off = noMusic !== null ? !! noMusic : !! ( app && app.qs && app.qs.has && app.qs.has( 'noMusic' ) ); } catch ( e ) { this.off = false; }
		this.time = 0;
		this.island = 'sea';
		this.pulseUntil = - 1;
		this.last = null; // the last context and result (debug)
		this.unsub = [];
		this._on( 'cannonFired', ( e ) => this._cannon( e ) );
		this._on( 'playerBoatDamaged', () => { this.pulseUntil = this.time + PULSE; } );

	}

	get track() {

		return this.player.cur ? this.player.cur.name : null;

	}

	get why() {

		return this.selector.current ? this.selector.current.why : null;

	}

	_f( name ) {

		const f = this.features;
		try { return f && f.get ? f.get( name ) || null : null; } catch ( e ) { return null; }

	}

	_on( name, fn ) {

		const f = this.features;
		if ( f && typeof f.on === 'function' ) this.unsub.push( f.on( name, ( e ) => { try { fn( e || {} ); } catch ( err ) { /* a listener must not break the game */ } } ) );

	}

	_pos() {

		const p = this.app && this.app.player && this.app.player.position;
		return p && Number.isFinite( p.x ) && Number.isFinite( p.z ) ? p : null;

	}

	_cannon( e ) {

		const p = this._pos();
		if ( e.by === 'player' ) { this.pulseUntil = this.time + PULSE; return; }
		if ( p && Number.isFinite( e.x ) && Number.isFinite( e.z ) && Math.hypot( e.x - p.x, e.z - p.z ) < 400 ) this.pulseUntil = this.time + PULSE;

	}

	_night() {

		const n = this._f( 'night' );
		if ( n && Number.isFinite( n.nightFactor ) ) return n.nightFactor;
		const h = this.app && this.app.settings && this.app.settings.timeOfDay;
		if ( ! Number.isFinite( h ) ) return 0;
		return h >= 20.5 || h < 5 ? 1 : h >= 19 ? ( h - 19 ) / 1.5 : h < 6.5 ? ( 6.5 - h ) / 1.5 : 0;

	}

	_flying() {

		const p = this.app && this.app.player;
		if ( p && p.mode === 'plane' ) return true;
		const h = this._f( 'helicopter' );
		if ( h && h.piloted && ! ( h.flight && h.flight.grounded ) ) return true;
		const d = this._f( 'dogfight' );
		return !! ( d && ( d.flying === true || d.piloted === true ) );

	}

	_tavern( p ) {

		const it = this._f( 'interiors' );
		const room = it && it.inside;
		const def = room && room.def;
		const inside = !! ( def && ( def.service === 'tavern' || TAVERN_STYLES.has( def.style ) ) );
		let dist = Infinity;
		const hb = this._f( 'harbour' );
		const sites = hb && hb.sites && hb.sites.tavern;
		if ( p && sites ) for ( const s of sites ) if ( Number.isFinite( s.x ) && Number.isFinite( s.z ) ) dist = Math.min( dist, Math.hypot( s.x - p.x, s.z - p.z ) );
		if ( p && it && Array.isArray( it.list ) ) {

			for ( const r of it.list ) {

				const d = r && r.def;
				if ( ! d || ! ( d.service === 'tavern' || TAVERN_STYLES.has( d.style ) ) || ! r.R ) continue;
				const f = r.F && r.F.position ? r.F.position : r.F;
				if ( f && Number.isFinite( f.x ) && Number.isFinite( f.z ) ) dist = Math.min( dist, Math.hypot( f.x - p.x, f.z - p.z ) );

			}

		}

		return { inside, dist };

	}

	_combat( p ) {

		if ( this.time < this.pulseUntil ) return true;
		const cars = this._f( 'cars' );
		if ( cars && typeof cars.policeLevel === 'function' && cars.policeLevel() > 0 ) return true;
		const df = this._f( 'dogfight' );
		if ( df && ( df.engaged === true || df.inFight === true || ( typeof df.isEngaged === 'function' && df.isEngaged() ) ) ) return true;
		if ( ! p ) return false;
		const navy = this._f( 'navy' );
		if ( navy && navy.ships && navy.ships.values && typeof navy.isWanted === 'function' && navy.isWanted() ) {

			for ( const s of navy.ships.values() ) {

				if ( s.alive && FIGHT_STATES.has( s.state ) && Math.hypot( s.x - p.x, s.z - p.z ) < 600 ) return true;

			}

		}

		const nv = this._f( 'naval' );
		const ships = nv && nv.ships;
		if ( ships && ships.length !== undefined ) {

			for ( const s of ships ) {

				if ( s && s.alive && s.faction === 'pirate' && FIGHT_STATES.has( s.state ) && Math.hypot( s.x - p.x, s.z - p.z ) < 300 ) return true;

			}

		}

		return false;

	}

	// how far the voices pull the music down: 1 while a line speaks (or is about to)
	voiceDuck() {

		const v = this._f( 'voices' );
		if ( ! v ) return 0;
		const c = this.player.ctx;
		const now = c && Number.isFinite( c.currentTime ) ? c.currentTime : 0;
		const pl = v.player;
		if ( pl && pl.voices ) for ( const list of pl.voices.values() ) for ( const x of list ) if ( x.end > now ) return 1;
		if ( Array.isArray( v.pending ) && v.pending.some( ( q ) => q.at - v.time < 0.4 ) ) return 1;
		return 0;

	}

	context() {

		const a = this.app || {};
		const p = this._pos();
		const mode = a.player && a.player.mode;
		if ( p ) this.island = locate( p.x, p.z, this.islands, this.island );
		const tv = this._tavern( p );
		return {
			menu: !! ( a.menuOpen && ! a.session ),
			paused: !! ( a.menuOpen && a.session ),
			tavernInside: tv.inside,
			tavernDist: tv.dist,
			flying: this._flying(),
			boat: mode === 'boat',
			island: this.island,
			night: this._night(),
			combat: this._combat( p ),
		};

	}

	update( dt ) {

		dt = Math.min( Math.max( Number.isFinite( dt ) ? dt : 0, 0 ), 0.25 );
		this.time += dt;
		if ( this.off ) return;
		let r;
		try {

			const c = this.context();
			r = this.selector.step( c, dt );
			this.last = { ctx: c, pick: r };

		} catch ( e ) {

			r = this.selector.current || { track: null, level: 0, why: 'error' };

		}

		this.player.request( r.track, r.level );
		this.player.update( dt, { duck: this.voiceDuck() } );

	}

	state() {

		return { track: this.track, want: this.player.want, level: this.player.wantLevel, why: this.why, ctx: this.last && this.last.ctx, player: this.player.stats() };

	}

	reset() {

		this.selector.reset();
		this.pulseUntil = - 1;
		this.island = 'sea';
		this.player.request( null, 0 );

	}

	dispose() {

		for ( const f of this.unsub ) try { f(); } catch ( e ) { /* ignore */ }
		this.unsub.length = 0;
		this.player.dispose();

	}

}

export function install( app, features, options = {} ) {

	return new Music( app, features, options );

}

export default { install };
