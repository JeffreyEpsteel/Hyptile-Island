import * as THREE from '../engine/index.js';
import { WORLD } from '../world/WorldLayout.js';
import { HOUSE } from '../world/boat/Wheelhouse.js';
import { BOATS } from '../game/Boats.js';

// helm seat (boat frame) of the current boat: fleet hulls carry their own, the lobster boat's is the wheelhouse
const helmOf = ( b ) => ( b && b.model.helmPoint ) || { x: HOUSE.helmX, z: HOUSE.seatZ };
// third-person spring arm: the camera hangs off a pivot above the feet that lags behind the body
const ARM = { dist: 4.2, min: 1.6, max: 9, height: 1.45, side: 0.35, lag: 9 };

const EYE = 1.62;
const SWIM_EYE = EYE * 0.1; // eyes above the body's float point while swimming
const RADIUS = 0.3;
const HEIGHT = 1.75;
// water depth (mean level over the feet) where you start swimming / find your feet again
const SWIM_DEPTH = 1.35;
const STAND_DEPTH = 1.1;

const VIEW_KEY = 'hyptile-island.view';
function loadView() {

	try {

		return localStorage.getItem( VIEW_KEY ) === 'first' ? 'first' : 'third';

	} catch ( e ) {

		return 'third';

	}

}

const _v = new THREE.Vector3();
const _rideQ = new THREE.Quaternion();
// the deck height at the helm: the ships' wheel stands on a raised quarterdeck (ShipBoatModel helmDeckHeight)
const helmDeck = ( b ) => ( b.model.dimensions && b.model.dimensions.helmDeckHeight ) ?? b.model.lines.deckY;
const _v2 = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler( 0, 0, 0, 'YXZ' );
const _yAxis = new THREE.Vector3( 0, 1, 0 );
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion();
const _wish = new THREE.Vector3();
// walking on the boat
const DECK_RADIUS = 0.24;
const DECK_STEP = 0.36; // highest ledge you step up onto
const HELM_REACH = 0.75; // m from the helm seat to take the wheel

// Walker / swimmer / boat captain, seen in third person (V: first person).
//   walk : capsule on terrain + walkable colliders, wading slows you down
//   swim : floats with the head at the surface; look down + W (or C) to dive, Space to rise
//   deck : aboard, walking in the boat's frame (it moves and rocks under you); E at the helm
//          takes the wheel, E near a pier / the beach steps ashore
//   boat : at the helm, driving; V toggles helm (1st person) / chase (3rd person) camera, E stands up
//   plane: piloting a vehicle another module simulates (the seaplane feature): enterVehicle( v ) / exitVehicle( ... ),
//          see updatePlane for what `v` provides; seated pose, cockpit eye or chase camera
export class Player {

	constructor( { camera, input, terrain, colliders, query, boat, reef = null, audio = null } ) {

		this.camera = camera;
		this.input = input;
		this.terrain = terrain;
		this.colliders = colliders;
		this.query = query;
		this.boat = boat;
		this.reef = reef;
		this.audio = audio;

		this.mode = 'walk';
		this.camMode = 'third'; // at the helm: 'first' (helm eye) | 'third' (orbit)
		// on foot / swimming / on deck: 'third' (spring arm) | 'first'. The choice (V, or the Camera tab) is
		// remembered between sessions and also picks the helm camera
		this.view = loadView();
		this.camMode = this.view;
		this.action = null; // avatar one-shots / loops set by the game (fishing, celebrating)
		// Caps Lock toggles running; Shift sprints while held. Sprinting drains stamina, walking refills it.
		this.runToggle = false;
		this.stamina = 1;
		this.launched = 0; // s left of a shove (the clown's prank): no control until you land / splash
		this.reduceMotion = false; // settings: steadier cameras aboard
		// spring arm state (third person): the lagged pivot and the arm length
		this.armPivot = new THREE.Vector3();
		this.armDist = ARM.dist;
		this.armInit = false;
		const start = WORLD.start || WORLD.spawn;
		this.position = new THREE.Vector3().copy( start.position );
		// standing on whatever is there (the boardwalk planks), not in it
		this.position.y = Math.max( terrain.heightAt( this.position.x, this.position.z ), colliders ? colliders.groundHeightAt( this.position.x, this.position.z, 50 ) : - Infinity );
		this.velocity = new THREE.Vector3();
		this.yaw = start.yaw;
		this.pitch = - 0.05;
		this.grounded = false;
		this.bob = 0;
		this.stepDist = 0;
		this.waterH = 0;
		this.waterMean = null; // water level low-passed over the passing waves (mode decisions)
		this.wade = 0;
		// eye height easing between modes (critically damped offset from the mode's eye height)
		this.camOff = 0;
		this.camOffV = 0;
		this._camY = null;
		this.floating = true; // swimming at the surface (riding the waves) vs. free under water
		this.slot = query.allocate( 'player', 1 );
		this.prompt = null;
		this.surface = 'sand';

		// boat cameras
		this.orbitYaw = 0;
		this.orbitPitch = 0.22;
		this.orbitDist = 13;
		this.helmYaw = 0;
		this.helmPitch = - 0.05;
		this.camPos = new THREE.Vector3();
		this.camInit = false;
		this.wasUnder = false;

		// on deck: position and heading in the boat frame (+Z forward, yaw 0 looks forward)
		this.deckPos = new THREE.Vector3();
		this.deckVel = new THREE.Vector3();
		this.deckYaw = 0;
		this.deckGrounded = true;
		this._ashore = null; // cached step-ashore target
		this.helmAshore = false; // at the helm: E steps ashore (touch adds a Deck button for Q)
		this._ashoreT = 0;
		// set by the fishing game: while a line is out the helm / step ashore prompts give way
		this.busy = false;
		this.vehicle = null; // mode 'plane': what is being piloted (enterVehicle)

	}

	// view direction in world space (for casting); works in every mode
	getViewDir( out ) {

		return out.set( 0, 0, - 1 ).applyQuaternion( this.camera.quaternion );

	}

	// ------------------------------------------------------------------ helpers

	waterHeight() {

		const q = this.query;
		if ( ! q.cpuValid ) return 0;
		const h = q.cpu[ this.slot * 4 ];
		return Number.isFinite( h ) ? h : this.waterH || 0;

	}

	groundAt( x, z, maxY ) {

		let g = this.terrain.heightAt( x, z );
		const c = this.colliders.groundHeightAt( x, z, maxY );
		if ( c > g ) g = c;
		if ( this.reef && this.reef.floorHeightAt ) g = Math.max( g, this.reef.floorHeightAt( x, z ) );
		return g;

	}

