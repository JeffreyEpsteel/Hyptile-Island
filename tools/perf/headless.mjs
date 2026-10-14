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
//                                [--limits=default]   (the spec's default limits only, as WebKit / iOS reports them;
//                                                      the device refuses anything above them) [--features=none] (no optional features)
//                                [--boot[=frames]]   (no perf run: boot, start a sandbox session, run frames, print the GPU memory
//                                                     and every GPU error; exit 1 on any error: test/engine-smoke.mjs --limits=default)
//                                [--boat-swaps[=n] [--patch-dispose]]   (no perf run: n boat swaps, the GPU buffer count after each)
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
const limitsDefault = arg( 'limits' ) === 'default', noFeatures = arg( 'features' ) === 'none';
const search = '?bench&noAudio' + ( quality !== 'off' ? '&quality=' + quality : '&quality=off' ) + ( limitsDefault ? '&limits=default' : '' ) + ( noFeatures ? '&features=none' : '' ) + ( arg( 'search', '' ) || '' );
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

if ( process.argv.includes( '--log-fetch' ) ) globalThis.__fetchLog = [];
const env = await installEnv( { search, width: W, height: H, power: arg( 'power', 'high-performance' ), flags: dawnFlags(), dawnDir: arg( 'dawn' ) } );
if ( process.argv.includes( '--baseline' ) ) globalThis.__perfBaseline = true; // (read by the engine as it is built)
// --real-sizes: decoded images keep their real width / height (grey pixels; --mobile caps them at the phone's 512 px like
// core/Quality.js installTextureCap) so GPU.memory counts the textures a browser would upload, not 2x2 stand-ins
if ( process.argv.includes( '--real-sizes' ) ) {

	const cap = process.argv.includes( '--mobile' ) ? 512 : Infinity;
	if ( process.argv.includes( '--mobile' ) && ! globalThis.__phoneBudget ) globalThis.__phoneBudget = { ...( await import( '../../src/core/Quality.js' ) ).PHONE_BUDGET }; // (the game's own: wave 16C)
	if ( cap < Infinity ) globalThis.__assetImageCap = cap; // (the phone's decode queue and foam size too)
	const dims = ( b ) => {

		const u = b instanceof Uint8Array ? b : new Uint8Array( b );
		const dv = new DataView( u.buffer, u.byteOffset, u.byteLength );
		if ( u[ 0 ] === 0x89 && u[ 1 ] === 0x50 ) return [ dv.getUint32( 16 ), dv.getUint32( 20 ) ];
		if ( u[ 0 ] === 0xff && u[ 1 ] === 0xd8 ) {

			for ( let p = 2; p + 9 < u.length; ) {

				if ( u[ p ] !== 0xff ) { p ++; continue; }
				const m = u[ p + 1 ], len = dv.getUint16( p + 2 );
				if ( m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc ) return [ dv.getUint16( p + 7 ), dv.getUint16( p + 5 ) ];
				p += 2 + len;

			}

		}

		if ( u[ 8 ] === 0x57 && u[ 9 ] === 0x45 && u[ 12 ] === 0x56 ) { // WEBP VP8 / VP8L / VP8X

			const k = String.fromCharCode( u[ 15 ] );
			if ( k === ' ' ) return [ dv.getUint16( 26, true ) & 0x3fff, dv.getUint16( 28, true ) & 0x3fff ];
			if ( k === 'L' ) { const v = dv.getUint32( 21, true ); return [ ( v & 0x3fff ) + 1, ( ( v >> 14 ) & 0x3fff ) + 1 ]; }
			if ( k === 'X' ) return [ 1 + ( u[ 24 ] | u[ 25 ] << 8 | u[ 26 ] << 16 ), 1 + ( u[ 27 ] | u[ 28 ] << 8 | u[ 29 ] << 16 ) ];

		}

		return [ 2, 2 ];

	};
	globalThis.__realSizes = ( bytes ) => {

		let [ w, h ] = dims( bytes );
		const k = Math.min( 1, cap / Math.max( w, h, 1 ) );
		w = Math.max( 1, Math.round( w * k ) );
		h = Math.max( 1, Math.round( h * k ) );
		return { data: new Uint8Array( w * h * 4 ).fill( 128 ), width: w, height: h };

	};
	globalThis.__assetImage = async ( bytes ) => globalThis.__realSizes( bytes );

}
await import( '../../src/core/BenchSeed.js' );
const { App } = await import( '../../src/App.js' );
const { Bench } = await import( '../../src/core/Bench.js' );
const { runPerf } = await import( './runner.js' );
const { GPU } = await import( '../../src/engine/gpu/GPU.js' );

