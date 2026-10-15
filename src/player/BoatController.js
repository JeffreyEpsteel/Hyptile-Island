import * as THREE from '../engine/index.js';
import { berthOf } from '../game/Boats.js';
import { WORLD } from '../world/WorldLayout.js';
import { shapeFromLines, shapeFromDims, shapeFromObject, clipShape, placeShape, placeBox, polySat, polyContact, polyDistance } from '../world/boat/HullShape.js';

const RHO = 1025; // sea water density
const GRAV = 9.81;
const DEG = Math.PI / 180;
// the righting ballast past a heel (rad): gm the lever in metres of mass x g per radian of excess heel, damp the roll
// damping (s) on the same lever
const BALLAST = { from: 35 * DEG, gm: 2.0, damp: 0.25 };
// Small hulls (wave 22B: the skiff, the canoe, the cutter, the launch: a few hundred kg, under 6.5 m) carry no ballast keel
// that rights them from anywhere: the ballast above still holds them up to `keep` of heel (an ordinary knock-down comes back),
// but past `at` they are over and stay over, hull up (turtle: a hold torque about +-PI, damped), until the player rights them
// (src/features/capsize: ctl.pull 0..1 lifts her from inverted towards upright, ctl.right() lets the ballast bring her up over
// `assist` s). The big hulls keep the ballast at every heel (or sink by flooding).
export const CAPSIZE = { mass: 1500, length: 6.5, keep: 60 * DEG, at: 100 * DEG, hold: 1.4, damp: 0.6, assist: 4, lift: 0.35 };
export function isSmallHull( mass, length ) {

	return Number.isFinite( mass ) && Number.isFinite( length ) && mass <= CAPSIZE.mass && length <= CAPSIZE.length;

}

// Hull against the world (wave 24B). The hull's outline as drawn (world/boat/HullShape.js: the sheer line of its lines, the
// GLB's own outline once a ship's model has loaded) against the solid colliders near her (piles, pier decks, quays, rocks:
// src/world/Colliders.js boxes and cylinders), every 1/120 s step after the integration: the overlap is pushed out (all of
// the excess past `deep`, `beta` of the rest a step) and the velocity into the obstacle at the contact point is taken out with an
// impulse through her mass and inertia (the added mass of the water in it), bounced by `restitution` (fenders and timber at a
// nudge, `hard` at speed, none while she only leans on it) and rubbed along by `friction`. Nothing tunnels: a step moves her at most a few cm. Every blow
// faster than `touch` is kept in ctl.impacts [ { what, x, y, z, speed, nx, nz } ] (naval's world contacts drain it: damage,
// the thump or the crunch, the splash); ctl.rub is the speed she grinds along with.
// The ground (the terrain heightfield under the keel points): a stiff contact along the terrain's normal (a rock face stops
// her, a beach lifts her) with Coulomb friction `ground` (the keel scrapes to a stop instead of skating up the sand); a
// new grounding faster than `touch` is an impact too ('ground', speed across the slope weighted by its steepness).
export const CONTACT = {
	restitution: 0.3, hard: 0.08, hardAt: 6, // bounce at a nudge -> at hardAt m/s and over
	friction: 0.35, ground: 1.0, // (the keel ploughs into the sand as well as sliding on it)
	slop: 0.02, beta: 0.3, deep: 0.12, // m left, of the rest pushed out a step, past this the excess at once
	touch: 0.35, // m/s: slower is a rest (moored against the fenders), not a blow
	gather: 0.25, margin: 6, // s between gathering the colliders within her reach (+ margin m)
	maxImpacts: 8,
};

const sstep = THREE.MathUtils.smoothstep;
const clamp = THREE.MathUtils.clamp;

// scratch (the integrator runs at 120 Hz: no allocations in the loop)
const _F = new THREE.Vector3();
const _T = new THREE.Vector3();
const _com = new THREE.Vector3();
const _p = new THREE.Vector3();
const _r = new THREE.Vector3();
const _f = new THREE.Vector3();
const _vp = new THREE.Vector3();
const _vl = new THREE.Vector3();
const _a = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _side = new THREE.Vector3();
const _up = new THREE.Vector3();
const _v = new THREE.Vector3();
const _rud = new THREE.Vector3();
const _g = new THREE.Vector3();
const _t = new THREE.Vector3();
const _c1 = new THREE.Vector3();
const _c2 = new THREE.Vector3();
const _c3 = new THREE.Vector3();
const _c4 = new THREE.Vector3();
const _c5 = new THREE.Vector3();
const _invQ = new THREE.Quaternion();
const _dq = new THREE.Quaternion();
const _berth = new THREE.Vector3();

// Rigid-body model of an 8.2 m, 3.2 t Downeast lobster boat (semi-displacement hull, full keel).
//
// Hydrostatics come from the hull model's buoyancy samples (waterplane patches, water heights
// queried on the GPU). The samples are laid out as a slightly narrower / shorter "effective"
// waterplane so the boat has a lobster boat's feel rather than the stiffness of the bare canoe
// body: GM ~0.6 m, roll ~3.3 s, pitch ~1.8 s, heave ~1.25 s, all well damped. Added mass and
// inertia (heave, pitch, sway...) scale with how much of the hull is in the water.
//
// Manoeuvring: calm-water resistance curve with the wave-making hump past hull speed; propeller
// thrust from a spooling engine (falls off towards the pitch speed); rudder as a lifting surface
// in the propeller race; hull lift and cross-flow drag along the keel (directional stability, the
// turning circle, speed lost in turns, outward heel); running trim and rise with speed (the bow
// lifts over the hump, then runs at a few degrees); prop walk astern. Grounding, pier piles and
// mooring lines as before.
export class BoatController {

	constructor( { model, query, terrain, colliders } ) {

		this.query = query;
		this.terrain = terrain;
		this.colliders = colliders;
		this.slot = - 1;
		this.slotCount = 0;
		this.setModel( model );

		// state (position = model origin at the design waterline)
		this.position = new THREE.Vector3().copy( this.dockPosition() );
		this.quaternion = new THREE.Quaternion().setFromAxisAngle( new THREE.Vector3( 0, 1, 0 ), WORLD.boatDock.heading );
		this.velocity = new THREE.Vector3();
		this.angular = new THREE.Vector3();

		this.throttle = 0; // lever -1..1 (moves with some inertia)
		this.steer = 0; // wheel -1..1
		this.rpm = 0; // engine 0..1 (spools after the lever)
		this.driven = false;
		this.moored = true;
		this.mooring = { anchor: this.dockPosition().clone(), heading: WORLD.boatDock.heading };
		this.speed = 0;
		this.forwardSpeed = 0;
		this.thrust = 0;
		this.slam = 0;
		this.onSlam = null;
		this._acc = 0;
		this.wetFraction = 0;

		this.bowWorld = new THREE.Vector3();
		this.sternWorld = new THREE.Vector3();
		// capsizing (small hulls): over and staying over; the side she went over to (+-1); the righting's pull 0..1
		this.capsized = false;
		this.capsizeSide = 1;
		this.pull = 0;
		this._assist = 0;
		this.onCapsize = null;
		// world contacts (wave 24B)
		this.impacts = [];
		this.rub = 0;
		this.grounded = 0;
		this.onImpact = null;

		this.apply();

	}

