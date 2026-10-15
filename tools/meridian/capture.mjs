// Wave 21A: Meridian's captures. tools/visuals/capture.mjs trimmed to the Meridian views: boots the whole App on Dawn
// (tools/perf/headless-env.mjs), attaches Meridian's terrain tile while TerrainData builds (what the root patch to
// TerrainData does) and builds the city if the App has not (the Ports patch), then writes a PNG per view.
//
//   node tools/meridian/capture.mjs --dawn=<dir> [--profile=medium|phone] [--out=<dir>] [--only=a,b] [--size=1280x720] [--perf]
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

// Meridian's centre is (-2700, -300); fly poses look along yaw (0 = north / -z, PI / 2 = west)
const C = { x: - 2700, z: - 300 };
export const VIEWS = {
	meridianSkylineGolden: { time: 17.7, weather: 'clear', place: { kind: 'fly', pose: { x: C.x + 1150, y: 14, z: C.z + 120, yaw: 1.62, pitch: 0.06 } } },
	meridianDowntownNoon: { time: 12, weather: 'clear', place: { kind: 'fly', pose: { x: C.x + 287, y: 5.4, z: C.z + 250, yaw: 0.38, pitch: 0.28 } } },
	meridianHarbour: { time: 15, weather: 'clear', place: { kind: 'fly', pose: { x: C.x + 700, y: 9, z: C.z + 60, yaw: 1.45, pitch: - 0.06 } } },
	meridianNight: { time: 22.5, weather: 'clear', place: { kind: 'fly', pose: { x: C.x + 1000, y: 40, z: C.z + 260, yaw: 1.3, pitch: 0.02 } } },
	meridianStreetNight: { time: 22.5, weather: 'clear', place: { kind: 'fly', pose: { x: C.x - 67, y: 6, z: C.z + 300, yaw: 0, pitch: 0.08 } } },
	meridianAerial: { time: 14, weather: 'clear', place: { kind: 'fly', pose: { x: C.x + 820, y: 420, z: C.z + 820, yaw: 0.785, pitch: - 0.42 } } },
	// for the frame-cost comparison (--perf): Tidemark's town from a similar distance and height
	tidemarkCompare: { time: 12, weather: 'clear', place: { kind: 'fly', pose: { x: 1430, y: 30, z: - 20, yaw: - 1.75, pitch: - 0.08 } } },
	meridianCompare: { time: 12, weather: 'clear', place: { kind: 'fly', pose: { x: C.x + 700, y: 30, z: C.z + 40, yaw: 1.55, pitch: - 0.02 } } },
	meridianFromHome: { time: 16.5, weather: 'clear', place: { kind: 'fly', pose: { x: - 150, y: 4.5, z: 300, yaw: 1.36, pitch: 0.05 } } }, // (from the home bay's mouth: the west headland hides the city from the pier)
	// wave 23A: the skyline at night with a tower burning floor by floor; a skyscraper's fall (mid-collapse) and its rubble;
	// an upper section toppling (setup( app ): citywreck's model driven directly, as a barrage would)
	meridianSkylineNight: { time: 22.5, weather: 'clear', place: { kind: 'fly', pose: { x: C.x + 1150, y: 14, z: C.z + 120, yaw: 1.62, pitch: 0.06 } },
		setup: ( app ) => { const m = wreck( app ); const R = m.byId.get( 'halo-tower' ); m.ignite( R, 1, 'player', 110 ); for ( let i = 0; i < 120; i ++ ) m.update( 0.5, { rain: 0 } ); } },
	meridianTowerFall: { time: 15.5, weather: 'clear', frames: 200, place: { kind: 'fly', pose: { x: C.x - 130, y: 300, z: C.z - 200, yaw: - 2.193, pitch: - 0.3 } },
		setup: ( app ) => { const m = wreck( app ), S = m.byId.get( 'meridian-spire' ); m.hit( S, S.hp * 2, { by: 'player', cause: 'blast', at: { x: S.x, y: S.y0 + 10, z: S.z } } ); } },
	meridianTowerRubble: { time: 15.5, weather: 'clear', frames: 40, place: { kind: 'fly', pose: { x: C.x - 130, y: 300, z: C.z - 200, yaw: - 2.193, pitch: - 0.55 } },
		setup: ( app ) => { const m = wreck( app ); m.apply( [ [ 'meridian-spire', 3, 0, 0 ] ], { silent: true } ); } },
	meridianSectionFall: { time: 16, weather: 'clear', frames: 150, place: { kind: 'fly', pose: { x: - 2590 + 250, y: 260, z: - 131 + 250, yaw: 0.785, pitch: - 0.32 } },
		setup: ( app ) => { const m = wreck( app ), H = m.byId.get( 'helix-tower' ); m.hit( H, H.hp, { by: 'player', cause: 'blast', at: { x: H.x, y: H.y0 + 20, z: H.z } } ); m.hit( H, H.hp * 0.15, { by: 'player', cause: 'cannon', at: { x: H.x, y: H.y0 + 170, z: H.z } } ); } },
	meridianSectionAfter: { time: 16, weather: 'clear', frames: 40, place: { kind: 'fly', pose: { x: - 2590 + 250, y: 260, z: - 131 + 250, yaw: 0.785, pitch: - 0.4 } },
		setup: ( app ) => { const m = wreck( app ), H = m.byId.get( 'helix-tower' ); m.apply( [ [ H.id, 2, 60, 0, Math.round( ( H.top * 0.72 ) / H.fh ) * H.fh, 30, 38 ] ], { silent: true } ); } },
};

