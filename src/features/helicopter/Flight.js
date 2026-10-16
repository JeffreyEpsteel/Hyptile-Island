// Rotorcraft dynamics. +Z is forward, +X the left, +Y up; position.y is the skid sole. Two models (flight.mode):
//
// 'real' (the default the game uses, wave 25E): a rigid body under a rotor. The collective sets the blades' pitch and so
// the thrust along the mast (an aerobatic head: below zero it pulls the other way, so it flies inverted); the cyclic
// tilts the disc and so pitches / rolls the airframe (the head's moment works at any thrust: flips and rolls); the pedals
// set the tail rotor against the main rotor's torque, so the nose swings with every collective change you do not
// answer. Ground effect within a rotor diameter, translational lift above ~15-20 kn, settling with power (the vortex
// ring) when you sink fast at low airspeed, retreating-blade stall near VNE, rotor RPM that droops under a heavy
// collective (the turbine's torque limit) and is kept up by the air in autorotation when the turbine is off, drag,
// weathervaning, wind and its gusts, momentum. Hitting the ground hard, tilted or upside down is a crash.
//   controls: { collective -1..1 (absolute, a lever that stays), pitch -1..1 (+ nose down), roll -1..1 (+ right),
//               pedal -1..1 (+ nose left), level (a momentary attitude assist) }
//
// 'assist' (the easy option, the wave 21 model): kinematic hover; the sticks command velocities, the aircraft levels
// itself and holds its altitude.
//   controls: { forward, strafe, yaw, lift, brake }
//
// Small fixed substeps keep wall sweeps and downward roof crossings reliable.
import { Vector3, Quaternion, Euler } from '../../engine/index.js';

export const FLIGHT = Object.freeze( { climb: 6, descend: 2.8, cruise: 34, reverse: 14, strafe: 13, yaw: 1.05, ceiling: 800, radius: 1.65, height: 2.6 } );
// the realistic model's airframe (a light single-turbine helicopter, ~1.4 t, a 10 m rotor, an aerobatic head)
export const ROTOR = Object.freeze( {
	mass: 1400, g: 9.81, rho: 1.225,
	tmax: 2.25, // thrust at full collective and nominal RPM, in the aircraft's weight (a hover near 0.44 out of ground effect)
	R: 5.0, hub: 3.2, // rotor radius, hub over the skids (m)
	cyclic: 15, damp: 4.4, // pitch / roll acceleration at full cyclic (rad/s2 at nominal RPM) and the rotor's rate damping (1/s)
	pedal: 6.5, yawDamp: 1.9, torque: 2.4, // tail rotor authority, yaw damping, yaw from the main rotor's torque per unit
	inertia: 1.6, gov: 8, qmax: 1.0, // rotor inertia (s), governor gain, the turbine's torque limit (the load at full
	// collective is ~0.97, climbing more: the RPM droops)
	cdA: [ 4.5, 7.0, 2.4 ], // drag areas side (x), plan (y), front (z), m2
	etl: [ 5, 10, 0.16 ], vrs: [ 2.5, 6, 0.4 ], rbs: [ 66, 80 ], // translational lift, vortex ring, retreating-blade stall
	crashSink: 6.5, crashTilt: 0.75, crashSpeed: 15, // a touchdown faster, more tilted (up.y below) or quicker than this
} );
export const HOVER_COLLECTIVE = 1 / ROTOR.tmax; // (out of ground effect, still air, nominal RPM)
const clamp = ( n, a, b ) => Math.max( a, Math.min( b, n ) );
const smooth = ( a, b, x ) => { const t = clamp( ( x - a ) / ( b - a ), 0, 1 ); return t * t * ( 3 - 2 * t ); };
// the shaft torque the rotor asks at a collective and an inflow (climb through the disc in the thrust direction)
export function rotorLoad( collective, omega, vT ) {

	const c = Math.abs( collective );
	return omega * omega * ( 0.12 + 0.85 * c ) + 0.03 * Math.max( 0, vT ) * c + 0.018 * Math.min( 0, vT ) * ( 1 - c * 0.8 );

}
const TRIM = rotorLoad( 1 / ROTOR.tmax, 1, 0 ); // the tail rotor cancels the hover torque
const _e = new Euler(), _old = new Vector3(), _air = new Vector3(), _airB = new Vector3(), _up = new Vector3(), _F = new Vector3(), _fb = new Vector3();
const _qi = new Quaternion(), _dq = new Quaternion(), _ax = new Vector3(), _uB = new Vector3(), _lvl = new Quaternion();

