// Weapon pose frames (wave 18D): renders a roster character in a weapon pose clip (src/features/weapons/WeaponPose.js, or a
// gun pose of firearms/GunPose.js) with the weapon in its weapon_r socket, placed exactly as the game places it (the socket
// times the pose's hold quaternion), from the front-left and the right side, into one PNG:
//   node tools/weapons/pose-frame.mjs <character> <out.png> <clip>@<t>:<weapon>[:<hold>] ...
//   e.g. node tools/weapons/pose-frame.mjs bonk out.png Wpn_Slash@0.1:cutlass Wpn_Slash@0.2:cutlass Wpn_Hold_Pole@0.5:harpoon:pole
// hold: oneHand | pole | thrown | idle (WeaponPose) or gun:pistol | gun:musket (GunPose); default from the weapon (HOLD_OF).
// Several specs make a contact sheet (one row of two views per spec). Embedded textures are not decoded (grey), as in
// test/clip-frame.mjs. Needs the headless WebGPU (test/headless.mjs).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { writePNG } from '../../test/headless.mjs';
import { GPU } from '../../src/engine/gpu/GPU.js';
import { RenderTarget } from '../../src/engine/gpu/Texture.js';
import { readTexture } from '../../src/engine/gpu/Readback.js';
import { G, setFrameCamera } from '../../src/engine/render/Frame.js';
import { Material } from '../../src/engine/render/Material.js';
import { MeshRenderer } from '../../src/engine/render/MeshRenderer.js';
import { SunShadows } from '../../src/engine/render/Shadows.js';
import { FullscreenPass } from '../../src/engine/render/FullscreenPass.js';
import { SkinnedModel } from '../../src/engine/render/Skinning.js';
import { parseGLB } from '../../src/engine/loaders/GLTF.js';
import * as E from '../../src/engine/index.js';
import { createPropMaterial } from '../../src/game/GameMaterials.js';
import { weaponPoses, HOLD_OF } from '../../src/features/weapons/WeaponPose.js';
import { gunPoses } from '../../src/features/firearms/GunPose.js';
import { buildGeometry, glbGeometry } from '../../src/features/weapons/WeaponModels.js';
import { existsSync } from 'node:fs';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const [ id = 'bonk', out = join( ROOT, 'test/out/weapon-pose.png' ), ...specs ] = process.argv.slice( 2 );
const W = 420, H = 520;
const GREY = new Uint8Array( 16 ).fill( 128 );
for ( let i = 3; i < 16; i += 4 ) GREY[ i ] = 255;
globalThis.__assetImage = async () => ( { data: GREY.slice(), width: 2, height: 2 } );
await GPU.init( { headless: true } );

const scene = new E.Scene();
const ground = new E.Mesh( new E.PlaneGeometry( 30, 30 ).rotateX( - Math.PI / 2 ), new Material( { name: 'ground', color: 0x7a7266, roughness: 0.9 } ) );
scene.add( ground );
G.sunDir.value.set( 0.45, 0.75, 0.5 ).normalize();
G.sunColor.value.setRGB( 3, 2.9, 2.7 );
G.skyIrradiance.value.setRGB( 0.3, 0.36, 0.45 );
const rt = new RenderTarget( W, H, { colors: [ 'rgba16float', 'rgba16float', 'rgba8unorm' ], depth: 'depth32float', label: 'scene' } );
const ldr = new RenderTarget( W, H, { colors: [ 'rgba8unorm' ], label: 'ldr' } );
const mr = new MeshRenderer();
const shadows = new SunShadows();
const tonemap = new FullscreenPass( { label: 'tonemap', colorFormats: [ 'rgba8unorm' ], bindings: { hdr: { texture: () => rt.texture } },
	code: `fn fragment( in: FSIn ) -> vec4f {
		let c = textureLoad( hdr, vec2i( in.pos.xy ), 0 ).rgb;
		let a = c * 0.8; let t = ( a * ( 2.51 * a + 0.03 ) ) / ( a * ( 2.43 * a + 0.59 ) + 0.14 );
		return vec4f( linearToSrgb( sat3( t ) ), 1.0 ); }` } );
