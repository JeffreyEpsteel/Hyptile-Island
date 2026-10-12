// The perf scenarios (tools/perf/scenarios.js) on the whole App in Node, on the real GPU through Dawn: no browser,
// no dev server. Boots App.init() in the browser stand-in (headless-env.mjs), starts a sandbox session like
// ?bench, then runs runPerf() with the bench's per-pass GPU timestamps and writes perf-<tag>.json.
//
//   node tools/perf/headless.mjs [--perf=all|every|navalFight,storm] [--tag=name] [--out=dir] [--size=2560x1267]
//                                [--power=high-performance|low-power] [--quality=low|medium|high|ultra|off] [--frames=n] [--warm=n]
//                                [--shot=file.png --shot-scenario=crowd]   (a picture of a scenario after the run)
//                                [--baseline]   (wave 4's culls off: the 'before' numbers)
//                                [--search="&noVeg"]   (extra query string switches for the App)
//                                [--dawn=<dir with dawn.node + dxcompiler.dll + dxil.dll>] [--backend=d3d12|vulkan]
//                                [--nan-check[=frames]]   (no perf run: Jade Landing in rain at a few headings; exit 1 when a
//                                                          NaN / Inf reaches the scene colour or the TAA input)
//   node tools/perf/report.mjs <out>/perf-<tag>.json
//
// Differences from the browser: textures are 2x2 grey (no image codecs in Node), nothing is presented, there is no
// audio. CPU numbers are V8 like Chrome's; GPU numbers are the adapter Dawn picked (--power chooses on a laptop with two).
import { installEnv } from './headless-env.mjs';
import { register } from 'node:module';
register( './stub-loader.mjs', import.meta.url ); // (packages another worker added but nobody installed yet: stubbed)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const arg = ( k, d = null ) => {

	const a = process.argv.find( ( x ) => x.startsWith( '--' + k + '=' ) );
	return a ? a.slice( k.length + 3 ) : d;

};

const [ W, H ] = ( arg( 'size', '2560x1267' ) ).split( 'x' ).map( Number );
const quality = arg( 'quality', 'off' );
const tag = arg( 'tag', 'headless' );
const out = resolve( arg( 'out', join( import.meta.dirname, 'out' ) ) );
const search = '?bench&noAudio' + ( quality !== 'off' ? '&quality=' + quality : '&quality=off' ) + ( arg( 'search', '' ) || '' );
// Chrome compiles WGSL through DXC on D3D12; Dawn for Node ships only FXC (tens of minutes for this game's
// pipelines). --dawn=<dir>: a copy of node_modules/webgpu/dist/win32-x64 plus Chrome's dxcompiler.dll and dxil.dll
// (from C:/Program Files/Google/Chrome/Application/<version>/): DXC like the browser (this Dawn build refused that
// DXC: 'Forcing toggle use_dxc to 0'). What works: --backend=vulkan with C:/Windows/System32/vulkan-1.dll copied into
// the same dir (Dawn loads it from beside dawn.node; the system path fails with error 87). Vulkan compiles in seconds.
function dawnFlags() {

	const f = [];
	if ( arg( 'dawn' ) && ! arg( 'backend' ) ) f.push( 'enable-dawn-features=use_dxc' );

	if ( arg( 'backend' ) ) f.push( 'backend=' + arg( 'backend' ) );
	return f;

}

const env = await installEnv( { search, width: W, height: H, power: arg( 'power', 'high-performance' ), flags: dawnFlags(), dawnDir: arg( 'dawn' ) } );
if ( process.argv.includes( '--baseline' ) ) globalThis.__perfBaseline = true; // (read by the engine as it is built)
await import( '../../src/core/BenchSeed.js' );
const { App } = await import( '../../src/App.js' );
const { Bench } = await import( '../../src/core/Bench.js' );
const { runPerf } = await import( './runner.js' );
const { GPU } = await import( '../../src/engine/gpu/GPU.js' );

