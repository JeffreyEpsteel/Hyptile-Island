// Headless Dawn captures of wave 25D's fishing effects (src/features/vfx/FishRecipes.js) close up on a flat sea:
//   plop (a cast landing) at 0.12 / 0.4 / 1.2 s, a strike (plop 1.9 + line flick), a thrash, a nibble ring, the rod-tip
//   glint, drips off a hanging fish. One PNG per shot in tools/fx25d/out/.
// usage: node tools/fx25d/capture.mjs [--dawn=...]   (uses test/headless.mjs: the `webgpu` package)
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname( fileURLToPath( import.meta.url ) );
const ROOT = path.resolve( here, '../..' );
const { writePNG } = await import( '../../test/headless.mjs' );
const { GPU } = await import( '../../src/engine/gpu/GPU.js' );
const { RenderTarget } = await import( '../../src/engine/gpu/Texture.js' );
const { readTexture } = await import( '../../src/engine/gpu/Readback.js' );
const { setFrameCamera } = await import( '../../src/engine/render/Frame.js' );
const { Material } = await import( '../../src/engine/render/Material.js' );
const { MeshRenderer } = await import( '../../src/engine/render/MeshRenderer.js' );
const { FullscreenPass } = await import( '../../src/engine/render/FullscreenPass.js' );
const { SunShadows } = await import( '../../src/engine/render/Shadows.js' );
const E = await import( '../../src/engine/index.js' );
const { VfxParticles } = await import( '../../src/fx/VfxParticles.js' );
const { VfxSystem } = await import( '../../src/features/vfx/VfxSystem.js' );
const { G } = await import( '../../src/core/Globals.js' );

await GPU.init( { headless: true } );
const W = 800, H = 450;
const OUT = path.join( ROOT, 'tools/fx25d/out' );
mkdirSync( OUT, { recursive: true } );

const scene = new E.Scene();
const sea = new E.Mesh( new E.PlaneGeometry( 80, 80 ).rotateX( - Math.PI / 2 ), new Material( { name: 'sea', color: 0x1d4a66, roughness: 0.3 } ) );
scene.add( sea );
// a stand-in bobber (red / white sphere) so the scale reads
const bob = new E.Mesh( new E.SphereGeometry( 0.025, 12, 8 ), new Material( { name: 'bobber', color: 0xd9402f, roughness: 0.5 } ) );
bob.position.set( 0, 0.01, 0 );
scene.add( bob );
const sys = new VfxSystem( { env: { seaLevel: () => 0, groundAt: () => - 10, wind: ( o ) => { o.x = 1; o.z = 0; return o; }, camera: () => ( { x: 0, y: 1, z: 2 } ) } } );
const fx = new VfxParticles( { pool: sys.pool } );
scene.add( fx.mesh );
const camera = new E.PerspectiveCamera( 50, W / H, 0.05, 500 );
G.sunDir.value.set( 0.4, 0.6, 0.5 ).normalize();
G.sunColor.value.setRGB( 11, 10.5, 9.8 );
G.skyIrradiance.value.setRGB( 0.9, 1.1, 1.5 );
G.horizonColor.value.setRGB( 1.4, 1.6, 1.9 );

const rt = new RenderTarget( W, H, { colors: [ 'rgba16float', 'rgba16float', 'rgba8unorm' ], depth: 'depth32float', label: 'scene' } );
const ldr = new RenderTarget( W, H, { colors: [ 'rgba8unorm' ], label: 'ldr' } );
const mr = new MeshRenderer();
const shadows = new SunShadows();
const tonemap = new FullscreenPass( { label: 'tonemap', colorFormats: [ 'rgba8unorm' ], bindings: { hdr: { texture: () => rt.texture } },
	code: `fn fragment( in: FSIn ) -> vec4f {
		let c = textureLoad( hdr, vec2i( in.pos.xy ), 0 ).rgb;
		let a = c * 0.25; let t = ( a * ( 2.51 * a + 0.03 ) ) / ( a * ( 2.43 * a + 0.59 ) + 0.14 );
		return vec4f( linearToSrgb( sat3( t ) ), 1.0 ); }` } );

async function shot( name, cam, build, age, extra = null ) {

	sys.reset();
	sys.update( 0.001 );
	build();
	for ( let t = age; t > 1e-6; t -= 0.01 ) { if ( extra ) extra( age - t ); sys.update( Math.min( 0.01, t ) ); }
	camera.position.set( cam[ 0 ], cam[ 1 ], cam[ 2 ] );
	camera.lookAt( cam[ 3 ], cam[ 4 ], cam[ 5 ] );
	for ( let f = 0; f < 2; f ++ ) {

		fx.sync();
		GPU.beginFrame();
		setFrameCamera( camera, W, H );
		shadows.render( scene, mr, shadows.update( camera, G.sunDir.value ) );
		mr.render( scene, { camera, kind: 'main', colorViews: rt.textures.map( ( t ) => t.view() ), colorFormats: rt.formats,
			clearColors: [ [ 1.4, 1.6, 1.9, 1 ], [ 0, 0, 0, 0 ], [ 0, 0, 0, 0 ] ], depthView: rt.depthTexture.view(), depthFormat: 'depth32float', clearDepth: 0 } );
		tonemap.render( { colorViews: [ ldr.texture ] } );
		GPU.submit();

	}

	const img = await readTexture( ldr.texture );
	writePNG( path.join( OUT, name + '.png' ), W, H, new Uint8Array( img.data ) );
	console.log( 'wrote', name, 'live', sys.live );

}

const close = [ 0.9, 0.55, 2.0, 0, 0.18, 0 ];
await shot( 'plop-0.12s', close, () => sys.plop( 0, 0, 0, 1 ), 0.12 );
await shot( 'plop-0.4s', close, () => sys.plop( 0, 0, 0, 1 ), 0.4 );
await shot( 'plop-1.2s', close, () => sys.plop( 0, 0, 0, 1 ), 1.2 );
await shot( 'strike-0.2s', [ 1.4, 0.8, 3.0, 0, 0.3, 0 ], () => { sys.plop( 0, 0, 0, 1.9 ); sys.flick( 0, 0.1, 0, 0.7, 0, 0.8, 1 ); }, 0.2 );
await shot( 'thrash-0.3s', [ 1.8, 1.0, 3.6, 0, 0.4, 0 ], () => { sys.plop( 0, 0, 0, 2.7 ); sys.flick( 0, 0.1, 0, 1, 0, 0.9, 1 ); }, 0.3 );
await shot( 'nibble-0.9s', [ 0.9, 0.7, 1.7, 0, 0, 0 ], () => { sys.ripple( 0, 0, 0, 0.6 ); }, 0.9 );
await shot( 'glint-0.06s', [ 0.3, 1.5, 1.0, 0, 1.45, 0 ], () => sys.glint( 0, 1.45, 0, 1 ), 0.06 );
await shot( 'drips-0.5s', [ 0.9, 0.7, 1.9, 0, 0.5, 0 ], () => {}, 0.8, ( t ) => { if ( Math.round( t * 100 ) % 8 === 0 ) sys.drips( 0, 1.0, 0, 1.2, 0 ); } );
await shot( 'cast-fan-0.25s', [ 1.5, 1.4, 2.6, 0, 1.2, 0 ], () => { sys.glint( 0, 1.5, 0, 0.6 ); sys.flick( 0, 1.45, 0, 1.0, 0.3, 0.4, 1 ); }, 0.25 );
process.exit( 0 );
