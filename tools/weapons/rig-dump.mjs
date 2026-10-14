// Prints the arm bones of roster characters in model space at the idle (the numbers the weapon pose recipes in
// src/features/weapons/WeaponPose.js are written against): node tools/weapons/rig-dump.mjs [id ...]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parseGLB } from '../../src/engine/loaders/GLTF.js';
import { makeRig, localsAt, fk, qrot } from '../../src/player/anim/ClipTools.js';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const ids = process.argv.slice( 2 ).length ? process.argv.slice( 2 ) : [ 'bonk', 'hyptile', 'pepe' ];
const f = ( v ) => v.map( ( x ) => x.toFixed( 3 ).padStart( 7 ) ).join( ' ' );
for ( const id of ids ) {

	const b = readFileSync( join( ROOT, 'public/models/roster', id + '.glb' ) );
	const gltf = parseGLB( b.buffer.slice( b.byteOffset, b.byteOffset + b.byteLength ) );
	const rig = makeRig( gltf );
	const clip = gltf.animations.find( ( a ) => a.name === 'Idle_Breathe' );
	const { R, P } = fk( rig, localsAt( rig, clip, 0.5 ) );
	const I = rig.index;
	console.log( id );
	for ( const n of [ 'pelvis', 'spine_02', 'neck_01', 'head', 'clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r', 'weapon_r', 'upperarm_l', 'lowerarm_l', 'hand_l', 'weapon_l' ] ) {

		if ( I[ n ] === undefined ) { console.log( n, 'missing' ); continue; }
		console.log( n.padEnd( 12 ), f( P[ I[ n ] ] ), '  +z', f( qrot( R[ I[ n ] ], [ 0, 0, 1 ] ) ), '  +y', f( qrot( R[ I[ n ] ], [ 0, 1, 0 ] ) ), '  +x', f( qrot( R[ I[ n ] ], [ 1, 0, 0 ] ) ) );

	}

	const w = I.weapon_r;
	console.log( 'weapon_r parent', gltf.nodes[ rig.parent[ w ] ].name, 'rest t', f( rig.rest[ w ].t ), 'r', f( rig.rest[ w ].r ) );

}