	// swap the boat (bought / traded at the yard); null = on foot
	setBoat( ctl ) {

		if ( this.mode === 'boat' || this.mode === 'deck' || this.mode === 'seat' ) {

			this.mode = 'walk';
			this.velocity.set( 0, 0, 0 );

		}

		this.boat = ctl;

	}

	nearBoat() {

		if ( ! this.boat ) return false;
		const bp = this.boat.toWorld( this.boat.model.boardPoint, _v );
		const d = Math.hypot( bp.x - this.position.x, bp.z - this.position.z );
		const dy = Math.abs( bp.y - this.position.y );
		return d < 4.2 && dy < 3.2;

	}

	// ------------------------------------------------------------------ update

	update( dt ) {

		const inp = this.input;
		this.query.setPoint( this.slot, this.position.x, this.position.z );
		this.waterH = this.waterHeight();
		this.waterMean = this.waterMean === null ? this.waterH : this.waterMean + ( this.waterH - this.waterMean ) * ( 1 - Math.exp( - dt / 4 ) );
		this.prompt = null;

		if ( this.mode === 'plane' && this.vehicle ) {

			this.updatePlane( dt );
			return;

		}

		if ( this.mode === 'boat' ) {

			this.updateBoat( dt );
			return;

		}

		if ( this.mode === 'deck' ) {

			this.updateDeck( dt );
			return;

		}

		if ( this.mode === 'seat' ) {

			this.updateSeat( dt );
			return;

		}

		if ( this.ride ) {

			this.updateRide( dt );
			return;

		}

		const look = inp.consumeLook();
		this.yaw -= look.x * 0.0022;
		this.pitch = THREE.MathUtils.clamp( this.pitch - look.y * 0.0022, - 1.5, 1.5 );
		if ( inp.hit( 'KeyV' ) ) this.toggleView();
		this.armDist = THREE.MathUtils.clamp( this.armDist * ( 1 + inp.consumeWheel() * 0.1 ), ARM.min, ARM.max );

		// (not with a line out or a fish in hand: E belongs to the fishing then)
		if ( this.nearBoat() && ! this.busy ) {

			this.prompt = { key: 'E', text: 'Board boat' };
			if ( inp.hit( 'KeyE' ) ) {

				this.boardBoat();
				return;

			}

		}

		const prevMode = this.mode;
		if ( this.mode === 'walk' ) this.updateWalk( dt );
		else this.updateSwim( dt );

		// camera. Wading out of your depth, finding your feet again or climbing out on a ladder
		// changes the eye height: ease the view there (critically damped) instead of jumping
		const eye = this.position.clone();
		if ( this.mode === 'walk' ) eye.y += EYE + Math.sin( this.bob ) * 0.035 * ( 1 - 0.6 * this.wade );
		else eye.y += SWIM_EYE;
		if ( this._camY === null || this.camera.position.y !== this._camY ) {

			// something else drove the camera since our last frame (free camera, boat): start fresh
			this.camOff = 0;
			this.camOffV = 0;

		} else if ( this.mode !== prevMode ) {

			this.camOff = this._camY - eye.y;

		}

		const w = 6, e = Math.exp( - w * dt ), j = ( this.camOffV + w * this.camOff ) * dt;
		this.camOff = ( this.camOff + j ) * e;
		this.camOffV = ( this.camOffV - w * j ) * e;
		eye.y += this.camOff;
		if ( this.view === 'third' ) {

			this.springArm( dt, eye, null );
			return;

		}

		this.camera.position.copy( eye );
		this._camY = this.camera.position.y;
		this.camera.quaternion.setFromEuler( _e.set( this.pitch, this.yaw, 0 ) );

	}

	// a shove (the clown's prank, a wave): off the ground along `dir` (world, horizontal) at `speed`
	launch( dir, speed = 5, up = 3.2 ) {

		if ( this.mode === 'boat' || this.mode === 'plane' ) return false;
		if ( this.mode === 'deck' ) this.exitBoat( null, Math.sign( this.deckPos.x ) || 1 );
		this.mode = this.mode === 'swim' ? 'swim' : 'walk';
		const d = _v2.set( dir.x, 0, dir.z );
		if ( d.lengthSq() < 1e-6 ) d.set( - Math.sin( this.yaw ), 0, - Math.cos( this.yaw ) );
		d.normalize();
		this.velocity.set( d.x * speed, up, d.z * speed );
		this.grounded = false;
		this.launched = 0.9;
		this.action = 'tumble';
		return true;

	}

	toggleView() {

		this.setView( this.view === 'third' ? 'first' : 'third' );

	}

	// 'first' | 'third', everywhere (on foot, on deck, seated and at the helm), saved for next time
	setView( v ) {

		this.view = v === 'first' ? 'first' : 'third';
		this.camMode = this.view;
		this.armInit = false;
		this.camInit = false;
		this._camY = null;
		try {

			localStorage.setItem( VIEW_KEY, this.view );

		} catch ( e ) { /* storage blocked: the choice lasts this session */ }

	}

	// Third-person spring arm. The pivot sits ARM.height above the feet and lags behind the body
	// (exponential), the arm hangs off it along the view direction, a little to the side over the
	// shoulder, and shortens when it would go into the ground or a deck.
	// base: an extra orientation (the boat's frame on deck) applied before yaw / pitch.
	springArm( dt, feet, base ) {

		const target = _v2.set( feet.x, feet.y + ( this.mode === 'swim' ? 0.6 : ARM.height ), feet.z );
		if ( ! this.armInit ) {

			this.armPivot.copy( target );
			this.armInit = true;

		} else this.armPivot.lerp( target, 1 - Math.exp( - dt * ARM.lag ) );

		if ( base ) this.camera.quaternion.copy( base ).multiply( _qa.setFromEuler( _e.set( this.pitch, this.yaw, 0 ) ) );
		else this.camera.quaternion.setFromEuler( _e.set( this.pitch, this.yaw, 0 ) );
		const back = _fwd.set( 0, 0, 1 ).applyQuaternion( this.camera.quaternion );
		const side = _right.set( 1, 0, 0 ).applyQuaternion( this.camera.quaternion );
		// the arm: shorten before it enters the ground (a few probes along it)
		let dist = this.armDist;
		for ( let i = 1; i <= 6; i ++ ) {

			const d = this.armDist * i / 6;
			const px = this.armPivot.x + back.x * d + side.x * ARM.side, pz = this.armPivot.z + back.z * d + side.z * ARM.side;
			const py = this.armPivot.y + back.y * d + side.y * ARM.side;
			const g = this.terrain.heightAt( px, pz );
			const c = this.colliders ? this.colliders.groundHeightAt( px, pz, py + 0.3 ) : - Infinity;
			if ( py < Math.max( g, c ) + 0.35 ) {

				dist = Math.max( ARM.min * 0.5, d - 0.3 );
				break;

			}

		}

		this.camera.position.copy( this.armPivot ).addScaledVector( back, dist ).addScaledVector( side, ARM.side );
		this._camY = this.camera.position.y;

	}

