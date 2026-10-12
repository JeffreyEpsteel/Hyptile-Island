// Captain Roid's living clips: retargets roster clips (the JadeFisher v03 set, public/models/roster/hyptile.glb) onto
// his rig (public/models/npc/captain-roid.glb) and writes public/models/npc/captain-roid-clips.json.
//   node tools/roid/retarget.mjs
//
// Why: his own GLB has Idle and Repeat as completely static poses (two identical keys: he stood in an A-pose and never
// breathed), FirstEncounter moves one arm, and the HyptileMotion Talk that convert-roid.ps1 added was imported as
// Blender pose deltas against his T-pose rest, so it plays as a T-pose. He has no walk.
//
// Same 48 bone names, different rests (the roster's is an A-pose, his a T-pose) and proportions, so each bone's
// world-space rotation away from the source reference is applied to his reference (his own Idle pose, an A-pose like
// the roster rest), then made local again: Qt = Qs( f ) * inverse( Qs_ref ) * Qt_ref, qt = inverse( Qt_parent ) * Qt.
// The pelvis translation (bob, sway, the sit drop) is the source's offset from its reference scaled by the leg length
// ratio. Rotations are stored as int16 (base64), a channel that never moves as one key. CaptainRoid.js loads the file
// and adds the clips to his SkinnedModel (the walk's stride speed is in the file).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parseGLB } from '../../src/engine/loaders/GLTF.js';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const SRC = join( ROOT, 'public/models/roster/hyptile.glb' );
const DST = join( ROOT, 'public/models/npc/captain-roid.glb' );
const OUT = join( ROOT, 'public/models/npc/captain-roid-clips.json' );
// clip: fps of the baked keys
const CLIPS = { Idle_Breathe: 30, Walk_InPlace: 30, Look_Around: 15, Sit_Down: 30, Talk: 15, Point: 15 };
const WALK_SPEED_SRC = 1.1; // m/s of Walk_InPlace on the roster (Characters.js CLIP_SPEED.walk)

const load = ( f ) => {

	const b = readFileSync( f );
	return parseGLB( b.buffer.slice( b.byteOffset, b.byteOffset + b.byteLength ) );

};

// ---- quaternions [ x, y, z, w ] and TRS matrices (column-major)
const qmul = ( a, b ) => [
	a[ 3 ] * b[ 0 ] + a[ 0 ] * b[ 3 ] + a[ 1 ] * b[ 2 ] - a[ 2 ] * b[ 1 ],
	a[ 3 ] * b[ 1 ] - a[ 0 ] * b[ 2 ] + a[ 1 ] * b[ 3 ] + a[ 2 ] * b[ 0 ],
	a[ 3 ] * b[ 2 ] + a[ 0 ] * b[ 1 ] - a[ 1 ] * b[ 0 ] + a[ 2 ] * b[ 3 ],
	a[ 3 ] * b[ 3 ] - a[ 0 ] * b[ 0 ] - a[ 1 ] * b[ 1 ] - a[ 2 ] * b[ 2 ],
];
const qinv = ( a ) => [ - a[ 0 ], - a[ 1 ], - a[ 2 ], a[ 3 ] ];
const qnorm = ( a ) => { const l = Math.hypot( ...a ) || 1; return a.map( ( v ) => v / l ); };
const qrot = ( q, v ) => { const p = qmul( qmul( q, [ v[ 0 ], v[ 1 ], v[ 2 ], 0 ] ), qinv( q ) ); return [ p[ 0 ], p[ 1 ], p[ 2 ] ]; };

function sample( ch, t ) {

	const T = ch.times, V = ch.values, w = ch.path === 'rotation' ? 4 : 3, n = T.length;
	const at = ( k ) => Array.from( V.subarray( k * w, k * w + w ) );
	if ( n === 1 || t <= T[ 0 ] ) return at( 0 );
	if ( t >= T[ n - 1 ] ) return at( n - 1 );
	let k = 0;
	while ( k < n - 2 && T[ k + 1 ] <= t ) k ++;
	const f = ( t - T[ k ] ) / ( T[ k + 1 ] - T[ k ] ), a = at( k ), b = at( k + 1 );
	if ( w === 4 ) {

		const d = a[ 0 ] * b[ 0 ] + a[ 1 ] * b[ 1 ] + a[ 2 ] * b[ 2 ] + a[ 3 ] * b[ 3 ];
		return qnorm( a.map( ( v, c ) => v * ( 1 - f ) + b[ c ] * ( d < 0 ? - f : f ) ) );

	}

	return a.map( ( v, c ) => v + ( b[ c ] - v ) * f );

}

