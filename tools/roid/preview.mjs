// Headless preview of Captain Roid in the world (wave 5): his yard beside the boathouse (off the Jade Landing boardwalk),
// and him walking his routine onto the pier's planks, from the real terrain, village, landing and dress-over colliders.
// Textures are grey (no image decoder in Node). Prints his stops and where he stands (feet vs the ground under him).
//   node tools/roid/preview.mjs <outPrefix>
import '../../test/headless.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { worldHarness, done } from '../../test/world-harness.mjs';
import { TerrainData } from '../../src/world/TerrainData.js';
import { Colliders } from '../../src/world/Colliders.js';
import { Village } from '../../src/world/Village.js';
import { Material } from '../../src/engine/render/Material.js';
import { Landing } from '../../src/world/start/Landing.js';
import { Dressover } from '../../src/world/start/Dressover.js';
import { YARD, findMoorings } from '../../src/game/BoatYard.js';
import { CaptainRoid, routineStop } from '../../src/game/CaptainRoid.js';

const OUT = process.argv[ 2 ] || 'roid-';
const PUB = join( fileURLToPath( new URL( '../..', import.meta.url ) ), 'public' );
const file = ( url ) => readFileSync( join( PUB, url.replace( /^\//, '' ) ) );
globalThis.__assetFile = async ( url ) => { const b = file( url ); return b.buffer.slice( b.byteOffset, b.byteOffset + b.byteLength ); };
globalThis.fetch = async ( url ) => ( { ok: true, json: async () => JSON.parse( file( url ).toString( 'utf8' ) ) } );
const GREY = new Uint8Array( 16 ).fill( 170 );
for ( let i = 3; i < 16; i += 4 ) GREY[ i ] = 255;
globalThis.__assetImage = async () => ( { data: GREY.slice(), width: 2, height: 2 } );

const H = await worldHarness( { width: 1280, height: 800, sun: [ - 0.35, 0.6, 0.45 ] } );
const { E, G } = H;
const terrain = new TerrainData();
const colliders = new Colliders();
const village = new Village( { scene: H.scene, terrain, colliders } );
const spots = findMoorings( terrain, 4 );
YARD.x = spots.reduce( ( s, p ) => s + p.x, 0 ) / spots.length;
YARD.z = spots.reduce( ( s, p ) => s + p.z, 0 ) / spots.length;
let hour = 10.6; // (10.6 % 1.5 = 0.1: the sign)
let viewer = null;
const roid = new CaptainRoid( { scene: H.scene, terrain, colliders, clock: () => hour, viewer: () => viewer } );
// the start feature comes after Roid in the game: its boardwalk and decks join the colliders later
new Landing( { scene: H.scene, terrain, colliders } );
new Dressover( { scene: H.scene, terrain, colliders, village } );
await roid.ready;
console.log( 'clips', roid._rt, 'walkable', roid._walkable, roid.vendor.character ? roid.vendor.character.clipNames().join( ',' ) : 'no character' );

// ground: a heightfield over the bay's east half, sand / grass, and a flat sea
{

	const x0 = 30, x1 = 130, z0 = - 100, z1 = 50, step = 0.5;
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
	s.albedo = mix( vec3f( 0.62, 0.52, 0.36 ), vec3f( 0.16, 0.22, 0.07 ), t );` } ) );
	ground.castShadow = true;
	ground.frustumCulled = false;
	H.scene.add( ground );
	const sea = new E.Mesh( new E.PlaneGeometry( 600, 600 ).rotateX( - Math.PI / 2 ), new Material( { name: 'sea', roughness: 0.08, color: 0x0b4a5a } ) );
	sea.position.set( 80, 0.05, 0 );
	H.scene.add( sea );

}

const report = ( tag ) => {

	const p = roid.pos, t = terrain.heightAt( p.x, p.z ), g = colliders.groundHeightAt( p.x, p.z, t + 3 );
	console.log( tag, 'at', p.x.toFixed( 2 ), p.y.toFixed( 2 ), p.z.toFixed( 2 ), 'terrain', t.toFixed( 2 ), 'deck', Number.isFinite( g ) ? g.toFixed( 2 ) : '-', 'stop', roid.stopName, roid.pose, roid.vendor.character ? roid.vendor.character.current : '' );

};

G.time.value = 3.0;
// 1. the yard at mid-morning: at the sign, the boathouse on his left, the boardwalk behind
const near = ( dx, dz ) => ( { x: roid.pos.x + dx, y: 0, z: roid.pos.z + dz } );
viewer = near( 0, 20 );
for ( let i = 0; i < 60; i ++ ) roid.update( 1 / 30, null );
report( 'yard' );
console.log( 'stops', JSON.stringify( roid.stops, ( k, v ) => ( typeof v === 'number' ? Math.round( v * 100 ) / 100 : v ) ) );
const S = roid.stops.sign;
await H.shot( OUT + 'yard.png', { pos: [ S.x + Math.sin( S.yaw ) * 7 - 2, 2.6, S.z + Math.cos( S.yaw ) * 7 ], target: [ S.x, 1.4, S.z - 1 ], fov: 50 } );
await H.shot( OUT + 'yard-top.png', { pos: [ S.x - 4, 22, S.z + 9 ], target: [ S.x - 4, 0, S.z - 4 ], fov: 55 } );

// 2. the afternoon stroll: on the pier's planks (deck 2.3 m over the sea)
hour = 15.1;
console.log( 'routine at 15.1 h:', routineStop( hour ) );
let onPier = false;
for ( let i = 0; i < 30 * 200 && ! onPier; i ++ ) {

	viewer = near( 0, 10 );
	roid.update( 1 / 30, null );
	onPier = roid.pos.z > - 40 && roid.pos.y > 2;

}

for ( let i = 0; i < 20; i ++ ) roid.update( 1 / 30, null );
report( 'pier' );
const P = roid.pos;
await H.shot( OUT + 'pier.png', { pos: [ P.x + 3.2, P.y + 1.5, P.z + 3.5 ], target: [ P.x, P.y + 0.9, P.z ], fov: 45 } );
await H.shot( OUT + 'pier-low.png', { pos: [ P.x + 2.2, P.y + 0.25, P.z + 1.2 ], target: [ P.x, P.y + 0.15, P.z ], fov: 40 } );

// 3. back at the yard: sat on his crate
hour = 11.4; // (the crate)
viewer = null;
roid.update( 1 / 30, null ); // far: he is at his stop
viewer = near( 0, 12 );
for ( let i = 0; i < 90; i ++ ) roid.update( 1 / 30, null );
report( 'crate' );
const C = roid.stops.crate;
await H.shot( OUT + 'crate.png', { pos: [ C.x + Math.sin( C.yaw ) * 4 + 1.5, 1.8, C.z + Math.cos( C.yaw ) * 4 ], target: [ C.x, 0.9, C.z ], fov: 45 } );
await done();
