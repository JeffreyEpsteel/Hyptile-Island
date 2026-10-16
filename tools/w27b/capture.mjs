// Wave 18A: the visual reference set. Boots the whole App on Dawn (tools/perf/headless-env.mjs, like
// tools/perf/headless.mjs), then for every view sets the time, weather and place, lets it settle and writes a PNG.
// The textures are the real ones: JPEG / PNG blobs are decoded by Windows (decode-images.ps1) into a cache on the
// first run; a run that met new images decodes them and says to run again (headless.mjs draws them flat grey).
//
//   node tools/visuals/capture.mjs --dawn=<dir> [--profile=medium|low|high|phone] [--out=tools/visuals/out/before]
//                                  [--size=1280x720] [--only=homeNoon,storm] [--cache=<dir>] [--frames=90] [--perf] [--ab]
//
// --perf: also the GPU frame time of each view (median of 60 frames, waited on the queue: one machine, one tree, so only
// before / after differences on the same run order mean anything).
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

// wave 27B: the Inverted Isles from the home dock (1 km), from half way and from the lagoon (forks of tools/visuals/capture.mjs)
const AT = ( x, y, z, yaw, pitch ) => ( { kind: 'fly', pose: { x, y, z, yaw, pitch } } );
export const VIEWS = {
	islesHome: { time: 12, weather: 'clear', place: AT( 60, 3.2, 42, 2.41, 0.13 ) },
	islesHomeGolden: { time: 17.5, weather: 'clear', place: AT( 60, 3.2, 42, 2.41, 0.13 ) },
	islesHalf: { time: 12, weather: 'clear', place: AT( - 300, 12, 330, 2.4, 0.14 ) },
	islesNear: { time: 12, weather: 'clear', place: AT( - 520, 20, 590, 2.35, 0.32 ) },
	islesLagoon: { time: 16, weather: 'clear', place: AT( - 640, 10, 660, 2.6, 0.6 ) },
};

const [ W, H ] = arg( 'size', '1280x720' ).split( 'x' ).map( Number );
const profile = arg( 'profile', 'medium' );
const phone = profile === 'phone';
const tier = phone ? 'low' : profile;
const out = resolve( arg( 'out', join( import.meta.dirname, 'out', 'before' ) ) );
const cache = resolve( arg( 'cache', join( tmpdir(), 'hyptile-visuals-images' ) ) );
const only = arg( 'only' ) ? arg( 'only' ).split( ',' ) : Object.keys( VIEWS ).filter( ( k ) => ! VIEWS[ k ].extra );
const settle = Number( arg( 'frames', '90' ) );
mkdirSync( out, { recursive: true } );
mkdirSync( cache, { recursive: true } );

const search = '?bench&noAudio&quality=' + ( phone ? 'off' : tier ) + ( phone ? '&phone' : '' );
const flags = arg( 'backend', 'vulkan' ) ? [ 'backend=' + arg( 'backend', 'vulkan' ) ] : [];
await installEnv( { search, width: W, height: H, power: 'high-performance', flags, dawnDir: arg( 'dawn' ) } );
if ( phone ) globalThis.__phoneBudget = { ...( await import( '../../src/core/Quality.js' ) ).PHONE_BUDGET };

// real textures: <sha1>.png in the cache (decoded by Windows), else queued as <sha1>.img and grey for this run
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
	const g = new Uint8Array( 16 ).fill( 128 );
	return { data: g, width: 2, height: 2 };

};

await import( '../../src/core/BenchSeed.js' );
const { App } = await import( '../../src/App.js' );
const { GPU } = await import( '../../src/engine/gpu/GPU.js' );
const { setupScenario } = await import( '../perf/runner.js' );
const { canvasPNG } = await import( '../perf/shot.mjs' );
const gpuErrors = [];
GPU.onError( ( e ) => gpuErrors.push( e ) );

