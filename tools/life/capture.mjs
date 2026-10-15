// Wave 24E: town life captures. Boots the whole App on Dawn like tools/visuals/capture.mjs, then for each town and time
// of day puts a free camera at a street-level pose looking over the market / quay (computed from townlife's own plans),
// lets the townsfolk settle and writes a PNG, plus townlife's CPU per frame (the feature's update, median over 60 frames).
//
//   node tools/life/capture.mjs --dawn=<dir> [--out=<dir>] [--profile=medium|phone] [--only=home,tidemark] [--times=8,12.5,18.5,22]
//                               [--weather=rain] [--frames=240] [--tag=before] [--eval=<js run once per view with app, tl>]
import { installEnv } from '../perf/headless-env.mjs';
import { register } from 'node:module';
register( '../perf/stub-loader.mjs', import.meta.url );
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const arg = ( k, d = null ) => {

	const a = process.argv.find( ( x ) => x.startsWith( '--' + k + '=' ) );
	return a ? a.slice( k.length + 3 ) : d;

};

const [ W, H ] = arg( 'size', '1280x720' ).split( 'x' ).map( Number );
const profile = arg( 'profile', 'medium' );
const phone = profile === 'phone';
const tier = phone ? 'low' : profile;
const out = resolve( arg( 'out', join( import.meta.dirname, 'out' ) ) );
const tag = arg( 'tag', 'shot' );
const cache = resolve( arg( 'cache', join( tmpdir(), 'hyptile-visuals-images' ) ) );
const towns = ( arg( 'only', 'home,tidemark,blackwater,meridian' ) ).split( ',' );
const times = ( arg( 'times', '8,12.5,18.5,22' ) ).split( ',' ).map( Number );
const weather = arg( 'weather', 'clear' );
const settle = Number( arg( 'frames', '240' ) );
mkdirSync( out, { recursive: true } );
mkdirSync( cache, { recursive: true } );

const search = '?bench&noAudio&quality=' + ( phone ? 'off' : tier ) + ( phone ? '&phone' : '' );
await installEnv( { search, width: W, height: H, power: 'high-performance', flags: [ 'backend=vulkan' ], dawnDir: arg( 'dawn' ) } );
if ( phone ) globalThis.__phoneBudget = { ...( await import( '../../src/core/Quality.js' ) ).PHONE_BUDGET };

const { decodePNG } = await import( '../../src/world/marine/WhaleTextures.js' );
let missing = 0;
globalThis.__assetImage = async ( bytes ) => {

	const u = bytes instanceof Uint8Array ? bytes : new Uint8Array( bytes );
	const h = createHash( 'sha1' ).update( u ).digest( 'hex' );
	const png = join( cache, h + '.png' );
	if ( existsSync( png ) ) {

		const b = readFileSync( png );
		return decodePNG( b.buffer.slice( b.byteOffset, b.byteOffset + b.byteLength ) );

	}

	if ( ! existsSync( join( cache, h + '.img' ) ) ) writeFileSync( join( cache, h + '.img' ), u );
	missing ++;
	return { data: new Uint8Array( 16 ).fill( 128 ), width: 2, height: 2 };

};

await import( '../../src/core/BenchSeed.js' );
const { App } = await import( '../../src/App.js' );
const { GPU } = await import( '../../src/engine/gpu/GPU.js' );
const { setupScenario } = await import( '../perf/runner.js' );
const { canvasPNG } = await import( '../perf/shot.mjs' );
const { planById } = await import( '../../src/features/townlife/Towns.js' );
const gpuErrors = [];
GPU.onError( ( e ) => gpuErrors.push( e ) );

const t0 = performance.now();
const app = new App();
await app.init( () => {} );
console.log( `init ${ ( ( performance.now() - t0 ) / 1000 ).toFixed( 1 ) } s, ${ missing } images not decoded yet` );
const Q = await import( '../../src/core/Quality.js' );
if ( phone ) {

	app.quality = new Q.Quality( app, { storage: null, query: new URLSearchParams( '' ), mobile: Q.MOBILE.phone } );
	app.quality.loop.auto = false;

} else app.quality = new Q.Quality( app, { storage: null, query: new URLSearchParams( '?quality=' + tier ) } );
app.startSession( null, { mode: 'sandbox', restore: false, session: false } );
app.quality.apply();
if ( app.ui && app.ui.hide ) try { app.ui.hide(); } catch ( e ) { /* (no HUD) */ }
const tl = app.features && app.features.get ? app.features.get( 'townlife' ) : null;
if ( ! tl ) console.log( 'no townlife feature' );
// townlife's CPU: its update timed
let tlMs = 0;
if ( tl ) {

	const u = tl.update.bind( tl );
	tl.update = ( dt ) => { const a = performance.now(); u( dt ); tlMs = performance.now() - a; };

}

