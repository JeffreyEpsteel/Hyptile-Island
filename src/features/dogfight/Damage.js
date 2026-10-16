// An aircraft's damage (wave 26A), pure: hit points per part (the airframe's parts: Warbirds.js parts keys, PART_HP x its hp,
// hits divided by its armour), four stages each (0 sound, 1 damaged, 2 critical, 3 gone), fires (on an engine, or the
// fuselage after a shell), and what they do to the flight (FighterFlight dmg) and to the look (smoke, flames, a wing or
// the tail torn off).
//
//   const d = new Damage( 'bulwark', { rng } );
//   d.hit( part, dmg, { shell } ) -> { part, before, after, events: [ 'fire' | 'engineDead' | 'wingOff' | 'tailOff' |
//                                       'pilotHurt' | 'pilotKilled' | 'breakup' | 'down' ] }
//   d.update( dt, { speed } ) -> events (fires burning on, blown out in a dive, burning out)
//   d.stage( part ) 0..3   d.effects() -> { power, engines [ per engine ], liftL, liftR, tail, drag, lost, engineDead, smoke 0..2,
//                                         fire, fires { part: s }, pilot 0..1, wingOffL, wingOffR, tailOff }
//   d.extinguish( part ) / d.mend( part, hp, cap01 ) (the crew's extinguisher and patches)
//   d.code() / Damage.parse( code )   eight stage digits (Warbirds.js PARTS order; a part the airframe has not: 0) and a
//                                     letter per burning part ('a' = PARTS[ 0 ]...): the network form
//   d.repairCost() / d.repair() / d.toJSON() / d.fromJSON( o )   d.down (lost: a wing or the tail gone, broken up, the pilot dead)

import { WARBIRDS, PARTS, PART_HP, COSTS } from './Warbirds.js';

export const FIRE = {
	engineChance: 0.1, shellChance: 0.22, fuselageShell: 0.08, // per hit, once the engine is damaged
	engineHp: 3.2, fuselageHp: 2.2, // per second while burning
	minT: 10, maxT: 22, // s it burns unless blown out or the airframe goes first
	blowSpeed: 165, blowChance: 0.3, // a dive past this blows it out (per second)
};

const STAGE_EFFECT = {
	engine: [ 1, 0.85, 0.55, 0 ],
	wing: [ 1, 0.92, 0.72, 0.12 ],
	tail: [ 1, 0.85, 0.5, 0.1 ],
};

export const isEngine = ( p ) => p === 'engine' || p === 'engineL' || p === 'engineR';

export class Damage {

	constructor( id = 'sabrewing', { rng = Math.random } = {} ) {

		const W = WARBIRDS[ id ] || WARBIRDS.sabrewing;
		this.id = W.id;
		this.W = W;
		this.armour = W.armour || 1;
		this.rng = rng;
		this.parts = PARTS.filter( ( p ) => W.parts[ p ] );
		this.engineParts = W.engines.map( ( e ) => e.part );
		this.max = {};
		for ( const p of this.parts ) this.max[ p ] = PART_HP[ p ] * ( W.hp || 1 );
		this.hp = { ...this.max };
		this.fires = {};
		this.down = false;
		this.why = null;
		this._dead = {};

	}

	// seconds left of the longest fire (0: nothing burns)
	get fire() {

		let t = 0;
		for ( const k in this.fires ) t = Math.max( t, this.fires[ k ] );
		return t;

	}

	has( part ) {

		return this.parts.includes( part );

	}

	stage( part ) {

		if ( ! this.has( part ) ) return 0;
		const h = this.hp[ part ], m = this.max[ part ];
		if ( ! ( h > 0 ) ) return 3;
		return h > m * 2 / 3 ? 0 : h > m / 3 ? 1 : 2;

	}

