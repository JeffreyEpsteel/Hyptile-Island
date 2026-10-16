// Wave 25C: camera and movement on the CPU (node, no GPU): the look slew and the gamepad curve, the spring arm's sphere cast
// (walls, trunks, low things, roofs, the ships' hulls, your own boat's cabin), the step smoothing on stairs and ladders, the
// swim stroke and the waterline crossing, the body's turn in place and the start / stop lean.
//   node test/camera-rig.mjs
import * as E from '../src/engine/index.js';
import { Colliders } from '../src/world/Colliders.js';
import { Player } from '../src/player/Player.js';
import { Avatar } from '../src/player/Avatar.js';
import { AnimGraph } from '../src/player/anim/AnimGraph.js';
import DEF from '../src/player/anim/AnimDef.js';
import { LookSlew, LOOK, sweepArm, rayPrism, hullCameraBlocker, StepSmoother, STEP } from '../src/player/CameraRig.js';
import { registerShell, clearShells } from '../src/world/interiors/Shells.js';
import { placeShape, shapeFromDims } from '../src/world/boat/HullShape.js';
import { CameraFeel } from '../src/game/CameraFeel.js';

let fails = 0;
const check = ( ok, msg ) => {

	console.log( ( ok ? 'ok   ' : 'FAIL ' ) + msg );
	if ( ! ok ) fails ++;

};

const V = ( x, y, z ) => new E.Vector3( x, y, z );
const DT = 1 / 60;

// ------------------------------------------------------------------------------------------------ look slew
{

	const s = new LookSlew();
	// a flick of 100 counts in one frame: settles over ~70 ms and nothing is lost
	let applied = s.step( DT, { x: 100, y: 0 } ).x;
	const first = applied;
	let t90 = 0;
	for ( let i = 1; i < 30; i ++ ) {

		applied += s.step( DT, { x: 0, y: 0 } ).x;
		if ( ! t90 && applied >= 90 ) t90 = i * DT;

	}

	check( first > 20 && first < 60, `slew: the first frame of a flick applies ${ first.toFixed( 1 ) } of 100 (not 0, not all)` );
	check( t90 >= 0.04 && t90 <= 0.09, `slew: 90 % of a flick is applied after ${ ( t90 * 1000 ).toFixed( 0 ) } ms (60-90 ms)` );
	check( Math.abs( applied - 100 ) < 0.05, `slew: the whole flick arrives (${ applied.toFixed( 3 ) } of 100)` );
	// the same flick at 144 fps and 30 fps: the same time to settle
	for ( const hz of [ 30, 144 ] ) {

		const q = new LookSlew(), dt = 1 / hz;
		let a = q.step( dt, { x: 100, y: 0 } ).x, tt = 0;
		for ( let i = 1; i < hz; i ++ ) { a += q.step( dt, { x: 0, y: 0 } ).x; if ( ! tt && a >= 90 ) tt = i * dt; }
		check( Math.abs( tt - t90 ) < 0.03, `slew: ${ hz } fps settles in ${ ( tt * 1000 ).toFixed( 0 ) } ms as 60 fps does` );

	}

	check( new LookSlew( 0 ).step( DT, { x: 7, y: - 3 } ).x === 7, 'slew: tau 0 is the raw input' );

	// the gamepad: the pad share is per second (the same sweep at any frame rate), and a soft start
	const sweep = ( hz ) => {

		const q = new LookSlew( 0 ), dt = 1 / hz;
		let total = 0, firstFrame = 0;
		for ( let i = 0; i < hz; i ++ ) {

			// the pad adds ( 11 counts per frame at 60 Hz ) every frame at a full tilt
			const o = q.step( dt, { x: 11, y: 0, padX: 11, padY: 0, pad: 1 } );
			if ( i === 0 ) firstFrame = o.x;
			total += o.x;

		}

		return { total, firstFrame };

	};

	const a60 = sweep( 60 ), a144 = sweep( 144 ), a30 = sweep( 30 );
	check( Math.abs( a144.total - a60.total ) / a60.total < 0.02 && Math.abs( a30.total - a60.total ) / a60.total < 0.03, `pad: one second of full tilt turns the same at 30 / 60 / 144 fps (${ a30.total.toFixed( 0 ) } / ${ a60.total.toFixed( 0 ) } / ${ a144.total.toFixed( 0 ) } counts)` );
	check( a60.firstFrame < 11 * 0.7, `pad: a soft start (the first frame of a push is ${ ( a60.firstFrame / 11 * 100 ).toFixed( 0 ) } % of the full rate)` );
	// a mouse flick next to a held pad is slewed alone
	const mix = new LookSlew();
	const m1 = mix.step( DT, { x: 50 + 5, y: 0, padX: 5, padY: 0, pad: 0.5 } );
	check( m1.x < 50 * 0.6 + 5 * 1, 'pad: the mouse part of a mixed frame is slewed, the pad part is not' );

}

