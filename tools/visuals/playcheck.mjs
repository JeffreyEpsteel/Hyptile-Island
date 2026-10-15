// Play checks on Dawn (after the wave 21 play-test: what the tests cannot run and the browser pane cannot time). Boots the
// whole App like capture.mjs, then plays a scenario through the game's own input (app.input.keys / pressed) at 60 fps and
// writes a PNG and a verdict line per check.
//
//   node tools/visuals/playcheck.mjs --dawn=<dir> [--only=takeoff,flash,carexit] [--out=<dir>] [--profile=medium]
//
//   takeoff   buys the seaplane, boards it with E, holds the throttle (Shift) and pulls up (S): airborne within 60 s, then
//             E on the water climbs out and the same press does not climb back in
//   flash     the exposure over 30 s with a front 2 km ahead of the player (no flash at all) and under its band (rare,
//             never two within seconds); the storm's own lightning is left to the weather schedule
//   carexit   in Meridian: E at a parked car's door gets in, W drives it through app.input, E gets out and stays out
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
const profile = arg( 'profile', 'medium' );
const out = resolve( arg( 'out', join( import.meta.dirname, 'out', 'playcheck' ) ) );
const cache = resolve( arg( 'cache', join( tmpdir(), 'hyptile-visuals-images' ) ) );
const only = arg( 'only' ) ? arg( 'only' ).split( ',' ) : [ 'takeoff', 'flash', 'carexit' ];
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
const { FRONT, frontAt, arrival } = await import( '../../src/features/weather/Fronts.js' );
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
const inp = app.input, F = app.features, p = app.player;
const toasts = [];
const toast0 = app.game.toast.bind( app.game );
app.game.toast = ( t, ms ) => { toasts.push( String( t ) ); return toast0( t, ms ); };

// frames at 60 fps; `keys` held, `hit` pressed on the first frame
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

const shot = async ( name ) => { await GPU.queue.onSubmittedWorkDone(); const f = join( out, `${ profile }-${ name }.png` ); await canvasPNG( GPU, f ); return f; };
const verdict = ( ok, text ) => console.log( `${ ok ? 'ok  ' : 'FAIL' } ${ text }` );
let failed = 0;
const check = ( ok, text ) => { verdict( ok, text ); if ( ! ok ) failed ++; };
app.settings.timeSpeed = 0;
app.settings.timeOfDay = 14;
check( ! F.panelOpen(), `no feature panel is open at the start (features.panelOpen ${ F.panelOpen() })` );

if ( only.includes( 'takeoff' ) ) {

	const sp = F.get( 'seaplane' ), f = sp.flight;
	if ( ! sp.owned ) sp.buy();
	const dr = f.geom.door;
	const d = f.toWorldXYZ( dr[ 0 ] + 0.8, dr[ 1 ], dr[ 2 ], p.position.clone() );
	p.position.set( d.x, Math.max( d.y, 0.3 ), d.z );
	p.mode = 'walk';
	await run( 30 );
	await run( 2, { hit: [ 'KeyE' ] } );
	check( sp.piloted && p.mode === 'plane', `E at the door boards the seaplane (prompt was "${ p.prompt && p.prompt.text }")` );
	await run( 2, { hit: [ 'KeyE' ] } );
	check( ! sp.piloted && p.mode === 'walk', 'E on the water climbs out' );
	await run( 10 );
	check( ! sp.piloted && p.mode === 'walk', 'and the same press did not climb back in' );
	await run( 40 );
	await run( 2, { hit: [ 'KeyE' ] } );
	check( sp.piloted, 'a later E boards again' );
	// full throttle, S pulls up from 12 s until she is 20 m up; the shot is taken in the climb (before this run's pilot
	// does anything else to her)
	let airborneAt = - 1, top = 0, vmax = 0, i = 0, file = null;
	inp.keys.add( 'ShiftLeft' );
	for ( ; i < 60 * 60 && ! file; i ++ ) {

		if ( i === 60 * 12 ) inp.keys.add( 'KeyS' );
		app.frame( 1 / 60 );
		if ( f.airborne && airborneAt < 0 ) airborneAt = i;
		top = Math.max( top, f.position.y );
		vmax = Math.max( vmax, f.airspeed );
		if ( f.position.y > 20 ) { inp.keys.delete( 'KeyS' ); file = await shot( 'takeoff' ); }
		if ( ( i & 15 ) === 15 ) await GPU.queue.onSubmittedWorkDone();

	}

	inp.keys.delete( 'KeyS' );
	inp.keys.delete( 'ShiftLeft' );
	check( airborneAt > 0 && top > 10 && sp.piloted, `the plane took off (airborne after ${ ( airborneAt / 60 ).toFixed( 1 ) } s, ${ top.toFixed( 0 ) } m up after ${ ( i / 60 ).toFixed( 0 ) } s, ${ vmax.toFixed( 0 ) } m/s)` );
	console.log( '  -> ' + file );
	// the next checks start on the pier (the plane is left to itself)
	if ( sp.piloted ) { sp.piloted = false; sp.systems.stop(); sp.pilot.reset(); p.exitVehicle( 60, 2.5, - 40, 0, 'walk' ); }
	await run( 30 );

}

