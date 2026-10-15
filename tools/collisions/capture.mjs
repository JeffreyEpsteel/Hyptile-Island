// Wave 24B captures on Dawn: the whole App (like tools/visuals/capture.mjs) playing the collision failure cases through the
// game's own input, a shot of each at the moment that shows the contact, and the measured overlap of the hulls as drawn
// (HullShape outlines of the loaded GLBs / the boat's lines) at that moment. Runs on any copy of the game (the HEAD archive
// for the "before" shots: put this file in its tools/collisions and junction public / node_modules).
//   node tools/collisions/capture.mjs --dawn=<dir> [--out=<dir>] [--only=ram,frigates,pier,swim] [--tag=after]
//   ram       the lobster boat at full throttle into a sloop lying stopped across her bow (from abeam, low)
//   frigates  two navy frigates pressed together side by side (from above the gap)
//   pier      the lobster boat at full throttle into the side of the home pier (from the pier's other side)
//   swim      a swimmer swimming into a moored brigantine's side (the player's own camera)
import { installEnv } from '../perf/headless-env.mjs';
import { register } from 'node:module';
register( '../perf/stub-loader.mjs', import.meta.url );
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const arg = ( k, d = null ) => {

	const a = process.argv.find( ( x ) => x.startsWith( '--' + k + '=' ) );
	return a ? a.slice( k.length + 3 ) : d;

};
const [ W, H ] = arg( 'size', '1280x720' ).split( 'x' ).map( Number );
const out = resolve( arg( 'out', join( import.meta.dirname, 'out' ) ) );
const tag = arg( 'tag', 'after' );
const cache = resolve( arg( 'cache', join( tmpdir(), 'hyptile-visuals-images' ) ) );
mkdirSync( out, { recursive: true } );
mkdirSync( cache, { recursive: true } );
await installEnv( { search: '?bench&noAudio&quality=medium', width: W, height: H, power: 'high-performance', flags: [ 'backend=vulkan' ], dawnDir: arg( 'dawn' ) } );
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
const { setupScenario } = await import( '../perf/runner.js' );
// the truth: outlines of the hulls as drawn (from this checkout's tools, whatever the game code is)
// (--truth=<checkout> for a copy of the game that has no HullShape.js yet, e.g. the HEAD archive of the "before" shots)
const truth = arg( 'truth' ) ? pathToFileURL( join( arg( 'truth' ), 'src', 'world', 'boat', 'HullShape.js' ) ).href : new URL( '../../src/world/boat/HullShape.js', import.meta.url ).href;
const { shapeFromObject, shapeFromLines, placeShape, polySat, polyDistance } = await import( truth );
const { SHIP_CLASSES } = await import( '../../src/features/naval/ShipClasses.js' );

const errors = [];
GPU.onError( ( e ) => errors.push( e ) );
const app = new App();
await app.init( () => {} );
const Q = await import( '../../src/core/Quality.js' );
app.quality = new Q.Quality( app, { storage: null, query: new URLSearchParams( '?quality=medium' ) } );
if ( app.quality.loop ) app.quality.loop.auto = false;
app.startSession( null, { mode: 'sandbox', restore: false, session: false } );
app.quality.apply();
if ( app.ui && app.ui.hide ) try { app.ui.hide(); } catch ( e ) { /* no HUD */ }
const F = app.features, inp = app.input, p = app.player;
const naval = F.get( 'naval' );
naval.settings.autoSpawn = false;
const events = [];
for ( const n of [ 'hullsCollided', 'hullStruck', 'playerBoatDamaged' ] ) F.on( n, ( e ) => events.push( [ n, e ] ) );

const run = async ( n, each = null ) => {

	for ( let i = 0; i < n; i ++ ) {

		if ( each && each( i ) === false ) return i;
		app.frame( 1 / 60 );
		if ( ( i & 15 ) === 15 ) await GPU.queue.onSubmittedWorkDone();

	}

	return n;

};
const shot = async ( name ) => { await GPU.queue.onSubmittedWorkDone(); const f = join( out, `${ tag }-${ name }.png` ); await canvasPNG( GPU, f ); return f; };
const look = ( cx, cy, cz, tx, ty, tz ) => {

	app.setFreeCam( true );
	app.fly.setPose( app.fly.camera.position.clone().set( cx, cy, cz ), Math.atan2( - ( tx - cx ), - ( tz - cz ) ), Math.atan2( ty - cy, Math.hypot( tx - cx, tz - cz ) ) );

};
const report = {};
const say = ( k, o ) => { report[ k ] = o; console.log( k.padEnd( 9 ), Object.entries( o ).map( ( [ a, b ] ) => `${ a } ${ typeof b === 'number' ? b.toFixed( 2 ) : b }` ).join( ', ' ) ); };

