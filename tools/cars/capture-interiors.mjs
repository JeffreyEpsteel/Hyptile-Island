// Captures of the car interiors (wave 24A), headless on Dawn like tools/cars/capture.mjs: the driver's eye of every kind, by
// day and by night, the instruments live (a software 2D canvas stands in for the browser's: tools/cars/softcanvas.mjs).
//
//   node tools/cars/capture-interiors.mjs --dawn=<dir> [--out=<dir>] [--kinds=sedan,...] [--times=day,night]
//        [--look=forward|stack|wheel|back|side|door] [--rain=0..1] [--speed=m/s] [--steer=-1..1] [--size=1280x720] [--profile=medium|phone]
// Out: <out>/<profile>-<kind>-<time>-<look>.png and one JSON line per shot (gauges, controls, draws).
import { installEnv } from '../perf/headless-env.mjs';
import { register } from 'node:module';
register( '../perf/stub-loader.mjs', import.meta.url );
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
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
const out = resolve( arg( 'out', join( import.meta.dirname, 'out', 'interiors' ) ) );
const cache = resolve( arg( 'cache', join( tmpdir(), 'hyptile-visuals-images' ) ) );
mkdirSync( out, { recursive: true } );
mkdirSync( cache, { recursive: true } );
await installEnv( { search: '?bench&noAudio&quality=' + ( phone ? 'off&phone' : profile ), width: W, height: H, power: 'high-performance', flags: [ 'backend=vulkan' ], dawnDir: arg( 'dawn' ) } );
if ( phone ) globalThis.__phoneBudget = { ...( await import( '../../src/core/Quality.js' ) ).PHONE_BUDGET };
const { decodePNG } = await import( '../../src/world/marine/WhaleTextures.js' );
globalThis.__assetImage = async ( bytes ) => {

	const u = bytes instanceof Uint8Array ? bytes : new Uint8Array( bytes );
	const png = join( cache, createHash( 'sha1' ).update( u ).digest( 'hex' ) + '.png' );
	if ( existsSync( png ) ) { const b = readFileSync( png ); return decodePNG( b.buffer.slice( b.byteOffset, b.byteOffset + b.byteLength ) ); }
	if ( u[ 0 ] === 0x89 && u[ 1 ] === 0x50 ) return decodePNG( u.buffer.slice( u.byteOffset, u.byteOffset + u.byteLength ) );
	return { data: new Uint8Array( 16 ).fill( 128 ), width: 2, height: 2 };

};

await import( '../../src/core/BenchSeed.js' );
const { App } = await import( '../../src/App.js' );
const { GPU } = await import( '../../src/engine/gpu/GPU.js' );
const { canvasPNG } = await import( '../perf/shot.mjs' );
const { installSoftCanvas } = await import( './softcanvas.mjs' );
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
installSoftCanvas();
const Q = await import( '../../src/core/Quality.js' );
app.quality = new Q.Quality( app, { storage: null, query: new URLSearchParams( '?quality=' + ( phone ? 'low' : profile ) ), mobile: phone ? Q.MOBILE.phone : undefined } );
if ( app.quality.loop ) app.quality.loop.auto = false;
app.startSession( null, { mode: 'sandbox', restore: false, session: false } );
app.quality.apply();
if ( app.ui && app.ui.hide ) try { app.ui.hide(); } catch ( e ) { /* no HUD */ }

const plan = cityPlan();
const tile = ensureMeridian( app.terrainData );
if ( ! app.meridian ) {

	const land = new Mesh( meridianLandGeometry( tile, { step: 2 } ), createPropMaterial( 'meridian-capture' ) );
	land.receiveShadow = true;
	app.scene.add( land );
	const st = buildStreets( { tile, plan } );
	const facade = createFacadeMaterial( 'meridian-capture-facade' );
	facade.surface = facade.surface.replace( 'style > 7.5 && style < 8.5 || style > 16.5', '( style > 7.5 && style < 8.5 ) || style > 16.5' );
	const roads = new Mesh( st.acc.geometry(), facade );
	roads.receiveShadow = true;
	app.scene.add( roads );
	const acc = new Acc();
	for ( const b of plan.buildings ) {

		const f = footprint( b );
		if ( Math.hypot( ( f.x0 + f.x1 ) / 2 - MERIDIAN.center.x, ( f.z0 + f.z1 ) / 2 - MERIDIAN.center.z ) < 500 ) buildingInto( acc, b, { detail: true } );

	}
	const city = new Mesh( acc.geometry(), facade );
	city.castShadow = city.receiveShadow = true;
	app.scene.add( city );

}