const t0 = performance.now();
const app = new App();
await app.init( () => {} );
console.log( `init ${ ( ( performance.now() - t0 ) / 1000 ).toFixed( 1 ) } s, ${ missing } images not decoded yet` );
const Q = await import( '../../src/core/Quality.js' );
if ( phone ) {

	app.quality = new Q.Quality( app, { storage: null, query: new URLSearchParams( '' ), mobile: Q.MOBILE.phone } );
	app.quality.loop.auto = false; // (the phone's start tier, held)

}
else app.quality = new Q.Quality( app, { storage: null, query: new URLSearchParams( '?quality=' + tier ) } );
app.startSession( null, { mode: 'sandbox', restore: false, session: false } );
app.quality.apply();
// wave 18F diagnostics: --water-hull=0|1 forces the sea's hull-mask variant; --shadow-soft=0|1 the shadow filter level
if ( arg( 'water-hull' ) !== null && app.waterMaterial ) app.waterMaterial.hullOverride = Number( arg( 'water-hull' ) );
if ( arg( 'water-debug' ) !== null && app.waterMaterial ) app.waterMaterial.debugMode.value = Number( arg( 'water-debug' ) );
// --eval=<js>: a diagnostic statement run once with `app` in scope after the view is set up (e.g. hide a system)
const evalCode = arg( 'eval' ) ? new Function( 'app', arg( 'eval' ) ) : null;
if ( arg( 'shadow-soft' ) !== null && app.shadows && app.shadows.setSoft ) app.shadows.setSoft( Number( arg( 'shadow-soft' ) ) );
if ( app.ui && app.ui.hide ) try { app.ui.hide(); } catch ( e ) { /* (no HUD in shots) */ }
console.log( 'quality ' + app.quality.describe() );