// ------------------------------------------------------------------------------------------------ the sphere cast
{

	const col = new Colliders();
	// a wall across z = -5 (x -3..3, y 0..4), a tree trunk at ( 10, 0 ) r 0.3, a low barrel at ( 0, 10 ) top 0.4
	col.addBox( V( 0, 2, - 5 ), V( 3, 2, 0.15 ), 0, { tag: 'wall' } );
	col.addCylinder( 10, 0, 0.3, 0, 6, { tag: 'trunk' } );
	col.addCylinder( 0, 10, 0.4, 0, 0.4, { tag: 'barrel' } );
	col.addCylinder( 20, 0, 0.06, 0, 3, { tag: 'pole' } );
	const w = { colliders: col, boat: null, blockers: [], feetY: 0 };
	const cast = ( o, d, len, r ) => sweepArm( w, o[ 0 ], o[ 1 ], o[ 2 ], d[ 0 ], d[ 1 ], d[ 2 ], len, r );
	const hWall = cast( [ 0, 2, 0 ], [ 0, 0, - 1 ], 9, 0.22 );
	check( Math.abs( hWall - ( 5 - 0.15 - 0.22 ) ) < 0.02, `cast: a wall 5 m ahead stops the sphere at ${ hWall.toFixed( 2 ) } m (4.63 = wall face minus radius)` );
	const hTree = cast( [ 0, 1.5, 0 ], [ 1, 0, 0 ], 14, 0.22 );
	check( Math.abs( hTree - ( 10 - 0.3 - 0.22 ) ) < 0.02, `cast: a trunk stops it at ${ hTree.toFixed( 2 ) } m (9.48)` );
	check( cast( [ 0, 1.5, 0.45 ], [ 1, 0, 0 ], 14, 0.22 ) < 14, 'cast: a trunk whose edge the sphere grazes (0.45 m off the axis, r 0.3 + 0.22) stops it' );
	check( cast( [ 0, 1.5, 0.6 ], [ 1, 0, 0 ], 14, 0.22 ) === 14, 'cast: a trunk 0.6 m off the axis lets it pass' );
	check( cast( [ 0, 1.5, 0 ], [ 0, 0, 1 ], 14, 0.22 ) === 14, 'cast: a low barrel (top 0.4 m) does not stop the arm' );
	check( cast( [ 8, 1.5, 0 ], [ 1, 0, 0 ], 14, 0.22 ) < 9, 'cast: from 2 m away a trunk still stops it' );
	check( cast( [ 18, 1.5, 0 ], [ 1, 0, 0 ], 5, 0.22 ) === 5, 'cast: a thin pole (r 0.06) does not stop the arm' );
	check( cast( [ 0, 2, - 4.9 ], [ 0, 0, - 1 ], 3, 0.22 ) === 3, 'cast: an origin already inside the grown wall does not collapse the arm' );
	check( cast( [ 0, 6, 0 ], [ 0, 0, - 1 ], 9, 0.22 ) === 9, 'cast: over the top of a wall nothing is hit' );

	// the roofs of the houses that open (their colliders stop at the eaves)
	clearShells();
	registerShell( 'hut', { x: 0, z: 30, yaw: 0.4, w: 5, d: 4, floorY: 0, h: 2.4, stories: 1, top: 4.2, colliders: [] } );
	const up = cast( [ 0, 1.2, 30 ], [ 0, 1, 0 ], 5, 0.22 );
	check( up > 0.8 && up < 1.2, `roofs: straight up inside a hut stops under the eave ((${ up.toFixed( 2 ) } m)` );
	check( cast( [ 0, 1.2, 30 ], [ 1, 0, 0 ], 10, 0.22 ) === 10, 'roofs: a horizontal arm at eye height is not blocked by the roof slab' );
	check( cast( [ 8, 5.5, 30 ], [ - 1, 0, 0 ], 10, 0.22 ) === 10, 'roofs: above the ridge nothing is hit' );
	const side = cast( [ 8, 3.2, 30 ], [ - 1, 0, 0 ], 10, 0.22 );
	check( side > 4 && side < 7, `roofs: an arm at roof height from the side stops at the slab (${ side.toFixed( 2 ) } m)` );
	clearShells();

	// the ships' hulls: a fake naval with one 20 x 6 hull, 30 m ahead, keel -1.2, sheer +2
	const shape = shapeFromDims( 20, 6 );
	const naval = { ships: [ { x: 0, z: 30, yaw: 0, pose: { y: 0 }, cls: { length: 20, beam: 6, draft: 1.2, sheer: 2 } } ], _hullShape: () => shape };
	const blk = hullCameraBlocker( naval, placeShape );
	const hHull = blk( 0, 1, 0, 0, 0, 1, 60, 0.22 );
	check( hHull > 15 && hHull < 25, `hulls: a ship's outline stops the arm at ${ hHull.toFixed( 1 ) } m (her bow is 20 m off)` );
	check( blk( 0, 5, 0, 0, 0, 1, 60, 0.22 ) === Infinity, 'hulls: over her sheer line the arm passes' );
	check( blk( 0, 1, 30, 0, 0, 1, 60, 0.22 ) === Infinity, 'hulls: standing in her outline (on her deck) the arm is not stopped by her' );
	check( blk( 12, 1, 0, 0, 0, 1, 60, 0.22 ) === Infinity, 'hulls: an arm that runs beside her (12 m off her axis) misses her' );
	const w2 = { colliders: col, boat: null, blockers: [ blk ], feetY: 0 };
	check( sweepArm( w2, 0, 1, 0, 0, 0, 1, 60 ) < 25, 'hulls: the blocker list is honoured by sweepArm' );
	// a provider that throws never breaks the camera
	check( sweepArm( { colliders: col, blockers: [ () => { throw new Error( 'x' ); } ], feetY: 0 }, 0, 1, 0, 0, 0, 1, 9 ) === 9, 'hulls: a failing provider is ignored' );

	// your own boat: a cabin box in her frame, the boat yawed 90 degrees at ( 40, 0, 0 )
	const q = new E.Quaternion().setFromAxisAngle( V( 0, 1, 0 ), Math.PI / 2 );
	const boat = { position: V( 40, 0, 0 ), quaternion: q, model: { colliders: [ { center: V( 0, 1.2, 2 ), half: V( 1, 1.2, 1 ), solid: true } ] } };
	// cabin centre at boat-local z = 2, yawed 90 deg about +y: local +z -> world +x, so it stands at ( 42, 1.2, 0 )
	const w3 = { colliders: col, boat, blockers: [], feetY: 0 };
	const hb = sweepArm( w3, 50, 1.5, 0, - 1, 0, 0, 20, 0.22 );
	check( Math.abs( hb - ( 50 - 42 - 1 - 0.22 ) ) < 0.03, `boat: the cabin box in the boat's own frame stops the arm at ${ hb.toFixed( 2 ) } m (6.78)` );
	check( sweepArm( w3, 50, 1.5, 6, - 1, 0, 0, 20, 0.22 ) === 20, 'boat: an arm that passes beside the cabin is not stopped' );

	// rayPrism by itself
	const sq = { n: 4, x: new Float64Array( [ 1, - 1, - 1, 1 ] ), z: new Float64Array( [ 1, 1, - 1, - 1 ] ), nx: new Float64Array( [ 0, - 1, 0, 1 ] ), nz: new Float64Array( [ 1, 0, - 1, 0 ] ) };
	check( Math.abs( rayPrism( sq, 0, 2, - 5, 1, 0, 1, 0, 0, 10, 0 ) - 4 ) < 1e-6, 'prism: a ray at a 2 m square hits its face at 4 m' );
	check( Math.abs( rayPrism( sq, 0, 2, - 5, 1, 0, 1, 0, 0, 10, 0.5 ) - 3.5 ) < 1e-6, 'prism: grown by the radius it hits 0.5 m sooner' );

}