	// Hydrostatics, lateral stations, engine and contact geometry of a boat model (BoatModel or
	// FleetBoatModel). Called from the constructor and again when the player buys another boat.
	setModel( model ) {

		this.model = model;
		const hydro = model.hydro || {};
		this.mass = hydro.suggestedMass || 3200;
		this.com = hydro.centerOfMass ? new THREE.Vector3().copy( hydro.centerOfMass ) : new THREE.Vector3( 0, 0.3, - 0.74 );
		// principal inertia in the boat frame (+Z forward, +X port): x = pitch, y = yaw, z = roll. Gear
		// high on deck (traps, hauler, wheelhouse) gives a larger roll radius than the bare hull.
		this.inertia = hydro.inertia ? hydro.inertia.clone() : new THREE.Vector3( 14600, 15700, 3500 );
		this.inertia.z *= 1.24;
		// added mass / inertia when fully wet (fraction of the rigid-body value): surge, sway, heave;
		// pitch, yaw, roll
		this.addedMass = new THREE.Vector3( 0.6, 0.7, 0.05 ); // x (sway), y (heave), z (surge)
		this.addedInertia = new THREE.Vector3( 1.0, 0.4, 0.2 ); // x (pitch), y (yaw), z (roll)

		// effective waterplane: lateral / longitudinal lever arms of the buoyancy samples
		const cbz = hydro.centerOfBuoyancy ? hydro.centerOfBuoyancy.z : this.com.z;
		const sx = 0.79, sz = 0.9;
		this.samples = model.hullSamples.map( ( s ) => ( {
			p: new THREE.Vector3( s.position.x * sx, s.position.y, cbz + ( s.position.z - cbz ) * sz ),
			area: s.area, bottom: s.bottomY ?? s.position.y,
		} ) );
		let pitchK = 0;
		for ( const s of this.samples ) pitchK += s.area * ( s.p.z - cbz ) ** 2;
		this.pitchStiffness = RHO * GRAV * pitchK; // N m / rad (for the running-trim moment)
		// query slots: reuse the allocation when the new hull needs no more points
		if ( this.samples.length > this.slotCount ) {

			this.slot = this.query.allocate( 'boatHull', this.samples.length );
			this.slotCount = this.samples.length;

		}

		// lateral stations along the keel: (z, lateral area m^2) for hull lift and cross-flow drag
		this.stations = model.stations || [ [ - 3.4, 0.73 ], [ - 2.3, 0.78 ], [ - 1.2, 0.8 ], [ - 0.1, 0.77 ], [ 1.0, 0.62 ], [ 2.1, 0.33 ], [ 3.2, 0.14 ] ];
		this.lateralY = 0.06; // height of the centre of lateral resistance (boat frame)
		this.bank = 0; // roll moment per (u * drift velocity): hull bottom lift banking into turns
		this.hullLift = 0.5; // lift coefficient of the hull + keel per radian of drift
		this.rudderLift = 2.8; // rudder lift slope (x area 0.12 m^2), includes the hull's flap effect
		// contact geometry (grounding keel points, waterline outline against pier piles)
		this.contactPoints = model.contactPoints || null;
		this.outline = model.outline || null;
		this._setShape( model );
		// the hull's own size for the resistance curve (the lobster boat's constants scale with length)
		const L = model.dimensions ? model.dimensions.length : 8.2;
		this.sizeK = L / 8.2;
		this.length = L;
		this.draft = model.dimensions && Number.isFinite( model.dimensions.draft ) ? model.dimensions.draft : 0.85;
		// engine
		const ph = model.physics || {};
		this.maxThrust = ph.maxThrust ?? 26000; // N, bollard pull at full rpm
		this.pitchSpeed = ph.pitchSpeed ?? 16; // m/s, propeller pitch speed at full rpm (thrust -> 0 there)
		this.reverseFactor = ph.reverseFactor ?? 0.45; // astern thrust relative to ahead
		if ( ph.mass ) this.mass = ph.mass;
		this.small = isSmallHull( this.mass, L );
		if ( ! this.small ) this.capsized = false;
		this.hasWater = false;
		this._qVersion = undefined;
		this._age = 0; // s since the latest read-back was issued

		const n = this.samples.length;
		this.waterH = new Float32Array( n ); // latest read-back
		this.waterV = new Float32Array( n ); // vertical velocity of the water (m/s)
		this.waterOff = new Float32Array( n ); // blends the step when a new read-back arrives
		this.hEff = new Float32Array( n ); // water height used by the integrator (interpolated)
		this.qx = new Float32Array( n ); // query point + slope of the last result
		this.qz = new Float32Array( n );
		this.gx = new Float32Array( n );
		this.gz = new Float32Array( n );

	}

	// the berth at the pier head for this boat: the big ships lie a little further off (Boats.js berthOf)
	dockPosition( out = this._dock || ( this._dock = new THREE.Vector3() ) ) {

		const o = berthOf( this.model && this.model.id );
		return out.copy( WORLD.boatDock.position ).add( _berth.set( o.x || 0, 0, o.z || 0 ) );

	}

	// world position of a local point
	toWorld( local, out ) {

		return out.copy( local ).applyQuaternion( this.quaternion ).add( this.position );

	}

	forward( out ) {

		return out.set( 0, 0, 1 ).applyQuaternion( this.quaternion );

	}

	setInput( throttle, steer, dt ) {

		// the throttle lever moves with some inertia (the engine then spools after it); the rudder
		// follows the wheel
		this.throttleTarget = throttle;
		this.throttle += ( throttle - this.throttle ) * ( 1 - Math.exp( - dt * 2.2 ) );
		this.steer += ( steer - this.steer ) * ( 1 - Math.exp( - dt * 1.2 ) );

	}

