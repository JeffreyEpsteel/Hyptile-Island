// Headless preview of the new opening (src/world/start): terrain, the village and pier, Jade Landing and the
// Tidewater dress-over, rendered from the spawn and a few other viewpoints (no ocean shader: a flat sea plane).
//   node tools/start/preview.mjs <outPrefix> [only=name,name] [--night]
// Runs on the `webgpu` (Dawn) package like test/world-village.mjs.
import '../../test/headless.mjs';
import { worldHarness, done } from '../../test/world-harness.mjs';
import { TerrainData } from '../../src/world/TerrainData.js';
import { Colliders } from '../../src/world/Colliders.js';
import { Village } from '../../src/world/Village.js';
import { Material } from '../../src/engine/render/Material.js';
import { WORLD } from '../../src/world/WorldLayout.js';
import { Landing } from '../../src/world/start/Landing.js';
import { Dressover } from '../../src/world/start/Dressover.js';
import { introPose } from '../../src/world/start/Intro.js';

const OUT = process.argv[ 2 ] || 'start-';
const ONLY = process.argv[ 3 ] && ! process.argv[ 3 ].startsWith( '--' ) ? process.argv[ 3 ].split( ',' ) : null;
const NIGHT = process.argv.includes( '--night' );

const H = await worldHarness( { width: 1600, height: 900, sun: [ - 0.35, 0.55, 0.45 ] } );
const { E, G } = H;
const terrain = new TerrainData();
const colliders = new Colliders();
const village = new Village( { scene: H.scene, terrain, colliders } );
const landing = new Landing( { scene: H.scene, terrain, colliders } );
const dress = new Dressover( { scene: H.scene, terrain, colliders, village } );
console.log( 'landing', landing.stats(), 'dressover', dress.stats() );

// ground: a heightfield over the bay's east half, plain sand / grass
{

	const x0 = 20, x1 = 230, z0 = - 170, z1 = 70, step = 0.5;
	const nx = Math.round( ( x1 - x0 ) / step ) + 1, nz = Math.round( ( z1 - z0 ) / step ) + 1;
	const pos = new Float32Array( nx * nz * 3 ), nrm = new Float32Array( nx * nz * 3 );
	for ( let j = 0; j < nz; j ++ ) for ( let i = 0; i < nx; i ++ ) {

		const x = x0 + i * step, z = z0 + j * step, k = ( j * nx + i ) * 3;
		pos[ k ] = x; pos[ k + 1 ] = terrain.heightAt( x, z ); pos[ k + 2 ] = z;
		const hx = terrain.heightAt( x + 0.25, z ) - terrain.heightAt( x - 0.25, z ), hz = terrain.heightAt( x, z + 0.25 ) - terrain.heightAt( x, z - 0.25 );
		const l = Math.hypot( hx, 0.5, hz );
		nrm[ k ] = - hx / l; nrm[ k + 1 ] = 0.5 / l; nrm[ k + 2 ] = - hz / l;

	}

	const idx = new Uint32Array( ( nx - 1 ) * ( nz - 1 ) * 6 );
	let o = 0;
	for ( let j = 0; j < nz - 1; j ++ ) for ( let i = 0; i < nx - 1; i ++ ) {

		const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
		idx[ o ++ ] = a; idx[ o ++ ] = c; idx[ o ++ ] = b; idx[ o ++ ] = b; idx[ o ++ ] = c; idx[ o ++ ] = d;

	}

	const geo = new E.BufferGeometry();
	geo.setAttribute( 'position', new E.BufferAttribute( pos, 3 ) );
	geo.setAttribute( 'normal', new E.BufferAttribute( nrm, 3 ) );
	geo.setIndex( new E.BufferAttribute( idx, 1 ) );
	const ground = new E.Mesh( geo, new Material( { name: 'ground', roughness: 0.95,
		surface: `let t = smoothstep( 2.5, 4.5, in.P.y ) * smoothstep( 0.6, 0.85, in.N.y );
	s.albedo = mix( vec3f( 0.62, 0.52, 0.36 ), vec3f( 0.16, 0.22, 0.07 ), t ) * ( 0.9 + 0.1 * sin( in.P.x * 3.1 ) * sin( in.P.z * 2.7 ) );` } ) );
	ground.castShadow = true;
	ground.frustumCulled = false;
	H.scene.add( ground );
	const sea = new E.Mesh( new E.PlaneGeometry( 900, 900 ).rotateX( - Math.PI / 2 ), new Material( { name: 'sea', roughness: 0.08, color: 0x0b4a5a } ) );
	sea.position.set( 100, 0.05, 100 );
	H.scene.add( sea );

}