// ------------------------------------------------------------------------------------------------ step smoothing
{

	const st = new StepSmoother();
	st.step( 0.36 );
	check( Math.abs( st.y + 0.36 ) < 1e-9, 'steps: a 0.36 m step up leaves the body 0.36 m below the capsule' );
	let n = 0;
	while ( st.active && n < 200 ) { st.update( DT ); n ++; }
	check( n < 30 && n > 8, `steps: the offset is gone after ${ n } frames (${ ( n * DT * 1000 ).toFixed( 0 ) } ms)` );
	st.step( 0.3 ); st.step( 0.3 ); st.step( 0.3 );
	check( st.y >= - STEP.maxOff - 1e-9, `steps: three steps in a row never trail the ground by more than ${ STEP.maxOff } m (${ st.y.toFixed( 2 ) })` );
	st.clear();
	st.carry( 1.2, 1.0, 0 );
	check( Math.hypot( st.x, st.y, st.z ) <= 1.8 + 1e-9 && st.y < 0, 'steps: a ladder\'s pop keeps the view where it was' );
	for ( let i = 0; i < 90; i ++ ) st.update( DT );
	check( ! st.active, 'steps: a ladder\'s pop is gone after 1.5 s' );

}

// ------------------------------------------------------------------------------------------------ Player on stairs, against walls, swimming
const terrain = { heightAt: () => 1, flat: true };
const colliders = new Colliders();
const water = { level: - 50 };
const query = {
	n: 0, cpu: new Float32Array( 64 ), cpuValid: true, allocate() { return 0; }, setPoint() {},
};
const camera = new E.PerspectiveCamera( 60, 2, 0.1, 5000 );
class InputStub {