	// Queue this frame's water height queries at the hull sample positions. The results arrive
	// q.latency seconds later, so ask where the samples will be by then (at speed the hull moves
	// ~0.5 m in that time).
	queueQueries() {

		const q = this.query;
		const lead = q.latency;
		for ( let i = 0; i < this.samples.length; i ++ ) {

			this.toWorld( this.samples[ i ].p, _v ).addScaledVector( this.velocity, lead );
			q.setPoint( this.slot + i, _v.x, _v.z );

		}

	}

	// New read-backs arrive every 1-3 frames. The vertical velocity of the water under each sample is
	// the local rate of the surface, dh/dt at a fixed point: the height change between consecutive
	// results, minus the part caused by the sample moving across the slope (at speed a wave face would
	// otherwise read as fast-rising water and launch the hull), over the time between the results.
	// Between read-backs the heights are extrapolated with that rate, and the small jump when a new
	// result lands is blended out, so the hull is never kicked by a step in the forcing.
	readQueries() {

		const q = this.query;
		if ( ! q.cpuValid || q.version === this._qVersion ) return;
		const dt = q.resultTime - ( this._qTime ?? q.resultTime );
		this._qVersion = q.version;
		this._qTime = q.resultTime;
		const c = q.cpu, pts = q.resultInputs;
		for ( let i = 0; i < this.samples.length; i ++ ) {

			const k = ( this.slot + i ) * 4;
			// never let a bad GPU sample into the integrator (keep the last good value)
			let h = c[ k ];
			if ( ! Number.isFinite( h ) ) h = this.hasWater ? this.waterH[ i ] : 0;
			const nx = Number.isFinite( c[ k + 1 ] ) ? c[ k + 1 ] : 0, nz = Number.isFinite( c[ k + 2 ] ) ? c[ k + 2 ] : 0;
			const ny = Math.sqrt( Math.max( 1 - nx * nx - nz * nz, 0.05 ) );
			const gx = - nx / ny, gz = - nz / ny; // surface slope dh/dx, dh/dz
			let w = 0;
			if ( this.hasWater && dt > 1e-4 ) {

				const dx = pts[ k ] - this.qx[ i ], dz = pts[ k + 1 ] - this.qz[ i ];
				w = ( h - this.waterH[ i ] - 0.5 * ( ( gx + this.gx[ i ] ) * dx + ( gz + this.gz[ i ] ) * dz ) ) / dt;

			}

			if ( this.hasWater ) this.waterOff[ i ] = this.hEff[ i ] - h; // where the interpolation was
			else this.waterOff[ i ] = 0;
			this.waterV[ i ] += ( clamp( w, - 3, 3 ) - this.waterV[ i ] ) * 0.5;
			this.waterH[ i ] = h;
			this.hEff[ i ] = h + this.waterOff[ i ];
			this.qx[ i ] = pts[ k ];
			this.qz[ i ] = pts[ k + 1 ];
			this.gx[ i ] = gx;
			this.gz[ i ] = gz;

		}

		this._age = 0;
		this.hasWater = true;

	}

	update( dt ) {

		this.readQueries();
		if ( ! this.hasWater ) {

			this.apply();
			return;

		}

		// hull up: no helm, the engine drowned
		if ( this.capsized ) {

			this.driven = false;
			this.throttle = 0;

		}

		if ( this._assist > 0 ) this._assist = Math.max( 0, this._assist - Math.min( dt, 0.1 ) );
		// engine: spools up after the lever (~0.9 s), a little slower down; idles while driven
		const lever = this.driven ? Math.abs( this.throttle ) : 0;
		const target = Math.max( lever, this.driven ? 0.15 : 0 );
		const tau = target > this.rpm ? 0.9 : 1.3;
		this.rpm += ( target - this.rpm ) * ( 1 - Math.exp( - Math.min( dt, 0.1 ) / tau ) );

		const h = 1 / 120;
		this._acc += Math.min( dt, 0.1 );
		let steps = 0;
		while ( this._acc >= h && steps < 12 ) {

			this.step( h );
			this._acc -= h;
			steps ++;

		}

		if ( ! this.isFinite() ) this.reset();

		this.model.setThrottle( this.throttle );
		this.model.setSteering( this.steer );
		this.model.setPropellerRPM( this.rpm * 2400 * Math.sign( this.throttle || 1 ) );
		this.apply();

	}