export class RotorFlight {

	constructor( { groundAt = () => 0, collide = null, waterAt = () => 0, windAt = null, mode = 'assist' } = {} ) {
		this.groundAt = groundAt; this.collide = collide; this.waterAt = waterAt; this.windAt = windAt;
		this.mode = mode;
		this.position = new Vector3(); this.velocity = new Vector3(); this.quaternion = new Quaternion();
		this.omega = new Vector3(); // body angular velocity (rad/s): x + nose down, y + nose left, z + roll right
		this.yaw = 0; this.pitch = 0; this.roll = 0; this.rpm = 0; this.engineOn = false; this.starter = false;
		this.grounded = true; this.onWater = false; this.agl = 0; this.events = []; this._impactWait = 0; this.time = 0;
		this.controls = { forward: 0, strafe: 0, yaw: 0, lift: 0, brake: false, collective: 0, pitch: 0, roll: 0, pedal: 0, level: false };
		// what the rotor did last step (the HUD, the tests): thrust in weights, the effects' factors
		this.state = { thrust: 0, ge: 1, etl: 1, vrs: 0, rbs: 0, load: 0, airspeed: 0, inflow: 0, crashed: false };
	}

	place( x, y, z, yaw = 0 ) {
		this.position.set( x, y, z ); this.velocity.set( 0, 0, 0 ); this.omega.set( 0, 0, 0 ); this.yaw = yaw;
		this.pitch = this.roll = this.rpm = 0; this.engineOn = false; this.starter = false; this.events.length = 0;
		this.controls.collective = 0; this.state.crashed = false;
		this.quaternion.setFromEuler( _e.set( 0, yaw, 0, 'YXZ' ) );
		const floor = this.groundAt( x, z, y + 0.15 );
		this.grounded = Number.isFinite( floor ) && Math.abs( floor - y ) < 0.15;
		this.onWater = y <= this.waterAt( x, z ) && floor < this.waterAt( x, z ) - 0.15;
		this.agl = Math.max( 0, y - Math.max( floor, this.waterAt( x, z ) ) );
	}

	toWorld( l, out = new Vector3() ) {
		return out.set( l.x ?? l[ 0 ], l.y ?? l[ 1 ], l.z ?? l[ 2 ] ).applyQuaternion( this.quaternion ).add( this.position );
	}

	// the world up of the airframe (its mast) and its nose
	up( out = new Vector3() ) { return out.set( 0, 1, 0 ).applyQuaternion( this.quaternion ); }
	forward( out = new Vector3() ) { return out.set( 0, 0, 1 ).applyQuaternion( this.quaternion ); }

	update( dt ) {
		if ( ! Number.isFinite( dt ) || dt <= 0 ) return;
		const count = Math.ceil( Math.min( dt, 0.1 ) * 120 ), h = Math.min( dt, 0.1 ) / count;
		for ( let i = 0; i < count; i ++ ) this.step( h );
	}

	step( dt ) {
		this.time += dt;
		if ( this.mode === 'real' ) this.stepReal( dt ); else this.stepAssist( dt );
	}

	// ---- the assist model (wave 21)