const t0 = performance.now();
// pipeline compiles left (the precompile stage waits for them)
const tick = setInterval( () => { if ( GPU._pending && GPU._pending.size ) console.log( `  ${ ( ( performance.now() - t0 ) / 1000 ).toFixed( 0 ) } s: ${ GPU._pending.size } pipelines compiling` ); }, 15000 );
const app = new App();
let last = '';
await app.init( ( p, text ) => { if ( text !== last ) { last = text; process.stdout.write( `  ${ ( p * 100 ).toFixed( 0 ).padStart( 3 ) } % ${ text }\n` ); } } );
console.log( `init ${ ( ( performance.now() - t0 ) / 1000 ).toFixed( 1 ) } s` );
clearInterval( tick );
app.startSession( null, { mode: 'sandbox', restore: false, session: false } );
// --baseline: the perf work of wave 4 switched off (the 'before' column of docs/PERF.md)
if ( process.argv.includes( '--baseline' ) ) {

	const mr = app.engine.meshRenderer;
	mr.minPixels = 0;
	mr.matrixOncePerFrame = false;
	mr.packStatic = false;
	mr.distanceScale = 1;
	if ( app.shadows ) app.shadows.minTexels = 0;
	if ( app.residents && app.residents.setRadii ) app.residents.setRadii( { ...app.residents.radii, shadow: 1e6 } );
	globalThis.__perfBaseline = true; // systems with a cheaper path check this (headless runs only)

}

// --trace-pipelines: every mesh pipeline made after start-up (a material key that keeps changing re-compiles every frame)
if ( process.argv.includes( '--trace-pipelines' ) ) {

	const mr = app.engine.meshRenderer, orig = mr._createPipeline;
	const seen = new Map();
	mr._createPipeline = function ( material, vl, pass, key ) {

		const k = material.name + ' / ' + pass.kind;
		seen.set( k, ( seen.get( k ) || 0 ) + 1 );
		return orig.call( this, material, vl, pass, key );

	};
	process.on( 'exit', () => console.log( 'pipelines made while running:', [ ...seen ].sort( ( a, b ) => b[ 1 ] - a[ 1 ] ).slice( 0, 30 ) ) );

}

// --quality=low|medium|high|ultra: the tier applied (no auto loop: a fixed tier is measured); off: as the App starts
if ( quality !== 'off' ) {

	const { Quality } = await import( '../../src/core/Quality.js' );
	app.quality = new Quality( app, { storage: null, query: new URLSearchParams( '?quality=' + quality ) } );

}

// --trace-calls: count and time the render pass encoder calls (where the per-draw CPU goes)
if ( process.argv.includes( '--trace-calls' ) ) {

	const stats = new Map();
	const proto = GPURenderPassEncoder.prototype;
	for ( const k of [ 'setPipeline', 'setBindGroup', 'setVertexBuffer', 'setIndexBuffer', 'drawIndexed', 'draw', 'drawIndirect', 'drawIndexedIndirect', 'end' ] ) {

		const orig = proto[ k ];
		if ( ! orig ) continue;
		const st = { n: 0, ms: 0 };
		stats.set( k, st );
		proto[ k ] = function ( ...a ) { const t = performance.now(); try { return orig.apply( this, a ); } finally { st.n ++; st.ms += performance.now() - t; } };

	}

	process.on( 'exit', () => { for ( const [ k, st ] of stats ) console.log( `${ k.padEnd( 20 ) } ${ st.n } calls  ${ st.ms.toFixed( 0 ) } ms  ${ st.n ? ( st.ms * 1000 / st.n ).toFixed( 2 ) : 0 } us/call` ); } );

}