	// the avatar's pose this frame (see player/Avatar.js): feet, heading, locomotion, action
	pose( out = {} ) {

		const b = this.boat;
		out.mode = this.mode;
		out.action = this.action;
		out.frame = null;
		out.diving = this.mode === 'swim' && ! this.floating;
		out.seat = null; out.forward = out.strafe = undefined; // the animation graph's seat kind and the deck strafe
		if ( this.mode === 'boat' ) {

			const h = helmOf( b );
			out.position = b.toWorld( _v2.set( h.x, helmDeck( b ), h.z ), out.position || new THREE.Vector3() );
			// relative to the boat's frame (the avatar adds pi): facing the bow; a rower sits facing the stern
			out.yaw = BOATS[ b.model.id ] && BOATS[ b.model.id ].drive === 'row' ? 0 : Math.PI;
			out.frame = b.quaternion;
			out.speed = 0;
			out.vy = 0;
			out.grounded = true;
			return out;

		}

		if ( this.mode === 'plane' && this.vehicle ) {

			// seated in the cockpit, in the vehicle's frame, facing its nose (+Z; the avatar adds pi)
			const v = this.vehicle;
			out.seat = 'plane';
			out.position = v.toWorld( v.seat, out.position || new THREE.Vector3() );
			out.frame = v.quaternion;
			out.mode = 'seat';
			out.action = 'seated';
			out.yaw = Math.PI;
			out.speed = 0;
			out.vy = 0;
			out.grounded = true;
			return out;

		}

		out.position = ( out.position || new THREE.Vector3() ).copy( this.position );
		out.yaw = this.yaw;
		if ( this.mode === 'ride' && this.ride ) {

			const q = this.ride.quaternion;
			out.mode = 'seat';
			out.seat = 'ride';
			out.frame = _rideQ.set( q.x, q.y, q.z, q.w );
			out.yaw = ( this.ride.seatYaw || 0 ) + Math.PI;
			out.action = 'seated';
			out.speed = 0;
			out.vy = 0;
			out.grounded = true;
			return out;

		}

		if ( this.mode === 'seat' && this.seat ) {

			out.frame = b.quaternion;
			out.yaw = this.seat.yaw + Math.PI;
			out.speed = 0;
			out.vy = 0;
			out.grounded = true;
			return out;

		}

		if ( this.mode === 'deck' ) {

			out.frame = b.quaternion;
			out.speed = Math.hypot( this.deckVel.x, this.deckVel.z );
			out.vy = this.deckVel.y;
			// forward / strafe in the boat frame so the strafe blend space picks the right legs when backpedalling on deck
			{ const sy = Math.sin( this.deckYaw ), cy = Math.cos( this.deckYaw ); out.forward = - sy * this.deckVel.x - cy * this.deckVel.z; out.strafe = cy * this.deckVel.x - sy * this.deckVel.z; }
			out.grounded = this.deckGrounded;
			// heading in the boat frame: the deck yaw (the frame supplies the boat's heading)
			out.yaw = this.deckYaw + Math.PI;
			return out;

		}

		out.speed = this.mode === 'swim' ? this.velocity.length() : Math.hypot( this.velocity.x, this.velocity.z );
		out.vy = this.velocity.y;
		out.grounded = this.mode === 'swim' ? true : this.grounded;
		return out;

	}

	updateWalk( dt ) {

		const inp = this.input;
		_fwd.set( - Math.sin( this.yaw ), 0, - Math.cos( this.yaw ) );
		_right.set( - _fwd.z, 0, _fwd.x );
		const wish = new THREE.Vector3();
		if ( inp.down( 'KeyW' ) ) wish.add( _fwd );
		if ( inp.down( 'KeyS' ) ) wish.sub( _fwd );
		if ( inp.down( 'KeyD' ) ) wish.add( _right );
		if ( inp.down( 'KeyA' ) ) wish.sub( _right );
		if ( wish.lengthSq() > 0 ) wish.normalize();

		const depth = this.waterH - this.position.y; // water depth at the feet
		const wade = THREE.MathUtils.clamp( depth / 1.2, 0, 1 );
		this.wade = wade;
		if ( inp.hit( 'CapsLock' ) ) this.runToggle = ! this.runToggle;
		const moving = wish.lengthSq() > 0;
		const sprintHeld = inp.down( 'ShiftLeft' ) || inp.down( 'ShiftRight' );
		// a jog by default; Caps Lock: walk; Shift: sprint (stamina). Speeds follow the mocap strides
		// (walk clip ~0.76 m/s, run ~2.17 m/s at rate 1) so the feet do not slide
		const sprint = sprintHeld && this.stamina > 0.02 && moving;
		const walk = this.runToggle && ! sprint;
		// (user tuning 2026-10-13: a sprint lasts ~80 s and runs 3.5x the mocap stride; the refill stays)
		this.stamina = THREE.MathUtils.clamp( this.stamina + ( sprint ? - dt / 80 : dt / 6 ), 0, 1 );
		const speed = ( sprint ? 16 : walk ? 1.25 : 2.7 ) * THREE.MathUtils.lerp( 1, 0.42, wade );
		const accel = this.grounded ? 14 : 2.5;
		const k = 1 - Math.exp( - accel * dt );
		if ( this.launched > 0 ) this.launched -= dt;
		else {

			this.velocity.x += ( wish.x * speed - this.velocity.x ) * k;
			this.velocity.z += ( wish.z * speed - this.velocity.z ) * k;

		}

		if ( this.grounded && inp.hit( 'Space' ) && depth < 0.9 ) {

			this.velocity.y = 4.6;
			this.grounded = false;

		}

		this.velocity.y -= 9.81 * dt;
		// water drag while wading
		if ( depth > 0 ) this.velocity.multiplyScalar( Math.exp( - dt * depth * 0.8 ) );

		const p = this.position;
		const old = p.clone();
		p.addScaledVector( this.velocity, dt );
		this.colliders.resolveCapsule( p, RADIUS, HEIGHT, 0.4 );
		const g = this.groundAt( p.x, p.z, p.y + 0.45 );
		if ( p.y <= g ) {

			p.y = g;
			if ( this.velocity.y < 0 ) this.velocity.y = 0;
			this.grounded = true;

		} else {

			this.grounded = p.y - g < 0.06;

		}

		// head bob + footsteps
		const moved = Math.hypot( p.x - old.x, p.z - old.z );
		if ( this.grounded ) {

			this.bob += moved * 2.4;
			this.stepDist += moved;
			const stride = sprint ? 0.9 : 0.62;
			if ( this.stepDist > stride ) {

				this.stepDist = 0;
				this.surface = this.surfaceType( depth );
				if ( this.audio ) this.audio.footstep( this.surface );

			}

		}

		// out of your depth -> swim. Wading in, the body lifts into the floating position at the
		// surface and the view eases down to it (update()); falling in off the pier plunges under
		// and floats back up.
		if ( this.waterMean - p.y > SWIM_DEPTH ) {

			const wadedIn = this.grounded;
			this.mode = 'swim';
			if ( wadedIn ) p.y = Math.max( p.y, this.waterH - SWIM_EYE + 0.1 );
			this.velocity.y = wadedIn ? 0 : Math.max( this.velocity.y * 0.3, - 2.5 );
			if ( this.audio ) this.audio.splash( wadedIn ? 0.2 : 0.5, p );

		}

	}

