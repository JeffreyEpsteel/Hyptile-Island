// Wave 25C play checks on Dawn: the camera and the walk in the whole App (what test/camera-rig.mjs cannot see: the real colliders,
// the real avatar, the real water). Boots like tools/visuals/playcheck.mjs, plays through the game's own input at 60 fps.
//
//   node tools/camera25c/playcheck.mjs --dawn=<dir> [--only=tree,stairs,swim,lean,look] [--out=<dir>] [--profile=low]
//
//   tree    the nearest trunk 2 m behind the player: the arm's length, the camera's distance to the trunk, a shot
//   stairs  up a house's stairs at a walk: the biggest frame-to-frame step of the body, the capsule and the camera
//   swim    a swim, a dive and a rise: the stroke roll, the waterline crossings, a shot at each crossing
//   lean    a start and a stop seen from the side (free camera): the body's lean, a shot of each
//   look    a 90 degree flick of the mouse: how many frames the turn takes, the peak turn per frame
// The same script runs on an older tree (the numbers print as n/a where the new fields do not exist): the "before" of the wave.
import { installEnv } from '../perf/headless-env.mjs';
import { register } from 'node:module';
register( '../perf/stub-loader.mjs', import.meta.url );
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const arg = ( k, d = null ) => {

	const a = process.argv.find( ( x ) => x.startsWith( '--' + k + '=' ) );
	return a ? a.slice( k.length + 3 ) : d;

};

const [ W, H ] = arg( 'size', '1280x720' ).split( 'x' ).map( Number );
const profile = arg( 'profile', 'low' );
const out = resolve( arg( 'out', join( import.meta.dirname, 'out' ) ) );
const cache = resolve( arg( 'cache', join( tmpdir(), 'hyptile-visuals-images' ) ) );
const only = arg( 'only' ) ? arg( 'only' ).split( ',' ) : [ 'tree', 'stairs', 'swim', 'lean', 'look' ];
const tag = arg( 'tag', 'run' );
mkdirSync( out, { recursive: true } );
mkdirSync( cache, { recursive: true } );

await installEnv( { search: '?bench&noAudio&quality=' + profile, width: W, height: H, power: 'high-performance', flags: [ 'backend=' + arg( 'backend', 'vulkan' ) ], dawnDir: arg( 'dawn' ) } );
const { decodePNG } = await import( '../../src/world/marine/WhaleTextures.js' );
globalThis.__assetImage = async ( bytes ) => {

	const u = bytes instanceof Uint8Array ? bytes : new Uint8Array( bytes );
	const h = createHash( 'sha1' ).update( u ).digest( 'hex' );
	const png = join( cache, h + '.png' );
	if ( existsSync( png ) ) { const b = readFileSync( png ); return decodePNG( b.buffer.slice( b.byteOffset, b.byteOffset + b.byteLength ) ); }
	if ( u[ 0 ] === 0x89 && u[ 1 ] === 0x50 ) return decodePNG( u.buffer.slice( u.byteOffset, u.byteOffset + u.byteLength ) );
	if ( ! existsSync( join( cache, h + '.img' ) ) ) writeFileSync( join( cache, h + '.img' ), u );
	return { data: new Uint8Array( 16 ).fill( 128 ), width: 2, height: 2 };

};

await import( '../../src/core/BenchSeed.js' );
const { App } = await import( '../../src/App.js' );
const { GPU } = await import( '../../src/engine/gpu/GPU.js' );
const { canvasPNG } = await import( '../perf/shot.mjs' );
const THREE = await import( '../../src/engine/index.js' );
const gpuErrors = [];
GPU.onError( ( e ) => gpuErrors.push( e ) );

const app = new App();
await app.init( () => {} );
const Q = await import( '../../src/core/Quality.js' );
app.quality = new Q.Quality( app, { storage: null, query: new URLSearchParams( '?quality=' + profile ) } );
app.quality.loop.auto = false;
app.startSession( null, { mode: 'sandbox', restore: false, session: false } );
app.quality.apply();
if ( app.ui && app.ui.hide ) try { app.ui.hide(); } catch ( e ) { /* no HUD */ }
const inp = app.input, p = app.player, cam = app.camera;
app.settings.timeSpeed = 0;
app.settings.timeOfDay = 13;

