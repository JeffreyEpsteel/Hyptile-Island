// The fighters' flight model (wave 26A): arcade-sim, pure (node tests fly it). One rigid body with an angle-of-attack
// command loop instead of a raw pitch rate: the stick asks for an angle of attack, so the same pull is a gentle turn when
// slow and a hard one when fast, capped by the airframe's g (nMax) and by the wing (clMax at alphaStall). Lift, induced
// drag and thrust from engine power give energy: a hard turn bleeds speed, a dive gains it, a climb spends it. Past the
// stall the lift falls away, the controls go soft and a wing drops. Damage (Damage.js) feeds this.dmg: engine power,
// each wing's lift, the tail's authority, extra drag, and lost control (a wing or the tail gone).
//
//   const f = new FighterFlight( 'sabrewing', { groundAt( x, z, maxY ), waterAt( x, z ), obstacle( a, b ) -> t | Infinity } );
//   f.place( x, y, z, heading, { grounded } )   f.controls = { pitch, roll, yaw, throttle, brake }   f.update( dt )
//   f.position / velocity / quaternion (+Z the nose, +Y up, +X the left wing), f.airspeed, f.alpha, f.g, f.stalled,
//   f.grounded, f.agl, f.rpm (0..1), f.gearDown (0..1 travel), f.drainEvents() -> [ { type: 'takeoff' | 'landed' | 'crash' |
//   'ditched' | 'stall' | 'unstall', ... } ]   f.toWorld( [ x, y, z ], out ), f.toLocal( world, out ), f.heading()
//
// Controls: pitch +1 = stick back (nose up), roll +1 = right wing down, yaw +1 = nose right, throttle 0..1, brake 0..1.

import { Vector3, Quaternion } from '../../engine/index.js';
import { WARBIRDS, G0, RHO0, DEG, FLAPS } from './Warbirds.js';

export const STEP = 1 / 120; // s: fixed substeps
export const OBSTACLE_EVERY = 4; // substeps between two obstacle rays
export const LANDING = { sink: 4.8, roll: 12 * DEG, pitchLow: - 4 * DEG, speedK: 2.3, hardSink: 2.8 };
export const DITCH = { speed: 62, sink: 4.5, roll: 16 * DEG };
const clamp = ( v, a, b ) => ( v < a ? a : v > b ? b : v );
const _f = new Vector3(), _u = new Vector3(), _l = new Vector3(), _vb = new Vector3(), _a = new Vector3(), _d = new Vector3();
const _lift = new Vector3(), _q = new Quaternion(), _p = new Vector3(), _old = new Vector3(), _w = new Vector3();

export class FighterFlight {