	surfaceType( depth ) {

		const p = this.position;
		if ( depth > 0.12 ) return 'water';
		const onWood = this.colliders.groundHeightAt( p.x, p.z, p.y + 0.1 ) > this.terrain.heightAt( p.x, p.z ) + 0.05;
		if ( onWood ) return 'wood';
		const h = this.terrain.heightAt( p.x, p.z );
		if ( h < 0.6 ) return 'wetsand';
		if ( h > 3.6 ) return 'grass';
		return 'sand';

	}

	updateSwim( dt ) {

		const inp = this.input;
		const p = this.position;
		const surfaceY = this.waterH;
		// look-relative movement (diving follows the view)
		_fwd.set( 0, 0, - 1 ).applyEuler( _e.set( this.pitch, this.yaw, 0 ) );
		_right.set( - Math.cos( this.yaw ), 0, Math.sin( this.yaw ) ).negate();
		const wish = new THREE.Vector3();
		if ( inp.down( 'KeyW' ) ) wish.add( _fwd );
		if ( inp.down( 'KeyS' ) ) wish.sub( _fwd );
		if ( inp.down( 'KeyD' ) ) wish.add( _right );
		if ( inp.down( 'KeyA' ) ) wish.sub( _right );
		if ( inp.down( 'Space' ) ) wish.y += 1;
		if ( inp.down( 'KeyC' ) ) wish.y -= 1; // (Ctrl is never a game key: browser shortcuts)
		if ( wish.lengthSq() > 0 ) wish.normalize();

		const atSurface = this.floating && p.y > surfaceY - 0.45;
		// at the surface W along a level view keeps you on top; looking down dives
		if ( atSurface && wish.y > - 0.25 && ! inp.down( 'KeyC' ) ) wish.y = Math.max( wish.y, 0 );

		const sprint = inp.down( 'ShiftLeft' ) || inp.down( 'ShiftRight' );
		const speed = sprint ? 2.5 : 1.5;
		const k = 1 - Math.exp( - dt * 3.0 );
		this.velocity.lerp( wish.multiplyScalar( speed ), k );

		// A swimmer at the surface floats with the head riding the waves; one who dives stays where
		// they swim to (neutral buoyancy, nothing pulls them back up) until they swim up to the
		// surface again.
		const eyeTarget = surfaceY - SWIM_EYE + 0.1; // eyes ~10 cm above the water; waves still wash over
		const diving = inp.down( 'KeyC' ) || ( inp.down( 'KeyW' ) && this.pitch < - 0.35 ) || wish.y < - 0.1;
		if ( diving ) this.floating = false;
		else if ( p.y > eyeTarget - 0.15 ) this.floating = true;
		if ( this.floating ) {

			p.y += ( eyeTarget - p.y ) * ( 1 - Math.exp( - dt * 5 ) );
			if ( this.velocity.y > 0 ) this.velocity.y *= 0.5;

		}

		p.addScaledVector( this.velocity, dt );
		p.y = Math.min( p.y, surfaceY + 0.05 );
		this.colliders.resolveCapsule( p, RADIUS, 1.0, 0 );
		const g = this.groundAt( p.x, p.z, p.y + 0.3 );
		if ( p.y < g + 0.25 ) p.y = g + 0.25;

		// strokes / bubbles
		this.stepDist += this.velocity.length() * dt;
		if ( this.stepDist > 1.3 ) {

			this.stepDist = 0;
			if ( this.audio ) this.audio.swimStroke();

		}

		const under = this.camera.position.y < surfaceY - 0.05;
		if ( under !== this.wasUnder && this.audio ) {

			if ( under ) this.audio.submerge();
			else this.audio.emerge();

		}

		this.wasUnder = under;

		// shallow enough to stand -> walk (update() eases the view up to standing height). The mean
		// level decides, so a passing wave doesn't flip you between swimming and standing.
		if ( this.waterMean - g < STAND_DEPTH ) {

			this.mode = 'walk';
			p.y = g;
			this.velocity.set( this.velocity.x, 0, this.velocity.z );

		}

		// ladders on the pier: climb out when swimming into them
		if ( this.colliders.boxes ) {

			for ( const b of this.colliders.boxes ) {

				if ( b.tag !== 'ladder' ) continue;
				if ( Math.hypot( b.center.x - p.x, b.center.z - p.z ) < 1.1 ) {

					this.prompt = { key: 'Space', text: 'Climb ladder' };
					if ( inp.down( 'Space' ) || inp.down( 'KeyW' ) ) {

						const top = this.colliders.groundHeightAt( b.center.x, b.center.z, 10 );
						if ( top > p.y ) {

							p.y += dt * 1.6;
							if ( p.y > top - 1.0 ) {

								// step onto the deck
								const deck = WORLD.pier.deckHeight;
								p.set( b.center.x - Math.sign( b.center.x - WORLD.pier.x ) * 1.2, deck, b.center.z );
								this.mode = 'walk';
								this.velocity.set( 0, 0, 0 );

							}

						}

					}

					break;

				}

			}

		}

	}

	// ------------------------------------------------------------------ boat

	// step aboard from the pier / beach / water: onto the cockpit sole at the boarding point
	boardBoat() {

		const b = this.boat;
		this.mode = 'deck';
		this.deckPos.copy( b.model.boardPoint );
		this.deckVel.set( 0, 0, 0 );
		// keep looking where you looked (relative to the boat)
		this.deckYaw = this.yaw - ( b.getYaw() + Math.PI );
		this.deckGrounded = true;
		this._ashore = null;
		this._ashoreT = 0;
		this.velocity.set( 0, 0, 0 );
		this._camY = null;
		this.deckToWorld();

	}