	// dmg: the round's damage before armour; shells also shake the fuselage
	hit( part, dmg, { shell = false } = {} ) {

		if ( ! this.has( part ) ) part = 'fuselage';
		const before = this.stage( part ), events = [];
		const d = Math.max( 0, dmg ) / this.armour;
		this.hp[ part ] = Math.max( 0, this.hp[ part ] - d );
		if ( shell && part !== 'fuselage' ) this.hp.fuselage = Math.max( 0, this.hp.fuselage - d * 0.25 );
		const after = this.stage( part );
		const r = this.rng;
		if ( ! this.fires[ part ] && isEngine( part ) && this.stage( part ) >= 1 && this.stage( part ) < 3 && r() < ( shell ? FIRE.shellChance : FIRE.engineChance ) ) {

			this.fires[ part ] = FIRE.minT + r() * ( FIRE.maxT - FIRE.minT );
			events.push( 'fire' );

		} else if ( ! this.fires.fuselage && part === 'fuselage' && shell && r() < FIRE.fuselageShell ) {

			this.fires.fuselage = FIRE.minT + r() * ( FIRE.maxT - FIRE.minT );
			events.push( 'fire' );

		}

		if ( part === 'pilot' && after > before ) events.push( after === 3 ? 'pilotKilled' : 'pilotHurt' );
		if ( after === 3 && before < 3 ) {

			if ( isEngine( part ) ) {

				this._dead[ part ] = true;
				events.push( 'engineDead' );

			}

			if ( part === 'wingL' || part === 'wingR' ) events.push( 'wingOff' );
			if ( part === 'tail' ) events.push( 'tailOff' );
			if ( part === 'fuselage' ) events.push( 'breakup' );

		}

		this._checkDown( events );
		return { part, before, after, events };

	}

	_checkDown( events ) {

		if ( this.down ) return;
		const lost = [ 'wingL', 'wingR', 'tail', 'fuselage', 'pilot' ].some( ( p ) => this.stage( p ) === 3 );
		if ( lost ) {

			this.down = true;
			this.why = this.stage( 'pilot' ) === 3 ? 'pilot' : this.stage( 'fuselage' ) === 3 ? 'breakup' : this.stage( 'tail' ) === 3 ? 'tail' : 'wing';
			events.push( 'down' );

		}

	}

	update( dt, { speed = 0 } = {} ) {

		const events = [];
		for ( const part in this.fires ) {

			if ( ! ( this.fires[ part ] > 0 ) ) {

				delete this.fires[ part ];
				continue;

			}

			this.fires[ part ] -= dt;
			if ( isEngine( part ) ) this.hp[ part ] = Math.max( 0, this.hp[ part ] - FIRE.engineHp * dt );
			this.hp.fuselage = Math.max( 0, this.hp.fuselage - FIRE.fuselageHp * dt * ( part === 'fuselage' ? 1.4 : 1 ) );
			if ( isEngine( part ) && this.stage( part ) === 3 && ! this._dead[ part ] ) {

				this._dead[ part ] = true;
				events.push( 'engineDead' );

			}

			if ( speed > FIRE.blowSpeed && this.rng() < FIRE.blowChance * dt || this.fires[ part ] <= 0 ) {

				delete this.fires[ part ];
				events.push( 'fireOut' );

			}

		}

		const wasDown = this.down;
		this._checkDown( events );
		if ( ! wasDown && this.down && this.stage( 'fuselage' ) === 3 ) events.push( 'breakup' );
		return events;

	}

	extinguish( part ) {

		if ( ! this.fires[ part ] ) return false;
		delete this.fires[ part ];
		return true;

	}

	// a field patch: hp back on a part that still exists, up to cap01 of its maximum
	mend( part, hp, cap01 = 1 ) {

		if ( ! this.has( part ) || this.stage( part ) === 3 ) return 0;
		const cap = this.max[ part ] * cap01;
		const before = this.hp[ part ];
		this.hp[ part ] = Math.max( before, Math.min( cap, before + hp ) );
		return this.hp[ part ] - before;

	}