	constructor() { this.keys = new Set(); this.pressed = new Set(); this.look = { x: 0, y: 0 }; this.wheel = 0; this.enabled = true; this.pad = null; }
	down( c ) { return this.keys.has( c ); }
	hit( c ) { return this.pressed.has( c ); }
	consumeLook() { const l = { ...this.look }; if ( this.pad ) Object.assign( l, this.pad ); this.look.x = this.look.y = 0; return l; }
	consumeWheel() { const w = this.wheel; this.wheel = 0; return w; }
	endFrame() { this.pressed.clear(); }

}

const input = new InputStub();
const player = new Player( { camera, input, terrain, colliders, query, boat: null } );
const setWater = ( y ) => { query.cpu[ 0 ] = y; };
setWater( - 50 );
const step = ( n = 1 ) => { for ( let i = 0; i < n; i ++ ) { player.update( DT ); input.endFrame(); } };

{

	// the look: constant mouse input turns by the counts x 0.0022, after the slew
	player.position.set( 0, 1, 0 );
	player.yaw = 0;
	player.pitch = 0;
	player.setView( 'first' );
	step( 5 );
	input.look.x = 100;
	step( 1 );
	const y1 = player.yaw;
	step( 29 );
	check( y1 < 0 && Math.abs( y1 ) < 100 * 0.0022 * 0.6, `player: the first frame of a 100-count flick turns ${ ( - y1 / ( 100 * 0.0022 ) * 100 ).toFixed( 0 ) } % of it` );
	check( Math.abs( player.yaw + 100 * 0.0022 ) < 1e-3, `player: the whole flick lands (${ player.yaw.toFixed( 4 ) } of ${ - 100 * 0.0022 } rad)` );
	player.setView( 'third' );

}