	step( h ) {

		const m = this.mass;
		const F = _F.set( 0, - m * GRAV, 0 );
		const T = _T.set( 0, 0, 0 ); // torque about COM (world)
		const comW = this.toWorld( this.com, _com );
		const invQ = _invQ.copy( this.quaternion ).invert();

		const addForceAt = ( f, pw ) => {

			F.add( f );
			T.add( _r.copy( pw ).sub( comW ).cross( f ) );

		};

		// water heights at the samples: latest read-back, extrapolated with the water's vertical
		// velocity (up to ~0.12 s), step blended out over ~0.06 s
		this._age = Math.min( this._age + h, 0.12 );
		const blend = Math.exp( - h / 0.06 );

		// ---- buoyancy + vertical damping per hull sample
		let wetArea = 0, totalArea = 0, immersion = 0;
		for ( let i = 0; i < this.samples.length; i ++ ) {

			const s = this.samples[ i ];
			this.waterOff[ i ] *= blend;
			const hw = this.waterH[ i ] + this.waterV[ i ] * this._age + this.waterOff[ i ];
			this.hEff[ i ] = hw;
			const pw = this.toWorld( s.p, _p );
			const depth = hw - pw.y;
			totalArea += s.area;
			if ( depth <= 0 ) continue;
			const sub = Math.min( depth, 1.6 );
			const wet = Math.min( 1, depth / 0.3 );
			wetArea += s.area * wet;
			immersion += s.area * Math.min( sub / Math.max( - s.p.y, 0.05 ), 1.5 );
			// buoyancy + heave damping against the water's own vertical motion, along world up (in the
			// boat frame a trimmed hull would turn forward speed into an upward push)
			_vp.copy( this.angular ).cross( _r.copy( pw ).sub( comW ) ).add( this.velocity );
			const vy = _vp.y - this.waterV[ i ] * 0.6;
			const wetK = Math.min( 1, sub / 0.25 ) * s.area;
			_f.set( 0, RHO * GRAV * s.area * sub - ( 1800 * vy + 900 * vy * Math.abs( vy ) ) * wetK, 0 );
			addForceAt( _f, pw );

		}

		const wet = this.wetFraction = totalArea > 0 ? wetArea / totalArea : 0;
		// how deep the hull sits relative to its design draft (lift fades as it rises out)
		const imm = totalArea > 0 ? clamp( immersion / totalArea, 0, 1 ) : 0;
		const wetD = Math.min( 1, wet * 1.6 ); // hydrodynamic forces: most of the hull in the water
		const fwd = this.forward( _fwd );
		const side = _side.set( 1, 0, 0 ).applyQuaternion( this.quaternion ); // port
		const up = _up.set( 0, 1, 0 ).applyQuaternion( this.quaternion );
		_vl.copy( this.velocity ).applyQuaternion( invQ ); // boat frame: x port, z forward
		const u = _vl.z, vs = _vl.x;
		this.speed = this.velocity.length();
		this.forwardSpeed = u;
		const aLoc = _a.copy( this.angular ).applyQuaternion( invQ ); // x pitch, y yaw, z roll rates

		// ---- calm-water resistance (friction + the wave-making hump past hull speed + planing)
		const au = Math.abs( u );
		const sk = this.sizeK, hs = Math.sqrt( sk ); // hull speed ~ sqrt( length )
		const R = ( 40 * au + 22 * au * au + 3000 * sk * sstep( au, 2.8 * hs, 5.4 * hs ) + 55 * au * au * sstep( au, 7 * hs, 11 * hs ) ) * wetD * sk;
		_p.set( 0, - 0.2, this.com.z );
		this.toWorld( _p, _p );
		addForceAt( _f.copy( fwd ).multiplyScalar( - R * Math.sign( u ) ), _p );
		// air drag on hull + house (Cd ~0.9, ~6 m^2 frontal area)
		F.addScaledVector( this.velocity, - 3.3 * this.speed * this.sizeK );

		// ---- lateral hydrodynamics along the keel: hull lift ~ u * v and cross-flow drag ~ v|v| at
		// each station (v includes the yaw rate): directional stability, the turning circle, speed
		// lost to the drift angle in turns and the outward heel (lateral resistance below the COM)
		let induced = 0;
		for ( const [ sz, A ] of this.stations ) {

			const dz = sz - this.com.z;
			// lateral velocity at the station: drift + yaw rate (about +Y) + roll rate (about +Z, the
			// keel swinging sideways below the COM)
			const vk = vs + aLoc.y * dz - aLoc.z * ( this.lateralY - this.com.y );
			const Y = - 0.5 * RHO * A * ( this.hullLift * au * vk + 1.1 * vk * Math.abs( vk ) ) * wetD;
			induced += Y * vk;
			_p.set( 0, this.lateralY, sz );
			this.toWorld( _p, _p );
			addForceAt( _f.copy( side ).multiplyScalar( Y ), _p );

		}

		// the drift angle also banks the hull into the turn (bottom pressure on the outer side),
		// leaving only a slight outward heel
		T.addScaledVector( fwd, this.bank * au * vs * wetD );

		// ---- propeller: thrust from the engine rpm, falling off towards the pitch speed; prop walk
		// astern (stern to port)
		const propW = this.toWorld( this.model.propeller, _p );
		const propSub = this.sampleWaterAt( propW ) - propW.y;
		const propWet = clamp( propSub / 0.3 + 0.5, 0, 1 );
		const dir = this.driven ? Math.sign( this.throttle ) : 0;
		const n = this.rpm * ( this.driven && Math.abs( this.throttle ) > 0.02 ? 1 : 0 );
		let thrust = 0;
		if ( dir > 0 ) thrust = this.maxThrust * n * n * Math.max( 0, 1 - Math.max( u, 0 ) / ( this.pitchSpeed * Math.max( n, 0.2 ) ) );
		else if ( dir < 0 ) thrust = - this.reverseFactor * this.maxThrust * n * n * Math.max( 0, 1 - Math.max( - u, 0 ) / ( this.pitchSpeed * 0.6 * Math.max( n, 0.2 ) ) );
		thrust *= propWet;
		this.thrust = thrust;
		addForceAt( _f.copy( fwd ).multiplyScalar( thrust ), propW );
		if ( thrust < 0 ) addForceAt( _f.copy( side ).multiplyScalar( - thrust * 0.08 ), propW );

		// ---- rudder: lifting surface in the propeller race (actuator-disc slipstream); the local
		// flow angle at the stern (drift + yaw) reduces its angle of attack
		// the rudder's side force is partly carried by the aft hull (flap effect), so it acts higher
		// than the blade's centre: less heel kick when the wheel goes over
		const rudW = this.toWorld( _rud.set( 0, - 0.15, this.model.rudder.z ), _rud );
		const race = Math.max( thrust, 0 ) * 2 / ( RHO * 0.14 ); // slipstream dynamic pressure term (m^2/s^2)
		const Ur2 = u * Math.abs( u ) + 0.9 * race;
		const Ur = Math.sqrt( Math.abs( Ur2 ) ) * Math.sign( Ur2 );
		const vRud = vs + aLoc.y * ( this.model.rudder.z - this.com.z );
		const delta = this.steer * 0.6 + ( Math.abs( Ur ) > 0.3 ? Math.atan2( vRud, Math.abs( Ur ) ) * Math.sign( Ur ) : 0 );
		const d = clamp( delta, - 0.7, 0.7 );
		const lift = 0.5 * RHO * 0.12 * Math.abs( Ur2 ) * this.rudderLift * Math.sin( d ) * Math.cos( d ) * propWet * Math.sign( Ur2 || 1 );
		addForceAt( _f.copy( side ).multiplyScalar( - lift ), rudW );
		// rudder drag (induced + form) slows the boat in a turn
		addForceAt( _f.copy( fwd ).multiplyScalar( - Math.abs( lift * Math.sin( d ) ) * 0.8 * Math.sign( u || 1 ) ), rudW );

		// ---- running trim and rise: the bow lifts over the hump, then the hull runs at a few degrees
		// with some dynamic lift (only while the hull is in the water)
		const ts = Math.sqrt( this.sizeK );
		const trim = ( 2.8 * sstep( u, 2.5 * ts, 4.8 * ts ) - 0.8 * sstep( u, 4.8 * ts, 7.5 * ts ) - 0.4 * sstep( u, 7.5 * ts, 10.5 * ts ) ) * DEG;
		T.addScaledVector( side, this.pitchStiffness * trim * imm * - 1 );
		F.addScaledVector( up, m * GRAV * 0.15 * sstep( u, 3.5, 9 ) * imm );

		// ---- small extra angular damping (appendages, bilge), scaled by wetness
		const wd = 0.2 + wetD;
		// the keel's lift resists roll in proportion to speed (a boat underway rolls much less)
		const ik = this.inertia.y / 15700; // the lobster boat's damping constants, scaled with the hull's inertia
		_v.set( - aLoc.x * 25000 * ik, - aLoc.y * 2000 * ik, - aLoc.z * ( 4500 + 900 * au ) * ik ).multiplyScalar( wd ).applyQuaternion( this.quaternion );
		T.add( _v );

		// ---- ballast: she rights herself. The hydrostatics alone turn the launch over past ~60 deg of heel and the
		// lobster boat past ~40, and a 1 m beam sea (the storm chop in a harbour) leaves her upside down for good with
		// the player "on deck". Past BALLAST.from the keel pulls her back with a torque that grows with the heel, and the
		// roll is damped while she is far over (nothing changes under BALLAST.from: the ordinary heel is the hull's).
		// Wave 22B: a small hull's ballast gives out at CAPSIZE.keep (past it the hydrostatics take her over, as before
		// 3af2572) and past CAPSIZE.at she is capsized: hull up until righted (src/features/capsize)
		const roll = Math.atan2( side.y, up.y ); // about the forward axis: 0 upright, +-PI inverted
		const over = Math.abs( roll ) - BALLAST.from;
		const k = m * GRAV * BALLAST.gm;
		if ( this.small && ! this.capsized && Math.abs( roll ) > CAPSIZE.at && this._assist <= 0 ) {

			// a small hull past the point of no return: she turns turtle and stays there
			this.capsized = true;
			this.capsizeSide = Math.sign( roll ) || 1;
			this.pull = 0;
			if ( this.onCapsize ) try { this.onCapsize( this ); } catch ( e ) { /* the listener's problem */ }

		}

		if ( this.capsized ) {

			// hull up: a hold towards +-PI (the side she went over to), eased towards upright by the righting's pull; the
			// trapped air keeps her bottom `lift` m out of the water (the waterplane samples alone would float her awash)
			const target = this.capsizeSide * Math.PI * ( 1 - clamp( this.pull, 0, 1 ) );
			const err = Math.atan2( Math.sin( roll - target ), Math.cos( roll - target ) );
			T.addScaledVector( fwd, - k * CAPSIZE.hold * err - aLoc.z * k * CAPSIZE.damp );
			const keel = this.toWorld( _p.set( 0, - this.draft, this.com.z ), _p );
			const sea = this.sampleWaterAt( keel );
			const lift = clamp( ( sea + CAPSIZE.lift - keel.y ) / 0.3, - 0.5, 1 ) * ( 1 - clamp( this.pull, 0, 1 ) );
			F.y += m * GRAV * 0.8 * lift - this.velocity.y * m * 1.5;

		} else if ( over > 0 && ( ! this.small || Math.abs( roll ) < CAPSIZE.keep || this._assist > 0 ) ) {

			T.addScaledVector( fwd, - Math.sign( roll ) * k * over * ( 1 + over ) - aLoc.z * k * BALLAST.damp );

		}

		// ---- mooring lines when docked and not driven
		if ( this.moored && ! this.driven ) {

			const a = this.mooring.anchor;
			const mk = this.mass / 3200, k = 5500 * mk, c = 4200 * mk;
			const dx = a.x - this.position.x, dz = a.z - this.position.z;
			F.x += dx * k - this.velocity.x * c;
			F.z += dz * k - this.velocity.z * c;
			let dy = this.mooring.heading - this.getYaw();
			dy = Math.atan2( Math.sin( dy ), Math.cos( dy ) );
			T.y += ( dy * 60000 - this.angular.y * 30000 ) * ( this.inertia.y / 15700 );

		}

		// ---- grounding on terrain + contact with pier piles
		this.contacts( F, T, comW );

		// ---- integrate (semi-implicit Euler) with added mass / inertia in the boat frame
		const fl = _vl.copy( F ).applyQuaternion( invQ );
		fl.x /= m * ( 1 + this.addedMass.x * wetD );
		fl.y /= m * ( 1 + this.addedMass.y * wetD );
		fl.z /= m * ( 1 + this.addedMass.z * wetD );
		this.velocity.addScaledVector( fl.applyQuaternion( this.quaternion ), h );
		const tl = T.applyQuaternion( invQ );
		const I = this.inertia, ai = this.addedInertia;
		tl.set( tl.x / ( I.x * ( 1 + ai.x * wetD ) ), tl.y / ( I.y * ( 1 + ai.y * wetD ) ), tl.z / ( I.z * ( 1 + ai.z * wetD ) ) );
		this.angular.addScaledVector( tl.applyQuaternion( this.quaternion ), h );
		// integrate position of COM, then derive origin
		comW.addScaledVector( this.velocity, h );
		const w = this.angular;
		const angle = w.length() * h;
		if ( angle > 1e-8 ) {

			_dq.setFromAxisAngle( _v.copy( w ).normalize(), angle );
			this.quaternion.premultiply( _dq ).normalize();

		}

		// origin = com - R * comLocal
		this.position.copy( comW ).sub( _v.copy( this.com ).applyQuaternion( this.quaternion ) );

		// ---- the hull against piles, piers, quays and rocks (after the move: nothing it moved into stays in)
		this._worldContacts( h, wetD );

	}

