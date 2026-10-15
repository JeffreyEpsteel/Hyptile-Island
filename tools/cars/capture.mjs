// Captures of the cars in Meridian (wave 21B), headless on Dawn like tools/visuals/capture.mjs. Until the root wires the
// island and the feature into the game, this script stands the city up itself from 21A's modules (the terrain tile, the
// land mesh, the streets and the buildings near the views: read only) and adds the cars feature to the running App.
//
//   node tools/cars/capture.mjs --dawn=<dir> [--out=<dir>] [--profile=medium|phone] [--size=1280x720] [--only=street,...]
// Views: street (Central Avenue at noon, traffic both ways), junction (a signal junction from above), parked (a street of
// kerb bays, one car dented, one burning, one wrecked), night (headlights and tail lights), chase (driving a sports car,
// the chase camera).
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
const phone = profile === 'phone';
const out = resolve( arg( 'out', join( import.meta.dirname, 'out' ) ) );
const cache = resolve( arg( 'cache', join( tmpdir(), 'hyptile-visuals-images' ) ) );
mkdirSync( out, { recursive: true } );
mkdirSync( cache, { recursive: true } );
await installEnv( { search: '?bench&noAudio&quality=' + ( phone ? 'off&phone' : profile ), width: W, height: H, power: 'high-performance', flags: [ 'backend=vulkan' ], dawnDir: arg( 'dawn' ) } );
if ( phone ) globalThis.__phoneBudget = { ...( await import( '../../src/core/Quality.js' ) ).PHONE_BUDGET };
const { decodePNG } = await import( '../../src/world/marine/WhaleTextures.js' );
globalThis.__assetImage = async ( bytes ) => {

	const u = bytes instanceof Uint8Array ? bytes : new Uint8Array( bytes );
	const png = join( cache, createHash( 'sha1' ).update( u ).digest( 'hex' ) + '.png' );
	// (PNG blobs decode in node; the cache holds what Windows decoded for the other formats)
	if ( existsSync( png ) ) { const b = readFileSync( png ); return decodePNG( b.buffer.slice( b.byteOffset, b.byteOffset + b.byteLength ) ); }
	if ( u[ 0 ] === 0x89 && u[ 1 ] === 0x50 ) return decodePNG( u.buffer.slice( u.byteOffset, u.byteOffset + u.byteLength ) );
	return { data: new Uint8Array( 16 ).fill( 128 ), width: 2, height: 2 };

};

await import( '../../src/core/BenchSeed.js' );
const { App } = await import( '../../src/App.js' );
const { GPU } = await import( '../../src/engine/gpu/GPU.js' );
const { canvasPNG } = await import( '../perf/shot.mjs' );
const { Mesh } = await import( '../../src/engine/index.js' );
const { cityPlan, MERIDIAN, footprint } = await import( '../../src/world/islands/meridian/CityPlan.js' );
const { ensureMeridian } = await import( '../../src/world/islands/MeridianTerrain.js' );
const { meridianLandGeometry } = await import( '../../src/world/islands/MeridianMesh.js' );
const { buildStreets } = await import( '../../src/world/islands/meridian/Streets.js' );
const { Acc, buildingInto, createFacadeMaterial } = await import( '../../src/world/islands/meridian/Facades.js' );
const { createPropMaterial } = await import( '../../src/game/GameMaterials.js' );
const carsModule = await import( '../../src/features/cars/index.js' );

const errors = [];
GPU.onError( ( e ) => errors.push( e ) );
const app = new App();
await app.init( () => {} );
const Q = await import( '../../src/core/Quality.js' );
app.quality = new Q.Quality( app, { storage: null, query: new URLSearchParams( '?quality=' + ( phone ? 'low' : profile ) ), mobile: phone ? Q.MOBILE.phone : undefined } );
if ( app.quality.loop ) app.quality.loop.auto = false;
app.startSession( null, { mode: 'sandbox', restore: false, session: false } );
app.quality.apply();
if ( app.ui && app.ui.hide ) try { app.ui.hide(); } catch ( e ) { /* no HUD */ }