// --nan-check[=frames]: where you wake after dying (Jade Landing, WORLD.start), in rain, turned through six headings. One
// non-finite pixel in the scene colour is enough for a pure black rectangle on GPUs whose min / max let NaN through the
// TAA: the bloom chain spreads it over its coarse texels (wave 5: a palm trunk's pow() of its height below the ground).
// Fails (exit 1) when any frame leaves a NaN / Inf in the scene colour or the TAA input (the composite, which the Low
// tier feeds the TAA without the haze and AO passes in between).
const nanArg = process.argv.find( ( a ) => a.startsWith( '--nan-check' ) );
if ( nanArg ) {

	const frames = Number( nanArg.split( '=' )[ 1 ] ) || 8;
	const { readTexture } = await import( '../../src/engine/gpu/Readback.js' );
	const { WORLD } = await import( '../../src/world/WorldLayout.js' );
	const count = async ( tex ) => {

		const { data, width } = await readTexture( tex );
		const u = new Uint16Array( data );
		let n = 0, at = null;
		for ( let i = 0; i < u.length; i ++ ) if ( ( u[ i ] & 0x7c00 ) === 0x7c00 ) { n ++; at = at || `${ ( i >> 2 ) % width },${ Math.floor( ( i >> 2 ) / width ) }`; }
		return { n, at };

	};
	const s = WORLD.start, w = app.features && app.features.get ? app.features.get( 'weather' ) : null;
	app.settings.timeOfDay = 15;
	app.settings.timeSpeed = 0;
	if ( w && w.setManual ) w.setManual( 'rain', 0.8 );
	let bad = 0;
	for ( let k = 0; k < 6; k ++ ) {

		app._placePlayer( s.position.x, s.position.y + 2, s.position.z, ( s.yaw || 0 ) + k * Math.PI / 3 );
		for ( let i = 0; i < 90; i ++ ) app.frame( 1 / 60 );
		await GPU.queue.onSubmittedWorkDone();
		let sc = 0, be = 0, at = null;
		for ( let i = 0; i < frames; i ++ ) {

			app.frame( 1 / 60 );
			const a = await count( app.sceneRenderer.sceneRT.textures[ 0 ] ), b = await count( app.post.beauty.texture );
			sc += a.n;
			be += b.n;
			at = at || a.at || b.at;

		}

		bad += sc + be;
		console.log( `nan-check heading ${ k }: scene ${ sc } · TAA input ${ be } non-finite values over ${ frames } frames${ at ? ' (first at ' + at + ')' : '' }` );

	}

	console.log( bad ? `nan-check FAILED: ${ bad } non-finite values` : 'nan-check ok: no NaN / Inf in the scene colour or the TAA input' );
	process.exit( bad ? 1 : 0 );

}

const bench = new Bench( app );
const info = GPU.adapter && GPU.adapter.info ? GPU.adapter.info : {};
const report = await runPerf( app, {
	scenarios: arg( 'perf', 'all' ), bench, tag, waitGpu: () => GPU.queue.onSubmittedWorkDone(),
	frames: arg( 'frames' ) ? Number( arg( 'frames' ) ) : null, warm: arg( 'warm' ) ? Number( arg( 'warm' ) ) : null,
} );
// --shot=<file.png>: one scenario's view (--shot-scenario=crowd), 45 frames to settle, read back from the canvas
if ( arg( 'shot' ) ) {

	const { setupScenario } = await import( './runner.js' );
	const { SCENARIOS } = await import( './scenarios.js' );
	const { canvasPNG } = await import( './shot.mjs' );
	const set = await setupScenario( app, { ...SCENARIOS[ arg( 'shot-scenario', 'crowd' ) ] } );
	for ( let i = 0; i < 45; i ++ ) {

		set.tick( 1 / 60, i / 60 );
		app.frame( 1 / 60 );
		await GPU.queue.onSubmittedWorkDone();

	}

	await canvasPNG( GPU, arg( 'shot' ) );
	set.undo();
	console.log( 'shot ' + arg( 'shot' ) );

}

report.adapter = [ info.vendor, info.architecture, info.device, info.description ].filter( Boolean ).join( ' ' );
report.quality = app.quality && app.quality.describe ? app.quality.describe() : quality;
report.headless = true;
// the scene graph the passes walk
{

	let objects = 0, meshes = 0, visible = 0, auto = 0;
	const walk = ( o, vis ) => {

		objects ++;
		if ( o.matrixAutoUpdate ) auto ++;
		const v = vis && o.visible;
		if ( o.isMesh ) { meshes ++; if ( v ) visible ++; }
		for ( const c of o.children ) walk( c, v );

	};
	walk( app.scene, true );
	report.sceneStats = { objects, meshes, visibleMeshes: visible, matrixAutoUpdate: auto };
	console.log( 'scene', report.sceneStats );

}
report.size = [ W, H ];
mkdirSync( out, { recursive: true } );
const file = join( out, `perf-${ tag }.json` );
writeFileSync( file, JSON.stringify( report, null, '\t' ) );
console.log( 'wrote ' + file );
for ( const [ id, s ] of Object.entries( report.scenarios ) ) console.log( `${ id.padEnd( 11 ) } CPU ${ s.cpu.mean.toFixed( 2 ) } ms (p95 ${ s.cpu.p95.toFixed( 2 ) })` + ( s.gpu ? ` · GPU ${ s.gpu.mean.toFixed( 2 ) } ms (p95 ${ s.gpu.p95.toFixed( 2 ) })` : '' ) + ( s.setup.notes.length ? ' · ' + s.setup.notes.join( '; ' ) : '' ) );
void env;
process.exit( 0 );