const run = async ( n, { keys = [], hit = [], each = null } = {} ) => {

	for ( const k of keys ) inp.keys.add( k );
	for ( const k of hit ) inp.pressed.add( k );
	for ( let i = 0; i < n; i ++ ) {

		app.frame( 1 / 60 );
		if ( each ) each( i );
		if ( ( i & 15 ) === 15 ) await GPU.queue.onSubmittedWorkDone();

	}

	for ( const k of keys ) inp.keys.delete( k );

};

const shot = async ( name ) => { await GPU.queue.onSubmittedWorkDone(); const f = join( out, `${ tag }-${ name }.png` ); await canvasPNG( GPU, f ); console.log( '  -> ' + f ); return f; };
const V3 = ( a ) => `(${ a.x.toFixed( 2 )}, ${ a.y.toFixed( 2 ) }, ${ a.z.toFixed( 2 ) })`;
const na = ( v, d = 3 ) => ( Number.isFinite( v ) ? v.toFixed( d ) : 'n/a' );
const yawTo = ( ux, uz ) => Math.atan2( - ux, - uz ); // Player.yaw whose forward is ( ux, uz )
const poseOf = () => p.pose( {} );
const results = {};

await run( 60 );
const home = p.position.clone();
console.log( `start ${ V3( home ) } mode ${ p.mode } view ${ p.view }` );
p.setView( 'third' );

if ( only.includes( 'tree' ) ) {

	console.log( 'tree' );
	// the nearest trunk that stands like a tree: a post of r >= 0.2 and 3 m or more of height, on land
	let best = null, bd = 1e9;
	for ( const c of app.colliders.cylinders ) {

		if ( c.radius < 0.2 || c.radius > 0.8 || c.yMax - c.yMin < 3 || c.yMin < 0.5 || /rock|cairn|lighthouse|tower/i.test( c.tag ) ) continue;
		const d = Math.hypot( c.x - home.x, c.z - home.z );
		if ( d < bd && d > 3 ) { bd = d; best = c; }

	}

	if ( ! best ) console.log( '  no trunk found' );
	else {

		const g = p.terrain.heightAt( best.x, best.z );
		// stand 2 m from the trunk, facing away from it: the camera's arm (4.2 m) runs back through it
		const ux = ( home.x - best.x ), uz = ( home.z - best.z ), l = Math.hypot( ux, uz ) || 1;
		const dx = ux / l, dz = uz / l;
		const sx = best.x + dx * 2.0, sz = best.z + dz * 2.0;
		p.position.set( sx, p.terrain.heightAt( sx, sz ), sz );
		p.velocity.set( 0, 0, 0 );
		p.mode = 'walk';
		p.yaw = yawTo( dx, dz );
		p.pitch = - 0.12;
		p.armInit = false;
		await run( 90 );
		const pv = p.armPivot, arm = cam.position.distanceTo( pv );
		const toTrunk = Math.hypot( cam.position.x - best.x, cam.position.z - best.z );
		console.log( `  trunk ${ best.tag } r ${ best.radius.toFixed( 2 ) } at ${ best.x.toFixed( 1 ) }, ${ best.z.toFixed( 1 ) } (ground ${ g.toFixed( 1 ) }); arm ${ arm.toFixed( 2 ) } m of ${ p.armDist }; camera ${ toTrunk.toFixed( 2 ) } m from the trunk axis (radius ${ best.radius.toFixed( 2 ) })` );
		console.log( `  player ${ V3( p.position ) } pivot ${ V3( pv ) } camera ${ V3( cam.position ) } trunk ${ best.x.toFixed( 2 ) }, ${ best.z.toFixed( 2 ) } (feet to camera ${ cam.position.distanceTo( p.position ).toFixed( 2 ) } m, avatar ${ app.avatar.visible ? 'shown' : 'hidden' })` );
		results.tree = { arm, toTrunk, r: best.radius };
		await shot( 'tree' );

	}

}