	stepAssist( dt ) {
		const p = this.position, v = this.velocity, c = this.controls;
		_old.copy( p ); this._impactWait = Math.max( 0, this._impactWait - dt );
		this.omega.set( 0, 0, 0 );
		this.rpm += ( ( this.engineOn ? 1 : this.starter ? .22 : 0 ) - this.rpm ) * ( 1 - Math.exp( - dt / ( this.engineOn || this.starter ? 1.1 : 2 ) ) );
		const powered = this.engineOn && this.rpm > 0.8 && ! this.onWater;
		const forward = c.brake ? 0 : clamp( c.forward || 0, - 1, 1 ), strafe = c.brake ? 0 : clamp( c.strafe || 0, - 1, 1 );
		if ( powered ) this.yaw += clamp( c.yaw || 0, - 1, 1 ) * FLIGHT.yaw * dt;
		this.yaw = Math.atan2( Math.sin( this.yaw ), Math.cos( this.yaw ) );
		const sn = Math.sin( this.yaw ), cs = Math.cos( this.yaw );
		const fw = forward * ( forward >= 0 ? FLIGHT.cruise : FLIGHT.reverse ), side = strafe * FLIGHT.strafe;
		const response = 1 - Math.exp( - dt * ( c.brake ? 3 : 1.05 ) );
		v.x += ( ( powered ? sn * fw + cs * side : 0 ) - v.x ) * response;
		v.z += ( ( powered ? cs * fw - sn * side : 0 ) - v.z ) * response;
		if ( powered ) {
			let vy = clamp( c.lift || 0, - 1, 1 ) * ( c.lift >= 0 ? FLIGHT.climb : FLIGHT.descend );
			if ( p.y > FLIGHT.ceiling ) vy = Math.min( vy, - 1 );
			v.y += ( vy - v.y ) * ( 1 - Math.exp( - dt * 3.2 ) );
		} else v.y = Math.max( - 45, v.y - 9.81 * dt );
		p.addScaledVector( v, dt );
		this._contact( dt, false );
		const k = 1 - Math.exp( - dt * 4 );
		this.pitch += ( ( powered && ! this.grounded ? forward * 0.17 : 0 ) - this.pitch ) * k;
		this.roll += ( ( powered && ! this.grounded ? - strafe * 0.14 - ( c.yaw || 0 ) * 0.09 : 0 ) - this.roll ) * k;
		this.quaternion.setFromEuler( _e.set( this.pitch, this.yaw, this.roll, 'YXZ' ) );
	}

	// ---- the realistic model