const perf = {};
for ( const id of only ) {

	let v = VIEWS[ id ];
	// --place=x,z[,heading]: the same view somewhere else (does an artefact follow the boat or stay on the map?)
	if ( v && arg( 'place' ) && v.place.kind === 'deck' ) {

		const [ px, pz, ph ] = arg( 'place' ).split( ',' ).map( Number );
		v = { ...v, place: { ...v.place, x: px, z: pz, heading: ph ?? v.place.heading } };

	}
	if ( ! v ) { console.log( 'unknown view ' + id ); continue; }
	const set = await setupScenario( app, { id, name: id, ships: [], fire: null, peers: 0, intensity: v.intensity ?? 0, ...v } );
	if ( evalCode ) evalCode( app );
	else if ( v.eval ) new Function( 'app', v.eval )( app );
	const n = v.frames || settle;
	for ( let i = 0; i < n; i ++ ) {

		set.tick( 1 / 60, i / 60 );
		app.frame( 1 / 60 );
		if ( ( i & 7 ) === 7 ) await GPU.queue.onSubmittedWorkDone();

	}

	await GPU.queue.onSubmittedWorkDone();
	await canvasPNG( GPU, join( out, `${ profile }-${ id }.png` ) );
	if ( process.argv.includes( '--perf' ) ) {

		const ms = [];
		for ( let i = 0; i < 60; i ++ ) {

			set.tick( 1 / 60, ( n + i ) / 60 );
			const a = performance.now();
			app.frame( 1 / 60 );
			await GPU.queue.onSubmittedWorkDone();
			ms.push( performance.now() - a );

		}

		ms.sort( ( a, b ) => a - b );
		perf[ id ] = Math.round( ms[ 30 ] * 100 ) / 100;

	}

	// --ab: the frame with the wave 18A grade on and off, interleaved in blocks of 10 frames (one process, same load)
	if ( process.argv.includes( '--ab' ) && app.post && app.post.params.grade ) {

		const on = [], off = [], P = app.post.params.grade;
		for ( let b = 0; b < 12; b ++ ) {

			P.value = b & 1 ? 0 : 1;
			for ( let i = 0; i < 10; i ++ ) {

				set.tick( 1 / 60, 0 );
				const a = performance.now();
				app.frame( 1 / 60 );
				await GPU.queue.onSubmittedWorkDone();
				( b & 1 ? off : on ).push( performance.now() - a );

			}

		}

		P.value = 1;
		const med = ( v ) => v.sort( ( x, y ) => x - y )[ v.length >> 1 ];
		perf[ id + ':gradeOn' ] = Math.round( med( on ) * 100 ) / 100;
		perf[ id + ':gradeOff' ] = Math.round( med( off ) * 100 ) / 100;
		console.log( `  ${ id } grade on ${ perf[ id + ':gradeOn' ] } ms, off ${ perf[ id + ':gradeOff' ] } ms` );

	}

	// --ab-soft (wave 18F): the same interleaved A / B with the soft shadow filter on and off
	if ( process.argv.includes( '--ab-soft' ) && app.shadows && app.shadows.setSoft ) {

		const on = [], off = [];
		for ( let b = 0; b < 16; b ++ ) {

			app.shadows.setSoft( b & 1 ? 0 : 1 );
			for ( let i = 0; i < 10; i ++ ) {

				set.tick( 1 / 60, 0 );
				const a = performance.now();
				app.frame( 1 / 60 );
				await GPU.queue.onSubmittedWorkDone();
				if ( i >= 2 ) ( b & 1 ? off : on ).push( performance.now() - a );

			}

		}

		app.shadows.setSoft( arg( 'shadow-soft' ) !== null ? Number( arg( 'shadow-soft' ) ) : null );
		const med = ( v ) => v.sort( ( x, y ) => x - y )[ v.length >> 1 ];
		perf[ id + ':softOn' ] = Math.round( med( on ) * 100 ) / 100;
		perf[ id + ':softOff' ] = Math.round( med( off ) * 100 ) / 100;
		console.log( `  ${ id } soft shadows on ${ perf[ id + ':softOn' ] } ms, off ${ perf[ id + ':softOff' ] } ms` );

	}

	// --ab-eval=<js A>|<js B> (wave 24D): any two states, interleaved in blocks of 10 frames (A first, then B), `app` in
	// scope; the GPU frame times of both (one process, same load: the other workers' GPU use spreads over both)
	if ( arg( 'ab-eval' ) ) {

		const [ fa, fb ] = arg( 'ab-eval' ).split( '|' ).map( ( c ) => new Function( 'app', c ) );
		const A = [], B = [];
		for ( let b = 0; b < 24; b ++ ) {

			( b & 1 ? fb : fa )( app );
			for ( let i = 0; i < 10; i ++ ) {

				set.tick( 1 / 60, 0 );
				const a = performance.now();
				app.frame( 1 / 60 );
				await GPU.queue.onSubmittedWorkDone();
				if ( i >= 3 ) ( b & 1 ? B : A ).push( performance.now() - a );

			}

		}

		fa( app );
		const med = ( v ) => v.sort( ( x, y ) => x - y )[ v.length >> 1 ];
		perf[ id + ':A' ] = Math.round( med( A ) * 100 ) / 100;
		perf[ id + ':B' ] = Math.round( med( B ) * 100 ) / 100;
		console.log( `  ${ id } A ${ perf[ id + ':A' ] } ms, B ${ perf[ id + ':B' ] } ms` );

	}

	set.undo();
	console.log( `  ${ id }${ perf[ id ] ? ' ' + perf[ id ] + ' ms' : '' }${ set.info && set.info.notes && set.info.notes.length ? ' (' + set.info.notes.join( '; ' ) + ')' : '' }` );

}

if ( process.argv.includes( '--perf' ) || process.argv.includes( '--ab' ) || process.argv.includes( '--ab-soft' ) || arg( 'ab-eval' ) ) writeFileSync( join( out, `perf-${ profile }.json` ), JSON.stringify( perf, null, '\t' ) );
if ( gpuErrors.length ) console.log( `${ gpuErrors.length } GPU errors, first: ${ JSON.stringify( gpuErrors[ 0 ] ).slice( 0, 400 ) }` );
// images met for the first time: decode them now (the next run draws them)
const pending = readdirSync( cache ).filter( ( f ) => f.endsWith( '.img' ) && ! existsSync( join( cache, f.replace( '.img', '.png' ) ) ) );
if ( pending.length ) {

	console.log( `decoding ${ pending.length } images (run again for real textures)` );
	console.log( execFileSync( 'powershell', [ '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join( import.meta.dirname, 'decode-images.ps1' ), '-Dir', cache, '-Max', '1024' ], { encoding: 'utf8' } ).trim() );

}

process.exit( gpuErrors.length ? 1 : 0 );
