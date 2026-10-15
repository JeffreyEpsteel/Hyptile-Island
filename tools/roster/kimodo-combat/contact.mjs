// Wave 19D: where a combat clip's blow lands, measured on a roster GLB (plain node, ClipTools FK): per frame the right and left
// wrists in model space (+X the character's left, +Y up, +Z ahead) and the right wrist's speed; then the clip time of the fastest
// right wrist (a cut, a chop, a club's blow, a throw's release) and of the right wrist furthest ahead (a thrust).
//   node tools/roster/kimodo-combat/contact.mjs <model.glb> <Clip> [<Clip> ...] [--every 2]
import { readFileSync } from 'node:fs';
import { parseGLB } from '../../../src/engine/loaders/GLTF.js';
import { makeRig, localsAt, fk, FPS } from '../../../src/player/anim/ClipTools.js';

const args = process.argv.slice( 2 );
const ei = args.indexOf( '--every' );
const every = ei >= 0 ? + args.splice( ei, 2 )[ 1 ] : 2;
const [ file, ...names ] = args;
const b = readFileSync( file );
const gltf = parseGLB( b.buffer.slice( b.byteOffset, b.byteOffset + b.byteLength ) );
const clips = new Map( gltf.animations.map( ( a ) => [ a.name, a ] ) );
const rig = makeRig( gltf );
const I = rig.index;
const f2 = ( v ) => ( v >= 0 ? '+' : '' ) + v.toFixed( 2 );

for ( const name of names ) {

	const clip = clips.get( name );
	if ( ! clip ) { console.log( 'NO CLIP', name ); continue; }
	const n = Math.round( clip.duration * FPS );
	let prev = null, peak = [ 0, 0 ], ahead = [ - 1e9, 0 ];
	console.log( `CLIP ${ name } ${ clip.duration.toFixed( 3 ) } s` );
	for ( let k = 0; k <= n; k ++ ) {

		const t = k / FPS;
		const { P } = fk( rig, localsAt( rig, clip, t ) );
		const r = P[ I.hand_r ], l = P[ I.hand_l ];
		const v = prev ? Math.hypot( r[ 0 ] - prev[ 0 ], r[ 1 ] - prev[ 1 ], r[ 2 ] - prev[ 2 ] ) * FPS : 0;
		prev = [ ...r ];
		if ( v > peak[ 0 ] ) peak = [ v, t - 0.5 / FPS ]; // the speed is over the frame just ended: its middle
		if ( r[ 2 ] > ahead[ 0 ] ) ahead = [ r[ 2 ], t ];
		if ( k % every === 0 ) console.log( `  t ${ t.toFixed( 2 ) }  R ${ f2( r[ 0 ] ) } ${ r[ 1 ].toFixed( 2 ) } ${ f2( r[ 2 ] ) }  L ${ f2( l[ 0 ] ) } ${ l[ 1 ].toFixed( 2 ) } ${ f2( l[ 2 ] ) }  vR ${ v.toFixed( 1 ) }` );

	}

	console.log( `PEAK ${ name } speed ${ peak[ 0 ].toFixed( 1 ) } m/s at ${ peak[ 1 ].toFixed( 3 ) } s; furthest ahead ${ ahead[ 0 ].toFixed( 2 ) } m at ${ ahead[ 1 ].toFixed( 3 ) } s` );

}
