// Plain-node test of the roster GLBs' clips (wave 11C): every clip the animation graph names (Characters.js CLIPS) is in
// each of the eight characters and none of them is the bind pose (ProcPose.bindLike: every key within 8 deg of the rest).
// Helm_Idle, Steer_Left / Right, Seated_Idle and Fall_Loop used to be: their authored FBXs carry the clip's first frame as the
// skeleton rest, and tools/roster/convert-character.py now rebases them (`|rebase` in build.ps1). The seated clips must
// also carry the pelvis drop of sitting (the authored 0.29 m) and the first frame of each must already be posed.
//   node test/roster-clips.mjs [id ...]
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, basename } from 'node:path';
import { parseGLB } from '../src/engine/loaders/GLTF.js';
import { bindLike, clipRestDeviation } from '../src/player/ik/ProcPose.js';
import { CLIPS, CHARACTER_IDS } from '../src/game/Characters.js';

const ROOT = fileURLToPath( new URL( '..', import.meta.url ) );
const ROSTER = join( ROOT, 'public', 'models', 'roster' );
const REBASED = [ 'Helm_Idle', 'Steer_Left', 'Steer_Right', 'Seated_Idle', 'Fall_Loop' ];
const SEATED = [ 'Seated_Idle', 'Steer_Left', 'Steer_Right' ];

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};

const only = process.argv.slice( 2 );
const ids = readdirSync( ROSTER ).filter( ( f ) => f.endsWith( '.glb' ) ).map( ( f ) => basename( f, '.glb' ) ).sort()
	.filter( ( id ) => only.length === 0 || only.includes( id ) );
if ( only.length === 0 ) ok( CHARACTER_IDS.every( ( id ) => ids.includes( id ) ), `a GLB for every character (${ ids.join( ', ' ) })` );

// the rest-pose view bindLike / clipRestDeviation need (SkinnedModel.rest: the glTF nodes' TRS)
const restOf = ( gltf ) => gltf.nodes.map( ( n ) => ( { t: n.t, r: n.r, s: n.s } ) );
// the first key of a clip only (the old fault: every authored clip started in the bind pose)
const firstKeys = ( clip ) => ( { ...clip, channels: clip.channels.map( ( c ) => ( { ...c, values: c.values.slice( 0, c.path === 'rotation' ? 4 : 3 ) } ) ) } );

for ( const id of ids ) {

	const buf = readFileSync( join( ROSTER, id + '.glb' ) );
	const gltf = parseGLB( buf.buffer.slice( buf.byteOffset, buf.byteOffset + buf.byteLength ) );
	const model = { rest: restOf( gltf ) };
	const clips = new Map( gltf.animations.map( ( a ) => [ a.name, a ] ) );
	const names = [ ...new Set( Object.values( CLIPS ) ) ];
	const missing = names.filter( ( n ) => ! clips.has( n ) );
	ok( missing.length === 0, `${ id }: all ${ names.length } graph clips present${ missing.length ? ' (missing ' + missing.join( ', ' ) + ')' : '' }` );
	const bind = names.filter( ( n ) => clips.has( n ) && bindLike( clips.get( n ), model ) );
	ok( bind.length === 0, `${ id }: no graph clip is the bind pose${ bind.length ? ' (' + bind.map( ( n ) => n + ' ' + clipRestDeviation( clips.get( n ), model.rest ).toFixed( 1 ) + ' deg' ).join( ', ' ) + ')' : '' }` );
	ok( names.every( ( n ) => ! clips.has( n ) || clips.get( n ).duration > 0.1 ), `${ id }: every graph clip has a length` );
	const posed0 = REBASED.filter( ( n ) => clips.has( n ) && ! bindLike( firstKeys( clips.get( n ) ), model ) );
	ok( posed0.length === REBASED.length, `${ id }: the rebased clips are posed from their first frame (${ posed0.length } / ${ REBASED.length })` );
	// sitting: the pelvis key sits lower than the rest by the authored seat drop (pelvis local Y is the rig's up after the export)
	const pi = gltf.nodes.findIndex( ( n ) => n.name === 'pelvis' );
	for ( const n of SEATED ) {

		const c = clips.get( n );
		const ch = c && c.channels.find( ( k ) => k.node === pi && k.path === 'translation' );
		const r = gltf.nodes[ pi ].t;
		const drop = ch ? Math.hypot( ch.values[ 0 ] - r[ 0 ], ch.values[ 1 ] - r[ 1 ], ch.values[ 2 ] - r[ 2 ] ) : 0;
		ok( drop > 0.2 && drop < 0.4, `${ id }: ${ n } lowers the pelvis into the seat (${ drop.toFixed( 3 ) } m)` );

	}

}

console.log( fails ? `${ fails } failed` : 'all passed' );
process.exit( fails ? 1 : 0 );
