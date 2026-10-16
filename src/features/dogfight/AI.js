// The practice opponents (wave 26A, single player only): target drones that fly a circuit and Blackwater's raiders, AI
// pilots on the same FighterFlight as the player. Pure (node tests): a controller that turns a target into stick,
// rudder, throttle and trigger.
//
//   const ai = new AIPilot( flight, { mode: 'fight' | 'drone', skill: 0..1, rng } );
//   ai.think( dt, { target: { position, velocity, alive } | null, threat: same | null, groundAt( x, z ), waterAt( x, z ),
//                   circuit: { x, z, alt, r } } ) -> { pitch, roll, yaw, throttle, fire }
// Fly-to-point: roll the target into the lift vector, pull it onto the nose; lead pursuit with the guns' muzzle speed;
// fire inside FIRE_RANGE with the lead point under a small angle; a break turn when someone sits on its tail; and the
// ground: a pull-up, wings level, whenever the next few seconds would end below the safety height.

import { Vector3 } from '../../engine/index.js';
import { leadPoint } from './Guns.js';

export const AI_TUNE = { fireRange: 520, fireCone: 0.04, floor: 90, look: 3.2, breakRange: 650, breakCone: 0.26 };
const clamp = ( v, a, b ) => ( v < a ? a : v > b ? b : v );
const _l = new Vector3(), _p = new Vector3(), _f = new Vector3(), _t = new Vector3();

export class AIPilot {

	constructor( flight, { mode = 'fight', skill = 0.6, rng = Math.random, vel = 830 } = {} ) {

		this.f = flight;
		this.mode = mode;
		this.skill = skill;
		this.rng = rng;
		this.vel = vel;
		this.out = { pitch: 0, roll: 0, yaw: 0, throttle: 1, fire: false };
		this.breakT = 0;
		this.breakDir = 1;
		this.aimErr = new Vector3();
		this.wp = 0;
		this.state = 'cruise';

	}

	// stick and rudder to bring a world point onto the nose
	steer( point, out, gain = 1 ) {

		const f = this.f;
		f.toLocal( point, _l );
		const lz = _l.z, lx = _l.x, ly = _l.y;
		const off = Math.atan2( Math.hypot( lx, ly ), lz ); // angle off the nose
		// the roll that puts the point "up" in the cockpit (+X is the left wing: a point to the right has lx < 0)
		const phi = Math.atan2( - lx, Math.max( 1e-3, ly ) + ( ly < 0 ? 0 : 0 ) );
		if ( off < 0.12 && lz > 0 ) {

			// nearly on the nose: fine pitch and a little roll / rudder
			out.pitch = clamp( Math.atan2( ly, lz ) * 9, - 1, 1 );
			out.roll = clamp( Math.atan2( - lx, lz ) * 6 - f.bank() * 0.4, - 1, 1 ) * gain;
			out.yaw = clamp( Math.atan2( - lx, lz ) * 8, - 1, 1 );

		} else {

			const rollTo = ly < 0 && Math.abs( lx ) < Math.abs( ly ) * 0.3 ? Math.PI * Math.sign( - lx || 1 ) : phi;
			out.roll = clamp( rollTo * 2.4, - 1, 1 ) * gain;
			// pull once the point is within ~50 degrees of the lift vector
			const aligned = Math.cos( rollTo );
			out.pitch = clamp( aligned * 1.2 * Math.min( 1, off * 2.5 ), - 0.4, 1 );
			out.yaw = 0;

		}

		return off;

	}