	isFinite() {

		const ok = ( v ) => Number.isFinite( v.x ) && Number.isFinite( v.y ) && Number.isFinite( v.z );
		return ok( this.position ) && ok( this.velocity ) && ok( this.angular ) && Number.isFinite( this.quaternion.w );

	}

	// back to the berth, at rest (safety net if the integration ever blows up)
	reset() {

		this.position.copy( this.dockPosition() );
		this.quaternion.setFromAxisAngle( new THREE.Vector3( 0, 1, 0 ), WORLD.boatDock.heading );
		this.velocity.set( 0, 0, 0 );
		this.angular.set( 0, 0, 0 );
		this.throttle = 0;
		this.steer = 0;
		this.rpm = 0;
		this.moored = true;
		this.mooring.anchor.copy( this.dockPosition() );
		this.mooring.heading = WORLD.boatDock.heading;
		this.capsized = false;
		this.pull = 0;
		this._assist = 0;

	}

	// Turn her over where she lies, hull up (a save or another player's capsized boat; tests). Only small hulls stay over.
	capsize( side = 1 ) {

		if ( ! this.small ) return false;
		const yaw = this.getYaw();
		this.capsizeSide = side < 0 ? - 1 : 1;
		this.quaternion.setFromAxisAngle( _g.set( 0, 1, 0 ), yaw ).multiply( _dq.setFromAxisAngle( _t.set( 0, 0, 1 ), this.capsizeSide * Math.PI * 0.999 ) );
		this.angular.set( 0, 0, 0 );
		this.velocity.set( 0, 0, 0 );
		this.position.y = - this.draft;
		this.driven = false;
		this.throttle = 0;
		this.pull = 0;
		this.capsized = true;
		this.apply();
		return true;

	}