	stepReal( dt ) {
		const R = ROTOR, p = this.position, v = this.velocity, w = this.omega, q = this.quaternion, c = this.controls, S = this.state;
		_old.copy( p ); this._impactWait = Math.max( 0, this._impactWait - dt );
		const col = clamp( c.collective || 0, - 1, 1 );
		// the air through the rotor
		_air.copy( v );
		const wind = this.windAt ? this.windAt( p, this.time ) : null;
		if ( wind ) _air.sub( wind );
		this.up( _up );
		_qi.copy( q ).invert();
		_airB.copy( _air ).applyQuaternion( _qi );
		const vh = Math.hypot( _airB.x, _airB.z ); // airspeed in the disc's plane
		const s = col < 0 ? - 1 : 1; // which way the thrust points along the mast
		const vT = _air.dot( _up ) * s; // climbing (+) or sinking (-) along the thrust
		const omega = this.rpm;
		// the vortex ring: sinking into your own downwash, slowly, with power on
		const vrs = smooth( R.vrs[ 0 ], R.vrs[ 1 ], - vT ) * ( 1 - smooth( 6, 11, vh ) ) * smooth( 0.12, 0.3, Math.abs( col ) );
		const etl = 1 + R.etl[ 2 ] * smooth( R.etl[ 0 ], R.etl[ 1 ], vh );
		const rbs = smooth( R.rbs[ 0 ], R.rbs[ 1 ], vh );
		// ground effect: the hub within a radius or two of the surface, the downwash cushioned
		let ge = 1;
		if ( s > 0 && _up.y > 0.6 ) { const hh = Math.max( 0.3, this.agl + R.hub * _up.y ); ge = clamp( 1 / ( 1 - ( R.R / ( 4 * hh ) ) ** 2 ), 1, 1.25 ); }
		const stall = smooth( 0.4, 0.68, omega ); // a slow rotor's blades stall: no thrust, no control
		// the blade pitch seen by the air: an inflow from below (autorotation, sinking) raises it, climbing lowers it
		const ceff = clamp( Math.abs( col ) - 0.05 * vT * ( 1 - vrs ), - 0.3, 1.2 );
		const T = s * R.tmax * R.mass * R.g * omega * omega * ceff * ge * etl * ( 1 - R.vrs[ 2 ] * vrs ) * stall * ( 1 - 0.3 * rbs );
		// the rotor's speed: the turbine's governor against the blades' load (the air drives it when you sink with the
		// collective down: autorotation)
		const load = rotorLoad( col, omega, vT );
		let Qe = 0;
		if ( this.engineOn && ! this.onWater ) Qe = clamp( R.gov * ( 1 - omega ) + load, 0, R.qmax );
		else if ( this.starter ) Qe = clamp( 2 * ( 0.25 - omega ), 0, 0.3 );
		this.rpm = clamp( omega + ( Qe - load ) / R.inertia * dt, 0, 1.15 );
		// forces: thrust along the mast, weight, drag in the airframe's axes
		_F.copy( _up ).multiplyScalar( T );
		_F.y -= R.mass * R.g;
		const k = 0.5 * R.rho;
		_fb.set( - k * R.cdA[ 0 ] * Math.abs( _airB.x ) * _airB.x, - k * R.cdA[ 1 ] * Math.abs( _airB.y ) * _airB.y, - k * R.cdA[ 2 ] * Math.abs( _airB.z ) * _airB.z );
		// the disc's in-plane drag (H force): a little damping of the slide, more with the rotor turning
		_fb.x -= 0.02 * R.mass * _airB.x * omega; _fb.z -= 0.012 * R.mass * _airB.z * omega;
		_F.add( _fb.applyQuaternion( q ) );
		v.addScaledVector( _F, dt / R.mass );
		p.addScaledVector( v, dt );
		// moments: the cyclic's hub moment (works at any thrust), the rotor's damping, the main rotor's torque against the
		// tail rotor (and the pedals), weathervaning, the stall's roll and pitch up, the vortex ring's buffet
		const auth = omega * omega * stall, damp = R.damp * ( 0.3 + 0.7 * Math.min( 1, omega ) );
		let ax = R.cyclic * clamp( c.pitch || 0, - 1, 1 ) * auth - damp * w.x - 3 * rbs;
		let az = R.cyclic * clamp( c.roll || 0, - 1, 1 ) * auth - damp * w.z - 4 * rbs;
		const shaft = this.engineOn ? Qe : 0;
		let ay = R.pedal * clamp( c.pedal || 0, - 1, 1 ) * omega * omega + R.torque * ( TRIM * omega * omega - shaft ) - R.yawDamp * w.y + 0.004 * _airB.x * Math.min( vh, 50 );
		if ( vrs > 0 ) { const t = this.time * 7.3; ax += vrs * 2.2 * Math.sin( t ) * Math.cos( t * 0.37 ); az += vrs * 2.2 * Math.sin( t * 1.31 + 1 ); }
		// a hover is not stable by itself: the disc flaps back from any drift (pitching / rolling the airframe away from
		// it) and the air is never still (a small turbulence, more with the wind): hands stay on the controls
		if ( ! this.grounded ) {
			const tb = this.time, gust = 0.32 + ( wind ? Math.min( 0.6, Math.hypot( wind.x, wind.z ) * 0.04 ) : 0 );
			ax += - 0.24 * _airB.z * Math.max( 0, 1 - vh / 25 ) + gust * ( Math.sin( tb * 1.7 + 0.3 ) + 0.6 * Math.sin( tb * 3.1 + 2.1 ) );
			az += 0.24 * _airB.x * Math.max( 0, 1 - vh / 25 ) + gust * ( Math.sin( tb * 1.3 + 1.7 ) + 0.6 * Math.sin( tb * 2.7 + 0.4 ) );
			ay += gust * 0.5 * Math.sin( tb * 0.9 + 2.6 );
		}
		if ( c.level ) {
			// the attitude assist: tip the mast back to the vertical (over the nearer side when upside down)
			_uB.set( 0, 1, 0 ).applyQuaternion( _qi );
			ax += 9 * _uB.z - 3 * w.x; az += - 9 * _uB.x - 3 * w.z + ( _uB.y < - 0.2 && Math.abs( _uB.x ) < 0.2 ? 6 : 0 );
		}
		w.x += ax * dt; w.y += ay * dt; w.z += az * dt;
		const wl = w.length();
		if ( wl > 1e-9 ) { _dq.setFromAxisAngle( _ax.copy( w ).divideScalar( wl ), wl * dt ); q.multiply( _dq ).normalize(); }
		Object.assign( S, { thrust: T / ( R.mass * R.g ), ge, etl, vrs, rbs, load, airspeed: vh, inflow: vT } );
		this._contact( dt, true );
		_e.setFromQuaternion( q, 'YXZ' );
		this.pitch = _e.x; this.yaw = _e.y; this.roll = _e.z;
	}

