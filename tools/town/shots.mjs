// Before / after pictures of the towns (wave 18C): the whole App headless on Dawn (tools/perf/headless-env.mjs, as
// tools/perf/headless.mjs boots it), several fly-camera views in one run, each a PNG.
//
//   node tools/town/shots.mjs --dawn=<dawn dir with vulkan-1.dll> --out=<dir> [--views=tmBay,tmQuay,...] [--size=1280x720]
//                             [--quality=high] [--tag=before]
//
// Images are grey 2x2 stand-ins in Node (no codecs): textured GLBs show flat; the towns' procedural / baked materials draw.
import { installEnv } from '../perf/headless-env.mjs';
import { register } from 'node:module';
register( '../perf/stub-loader.mjs', import.meta.url );
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const arg = ( k, d = null ) => {

	const a = process.argv.find( ( x ) => x.startsWith( '--' + k + '=' ) );
	return a ? a.slice( k.length + 3 ) : d;

};

const dir = ( a, b ) => { const dx = b[ 0 ] - a[ 0 ], dy = b[ 1 ] - a[ 1 ], dz = b[ 2 ] - a[ 2 ], l = Math.hypot( dx, dy, dz ); return [ dx / l, dy / l, dz / l ]; };
// p: camera, l: the point looked at, t: time of day
export const VIEWS = {
	tmBay: { p: [ 1985, 22, 75 ], l: [ 1820, 8, -5 ], t: 11 },
	tmQuay: { p: [ 1862, 5.2, 30 ], l: [ 1825, 5, -25 ], t: 10.5 },
	tmSquare: { p: [ 1850, 4.6, -2 ], l: [ 1815, 4.5, -30 ], t: 15 },
	tmStreet: { p: [ 1808, 5.5, 60 ], l: [ 1825, 4, -10 ], t: 16 },
	tmNight: { p: [ 1866, 6, 18 ], l: [ 1825, 5, -30 ], t: 22 },
	tmFar: { p: [ 2140, 45, 160 ], l: [ 1820, 10, -5 ], t: 13 },
	homeDay: { p: [ 92, 7, - 40 ], l: [ 40, 4, - 90 ], t: 11 },
	homeNight: { p: [ 92, 7, - 40 ], l: [ 40, 4, - 90 ], t: 22 },
	bwDay: { p: [ - 60, 14, 1560 ], l: [ - 140, 3, 1515 ], t: 11 },
	bwNight: { p: [ - 60, 14, 1560 ], l: [ - 140, 3, 1515 ], t: 22 },
	tmTavern: { p: [ 1862, 5.5, - 33 ], l: [ 1844.8, 6, - 43.7 ], t: 16.5 },
	tmChandler: { p: [ 1830, 5.5, 37 ], l: [ 1812.7, 6, 27.4 ], t: 10 },
	tmBack: { p: [ 1787, 6.5, 44 ], l: [ 1820, 4, - 30 ], t: 9.5 },
	bwTown: { p: [ - 205, 6, 1500 ], l: [ - 240, 3, 1490 ], t: 17 },
	bwTownNight: { p: [ - 205, 6, 1500 ], l: [ - 240, 3, 1490 ], t: 21.5 },
	tmFountain: { p: [ 1838.5, 5.6, - 4.5 ], l: [ 1829.6, 3.2, - 8.8 ], t: 11 },
	homeClose: { p: [ 42, 8, - 96 ], l: [ 20, 7, - 120 ], t: 10 },
};

const [ W, H ] = arg( 'size', '1280x720' ).split( 'x' ).map( Number );
const quality = arg( 'quality', 'high' );
const out = resolve( arg( 'out', join( import.meta.dirname, 'out' ) ) );
const tag = arg( 'tag', 'shot' );
const search = '?bench&noAudio&quality=' + quality + ( arg( 'search', '' ) || '' );
const flags = arg( 'backend', 'vulkan' ) ? [ 'backend=' + arg( 'backend', 'vulkan' ) ] : [];
await installEnv( { search, width: W, height: H, power: 'high-performance', flags, dawnDir: arg( 'dawn' ) } );
await import( '../../src/core/BenchSeed.js' );
const { App } = await import( '../../src/App.js' );
const { GPU } = await import( '../../src/engine/gpu/GPU.js' );
const { setupScenario } = await import( '../perf/runner.js' );
const { canvasPNG } = await import( '../perf/shot.mjs' );
const errors = [];
GPU.onError( ( e ) => errors.push( e ) );
const t0 = performance.now();
const app = new App();
await app.init( () => {} );
console.log( `init ${ ( ( performance.now() - t0 ) / 1000 ).toFixed( 1 ) } s` );
app.startSession( null, { mode: 'sandbox', restore: false, session: false } );
{

	const { Quality } = await import( '../../src/core/Quality.js' );
	app.quality = new Quality( app, { storage: null, query: new URLSearchParams( '?quality=' + quality ) } );

}

mkdirSync( out, { recursive: true } );
const names = ( arg( 'views', Object.keys( VIEWS ).join( ',' ) ) ).split( ',' ).filter( ( n ) => VIEWS[ n ] );
for ( const n of names ) {

	const v = VIEWS[ n ], d = dir( v.p, v.l );
	const s = { id: n, time: v.t, weather: 'clear', intensity: 0, ships: [], fire: null, peers: 0, place: { kind: 'fly', pose: { x: v.p[ 0 ], y: v.p[ 1 ], z: v.p[ 2 ], yaw: Math.atan2( - d[ 0 ], - d[ 2 ] ), pitch: Math.asin( d[ 1 ] ) } } };
	const set = await setupScenario( app, s );
	for ( let i = 0; i < 70; i ++ ) {

		set.tick( 1 / 60, i / 60 );
		app.frame( 1 / 60 );
		await GPU.queue.onSubmittedWorkDone();

	}

	const file = join( out, `${ tag }-${ n }.png` );
	await canvasPNG( GPU, file );
	set.undo();
	console.log( 'shot ' + file );

}

console.log( errors.length ? `${ errors.length } GPU errors: ${ errors.slice( 0, 3 ).map( ( e ) => e.message || e ).join( ' | ' ) }` : 'no GPU errors' );
process.exit( 0 );