// ---- the city, from 21A's modules (when the game has no Meridian builder yet)
const plan = cityPlan();
const tile = ensureMeridian( app.terrainData );
if ( ! app.meridian ) {

	const land = new Mesh( meridianLandGeometry( tile, { step: 2 } ), createPropMaterial( 'meridian-capture' ) );
	land.receiveShadow = true;
	app.scene.add( land );
	const st = buildStreets( { tile, plan } );
	const facade = createFacadeMaterial( 'meridian-capture-facade' );
	// (21A's facade WGSL mixes && and || without parentheses, which Dawn rejects: reported; patched here for the shots only)
	facade.surface = facade.surface.replace( 'style > 7.5 && style < 8.5 || style > 16.5', '( style > 7.5 && style < 8.5 ) || style > 16.5' );
	const roads = new Mesh( st.acc.geometry(), facade );
	roads.receiveShadow = true;
	app.scene.add( roads );
	const acc = new Acc();
	for ( const b of plan.buildings ) {

		const f = footprint( b );
		if ( Math.hypot( ( f.x0 + f.x1 ) / 2 - MERIDIAN.center.x, ( f.z0 + f.z1 ) / 2 - MERIDIAN.center.z ) < 700 ) buildingInto( acc, b, { detail: true } );

	}

	const city = new Mesh( acc.geometry(), facade );
	city.castShadow = city.receiveShadow = true;
	app.scene.add( city );
	console.log( `city stood up: ${ plan.buildings.length } buildings` );

}

const cars = app.features.get( 'cars' ) || app.features.add( 'cars', carsModule );
if ( cars.lights && app.localLights ) for ( const l of cars.lights ) app.localLights.add( l );
// (the App patch this feature asks for: no avatar drawn in a car; emulated here)
if ( app.avatar && ! /hidesDriver/.test( String( app.frame ) ) ) {

	let vis = true;
	Object.defineProperty( app.avatar, 'visible', { configurable: true, get: () => vis && ! cars.hidesDriver(), set: ( v ) => { vis = v; if ( app.avatar.group ) app.avatar.group.visible = v && ! cars.hidesDriver(); } } );

}

const node = ( id ) => plan.roads.nodes.find( ( n ) => n.id === id );
const yAt = ( x, z ) => tile.roadHeight( x, z );