if ( only.includes( 'stairs' ) ) {

	console.log( 'stairs' );
	// a flight: the stairs boxes of one house, lowest tread first
	const st = app.colliders.boxes.filter( ( b ) => b.tag === 'stairs' && b.walkable );
	let found = null;
	for ( const a of st ) {

		const near = st.filter( ( b ) => Math.hypot( b.center.x - a.center.x, b.center.z - a.center.z ) < 4 ).sort( ( m, n ) => m.top - n.top );
		if ( near.length >= 3 && near[ near.length - 1 ].top - near[ 0 ].top > 0.4 && near[ 0 ].top > 0.5 ) { found = near; break; }

	}

	if ( ! found ) console.log( '  no stairs found' );
	else {

		const a = found[ 0 ], b = found[ found.length - 1 ];
		const dx0 = b.center.x - a.center.x, dz0 = b.center.z - a.center.z, l = Math.hypot( dx0, dz0 ) || 1;
		const ux = dx0 / l, uz = dz0 / l;
		const sx = a.center.x - ux * 2.5, sz = a.center.z - uz * 2.5;
		p.position.set( sx, p.terrain.heightAt( sx, sz ), sz );
		p.velocity.set( 0, 0, 0 );
		p.mode = 'walk';
		p.yaw = yawTo( ux, uz );
		p.pitch = - 0.1;
		p.armInit = false;
		await run( 60 );
		const rec = { phys: [], vis: [], cam: [] };
		let lastP = p.position.y, lastV = poseOf().position.y, lastC = cam.position.y, snapped = false;
		await run( 170, { keys: [ 'KeyW' ], each: async ( i ) => {

			rec.phys.push( Math.abs( p.position.y - lastP ) ); rec.vis.push( Math.abs( poseOf().position.y - lastV ) ); rec.cam.push( Math.abs( cam.position.y - lastC ) );
			lastP = p.position.y; lastV = poseOf().position.y; lastC = cam.position.y;

		} } );
		const mx = ( a2 ) => Math.max( ...a2.slice( 5 ) );
		console.log( `  ${ found.length } treads ${ a.top.toFixed( 2 ) } -> ${ b.top.toFixed( 2 ) } m; feet now y ${ p.position.y.toFixed( 2 ) }; largest step per frame: capsule ${ mx( rec.phys ).toFixed( 3 ) } m, body ${ mx( rec.vis ).toFixed( 3 ) } m, camera ${ mx( rec.cam ).toFixed( 3 ) } m` );
		results.stairs = { capsule: mx( rec.phys ), body: mx( rec.vis ), camera: mx( rec.cam ) };
		await shot( 'stairs' );

	}

}

if ( only.includes( 'swim' ) ) {

	console.log( 'swim' );
	p.position.set( 200, 0, 260 );
	p.mode = 'swim';
	p.velocity.set( 0, 0, 0 );
	p.yaw = 0; p.pitch = 0;
	p.armInit = false;
	await run( 120 );
	let maxRoll = 0, minBob = 1e9, maxBob = - 1e9, strokes = 0, lastPh = 0;
	const e = new THREE.Euler();
	await run( 180, { keys: [ 'KeyW' ], each: () => {

		e.setFromQuaternion( cam.quaternion, 'YXZ' );
		maxRoll = Math.max( maxRoll, Math.abs( e.z ) );
		minBob = Math.min( minBob, cam.position.y - p.position.y ); maxBob = Math.max( maxBob, cam.position.y - p.position.y );
		if ( Number.isFinite( p.stroke ) ) { if ( p.stroke < lastPh ) strokes ++; lastPh = p.stroke; }

	} } );
	console.log( `  swimming: peak camera roll ${ ( maxRoll * 57.3 ).toFixed( 2 ) } deg, the eye moves ${ ( maxBob - minBob ).toFixed( 3 ) } m against the body, ${ strokes } stroke cues (stroke ${ na( p.stroke ) })` );
	await shot( 'swim' );
	p.setView( 'first' ); // the lens (the camera) is what crosses the waterline: in third person it rides above the swimmer
	const seq0 = p.crossSeq;
	p.pitch = - 0.9;
	let plunged = false;
	await run( 150, { keys: [ 'KeyW' ], each: async () => { if ( ! plunged && p.crossSeq > seq0 ) { plunged = true; } } } );
	console.log( `  dive: crossings ${ na( p.crossSeq - seq0, 0 ) }, last ${ JSON.stringify( p.waterCross ) }, y ${ p.position.y.toFixed( 2 ) }, fov ${ cam.fov.toFixed( 2 ) }` );
	await shot( 'dive' );
	p.pitch = 0;
	let surf = - 1;
	const s1 = p.crossSeq;
	for ( let i = 0; i < 300 && surf < 0; i ++ ) {

		inp.keys.add( 'Space' );
		app.frame( 1 / 60 );
		if ( ( i & 15 ) === 15 ) await GPU.queue.onSubmittedWorkDone();
		if ( p.crossSeq > s1 ) surf = i;

	}

	inp.keys.delete( 'Space' );
	await run( 6 );
	console.log( `  surfaced after ${ surf } frames, fov ${ cam.fov.toFixed( 2 ) }, feel dip ${ app.cameraFeel && app.cameraFeel._dip ? 'on' : 'off' }` );
	await shot( 'surface' );
	p.setView( 'third' );
	results.swim = { roll: maxRoll, strokes };

}