	think( dt, ctx = {} ) {

		const f = this.f, o = this.out, p = f.position, v = f.velocity;
		o.fire = false;
		o.throttle = 1;
		// the ground first: where the flight path ends in a few seconds
		const look = AI_TUNE.look + Math.max( 0, - v.y ) * 0.05;
		_p.copy( p ).addScaledVector( v, look );
		const g = Math.max( ctx.groundAt ? ctx.groundAt( _p.x, _p.z ) : - Infinity, ctx.waterAt ? ctx.waterAt( _p.x, _p.z ) : 0, ctx.groundAt ? ctx.groundAt( p.x, p.z ) : - Infinity );
		if ( _p.y < g + AI_TUNE.floor || p.y < g + AI_TUNE.floor * 0.6 ) {

			this.state = 'pullup';
			const bank = f.bank();
			o.roll = clamp( - bank * 2.5, - 1, 1 );
			o.pitch = Math.abs( bank ) < 1.2 ? 1 : 0.2;
			o.yaw = 0;
			return o;

		}

		if ( this.mode === 'drone' ) return this._drone( dt, ctx );
		// someone on our tail: break
		const th = ctx.threat;
		if ( this.breakT > 0 ) this.breakT -= dt;
		else if ( th && th.position && th.alive !== false ) {

			_t.copy( p ).sub( th.position );
			const d = _t.length();
			if ( d < AI_TUNE.breakRange ) {

				_f.copy( th.velocity || _t ).normalize();
				const cone = Math.acos( clamp( _f.dot( _t.normalize() ), - 1, 1 ) );
				if ( cone < AI_TUNE.breakCone && this.rng() < 0.6 * dt * ( 0.5 + this.skill ) ) {

					this.breakT = 1.6 + this.rng() * 1.6;
					this.breakDir = this.rng() < 0.5 ? - 1 : 1;

				}

			}

		}

		if ( this.breakT > 0 ) {

			this.state = 'break';
			const want = this.breakDir * 1.35;
			o.roll = clamp( ( want - f.bank() ) * 3, - 1, 1 );
			o.pitch = 1;
			o.yaw = 0;
			return o;

		}

		const tg = ctx.target;
		if ( ! tg || ! tg.position || tg.alive === false ) {

			this.state = 'cruise';
			return this._drone( dt, ctx );

		}

		this.state = 'attack';
		// lead pursuit (a weaker pilot leads less and aims worse)
		const lp = leadPoint( p, v, tg.position, tg.velocity || _f.set( 0, 0, 0 ), this.vel );
		const lead = 0.55 + 0.45 * this.skill;
		_t.set( tg.position.x + ( lp.x - tg.position.x ) * lead, tg.position.y + ( lp.y - tg.position.y ) * lead, tg.position.z + ( lp.z - tg.position.z ) * lead );
		// the aim wanders (a random walk, smaller for a better pilot)
		const wander = ( 1.4 - this.skill ) * 6;
		this.aimErr.x = clamp( this.aimErr.x + ( this.rng() - 0.5 ) * wander * dt * 4, - wander, wander );
		this.aimErr.y = clamp( this.aimErr.y + ( this.rng() - 0.5 ) * wander * dt * 4, - wander, wander );
		_t.x += this.aimErr.x;
		_t.y += this.aimErr.y;
		const off = this.steer( _t, o );
		const dist = p.distanceTo( tg.position );
		// keep some speed: no full stick when slow
		if ( f.airspeed < 70 ) o.pitch = Math.min( o.pitch, 0.55 );
		o.fire = dist < AI_TUNE.fireRange && off < AI_TUNE.fireCone * ( 1.6 - this.skill * 0.6 ) && ! ctx.holdFire;
		return o;

	}

	// a circuit round a centre: the next point ahead on the circle, at the circuit's height
	_drone( dt, ctx ) {

		const f = this.f, o = this.out, c = ctx.circuit;
		if ( ! c ) {

			o.pitch = clamp( - f.velocity.y * 0.05, - 0.3, 0.3 );
			o.roll = clamp( - f.bank() * 2, - 1, 1 );
			o.throttle = 0.8;
			return o;

		}

		const p = f.position;
		const a = Math.atan2( p.x - c.x, p.z - c.z ) + ( c.dir || 1 ) * 0.5;
		_t.set( c.x + Math.sin( a ) * c.r, c.alt, c.z + Math.cos( a ) * c.r );
		this.steer( _t, o, 0.8 );
		o.pitch = clamp( o.pitch, - 0.5, 0.65 );
		o.throttle = this.mode === 'drone' ? 0.72 : 0.85;
		return o;

	}

}