	// ground, water, walls; on the ground the realistic airframe sits level on its skids (or crashes)
	_contact( dt, real ) {
		const p = this.position, v = this.velocity;
		// Only surfaces at or below the previous skid height are landing candidates.
		// Crossing into a tall building is a wall collision, never a teleport to its roof.
		const floor = this.groundAt( p.x, p.z, _old.y + 0.16 ), sea = this.waterAt( p.x, p.z );
		const support = Math.max( floor, sea - 0.15 );
		const wasGrounded = this.grounded, wasContact = this.grounded || this.onWater;
		this.grounded = false; this.onWater = false;
		const upY = real ? this.up( _up ).y : 1;
		if ( ( real ? p.y <= support : v.y <= 0 && p.y <= support ) && _old.y >= support - 0.18 - ( real ? Math.max( 0, - v.y ) * dt : 0 ) ) {
			const sink = Math.max( 0, - v.y ), speed = Math.hypot( v.x, v.z );
			p.y = support; if ( v.y < 0 ) v.y = 0;
			this.onWater = sea - 0.15 > floor;
			this.grounded = ! this.onWater;
			if ( ! wasContact ) {
				const crash = real && ! this.onWater && ( sink > ROTOR.crashSink || upY < ROTOR.crashTilt || speed > ROTOR.crashSpeed );
				if ( crash ) { this.state.crashed = true; this.events.push( { type: 'crash', sink, speed, tilt: Math.acos( clamp( upY, - 1, 1 ) ), why: upY < 0 ? 'inverted' : upY < ROTOR.crashTilt ? 'tilted' : sink > ROTOR.crashSink ? 'sink' : 'speed' } ); }
				else this.events.push( { type: this.onWater ? 'ditched' : 'landed', sink, speed } );
			}
			if ( this.onWater ) { this.engineOn = false; v.x *= 0.95; v.z *= 0.95; }
			else { v.x *= Math.exp( - dt * 5 ); v.z *= Math.exp( - dt * 5 ); }
			if ( real ) {
				// the skids level the airframe (its heading kept), the ground stops the rolling and pitching
				const w = this.omega;
				_e.setFromQuaternion( this.quaternion, 'YXZ' );
				_lvl.setFromEuler( _e.set( 0, _e.y, 0, 'YXZ' ) );
				this.quaternion.slerp( _lvl, 1 - Math.exp( - dt * 8 ) );
				w.x *= Math.exp( - dt * 10 ); w.z *= Math.exp( - dt * 10 );
				// light on the skids the pedals still turn it; heavy, the skids hold
				const light = clamp( this.state.thrust, 0, 1 );
				w.y *= Math.exp( - dt * ( 6 * ( 1 - light ) + 0.5 ) );
			}
		} else if ( wasGrounded && p.y > support + 0.001 ) this.events.push( { type: 'takeoff' } );
		if ( this.collide && this.collide( p, FLIGHT.radius, FLIGHT.height ) ) {
			const speed = v.length();
			v.x = v.z = 0;
			if ( this._impactWait === 0 && speed > 4 ) { this.events.push( { type: 'impact', speed } ); this._impactWait = 0.7; }
		}
		// Terrain above us is also a cliff face. A building roof is excluded by groundAt(maxY).
		const below = this.groundAt( p.x, p.z, p.y + 0.16 );
		if ( Number.isFinite( below ) && p.y < below - 0.2 ) { p.x = _old.x; p.z = _old.z; v.x = v.z = 0; }
		this.agl = Math.max( 0, p.y - Math.max( below, sea ) );
		// the main rotor meets the ground: upside down or on its side close over the surface
		if ( real && ! this.grounded && ! this.onWater && ! this.state.crashed && upY < 0.35 && this.agl < ROTOR.hub * ( 1 - upY ) * 0.9 + 0.3 ) {
			this.state.crashed = true;
			this.events.push( { type: 'crash', sink: Math.max( 0, - v.y ), speed: Math.hypot( v.x, v.z ), tilt: Math.acos( clamp( upY, - 1, 1 ) ), why: 'rotor strike' } );
		}
	}

	drainEvents() { return this.events.splice( 0 ); }

}