const t0 = performance.now();
// every GPU error (validation, out-of-memory, device lost, pipeline / WGSL failures) with the stage it happened in
const gpuErrors = [];
let stage = 'starting';
GPU.onError( ( e ) => gpuErrors.push( { ...e, stage } ) );
const mb = ( n ) => ( n / 1048576 ).toFixed( 1 ) + ' MB';
const memLine = ( what ) => console.log( `  GPU memory ${ what }: ${ mb( GPU.memory.total ) } (buffers ${ mb( GPU.memory.buffers ) }, textures ${ mb( GPU.memory.textures ) }, peak ${ mb( GPU.memory.peak ) })` );
// the JS side (V8 numbers; a phone's WebKit heap differs, but the big arrays are the same)
let heapInit = null; // (wave 19A: into the report)
const heapLine = ( what ) => { if ( globalThis.gc ) globalThis.gc(); const m = process.memoryUsage(); heapInit = heapInit || { heap: Math.round( m.heapUsed / 104857.6 ) / 10, arrayBuffers: Math.round( m.arrayBuffers / 104857.6 ) / 10 }; console.log( `  JS memory ${ what }: heap ${ mb( m.heapUsed ) }, array buffers ${ mb( m.arrayBuffers ) }, rss ${ mb( m.rss ) }` ); };
// pipeline compiles left (the precompile stage waits for them)
// --trace-compile[=file]: compiles one at a time like a phone (GPU.compileConcurrency 1) and lists them in start order with
// their time and WGSL size: the order an iPhone's loader walks (wave 7: it stopped after #113 'final (grade + tonemap)')
const traceArg = process.argv.find( ( a ) => a === '--trace-compile' || a.startsWith( '--trace-compile=' ) );
const compiles = [];
// --mobile: the phone compile settings of main.js (one at a time, 12 s each, the loading frame compiles what it draws)
if ( process.argv.includes( '--mobile' ) ) {

	GPU.compileConcurrency = 1;
	GPU.compileTimeout = 12000;
	GPU.lazyPipelines = ! process.argv.includes( '--no-lazy' );

}

if ( traceArg ) {

	GPU.compileConcurrency = 1;
	GPU.compileTimeout = Infinity;
	GPU.onCompileStart = ( label, index, desc ) => {

		const mod = desc && ( desc.compute ? desc.compute.module : desc.vertex && desc.vertex.module );
		const code = mod ? GPU.moduleSource.get( mod ) : null;
		compiles.push( { n: compiles.length + 1, index, label, t: performance.now(), ms: 0, chars: code ? code.length : 0, lines: code ? code.split( '\n' ).length : 0, code, stage } );

	};
	GPU.onCompileEnd = ( label, index ) => {

		const c = compiles.findLast( ( x ) => x.index === index );
		if ( c ) c.ms = performance.now() - c.t;

	};
	process.on( 'exit', () => {

		const rows = compiles.map( ( c ) => `${ String( c.n ).padStart( 4 ) }  ${ c.ms.toFixed( 0 ).padStart( 6 ) } ms  ${ String( c.chars ).padStart( 7 ) } chars  ${ String( c.lines ).padStart( 5 ) } lines  [${ c.stage }]  ${ c.label }` );
		console.log( 'compile order (start order, one at a time):\n' + rows.join( '\n' ) );
		// --trace-compile=<dir>: each compile's WGSL as <dir>/<n>-<label>.wgsl
		const dir = traceArg.includes( '=' ) ? traceArg.split( '=' )[ 1 ] : null;
		if ( dir ) {

			mkdirSync( dir, { recursive: true } );
			for ( const c of compiles ) if ( c.code ) writeFileSync( join( dir, `${ String( c.n ).padStart( 3, '0' ) }-${ c.label.replace( /[^\w.-]+/g, '_' ).slice( 0, 60 ) }.wgsl` ), c.code );

		}

	} );
	globalThis.__compiles = compiles;

}

