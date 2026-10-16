// One simulated aircraft (wave 26A): the player's own (any seat), an AI raider or a target drone. Pure apart from what the
// caller hangs on it (a visual): the flight, the damage and its effects, the crew systems of a crewed type, the pilot's
// fixed guns, the turrets, the seats, the arming switch, the bomb.
//
//   const a = new Aircraft( 'longreach', { env, owner: 'me', rng } );
//   a.step( dt, controls ) -> events (flight + damage + systems: { type, ... })   a.hit( part, dmg, { shell } ) -> result
//   a.firePilot( dt, trigger, out )   a.fireTurret( i, dt, trigger, out )   a.dropBomb() -> bomb | null
//   a.status 'fly' | 'ground' | 'down' | 'crash' | 'ditched'   a.toRecord() / a.fromRecord( r )

import { Vector3, Quaternion } from '../../engine/index.js';
import { WARBIRDS } from './Warbirds.js';
import { FighterFlight } from './FighterFlight.js';
import { Damage } from './Damage.js';
import { Guns } from './Guns.js';
import { ArmSwitch } from './Consent.js';
import { Seats, Turret, CrewSystems } from './Crew.js';

const _frame = { position: new Vector3(), quaternion: new Quaternion(), velocity: null };

export class Aircraft {

	constructor( id, { env = {}, owner = 'me', rng = Math.random } = {} ) {

		const W = WARBIRDS[ id ] || WARBIRDS.sabrewing;
		this.id = W.id;
		this.W = W;
		this.owner = owner;
		this.rng = rng;
		this.flight = new FighterFlight( W.id, env );
		this.damage = new Damage( W.id, { rng } );
		this.guns = new Guns( W.id, { rng } );
		this.turrets = W.turrets.map( ( t, i ) => new Turret( W.id, i ) );
		this.seats = new Seats( W.id );
		this.systems = W.kind === 'crew' ? new CrewSystems( W.id, { rng } ) : null;
		this.arm = new ArmSwitch();
		this.bombs = W.bomb ? 1 : 0;
		this.status = 'ground';
		this.visual = null;
		this.controls = this.flight.controls;
		this.lastHitBy = null;
		this.lastHitAt = - Infinity;
		this.t = 0;

	}

	get position() { return this.flight.position; }
	get velocity() { return this.flight.velocity; }
	get quaternion() { return this.flight.quaternion; }

	// the turret a seat works (null for the pilot, the radio operator, the engineer)
	turretOf( seat ) {

		const i = this.W.turrets.findIndex( ( t ) => t.seat === seat );
		return i >= 0 ? this.turrets[ i ] : null;

	}

	// the damage's and the systems' effects into the flight model
	_effects() {

		const fx = this.damage.effects(), D = this.flight.dmg;
		D.power = fx.power;
		D.engineDead = fx.engineDead;
		D.liftL = fx.liftL;
		D.liftR = fx.liftR;
		D.tail = fx.tail;
		D.drag = fx.drag;
		D.lost = fx.lost;
		if ( this.systems ) {

			const s = this.systems.effects( this.damage );
			D.engines = s.engines;
			D.feathered = s.feathered;
			D.engineDead = s.engines.every( ( e ) => e <= 0 );

		} else D.engines = null;

		return fx;

	}

	step( dt, controls = null ) {

		this.t += dt;
		if ( controls ) Object.assign( this.flight.controls, controls );
		this._effects();
		const f = this.flight;
		f.update( dt );
		const events = f.drainEvents();
		for ( const e of this.damage.update( dt, { speed: f.airspeed } ) ) events.push( { type: e } );
		if ( this.systems ) for ( const e of this.systems.update( dt ) ) events.push( e );
		this.arm.update( dt );
		for ( const t of this.turrets ) t.step( dt );
		for ( const e of events ) {

			if ( e.type === 'takeoff' ) this.status = 'fly';
			else if ( e.type === 'landed' ) this.status = 'ground';
			else if ( e.type === 'crash' ) this.status = 'crash';
			else if ( e.type === 'ditched' ) this.status = 'ditched';

		}

		if ( this.status === 'fly' && this.damage.down ) this.status = 'down';
		if ( this.status === 'ground' && ! f.grounded && ! f.crashed && ! f.ditched ) this.status = 'fly';
		return events;

	}

	// a hit on a part (the damage, then what it does to the crew's systems)
	hit( part, dmg, { shell = false, by = null } = {} ) {

		const r = this.damage.hit( part, dmg, { shell } );
		if ( this.systems ) r.systems = this.systems.onHit( r.part, r );
		if ( by ) {

			this.lastHitBy = by;
			this.lastHitAt = this.t;

		}

		return r;

	}

	firePilot( dt, trigger, out, owner = this.owner ) {

		return this.guns.fire( dt, trigger, this.flight, out, owner );

	}

	fireTurret( i, dt, trigger, out, owner = this.owner ) {

		const tu = this.turrets[ i ];
		if ( ! tu ) return 0;
		// the interrupter: no rounds while the line of fire crosses the aircraft itself
		const ok = trigger && ! tu.blockedBy;
		return tu.guns.fire( dt, ok, tu.frame( this.flight, _frame ), out, owner );

	}

	// the bomb off its crutch: a ballistic body from the aircraft's way (the caller flies and fuses it)
	dropBomb() {

		if ( ! this.bombs || ! this.W.bomb ) return null;
		this.bombs --;
		const p = this.flight.toWorld( this.W.bomb.at, new Vector3() );
		return { x: p.x, y: p.y, z: p.z, vx: this.velocity.x, vy: this.velocity.y - 1.5, vz: this.velocity.z, t: 0, owner: this.owner, ...this.W.bomb };

	}

	rearm() {

		this.guns.rearm();
		for ( const t of this.turrets ) t.guns.rearm();
		this.bombs = this.W.bomb ? 1 : 0;
		if ( this.systems ) this.systems.refit();

	}

	// the saved form (Dogfight's fleet record keeps it between flights)
	toRecord() {

		return {
			dmg: this.damage.toJSON(),
			guns: this.guns.toJSON(),
			turrets: this.turrets.map( ( t ) => t.guns.toJSON() ),
			bombs: this.bombs,
			sys: this.systems ? this.systems.toJSON() : null,
		};

	}

	fromRecord( r ) {

		if ( ! r ) return;
		this.damage.fromJSON( r.dmg );
		this.guns.fromJSON( r.guns );
		if ( Array.isArray( r.turrets ) ) this.turrets.forEach( ( t, i ) => t.guns.fromJSON( r.turrets[ i ] ) );
		if ( Number.isFinite( r.bombs ) ) this.bombs = Math.max( 0, Math.min( this.W.bomb ? 1 : 0, r.bombs | 0 ) );
		if ( this.systems && r.sys ) {

			if ( Array.isArray( r.sys.tanks ) ) r.sys.tanks.forEach( ( v, i ) => { if ( this.systems.tanks[ i ] && Number.isFinite( v ) ) this.systems.tanks[ i ].fuel = Math.max( 0, Math.min( 1, v ) ); } );
			if ( r.sys.kits ) for ( const k of [ 'engineer', 'radio' ] ) if ( Number.isFinite( r.sys.kits[ k ] ) ) this.systems.kits[ k ] = Math.max( 0, Math.min( 9, r.sys.kits[ k ] | 0 ) );
			if ( Array.isArray( r.sys.bottles ) ) r.sys.bottles.forEach( ( v, i ) => { if ( this.systems.engines[ i ] ) this.systems.engines[ i ].bottle = v ? 1 : 0; } );

		}

	}

}