const evalCode = arg( 'eval' ) ? new Function( 'app', 'tl', arg( 'eval' ) ) : null;
// --print=<js expression>: printed (JSON) after each view settles, with app and tl in scope
const printCode = arg( 'print' ) ? new Function( 'app', 'tl', 'return ( ' + arg( 'print' ) + ' );' ) : null;

// the camera: a few metres up, back from the market (stall) toward the town centre side, looking at it
const POSES = {
	home: () => ( { x: 47, y: 3.4, z: - 99, look: { x: 40.2, z: - 113.2 } } ),
	tidemark: () => {

		const p = planById( 'tidemark' ), s = p.stalls[ 0 ];
		return { x: s.x + ( p.center.x - s.x ) * 0.0 + 12, y: 4.5, z: s.z + 12, look: { x: s.x, z: s.z } };

	},
	blackwater: () => {

		const p = planById( 'blackwater' );
		const d = p.tavern.door;
		return { x: p.center.x + ( p.center.x - d.x ) * 2.5, y: 4, z: p.center.z + ( p.center.z - d.z ) * 2.5, look: { x: d.x, z: d.z } };

	},
	meridian: () => {

		const p = planById( 'meridian' ), s = p.stalls[ 0 ];
		return { x: s.x - 14, y: 4.5, z: s.z + 10, look: { x: s.x, z: s.z } };

	},
};
const override = arg( 'pose' ) ? JSON.parse( arg( 'pose' ) ) : null;

const perf = {};
for ( const town of towns ) for ( const time of times ) {

	const P = override || POSES[ town ]();
	const yaw = Math.atan2( - ( P.look.x - P.x ), - ( P.look.z - P.z ) );
	const id = `${ town }-${ String( time ).replace( '.', 'h' ) }${ weather !== 'clear' ? '-' + weather : '' }`;
	const T = app.terrainData || app.terrain;
	const gy = Math.max( 0, T && T.heightAt ? T.heightAt( P.x, P.z ) : 0 ) + P.y; // (a pose's y: over the ground)
	const set = await setupScenario( app, { id, name: id, ships: [], fire: null, peers: 0, intensity: 1, time, weather, place: { kind: 'fly', pose: { x: P.x, y: gy, z: P.z, yaw, pitch: P.pitch ?? - 0.12 } } } );
	if ( evalCode ) evalCode( app, tl );
	const ms = [];
	for ( let i = 0; i < settle; i ++ ) {

		set.tick( 1 / 60, i / 60 );
		app.frame( 1 / 60 );
		if ( i >= settle - 60 ) ms.push( tlMs );
		if ( ( i & 7 ) === 7 ) await GPU.queue.onSubmittedWorkDone();

	}

	if ( printCode ) try { console.log( '  ' + id + ': ' + JSON.stringify( printCode( app, tl ) ) ); } catch ( e ) { console.log( '  print failed', e.message ); }
	await GPU.queue.onSubmittedWorkDone();
	await canvasPNG( GPU, join( out, `${ tag }-${ id }.png` ) );
	ms.sort( ( a, b ) => a - b );
	const bodies = tl ? tl.bound.size : 0;
	const crowd = tl && tl.meshes ? tl.meshes.pegs.n ?? tl.meshes.pegs.mesh.count : 0;
	perf[ id ] = { townlifeMs: Math.round( ms[ ms.length >> 1 ] * 1000 ) / 1000, bodies, crowd };
	set.undo();
	console.log( `  ${ id } townlife ${ perf[ id ].townlifeMs } ms, ${ bodies } bodies, ${ crowd } crowd` );

}

writeFileSync( join( out, `${ tag }-perf-${ profile }.json` ), JSON.stringify( perf, null, '\t' ) );
if ( gpuErrors.length ) console.log( `${ gpuErrors.length } GPU errors, first: ${ JSON.stringify( gpuErrors[ 0 ] ).slice( 0, 400 ) }` );
const pending = readdirSync( cache ).filter( ( f ) => f.endsWith( '.img' ) && ! existsSync( join( cache, f.replace( '.img', '.png' ) ) ) );
if ( pending.length ) {

	console.log( `decoding ${ pending.length } images (run again for real textures)` );
	console.log( execFileSync( 'powershell', [ '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join( import.meta.dirname, '..', 'visuals', 'decode-images.ps1' ), '-Dir', cache, '-Max', '1024' ], { encoding: 'utf8' } ).trim() );

}

process.exit( gpuErrors.length ? 1 : 0 );