{

	// stairs: six treads 0.4 m deep, 0.28 m risers, east of the player, walkable boxes from the sand up
	const g = 1;
	for ( let i = 0; i < 6; i ++ ) {

		const top = g + 0.28 * ( i + 1 );
		colliders.addBox( V( 3 + 0.4 * i, ( top + g - 0.4 ) / 2, 0 ), V( 0.2, ( top - g + 0.4 ) / 2, 1 ), 0, { walkable: true, solid: true, tag: 'stairs' } );

	}

	player.position.set( 0, g, 0 );
	player.velocity.set( 0, 0, 0 );
	player.yaw = - Math.PI / 2; // faces +x
	player.pitch = - 0.05;
	step( 30 );
	const pose = { position: V( 0, 0, 0 ) };
	input.keys.add( 'KeyW' );
	let py = player.position.y, vy = player.pose( pose ).position.y, maxPhys = 0, maxVis = 0, maxLag = 0, camJump = 0, cy = camera.position.y;
	for ( let i = 0; i < 240 && player.position.x < 4.9; i ++ ) {

		step();
		const phys = player.position.y, vis = player.pose( pose ).position.y;
		maxPhys = Math.max( maxPhys, Math.abs( phys - py ) );
		maxVis = Math.max( maxVis, Math.abs( vis - vy ) );
		maxLag = Math.max( maxLag, phys - vis );
		if ( i > 30 ) camJump = Math.max( camJump, Math.abs( camera.position.y - cy ) );
		py = phys; vy = vis; cy = camera.position.y;

	}

	input.keys.delete( 'KeyW' );
	check( player.position.y > g + 1.0, `stairs: the player climbed to y ${ player.position.y.toFixed( 2 ) } (${ ( ( player.position.y - g ) / 0.28 ).toFixed( 0 ) } risers)` );
	check( maxPhys >= 0.2, `stairs: the capsule itself pops ${ maxPhys.toFixed( 2 ) } m in one frame (the thing the body must not show)` );
	check( maxVis < 0.1, `stairs: the body moves at most ${ maxVis.toFixed( 3 ) } m a frame (smoothed; the capsule: ${ maxPhys.toFixed( 2 ) })` );
	check( maxLag <= STEP.maxOff + 1e-6, `stairs: the body never trails the capsule by more than ${ maxLag.toFixed( 2 ) } m (limit ${ STEP.maxOff })` );
	check( camJump < 0.12, `stairs: the third-person camera moves at most ${ camJump.toFixed( 3 ) } m a frame while climbing` );
	step( 40 );
	check( Math.abs( player.pose( pose ).position.y - player.position.y ) < 0.01, 'stairs: at rest the body is on the capsule again' );

	// down the stairs: the feet stay on the treads, no fall
	player.yaw = Math.PI / 2;
	input.keys.add( 'KeyW' );
	let airborne = 0, maxDown = 0, ly = player.pose( pose ).position.y;
	for ( let i = 0; i < 400 && player.position.x > 2.3; i ++ ) {

		step();
		if ( ! player.grounded ) airborne ++;
		const vy2 = player.pose( pose ).position.y;
		maxDown = Math.max( maxDown, Math.abs( vy2 - ly ) );
		ly = vy2;

	}

	input.keys.delete( 'KeyW' );
	check( maxDown < 0.1, `stairs: going down the body moves at most ${ maxDown.toFixed( 3 ) } m a frame` );
	check( airborne === 0, `stairs: walking down the six treads is never airborne (${ airborne } frames)` );
	check( player.position.x < 2.5 && Math.abs( player.position.y - 1 ) < 0.05, `stairs: and ends on the sand (x ${ player.position.x.toFixed( 1 ) }, y ${ player.position.y.toFixed( 2 ) })` );
	// a jump still jumps
	step( 40 );
	input.pressed.add( 'Space' );
	step();
	check( player.velocity.y > 3 && ! player.grounded, 'stairs: a jump still leaves the ground' );
	step( 90 );

}