	// sit down at the helm and drive (the old "enter boat")
	takeHelm() {

		this.mode = 'boat';
		this.boat.driven = true;
		this.boat.moored = false;
		this.helmYaw = 0;
		this.helmPitch = - 0.05;
		this.orbitYaw = this.boat.getYaw() + Math.PI;
		this.camInit = false;
		if ( this.audio ) this.audio.engineStart();

	}

	// get up from the helm: stand beside the seat, looking forward
	leaveHelm() {

		const b = this.boat;
		b.driven = false;
		b.throttle = 0;
		this.mode = 'deck';
		const hp = helmOf( b );
		this.deckPos.set( hp.x + 0.45, helmDeck( b ), hp.z - 0.1 );
		this.deckVel.set( 0, 0, 0 );
		this.deckYaw = this.helmYaw;
		this.pitch = this.helmPitch;
		this.deckGrounded = true;
		this._camY = null;
		if ( this.audio ) this.audio.engineStop();
		this.deckToWorld();

	}

	// enterBoat() kept for callers: straight to the helm
	enterBoat() {

		this.boardBoat();
		this.takeHelm();

	}

	// target: an ashoreTarget() spot; side: +1 / -1 jumps overboard on the starboard / port side
	exitBoat( target = null, side = 0 ) {

		const b = this.boat;
		const wasDriving = b.driven;
		b.driven = false;
		b.throttle = 0;
		// the exit point closest to something walkable (pier deck / sand)
		let best = side ? null : this.ashoreTarget();

		// (the pier head, or the dock at Pons Cove)
		// moor at whichever dock is close (home, Pons, Gull Rock, Saltmarsh Key)
		let dock = b.dockPosition ? b.dockPosition() : WORLD.boatDock.position;
		for ( const port of WORLD.ports || [ { dock: WORLD.pons.dock } ] ) if ( port.dock && b.position.distanceTo( port.dock.position ) < 14 ) dock = port.dock.position;
		if ( b.position.distanceTo( dock ) < 14 && b.speed < 1.5 ) {

			b.moored = true;
			b.mooring.anchor.set( b.position.x, 0, b.position.z );
			b.mooring.heading = b.getYaw();

		}

		if ( target ) best = target;
		if ( best ) {

			this.position.set( best.out.x, best.g, best.out.z );
			this.mode = 'walk';

		} else {

			const beam = b.model.dimensions ? b.model.dimensions.beam : 2.9;
			const w = b.toWorld( new THREE.Vector3( ( beam * 0.5 + 0.8 ) * ( side || 1 ), 0, 0 ), new THREE.Vector3() );
			// (the boat floats at the water line: the walker's water height is stale while aboard)
			this.waterH = this.waterMean = b.position.y;
			this.position.set( w.x, b.position.y - 0.2, w.z );
			this.mode = 'swim';
			if ( this.audio ) this.audio.splash( 0.8, this.position );

		}

		this.velocity.set( 0, 0, 0 );
		this.yaw = b.getYaw() + Math.PI;
		this._camY = null;
		if ( this.audio && wasDriving ) this.audio.engineStop();

	}

	// best walkable spot next to the boat (pier deck / sand / shallows), or null. Looks straight out
	// from the rail at each exit point (square to the hull, a few reaches: the boat swings on its
	// mooring) for ground from a little below the rail up to a pier deck a climb above it.
	ashoreTarget() {

		const b = this.boat;
		const water = this.query.cpuValid ? this.query.cpu[ 0 ] : 0;
		// the boat's starboard (local +x) direction in the world, level
		const sx = _v2.set( 1, 0, 0 ).applyQuaternion( b.quaternion ).setY( 0 ).normalize();
		const rx = sx.x, rz = sx.z;
		let best = null, bestScore = Infinity;
		for ( const ep of b.model.exitPoints ) {

			const w = b.toWorld( ep, new THREE.Vector3() );
			const sgn = Math.sign( ep.x ) || 1;
			// (a boat stops a few metres off a beach: the far reaches land in the shallows, where the walker wades)
			for ( const reach of [ 0.9, 1.4, 2.0, 2.8, 3.8, 5.0 ] ) {

				const out = new THREE.Vector3( w.x + rx * sgn * reach, w.y, w.z + rz * sgn * reach );
				const g = this.groundAt( out.x, out.z, w.y + 2.5 );
				const up = g - w.y;
				if ( up > 1.7 || up < - 1.6 || g < water - 0.9 ) continue;
				const score = Math.abs( up ) + Math.max( 0, water - g ) * 0.5 + reach * 0.2;
				if ( score < bestScore ) { bestScore = score; best = { out, g, ep }; }

			}

		}

		return best;

	}

	// ------------------------------------------------------------------ deck

	// camera base orientation on the boat: its heading, with roll and pitch half stabilised
	deckBase( out ) {

		const b = this.boat;
		_qa.setFromAxisAngle( _yAxis, b.getYaw() + Math.PI );
		_qb.copy( b.quaternion ).multiply( _qc.setFromAxisAngle( _yAxis, Math.PI ) );
		return out.slerpQuaternions( _qb, _qa, this.reduceMotion ? 0.85 : 0.55 );

	}

	// world position / heading of the player from the deck state (feet)
	deckToWorld() {

		const b = this.boat;
		b.toWorld( this.deckPos, this.position );
		this.yaw = b.getYaw() + Math.PI + this.deckYaw;

	}

	// highest walkable box top under the point (boat frame), not above maxY; the sole otherwise
	deckGroundAt( x, z, maxY ) {

		const L = this.boat.model.lines;
		let g = L.deckY;
		for ( const c of this.boat.model.colliders ) {

			if ( ! c.walkable ) continue;
			if ( Math.abs( x - c.center.x ) > c.half.x || Math.abs( z - c.center.z ) > c.half.z ) continue;
			const top = c.center.y + c.half.y;
			if ( top <= maxY && top > g ) g = top;

		}

		return g;

	}

