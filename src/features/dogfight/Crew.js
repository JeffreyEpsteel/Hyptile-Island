// The crewed aircraft's crew (wave 26A, "2-3-4 seats, gunners or mechanics"), pure (node tests):
//   Seats         who sits where ( 'me' / a peer id / 'ai' / null ): take a free seat, switch to a free one in flight, leave
//   turrets       turretQuat / aimAngles / clampArc / blocked: a turret turns within its arc only, slews at its rate, and its
//                 interrupter holds fire while the line of fire crosses the aircraft's own tail, wings or fuselage
//   TurretGuns    a turret's guns (Guns with its mounts in the turret's frame, parallel barrels)
//   CrewSystems   what the flight engineer and the radio operator look after: each engine (running, stalled, feathered, one
//                 extinguisher bottle), the fuel tanks and their leaks, the patch kits, the radio and the spotted targets.
//                 The minigames: hold to put a fire out, a timed press to restart a stalled engine, hold to pump fuel out of a
//                 leaking tank, hold to patch (the engineer mends anything still there; the radio operator small damage only).
//   AIGunner      an empty gun seat's optional AI (single player): the nearest hostile in its arc, lead, short bursts
//
//   const s = new CrewSystems( 'longreach', { rng } );  s.onHit( part, result );  s.update( dt, damage ) -> events
//   s.extinguish( i, damage )  s.restart( i, quality, damage )  s.feather( i )  s.transfer( dt )  s.patch( damage, role )  s.spot( id )
//   s.effects( damage ) -> { engines [ factor ], feathered [ bool ] }   s.code() / s.adopt( code )   (the network form)

import { Vector3, Quaternion } from '../../engine/index.js';
import { WARBIRDS } from './Warbirds.js';
import { Guns, leadPoint } from './Guns.js';
import { isEngine } from './Damage.js';

const clamp = ( v, a, b ) => ( v < a ? a : v > b ? b : v );
const _q = new Quaternion(), _q2 = new Quaternion(), _v = new Vector3(), _w = new Vector3(), _y = new Vector3( 0, 1, 0 ), _x = new Vector3( 1, 0, 0 );

export const SYS = {
	extinguish: 1.6, // s to hold the extinguisher
	transfer: 0.12, // fuel / s the pump moves
	leak: 0.018, // fuel / s a holed tank loses
	leakChance: 0.3, // a wing (tank) hit that starts a leak
	quitChance: 0.22, // an engine hit at stage 2 that stalls it (restartable)
	patch: 2.2, // s to hold a patch
	patchHp: 28, // what a patch mends
	kits: { engineer: 6, radio: 3 },
	radioCap: 0.67, // the radio operator patches up to "damaged" only
	restartWindow: 0.18, // the needle's green band (half width, 0..1 dial)
	spot: 25, // s a spotted target stays marked
	spotRange: 2200, spotCone: 0.35,
	radioRange: 2500,
};

// ------------------------------------------------------------------ seats

export class Seats {

	constructor( id ) {

		this.W = WARBIRDS[ id ];
		this.who = new Array( this.W.seats.length ).fill( null );

	}

	free( i ) {

		return i >= 0 && i < this.who.length && ! this.who[ i ];

	}

	seatOf( who ) {

		return this.who.indexOf( who );

	}

	take( who, i ) {

		if ( ! this.free( i ) ) return false;
		this.leave( who );
		this.who[ i ] = who;
		return true;

	}

	leave( who ) {

		const i = this.who.indexOf( who );
		if ( i >= 0 ) this.who[ i ] = null;
		return i;

	}

	// the first free seat (the pilot's first), or -1
	firstFree() {

		return this.who.findIndex( ( w ) => ! w );

	}

	// the people aboard (not the AI)
	people() {

		return this.who.filter( ( w ) => w && w !== 'ai' );

	}

	clear() {

		this.who.fill( null );

	}

	// the wire form: one entry per seat ( '' empty, 'ai', or an id )
	code( meId = 'me' ) {

		return this.who.map( ( w ) => ( ! w ? '' : w === 'me' ? meId : w ) );

	}

}