{

	// the spring arm: a wall 2.2 m behind the player, a tree 3 m behind, a barrel
	const lab = ( name, add, expectMax, expectMin = 0 ) => {

		const n0 = colliders.boxes.length, c0 = colliders.cylinders.length;
		add();
		player.position.set( - 20, 1, 0 );
		player.velocity.set( 0, 0, 0 );
		player.yaw = 0; // faces -z; the camera is behind, at +z
		player.pitch = - 0.05;
		player.armInit = false;
		step( 60 );
		const d = Math.hypot( camera.position.x - player.armPivot.x - 0.35, camera.position.z - player.armPivot.z );
		const dist = camera.position.distanceTo( player.armPivot );
		check( dist <= expectMax && dist >= expectMin, `arm: ${ name }: ${ dist.toFixed( 2 ) } m (limit ${ expectMin }..${ expectMax })` );
		colliders.boxes.length = n0; colliders.cylinders.length = c0;
		return dist;

	};

	const free = lab( 'open ground', () => {}, 5.2, 3.9 );
	lab( 'a wall 2.2 m behind', () => colliders.addBox( V( - 20, 3, 2.2 ), V( 4, 3, 0.2 ), 0, { tag: 'wall' } ), 2.0, 1.0 );
	lab( 'a trunk 3 m behind the pivot', () => colliders.addCylinder( - 19.65, 3.0, 0.3, 0, 8, { tag: 'trunk' } ), 3.0, 1.5 );
	lab( 'a barrel (top 0.4 m) behind', () => colliders.addCylinder( - 19.65, 2.0, 0.4, 0, 0.4, { tag: 'barrel' } ), 5.2, 3.9 );
	lab( 'a roof box overhead is no wall', () => colliders.addBox( V( - 20, 9, 3 ), V( 6, 0.3, 6 ), 0, { tag: 'roof' } ), 5.2, 3.9 );

	// out from behind a wall: the arm eases back out, it does not pop
	colliders.addBox( V( - 20, 3, 2.2 ), V( 4, 3, 0.2 ), 0, { tag: 'wall' } );
	player.position.set( - 20, 1, 0 ); player.yaw = 0; player.armInit = false;
	step( 60 );
	const closeD = camera.position.distanceTo( player.armPivot );
	colliders.boxes.pop();
	step( 1 );
	const d1 = camera.position.distanceTo( player.armPivot );
	step( 90 );
	const d2 = camera.position.distanceTo( player.armPivot );
	check( d1 - closeD < 0.5 && d2 > free - 0.3, `arm: out from behind a wall it eases out (${ closeD.toFixed( 2 ) } -> ${ d1.toFixed( 2 ) } after one frame -> ${ d2.toFixed( 2 ) })` );

	// a ship's hull registered as a provider stops it
	const shape = shapeFromDims( 12, 4 );
	const naval = { ships: [ { x: - 20, z: 5.5, yaw: 0, pose: { y: 0 }, cls: { length: 12, beam: 4, draft: 1, sheer: 8 } } ], _hullShape: () => shape };
	const off = player.addCameraBlocker( hullCameraBlocker( naval, placeShape ) );
	player.position.set( - 20, 1, - 4 ); player.yaw = 0; player.armInit = false;
	step( 60 );
	const dh = camera.position.distanceTo( player.armPivot );
	check( dh < 4.5, `arm: a hull 4 m behind the pivot shortens it to ${ dh.toFixed( 2 ) } m` );
	off();
	player.armInit = false;
	step( 60 );
	check( camera.position.distanceTo( player.armPivot ) > 3.8, 'arm: and the remover takes the provider away' );

	// the ground is probed in many steps: looking up from a dip, the arm goes under the hill's ground, not through it
	player.cameraBlockers.length = 0;

}

{

	// the sphere cast costs little with the real number of boxes (1,373 in the town)
	const big = new Colliders();
	for ( let i = 0; i < 1400; i ++ ) big.addBox( V( ( i % 40 ) * 7 - 140, 2, Math.floor( i / 40 ) * 7 - 120 ), V( 1.5, 2, 1.5 ), i * 0.3, { tag: 'house' } );
	for ( let i = 0; i < 2000; i ++ ) big.addCylinder( ( i % 50 ) * 5 - 125, Math.floor( i / 50 ) * 5 - 100, 0.3, 0, 6 );
	const w = { colliders: big, boat: null, blockers: [], feetY: 0 };
	const t0 = performance.now();
	let acc = 0;
	for ( let i = 0; i < 2000; i ++ ) acc += sweepArm( w, ( i % 97 ) - 40, 3, ( i % 53 ) - 30, Math.sin( i ), 0, Math.cos( i ), 5, 0.22 );
	const us = ( performance.now() - t0 ) / 2000 * 1000;
	check( us < 200, `cost: a cast against 1,400 boxes and 2,000 posts takes ${ us.toFixed( 0 ) } us (${ acc > 0 ? 'ok' : '' })` );

}