const front = new E.PerspectiveCamera( 30, W / H, 0.1, 100 );
front.position.set( 1.6, 1.35, 3.4 ); front.lookAt( 0, 0.85, 0 );
const side = new E.PerspectiveCamera( 30, W / H, 0.1, 100 );
side.position.set( - 3.8, 1.2, 0.4 ); side.lookAt( 0, 0.85, 0.15 );

const b = readFileSync( join( ROOT, 'public/models/roster', id + '.glb' ) );
const gltf = parseGLB( b.buffer.slice( b.byteOffset, b.byteOffset + b.byteLength ) );
const model = await SkinnedModel.create( gltf );
const wp = weaponPoses( { model } ), gp = gunPoses( { model } );
if ( ! wp ) throw new Error( 'no weapon poses on ' + id );
scene.add( model.group );
const mat = createPropMaterial( 'weapon-preview' );
const geoOf = ( w ) => {

	const f = join( ROOT, 'public/models/weapons', w + '.glb' );
	if ( existsSync( f ) && process.env.STANDIN !== '1' ) {

		const bb = readFileSync( f );
		return glbGeometry( parseGLB( bb.buffer.slice( bb.byteOffset, bb.byteOffset + bb.byteLength ) ) );

	}

	return buildGeometry( w );

};

const sheet = new Uint8Array( W * 2 * H * specs.length * 4 );
const sock = new E.Matrix4(), rot = new E.Matrix4(), q = new E.Quaternion();
for ( let s = 0; s < specs.length; s ++ ) {

	const [ ct, weapon = 'cutlass', holdKey = null ] = specs[ s ].split( ':' ).length > 3 ? [ specs[ s ].split( ':' )[ 0 ], specs[ s ].split( ':' )[ 1 ], specs[ s ].split( ':' ).slice( 2 ).join( ':' ) ] : specs[ s ].split( ':' );
	const [ clip, tt ] = ct.split( '@' );
	model.layers.length = 0;
	model.play( clip, { fade: 0.001, loop: false, from: Number( tt || 0 ) } );
	model.update( 0 );
	model.group.updateMatrixWorld( true );
	const hk = holdKey || HOLD_OF[ weapon ] || 'oneHand';
	const hq = hk.startsWith( 'gun:' ) ? gp.hold[ hk.slice( 4 ) ] : wp.hold[ hk ];
	model.nodeMatrix( 'weapon_r', sock );
	rot.makeRotationFromQuaternion( q.set( hq[ 0 ], hq[ 1 ], hq[ 2 ], hq[ 3 ] ) );
	const mesh = new E.Mesh( geoOf( weapon ), mat );
	mesh.matrixAutoUpdate = false;
	mesh.matrix.multiplyMatrices( model.group.matrixWorld, sock ).multiply( rot );
	mesh.matrixWorldNeedsUpdate = true;
	scene.add( mesh );
	for ( let v = 0; v < 2; v ++ ) {

		const cam = v ? side : front;
		GPU.beginFrame();
		setFrameCamera( cam, W, H );
		shadows.render( scene, mr, shadows.update( cam, G.sunDir.value ) );
		mr.render( scene, { camera: cam, kind: 'main', colorViews: rt.textures.map( ( t ) => t.view() ), colorFormats: rt.formats,
			clearColors: [ [ 0.55, 0.62, 0.72, 1 ], [ 0, 0, 0, 0 ], [ 0, 0, 0, 0 ] ], depthView: rt.depthTexture.view(), depthFormat: 'depth32float', clearDepth: 0 } );
		tonemap.render( { colorViews: [ ldr.texture ] } );
		GPU.submit();
		const img = new Uint8Array( ( await readTexture( ldr.texture ) ).data );
		for ( let y = 0; y < H; y ++ ) sheet.set( img.subarray( y * W * 4, ( y + 1 ) * W * 4 ), ( ( s * H + y ) * W * 2 + v * W ) * 4 );

	}

	scene.remove( mesh );
	console.log( `${ specs[ s ] }  hold ${ hk }` );

}

writePNG( out, W * 2, H * specs.length, sheet );
console.log( 'wrote', out );
await new Promise( ( r ) => setTimeout( r, 200 ) );
process.exit( 0 );