// ------------------------------------------------------------------ turrets

// the guns' frame: the aircraft's, turned to the turret's rest heading, then yaw (about up, +: toward the left of rest) and
// pitch (+: up)
export function turretQuat( planeQ, turret, yaw, pitch, out = new Quaternion() ) {

	out.copy( planeQ );
	out.multiply( _q.setFromAxisAngle( _y, turret.rest + yaw ) );
	out.multiply( _q.setFromAxisAngle( _x, - pitch ) );
	return out;

}

// the yaw and pitch (about the turret's rest) that point along a world direction
export function aimAngles( planeQ, turret, dir ) {

	_v.copy( dir ).normalize().applyQuaternion( _q2.copy( planeQ ).invert() );
	_v.applyAxisAngle( _y, - turret.rest );
	return { yaw: Math.atan2( _v.x, _v.z ), pitch: Math.asin( clamp( _v.y, - 1, 1 ) ) };

}

export function clampArc( turret, yaw, pitch ) {

	const A = turret.arc;
	const y = clamp( yaw, A.yaw[ 0 ], A.yaw[ 1 ] ), p = clamp( pitch, A.pitch[ 0 ], A.pitch[ 1 ] );
	return { yaw: y, pitch: p, inArc: y === yaw && p === pitch };

}

// the interrupter: does the line of fire from the turret cross the aircraft's own parts within `reach` metres?
export function blocked( W, turret, yaw, pitch, reach = 30 ) {

	// the line in the model frame
	const dir = _w.set( 0, 0, 1 ).applyAxisAngle( _x, - pitch ).applyAxisAngle( _y, turret.rest + yaw );
	const o = turret.at;
	for ( const part in W.parts ) for ( const s of W.parts[ part ] ) {

		const cx = s[ 0 ] - o[ 0 ], cy = s[ 1 ] - o[ 1 ], cz = s[ 2 ] - o[ 2 ];
		const dist = Math.hypot( cx, cy, cz );
		// (the turret's own station: the sphere it sits in does not count)
		if ( dist < s[ 3 ] + 0.9 ) continue;
		const t = cx * dir.x + cy * dir.y + cz * dir.z;
		if ( t < 0 || t > reach ) continue;
		const d2 = dist * dist - t * t;
		if ( d2 < s[ 3 ] * s[ 3 ] * 1.1 ) return part;

	}

	return null;

}

// a turret's guns: the Guns rules (rate, ammunition, heat, spread) with parallel barrels from the turret's frame
export class TurretGuns extends Guns {

	constructor( id, turretIndex, opts = {} ) {

		super( id, opts );
		const T = this.W.turrets[ turretIndex ];
		this.turret = T;
		this.mounts = T.guns.map( ( g ) => ( { ...g, at: g.off, left: g.ammo, heat: 0, jam: false, acc: 0, n: 0 } ) );
		this._dirs = this.mounts.map( () => [ 0, 0, 1 ] );

	}

	dirs() {

		return this._dirs;

	}

}

// a turret's state: its angles slewing toward a wish, clamped to the arc
export class Turret {

	constructor( id, index ) {

		this.W = WARBIRDS[ id ];
		this.T = this.W.turrets[ index ];
		this.index = index;
		this.yaw = 0;
		this.pitch = clamp( 0.15, this.T.arc.pitch[ 0 ], this.T.arc.pitch[ 1 ] );
		this.want = { yaw: this.yaw, pitch: this.pitch };
		this.guns = new TurretGuns( id, index );
		this.blockedBy = null;

	}

	aim( yaw, pitch ) {

		const c = clampArc( this.T, yaw, pitch );
		this.want.yaw = c.yaw;
		this.want.pitch = c.pitch;
		return c.inArc;

	}

	step( dt ) {

		const s = this.T.slew * dt;
		this.yaw += clamp( this.want.yaw - this.yaw, - s, s );
		this.pitch += clamp( this.want.pitch - this.pitch, - s, s );
		this.blockedBy = blocked( this.W, this.T, this.yaw, this.pitch );
		return this.blockedBy;

	}