{

	// swimming: the stroke phase and the waterline crossings
	setWater( 0 );
	const wcol = colliders;
	player.cameraBlockers.length = 0;
	terrain.heightAt = () => - 12;
	player.position.set( 0, - 0.2, 0 );
	player.waterH = player.waterMean = 0;
	player.mode = 'swim';
	player.velocity.set( 0, 0, 0 );
	player.yaw = 0; player.pitch = 0;
	player.setView( 'first' );
	step( 60 );
	const seq0 = player.crossSeq;
	input.keys.add( 'KeyW' );
	const ph = [], roll = [];
	for ( let i = 0; i < 180; i ++ ) {

		step();
		ph.push( player.stroke );
		const e = new E.Euler().setFromQuaternion( camera.quaternion, 'YXZ' );
		roll.push( e.z );

	}

	input.keys.delete( 'KeyW' );
	const wraps = ph.filter( ( v, i ) => i && v < ph[ i - 1 ] ).length;
	const maxRoll = Math.max( ...roll.map( Math.abs ) );
	check( wraps >= 1 && ph.every( ( v ) => v >= 0 && v <= 1 ), `swim: ${ wraps } stroke cues in 3 s of swimming, the phase stays within 0..1` );
	check( maxRoll > 0.003 && maxRoll < 0.03, `swim: the camera rolls with the stroke (peak ${ ( maxRoll * 57.3 ).toFixed( 2 ) } deg)` );
	check( player.crossSeq === seq0, 'swim: no waterline crossing while the eye stays above the water' );
	// dive and surface
	player.pitch = - 0.9;
	input.keys.add( 'KeyW' );
	step( 120 );
	input.keys.delete( 'KeyW' );
	check( player.crossSeq > seq0 && player.waterCross && player.waterCross.dir === - 1, `swim: diving crosses the waterline (crossSeq ${ player.crossSeq }, dir ${ player.waterCross && player.waterCross.dir })` );
	player.pitch = 0;
	input.keys.add( 'Space' );
	step( 240 );
	input.keys.delete( 'Space' );
	check( player.waterCross && player.waterCross.dir === 1, `swim: coming up crosses it again (dir ${ player.waterCross && player.waterCross.dir })` );

	// CameraFeel reacts: a dip and an fov breath
	const app = { camera, player, settings: {}, ui: { s: { fov: 60 } } };
	const feel = new CameraFeel( app );
	feel._crossSeq = player.crossSeq;
	feel.update( DT );
	player.crossSeq ++; player.waterCross = { dir: - 1, speed: 1.5, t: 0 };
	camera.quaternion.identity();
	feel.update( DT );
	const f1 = camera.fov;
	for ( let i = 0; i < 6; i ++ ) feel.update( DT );
	check( camera.fov < 60 && f1 <= 60 && feel._dip, `water: a plunge closes the fov (${ camera.fov.toFixed( 2 ) }) and dips the view` );
	for ( let i = 0; i < 60; i ++ ) feel.update( DT );
	check( Math.abs( camera.fov - 60 ) < 1e-6 && ! feel._dip, 'water: and the fov and the dip settle back' );
	player.crossSeq ++; player.waterCross = { dir: 1, speed: 1, t: 0 };
	feel.update( DT ); feel.update( DT );
	check( camera.fov > 60, `water: surfacing opens it (${ camera.fov.toFixed( 2 ) })` );
	void wcol;

}