	// the righting worked: the ballast brings her the rest of the way up (it acts at any heel for CAPSIZE.assist s)
	right() {

		if ( ! this.capsized ) return false;
		this.capsized = false;
		this._assist = CAPSIZE.assist;
		this.pull = 0;
		return true;

	}

	// her heel from upright (rad, 0..PI)
	heel() {

		const side = _c1.set( 1, 0, 0 ).applyQuaternion( this.quaternion ), up = _c2.set( 0, 1, 0 ).applyQuaternion( this.quaternion );
		return Math.abs( Math.atan2( side.y, up.y ) );

	}

	getYaw() {

		const f = this.forward( _g );
		return Math.atan2( f.x, f.z );

	}

	sampleWaterAt( p ) {

		// nearest hull sample's water height (good enough for the prop / rudder)
		let best = 0, bd = Infinity;
		for ( let i = 0; i < this.samples.length; i ++ ) {

			this.toWorld( this.samples[ i ].p, _t );
			const d = ( _t.x - p.x ) ** 2 + ( _t.z - p.z ) ** 2;
			if ( d < bd ) { bd = d; best = this.hasWater ? this.hEff[ i ] : 0; }

		}

		return best;

	}

	// The keel points on the ground: a stiff contact along the terrain's normal (a rock face stops her, a beach lifts her),
	// damped, with Coulomb friction (the keel scrapes; a little viscous give at a crawl so she settles instead of chattering).
	contacts( F, T, comW ) {

		const pts = this.contactPoints || ( this.contactPoints = [
			new THREE.Vector3( 0, - 0.7, 3.2 ), new THREE.Vector3( 0, - 0.75, 0 ), new THREE.Vector3( 0, - 0.72, - 3.4 ),
			new THREE.Vector3( 1.1, - 0.4, 1.5 ), new THREE.Vector3( - 1.1, - 0.4, 1.5 ), new THREE.Vector3( 1.2, - 0.35, - 2.5 ), new THREE.Vector3( - 1.2, - 0.35, - 2.5 ),
			new THREE.Vector3( 0, 0.2, 4.2 ),
		] );
		const pw = _c1, vp = _c2, f = _c3, r = _c4, n = _c5;
		const mk = this.mass / 3200, kn = 400000 * mk, cn = 30000 * mk;
		let touching = 0, scrape = 0, blow = 0, bx = 0, bz = 0;
		for ( const lp of pts ) {

			this.toWorld( lp, pw );
			const ground = this.terrain.heightAt( pw.x, pw.z );
			const pen = ground - pw.y;
			if ( pen <= 0 ) continue;
			touching ++;
			// the terrain's normal from its slope (0.5 m either side)
			const e = 0.5;
			const gx = ( this.terrain.heightAt( pw.x + e, pw.z ) - this.terrain.heightAt( pw.x - e, pw.z ) ) / ( 2 * e );
			const gz = ( this.terrain.heightAt( pw.x, pw.z + e ) - this.terrain.heightAt( pw.x, pw.z - e ) ) / ( 2 * e );
			n.set( - gx, 1, - gz ).normalize();
			vp.copy( this.angular ).cross( r.copy( pw ).sub( comW ) ).add( this.velocity );
			const vn = vp.dot( n );
			const fn = Math.max( 0, Math.min( pen, 0.6 ) * kn - Math.min( vn, 0 ) * cn );
			f.copy( n ).multiplyScalar( fn );
			// friction against the slide along the ground (viscous at a crawl, so she settles instead of chattering)
			vp.addScaledVector( n, - vn );
			const vt = vp.length();
			if ( vt > 1e-4 ) {

				const ft = Math.min( CONTACT.ground * fn, vt * 24000 * mk );
				f.addScaledVector( vp, - ft / vt );

			}

			F.add( f );
			T.add( r.copy( pw ).sub( comW ).cross( f ) );
			scrape = Math.max( scrape, vt );
			// a new grounding: the speed into the slope and across it (a steep face takes the way head on)
			const hit = Math.max( - vn, vt * clamp( ( 1 - n.y ) * 4, 0.15, 1 ) );
			if ( hit > blow ) { blow = hit; bx = pw.x; bz = pw.z; }

		}

		if ( touching && ! this.grounded && blow > CONTACT.touch ) this._impact( 'ground', bx, this.position.y - this.draft, bz, blow, 0, 0 );
		this.grounded = touching;
		this.groundRub = touching ? scrape : 0;

	}

	// the hull's outline (HullShape): the sheer line of her lines; a ship's GLB outline once it is in (kept only when it agrees
	// with the lines within a quarter: a stray mesh never makes her wider than she is drawn)
	_setShape( model ) {

		const d = model.dimensions || {};
		const lines = shapeFromLines( model.lines );
		this.hullShape = lines || shapeFromDims( d.length || this.length || 8.2, d.beam || 2.9 );
		// the sheer (+ the rail) above the waterline: a pier deck lower than that stops her, a higher one she runs under
		this.hullTop = Math.max( d.freeboardBow || 0, d.freeboard || 0, 0.6 ) + 0.15;
		this._near = null;
		this._gatherT = 0;
		this._upperOf( model );
		if ( ! model.ready || typeof model.ready.then !== 'function' ) return;
		model.ready.then( () => {

			if ( this.model !== model || ! model.group ) return;
			const hull = model.group.children.find( ( c ) => c.name === 'boat-hull' );
			const m = hull ? shapeFromObject( hull, { yLo: - 0.6, yHi: this.hullTop, withRoot: true } ) : null;
			const ref = this.hullShape;
			if ( ! m || ! ref ) return;
			const len = ( m.zBow - m.zAft ) / Math.max( 0.5, ref.zBow - ref.zAft );
			if ( Math.abs( m.hx / ref.hx - 1 ) < 0.25 && len > 0.8 && len < 1.25 ) {

				this.hullShape = m;
				this._near = null;

			}

			this._upperOf( model );

		} ).catch( () => {} );

	}