	// the guns' frame in the world (for Guns.fire): the pivot, the aim, the aircraft's way
	frame( flight, out ) {

		out = out || { position: new Vector3(), quaternion: new Quaternion(), velocity: null };
		flight.toWorld( this.T.at, out.position );
		turretQuat( flight.quaternion, this.T, this.yaw, this.pitch, out.quaternion );
		out.velocity = flight.velocity;
		return out;

	}

}

// ------------------------------------------------------------------ the engineer's and the radio operator's systems

export class CrewSystems {

	constructor( id, { rng = Math.random } = {} ) {

		const W = WARBIRDS[ id ];
		this.W = W;
		this.rng = rng;
		this.engines = W.engines.map( () => ( { stalled: false, feathered: false, bottle: 1 } ) );
		// a tank per engine (a single-engine aircraft: one)
		this.tanks = W.engines.map( () => ( { fuel: 1, leak: false } ) );
		this.kits = { engineer: W.seats.some( ( s ) => s.role === 'engineer' ) ? SYS.kits.engineer : 0, radio: W.seats.some( ( s ) => s.role === 'radio' ) ? SYS.kits.radio : 0 };
		this.radio = false;
		this.marks = new Map(); // target id -> seconds left
		this.progress = {}; // a held action's progress (0..1), by name

	}

	// a hit's side effects: a holed tank in the wing, an engine that quits
	onHit( part, result ) {

		const ev = [];
		if ( ( part === 'wingL' || part === 'wingR' ) && this.rng() < SYS.leakChance ) {

			const i = this.tanks.length > 1 ? ( part === 'wingL' ? 0 : 1 ) : 0;
			if ( ! this.tanks[ i ].leak && this.tanks[ i ].fuel > 0 ) {

				this.tanks[ i ].leak = true;
				ev.push( { type: 'leak', tank: i } );

			}

		}

		const ei = this.W.engines.findIndex( ( e ) => e.part === part );
		if ( ei >= 0 && result && result.after >= 2 && result.after < 3 && ! this.engines[ ei ].stalled && this.rng() < SYS.quitChance ) {

			this.engines[ ei ].stalled = true;
			ev.push( { type: 'quit', engine: ei } );

		}

		return ev;

	}

	update( dt ) {

		const ev = [];
		this.tanks.forEach( ( t, i ) => {

			if ( t.leak ) t.fuel = Math.max( 0, t.fuel - SYS.leak * dt );
			// a dry tank starves its engine
			if ( t.fuel <= 0 && this.engines[ i ] && ! this.engines[ i ].stalled ) {

				this.engines[ i ].stalled = true;
				ev.push( { type: 'starved', engine: i } );

			}

		} );
		for ( const [ id, s ] of this.marks ) {

			if ( s - dt <= 0 ) this.marks.delete( id );
			else this.marks.set( id, s - dt );

		}

		return ev;

	}

	// the extinguisher: held for SYS.extinguish s puts the engine's fire out (one bottle each)
	extinguish( i, damage, dt = SYS.extinguish ) {

		const e = this.engines[ i ], part = this.W.engines[ i ] && this.W.engines[ i ].part;
		if ( ! e || ! damage || ! damage.fires[ part ] ) return { ok: false, why: 'noFire' };
		if ( e.bottle <= 0 ) return { ok: false, why: 'empty' };
		const k = 'ext' + i;
		this.progress[ k ] = ( this.progress[ k ] || 0 ) + dt / SYS.extinguish;
		if ( this.progress[ k ] < 1 ) return { ok: false, why: 'holding', progress: this.progress[ k ] };
		this.progress[ k ] = 0;
		e.bottle --;
		damage.extinguish( part );
		return { ok: true };

	}