// citywreck's model, the city as new (each damage view starts from a whole city)
function wreck( app ) {

	const cw = app.features && app.features.get ? app.features.get( 'citywreck' ) : null;
	if ( ! cw ) throw new Error( 'no citywreck feature' );
	if ( ! cw.model ) cw.update( 1.2 );
	cw.reset();
	return cw.model;

}

const [ W, H ] = arg( 'size', '1280x720' ).split( 'x' ).map( Number );
const profile = arg( 'profile', 'medium' );
const phone = profile === 'phone';
const tier = phone ? 'low' : profile;
const out = resolve( arg( 'out', join( tmpdir(), 'meridian-captures' ) ) );
const cache = resolve( arg( 'cache', join( tmpdir(), 'hyptile-visuals-images' ) ) );
const only = arg( 'only' ) ? arg( 'only' ).split( ',' ) : Object.keys( VIEWS );
const settle = Number( arg( 'frames', '90' ) );
mkdirSync( out, { recursive: true } );
mkdirSync( cache, { recursive: true } );

const search = '?bench&noAudio&quality=' + ( phone ? 'off' : tier ) + ( phone ? '&phone' : '' );
await installEnv( { search, width: W, height: H, power: 'high-performance', flags: [ 'backend=' + arg( 'backend', 'vulkan' ) ], dawnDir: arg( 'dawn' ) } );
if ( phone ) globalThis.__phoneBudget = { ...( await import( '../../src/core/Quality.js' ) ).PHONE_BUDGET };

const { decodePNG } = await import( '../../src/world/marine/WhaleTextures.js' );
const { capImage } = await import( '../../src/engine/gpu/Texture.js' );
if ( phone ) globalThis.__assetImageCap = globalThis.__phoneBudget.textureMax;
let missing = 0;
globalThis.__assetImage = async ( bytes ) => {

	const u = bytes instanceof Uint8Array ? bytes : new Uint8Array( bytes );
	const h = createHash( 'sha1' ).update( u ).digest( 'hex' );
	const png = join( cache, h + '.png' );
	if ( existsSync( png ) ) {

		const b = readFileSync( png );
		const img = await decodePNG( b.buffer.slice( b.byteOffset, b.byteOffset + b.byteLength ) );
		return globalThis.__assetImageCap ? capImage( img, globalThis.__assetImageCap ) : img;

	}

	if ( ! existsSync( join( cache, h + '.img' ) ) ) writeFileSync( join( cache, h + '.img' ), u );
	missing ++;
	return { data: new Uint8Array( 16 ).fill( 128 ), width: 2, height: 2 };

};

await import( '../../src/core/BenchSeed.js' );
// the root patch's effect: Meridian's tile attached while TerrainData builds (before the GPU reads the tiles)
const { TerrainData } = await import( '../../src/world/TerrainData.js' );
const { ensureMeridian } = await import( '../../src/world/islands/MeridianTerrain.js' );
const minMax = TerrainData.prototype.buildMinMax;
TerrainData.prototype.buildMinMax = function () {

	const r = minMax.apply( this, arguments );
	ensureMeridian( this );
	return r;

};
const { App } = await import( '../../src/App.js' );
const { GPU } = await import( '../../src/engine/gpu/GPU.js' );
const { setupScenario } = await import( '../perf/runner.js' );
const { canvasPNG } = await import( '../perf/shot.mjs' );
const { Meridian } = await import( '../../src/world/islands/meridian/Meridian.js' );
const gpuErrors = [];
GPU.onError( ( e ) => gpuErrors.push( e ) );