	updateDeck( dt ) {

		const inp = this.input;
		const b = this.boat;
		const L = b.model.lines;
		const look = inp.consumeLook();
		this.deckYaw -= look.x * 0.0022;
		this.pitch = THREE.MathUtils.clamp( this.pitch - look.y * 0.0022, - 1.5, 1.5 );
		if ( inp.hit( 'KeyV' ) ) this.toggleView();
		this.armDist = THREE.MathUtils.clamp( this.armDist * ( 1 + inp.consumeWheel() * 0.1 ), ARM.min, ARM.max );

		// movement in the boat frame (camera base looks along +Z at deckYaw 0)
		const sy = Math.sin( this.deckYaw ), cy = Math.cos( this.deckYaw );
		_fwd.set( sy, 0, cy );
		_right.set( - cy, 0, sy );
		_wish.set( 0, 0, 0 );
		if ( inp.down( 'KeyW' ) ) _wish.add( _fwd );
		if ( inp.down( 'KeyS' ) ) _wish.sub( _fwd );
		if ( inp.down( 'KeyD' ) ) _wish.add( _right );
		if ( inp.down( 'KeyA' ) ) _wish.sub( _right );
		if ( _wish.lengthSq() > 0 ) _wish.normalize();
		const speed = ( inp.down( 'ShiftLeft' ) ? 2.6 : 1.6 );
		const k = 1 - Math.exp( - 12 * dt );
		const v = this.deckVel;
		v.x += ( _wish.x * speed - v.x ) * k;
		v.z += ( _wish.z * speed - v.z ) * k;
		if ( this.deckGrounded && inp.hit( 'Space' ) ) {

			v.y = 3.2;
			this.deckGrounded = false;

		}

		v.y -= 9.81 * dt;
		const p = this.deckPos;
		const oldX = p.x, oldZ = p.z;
		p.addScaledVector( v, dt );

		// walls: push out of the solid boxes you can't step onto (boat frame, axis aligned)
		for ( let iter = 0; iter < 2; iter ++ ) for ( const c of b.model.colliders ) {

			if ( ! c.solid ) continue;
			const top = c.center.y + c.half.y, bot = c.center.y - c.half.y;
			if ( top <= p.y + DECK_STEP || bot >= p.y + HEIGHT ) continue;
			const ex = c.half.x + DECK_RADIUS, ez = c.half.z + DECK_RADIUS;
			const dx = p.x - c.center.x, dz = p.z - c.center.z;
			if ( Math.abs( dx ) >= ex || Math.abs( dz ) >= ez ) continue;
			const px = ex - Math.abs( dx ), pz = ez - Math.abs( dz );
			if ( px < pz ) { p.x += Math.sign( dx || ( oldX - c.center.x ) || 1 ) * px; v.x = 0; }
			else { p.z += Math.sign( dz || ( oldZ - c.center.z ) || 1 ) * pz; v.z = 0; }

		}

		// stay inside the hull (the bulwarks, plus a margin fore and aft)
		p.z = THREE.MathUtils.clamp( p.z, L.zAft + L.shell + DECK_RADIUS, L.zFore ?? 4.0 );
		const halfIn = Math.max( 0.15, L.halfBreadth( L.tAtSheerZ( p.z ), Math.max( p.y, L.deckY ) ) - L.shell - DECK_RADIUS );
		p.x = THREE.MathUtils.clamp( p.x, - halfIn, halfIn );

		const g = this.deckGroundAt( p.x, p.z, p.y + DECK_STEP );
		if ( p.y <= g ) {

			p.y = g;
			if ( v.y < 0 ) v.y = 0;
			this.deckGrounded = true;

		} else this.deckGrounded = p.y - g < 0.04;

		// footsteps on the deck
		const moved = Math.hypot( p.x - oldX, p.z - oldZ );
		if ( this.deckGrounded ) {

			this.bob += moved * 2.4;
			this.stepDist += moved;
			if ( this.stepDist > 0.6 ) {

				this.stepDist = 0;
				if ( this.audio ) this.audio.footstep( 'wood' );

			}

		}

		this.deckToWorld();

		// prompts: take the helm, or step ashore
		const hp = helmOf( b );
		const hx = hp.x, hz = hp.z;
		const nearHelm = Math.hypot( p.x - hx, p.z - hz ) < HELM_REACH && ! this.busy;
		this._ashoreT -= dt;
		if ( this._ashoreT <= 0 ) {

			this._ashoreT = 0.25;
			this._ashore = b.speed < 2.5 ? this.ashoreTarget() : null;

		}

		const seat = this.nearSeat( p );
		if ( nearHelm ) {

			this.prompt = { key: 'E', text: 'Take the helm' };
			if ( inp.hit( 'KeyE' ) ) {

				this.takeHelm();
				return;

			}

		} else if ( seat && ! this.busy ) {

			this.prompt = { key: 'E', text: 'Sit down' };
			if ( inp.hit( 'KeyE' ) ) {

				this.sitDown( seat );
				return;

			}

		} else if ( ! this.busy ) {

			// at the rail: step ashore where there is ground on that side, else jump into the sea
			const ep = this._ashore && this._ashore.ep;
			const atRail = b.model.exitPoints.some( ( e ) => Math.hypot( p.x - e.x, p.z - e.z ) < 1.3 );
			if ( ep && Math.hypot( p.x - ep.x, p.z - ep.z ) < 1.3 ) {

				this.prompt = { key: 'E', text: 'Step ashore' };
				if ( inp.hit( 'KeyE' ) ) {

					this.exitBoat( this._ashore );
					return;

				}

			} else if ( atRail ) {

				this.prompt = { key: 'E', text: 'Jump overboard' };
				if ( inp.hit( 'KeyE' ) ) {

					this.exitBoat( null, Math.sign( p.x ) || 1 );
					return;

				}

			}

		}

		// camera: eye above the feet, following the boat's motion (third person: the spring arm
		// hangs off the boat-relative heading)
		if ( this.view === 'third' ) {

			this.deckBase( _q );
			const saveYaw = this.yaw;
			this.yaw = this.deckYaw;
			this.springArm( dt, this.position, _q );
			this.yaw = saveYaw;
			return;

		}

		const eyeL = _v.set( p.x, p.y + EYE + Math.sin( this.bob ) * 0.02, p.z );
		b.toWorld( eyeL, this.camera.position );
		this._camY = this.camera.position.y;
		this.deckBase( _q );
		this.camera.quaternion.copy( _q ).multiply( _qa.setFromEuler( _e.set( this.pitch, this.deckYaw, 0 ) ) );

	}

	// ------------------------------------------------------------------ piloting (a vehicle simulated elsewhere)

	// v: { quaternion, toWorld( [ x, y, z ], out ) (model frame -> world), seat, eye ([ x, y, z ] model frame, +Z forward),
	//      drive( dt ) (its controls and physics, run before the camera), exit() (E: the owner decides and calls
	//      exitVehicle), prompt() -> text | null, focus (model point the chase camera looks at), chase (arm length) }
	enterVehicle( v ) {

		if ( ! v ) return false;
		this.vehicle = v;
		this.mode = 'plane';
		this.velocity.set( 0, 0, 0 );
		this.helmYaw = 0;
		this.helmPitch = - 0.08; // the cockpit eye looks a touch down: the water ahead over the glare shield, the panel below
		this.orbitYaw = ( v.heading ? v.heading() : 0 ) + Math.PI;
		this.orbitPitch = 0.14;
		this.planeDist = v.chase || 17;
		this.camInit = false;
		this.armInit = false;
		this._camY = null;
		this.action = 'seated';
		return true;

	}