	// the restart: the needle's position at the press (0..1 dial), good inside the green band round 0.5
	restart( i, needle, damage ) {

		const e = this.engines[ i ], part = this.W.engines[ i ] && this.W.engines[ i ].part;
		if ( ! e || ! e.stalled ) return { ok: false, why: 'running' };
		if ( damage && damage.stage( part ) === 3 ) return { ok: false, why: 'destroyed' };
		if ( this.tanks[ i ] && this.tanks[ i ].fuel <= 0 ) return { ok: false, why: 'fuel' };
		if ( Math.abs( needle - 0.5 ) > SYS.restartWindow ) return { ok: false, why: 'missed' };
		e.stalled = false;
		e.feathered = false;
		return { ok: true };

	}

	feather( i ) {

		const e = this.engines[ i ];
		if ( ! e ) return false;
		e.feathered = ! e.feathered;
		return e.feathered;

	}

	// the pump: fuel out of a leaking tank into a sound one (held); the leak itself needs a patch
	transfer( dt ) {

		if ( this.tanks.length < 2 ) return 0;
		const from = this.tanks.findIndex( ( t ) => t.leak && t.fuel > 0 );
		const to = this.tanks.findIndex( ( t, i ) => i !== from && ! t.leak && t.fuel < 1 );
		if ( from < 0 || to < 0 ) return 0;
		const q = Math.min( this.tanks[ from ].fuel, 1 - this.tanks[ to ].fuel, SYS.transfer * dt );
		this.tanks[ from ].fuel -= q;
		this.tanks[ to ].fuel += q;
		return q;

	}

	// a patch kit (held SYS.patch s): a leaking tank first, else the worst part (the radio operator: small damage only)
	patch( damage, role = 'engineer', dt = SYS.patch ) {

		if ( ! ( this.kits[ role ] > 0 ) ) return { ok: false, why: 'noKits' };
		const cap = role === 'engineer' ? 1 : SYS.radioCap;
		const leak = this.tanks.findIndex( ( t ) => t.leak );
		const part = leak < 0 && damage ? damage.worst( cap ) : null;
		if ( leak < 0 && ! part ) return { ok: false, why: 'nothing' };
		this.progress.patch = ( this.progress.patch || 0 ) + dt / SYS.patch;
		if ( this.progress.patch < 1 ) return { ok: false, why: 'holding', progress: this.progress.patch };
		this.progress.patch = 0;
		this.kits[ role ] --;
		if ( leak >= 0 ) {

			this.tanks[ leak ].leak = false;
			return { ok: true, what: 'leak', tank: leak };

		}

		const hp = damage.mend( part, SYS.patchHp, cap );
		return { ok: true, what: part, hp };

	}

	spot( id ) {

		if ( ! id ) return false;
		this.marks.set( id, SYS.spot );
		return true;

	}

	toggleRadio() {

		this.radio = ! this.radio;
		return this.radio;

	}

	// what the flight sees: each engine's factor (damage x running) and the feathered propellers
	effects( damage ) {

		const fx = damage ? damage.effects() : null;
		return {
			engines: this.engines.map( ( e, i ) => ( e.stalled ? 0 : fx ? fx.engines[ i ] ?? 1 : 1 ) ),
			feathered: this.engines.map( ( e ) => e.feathered ),
		};

	}

	// the wire form: per engine 's' stalled 'f' feathered 'b' bottle; per tank the fuel in tenths and 'l' leaking; kits; radio
	code() {

		const e = this.engines.map( ( x ) => ( x.stalled ? 's' : '' ) + ( x.feathered ? 'f' : '' ) + ( x.bottle ? 'b' : '' ) ).join( ',' );
		const t = this.tanks.map( ( x ) => Math.round( x.fuel * 10 ) + ( x.leak ? 'l' : '' ) ).join( ',' );
		return `${ e }|${ t }|${ this.kits.engineer }.${ this.kits.radio }|${ this.radio ? 1 : 0 }`;

	}