const t0 = performance.now();
const app = new App();
await app.init( () => {} );
console.log( `init ${ ( ( performance.now() - t0 ) / 1000 ).toFixed( 1 ) } s, ${ missing } images not decoded yet` );
let city = app.meridian || ( app.ports && app.ports.meridian );
if ( ! city ) {

	const t1 = performance.now();
	city = new Meridian( { scene: app.scene, terrain: app.terrainData, colliders: app.colliders } );
	app.meridian = city;
	await city.kitReady;
	console.log( `meridian built here in ${ Math.round( performance.now() - t1 ) } ms`, JSON.stringify( city.stats ) );

}

const Q = await import( '../../src/core/Quality.js' );
if ( phone ) {

	app.quality = new Q.Quality( app, { storage: null, query: new URLSearchParams( '' ), mobile: Q.MOBILE.phone } );
	app.quality.loop.auto = false;

} else app.quality = new Q.Quality( app, { storage: null, query: new URLSearchParams( '?quality=' + tier ) } );
app.startSession( null, { mode: 'sandbox', restore: false, session: false } );
app.quality.apply();
const evalCode = arg( 'eval' ) ? new Function( 'app', 'city', arg( 'eval' ) ) : null;
if ( app.ui && app.ui.hide ) try { app.ui.hide(); } catch ( e ) { /* (no HUD in shots) */ }
console.log( 'quality ' + app.quality.describe() );

const perf = {};
for ( const id of only ) {

	const v = VIEWS[ id ];
	if ( ! v ) { console.log( 'unknown view ' + id ); continue; }
	const set = await setupScenario( app, { id, name: id, ships: [], fire: null, peers: 0, intensity: 0, ...v } );
	if ( v.setup ) v.setup( app, city );
	if ( evalCode ) evalCode( app, city );
	const n = v.frames || settle;
	for ( let i = 0; i < n; i ++ ) {

		set.tick( 1 / 60, i / 60 );
		if ( city !== app.meridian || ! app.ports || ! app.ports.meridian ) city.update( 1 / 60 );
		app.frame( 1 / 60 );
		if ( ( i & 7 ) === 7 ) await GPU.queue.onSubmittedWorkDone();

	}

	await GPU.queue.onSubmittedWorkDone();
	await canvasPNG( GPU, join( out, `${ profile }-${ id }.png` ) );
	if ( process.argv.includes( '--perf' ) ) {

		const ms = [];
		for ( let i = 0; i < 60; i ++ ) {

			set.tick( 1 / 60, ( n + i ) / 60 );
			city.update( 1 / 60 );
			const a = performance.now();
			app.frame( 1 / 60 );
			await GPU.queue.onSubmittedWorkDone();
			ms.push( performance.now() - a );

		}

		ms.sort( ( a, b ) => a - b );
		perf[ id ] = Math.round( ms[ 30 ] * 100 ) / 100;

	}

	set.undo();
	console.log( `  ${ id }${ perf[ id ] ? ' ' + perf[ id ] + ' ms' : '' }` );

}

if ( process.argv.includes( '--perf' ) ) writeFileSync( join( out, `perf-${ profile }.json` ), JSON.stringify( perf, null, '\t' ) );
if ( app.renderer && app.renderer.info ) console.log( 'renderer', JSON.stringify( app.renderer.info ).slice( 0, 300 ) );
if ( gpuErrors.length ) console.log( `${ gpuErrors.length } GPU errors, first: ${ JSON.stringify( gpuErrors[ 0 ] ).slice( 0, 600 ) }` );
const pending = readdirSync( cache ).filter( ( f ) => f.endsWith( '.img' ) && ! existsSync( join( cache, f.replace( '.img', '.png' ) ) ) );
if ( pending.length ) {

	console.log( `decoding ${ pending.length } images (run again for real textures)` );
	console.log( execFileSync( 'powershell', [ '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join( import.meta.dirname, '..', 'visuals', 'decode-images.ps1' ), '-Dir', cache, '-Max', '1024' ], { encoding: 'utf8' } ).trim() );

}

process.exit( gpuErrors.length ? 1 : 0 );
