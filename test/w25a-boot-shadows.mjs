// Wave 25A: load time, capsule shadows, the distance cross-fade and the scripted-camera blur.
//  - pipelines with the same source and layouts are compiled once (kernels, full-screen passes); a draw waiting for its
//    pipeline moves it to the head of the compile queue; warmView holds until a frame draws whole
//  - the capsule shadows of a figure darken the ground under its feet (ambient + the sun's contact shadow) and nothing
//    a few metres away; no figure, no change
//  - a distance-culled group dissolves (dithered) over the last stretch of its reach instead of popping
//  - the motion blur fades out while a script drives the camera and back after
//  - the root patches (tools/w25a/apply-patches.mjs) find every anchor once
//   node test/w25a-boot-shadows.mjs
import './headless.mjs';
import { GPU } from '../src/engine/gpu/GPU.js';
import { RenderTarget } from '../src/engine/gpu/Texture.js';
import { readTexture } from '../src/engine/gpu/Readback.js';
import { ComputeKernel } from '../src/engine/gpu/Compute.js';
import { G, setFrameCamera } from '../src/engine/render/Frame.js';
import { Material } from '../src/engine/render/Material.js';
import { MeshRenderer } from '../src/engine/render/MeshRenderer.js';
import { SunShadows } from '../src/engine/render/Shadows.js';
import { FullscreenPass } from '../src/engine/render/FullscreenPass.js';
import { CapsuleShadows } from '../src/engine/render/CapsuleShadows.js';
import { ShadowUniforms } from '../src/engine/render/wgsl/lighting.js';
import { warmView } from '../src/engine/Warmup.js';
import * as E from '../src/engine/index.js';
import { apply as applyPatches, PATCHES } from '../tools/w25a/apply-patches.mjs';
import { mkdtempSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};

await GPU.init( { headless: true } );
const gpuErrors = [];
GPU.onError( ( e ) => gpuErrors.push( e ) );

// ---- shared pipelines
{

	const code = /* wgsl */`@compute @workgroup_size( WG_X, WG_Y, WG_Z ) fn main( @builtin( global_invocation_id ) gid: vec3u ) { if ( gid.x > 99999u ) { return; } }`;
	const a = new ComputeKernel( { label: 'w25a a', code } );
	const b = new ComputeKernel( { label: 'w25a b', code } );
	const c = new ComputeKernel( { label: 'w25a c', code: code.replace( '99999u', '99998u' ) } );
	ok( a.handle === b.handle, 'two kernels with one source share one pipeline' );
	ok( a.handle !== c.handle, 'a different source gets its own' );
	const fs = /* wgsl */`fn fragment( in: FSIn ) -> vec4f { return vec4f( in.uv, 0.0, 1.0 ); }`;
	const p = new FullscreenPass( { label: 'w25a p', code: fs } ), q = new FullscreenPass( { label: 'w25a q', code: fs } );
	const r = new FullscreenPass( { label: 'w25a r', code: fs, colorFormats: [ 'rgba8unorm' ] } );
	ok( p.handle === q.handle && p.handle !== r.handle, 'full-screen passes share by source and targets' );
	await GPU.pipelinesReady();
	ok( a.pipeline && p.pipeline && r.pipeline, 'the shared pipelines compile' );

}

// ---- the compile queue: priority
{

	const saved = GPU._queue;
	const h = ( n, mesh ) => ( { h: { label: n, mesh, pipeline: null, failed: false } } );
	GPU._queue = [ h( 'm1', true ), h( 'k1', false ), h( 'm2', true ), h( 'k2', false ) ];
	GPU.prioritize( GPU._queue[ 2 ].h );
	ok( GPU._queue.map( ( e ) => e.h.label ).join() === 'm2,m1,k1,k2', 'a waiting draw moves its compile to the head' );
	GPU.prioritizeWhere( ( x ) => ! x.mesh );
	ok( GPU._queue.map( ( e ) => e.h.label ).join() === 'k1,k2,m2,m1', 'the frame\'s own kernels first, in order' );
	GPU._queue = saved;

}

// ---- warmView: frames until one draws whole
{

	let n = 0;
	const fake = { engine: { meshRenderer: { waitingIn: () => ( n < 4 ? 3 - Math.min( 3, n ) : 0 ) } }, frame() { GPU.beginFrame(); n ++; GPU.submit(); } };
	const seen = [];
	const r = await warmView( fake, { onProgress: ( s ) => seen.push( s.waiting ), maxMs: 5000 } );
	ok( r.waited === 0 && r.frames >= 5, `warmView ends after clean frames (${ r.frames } frames, waiting ${ seen.join( ' ' ) })` );

}