	// a crew member aboard another player's aircraft reads the owner's code
	adopt( code ) {

		if ( typeof code !== 'string' ) return;
		const [ e, t, k, r ] = code.split( '|' );
		( e || '' ).split( ',' ).forEach( ( s, i ) => {

			if ( ! this.engines[ i ] ) return;
			this.engines[ i ].stalled = s.includes( 's' );
			this.engines[ i ].feathered = s.includes( 'f' );
			this.engines[ i ].bottle = s.includes( 'b' ) ? 1 : 0;

		} );
		( t || '' ).split( ',' ).forEach( ( s, i ) => {

			if ( ! this.tanks[ i ] ) return;
			this.tanks[ i ].fuel = Math.max( 0, Math.min( 1, ( parseInt( s, 10 ) || 0 ) / 10 ) );
			this.tanks[ i ].leak = s.includes( 'l' );

		} );
		const [ ke, kr ] = ( k || '0.0' ).split( '.' ).map( ( v ) => parseInt( v, 10 ) || 0 );
		this.kits.engineer = ke;
		this.kits.radio = kr;
		this.radio = r === '1';

	}

	toJSON() {

		return { tanks: this.tanks.map( ( t ) => t.fuel ), kits: { ...this.kits }, bottles: this.engines.map( ( e ) => e.bottle ) };

	}

	// (after a landing the ground crew refills: rearm / repair at the strip)
	refit() {

		for ( const e of this.engines ) {

			e.stalled = false;
			e.feathered = false;
			e.bottle = 1;

		}

		for ( const t of this.tanks ) {

			t.fuel = 1;
			t.leak = false;
		}

		this.kits = { engineer: this.W.seats.some( ( s ) => s.role === 'engineer' ) ? SYS.kits.engineer : 0, radio: this.W.seats.some( ( s ) => s.role === 'radio' ) ? SYS.kits.radio : 0 };

	}

}

// ------------------------------------------------------------------ the AI gunner

export class AIGunner {

	constructor( turret, { skill = 0.55, rng = Math.random } = {} ) {

		this.turret = turret;
		this.skill = skill;
		this.rng = rng;
		this.burst = 0;
		this.rest = 0;
		this.err = { yaw: 0, pitch: 0 };

	}

	// hostiles: [ { position, velocity } ]; returns whether to fire
	think( dt, flight, hostiles ) {

		const tu = this.turret, T = tu.T;
		const pivot = flight.toWorld( T.at, _w );
		let best = null, bd = Infinity;
		for ( const h of hostiles ) {

			const d = pivot.distanceTo( h.position );
			if ( d > 750 || d >= bd ) continue;
			const lp = leadPoint( pivot, flight.velocity, h.position, h.velocity, tu.guns.mounts[ 0 ].vel );
			const a = aimAngles( flight.quaternion, T, _v.set( lp.x - pivot.x, lp.y - pivot.y, lp.z - pivot.z ) );
			const c = clampArc( T, a.yaw, a.pitch );
			if ( ! c.inArc ) continue;
			best = a;
			bd = d;

		}

		if ( ! best ) {

			tu.aim( 0, 0.2 );
			this.burst = 0;
			return false;

		}

		const wob = ( 1.2 - this.skill ) * 0.05;
		this.err.yaw = clamp( this.err.yaw + ( this.rng() - 0.5 ) * wob * dt * 6, - wob, wob );
		this.err.pitch = clamp( this.err.pitch + ( this.rng() - 0.5 ) * wob * dt * 6, - wob, wob );
		tu.aim( best.yaw + this.err.yaw, best.pitch + this.err.pitch );
		const onTarget = Math.abs( tu.yaw - tu.want.yaw ) < 0.05 && Math.abs( tu.pitch - tu.want.pitch ) < 0.05;
		// bursts of ~1 s with pauses
		if ( this.rest > 0 ) {

			this.rest -= dt;
			return false;

		}

		if ( onTarget && bd < 600 ) {

			this.burst += dt;
			if ( this.burst > 0.9 + this.rng() * 0.6 ) {

				this.burst = 0;
				this.rest = 0.6 + this.rng() * 0.8;

			}

			return true;

		}

		return false;

	}

}

export { isEngine };
