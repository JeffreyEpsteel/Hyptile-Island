// Post-process a roster GLB's clips in place of a Blender pass (wave 18E). Steps, in order (STEPS below):
//   legs <Clip>              feet kept on the floor: any frame whose ankle sinks below the rest ankle height gets that leg
//                            re-solved by two-bone IK (same knee plane), the foot keeping its world rotation; for the seats
//                            lower than the Rocketbox chair (Sit_Down / Stand_Up at the game's 0.29 m pelvis drop)
//   tail <A> <B> <s>         the last s seconds of A blend into B's first frame (Sit_Down ends exactly on Seated_Idle)
//   head <A> <B> <s>         the first s seconds of A blend out of B's first frame (Stand_Up starts on Seated_Idle)
//   bake <Name>              a pose clip from tools/roster/pose-clips.mjs on this GLB's own base clip
// Every clip a step names must be in the GLB. Run it once on a committed GLB right after splicing fresh Sit_Down / Stand_Up /
// Sit_Chair / Stand_From_Chair takes into it (tools/roster/anim-splice.ps1 does): `tail` / `head` on an already blended clip
// would blend again. The written clips go through splice-clips.mjs, so nothing else in the GLB changes.
//   node tools/roster/post-clips.mjs <in.glb> <out.glb> [Name ...]     (names: only the steps that write those clips)
import { readFileSync, writeFileSync } from 'node:fs';
import { readGLB, writeGLB, spliceClips } from './splice-clips.mjs';
import { parseGLB } from '../../src/engine/loaders/GLTF.js';
import { makeRig, localsAt, fk, twoBone, poseClip, qmul, qconj, qnorm, qslerp } from '../../src/player/anim/ClipTools.js';
import RECIPES from './pose-clips.mjs';

export const STEPS = [
	[ 'legs', 'Sit_Down' ], [ 'legs', 'Stand_Up' ],
	[ 'tail', 'Sit_Down', 'Seated_Idle', 0.7 ], [ 'head', 'Stand_Up', 'Seated_Idle', 0.6 ],
	[ 'tail', 'Sit_Chair', 'Sit_Chair_Idle', 0.7 ], [ 'head', 'Stand_From_Chair', 'Sit_Chair_Idle', 0.5 ],
	...Object.keys( RECIPES ).map( ( n ) => [ 'bake', n ] ),
];

const smooth = ( x ) => x <= 0 ? 0 : x >= 1 ? 1 : x * x * ( 3 - 2 * x );

// the clip's frames as local poses (its own key times: the roster clips are baked every frame)
function framesOf( rig, clip ) {

	// the densest channel's times (the exporter keeps two keys on a constant channel)
	const ch = clip.channels.reduce( ( a, c ) => c.times.length > a.times.length ? c : a, clip.channels[ 0 ] );
	const times = Array.from( ch.times );
	return { times, locs: times.map( ( t ) => localsAt( rig, clip, t ) ) };

}

// local poses back into a clip with the source's channels (node, path) on the given times
function toClip( name, src, times, locs ) {

	const T = new Float32Array( times );
	const channels = src.channels.map( ( c ) => {

		const w = c.path === 'rotation' ? 4 : 3;
		const v = new Float32Array( times.length * w );
		locs.forEach( ( L, k ) => v.set( c.path === 'rotation' ? L[ c.node ].r : L[ c.node ].t, k * w ) );
		return { node: c.node, path: c.path, times: T, values: v };

	} ).filter( ( c ) => c.path === 'rotation' || c.path === 'translation' );
	return { name, duration: times[ times.length - 1 ] - times[ 0 ], channels };

}

export function legs( rig, clip ) {

	const { times, locs } = framesOf( rig, clip );
	const rest = fk( rig, rig.rest.map( ( r ) => ( { t: r.t.slice(), r: r.r.slice() } ) ) ).P;
	let fixed = 0, worst = 0;
	for ( const loc of locs ) for ( const s of [ 'l', 'r' ] ) {

		const I = rig.index, it = I[ 'thigh_' + s ], ic = I[ 'calf_' + s ], ifo = I[ 'foot_' + s ];
		const floor = rest[ ifo ][ 1 ];
		let { R, P } = fk( rig, loc );
		const sink = floor - P[ ifo ][ 1 ];
		if ( sink <= 0.002 ) continue;
		worst = Math.max( worst, sink );
		const footW = R[ ifo ].slice();
		const A = P[ it ], B = P[ ic ], C = P[ ifo ];
		const pole = [ B[ 0 ] - ( A[ 0 ] + C[ 0 ] ) / 2, B[ 1 ] - ( A[ 1 ] + C[ 1 ] ) / 2, B[ 2 ] - ( A[ 2 ] + C[ 2 ] ) / 2 ];
		twoBone( rig, loc, 'thigh_' + s, 'calf_' + s, 'foot_' + s, [ C[ 0 ], floor, C[ 2 ] ], pole, 1 );
		( { R } = fk( rig, loc ) );
		loc[ ifo ].r = qnorm( qmul( qconj( R[ ic ] ), footW ) );
		fixed ++;

	}

	console.log( `LEGS ${ clip.name }: ${ fixed } leg frames re-solved, deepest sink ${ worst.toFixed( 3 ) } m` );
	return toClip( clip.name, clip, times, locs );

}