const tick = setInterval( () => { if ( GPU._pending && GPU._pending.size ) console.log( `  ${ ( ( performance.now() - t0 ) / 1000 ).toFixed( 0 ) } s: ${ GPU._pending.size } pipelines compiling` ); }, 15000 );
const app = new App();
let last = '';
await app.init( ( p, text ) => { if ( text !== last ) { last = stage = text; process.stdout.write( `  ${ ( p * 100 ).toFixed( 0 ).padStart( 3 ) } % ${ text }\n` ); } } );
console.log( `init ${ ( ( performance.now() - t0 ) / 1000 ).toFixed( 1 ) } s` );
clearInterval( tick );
if ( limitsDefault || noFeatures ) console.log( '  ' + GPU.describe().split( '\n' ).slice( 1, 3 ).join( '\n  ' ) );
memLine( 'after init' ); heapLine( 'after init' );
	// --heap-snapshot=<file>: a V8 heap snapshot after init (tools/perf/heap-buffers.mjs lists the big ArrayBuffers and their owners)
	{ const hs = process.argv.find( ( a ) => a.startsWith( '--heap-snapshot=' ) ); if ( hs ) { const v8 = await import( 'node:v8' ); const f = v8.default.writeHeapSnapshot( hs.split( '=' )[ 1 ] ); console.log( '  heap snapshot: ' + f ); } }
console.log( `  pipelines compiled for the first frame: ${ GPU.pipelineStats.requested } (${ GPU.pipelineStats.failed } failed, ${ GPU.pipelineStats.timedOut } timed out)` );
// --mobile: the phone profile applied like AppUI does once the loader is gone (Quality with MOBILE.phone)
if ( process.argv.includes( '--mobile' ) ) {

	stage = 'quality (phone)';
	const { Quality, MOBILE } = await import( '../../src/core/Quality.js' );
	app.quality = new Quality( app, { storage: null, query: new URLSearchParams( quality !== 'off' ? '?quality=' + quality : '' ), mobile: MOBILE.phone } );
	console.log( '  quality: ' + app.quality.describe() );
	memLine( 'after the phone tier' );

}
stage = 'start session';
app.startSession( null, { mode: 'sandbox', restore: false, session: false } );
// --boat-swaps[=n] (wave 12D): n boat swaps through the catalog (App.setBoat, 20 frames and the GLB between them), the live
// GPU buffer count after each one and the labels that grew; --patch-dispose first applies the engine patch of the wave 12D
// report (UniformBlock.destroyBuffer, Material.dispose frees it, the bind groups follow the buffer version) to compare
const swapArg = process.argv.find( ( a ) => a === '--boat-swaps' || a.startsWith( '--boat-swaps=' ) );
if ( swapArg ) {

	const n = Number( swapArg.split( '=' )[ 1 ] ) || 16;
	if ( process.argv.includes( '--patch-dispose' ) ) {

		const { UniformBlock } = await import( '../../src/engine/gpu/Uniforms.js' );
		const { Material } = await import( '../../src/engine/render/Material.js' );
		if ( ! UniformBlock.prototype.destroyBuffer ) {

			UniformBlock.prototype.destroyBuffer = function () {

				if ( ! this.buffer ) return;
				this.buffer.destroy();
				this.buffer = null;
				this._last = null;
				this.bufferVersion = ( this.bufferVersion || 0 ) + 1;

			};
			const dispose = Material.prototype.dispose;
			Material.prototype.dispose = function () {

				dispose.call( this );
				if ( this.uniformBlock && this.uniformBlock.destroyBuffer ) this.uniformBlock.destroyBuffer();

			};
			console.log( '  (engine patch applied by the harness; the bind-group version check is not: a reused disposed material would fail)' );

		}

	}

	stage = 'boat swaps';
	const { BOATS } = await import( '../../src/game/Boats.js' );
	const ids = Object.keys( BOATS );
	const frames = async ( k ) => {

		for ( let i = 0; i < k; i ++ ) app.frame( 1 / 60 );
		await GPU.queue.onSubmittedWorkDone();

	};

	await frames( 20 );
	const labels = () => new Map( [ ...GPU._byLabel ].filter( ( [ k ] ) => k.startsWith( 'buffer' ) ).map( ( [ k, e ] ) => [ k, e.c ] ) );
	const c0 = GPU.memory.bufferCount, l0 = labels();
	for ( let i = 0; i < n; i ++ ) {

		const id = ids[ ( i + 1 ) % ids.length ];
		app.setBoat( id );
		await frames( 10 );
		if ( app.boat.ready ) await app.boat.ready.catch( () => {} );
		await frames( 10 );
		console.log( `  swap ${ i + 1 } -> ${ id }: ${ GPU.memory.bufferCount } buffers (${ GPU.memory.bufferCount - c0 >= 0 ? '+' : '' }${ GPU.memory.bufferCount - c0 })` );

	}

	app.setBoat( ids[ 0 ] );
	await frames( 20 );
	const l1 = labels(), grew = [];
	for ( const [ k, c ] of l1 ) if ( c > ( l0.get( k ) || 0 ) ) grew.push( `${ k } +${ c - ( l0.get( k ) || 0 ) }` );
	console.log( `  after ${ n } swaps and back: ${ GPU.memory.bufferCount - c0 } buffers more (${ ( ( GPU.memory.bufferCount - c0 ) / ( n + 1 ) ).toFixed( 1 ) } per swap)` );
	console.log( '  grew: ' + ( grew.join( ', ' ) || 'nothing' ) );
	for ( const e of gpuErrors.slice( 0, 12 ) ) console.log( `GPU ${ e.kind } [${ e.stage }]${ e.label ? ' ' + e.label : '' }: ${ e.message.split( '\n' )[ 0 ] }` );
	process.exit( gpuErrors.length ? 1 : 0 );

}