// a rig: names, parents, rest TRS; pose( clip, t ) -> local TRS per node; world( local ) -> { q, p } per node
function rig( g ) {

	const N = g.nodes.length, parent = new Int32Array( N ).fill( - 1 ), order = [];
	const visit = ( i ) => { order.push( i ); for ( const c of g.nodes[ i ].children ) { parent[ c ] = i; visit( c ); } };
	for ( const r of g.roots ) visit( r );
	const names = g.nodes.map( ( n ) => n.name );
	const rest = g.nodes.map( ( n ) => ( { t: Array.from( n.t ), r: Array.from( n.r ), s: Array.from( n.s ) } ) );
	const clip = ( name ) => g.animations.find( ( a ) => a.name === name );
	const pose = ( c, t ) => {

		const L = rest.map( ( x ) => ( { t: [ ...x.t ], r: [ ...x.r ], s: [ ...x.s ] } ) );
		if ( c ) for ( const ch of c.channels ) {

			const v = sample( ch, t );
			if ( ch.path === 'rotation' ) L[ ch.node ].r = v;
			else if ( ch.path === 'translation' ) L[ ch.node ].t = v;
			else L[ ch.node ].s = v;

		}

		return L;

	};

	// rotations and positions in model space (scales are 1 on both rigs; checked below)
	const world = ( L ) => {

		const W = new Array( N );
		for ( const i of order ) {

			const p = parent[ i ];
			if ( p < 0 ) W[ i ] = { q: qnorm( L[ i ].r ), p: [ ...L[ i ].t ] };
			else {

				const P = W[ p ], o = qrot( P.q, L[ i ].t );
				W[ i ] = { q: qnorm( qmul( P.q, L[ i ].r ) ), p: [ P.p[ 0 ] + o[ 0 ], P.p[ 1 ] + o[ 1 ], P.p[ 2 ] + o[ 2 ] ] };

			}

		}

		return W;

	};

	return { g, N, parent, order, names, rest, clip, pose, world, index: ( n ) => names.indexOf( n ) };

}

const S = rig( load( SRC ) ), T = rig( load( DST ) );
for ( const R of [ S, T ] ) for ( const x of R.rest ) if ( x.s.some( ( v ) => Math.abs( v - 1 ) > 1e-3 ) ) throw new Error( 'scaled node: the retarget assumes unit scales' );

const joints = T.g.skins[ 0 ].joints.map( ( i ) => T.names[ i ] ).filter( ( n ) => S.index( n ) >= 0 );
const sRef = S.world( S.pose( null, 0 ) ); // the roster rest (A-pose)
const tRefL = T.pose( T.clip( 'Idle' ), 0 ); // his own Idle (an A-pose too)
const tRef = T.world( tRefL );
const legLen = ( R, W ) => {

	const a = W[ R.index( 'thigh_l' ) ].p, b = W[ R.index( 'calf_l' ) ].p, c = W[ R.index( 'foot_l' ) ].p;
	return Math.hypot( a[ 0 ] - b[ 0 ], a[ 1 ] - b[ 1 ], a[ 2 ] - b[ 2 ] ) + Math.hypot( b[ 0 ] - c[ 0 ], b[ 1 ] - c[ 1 ], b[ 2 ] - c[ 2 ] );

};

const ratio = legLen( T, tRef ) / legLen( S, sRef );
const pelvisS = S.index( 'pelvis' ), pelvisT = T.index( 'pelvis' );
const b64 = ( i16 ) => Buffer.from( i16.buffer, i16.byteOffset, i16.byteLength ).toString( 'base64' );
const out = { version: 1, source: 'public/models/roster/hyptile.glb', target: 'public/models/npc/captain-roid.glb', legRatio: + ratio.toFixed( 4 ), walkSpeed: + ( WALK_SPEED_SRC * ratio ).toFixed( 3 ), clips: {} };