// the truth outlines
const shipShape = ( s ) => s.visual && s.visual.loaded ? shapeFromObject( s.visual.group, { yLo: - 0.6, yHi: s.cls.sheer } ) : null;
const boatShape = () => shapeFromLines( app.boat.lines );
const yawOfQ = ( q ) => Math.atan2( 2 * ( q.x * q.z + q.w * q.y ), 1 - 2 * ( q.x * q.x + q.y * q.y ) );
const overlap = ( sa, xa, za, ya, sb, xb, zb, yb ) => { const r = polySat( placeShape( sa, xa, za, ya ), placeShape( sb, xb, zb, yb ) ); return - r.sep; };
const loaded = async ( s ) => { for ( let k = 0; k < 200 && ! ( s.visual && s.visual.loaded ); k ++ ) { await run( 1 ); await new Promise( ( r ) => setTimeout( r, 20 ) ); } };
const clearShips = () => { for ( const s of [ ...naval.ships ] ) naval._removeShip( naval.ships.indexOf( s ) ); };
const atHelm = async ( boat, x, z, heading ) => {

	await setupScenario( app, { id: 'w24b', name: 'w24b', ships: [], fire: null, peers: 0, intensity: 0, time: 15, weather: 'clear', place: { kind: 'helm', boat, x, z, heading } } );
	await run( 90 );
	const b = app.boatCtl;
	b.moored = false;
	return b;

};
const only = arg( 'only' ) ? arg( 'only' ).split( ',' ) : [ 'ram', 'frigates', 'pier', 'swim' ];
app.settings.timeSpeed = 0;

if ( only.includes( 'ram' ) ) {

	clearShips();
	// (deep water on the south band lane, 600 m off the home pier)
	const b = await atHelm( 'lobster', - 100, 600, 0 );
	const s = naval.spawn( 'sloop', { x: - 100, z: 600 + 55, yaw: Math.PI / 2 } );
	s.state = 'adrift'; s.speed = 0; s.wantSpeed = 0;
	await loaded( s );
	events.length = 0;
	inp.keys.add( 'KeyW' );
	let hit = - 1, worst = - Infinity, v = 0;
	await run( 60 * 14, ( i ) => {

		const o = overlap( boatShape(), b.position.x, b.position.z, yawOfQ( b.quaternion ), shipShape( s ) || boatShape(), s.x, s.z, s.yaw );
		worst = Math.max( worst, o );
		if ( hit < 0 && events.some( ( e ) => e[ 0 ] === 'hullsCollided' ) ) { hit = i; v = b.speed; }
		if ( hit >= 0 && i > hit + 5 ) return false;

	} );
	inp.keys.delete( 'KeyW' );
	const o = overlap( boatShape(), b.position.x, b.position.z, yawOfQ( b.quaternion ), shipShape( s ), s.x, s.z, s.yaw );
	look( b.position.x - 11, 3.2, b.position.z - 3, b.position.x, 1, b.position.z + 4 );
	await run( 2 );
	const f = await shot( 'ram' );
	say( 'ram', { 'speed at the blow (m/s)': v, 'overlap now (m)': o, 'worst overlap (m)': worst, file: f } );
	app.setFreeCam( false );

}

if ( only.includes( 'frigates' ) ) {

	clearShips();
	await atHelm( 'skiff', 60, 640, 0 );
	const a = naval.spawn( 'frigate', { x: 60 - 5, z: 700, yaw: 0 } ), c = naval.spawn( 'frigate', { x: 60 + 5, z: 700, yaw: 0 } );
	for ( const s of [ a, c ] ) { s.state = 'adrift'; s.speed = 0; s.wantSpeed = 0; }
	await loaded( a ); await loaded( c );
	let worst = - Infinity;
	await run( 60 * 6, () => {

		a.push.x = Math.max( a.push.x, 0.8 ); c.push.x = Math.min( c.push.x, - 0.8 );
		const sa = shipShape( a );
		worst = Math.max( worst, overlap( sa, a.x, a.z, a.yaw, sa, c.x, c.z, c.yaw ) );

	} );
	const sa = shipShape( a ), o = overlap( sa, a.x, a.z, a.yaw, sa, c.x, c.z, c.yaw );
	look( ( a.x + c.x ) / 2 + 2, 20, a.z + 30, ( a.x + c.x ) / 2, 1.5, a.z + 6 );
	await run( 2 );
	const f = await shot( 'frigates' );
	say( 'frigates', { 'centres apart (m)': c.x - a.x, 'drawn beam (m)': sa.hx * 2, 'overlap now (m)': o, 'worst overlap (m)': worst, file: f } );
	app.setFreeCam( false );

}