if ( only.includes( 'flash' ) ) {

	const w = F.get( 'weather' );
	// a front crossing the home bay: the first slot's, with the player on the pier
	let f = null, k = 2;
	for ( ; k < 400 && ! f; k ++ ) f = frontAt( k * FRONT.every + 4 );
	const P = { x: 60, z: - 40 };
	const arr = arrival( P.x, P.z, f.t0, 12 );
	const at = f.t0 + arr.inHours;
	const setHour = ( h ) => { w.day = Math.floor( h / 24 ); w._lastHour = null; app.settings.timeOfDay = h % 24; w._settle = 3; };
	p.position.set( P.x, 2.5, P.z );
	p.mode = 'walk';
	const trace = ( label, hour, seconds ) => {

		setHour( hour );
		app.settings.timeSpeed = 0.01;
		const ex = [];
		let flashes = 0;
		const off = F.on( 'lightningStrike', () => flashes ++ );
		return run( seconds * 60, { each: () => ex.push( app.settings.exposure ) } ).then( async () => {

			off();
			const base = ex.slice().sort( ( a, b ) => a - b )[ ex.length >> 1 ];
			const peaks = ex.filter( ( e ) => e > base * 1.5 ).length;
			console.log( `  ${ label }: front ${ w.front ? w.front.id : 'none' }, depth ${ Math.round( w.local.depth ) } m, rain here ${ w.local.rain.toFixed( 2 ) }, ${ flashes } strikes, ${ peaks } bright frames of ${ ex.length } (exposure ${ base.toFixed( 3 ) } base, ${ Math.max( ...ex ).toFixed( 3 ) } peak)` );
			console.log( '  -> ' + await shot( 'flash-' + label ) );
			return { flashes, peaks, w };

		} );

	};
	const ahead = await trace( 'ahead', at - 2, 30 );
	check( ahead.flashes === 0 && ahead.peaks === 0, 'a front 2 km off: no lightning on the screen' );
	const under = await trace( 'under', at + 0.3, 30 );
	check( under.w.local.under && under.flashes <= 4 && under.peaks < 30, `under the band: ${ under.flashes } strikes in 30 s` );
	app.settings.timeSpeed = 0;
	app.settings.timeOfDay = 14;
	w.reset && w.reset();

}

if ( only.includes( 'carexit' ) ) {

	const cars = F.get( 'cars' );
	const spot = cars._spots()[ 0 ];
	p.position.set( spot.x + 3, 60, spot.z + 3 );
	p.mode = 'walk';
	await run( 90 );
	let best = null, bd = 1e9;
	for ( const r of cars.records ) { const d = Math.hypot( r.x - p.position.x, r.z - p.position.z ); if ( d < bd ) { bd = d; best = r; } }
	const S = best.spec, c = Math.cos( best.yaw ), s = Math.sin( best.yaw ), lx = S.wid / 2 + 0.9, lz = S.seat[ 2 ];
	p.position.set( best.x + lx * c + lz * s, best.y + 0.5, best.z - lx * s + lz * c );
	await run( 20 );
	check( p.prompt && /Take the/.test( p.prompt.text ), `the door prompt: "${ p.prompt && p.prompt.text }"` );
	await run( 2, { hit: [ 'KeyE' ] } );
	check( cars.driving && p.mode === 'plane', 'E gets in' );
	const x0 = best.x, z0 = best.z;
	await run( 180, { keys: [ 'KeyW' ] } );
	const moved = Math.hypot( best.x - x0, best.z - z0 );
	check( moved > 10, `W drives it ${ moved.toFixed( 1 ) } m in 3 s (${ best.body.speed.toFixed( 1 ) } m/s)` );
	console.log( '  -> ' + await shot( 'car' ) );
	await run( 240, { keys: [ 'Space' ] } );
	await run( 2, { hit: [ 'KeyE' ] } );
	check( ! cars.driving && p.mode === 'walk', `E gets out (${ best.body.speed.toFixed( 1 ) } m/s)` );
	await run( 20 );
	check( ! cars.driving && p.mode === 'walk' && cars.stats.taken === 1, 'and stays out' );

}

if ( gpuErrors.length ) console.log( `${ gpuErrors.length } GPU errors, first: ${ JSON.stringify( gpuErrors[ 0 ] ).slice( 0, 300 ) }` );
console.log( failed ? `playcheck: ${ failed } failed` : 'playcheck: all passed' );
process.exit( failed ? 1 : 0 );
