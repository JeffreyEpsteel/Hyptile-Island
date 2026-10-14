// Wave 21C: captures of a Meridian street before / during / after the city's destruction (src/features/citywreck), with
// the whole App on Dawn (tools/visuals/capture.mjs's harness). Until 21A's builder draws Meridian, the street is the real
// plan's (CityPlan.js) buildings round Bay Street and the Twins as plain boxes (StubCity.js) on a flat slab; with
// app.meridian present it uses that instead.
//
//   node tools/citywreck/capture.mjs --dawn=<dir> [--out=<dir>] [--profile=medium|phone] [--size=1280x720]
//
// Shots: <profile>-street-before.png, -street-during.png (two collapses falling, fires, smoke), -street-after.png (heaps,
// scaffolding), -close-during.png, -close-after.png, -twins.png (the towers after a barrage: whole, marks low down).
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
const search = '?bench&noAudio&quality=' + ( phone ? 'off' : profile ) + ( phone ? '&phone' : '' );
await installEnv( { search, width: W, height: H, power: 'high-performance', flags: [ 'backend=' + arg( 'backend', 'vulkan' ) ], dawnDir: arg( 'dawn' ) } );
if ( phone ) globalThis.__phoneBudget = { ...( await import( '../../src/core/Quality.js' ) ).PHONE_BUDGET };
const { decodePNG } = await import( '../../src/world/marine/WhaleTextures.js' );
globalThis.__assetImage = async ( bytes ) => {

	const u = bytes instanceof Uint8Array ? bytes : new Uint8Array( bytes );
	const png = join( cache, createHash( 'sha1' ).update( u ).digest( 'hex' ) + '.png' );
	if ( existsSync( png ) ) { const b = readFileSync( png ); return decodePNG( b.buffer.slice( b.byteOffset, b.byteOffset + b.byteLength ) ); }
	return { data: new Uint8Array( 16 ).fill( 128 ), width: 2, height: 2 };

};

await import( '../../src/core/BenchSeed.js' );
const { App } = await import( '../../src/App.js' );
const { GPU } = await import( '../../src/engine/gpu/GPU.js' );
const { setupScenario } = await import( '../perf/runner.js' );
const { canvasPNG } = await import( '../perf/shot.mjs' );
const E = await import( '../../src/engine/index.js' );
const { Material } = await import( '../../src/engine/render/Material.js' );
const cw$ = await import( '../../src/features/citywreck/index.js' );
const { cityPlan } = await import( '../../src/world/islands/meridian/CityPlan.js' );
const gpuErrors = [];
GPU.onError( ( e ) => gpuErrors.push( e ) );

const app = new App();
await app.init( () => {} );
const Q = await import( '../../src/core/Quality.js' );
app.quality = phone ? new Q.Quality( app, { storage: null, query: new URLSearchParams( '' ), mobile: Q.MOBILE.phone } ) : new Q.Quality( app, { storage: null, query: new URLSearchParams( '?quality=' + profile ) } );
if ( phone ) app.quality.loop.auto = false;
app.startSession( null, { mode: 'sandbox', restore: false, session: false } );
app.quality.apply();
if ( app.ui && app.ui.hide ) try { app.ui.hide(); } catch ( e ) { /* no HUD */ }

// the street: the real plan round Bay Street and the Twins (stand-in boxes on a slab) unless 21A's city is there
const GY = 7.2;
let city = app.meridian || ( app.ports && app.ports.meridian ) || null;
const real = !! city;
if ( ! city ) {

	const full = cityPlan();
	const inWin = ( x, z ) => x > - 3060 && x < - 2380 && z > - 440 && z < 150;
	const buildings = full.buildings.filter( ( b ) => inWin( b.x, b.z ) );
	const nodes = full.roads.nodes.filter( ( n ) => inWin( n.x, n.z ) );
	const ids = new Set( nodes.map( ( n ) => n.id ) );
	const edges = full.roads.edges.filter( ( e ) => ids.has( e.a ) && ids.has( e.b ) );
	const plan = { ...full, buildings, roads: { nodes, edges } };
	city = cw$.stubCity( { plan, scene: app.scene, ground: () => GY, Mesh: E.Mesh, BoxGeometry: E.BoxGeometry, Material, Group: E.Group } );
	// the slab and the roads on it
	const slabMat = new Material( { name: 'cw-slab', roughness: 0.9, surface: 's.albedo = vec3f( 0.32, 0.31, 0.29 ); s.roughness = 0.9;' } );
	const roadMat = new Material( { name: 'cw-road', roughness: 0.85, surface: 's.albedo = vec3f( 0.07, 0.07, 0.075 ); s.roughness = 0.8;' } );
	const slab = new E.Mesh( new E.BoxGeometry( 760, GY, 680 ), slabMat );
	slab.position.set( - 2720, GY / 2, - 145 );
	slab.receiveShadow = true;
	city.group.add( slab );
	const N = new Map( nodes.map( ( n ) => [ n.id, n ] ) );
	for ( const e of edges ) {

		const a = N.get( e.a ), b = N.get( e.b ), L = Math.hypot( b.x - a.x, b.z - a.z );
		const m = new E.Mesh( new E.BoxGeometry( e.width, 0.06, L + e.width ), roadMat );
		m.position.set( ( a.x + b.x ) / 2, GY + 0.03, ( a.z + b.z ) / 2 );
		m.rotation.y = Math.atan2( b.x - a.x, b.z - a.z );
		m.receiveShadow = true;
		city.group.add( m );

	}

}

