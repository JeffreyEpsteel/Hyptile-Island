// Wave 25A: where the cold start goes. Boots the whole App on Dawn (as tools/visuals/capture.mjs) and logs each loader
// stage's wall time, the pipelines (requested, compiled, shared), the time until the main menu can open, until the
// chosen spot's first view draws whole (the player picks at once: the worst case) and until every pipeline is in.
//
//   node tools/w25a/boot-profile.mjs --dawn=<dir> [--out=<file.json>] [--legacy] [--profile=medium|phone]
//                                    [--labels=<file.tsv>] [--hashes=<file.txt>]
//
// --legacy: the old order (everything compiled before the menu). --hashes: every shader module's source hash (two runs
// that differ name the modules a warm start would compile again: the browser's shader cache is keyed by the source).
// Headless Dawn keeps no shader cache on disk: every run here is a cold boot.
import { installEnv } from '../perf/headless-env.mjs';
import { register } from 'node:module';
register( '../perf/stub-loader.mjs', import.meta.url );
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const arg = ( k, d = null ) => {

	const a = process.argv.find( ( x ) => x.startsWith( '--' + k + '=' ) );
	return a ? a.slice( k.length + 3 ) : d;

};

const legacy = process.argv.includes( '--legacy' );
const profile = arg( 'profile', 'medium' );
const phone = profile === 'phone';
const search = '?noAudio&quality=' + ( phone ? 'off' : profile ) + ( phone ? '&phone' : '' );
await installEnv( { search, width: 1280, height: 720, power: 'high-performance', flags: [ 'backend=vulkan' ], dawnDir: arg( 'dawn' ) } );
if ( phone ) globalThis.__phoneBudget = { ...( await import( '../../src/core/Quality.js' ) ).PHONE_BUDGET };
globalThis.__assetImage = async () => ( { data: new Uint8Array( 16 ).fill( 128 ), width: 2, height: 2 } );

await import( '../../src/core/BenchSeed.js' );
const { App } = await import( '../../src/App.js' );
const { GPU } = await import( '../../src/engine/gpu/GPU.js' );
const { warmView } = await import( '../../src/engine/Warmup.js' );
if ( phone ) GPU.lazyPipelines = true;

const hashes = [];
const wrapDevice = () => {

	const d = GPU.device;
	if ( ! d || d.__w25a ) return;
	d.__w25a = true;
	const csm = d.createShaderModule.bind( d );
	d.createShaderModule = ( desc ) => {

		hashes.push( createHash( 'sha1' ).update( desc.code ).digest( 'hex' ).slice( 0, 12 ) + '\t' + ( desc.label || '' ) );
		return csm( desc );

	};

};
const wrapTimer = setInterval( wrapDevice, 0 );

const compiles = new Map();
GPU.onCompileStart = ( label, index ) => compiles.set( index, { label, t: performance.now() } );
GPU.onCompileEnd = ( label, index, h ) => {

	const c = compiles.get( index );
	if ( c ) { c.ms = performance.now() - c.t; c.kind = h.kind; }

};

const s = ( ms ) => + ( ms / 1000 ).toFixed( 2 );
const t0 = performance.now();
const stages = [];
const app = new App();
await app.init( ( p, text ) => {

	wrapDevice();
	const now = performance.now() - t0;
	if ( stages.length ) stages[ stages.length - 1 ].ms = now - stages[ stages.length - 1 ].at;
	stages.push( { text, at: now } );

}, { deferCompile: ! legacy } );
const menuAt = performance.now() - t0;
if ( stages.length ) stages[ stages.length - 1 ].ms = menuAt - stages[ stages.length - 1 ].at;
const atMenu = { requested: GPU.pipelineStats.requested, done: GPU.pipelineStats.done };

// the player picks at once: a campaign-like start at the spawn (the sandbox, nothing restored)
app.startSession( null, { mode: 'sandbox', restore: false, session: false } );
const r = await warmView( app );
const viewAt = performance.now() - t0;
if ( app.compiled ) await app.compiled;
await GPU.pipelinesReady();
const allAt = performance.now() - t0;
clearInterval( wrapTimer );

const st = GPU.pipelineStats;
const list = [ ...compiles.values() ].filter( ( c ) => c.ms !== undefined );
const out = {
	profile, order: legacy ? 'legacy (compile before the menu)' : 'menu first (compile behind it)',
	menuS: s( menuAt ), firstViewS: s( viewAt ), allCompiledS: s( allAt ),
	firstView: { frames: r.frames, waitedDraws: r.waited, s: s( r.ms ) },
	atMenu,
	pipelines: { requested: st.requested, compiled: list.length, shared: st.shared, failed: st.failed, render: list.filter( ( c ) => c.kind === 'render' ).length, compute: list.filter( ( c ) => c.kind === 'compute' ).length },
	meshPipelineKeys: app.engine.meshRenderer.pipelines.size,
	shaderModules: hashes.length,
	syncCompiles: GPU.syncCompiles.length,
	stages: stages.map( ( x ) => ( { text: x.text, s: s( x.ms || 0 ) } ) ),
};
if ( arg( 'labels' ) ) writeFileSync( arg( 'labels' ), list.map( ( c ) => `${ c.kind }\t${ Math.round( c.ms ) }\t${ c.label }` ).join( '\n' ) );
if ( arg( 'hashes' ) ) writeFileSync( arg( 'hashes' ), hashes.sort().join( '\n' ) );
console.log( JSON.stringify( out, null, '\t' ) );
if ( arg( 'out' ) ) writeFileSync( arg( 'out' ), JSON.stringify( out, null, '\t' ) );
process.exit( 0 );