	// What stands above the sheer up to the wheelhouse roof (the house, the trap stack), as an outline kept inside the hull's:
	// a pier deck higher than the bow but lower than the roof lets the bow run under it and stops the house at its edge.
	_upperOf( model ) {

		this.upperShape = null;
		this.upperTop = 0;
		const d = model.dimensions || {};
		const lo = this.hullTop + 0.1, hi = ( d.houseRoofHeight || 0 ) + 0.1;
		if ( hi - lo < 0.3 || ! model.group || ! this.hullShape ) return;
		let m = null;
		try { m = shapeFromObject( model.group, { yLo: lo, yHi: hi } ); } catch ( e ) { m = null; }
		const c = m ? clipShape( m, this.hullShape ) : null;
		if ( c && c.area > 0.5 ) { this.upperShape = c; this.upperTop = hi; this._near = null; }

	}

	// the solid colliders within her reach (re-gathered every CONTACT.gather s: piles, decks, quays, rocks, crates)
	_gather() {

		const c = this.colliders, s = this.hullShape;
		const near = this._near || ( this._near = { cyl: [], box: [] } );
		near.cyl.length = 0;
		near.box.length = 0;
		this._gatherT = CONTACT.gather;
		if ( ! c || ! s ) return near;
		const R = s.r + CONTACT.margin + this.speed * CONTACT.gather * 2;
		const x = this.position.x, z = this.position.z, y0 = this.position.y - this.draft - 1, y1 = this.position.y + Math.max( this.hullTop, this.upperTop || 0 ) + 1;
		for ( const b of c.cylinders || [] ) {

			if ( b.yMax < y0 || b.yMin > y1 ) continue;
			const r = R + b.radius;
			if ( Math.abs( b.x - x ) < r && Math.abs( b.z - z ) < r ) near.cyl.push( b );

		}

		for ( const b of c.boxes || [] ) {

			if ( ! b.solid || b.top < y0 || b.bottom > y1 ) continue;
			const r = R + ( b.radius || Math.hypot( b.half.x, b.half.z ) );
			if ( Math.abs( b.center.x - x ) < r && Math.abs( b.center.z - z ) < r ) near.box.push( b );

		}

		return near;

	}

	// Hull against the colliders near her: push out, take out the way into it at the contact (with a bounce), rub along.
	_worldContacts( h, wetD ) {

		this.rub = 0;
		if ( ! this.colliders || ! this.hullShape ) return;
		this._gatherT -= h;
		const near = ( ! this._near || this._gatherT <= 0 ) ? this._gather() : this._near;
		if ( ! near.cyl.length && ! near.box.length ) { if ( this._touch ) this._touch.clear(); return; }
		const s = this.hullShape, yaw = this.getYaw(), sn = Math.sin( yaw ), cs = Math.cos( yaw );
		const y0 = this.position.y - this.draft, y1 = this.position.y + this.hullTop;
		const px = this.position.x, pz = this.position.z;
		const dist = this._pd || ( this._pd = {} );
		// what she touched last step: a contact that is new and already deep came in from above or below (she heaved up under
		// a deck's edge, rolled into a quay's coping), not across the water: that one is left alone instead of thrown clear
		const was = this._touch || ( this._touch = new Set() ), now = this._touchNow || ( this._touchNow = new Set() );
		now.clear();
		const entry = CONTACT.deep + 2 * this.speed * h + 0.05;
		for ( const c of near.cyl ) {

			if ( c.yMax < y0 || c.yMin > y1 ) continue;
			const dx = c.x - this.position.x, dz = c.z - this.position.z, rr = s.r + c.radius;
			if ( dx * dx + dz * dz > rr * rr ) continue;
			polyDistance( s, dx * cs - dz * sn, dx * sn + dz * cs, dist );
			const pen = c.radius - dist.d;
			if ( pen <= 0 ) continue;
			now.add( c );
			if ( ! was.has( c ) && pen > entry ) continue;
			// the outline's normal towards the pile, in the world; the hull goes the other way
			const wx = dist.nx * cs + dist.nz * sn, wz = - dist.nx * sn + dist.nz * cs;
			this._resolve( - wx, - wz, pen, c.x - wx * c.radius, c.z - wz * c.radius, c.tag || 'pile', wetD );

		}

		if ( near.box.length ) {

			const sat = this._sat || ( this._sat = {} ), pt = this._pt || ( this._pt = {} );
			const yu = this.position.y + ( this.upperTop || 0 );
			for ( const b of near.box ) {

				// over the sheer: only the deckhouse's outline reaches it (a deck she runs her bow under)
				const up = b.bottom > y1;
				if ( b.top < y0 || ( up && ( ! this.upperShape || b.bottom > yu ) ) ) continue;
				const rr = s.r + ( b.radius || Math.hypot( b.half.x, b.half.z ) );
				if ( Math.abs( b.center.x - this.position.x ) > rr || Math.abs( b.center.z - this.position.z ) > rr ) continue;
				// (placed where she is now: an earlier contact of this step may have pushed her)
				const H = up ? ( this._up = placeShape( this.upperShape, this.position.x, this.position.z, yaw, this._up ) ) : ( this._wp = placeShape( s, this.position.x, this.position.z, yaw, this._wp ) );
				const B = this._bp = placeBox( b, this._bp );
				polySat( H, B, sat );
				if ( ! sat.hit ) continue;
				now.add( b );
				if ( ! was.has( b ) && sat.depth > entry ) continue;
				polyContact( H, B, sat, pt );
				this._resolve( - sat.nx, - sat.nz, sat.depth, pt.x, pt.z, b.tag || 'box', wetD );

			}

		}

		this._touch = now;
		this._touchNow = was;
		if ( this.position.x !== px || this.position.z !== pz ) this.apply();

	}