if ( only.includes( 'pier' ) ) {

	clearShips();
	const b = await atHelm( 'lobster', 92, 22, - Math.PI / 2 );
	events.length = 0;
	inp.keys.add( 'KeyW' );
	const piles = app.colliders.cylinders.filter( ( c ) => /pile/i.test( c.tag ) && Math.abs( c.z - 22 ) < 12 && Math.abs( c.x - 55 ) < 6 );
	let worst = 0, stopAt = - 1, xMin = Infinity;
	const pd = {};
	await run( 60 * 14, ( i ) => {

		const sh = boatShape(), yaw = yawOfQ( b.quaternion ), sn = Math.sin( yaw ), cs = Math.cos( yaw );
		for ( const c of piles ) {

			const dx = c.x - b.position.x, dz = c.z - b.position.z;
			worst = Math.max( worst, c.radius - polyDistance( sh, dx * cs - dz * sn, dx * sn + dz * cs, pd ).d );

		}

		xMin = Math.min( xMin, b.position.x );
		if ( stopAt < 0 && b.position.x < 70 && b.speed < 0.6 ) stopAt = i;
		if ( stopAt >= 0 && i > stopAt + 30 ) return false;

	} );
	inp.keys.delete( 'KeyW' );
	look( b.position.x + 7, 6.5, b.position.z - 11, b.position.x - 3, 0.8, b.position.z );
	await run( 2 );
	const f = await shot( 'pier' );
	const struck = events.filter( ( e ) => e[ 0 ] === 'hullStruck' ).map( ( e ) => `${ e[ 1 ].what } ${ e[ 1 ].speed } m/s dmg ${ e[ 1 ].damage }` );
	say( 'pier', { 'piles by the bow': piles.length, 'deepest pile in the hull (m)': worst, 'bow reached x (m)': xMin - 4.3, 'pier at x (m)': 55, 'ends at x (m)': b.position.x, struck: struck.join( '; ' ) || 'none', file: f } );
	app.setFreeCam( false );

}

if ( only.includes( 'swim' ) ) {

	clearShips();
	await atHelm( 'skiff', - 40, 740, 0 );
	const s = naval.spawn( 'brigantine', { x: - 20, z: 760, yaw: 0 } );
	s.state = 'moored'; s.speed = 0; s.wantSpeed = 0;
	await loaded( s );
	if ( p.mode === 'boat' && p.leaveHelm ) p.leaveHelm();
	if ( p.exitBoat ) try { p.exitBoat( null, 1 ); } catch ( e ) { /* already off */ }
	p.mode = 'swim';
	p.floating = true;
	p.position.set( - 20 - 7, - 0.2, 760 );
	p.yaw = - Math.PI / 2; // facing +x, towards her side
	if ( p.velocity ) p.velocity.set( 0, 0, 0 );
	let deepest = - Infinity;
	const sh = shipShape( s );
	await run( 60 * 6, () => {

		p.position.x += 1.2 / 60; // swimming at her
		deepest = Math.max( deepest, - polyDistance( sh, p.position.x - s.x, p.position.z - s.z ).d );

	} );
	look( p.position.x - 7, 2.6, p.position.z + 9, p.position.x + 1.5, 0.4, p.position.z );
	await run( 2 );
	const f = await shot( 'swim' );
	say( 'swim', { 'swimmer inside the hull by (m)': deepest, 'hull side at x (m)': s.x - sh.hx, 'swimmer at x (m)': p.position.x, mode: p.mode, file: f } );
	app.setFreeCam( false );

}

writeFileSync( join( out, `${ tag }-report.json` ), JSON.stringify( report, null, 1 ) );
if ( errors.length ) console.log( `${ errors.length } GPU errors, first: ${ JSON.stringify( errors[ 0 ] ).slice( 0, 400 ) }` );
process.exit( 0 );