// ---- a scene: sand, the sun high, a figure standing on it
const W = 320, H = 240;
G.sunDir.value.set( 0.25, 0.92, 0.3 ).normalize();
G.sunColor.value.setRGB( 3, 2.9, 2.7 );
G.skyIrradiance.value.setRGB( 0.3, 0.35, 0.45 );
const scene = new E.Scene();
const sand = new E.Mesh( new E.PlaneGeometry( 30, 30 ).rotateX( - Math.PI / 2 ), new Material( { name: 'w25a-sand', color: 0xd8c8a0, roughness: 0.95 } ) );
sand.receiveShadow = true;
scene.add( sand );
const camera = new E.PerspectiveCamera( 40, W / H, 0.1, 500 );
camera.position.set( 0, 3.2, 3.2 );
camera.lookAt( 0, 0, 0 );
const rt = new RenderTarget( W, H, { colors: [ 'rgba16float', 'rgba16float', 'rgba8unorm' ], depth: 'depth32float', label: 'w25a' } );
const mr = new MeshRenderer();
mr.minPixels = 0;
const shadows = new SunShadows( { size: 1024 } );

const toPixel = ( x, y, z ) => {

	const v = new E.Vector3( x, y, z ).project( camera );
	return [ Math.round( ( v.x * 0.5 + 0.5 ) * W ), Math.round( ( 0.5 - v.y * 0.5 ) * H ) ];

};
async function render( frames = 2 ) {

	for ( let f = 0; f < frames; f ++ ) {

		GPU.beginFrame();
		setFrameCamera( camera, W, H );
		shadows.render( scene, mr, shadows.update( camera, G.sunDir.value ) );
		mr.render( scene, { camera, kind: 'main', colorViews: rt.textures.map( ( t ) => t.view() ), colorFormats: rt.formats,
			clearColors: [ [ 0.4, 0.55, 0.8, 1 ], [ 0, 0, 0, 0 ], [ 0, 0, 0, 0 ] ], depthView: rt.depthTexture.view(), depthFormat: 'depth32float', clearDepth: 0 } );
		GPU.submit();
		await GPU.pipelinesReady();

	}

	const img = await readTexture( rt.texture );
	const f16 = new Uint16Array( img.data );
	const half = ( h ) => {

		const s = h >> 15, e = ( h >> 10 ) & 31, m = h & 1023;
		return ( s ? - 1 : 1 ) * ( e === 0 ? m / 1024 * 2 ** - 14 : e === 31 ? Infinity : ( 1 + m / 1024 ) * 2 ** ( e - 15 ) );

	};
	const row = W * 4;
	return ( px, py ) => {

		const i = py * row + px * 4;
		return 0.2126 * half( f16[ i ] ) + 0.7152 * half( f16[ i + 1 ] ) + 0.0722 * half( f16[ i + 2 ] );

	};

}

// a figure: a fake skinned model with the mannequin's bones (model space = its group's), standing at the origin
{

	const names = [ 'pelvis', 'spine_02', 'neck_01', 'head', 'thigh_l', 'calf_l', 'foot_l', 'ball_l', 'thigh_r', 'calf_r', 'foot_r', 'ball_r' ];
	const pos = { pelvis: [ 0, 0.95, 0 ], spine_02: [ 0, 1.25, 0 ], neck_01: [ 0, 1.5, 0 ], head: [ 0, 1.62, 0 ],
		thigh_l: [ 0.1, 0.92, 0 ], calf_l: [ 0.11, 0.5, 0.02 ], foot_l: [ 0.11, 0.09, 0 ], ball_l: [ 0.11, 0.03, 0.14 ],
		thigh_r: [ - 0.1, 0.92, 0 ], calf_r: [ - 0.11, 0.5, 0.02 ], foot_r: [ - 0.11, 0.09, 0 ], ball_r: [ - 0.11, 0.03, 0.14 ] };
	const world = new Float32Array( names.length * 16 );
	names.forEach( ( n, i ) => { world.set( [ 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, ...pos[ n ], 1 ], i * 16 ); } );
	const figure = { gltf: { nodes: names.map( ( name ) => ( { name } ) ) }, world, group: new E.Group() };
	ok( typeof CapsuleShadows.register === 'function', 'CapsuleShadows has a registry' );

	CapsuleShadows.enabled = false;
	const before = await render();
	CapsuleShadows.enabled = true;
	CapsuleShadows.register( figure );
	scene.add( figure.group );
	const after = await render();
	ok( ShadowUniforms.fields.capFigures.value === 1, 'one figure packed' );
	ok( ShadowUniforms.fields.capsules.value[ 2 ].w > 0.03, 'its foot capsule has a radius (' + ShadowUniforms.fields.capsules.value[ 4 ].w.toFixed( 3 ) + ' m)' );
	// the sand by the left foot on the side away from the sun (where the shadow map's bias loses the contact) and 4 m off
	const [ fx, fy ] = toPixel( 0.04, 0, - 0.01 );
	const [ ax, ay ] = toPixel( - 4, 0, - 1 );
	const k = after( fx, fy ) / before( fx, fy ), far = after( ax, ay ) / before( ax, ay );
	ok( k < 0.8, `the sand by the foot darkens (${ ( k * 100 ).toFixed( 0 ) } % of its light)` );
	ok( Math.abs( far - 1 ) < 0.01, `the sand 4 m away is unchanged (${ ( far * 100 ).toFixed( 1 ) } %)` );
	scene.remove( figure.group );
	CapsuleShadows.unregister( figure );
	await render( 1 );
	ok( ShadowUniforms.fields.capFigures.value === 0, 'a figure out of the scene is not packed' );

}