// the player's third-person camera at the start (Player ARM: ~4 m back, a little above the head)
const S = WORLD.start, fy = S.yaw;
const sy = Math.max( terrain.heightAt( S.position.x, S.position.z ), colliders.groundHeightAt( S.position.x, S.position.z, 50 ) );
const fwd = [ - Math.sin( fy ), - Math.cos( fy ) ];
const right = [ Math.cos( fy ), - Math.sin( fy ) ];
const eye = [ S.position.x - fwd[ 0 ] * 4.2 + right[ 0 ] * 0.35, sy + 1.66, S.position.z - fwd[ 1 ] * 4.2 + right[ 1 ] * 0.35 ];
const look = [ S.position.x + fwd[ 0 ] * 30 + right[ 0 ] * 0.35, sy + 1.66 - 30 * 0.05, S.position.z + fwd[ 1 ] * 30 + right[ 1 ] * 0.35 ];
const T = landing.plan.totem, I = WORLD.landing.intro;
// a stand-in for the avatar so the framing reads (a 1.7 m capsule)
{

	const body = new E.Mesh( new E.CylinderGeometry( 0.25, 0.25, 1.7, 12 ), new Material( { name: 'avatar', roughness: 0.6, color: 0x3fd08a } ) );
	body.position.set( S.position.x, sy + 0.85, S.position.z );
	body.castShadow = true;
	H.scene.add( body );

}

G.time.value = 3.0;
const views = {
	spawn: { pos: eye, target: look, fov: 65 },
	front: { pos: [ 160, 4, - 52 ], target: [ 176, 3, - 70 ], fov: 55 },
	totem: { pos: [ 160.5, 3.2, - 55.5 ], target: [ T.x, T.base + 4.2, T.z ], fov: 55 },
	racks: { pos: [ 168, 3.5, - 80 ], target: [ 176, 2, - 74 ], fov: 55 },
	hammocks: { pos: [ 188, 3.2, - 58 ], target: [ 180, 1.8, - 66 ], fov: 55 },
	boardwalk: { pos: [ 150, 2.6, - 66 ], target: [ 110, 1.5, - 64 ], fov: 55 },
	pierGate: { pos: [ 53, 4.2, - 82 ], target: [ 55, 4.5, - 62 ], fov: 55 },
	huts: { pos: [ 60, 6, - 50 ], target: [ 70, 5, - 66 ], fov: 60 },
	overview: { pos: [ 120, 60, 10 ], target: [ 130, 0, - 70 ], fov: 55 },
};

// frames of the intro glide (u = 0.3, 0.55, 0.75, 0.9 of its time), ending on the start camera above
{

	const endPos = new E.Vector3( ...eye ), m = new E.Matrix4().lookAt( endPos, new E.Vector3( ...look ), new E.Vector3( 0, 1, 0 ) );
	const endQuat = new E.Quaternion().setFromRotationMatrix( m ), p = new E.Vector3(), q = new E.Quaternion();
	for ( const u of [ 0, 0.3, 0.55, 0.75, 0.9 ] ) {

		introPose( u, I, endPos, endQuat, p, q );
		const f = new E.Vector3( 0, 0, - 1 ).applyQuaternion( q ).multiplyScalar( 10 ).add( p );
		views[ 'intro' + Math.round( u * 100 ) ] = { pos: p.toArray(), target: f.toArray(), fov: 65 };

	}

}

if ( NIGHT ) {

	G.night.value = 1;
	G.sunDir.value.set( 0.3, 0.25, 0.2 ).normalize();
	G.sunColor.value.setRGB( 0.05, 0.06, 0.1 );
	G.skyIrradiance.value.setRGB( 0.01, 0.015, 0.03 );
	G.exposure.value = 8;

}

for ( const [ name, v ] of Object.entries( views ) ) {

	if ( ONLY && ! ONLY.includes( name ) ) continue;
	await H.shot( OUT + name + ( NIGHT ? '-night' : '' ) + '.png', v );

}

await done();
