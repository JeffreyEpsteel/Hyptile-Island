import { t } from '../i18n/index.js';
import { WORLD } from '../world/WorldLayout.js';
import { SAFE_ZONES, CALM } from '../features/naval/Routes.js';
import { CHUTE } from '../features/seaplane/Chute.js';
import { fillCaps } from './Guide.js';

// Contextual tips (wave 16B): a short line the first time the player meets a system built since wave 9, so new players
// find them. Each fires once per save (toJSON), never stands (the guide's tip card, ~7 s, a click dismisses it; a toast
// when there is no guide), and has a touch wording when the line names keys. Keys follow the bindings ({ref} caps).
//
//   swim     swimming 20 m from any shore          climbing onto floats, the flare and the harbour launch
//   board    a crippled pirate alongside            B boards her; after the fight you can take her
//   agent    on foot at a foreign dock              Roid & Co.'s agent sells and recovers boats
//   market   the first market window                the harbourmaster's board and the best loads
//   bail     the first take-off                     ' twice bails out (above CHUTE.minAgl)
//   lights   night at the helm with the lights off  L lights the boat
//   calm     heading out across the calm waters' edge round home   beyond the reef the pirates hunt
//
// Events used (Features.js): portVisited, planeTookOff, shipCrippled, nightPhase; the rest is polled twice a second
// (the swim distance, the market window, the calm edge, the boat lights), cheap and allocation-free.
//
//   features.add( 'tips', tips );   const tp = features.get( 'tips' );
//   tp.fire( id ) -> bool (false when seen)   tp.seen (Set)   tp.html( id, touch? )   tp.toJSON() / fromJSON( d ) / reset()
// Headless: install( app, features ) runs without a DOM (no guide: app.game.toast, else nothing).

export const SHORE = 20; // m from any land before the swim tip
export const ALONGSIDE = 40; // m: a crippled pirate this close is "alongside"
export const CALM_EDGE = 40; // m inside the calm circle's rim: heading out, the calm tip
const POLL = 0.5; // s between the polled checks
const CRIPPLE_WAIT = 240; // s a crippled ship stays a candidate for the board tip

// id -> the text key and its touch wording (a line with no keys reads the same on touch)
export const TIPS = {
	swim: { text: 'tips.swim', touch: 'tips.swim.touch' },
	board: { text: 'tips.board', touch: 'tips.board.touch' },
	agent: { text: 'tips.agent' },
	market: { text: 'tips.market' },
	bail: { text: 'tips.bail', touch: 'tips.bail.touch' },
	lights: { text: 'tips.lights', touch: 'tips.lights.touch' },
	calm: { text: 'tips.calm' },
};

// the calm circles round home (Jade Landing, the home dock)
const HOME_CALM = SAFE_ZONES.filter( ( s ) => s.r >= CALM.home );

// any land or dock within r of (x, z)? (rings of 16 bearings; terrain.heightAt above the waterline)
export function landNear( terrain, x, z, r = SHORE ) {

	if ( ! terrain || typeof terrain.heightAt !== 'function' ) return true; // (no map: no tip)
	for ( const port of WORLD.ports || [] ) {

		const d = port && port.dock && port.dock.position;
		if ( d && Math.hypot( d.x - x, d.z - z ) < r ) return true;

	}

	if ( terrain.heightAt( x, z ) > 0.2 ) return true;
	for ( let i = 1; i <= 4; i ++ ) {

		const d = r * i / 4;
		for ( let a = 0; a < 16; a ++ ) {

			const ang = a * Math.PI / 8;
			if ( terrain.heightAt( x + Math.sin( ang ) * d, z + Math.cos( ang ) * d ) > 0.2 ) return true;

		}

	}

	return false;

}

// how far inside the home calm waters (x, z) lies: > 0 inside (metres to the rim), <= 0 outside
export function calmDepth( x, z ) {

	let best = - Infinity;
	for ( const s of HOME_CALM ) best = Math.max( best, s.r - Math.hypot( x - s.x, z - s.z ) );
	return best;

}

export class Tips {

	constructor( app, features ) {

		this.app = app || {};
		this.features = features || null;
		this.seen = new Set();
		this.shown = []; // ids in the order they fired this session (tests, the debug panel)
		this._t = 0;
		this._cripples = new Map(); // ship id -> seconds left as a candidate
		this._night = false;
		this._market = false;
		this._calm = null; // the last calm depth while afloat
		this._off = [];
		const on = ( name, fn ) => {

			if ( features && features.on ) this._off.push( features.on( name, fn ) );

		};

		on( 'portVisited', ( e ) => this._port( e && e.port ) );
		on( 'planeTookOff', () => this.fire( 'bail' ) );
		on( 'shipCrippled', ( e ) => {

			if ( e && e.id !== undefined && ! this.seen.has( 'board' ) ) this._cripples.set( e.id, CRIPPLE_WAIT );

		} );
		on( 'nightPhase', ( e ) => {

			this._night = !! e && ( e.phase === 'night' || e.night > 0.5 );

		} );

	}