// blend a clip's start (head) or end (tail) with another clip's first frame over `sec`
export function blendEnd( rig, clip, other, sec, end ) {

	const { times, locs } = framesOf( rig, clip );
	const B = localsAt( rig, other, other.channels[ 0 ].times[ 0 ] );
	const t0 = times[ 0 ], t1 = times[ times.length - 1 ];
	locs.forEach( ( L, k ) => {

		const t = times[ k ];
		const w = end ? smooth( ( t - ( t1 - sec ) ) / sec ) : 1 - smooth( ( t - t0 ) / sec );
		if ( w <= 0 ) return;
		for ( let i = 0; i < L.length; i ++ ) {

			L[ i ].r = qslerp( L[ i ].r, B[ i ].r, w );
			L[ i ].t = L[ i ].t.map( ( v, c ) => v + ( B[ i ].t[ c ] - v ) * w );

		}

	} );
	console.log( `${ end ? 'TAIL' : 'HEAD' } ${ clip.name } ${ end ? '->' : '<-' } ${ other.name } over ${ sec } s` );
	return toClip( clip.name, clip, times, locs );

}

export function bake( rig, clips, name, recipe = RECIPES[ name ] ) {

	const base = clips.get( recipe.base );
	if ( ! base ) throw new Error( `bake ${ name }: no base clip ${ recipe.base }` );
	let keys = recipe.keys, duration;
	if ( recipe.cycle ) {

		duration = base.duration;
		keys = keys.map( ( k ) => ( { ...k, t: k.t * duration } ) );

	}

	const c = poseClip( rig, base, name, keys, { baseTime: recipe.baseTime || 0, loopBase: !! recipe.loopBase, ...( duration ? { duration } : {} ) } );
	console.log( `BAKE ${ name } on ${ recipe.base }: ${ c.duration.toFixed( 2 ) } s, ${ c.channels.length } channels` );
	return { ...c, procedural: undefined };

}

// clips (engine shape) -> a minimal glTF {json, bin} with the base GLB's node names, for spliceClips
function freshGLB( nodes, clips ) {

	const parts = [], accessors = [], bufferViews = [], animations = [];
	let len = 0;
	const view = ( arr ) => {

		const bytes = new Uint8Array( arr.buffer, arr.byteOffset, arr.byteLength );
		const pad = ( 4 - ( len & 3 ) ) & 3;
		if ( pad ) { parts.push( new Uint8Array( pad ) ); len += pad; }
		bufferViews.push( { buffer: 0, byteOffset: len, byteLength: bytes.length } );
		parts.push( bytes.slice() ); len += bytes.length;
		return bufferViews.length - 1;

	};

	for ( const c of clips ) {

		const samplers = [], channels = [];
		const timeAcc = new Map();
		for ( const ch of c.channels ) {

			let ti = timeAcc.get( ch.times );
			if ( ti === undefined ) {

				const T = Float32Array.from( ch.times );
				accessors.push( { bufferView: view( T ), componentType: 5126, count: T.length, type: 'SCALAR', min: [ T[ 0 ] ], max: [ T[ T.length - 1 ] ] } );
				ti = accessors.length - 1;
				timeAcc.set( ch.times, ti );

			}

			const V = Float32Array.from( ch.values );
			accessors.push( { bufferView: view( V ), componentType: 5126, count: V.length / ( ch.path === 'rotation' ? 4 : 3 ), type: ch.path === 'rotation' ? 'VEC4' : 'VEC3' } );
			samplers.push( { input: ti, output: accessors.length - 1, interpolation: 'LINEAR' } );
			channels.push( { sampler: samplers.length - 1, target: { node: ch.node, path: ch.path } } );

		}

		animations.push( { name: c.name, samplers, channels } );

	}

	const bin = new Uint8Array( len );
	let o = 0;
	for ( const p of parts ) { bin.set( p, o ); o += p.length; }
	return { json: { nodes: nodes.map( ( n ) => ( { name: n.name } ) ), accessors, bufferViews, animations }, bin };

}

export function postProcess( buf, only = null ) {

	const gltf = parseGLB( buf.buffer.slice( buf.byteOffset, buf.byteOffset + buf.byteLength ) );
	const rig = makeRig( gltf );
	const clips = new Map( gltf.animations.map( ( a ) => [ a.name, a ] ) );
	const written = new Map();
	for ( const [ op, a, b, s ] of STEPS ) {

		if ( only && ! only.includes( a ) ) continue;
		let c;
		if ( op === 'bake' ) c = bake( rig, clips, a );
		else {

			const src = clips.get( a );
			if ( ! src ) { console.log( `SKIP ${ op } ${ a }: not in this GLB` ); continue; }
			if ( op === 'legs' ) c = legs( rig, src );
			else {

				const other = clips.get( b );
				if ( ! other ) { console.log( `SKIP ${ op } ${ a }: no ${ b }` ); continue; }
				c = blendEnd( rig, src, other, s, op === 'tail' );

			}

		}

		clips.set( a, c );
		written.set( a, c );

	}

	const base = readGLB( buf );
	const fresh = freshGLB( gltf.nodes, [ ...written.values() ] );
	return { ...spliceClips( base, fresh, [ ...written.keys() ] ), names: [ ...written.keys() ] };

}

if ( process.argv[ 1 ] && import.meta.url.endsWith( process.argv[ 1 ].replace( /\\/g, '/' ).split( '/' ).pop() ) ) {

	const [ inPath, outPath, ...only ] = process.argv.slice( 2 );
	if ( ! outPath ) {

		console.error( 'usage: node tools/roster/post-clips.mjs <in.glb> <out.glb> [Clip ...]' );
		process.exit( 2 );

	}

	const r = postProcess( readFileSync( inPath ), only.length ? only : null );
	const bytes = writeGLB( r.json, r.bin );
	writeFileSync( outPath, bytes );
	console.log( 'POSTED', outPath, bytes.length, r.names.join( ' ' ) );

}