const cars = app.features.get( 'cars' ) || app.features.add( 'cars', carsModule );
if ( cars.lights && app.localLights ) for ( const l of cars.lights ) app.localLights.add( l );
if ( cars.cockpit?.lights && app.localLights ) for ( const l of cars.cockpit.lights ) if ( ! app.localLights.sources?.includes?.( l ) ) app.localLights.add( l );
if ( app.avatar && ! /hidesDriver/.test( String( app.frame ) ) ) {

	let vis = true;
	Object.defineProperty( app.avatar, 'visible', { configurable: true, get: () => vis && ! cars.hidesDriver(), set: ( v ) => { vis = v; if ( app.avatar.group ) app.avatar.group.visible = v && ! cars.hidesDriver(); } } );

}

const node = ( id ) => plan.roads.nodes.find( ( n ) => n.id === id );
const yAt = ( x, z ) => tile.roadHeight( x, z );
const C = node( 'n3_3' );
const LOOKS = { forward: [ 0, - 0.12 ], stack: [ - 0.38, - 0.42 ], wheel: [ 0, - 0.38 ], back: [ 2.4, - 0.1 ], side: [ - 1.1, - 0.15 ], aux: [ - 0.2, - 0.18 ], up: [ 0, 0.5 ] };
const kinds = ( arg( 'kinds' ) || Object.keys( carsModule.KINDS ).join( ',' ) ).split( ',' );
const times = ( arg( 'times' ) || 'day,night' ).split( ',' );
const looks = ( arg( 'look' ) || 'forward' ).split( ',' );
const speed = Number( arg( 'speed', '9' ) ), steer = Number( arg( 'steer', '0' ) ), rain = Number( arg( 'rain', '0' ) );

for ( const kind of kinds ) for ( const time of times ) for ( const look of looks ) {

	app.settings.timeOfDay = time === 'night' ? 22 : time === 'dusk' ? 19.4 : 11;
	app.settings.timeSpeed = 0;
	if ( cars.drive ) cars.exit( { force: true } );
	cars.heat = 0; cars.level = 0; cars.graceT = 999;
	for ( const r of [ ...cars.records ] ) if ( r.state !== 'parked' ) cars._drop( r );
	const at = { x: C.x - 1.5, z: C.z + 60 };
	const y = yAt( at.x, at.z );
	if ( typeof app._placePlayer === 'function' ) app._placePlayer( at.x, y + 0.1, at.z, 0 ); else app.player.position.set( at.x, y + 0.1, at.z );
	if ( app.setFreeCam ) app.setFreeCam( false );
	const rec = cars._record( kind, { x: at.x, y, z: at.z, yaw: Math.PI, state: 'idle', color: 0x8e1b1b } );
	cars.records.push( rec );
	cars.enter( rec );
	if ( cars.cockpit ) cars.cockpit.rainOverride = rain > 0 ? rain : null;
	let t = 0;
	// hold the speed near the target (the gauges read the simulation), steer as asked, indicators on with a steer
	cars.opts.input = () => ( { throttle: Math.abs( rec.body?.speed || 0 ) < speed ? 0.6 : 0, brake: 0, steer, handbrake: false } );
	app.player.setView( 'first' );
	const [ yaw, pitch ] = LOOKS[ look ] || LOOKS.forward;
	for ( let i = 0; i < 200; i ++ ) {

		t += 1 / 60;
		app.player.helmYaw = yaw; app.player.helmPitch = pitch;
		if ( i === 30 && steer && cars.cockpit?.act ) cars.cockpit.act( steer > 0 ? 'indL' : 'indR' );
		if ( i === 30 && time === 'night' && cars.cockpit?.act && look === 'back' ) cars.cockpit.act( 'dome' );
		app.frame( 1 / 60 );
		if ( ( i & 7 ) === 7 ) await GPU.queue.onSubmittedWorkDone();
		if ( i === 20 ) { for ( let k = 0; k < 50 && ! cars.render; k ++ ) await new Promise( ( r ) => setTimeout( r, 50 ) ); if ( cars.render ) await cars.render.ready; }
		if ( i === 40 && cars.cockpit?.ready ) await cars.cockpit.ready;

	}
	await GPU.queue.onSubmittedWorkDone();
	const file = join( out, `${ profile }-${ kind }-${ time }-${ look }${ rain ? '-rain' : '' }.png` );
	await canvasPNG( GPU, file );
	const s = cars.cockpit?.snapshot || {};
	console.log( JSON.stringify( { file, kind, time, look, speed: s.speed?.toFixed?.( 1 ), rpm: Math.round( s.rpm || 0 ), gear: s.gear, fuel: s.fuel, temp: s.temp, detailed: !! rec.cockpitDetailed, interior: cars.cockpit?.interiorKind || null, meshes: cars.cockpit?.group?.children?.length || 0, steer: rec.body?.steer?.toFixed?.( 3 ) } ) );
	cars.opts.input = null;

}

if ( errors.length ) console.log( `${ errors.length } GPU errors, first: ${ JSON.stringify( errors[ 0 ] ).slice( 0, 400 ) }` );
process.exit( errors.length ? 1 : 0 );