if ( only.includes( 'lean' ) ) {

	console.log( 'lean' );
	p.mode = 'walk';
	p.position.set( home.x, p.terrain.heightAt( home.x, home.z ), home.z );
	p.velocity.set( 0, 0, 0 );
	p.yaw = 0; p.pitch = - 0.05;
	p.armInit = false;
	p.setView( 'third' );
	await run( 90 );
	const g = () => ( app.avatar.graph ? app.avatar.graph : null );
	const leanNow = () => { const q = g(); return q ? { pitch: q.leanPitch, roll: q.lean } : { pitch: NaN, roll: NaN }; };
	const side = async ( name ) => {

		// the free camera 3.4 m to the avatar's right, level with its chest: one rendered frame, the player is not stepped in it
		const at = p.position;
		app.freeCam = true;
		app.fly.setPose( new THREE.Vector3( at.x + 3.4, at.y + 1.0, at.z ), Math.PI / 2, - 0.04 );
		const lean = leanNow();
		app.frame( 1 / 60 );
		await shot( name );
		app.freeCam = false;
		return lean;

	};

	// a start: W from rest, the shot 7 frames in (the push is at its height)
	for ( let i = 0; i < 7; i ++ ) { inp.keys.add( 'KeyW' ); app.frame( 1 / 60 ); }
	const ls = await side( 'lean-start' );
	await run( 70, { keys: [ 'KeyW' ] } );
	// a stop: release; the shot 4 frames in
	inp.keys.delete( 'KeyW' );
	for ( let i = 0; i < 4; i ++ ) app.frame( 1 / 60 );
	const lb = await side( 'lean-stop' );
	console.log( `  lean at the start: pitch ${ na( ls.pitch ) } rad (${ na( ls.pitch * 57.3, 1 ) } deg), at the stop: ${ na( lb.pitch ) } rad (${ na( lb.pitch * 57.3, 1 ) } deg); speed now ${ p.velocity.length().toFixed( 2 ) }` );
	results.lean = { start: ls.pitch, stop: lb.pitch };
	await run( 30 );

}

if ( only.includes( 'look' ) ) {

	console.log( 'look' );
	p.mode = 'walk';
	p.position.set( home.x, p.terrain.heightAt( home.x, home.z ), home.z );
	p.velocity.set( 0, 0, 0 );
	p.yaw = 0; p.pitch = - 0.05;
	await run( 60 );
	const y0 = p.yaw, counts = Math.round( ( Math.PI / 2 ) / 0.0022 );
	inp.look.x += counts; // a 90 degree flick of the mouse in one frame
	let prev = p.yaw, peak = 0, frames90 = - 1, bodyPeak = 0;
	const body0 = app.avatar._bodyYaw;
	for ( let i = 0; i < 40; i ++ ) {

		app.frame( 1 / 60 );
		peak = Math.max( peak, Math.abs( p.yaw - prev ) );
		prev = p.yaw;
		if ( frames90 < 0 && Math.abs( p.yaw - y0 ) > 0.9 * Math.PI / 2 ) frames90 = i + 1;

	}

	console.log( `  a 90 degree flick: the camera yaw peaks at ${ ( peak * 57.3 ).toFixed( 1 ) } deg in one frame, 90 % applied after ${ frames90 } frames (${ ( frames90 * 1000 / 60 ).toFixed( 0 ) } ms); total ${ ( ( p.yaw - y0 ) * 57.3 ).toFixed( 1 ) } deg; body yaw ${ na( app.avatar._bodyYaw, 2 ) } of ${ p.yaw.toFixed( 2 ) } (was ${ na( body0, 2 ) })` );
	results.look = { peak, frames90 };
	await shot( 'look-after' );

}

writeFileSync( join( out, `${ tag }-results.json` ), JSON.stringify( results, null, 1 ) );
if ( gpuErrors.length ) console.log( `${ gpuErrors.length } GPU errors, first: ${ JSON.stringify( gpuErrors[ 0 ] ).slice( 0, 300 ) }` );
console.log( 'camera25c playcheck done' );
process.exit( 0 );