// --boot[=frames]: the start path and the first frames only; GPU memory and errors; exit 1 on any GPU error
const bootArg = process.argv.find( ( a ) => a === '--boot' || a.startsWith( '--boot=' ) );
if ( bootArg ) {

	const frames = Number( bootArg.split( '=' )[ 1 ] ) || 30;
	stage = 'first frames';
	for ( let i = 0; i < frames; i ++ ) {

		app.frame( 1 / 60 );
		if ( i % 10 === 9 ) await GPU.queue.onSubmittedWorkDone();

	}

	await GPU.queue.onSubmittedWorkDone();
	await new Promise( ( r ) => setTimeout( r, 300 ) ); // late uncapturederror events
	memLine( `after ${ frames } frames` );
	console.log( `  pipelines after ${ frames } frames: ${ GPU.pipelineStats.requested } (${ GPU.pipelineStats.done } done, ${ GPU.pipelineStats.timedOut } timed out)` );
	const out = app.sceneRenderer && app.sceneRenderer.sceneRT;
	console.log( `  canvas ${ app.engine.width }x${ app.engine.height } · scene ${ out ? out.width + 'x' + out.height : '?' } · render scale ${ app.settings.renderScale }` );
	// the biggest allocations still alive (labels), for the phone budget
	// --mem-top[=n]: the biggest live textures and buffers by label (GPU.memTop)
	const topArg = process.argv.find( ( a ) => a.startsWith( '--mem-top' ) );
	if ( topArg ) {

		const n = Number( topArg.split( '=' )[ 1 ] ) || 25;
		console.log( 'textures:' );
		console.log( GPU.memTopText( n, 'texture' ) );
		console.log( 'buffers:' );
		console.log( GPU.memTopText( n, 'buffer' ) );

	}
	for ( const e of gpuErrors.slice( 0, 12 ) ) console.log( `GPU ${ e.kind } [${ e.stage }]${ e.label ? ' ' + e.label : '' }: ${ e.message.split( '\n' )[ 0 ] }` );
	console.log( gpuErrors.length ? `boot FAILED: ${ gpuErrors.length } GPU errors` : 'boot ok: no GPU errors' );
	process.exit( gpuErrors.length ? 1 : 0 );

}
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
// (--mobile made its phone Quality above: kept)
if ( quality !== 'off' && ! process.argv.includes( '--mobile' ) ) {

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
// --nan-plane[=glass|panel|plane|avatar|none]: board the seaplane (bought first) in first person and count non-finite
// pixels, with one part hidden (bisecting what poisons the frame)
const nanPlane = process.argv.find( ( a ) => a.startsWith( '--nan-plane' ) );
if ( nanPlane ) {

	const hide = ( nanPlane.split( '=' )[ 1 ] || 'none' );
	const { readTexture } = await import( '../../src/engine/gpu/Readback.js' );
	const count = async ( tex ) => {

		const { data } = await readTexture( tex );
		const u = new Uint16Array( data );
		let n = 0;
		for ( let i = 0; i < u.length; i ++ ) if ( ( u[ i ] & 0x7c00 ) === 0x7c00 ) n ++;
		return n;

	};
	app.settings.timeOfDay = 11; app.settings.timeSpeed = 0;
	const sp = app.features.get( 'seaplane' ), p = app.player;
	sp.buy();
	for ( let i = 0; i < 30; i ++ ) app.frame( 1 / 60 );
	const vis = ( re, on ) => { let n = 0; app.scene.traverse( ( o ) => { if ( o.name && re.test( o.name ) ) { o.visible = on; n ++; } } ); return n; };
	if ( hide === 'glass' ) vis( /seaplane-glass/, false );
	if ( hide === 'panel' ) vis( /seaplane-panel/, false );
	if ( hide === 'plane' ) { const g = sp.model && ( sp.model.group || sp.model.root ); if ( g ) g.visible = false; }
	if ( hide === 'avatar' && app.avatar && app.avatar.group ) app.avatar.group.visible = false;
	const before = await count( app.sceneRenderer.sceneRT.textures[ 0 ] );
	p.position.set( 2.5, 0.5, - 17 );
	for ( let i = 0; i < 10; i ++ ) app.frame( 1 / 60 );
	const ok = sp.board();
	for ( let i = 0; i < 10; i ++ ) app.frame( 1 / 60 );
	if ( p.view !== 'first' && p.toggleView ) p.toggleView();
	let sc = 0, be = 0;
	for ( let i = 0; i < 20; i ++ ) { app.frame( 1 / 60 ); if ( i % 5 === 4 ) { sc += await count( app.sceneRenderer.sceneRT.textures[ 0 ] ); be += await count( app.post.beauty.texture ); } }
	// the picture itself (is it black?) and its mean brightness
	const { canvasPNG } = await import( './shot.mjs' );
	const shotFile = ( process.argv.find( ( a ) => a.startsWith( '--out=' ) ) || '--out=.' ).split( '=' )[ 1 ] + `/plane-${ hide }.png`;
	try { await canvasPNG( GPU, shotFile ); } catch ( e ) { console.log( 'shot failed: ' + e.message ); }
	const { data: bd } = await readTexture( app.post.beauty.texture );
	const bu = new Uint16Array( bd ); let sum = 0, nz = 0;
	for ( let i = 0; i < bu.length; i += 4 ) { const h = bu[ i ]; const e = ( h >> 10 ) & 0x1f, m = h & 0x3ff; const v = e === 0 ? m * Math.pow( 2, - 24 ) : Math.pow( 2, e - 25 ) * ( 1024 + m ); sum += v; if ( v > 0.002 ) nz ++; }
	console.log( `nan-plane hide=${ hide }: boarded ${ ok } view ${ p.view } · before ${ before } · scene ${ sc } · TAA input ${ be } non-finite · beauty mean ${ ( sum / ( bu.length / 4 ) ).toFixed( 4 ) }, lit pixels ${ ( 100 * nz / ( bu.length / 4 ) ).toFixed( 1 ) }% · ${ shotFile }` );
	process.exit( 0 );

}

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

// --hide=<regex>: objects whose name matches are hidden for the whole run (what one system costs: --hide=veg-canopy-far)
if ( arg( 'hide' ) ) {

	const re = new RegExp( arg( 'hide' ) );
	let n = 0;
	app.scene.traverse( ( o ) => { if ( o.name && re.test( o.name ) ) { o.visible = false; n ++; } } );
	console.log( `  hidden: ${ n } objects matching ${ arg( 'hide' ) }` );

}

const bench = new Bench( app );
// the bench renders at --size (its own default is 2560x1267, the old runs' size: the default --size too)
const setBenchSize = bench.setSize.bind( bench );
bench.setSize = () => setBenchSize( W, H );
const info = GPU.adapter && GPU.adapter.info ? GPU.adapter.info : {};
const report = await runPerf( app, {
	scenarios: arg( 'perf', 'all' ), bench, tag, waitGpu: () => GPU.queue.onSubmittedWorkDone(),
	frames: arg( 'frames' ) ? Number( arg( 'frames' ) ) : null, warm: arg( 'warm' ) ? Number( arg( 'warm' ) ) : null,
	memory: () => ( memDiff(), { ...GPU.memory, groups: memGroups() } ),
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

// --mem-top[=n] after a perf run too: the biggest live textures and buffers once the scenarios have been up (wave 16C)
{

	const topArg = process.argv.find( ( a ) => a.startsWith( '--mem-top' ) );
	if ( topArg ) {

		const n = Number( topArg.split( '=' )[ 1 ] ) || 25;
		memLine( 'after the scenarios' );
		console.log( 'textures:' );
		console.log( GPU.memTopText( n, 'texture' ) );
		console.log( 'buffers:' );
		console.log( GPU.memTopText( n, 'buffer' ) );

	}

	// --mem-match=<regex>: every live label that matches (the vegetation: --mem-match="veg|grass|leaf|impostor")
	const mm = arg( 'mem-match' );
	if ( mm ) {

		const re = new RegExp( mm, 'i' );
		console.log( 'matching ' + mm + ':' );
		for ( const e of GPU.memTop( 100000 ) ) if ( re.test( e.label ) ) console.log( `  ${ e.mb.toFixed( 1 ).padStart( 7 ) } MB  x${ e.count }  ${ e.label }` );

	}

}
report.adapter = [ info.vendor, info.architecture, info.device, info.description ].filter( Boolean ).join( ' ' );
report.quality = app.quality && app.quality.describe ? app.quality.describe() : quality;
report.headless = true;
report.jsAfterInit = heapInit; // MB (V8: run with --expose-gc for a collected heap)
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
// GPU memory by owner (MB): the vegetation, the terrain and its tiles, the two tile islands, characters, the rest
// --mem-diff: the labels that grew while each scenario was up (what a place builds on arrival), printed as they come
var memPrev = null; // (var: the hook runs before this line is reached)
function memDiff() {

	const now = new Map( [ ...( GPU._byLabel || [] ) ].map( ( [ k, e ] ) => [ k, e.n ] ) );
	if ( memPrev && process.argv.includes( '--mem-diff' ) ) {

		const d = [ ...now ].map( ( [ k, n ] ) => [ k, n - ( memPrev.get( k ) || 0 ) ] ).filter( ( [ , n ] ) => Math.abs( n ) > 65536 ).sort( ( x, y ) => y[ 1 ] - x[ 1 ] ).slice( 0, 20 );
		console.log( '  grew: ' + d.map( ( [ k, n ] ) => `${ k } ${ ( n / 1048576 ).toFixed( 1 ) }` ).join( ', ' ) );
		// --log-fetch (wave 19A): the files the place fetched on arrival (which GLBs the 'glb#' growth is)
		if ( globalThis.__fetchLog ) { console.log( '  fetched: ' + ( globalThis.__fetchLog.splice( 0 ).join( ', ' ) || 'nothing' ) ); }

	}

	memPrev = now;

}

function memGroups() {

	const G = { vegetation: /veg|grass|leaf|impostor/i, terrain: /terrain|shore/i, islands: /tidemark|blackwater/i, characters: /char#|skinned|skinMorph/i };
	const out = { vegetation: 0, terrain: 0, islands: 0, characters: 0 };
	for ( const [ k, e ] of GPU._byLabel || [] ) for ( const g in G ) if ( G[ g ].test( k ) ) { out[ g ] += e.n; break; }
	for ( const g in out ) out[ g ] = Math.round( out[ g ] / 104857.6 ) / 10;
	return out;

}

// the draws (triangles) of a scenario's mesh passes per frame (the 'draws:<label>' / 'tris:<label>' scopes)
function drawsOf( s, k = 'draws' ) {

	let n = 0;
	for ( const r of s.scopes || [] ) if ( r.name.startsWith( k + ':' ) ) n += r.mean;
	return Math.round( n );

}
mkdirSync( out, { recursive: true } );
const file = join( out, `perf-${ tag }.json` );
writeFileSync( file, JSON.stringify( report, null, '\t' ) );
console.log( 'wrote ' + file );
for ( const [ id, s ] of Object.entries( report.scenarios ) ) console.log( `${ id.padEnd( 11 ) } CPU ${ s.cpu.mean.toFixed( 2 ) } ms (p95 ${ s.cpu.p95.toFixed( 2 ) })` + ( s.gpu ? ` · GPU ${ s.gpu.mean.toFixed( 2 ) } ms (p95 ${ s.gpu.p95.toFixed( 2 ) })` : '' ) + ( s.memory ? ` · GPU memory ${ s.memory.total } MB` : '' ) + ` · draws ${ drawsOf( s ) } · triangles ${ ( drawsOf( s, 'tris' ) / 1e6 ).toFixed( 2 ) } M` + ( s.setup.notes.length ? ' · ' + s.setup.notes.join( '; ' ) : '' ) );
void env;
process.exit( 0 );