	// one contact: the hull pushed along ( nx, nz ) (unit, horizontal) out of `depth` m at the world point ( px, pz )
	_resolve( nx, nz, depth, px, pz, what, wetD ) {


		// a share of the overlap a step (she settles against it without a jolt); past `deep` all of the excess at once
		const corr = Math.max( 0, depth - CONTACT.deep ) + Math.max( 0, Math.min( depth, CONTACT.deep ) - CONTACT.slop ) * CONTACT.beta;
		this.position.x += nx * corr;
		this.position.z += nz * corr;
		// the contact point's velocity (the blow lands a little above the waterline)
		const comW = this.toWorld( this.com, _c1 );
		const r = _c2.set( px - comW.x, this.position.y + 0.3 - comW.y, pz - comW.z );
		const vp = _c3.copy( this.angular ).cross( r ).add( this.velocity );
		const vn = vp.x * nx + vp.z * nz;
		const tx = vp.x - nx * vn, tz = vp.z - nz * vn, vt = Math.hypot( tx, tz );
		this.rub = Math.max( this.rub, vt );
		if ( vn >= 0 ) return; // resting against it (moored to the fenders, pressed by the wind): nothing to take out

		// the effective mass along n: the boat-frame mass with the water's added mass, and the inertia about the lever
		const invQ = _invQ.copy( this.quaternion ).invert();
		const m = this.mass, am = this.addedMass, ai = this.addedInertia, I = this.inertia;
		const nb = _c4.set( nx, 0, nz ).applyQuaternion( invQ );
		const imx = 1 / ( m * ( 1 + am.x * wetD ) ), imy = 1 / ( m * ( 1 + am.y * wetD ) ), imz = 1 / ( m * ( 1 + am.z * wetD ) );
		const invMn = nb.x * nb.x * imx + nb.y * nb.y * imy + nb.z * nb.z * imz;
		const iIx = 1 / ( I.x * ( 1 + ai.x * wetD ) ), iIy = 1 / ( I.y * ( 1 + ai.y * wetD ) ), iIz = 1 / ( I.z * ( 1 + ai.z * wetD ) );
		// n . ( ( I^-1 ( r x n ) ) x r ), in the boat frame
		const rb = _c5.copy( r ).applyQuaternion( invQ );
		const cx = rb.y * nb.z - rb.z * nb.y, cy = rb.z * nb.x - rb.x * nb.z, cz = rb.x * nb.y - rb.y * nb.x;
		const ix = cx * iIx, iy = cy * iIy, iz = cz * iIz;
		const kAng = ( iy * rb.z - iz * rb.y ) * nb.x + ( iz * rb.x - ix * rb.z ) * nb.y + ( ix * rb.y - iy * rb.x ) * nb.z;
		const speed = - vn;
		// no bounce while she only leans on it (moored against the fenders: no chatter), the fenders' at a nudge, dead at speed
		const e = ( CONTACT.restitution + ( CONTACT.hard - CONTACT.restitution ) * sstep( speed, 1, CONTACT.hardAt ) ) * sstep( speed, 0.15, CONTACT.touch + 0.25 );
		const jn = ( 1 + e ) * speed / ( invMn + Math.max( 0, kAng ) );
		// friction along the face: at most mu jn, never more than stops the slide
		const jt = vt > 1e-4 ? Math.min( CONTACT.friction * jn, vt / Math.max( invMn, 1e-9 ) * 0.5 ) : 0;
		const jx = nx * jn - ( jt ? tx / vt * jt : 0 ), jz = nz * jn - ( jt ? tz / vt * jt : 0 );
		// linear: J through the boat-frame mass
		const jb = _c4.set( jx, 0, jz ).applyQuaternion( invQ );
		jb.set( jb.x * imx, jb.y * imy, jb.z * imz ).applyQuaternion( this.quaternion );
		this.velocity.add( jb );
		// angular: r x J through the inertia (bounded: a blow never throws her over)
		const L = _c3.set( r.y * jz, r.z * jx - r.x * jz, - r.y * jx ).applyQuaternion( invQ );
		L.set( clamp( L.x * iIx, - 0.3, 0.3 ), clamp( L.y * iIy, - 1.0, 1.0 ), clamp( L.z * iIz, - 0.4, 0.4 ) ).applyQuaternion( this.quaternion );
		this.angular.add( L );
		if ( speed > CONTACT.touch ) this._impact( what, px, this.position.y + 0.3, pz, speed, nx, nz );

	}

	_impact( what, x, y, z, speed, nx, nz ) {

		const list = this.impacts;
		// one entry per obstacle and blow: the hardest of the steps it took
		for ( const i of list ) {

			if ( i.what !== what || Math.hypot( i.x - x, i.z - z ) > 3 ) continue;
			if ( speed > i.speed ) { i.x = x; i.y = y; i.z = z; i.speed = speed; i.nx = nx; i.nz = nz; }
			return;

		}

		if ( list.length >= CONTACT.maxImpacts ) list.shift();
		const hit = { what, x, y, z, speed, nx, nz };
		list.push( hit );
		if ( this.onImpact ) try { this.onImpact( hit ); } catch ( e ) { /* the listener's problem */ }

	}

	// the blows since the last call (naval's world contacts drain them every frame)
	drainImpacts( out = [] ) {

		out.length = 0;
		for ( const i of this.impacts ) out.push( i );
		this.impacts.length = 0;
		return out;

	}

	// Collision response (naval/Collisions.js, wave 9): another hull pushed us out by ( dx, dz ) and struck with the
	// impulse ( jx, jz ) (N s, world, horizontal) at the world point ( px, py, pz ). The velocity changes by J / m; the
	// lever of the point about the centre of mass kicks the yaw rate (and heels her a little: the blow lands above it).
	applyCollision( dx = 0, dz = 0, jx = 0, jz = 0, px = this.position.x, py = this.position.y, pz = this.position.z ) {

		if ( ! [ dx, dz, jx, jz, px, py, pz ].every( Number.isFinite ) ) return false;
		this.position.x += dx;
		this.position.z += dz;
		const m = this.mass || 3200;
		this.velocity.x += jx / m;
		this.velocity.z += jz / m;
		if ( jx !== 0 || jz !== 0 ) {

			// angular impulse r x J ( J has no vertical part ), in the boat frame over the (wet) inertia
			const comW = this.toWorld( this.com, _c1 );
			const rx = px - comW.x, ry = py - comW.y, rz = pz - comW.z;
			const L = _c2.set( ry * jz, rz * jx - rx * jz, - ry * jx ).applyQuaternion( _invQ.copy( this.quaternion ).invert() );
			const I = this.inertia, ai = this.addedInertia, wet = clamp( this.wetFraction || 1, 0, 1 );
			L.set( L.x / ( I.x * ( 1 + ai.x * wet ) ), L.y / ( I.y * ( 1 + ai.y * wet ) ), L.z / ( I.z * ( 1 + ai.z * wet ) ) );
			L.set( clamp( L.x, - 0.4, 0.4 ), clamp( L.y, - 1.2, 1.2 ), clamp( L.z, - 0.6, 0.6 ) ).applyQuaternion( this.quaternion );
			this.angular.add( L );

		}

		if ( this.model && this.model.group ) this.apply();
		return true;

	}

	apply() {

		const g = this.model.group;
		g.position.copy( this.position );
		g.quaternion.copy( this.quaternion );
		g.updateMatrixWorld( true );
		const L = this.model.lines;
		this.toWorld( _v.set( 0, 0, L ? L.zBow - 0.4 : 3.9 ), this.bowWorld );
		this.toWorld( _v.set( 0, 0, L ? L.zAft + 0.1 : - 3.8 ), this.sternWorld );

	}

}