	// out of the vehicle at a world point: 'walk' (jetty, beach) or 'swim' (waterY: the water level there)
	exitVehicle( x, y, z, yaw = this.yaw, mode = 'walk', waterY = null ) {

		this.vehicle = null;
		this.mode = mode === 'swim' ? 'swim' : 'walk';
		this.position.set( x, y, z );
		this.velocity.set( 0, 0, 0 );
		if ( waterY !== null ) this.waterH = this.waterMean = waterY;
		this.yaw = yaw;
		this.pitch = - 0.05;
		this.action = null;
		this.armInit = false;
		this.camInit = false;
		this._camY = null;

	}

	updatePlane( dt ) {

		const inp = this.input, v = this.vehicle;
		const look = inp.consumeLook();
		const wheel = inp.consumeWheel();
		if ( inp.hit( 'KeyV' ) ) this.setView( this.view === 'third' ? 'first' : 'third' );
		if ( inp.hit( 'KeyE' ) && v.exit && v.exit() !== false && this.mode !== 'plane' ) return;
		if ( v.drive ) v.drive( dt );
		if ( this.mode !== 'plane' || this.vehicle !== v ) return; // the drive ended the flight (a crash)
		const text = v.prompt ? v.prompt() : null;
		this.prompt = text ? { key: 'E', text } : null;
		// the body rides along (audio, queries, the minimap)
		v.toWorld( v.seat, this.position );

		if ( this.view === 'first' ) {

			// the pilot's head turns in the cockpit frame
			this.helmYaw = THREE.MathUtils.clamp( this.helmYaw - look.x * 0.0022, - 2.4, 2.4 );
			this.helmPitch = THREE.MathUtils.clamp( this.helmPitch - look.y * 0.0022, - 1.2, 1.1 );
			v.toWorld( v.eye, this.camera.position );
			this._camY = this.camera.position.y;
			_q.setFromAxisAngle( _yAxis, Math.PI );
			this.camera.quaternion.copy( v.quaternion ).multiply( _q ).multiply( _qa.setFromEuler( _e.set( this.helmPitch, this.helmYaw, 0 ) ) );
			return;

		}

		// chase camera: swings in behind the heading (faster with speed), mouse orbits, the wheel sets the distance
		this.orbitYaw -= look.x * 0.003;
		this.orbitPitch = THREE.MathUtils.clamp( this.orbitPitch + look.y * 0.003, - 0.35, 1.2 );
		this.planeDist = THREE.MathUtils.clamp( ( this.planeDist || 17 ) * ( 1 + wheel * 0.08 ), 8, 60 );
		const fwd = _fwd.set( 0, 0, 1 ).applyQuaternion( v.quaternion );
		const speed = v.speed ? v.speed() : 0;
		if ( Math.abs( look.x ) < 0.5 && speed > 1 ) {

			let d = Math.atan2( fwd.x, fwd.z ) + Math.PI - this.orbitYaw;
			d = Math.atan2( Math.sin( d ), Math.cos( d ) );
			this.orbitYaw += d * ( 1 - Math.exp( - dt * Math.min( 3, 0.6 + speed * 0.08 ) ) );

		}

		const f = v.focus || [ 0, 2.2, 0 ];
		const target = v.toWorld( f, _v2 );
		// the arm follows a third of the plane's pitch: in a climb or a dive the horizon stays on screen
		const pitch = this.orbitPitch - ( Math.abs( look.y ) < 0.5 ? Math.asin( THREE.MathUtils.clamp( fwd.y, - 1, 1 ) ) * 0.35 : 0 );
		const want = _v.set( Math.sin( this.orbitYaw ) * Math.cos( pitch ), Math.sin( pitch ), Math.cos( this.orbitYaw ) * Math.cos( pitch ) ).multiplyScalar( this.planeDist ).add( target );
		const floor = Math.max( v.seaLevel ? v.seaLevel() : this.waterH, this.terrain.heightAt( want.x, want.z ) ) + 0.8;
		want.y = Math.max( want.y, floor );
		if ( ! this.camInit ) {

			this.camPos.copy( want );
			this.camInit = true;

		}

		// stiff enough to keep up at 40 m/s without the plane sliding out of the frame
		this.camPos.lerp( want, 1 - Math.exp( - dt * 10 ) );
		this.camPos.y = Math.max( this.camPos.y, floor );
		this.camera.position.copy( this.camPos );
		this._camY = this.camera.position.y;
		// aim above the plane so it sits in the lower third with the sky and the horizon over it
		target.y += this.camPos.distanceTo( target ) * 0.19;
		this.camera.lookAt( target );

	}

	// ------------------------------------------------------------------ riding (multiplayer guest)

	// seated on another player's boat: the pose comes from the host boat each frame (App sets this.ride);
	// free look, the spring arm or the eye above the seat
	updateRide( dt ) {

		const inp = this.input, r = this.ride;
		this.mode = 'ride';
		const look = inp.consumeLook();
		this.yaw -= look.x * 0.0022;
		this.pitch = THREE.MathUtils.clamp( this.pitch - look.y * 0.0022, - 1.5, 1.5 );
		if ( inp.hit( 'KeyV' ) ) this.toggleView();
		this.armDist = THREE.MathUtils.clamp( this.armDist * ( 1 + inp.consumeWheel() * 0.1 ), ARM.min, ARM.max );
		this.position.set( r.position.x, r.position.y, r.position.z );
		this.velocity.set( 0, 0, 0 );
		if ( this.view === 'third' ) {

			this.springArm( dt, this.position, null );
			return;

		}

		this.camera.position.set( r.position.x, r.position.y + 1.15, r.position.z );
		this._camY = this.camera.position.y;
		this.camera.quaternion.setFromEuler( _e.set( this.pitch, this.yaw, 0 ) );

	}

	// ------------------------------------------------------------------ seats

	// the passenger seat (boat frame) within reach of a deck position, or null
	nearSeat( p ) {

		const b = this.boat;
		const spec = b && BOATS[ b.model.id ];
		if ( ! spec || ! spec.seats ) return null;
		for ( const s of spec.seats ) if ( Math.hypot( p.x - s.x, p.z - s.z ) < 0.9 ) return s;
		return null;

	}

	sitDown( seat ) {

		this.mode = 'seat';
		this.seat = seat;
		this.deckPos.set( seat.x, this.boat.model.lines.deckY, seat.z );
		this.deckVel.set( 0, 0, 0 );
		this.deckYaw = seat.yaw;
		this.pitch = - 0.05;
		this.armInit = false;
		this._camY = null;
		this.action = 'sitDown';
		this.deckToWorld();

	}