for ( const [ name, fps ] of Object.entries( CLIPS ) ) {

	const c = S.clip( name );
	if ( ! c ) throw new Error( 'no source clip ' + name );
	const frames = Math.max( 2, Math.round( c.duration * fps ) + 1 );
	const rot = joints.map( () => [] ), pel = [];
	for ( let f = 0; f < frames; f ++ ) {

		const t = Math.min( c.duration, f / fps );
		const sw = S.world( S.pose( c, t ) );
		// target world rotations, then local (parents first: T.order)
		const Qt = new Array( T.N );
		for ( const i of T.order ) {

			const n = T.names[ i ], si = S.index( n ), p = T.parent[ i ];
			const isJoint = joints.includes( n );
			if ( isJoint ) Qt[ i ] = qnorm( qmul( qmul( sw[ si ].q, qinv( sRef[ si ].q ) ), tRef[ i ].q ) );
			else Qt[ i ] = p < 0 ? qnorm( tRefL[ i ].r ) : qnorm( qmul( Qt[ p ], tRefL[ i ].r ) );

		}

		joints.forEach( ( n, j ) => {

			const i = T.index( n ), p = T.parent[ i ];
			let q = p < 0 ? Qt[ i ] : qnorm( qmul( qinv( Qt[ p ] ), Qt[ i ] ) );
			const prev = rot[ j ][ rot[ j ].length - 1 ];
			if ( prev && prev[ 0 ] * q[ 0 ] + prev[ 1 ] * q[ 1 ] + prev[ 2 ] * q[ 2 ] + prev[ 3 ] * q[ 3 ] < 0 ) q = q.map( ( v ) => - v );
			rot[ j ].push( q );

		} );

		// the pelvis: the source's model-space offset from its reference, scaled, in the parent's frame
		const d = [ 0, 1, 2 ].map( ( k ) => ( sw[ pelvisS ].p[ k ] - sRef[ pelvisS ].p[ k ] ) * ratio );
		const pp = T.parent[ pelvisT ];
		// (the pelvis's parents are the unanimated root and Armature at identity on his rig)
		const pw = [ 0, 1, 2 ].map( ( k ) => tRef[ pelvisT ].p[ k ] + d[ k ] );
		const par = pp < 0 ? { q: [ 0, 0, 0, 1 ], p: [ 0, 0, 0 ] } : { q: Qt[ pp ], p: tRef[ pp ].p };
		const loc = qrot( qinv( par.q ), [ pw[ 0 ] - par.p[ 0 ], pw[ 1 ] - par.p[ 1 ], pw[ 2 ] - par.p[ 2 ] ] );
		pel.push( ...loc.map( ( v ) => + v.toFixed( 4 ) ) );

	}

	const channels = [];
	joints.forEach( ( n, j ) => {

		const ks = rot[ j ];
		// a channel that stays within ~0.3 deg of its first key is stored as one key
		const still = ks.every( ( q ) => Math.abs( q[ 0 ] * ks[ 0 ][ 0 ] + q[ 1 ] * ks[ 0 ][ 1 ] + q[ 2 ] * ks[ 0 ][ 2 ] + q[ 3 ] * ks[ 0 ][ 3 ] ) > 0.999996 );
		const use = still ? [ ks[ 0 ] ] : ks;
		const i16 = new Int16Array( use.length * 4 );
		use.forEach( ( q, k ) => { for ( let c2 = 0; c2 < 4; c2 ++ ) i16[ k * 4 + c2 ] = Math.round( Math.max( - 1, Math.min( 1, q[ c2 ] ) ) * 32767 ); } );
		channels.push( { node: n, keys: use.length, q: b64( i16 ) } );

	} );

	out.clips[ name ] = { duration: + c.duration.toFixed( 4 ), fps, frames, channels, pelvis: pel };
	console.log( 'CLIP', name, frames, 'frames', channels.filter( ( c2 ) => c2.keys > 1 ).length, 'moving bones' );

}

writeFileSync( OUT, JSON.stringify( out ) );
console.log( 'WROTE', OUT, readFileSync( OUT ).length, 'bytes; leg ratio', ratio.toFixed( 3 ), 'walk', out.walkSpeed, 'm/s at rate 1' );