const cw = app.features.add( 'citywreck', { install: ( a, f ) => cw$.install( a, f, { city, phone } ) } );
for ( let i = 0; i < 20 && ! cw.render; i ++ ) await new Promise( ( r ) => setTimeout( r, 50 ) );
console.log( `city ${ real ? '21A' : 'stand-in' }: ${ cw.model.list.length } buildings; render ${ !! cw.render }` );

const VIEWS = {
	street: { x: - 3045, y: 30, z: 62, yaw: - 1.14, pitch: - 0.2 },
	close: { x: - 2995, y: 20, z: 74, yaw: - 0.62, pitch: - 0.3 },
	twins: { x: - 2800, y: 20, z: 60, yaw: - 0.69, pitch: 0.36 },
	base: { x: - 2560, y: 10, z: - 175, yaw: - 0.81, pitch: 0.06 },
	rubble: { x: - 2992, y: 12, z: 21, yaw: - 0.92, pitch: - 0.32 },
};
let set = null;
const shoot = async ( view, name, frames = 90, time = 15.5 ) => {

	if ( set ) set.undo();
	set = await setupScenario( app, { id: name, name, ships: [], fire: null, peers: 0, intensity: 0, time, weather: 'clear', place: { kind: 'fly', pose: VIEWS[ view ] } } );
	for ( let i = 0; i < frames; i ++ ) {

		set.tick( 1 / 60, i / 60 );
		app.frame( 1 / 60 );
		if ( ( i & 7 ) === 7 ) await GPU.queue.onSubmittedWorkDone();

	}

	await GPU.queue.onSubmittedWorkDone();
	const f = join( out, `${ profile }-${ view }-${ name }.png` );
	await canvasPNG( GPU, f );
	console.log( '  ' + f, JSON.stringify( cw.info() ).slice( 0, 220 ) );

};
const frames = async ( n ) => { for ( let i = 0; i < n; i ++ ) { set.tick( 1 / 60, i / 60 ); app.frame( 1 / 60 ); if ( ( i & 7 ) === 7 ) await GPU.queue.onSubmittedWorkDone(); } };

await shoot( 'street', 'before' );
// the damage: scars along the street, a fire, two collapses beside the road, the Twins under fire
const m = cw.model, hit = ( id, f ) => { const b = m.byId.get( id ); if ( b ) m.hit( b, b.hp * f, { by: 'player', cause: 'cannon', at: { x: b.x, y: b.y0 + 3, z: b.z } } ); };
for ( const id of [ 'mer-119', 'mer-121', 'mer-123', 'mer-126' ] ) hit( id, 0.3 );
for ( const id of [ 'mer-122', 'mer-168', 'mer-125' ] ) hit( id, 0.7 );
m.ignite( 'mer-124', 1, 'player' );
for ( const id of [ 'mer-120', 'mer-118' ] ) hit( id, 1.2 );
for ( let i = 0; i < 12; i ++ ) { const T = m.byId.get( 'twin-south' ); if ( T ) m.cannon( T.x - T.hw, T.y0 + 4 + i * 2, T.z, 20, 'player', T.id ); }
await shoot( 'street', 'during', 70 );
await shoot( 'close', 'during', 20 );
await shoot( 'rubble', 'during', 10 );
// let it settle: the fires out (the crews), then the hours pass: the rubble cleared on one, scaffolding up
await frames( 300 );
for ( let i = 0; i < 4000 && m.list.some( ( b ) => b.fire > 0 ); i ++ ) m.update( 0.5, { rain: 0, hours: 0 } );
m.update( 0.1, { hours: 1.2 } );
m.update( 0.1, { hours: 3 } );
cw._redraw = true;
await shoot( 'street', 'after', 60 );
await shoot( 'close', 'after', 40 );
await shoot( 'rubble', 'after', 30 );
// (the marks mended over those hours: the Twins under fire again for their shots)
for ( let i = 0; i < 10; i ++ ) { const T = m.byId.get( 'twin-south' ); if ( T ) m.cannon( T.x - T.hw, T.y0 + 4 + i * 2, T.z, 20, 'player', T.id ); }
cw._redraw = true;
await shoot( 'twins', 'twins', 40 );
await shoot( 'base', 'twins', 40 );
set.undo();
writeFileSync( join( out, `${ profile }-info.json` ), JSON.stringify( cw.info(), null, '\t' ) );
if ( gpuErrors.length ) console.log( `${ gpuErrors.length } GPU errors, first: ${ JSON.stringify( gpuErrors[ 0 ] ).slice( 0, 400 ) }` );
process.exit( gpuErrors.length ? 1 : 0 );