// ------------------------------------------------------------------------------------------------ the body
{

	// turn in place: the body follows the view's yaw with a lag standing, quickly while moving
	const fake = { _bodyYaw: null, _teleport: false, _rd: null };
	const face = ( pose, dt = DT ) => Avatar.prototype._faceYaw.call( fake, dt, pose );
	face( { mode: 'walk', yaw: 0, speed: 0, grounded: true } );
	let y = 0, t = 0;
	const trace = [];
	for ( let i = 0; i < 40; i ++ ) { y = face( { mode: 'walk', yaw: 1.5, speed: 0, grounded: true } ); trace.push( y ); if ( ! t && y > 1.35 ) t = ( i + 1 ) * DT; }
	check( trace[ 0 ] > 0 && trace[ 0 ] < 0.5, `turn: standing, the first frame of a 86 degree turn moves the body ${ ( trace[ 0 ] * 57.3 ).toFixed( 1 ) } degrees` );
	check( t > 0.12 && t < 0.4, `turn: the body is round (90 %) after ${ ( t * 1000 ).toFixed( 0 ) } ms` );
	check( Math.abs( y - 1.5 ) < 0.02, 'turn: and ends square to the view' );
	const rate = Math.max( ...trace.map( ( v, i ) => ( v - ( i ? trace[ i - 1 ] : 0 ) ) / DT ) );
	check( rate > 1.2 && rate <= 12.5 + 1e-9, `turn: the peak turn rate ${ rate.toFixed( 1 ) } rad/s trips the Turn clips (> 1.2) and stays under the cap` );
	// moving: nearly instant
	fake._bodyYaw = 0;
	const m = face( { mode: 'walk', yaw: 0.5, speed: 3, grounded: true } );
	check( m / 0.5 > 0.25 && m / 0.5 < 0.6, `turn: running, a 0.5 rad turn is ${ ( m / 0.5 * 100 ).toFixed( 0 ) } % applied in one frame (round in ~4 frames)` );
	// other modes and teleports are exact
	check( face( { mode: 'swim', yaw: 2.2, speed: 1 } ) === 2.2, 'turn: swimming follows the pose yaw exactly' );
	fake._teleport = true;
	check( face( { mode: 'walk', yaw: - 2.8, speed: 0, grounded: true } ) === - 2.8, 'turn: a teleport snaps' );
	fake._teleport = false;
	// wraps the short way round
	fake._bodyYaw = 3.0;
	const wy = face( { mode: 'walk', yaw: - 3.0, speed: 0, grounded: true } );
	check( wy > 3.0 && wy < 3.3, `turn: 3.0 -> -3.0 rad turns the short way (0.28 rad), not the long one (${ wy.toFixed( 3 ) })` );

	// the start / stop lean
	const g = { def: DEF, lean: 0, leanPitch: 0, _leanOn: true };
	const lean = ( ctx, n = 1 ) => { for ( let i = 0; i < n; i ++ ) AnimGraph.prototype._lean.call( g, DT, { turn: 0, speed: 3, ...ctx } ); return g.leanPitch; };
	const startLean = lean( { accel: 25 }, 12 );
	check( startLean > 0.05 && startLean <= DEF.lean.pitch.fwd + 1e-9, `lean: a start (25 m/s^2) leans forward ${ ( startLean * 57.3 ).toFixed( 1 ) } degrees` );
	lean( { accel: 0 }, 60 );
	check( g.leanPitch === 0 || Math.abs( g.leanPitch ) < 2e-3, 'lean: and comes upright when the push ends' );
	const stopLean = lean( { accel: - 60 }, 12 );
	check( stopLean < - 0.05 && stopLean >= - DEF.lean.pitch.back - 1e-9, `lean: a stop (-60 m/s^2) sits back ${ ( stopLean * 57.3 ).toFixed( 1 ) } degrees` );
	lean( { accel: 400 }, 30 );
	check( g.leanPitch <= DEF.lean.pitch.fwd + 1e-9, `lean: capped at ${ ( DEF.lean.pitch.fwd * 57.3 ).toFixed( 0 ) } degrees forward` );
	lean( { accel: 0 }, 90 );
	g.lean = 0;
	AnimGraph.prototype._lean.call( g, DT * 20, { turn: 0, speed: 3, accel: 0, accelSide: 40 } );
	check( g.lean < 0 && g.lean > - 0.1, `lean: a push to the right rolls the body toward the right (${ ( g.lean * 57.3 ).toFixed( 1 ) } degrees)` );
	g._leanOn = false;
	lean( { accel: 30 }, 60 );
	check( g.leanPitch === 0, 'lean: no lean in the air or in a montage (the state has no lean)' );

}

console.log( fails ? `\n${ fails } FAILED` : '\nall camera / movement checks pass' );
process.exit( fails ? 1 : 0 );