	// the part most worth patching (the lowest share of its hit points that is not gone), or null
	worst( cap01 = 1 ) {

		let best = null, low = Infinity;
		for ( const p of this.parts ) {

			if ( p === 'pilot' || this.stage( p ) === 3 ) continue;
			const k = this.hp[ p ] / this.max[ p ];
			if ( k < low && k < cap01 - 0.01 ) {

				low = k;
				best = p;

			}

		}

		return best;

	}

	effects() {

		const s = ( p ) => this.stage( p );
		const wl = s( 'wingL' ), wr = s( 'wingR' ), tl = s( 'tail' ), fu = s( 'fuselage' );
		const engines = this.engineParts.map( ( p ) => STAGE_EFFECT.engine[ s( p ) ] );
		const worstEngine = Math.max( ...this.engineParts.map( s ) );
		return {
			power: engines[ 0 ],
			engines,
			engineDead: engines.every( ( e ) => e <= 0 ),
			liftL: STAGE_EFFECT.wing[ wl ],
			liftR: STAGE_EFFECT.wing[ wr ],
			tail: STAGE_EFFECT.tail[ tl ],
			drag: 1 + 0.12 * ( wl + wr + fu ) + ( wl === 3 || wr === 3 ? 0.6 : 0 ),
			lost: this.down,
			smoke: this.fire > 0 ? 2 : worstEngine >= 2 ? 2 : worstEngine >= 1 ? 1 : 0,
			fire: this.fire > 0,
			fires: { ...this.fires },
			pilot: this.hp.pilot / this.max.pilot,
			wingOffL: wl === 3,
			wingOffR: wr === 3,
			tailOff: tl === 3,
		};

	}

	// eight stage digits in PARTS order, then a letter per burning part
	code() {

		let c = PARTS.map( ( p ) => this.stage( p ) ).join( '' );
		for ( const p in this.fires ) if ( this.fires[ p ] > 0 ) c += String.fromCharCode( 97 + PARTS.indexOf( p ) );
		return c;

	}

	static parse( code ) {

		const out = { stages: {}, fire: false, fires: [] };
		const s = typeof code === 'string' ? code : '';
		PARTS.forEach( ( p, i ) => {

			const v = s.charCodeAt( i ) - 48;
			out.stages[ p ] = v >= 0 && v <= 3 ? v : 0;

		} );
		for ( let i = PARTS.length; i < s.length && i < PARTS.length + 4; i ++ ) {

			const p = PARTS[ s.charCodeAt( i ) - 97 ];
			if ( p ) out.fires.push( p );

		}

		// (the older form: six digits and an 'f')
		if ( s.length === 7 && s[ 6 ] === 'f' ) out.fires.push( 'engine' );
		out.fire = out.fires.length > 0;
		return out;

	}

	missing() {

		let n = 0;
		for ( const p of this.parts ) n += this.max[ p ] - this.hp[ p ];
		return n;

	}

	repairCost() {

		return Math.round( this.missing() * COSTS.repairPerHp / 10 ) * 10;

	}

	repair() {

		this.hp = { ...this.max };
		this.fires = {};
		this.down = false;
		this.why = null;
		this._dead = {};

	}

	toJSON() {

		const hp = {};
		for ( const p of this.parts ) hp[ p ] = Math.round( this.hp[ p ] * 10 ) / 10;
		return { hp };

	}

	fromJSON( o ) {

		this.repair();
		if ( ! o || ! o.hp ) return;
		for ( const p of this.parts ) if ( Number.isFinite( o.hp[ p ] ) ) this.hp[ p ] = Math.max( 0, Math.min( this.max[ p ], o.hp[ p ] ) );
		// a saved aircraft is never mid-air: a part at 0 is mended to critical (the ground crew patched it to fly home)
		for ( const p of this.parts ) if ( this.hp[ p ] <= 0 ) this.hp[ p ] = this.max[ p ] * 0.2;

	}

}