// the views: the player stands at `at` (the traffic gathers round him), the camera flies at `pose` (yaw 0 looks -z)
const C = node( 'n3_3' ), J = node( 'n3_5' );
const lot = plan.parking.filter( ( p ) => p.lot === 'station' );
const LOT = { x: lot.reduce( ( a, p ) => a + p.x, 0 ) / lot.length, z: lot.reduce( ( a, p ) => a + p.z, 0 ) / lot.length };
const VIEWS = {
	street: { time: 12, at: { x: C.x - 12, z: C.z + 60 }, pose: { x: C.x + 5, y: yAt( C.x, C.z + 70 ) + 4.5, z: C.z + 70, yaw: 0.06, pitch: - 0.1 } },
	junction: { time: 15, at: { x: J.x + 14, z: J.z + 14 }, pose: { x: J.x + 34, y: yAt( J.x, J.z ) + 26, z: J.z + 40, yaw: 0.7, pitch: - 0.55 } },
	parked: { time: 10.5, at: { x: LOT.x + 10, z: LOT.z - 12 }, pose: { x: LOT.x + 16, y: yAt( LOT.x, LOT.z ) + 6, z: LOT.z + 22, yaw: 0.63, pitch: - 0.2 }, damage: true },
	night: { time: 22, at: { x: C.x - 12, z: C.z + 60 }, pose: { x: C.x + 5, y: yAt( C.x, C.z + 70 ) + 4.5, z: C.z + 70, yaw: 0.06, pitch: - 0.1 } },
	chase: { time: 17, at: { x: C.x - 1.5, z: C.z + 90 }, drive: true },
	// two sedans 8 m off the camera at dusk, lights on: the near one faces the camera (headlamps), the other faces away (tail lamps)
	lamps: { time: 20.6, at: { x: C.x + 30, z: C.z + 40 }, pose: { x: C.x + 1.5, y: yAt( C.x, C.z + 40 ) + 1.6, z: C.z + 48, yaw: 0, pitch: - 0.08 }, pair: true },
};
const only = arg( 'only' ) ? arg( 'only' ).split( ',' ) : Object.keys( VIEWS );
for ( const id of only ) {

	const v = VIEWS[ id ];
	if ( ! v ) continue;
	app.settings.timeOfDay = v.time;
	app.settings.timeSpeed = 0;
	const y = yAt( v.at.x, v.at.z );
	if ( cars.drive ) cars.exit( { force: true } );
	// each view starts clean: no heat, no chase, no wrecks from the last one
	cars.heat = 0; cars.level = 0; cars.graceT = 999;
	for ( const r of [ ...cars.records ] ) if ( r.state !== 'parked' ) cars._drop( r );
	if ( v.pair ) for ( const [ dx, yaw ] of [ [ 0, 0 ], [ 3.2, Math.PI ] ] ) {

		const r = cars._record( 'sedan', { x: C.x + dx, y: yAt( C.x, C.z + 40 ), z: C.z + 40, yaw, state: 'idle', color: dx ? 0x1d3f7a : 0x8e1b1b } );
		r.lights = true;
		cars.records.push( r );

	}
	if ( typeof app._placePlayer === 'function' ) app._placePlayer( v.at.x, y + 0.1, v.at.z, 0 ); else app.player.position.set( v.at.x, y + 0.1, v.at.z );
	if ( v.drive ) {

		if ( app.setFreeCam ) app.setFreeCam( false );
		const rec = cars._record( 'sports', { x: v.at.x, y, z: v.at.z, yaw: Math.PI, state: 'idle', color: 0xd23a10 } );
		cars.records.push( rec );
		cars.enter( rec );
		// --keys: the throttle through the game's own key path (app.input -> Cars._input: what the player's W does; the
		// wave 21 play-test found that path dead while a feature answered isOpen()), else the headless input hook
		if ( arg( 'keys' ) !== null ) { cars.opts.input = null; app.input.keys.add( 'KeyW' ); }
		else cars.opts.input = () => ( { throttle: 0.55, brake: 0, steer: 0, handbrake: false } );
		v.start = { x: rec.x, z: rec.z, rec };

	} else {

		cars.opts.input = null;
		if ( app.setFreeCam ) app.setFreeCam( true );
		app.fly.setPose( app.fly.camera.position.clone().set( v.pose.x, v.pose.y, v.pose.z ), v.pose.yaw, v.pose.pitch );

	}

	for ( let i = 0; i < 240; i ++ ) {

		app.frame( 1 / 60 );
		if ( ( i & 7 ) === 7 ) await GPU.queue.onSubmittedWorkDone();
		if ( i === 20 ) { for ( let k = 0; k < 50 && ! cars.render; k ++ ) await new Promise( ( r ) => setTimeout( r, 50 ) ); if ( cars.render ) await cars.render.ready; }
		if ( i === 60 && v.damage ) {

			const near = cars.records.filter( ( r ) => r.state === 'parked' ).sort( ( a, b ) => Math.hypot( a.x - LOT.x, a.z - LOT.z ) - Math.hypot( b.x - LOT.x, b.z - LOT.z ) );
			if ( near[ 1 ] ) cars.damage( near[ 1 ], near[ 1 ].maxHp * 0.5 );
			if ( near[ 2 ] ) cars.damage( near[ 2 ], near[ 2 ].maxHp * 0.85 );
			if ( near[ 3 ] ) { cars.damage( near[ 3 ], near[ 3 ].maxHp ); near[ 3 ].fuseT = 1e9; }
			console.log( '  damaged: ' + near.slice( 0, 4 ).map( ( r ) => r.kind + ' stage ' + r.stage + ' at ' + ( r.x - LOT.x ).toFixed( 0 ) + ',' + ( r.z - LOT.z ).toFixed( 0 ) ).join( ', ' ) );

		}

	}

	await GPU.queue.onSubmittedWorkDone();
	const file = join( out, `${ profile }-${ id }.png` );
	await canvasPNG( GPU, file );
	console.log( `  ${ id }: ${ cars.traffic.cars.length } moving, ${ cars.records.length } other cars, ${ cars.render ? cars.render.drawn : 0 } drawn in ${ cars.render ? cars.render.draws() : 0 } draws -> ${ file }` );
	if ( v.start ) {

		const r = v.start.rec;
		console.log( `  driven ${ Math.hypot( r.x - v.start.x, r.z - v.start.z ).toFixed( 1 ) } m in 4 s, ${ ( r.body ? r.body.speed : 0 ).toFixed( 1 ) } m/s now (${ arg( 'keys' ) !== null ? 'W held through app.input' : 'the input hook' }), panelOpen ${ app.features.panelOpen() }` );
		app.input.keys.delete( 'KeyW' );

	}

}

if ( errors.length ) console.log( `${ errors.length } GPU errors, first: ${ JSON.stringify( errors[ 0 ] ).slice( 0, 400 ) }` );
process.exit( errors.length ? 1 : 0 );