	standUp() {

		const s = this.seat;
		this.mode = 'deck';
		this.deckPos.set( s.x - Math.sin( s.yaw ) * 0.5, this.boat.model.lines.deckY, s.z - Math.cos( s.yaw ) * 0.5 );
		this.deckVel.set( 0, 0, 0 );
		this.deckGrounded = true;
		this.seat = null;
		this.action = null;
		this._camY = null;
		this.deckToWorld();

	}

	// sitting: the view turns, the body stays put; E stands up (not with a line out)
	updateSeat( dt ) {

		const inp = this.input, b = this.boat;
		const look = inp.consumeLook();
		this.deckYaw -= look.x * 0.0022;
		this.pitch = THREE.MathUtils.clamp( this.pitch - look.y * 0.0022, - 1.5, 1.5 );
		if ( inp.hit( 'KeyV' ) ) this.toggleView();
		this.armDist = THREE.MathUtils.clamp( this.armDist * ( 1 + inp.consumeWheel() * 0.1 ), ARM.min, ARM.max );
		this.deckPos.set( this.seat.x, b.model.lines.deckY, this.seat.z );
		this.deckToWorld();
		// once sat down the seated loop holds (the game may override with fishing actions)
		if ( this.action === 'sitDown' && this._seatT === undefined ) this._seatT = 0;
		if ( this._seatT !== undefined ) {

			this._seatT += dt;
			if ( this._seatT > 1.2 ) {

				this.action = 'seated';
				this._seatT = undefined;

			}

		}

		this.prompt = this.busy ? null : { key: 'E', text: 'Stand up' };
		if ( inp.hit( 'KeyE' ) && ! this.busy ) {

			this.standUp();
			return;

		}

		this.deckBase( _q );
		if ( this.view === 'third' ) {

			const saveYaw = this.yaw;
			this.yaw = this.deckYaw;
			this.springArm( dt, this.position, _q );
			this.yaw = saveYaw;
			return;

		}

		const eyeL = _v.set( this.seat.x, b.model.lines.deckY + 1.15, this.seat.z );
		b.toWorld( eyeL, this.camera.position );
		this._camY = this.camera.position.y;
		this.camera.quaternion.copy( _q ).multiply( _qa.setFromEuler( _e.set( this.pitch, this.deckYaw, 0 ) ) );

	}

	updateBoat( dt ) {

		const inp = this.input;
		const b = this.boat;
		const look = inp.consumeLook();
		const wheel = inp.consumeWheel();

		if ( inp.hit( 'KeyV' ) ) this.setView( this.camMode === 'first' ? 'third' : 'first' );
		// stopped next to a pier or a beach: E steps straight ashore (the deck walk was a fiddle on a phone), Q keeps the deck
		this._ashoreT -= dt;
		if ( this._ashoreT <= 0 ) {

			this._ashoreT = 0.25;
			this._ashore = b.speed < 2.5 ? this.ashoreTarget() : null;

		}

		this.helmAshore = !! this._ashore;
		if ( inp.hit( 'KeyE' ) ) {

			if ( this._ashore ) this.exitBoat( this._ashore );
			else this.leaveHelm();
			return;

		}

		if ( this._ashore && inp.hit( 'KeyQ' ) ) {

			this.leaveHelm();
			return;

		}

		let throttle = 0;
		if ( inp.down( 'KeyW' ) ) throttle = inp.down( 'ShiftLeft' ) ? 1 : 0.7;
		if ( inp.down( 'KeyS' ) ) throttle = - 0.6;
		let steer = 0;
		if ( inp.down( 'KeyA' ) ) steer += 1;
		if ( inp.down( 'KeyD' ) ) steer -= 1;
		b.setInput( throttle, steer, dt );
		this.prompt = this._ashore ? { key: 'E', text: 'Step ashore   ·   Q  deck   ·   V  camera' } : { key: 'E', text: 'Leave helm   ·   V  camera' };

		// keep the player attached (for audio / queries)
		b.toWorld( b.model.helmEye, this.position );
		this.position.y -= EYE;

		if ( this.camMode === 'first' ) {

			this.helmYaw = THREE.MathUtils.clamp( this.helmYaw - look.x * 0.0022, - 2.2, 2.2 );
			this.helmPitch = THREE.MathUtils.clamp( this.helmPitch - look.y * 0.0022, - 1.2, 1.0 );
			const eye = b.toWorld( b.model.helmEye, new THREE.Vector3() );
			this.camera.position.copy( eye );
			// head partially stabilises against roll and pitch (feels natural, less nausea)
			const boatQ = b.quaternion;
			const yawOnly = new THREE.Quaternion().setFromAxisAngle( new THREE.Vector3( 0, 1, 0 ), b.getYaw() + Math.PI );
			const base = new THREE.Quaternion().slerpQuaternions( boatQ.clone().multiply( new THREE.Quaternion().setFromAxisAngle( new THREE.Vector3( 0, 1, 0 ), Math.PI ) ), yawOnly, this.reduceMotion ? 0.85 : 0.55 );
			const local = new THREE.Quaternion().setFromEuler( _e.set( this.helmPitch, this.helmYaw, 0 ) );
			this.camera.quaternion.copy( base ).multiply( local );

		} else {

			this.orbitYaw -= look.x * 0.003;
			this.orbitPitch = THREE.MathUtils.clamp( this.orbitPitch + look.y * 0.003, - 0.05, 1.2 );
			this.orbitDist = THREE.MathUtils.clamp( this.orbitDist * ( 1 + wheel * 0.08 ), 6, 40 );
			// gently swing behind the boat when moving
			if ( b.speed > 2 && Math.abs( look.x ) < 0.5 ) {

				const behind = b.getYaw() + Math.PI;
				let d = behind - this.orbitYaw;
				d = Math.atan2( Math.sin( d ), Math.cos( d ) );
				this.orbitYaw += d * ( 1 - Math.exp( - dt * 0.8 ) );

			}

			const target = b.toWorld( new THREE.Vector3( 0, 1.4, 0 ), new THREE.Vector3() );
			const off = new THREE.Vector3(
				Math.sin( this.orbitYaw ) * Math.cos( this.orbitPitch ),
				Math.sin( this.orbitPitch ),
				Math.cos( this.orbitYaw ) * Math.cos( this.orbitPitch )
			).multiplyScalar( this.orbitDist );
			const want = target.clone().add( off );
			want.y = Math.max( want.y, this.waterH + 0.7 );
			if ( ! this.camInit ) {

				this.camPos.copy( want );
				this.camInit = true;

			}

			this.camPos.lerp( want, 1 - Math.exp( - dt * 6 ) );
			this.camera.position.copy( this.camPos );
			this.camera.lookAt( target );

		}

	}

}