	constructor( id = 'sabrewing', env = {} ) {

		const W = WARBIRDS[ id ] || WARBIRDS.sabrewing;
		this.id = W.id;
		this.W = W;
		this.F = W.flight;
		this.groundAt = env.groundAt || ( () => - Infinity );
		this.waterAt = env.waterAt || ( () => 0 );
		this.obstacle = env.obstacle || null;
		this.position = new Vector3();
		this.velocity = new Vector3();
		this.quaternion = new Quaternion();
		this.rates = { pitch: 0, yaw: 0, roll: 0 }; // body rates (rad/s): nose up, nose right, right wing down
		this.controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0, brake: 0 };
		// engines: each engine's power factor (a twin's left and right; null: the single engine's `power`); feathered: a dead
		// engine's propeller turned edge-on (no windmill drag)
		this.dmg = { power: 1, liftL: 1, liftR: 1, tail: 1, drag: 1, lost: false, engineDead: false, engines: null, feathered: null };
		this.events = [];
		this.engineOn = true;
		this.rpm = 0;
		this.airspeed = 0;
		this.alpha = 0;
		this.beta = 0;
		this.g = 1;
		this.stalled = false;
		this.grounded = false;
		this.ditched = false;
		this.crashed = false;
		this.agl = 0;
		this.gearDown = 1;
		this.flaps = 1;
		this.tailUp = 0;
		this.thrust = 0;
		this._drop = 1; // the wing that drops in a stall
		this._acc = 0;
		this._obsN = 0;
		this._obsFrom = null;
		// the three-point attitude: main wheels and tailwheel both on the ground
		const gm = W.gear.main, gt = W.gear.tail;
		this.sitPitch = Math.atan( ( gm[ 1 ] - gt[ 1 ] ) / ( gt[ 2 ] - gm[ 2 ] ) );
		const cla = ( this.F.clMax - this.F.cl0 ) / this.F.alphaStall;
		this.clAlpha = cla;

	}

	// ------------------------------------------------------------------ placement and frames

	place( x, y, z, heading = 0, { grounded = null, speed = 0 } = {} ) {

		const ground = this.groundAt( x, z, y + 3 );
		const onGround = grounded === null ? Number.isFinite( ground ) && y - ground < 3 : grounded;
		this.grounded = onGround;
		this.crashed = false;
		this.ditched = false;
		this.stalled = false;
		this.tailUp = 0;
		this.rates.pitch = this.rates.yaw = this.rates.roll = 0;
		this.events.length = 0;
		this._acc = 0;
		this._obsFrom = null;
		this.flaps = onGround ? 1 : 0;
		this.gearDown = onGround || this.W.gear.retract === 'fixed' ? 1 : 0;
		const pitch = onGround ? this.sitPitch : 0;
		this._setAttitude( heading, pitch, 0 );
		if ( onGround ) this.position.set( x, ground + this.rideHeight( pitch ), z );
		else this.position.set( x, y, z );
		this.velocity.set( 0, 0, 1 ).applyQuaternion( this.quaternion ).multiplyScalar( speed );
		if ( onGround ) this.velocity.y = 0;
		this.airspeed = speed;
		this.rpm = onGround ? 0 : 0.85;
		this.agl = onGround ? 0 : y - Math.max( ground, this.waterAt( x, z ) );
		return this;

	}

	_setAttitude( heading, pitch, roll ) {

		// yaw about +Y (heading 0 = +Z), then nose up, then the roll: q = Ry( heading ) * Rx( - pitch ) * Rz( roll )
		const q = this.quaternion;
		q.setFromAxisAngle( _w.set( 0, 1, 0 ), heading );
		q.multiply( _q.setFromAxisAngle( _w.set( 1, 0, 0 ), - pitch ) );
		q.multiply( _q.setFromAxisAngle( _w.set( 0, 0, 1 ), roll ) );
		return q;

	}

	// the centre of mass over the ground for the main wheels to touch it at this pitch
	rideHeight( pitch ) {

		const gm = this.W.gear.main;
		return - ( gm[ 1 ] * Math.cos( pitch ) + gm[ 2 ] * Math.sin( pitch ) );

	}

	toWorld( l, out = new Vector3() ) {

		return out.set( l.x ?? l[ 0 ], l.y ?? l[ 1 ], l.z ?? l[ 2 ] ).applyQuaternion( this.quaternion ).add( this.position );

	}

	toLocal( p, out = new Vector3() ) {

		return out.copy( p ).sub( this.position ).applyQuaternion( _q.copy( this.quaternion ).invert() );

	}

	forward( out = new Vector3() ) { return out.set( 0, 0, 1 ).applyQuaternion( this.quaternion ); }
	up( out = new Vector3() ) { return out.set( 0, 1, 0 ).applyQuaternion( this.quaternion ); }

	heading() {

		const f = this.forward( _d );
		return Math.atan2( f.x, f.z );

	}

	pitchAngle() {

		return Math.asin( clamp( this.forward( _d ).y, - 1, 1 ) );

	}

	// bank angle: positive with the right wing down
	bank() {

		const l = _l.set( 1, 0, 0 ).applyQuaternion( this.quaternion ), u = this.up( _u );
		return Math.atan2( l.y, u.y );

	}

	drainEvents() {

		return this.events.splice( 0 );

	}

	// ------------------------------------------------------------------ stepping

	update( dt ) {

		if ( ! Number.isFinite( dt ) || dt <= 0 ) return;
		this._acc = Math.min( this._acc + dt, 0.1 );
		while ( this._acc >= STEP ) {

			this._acc -= STEP;
			this.step( STEP );

		}

	}

	density() {

		return RHO0 * Math.exp( - Math.max( 0, this.position.y ) / 8500 );

	}

	// lift coefficient at an angle of attack (the linear range, then the stall: it falls to half over 12 degrees)
	cl( alpha ) {

		const F = this.F, a = Math.abs( alpha ), s = Math.sign( alpha ) || 1;
		const flap = FLAPS.cl * this.flaps, cl0 = F.cl0 + flap;
		if ( a <= F.alphaStall ) return cl0 + this.clAlpha * alpha;
		const over = clamp( ( a - F.alphaStall ) / ( 12 * DEG ), 0, 1 );
		return s * ( s > 0 ? F.clMax + flap : F.clMax - 2 * cl0 ) * ( 1 - 0.5 * over );

	}

	step( dt ) {

		if ( this.crashed ) return;
		const F = this.F, D = this.dmg, c = this.controls, v = this.velocity, p = this.position, q = this.quaternion;
		// engine: the rpm follows the throttle (a dead engine windmills down)
		const thr = clamp( c.throttle || 0, 0, 1 );
		const live = this.engineOn && ! D.engineDead && ! this.ditched;
		const rpmT = live ? 0.18 + 0.82 * thr : Math.min( 0.25, this.airspeed / 400 );
		this.rpm += ( rpmT - this.rpm ) * ( 1 - Math.exp( - dt * ( live ? 2.2 : 0.8 ) ) );
		if ( this.ditched ) {

			this._ditchedStep( dt );
			return;

		}

		const rho = this.density();
		const fwd = this.forward( _f ), up = this.up( _u ), left = _l.set( 1, 0, 0 ).applyQuaternion( q );
		const V = v.length();
		this.airspeed = V;
		const qd = 0.5 * rho * V * V;
		// the velocity in the body frame: angle of attack and sideslip
		_vb.copy( v ).applyQuaternion( _q.copy( q ).invert() );
		const alpha = V > 3 ? Math.atan2( - _vb.y, Math.max( 0.5, _vb.z ) ) : 0;
		const beta = V > 3 ? Math.atan2( _vb.x, Math.max( 0.5, _vb.z ) ) : 0;
		this.alpha = alpha;
		this.beta = beta;
		const wings = ( D.liftL + D.liftR ) / 2;
		const CL = this.cl( alpha );
		const L = qd * F.area * CL * wings;
		const cdi = CL * CL / ( Math.PI * F.e * F.ar );
		const fixed = this.W.gear.retract === 'fixed';
		const gearDrag = ( fixed ? 0.006 : 0.012 * this.gearDown ) + FLAPS.cd * this.flaps;
		// the dive brakes (the Kitewing's), and a dead engine's windmilling propeller unless feathered
		const brakes = this.W.brakes && c.brakes ? this.W.brakes.cd : 0;
		const eng = this._engines( D, live );
		let mill = 0;
		for ( let i = 0; i < eng.length; i ++ ) if ( eng[ i ] <= 0 && ! ( D.feathered && D.feathered[ i ] ) ) mill += 0.008;
		const Dg = qd * F.area * ( F.cd0 * D.drag + cdi + gearDrag + brakes + mill + ( this.stalled ? 0.03 : 0 ) );
		// thrust: power over speed, capped by the static thrust
		// each engine's share of the power (a twin pulls to the side of the good engine)
		const spool = clamp( ( this.rpm - 0.15 ) / 0.85, 0, 1 );
		let T = 0, Tdiff = 0;
		for ( let i = 0; i < eng.length; i ++ ) {

			const share = eng[ i ] / eng.length;
			const t = Math.min( F.thrustStatic * thr * share, F.power * thr * share * spool * F.eta / Math.max( V, 8 ) );
			T += t;
			Tdiff += t * Math.sign( this.W.engines[ i ] ? this.W.engines[ i ].at[ 0 ] : 0 );

		}

		this.thrust = T;
		this._tdiff = Tdiff / Math.max( 1, F.thrustStatic );
		// forces (world)
		_a.set( 0, - G0 * F.mass, 0 );
		_a.addScaledVector( fwd, T );
		if ( V > 0.5 ) {

			_d.copy( v ).multiplyScalar( 1 / V );
			_a.addScaledVector( _d, - Dg );
			// lift: perpendicular to the flow in the plane of symmetry (flow x left: up in level flight)
			_lift.crossVectors( _d, left );
			const ll = _lift.length();
			if ( ll > 1e-6 ) _a.addScaledVector( _lift, L / ll );
			// side force: the fuselage keeps the sideslip small
			_a.addScaledVector( left, - Math.sin( beta ) * qd * F.area * 0.32 );

		}

		_a.multiplyScalar( 1 / F.mass );
		// the load factor along the body's up axis (what the pilot feels)
		this.g = ( _a.dot( up ) + G0 * up.y ) / G0;

		if ( this.grounded ) {

			this._groundStep( dt, _a, qd, L );
			return;

		}

		// ---- rotation: the stick commands an angle of attack (capped by the g limit and just past the stall)
		const auth = clamp( qd / F.qRef, 0.12, 1 ) * ( this.stalled ? 0.55 : 1 );
		const fast = V > F.vne ? clamp( 1 - ( V - F.vne ) / 70, 0.3, 1 ) : 1;
		const tail = D.tail;
		const pitchCmd = clamp( c.pitch || 0, - 1, 1 );
		// the angle of attack a 1 g pull needs here, and nMax's
		const cla = this.clAlpha * wings, qs = Math.max( qd * F.area, 1 );
		const cl0 = F.cl0 + FLAPS.cl * this.flaps;
		const a1g = clamp( ( F.mass * G0 * Math.max( 0, up.y ) / qs - cl0 ) / cla, - 2 * DEG, F.alphaStall * 0.92 );
		// full stick: the edge of the stall when fast; past it when slow (below 1.25 x the stall speed)
		const vs = Math.sqrt( 2 * F.mass * G0 / ( rho * F.area * ( F.clMax + FLAPS.cl * this.flaps ) ) );
		const slow = clamp( ( 1.25 * vs - V ) / ( 0.4 * vs ), 0, 1 );
		const aMax = Math.min( F.alphaStall * ( 0.96 + 0.13 * slow ), ( F.mass * G0 * F.nMax / qs - cl0 ) / cla );
		const aMin = Math.max( - F.alphaStall * 0.7, ( - F.mass * G0 * F.nMax * 0.45 / qs - cl0 ) / cla );
		const aCmd = pitchCmd >= 0 ? a1g + pitchCmd * Math.max( 0, aMax - a1g ) : a1g + pitchCmd * Math.max( 0, a1g - aMin );
		// how fast the flight path turns in the pitch plane now (the nose follows it plus the correction)
		_lift.crossVectors( V > 0.5 ? _d.copy( v ).normalize() : fwd, left );
		const pathRate = V > 5 ? _a.dot( _lift.normalize() ) / V : 0;
		const kA = 5.5 * clamp( qd / F.qRef, 0.25, 1 );
		let pitchT = pathRate + kA * ( aCmd - alpha );
		pitchT = clamp( pitchT, - F.rates.pitch * auth * tail * fast, F.rates.pitch * auth * tail * fast );
		let rollT = clamp( c.roll || 0, - 1, 1 ) * F.rates.roll * auth * ( 0.35 + 0.65 * Math.min( D.liftL, D.liftR ) / Math.max( 0.01, wings ) );
		let yawT = clamp( c.yaw || 0, - 1, 1 ) * F.rates.yaw * auth * tail - 2.2 * beta * clamp( qd / F.qRef, 0.2, 1 ) * tail;
		// (+X is the left engine: more thrust on the left swings the nose right)
		yawT += ( this._tdiff || 0 ) * 0.35;
		// a damaged wing lifts less: the airframe rolls toward it
		rollT += ( D.liftR - D.liftL ) * 1.6 * clamp( qd / F.qRef, 0, 1.4 );
		// the stall: the nose drops, a wing goes
		const stalled = Math.abs( alpha ) > F.alphaStall && V > 2;
		if ( stalled !== this.stalled ) {

			this.stalled = stalled;
			if ( stalled ) this._drop = Math.sign( this.rates.roll + beta * 3 + ( Math.random() - 0.5 ) * 0.2 ) || 1;
			this.events.push( { type: stalled ? 'stall' : 'unstall', speed: V } );

		}

		if ( stalled ) {

			const depth = clamp( ( Math.abs( alpha ) - F.alphaStall ) / ( 8 * DEG ), 0, 1 );
			rollT += this._drop * 1.4 * depth;
			pitchT -= 0.5 * depth * Math.sign( alpha );

		}

		if ( D.lost ) {

			// a wing or the tail gone: the stick does nothing; the airframe tumbles round the lost side
			pitchT = - 0.6 + Math.sin( p.x * 0.01 + p.z * 0.013 ) * 0.4;
			rollT = ( D.liftR - D.liftL ) * 4 + ( D.liftL === D.liftR ? 1.5 : 0 );
			yawT = 0.4;

		}

		const r = this.rates, kr = 1 - Math.exp( - dt * 9 );
		r.pitch += ( pitchT - r.pitch ) * ( 1 - Math.exp( - dt * 7 ) );
		r.roll += ( rollT - r.roll ) * kr;
		r.yaw += ( yawT - r.yaw ) * kr;
		// body rotation: nose up is a negative turn about +X, nose right about -Y, a right roll about +Z
		_w.set( - r.pitch, - r.yaw, r.roll );
		const ang = _w.length() * dt;
		if ( ang > 1e-9 ) {

			_q.setFromAxisAngle( _w.normalize(), ang );
			q.multiply( _q ).normalize();

		}

		// ---- translation
		_old.copy( p );
		v.addScaledVector( _a, dt );
		p.addScaledVector( v, dt );
		const want = this._wantGear();
		this.flaps = clamp( this.flaps + dt * ( want ? 0.4 : - 0.4 ), 0, 1 );
		this.gearDown = this.W.gear.retract === 'fixed' ? 1 : this.flaps;
		this._contacts( dt );

	}

	// each engine's power factor (0 when dead or the engine is off)
	_engines( D, live ) {

		const n = this.W.engines.length;
		const out = this._eng || ( this._eng = new Array( n ).fill( 1 ) );
		for ( let i = 0; i < n; i ++ ) out[ i ] = ! live ? 0 : D.engines ? Math.max( 0, D.engines[ i ] ?? 1 ) : D.power;
		return out;

	}

	// the undercarriage comes up after take-off and goes down slow and low (a fighter pilot's habit, done for him)
	_wantGear() {

		if ( this.agl < 6 ) return true;
		return this.airspeed < 62 && this.agl < 70 && this.velocity.y < 2;

	}

	// the ground run: three-point at rest, the tail up with speed (unless the stick is held back), the wheels hold the line
	_groundStep( dt, acc, qd, L ) {

		const F = this.F, c = this.controls, v = this.velocity, p = this.position;
		const heading = this.heading();
		const fx = Math.sin( heading ), fz = Math.cos( heading );
		let along = v.x * fx + v.z * fz;
		const vs = Math.sqrt( 2 * F.mass * G0 / ( this.density() * F.area * F.clMax ) );
		// the tail comes up past half the stall speed with the stick forward or neutral
		const back = Math.max( 0, c.pitch || 0 );
		const tailT = clamp( ( along - 0.45 * vs ) / ( 0.35 * vs ), 0, 1 ) * ( 1 - back );
		this.tailUp += ( tailT - this.tailUp ) * ( 1 - Math.exp( - dt * 2.5 ) );
		const pitch = this.sitPitch * ( 1 - this.tailUp ) + ( back > 0.2 && along > 0.8 * vs ? back * 4 * DEG : 0 );
		// the wheels: rolling friction and the brakes against the weight left on them
		const W = F.mass * G0, N = Math.max( 0, W - L );
		const ground = this.groundAt( p.x, p.z, p.y + 1 );
		const grass = this._surface ? this._surface( p.x, p.z ) : 0.03;
		const mu = grass + 0.42 * clamp( c.brake || 0, 0, 1 );
		const fwdAcc = acc.x * fx + acc.z * fz;
		let a = fwdAcc - mu * N / F.mass * Math.sign( along || 1 ) * ( Math.abs( along ) > 0.05 ? 1 : 0 );
		if ( Math.abs( along ) < 0.3 && Math.abs( fwdAcc ) < mu * N / F.mass ) {

			a = 0;
			along *= 0.9;

		}

		along = Math.max( - 1, along + a * dt );
		// steering: the tailwheel at low speed, the rudder in the slipstream
		const steer = clamp( c.yaw || 0, - 1, 1 ) * ( Math.min( 0.55, Math.abs( along ) * 0.12 ) + Math.min( 0.35, qd / F.qRef * 0.35 ) + Math.min( 0.25, this.thrust / F.thrustStatic * 0.3 ) );
		const h = heading + steer * dt;
		v.set( Math.sin( h ) * along, 0, Math.cos( h ) * along );
		p.x += v.x * dt;
		p.z += v.z * dt;
		const g2 = this.groundAt( p.x, p.z, p.y + 1 );
		const gy = Number.isFinite( g2 ) ? g2 : ground;
		p.y = ( Number.isFinite( gy ) ? gy : 0 ) + this.rideHeight( pitch );
		this._setAttitude( h, pitch, 0 );
		this.rates.pitch = this.rates.yaw = this.rates.roll = 0;
		this.airspeed = Math.abs( along );
		this.alpha = pitch;
		this.agl = 0;
		this.gearDown = 1;
		this.flaps = 1;
		// off the ground: the wing carries the weight and the stick is not pushed
		const sea = this.waterAt( p.x, p.z );
		if ( Number.isFinite( gy ) && gy < sea - 0.3 ) {

			// rolled into the sea
			this.grounded = false;
			this._crashOrDitch( 'water', Math.abs( along ), 0 );
			return;

		}

		if ( L > W * 1.02 && ( c.pitch || 0 ) >= - 0.1 && along > vs * 0.9 ) {

			this.grounded = false;
			v.y = 0.8;
			this.events.push( { type: 'takeoff', x: p.x, y: p.y, z: p.z, speed: along } );

		}

		if ( this.obstacle ) {

			// the nose's way this step (from just behind the centre, at cowling height)
			_p.set( Math.sin( h ), 0, Math.cos( h ) );
			_old.copy( p ).addScaledVector( _p, - 0.5 );
			_old.y = p.y + 0.6;
			const t = this.obstacle( _old, _p, Math.abs( along ) * dt + 4.5 );
			if ( t < Infinity && Math.abs( along ) > 9 ) this._crash( 'obstacle', Math.abs( along ) );
			else if ( t < Infinity && t < 4.2 ) {

				// a nudge into a wall at taxi speed: stop
				v.set( 0, 0, 0 );
				p.x -= Math.sin( h ) * ( 4.2 - t ) * 0.5;
				p.z -= Math.cos( h ) * ( 4.2 - t ) * 0.5;

			}

		}

	}

	// what touches the ground / the water / a wall this step: a landing, a ditching or a crash
	_contacts( dt ) {

		const p = this.position, v = this.velocity, W = this.W;
		const sea = this.waterAt( p.x, p.z );
		const ground = this.groundAt( p.x, p.z, p.y + 2 );
		const floor = Math.max( Number.isFinite( ground ) ? ground : - Infinity, sea );
		this.agl = p.y - floor;
		// walls and roofs along the path (Meridian's towers, the hangars)
		// (one ray every OBSTACLE_EVERY steps, over the whole stretch flown since: the colliders are a long list)
		if ( this.obstacle && ++ this._obsN >= OBSTACLE_EVERY ) {

			this._obsN = 0;
			const from = this._obsFrom || ( this._obsFrom = _old.clone() );
			const step = _p.copy( p ).sub( from );
			const len = step.length();
			if ( len > 1e-4 ) {

				step.multiplyScalar( 1 / len );
				const t = this.obstacle( from, step, len + 3 );
				if ( t < len + 3 ) {

					this._crash( 'obstacle', v.length() );
					return;

				}

			}

			from.copy( p );

		}

		// the lowest point of the airframe this attitude: the wheels (down) or the belly, the wingtips, the nose
		const half = W.flight.span / 2 - 0.1;
		const pts = [ [ W.gear.main[ 0 ], this.gearDown > 0.5 ? W.gear.main[ 1 ] : - 0.85, W.gear.main[ 2 ] ], [ - W.gear.main[ 0 ], this.gearDown > 0.5 ? W.gear.main[ 1 ] : - 0.85, W.gear.main[ 2 ] ],
			[ 0, W.gear.tail[ 1 ], W.gear.tail[ 2 ] ], [ half, 0, 0 ], [ - half, 0, 0 ], [ 0, W.prop[ 1 ] - W.propRadius, W.prop[ 2 ] ] ];
		let worst = Infinity, which = - 1, wy = 0;
		for ( let i = 0; i < pts.length; i ++ ) {

			const w = this.toWorld( pts[ i ], _p );
			const g = this.groundAt( w.x, w.z, w.y + 2 );
			const s = this.waterAt( w.x, w.z );
			const pen = w.y - Math.max( Number.isFinite( g ) ? g : - Infinity, s );
			if ( pen < worst ) {

				worst = pen;
				which = i;
				wy = Number.isFinite( g ) && g > s ? 1 : 0;

			}

		}

		if ( worst > 0 ) return;
		const sink = Math.max( 0, - v.y ), speed = v.length();
		const water = ! wy;
		if ( water ) {

			this._crashOrDitch( 'water', speed, sink );
			return;

		}

		// a landing: on the wheels (the mains first, or three-point), wings level, the nose not down, a sane sink
		const pitch = this.pitchAngle(), roll = Math.abs( this.bank() );
		const vs = Math.sqrt( 2 * this.F.mass * G0 / ( this.density() * this.F.area * this.F.clMax ) );
		const onWheels = this.gearDown > 0.5 && which <= 2;
		if ( onWheels && sink < LANDING.sink && roll < LANDING.roll && pitch > LANDING.pitchLow && speed < vs * LANDING.speedK && ! this.dmg.lost ) {

			this.grounded = true;
			this.tailUp = clamp( 1 - pitch / Math.max( 0.01, this.sitPitch ), 0, 1 );
			const h = this.heading();
			const along = Math.max( 0, v.x * Math.sin( h ) + v.z * Math.cos( h ) );
			v.set( Math.sin( h ) * along, 0, Math.cos( h ) * along );
			const pg = this.groundAt( p.x, p.z, p.y + 2 );
			const pit = this.sitPitch * ( 1 - this.tailUp );
			p.y = ( Number.isFinite( pg ) ? pg : 0 ) + this.rideHeight( pit );
			this._setAttitude( h, pit, 0 );
			this.events.push( { type: 'landed', sink, speed, hard: sink > LANDING.hardSink, x: p.x, y: p.y, z: p.z } );
			return;

		}

		// a gentle belly landing (the wheels up, slow, level): a slide to a stop, damaged
		if ( this.gearDown <= 0.5 && sink < 3.5 && roll < LANDING.roll && pitch > - 3 * DEG && speed < vs * 1.9 && ! this.dmg.lost ) {

			this.grounded = true;
			this.events.push( { type: 'landed', sink, speed, belly: true, hard: true, x: p.x, y: p.y, z: p.z } );
			return;

		}

		this._crash( 'ground', speed );

	}

	_crashOrDitch( surface, speed, sink ) {

		const roll = Math.abs( this.bank() ), pitch = this.pitchAngle();
		if ( speed < DITCH.speed && sink < DITCH.sink && roll < DITCH.roll && pitch > - 8 * DEG && ! this.dmg.lost ) {

			this.ditched = true;
			this.grounded = false;
			this.events.push( { type: 'ditched', speed, sink, x: this.position.x, y: this.position.y, z: this.position.z } );
			this.engineOn = false;
			return;

		}

		this._crash( surface, speed );

	}

	_crash( cause, speed ) {

		if ( this.crashed ) return;
		this.crashed = true;
		const p = this.position;
		this.events.push( { type: 'crash', cause, speed, x: p.x, y: p.y, z: p.z, water: cause === 'water' } );

	}

	// a ditched fighter: settles on the water, slows, the nose down and sinking after a while
	_ditchedStep( dt ) {

		const p = this.position, v = this.velocity;
		const sea = this.waterAt( p.x, p.z );
		v.multiplyScalar( Math.exp( - dt * 1.4 ) );
		v.y = 0;
		p.addScaledVector( v, dt );
		this._sunk = ( this._sunk || 0 ) + dt;
		const settle = Math.min( 1.6, this._sunk * 0.04 );
		p.y += ( sea + 0.2 - settle - p.y ) * ( 1 - Math.exp( - dt * 2 ) );
		const h = this.heading();
		this._setAttitude( h, - Math.min( 0.5, this._sunk * 0.012 ), 0 );
		this.airspeed = v.length();
		this.agl = 0;

	}

}