// ---- the distance cross-fade of a culled group
{

	const group = new E.Group();
	group.cullDistance = 100;
	group.cullRadius = 0;
	const box = new E.Mesh( new E.BoxGeometry( 2, 2, 2 ), new Material( { name: 'w25a-box', color: 0xcc4422 } ) );
	group.add( box );
	scene.add( group );
	const at = async ( d ) => {

		group.position.set( 0, 1, - d );
		camera.position.set( 0, 1, 0 );
		camera.lookAt( 0, 1, - d );
		camera.updateMatrixWorld();
		await render( 3 );
		return box.__fade;

	};
	ok( await at( 50 ) === 1, 'well inside its reach: whole' );
	ok( box.material.distanceFade === true, 'its material is marked for the dissolve' );
	const mid = await at( 94 );
	ok( mid > 0 && mid < 1, `in the last stretch: partly drawn (${ mid.toFixed( 2 ) })` );
	await at( 120 );
	ok( mr.culled >= 1, 'past its reach: culled' );
	scene.remove( group );

}

// ---- the motion blur and a scripted camera
{

	const { MotionBlur } = await import( '../src/post/MotionBlur.js' );
	const tex = new RenderTarget( 64, 64, { colors: [ 'rgba16float' ], depth: 'depth32float', label: 'w25a-mb' } );
	const mb = new MotionBlur( { velocityTexture: tex.texture, depthTexture: tex.depthTexture, color: tex.texture } );
	const cam = new E.PerspectiveCamera();
	const step = async ( n ) => { for ( let i = 0; i < n; i ++ ) { mb.updateCamera( cam ); await new Promise( ( r ) => setTimeout( r, 20 ) ); } };
	await step( 2 );
	ok( mb.amount.value === 1, 'the blur is whole by default' );
	mb.setScripted( true );
	await step( 14 );
	ok( mb.amount.value === 0, 'a scripted camera: no blur' );
	mb.setScripted( false );
	await step( 4 );
	ok( mb.amount.value > 0 && mb.amount.value < 1, 'handed back: it eases in (' + mb.amount.value.toFixed( 2 ) + ')' );

}

// ---- the root patches find their anchors on the files of this tree (a copy: nothing is written here)
{

	const root = fileURLToPath( new URL( '..', import.meta.url ) );
	const tmp = mkdtempSync( join( tmpdir(), 'w25a-patch-' ) );
	const files = [ ...new Set( PATCHES.map( ( p ) => p.file ) ) ];
	for ( const f of files ) { mkdirSync( dirname( join( tmp, f ) ), { recursive: true } ); copyFileSync( join( root, f ), join( tmp, f ) ); }
	const rep = applyPatches( tmp );
	ok( rep.every( ( [ , m ] ) => m === 'ok' || m === 'already applied' ), 'every root patch applies (' + rep.map( ( r ) => r[ 1 ] ).filter( ( m ) => m !== 'ok' ).length + ' already in)' );
	rmSync( tmp, { recursive: true, force: true } );

}

await new Promise( ( r ) => setTimeout( r, 200 ) );
for ( const e of gpuErrors ) console.log( 'GPU ' + e.kind + ': ' + String( e.message ).split( '\n' )[ 0 ] );
ok( ! gpuErrors.length, 'no GPU errors' );
console.log( fails ? fails + ' FAILED' : 'all passed' );
process.exit( fails ? 1 : 0 );