	get touch() {

		const ui = this.app.ui;
		if ( ! ui ) return false;
		if ( ui.touch && ui.touch.active ) return true;
		const root = ui.ui && ui.ui.root;
		return !! ( root && root.classList && root.classList.contains( 'is-touch' ) );

	}

	// the tip's line as HTML (the key caps follow the bindings; touch: the button names)
	html( id, touch = this.touch ) {

		const T = TIPS[ id ];
		if ( ! T ) return '';
		return fillCaps( t( touch && T.touch ? T.touch : T.text, undefined, { m: CHUTE.minAgl } ), this.app.accessibility || null );

	}

	// show a tip once per save: false when it was seen (or is unknown)
	fire( id ) {

		if ( ! TIPS[ id ] || this.seen.has( id ) ) return false;
		this.seen.add( id );
		this.shown.push( id );
		if ( id === 'board' ) this._cripples.clear();
		const html = this.html( id );
		const g = this.app.game;
		if ( g && g.guide && typeof g.guide.say === 'function' ) g.guide.say( `tips.${ id }`, html );
		else if ( g && typeof g.toast === 'function' ) g.toast( html.replace( /<[^>]+>/g, '' ), 6000 );
		return true;

	}

	_port( port ) {

		if ( ! port || port === 'home' || this.seen.has( 'agent' ) ) return;
		const ag = this.features && this.features.get ? this.features.get( 'agents' ) : null;
		if ( ag && typeof ag.agentOf === 'function' && ! ag.agentOf( port ) ) return; // (no lectern here)
		this.fire( 'agent' );

	}

	_isNight() {

		const n = this.features && this.features.get ? this.features.get( 'night' ) : null;
		return n && typeof n.isNight === 'function' ? n.isNight() : this._night;

	}

	update( dt ) {

		if ( this._cripples.size ) for ( const [ id, left ] of this._cripples ) {

			if ( left <= dt ) this._cripples.delete( id );
			else this._cripples.set( id, left - dt );

		}

		this._t -= dt;
		if ( this._t > 0 ) return;
		this._t = POLL;
		const app = this.app, p = app.player, f = this.features;
		if ( ! p || ! p.position ) return;
		const x = p.position.x, z = p.position.z, mode = p.mode;
		const aboard = mode === 'boat' || mode === 'deck' || mode === 'seat';

		if ( mode === 'swim' && ! this.seen.has( 'swim' ) && ! landNear( app.terrainData, x, z, SHORE ) ) this.fire( 'swim' );

		// a crippled pirate alongside (shipCrippled names her; naval knows where she is)
		if ( this._cripples.size && aboard ) {

			const naval = f && f.get ? f.get( 'naval' ) : null;
			for ( const s of ( naval && naval.ships ) || [] ) {

				if ( ! this._cripples.has( s.id ) || ! s.alive || s.faction !== 'pirate' ) continue;
				if ( Math.hypot( s.x - x, s.z - z ) < ALONGSIDE ) {

					this.fire( 'board' );
					break;

				}

			}

		}

		// the market window opening (the smuggler's is no market)
		const trade = f && f.get ? f.get( 'trade' ) : null;
		const market = !! ( trade && trade.isOpen && trade.openKind !== 'smuggler' );
		if ( market && ! this._market ) this.fire( 'market' );
		this._market = market;

		if ( mode === 'boat' && app.boatLightsOn === false && ! this.seen.has( 'lights' ) && this._isNight() ) this.fire( 'lights' );

		// heading out through the calm waters' rim round home
		if ( aboard || mode === 'swim' ) {

			const d = calmDepth( x, z );
			if ( d > 0 && d < CALM_EDGE && this._calm !== null && d < this._calm - 0.5 ) this.fire( 'calm' );
			this._calm = d;

		} else this._calm = null;

	}

	toJSON() {

		return { v: 1, seen: [ ...this.seen ] };

	}

	fromJSON( d ) {

		this.seen = new Set( d && Array.isArray( d.seen ) ? d.seen.filter( ( id ) => typeof id === 'string' ) : [] );

	}

	reset() {

		this.seen.clear();
		this.shown.length = 0;
		this._cripples.clear();
		this._market = false;
		this._calm = null;

	}

	dispose() {

		for ( const off of this._off ) off();
		this._off.length = 0;

	}

}

export function install( app, features ) {

	return new Tips( app, features );

}
