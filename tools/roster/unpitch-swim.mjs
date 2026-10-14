// Stand prone swim clips back up: Kimodo's swim takes (tools/kimodo_text_encoder_setup, "Swim_*") lie face down, but the game
// keeps the swimmer's clips upright and pitches the whole avatar forward itself (src/player/Avatar.js SWIM_PITCH) with the
// procedural sculling / flutter kick on top (src/player/ik/ProcPose.js _swim). This rotates each named clip's pelvis keys by
// one constant rotation (the shortest arc taking the clip's mean pelvis -> neck direction onto straight up, in the pelvis'
// parent space) and pins the pelvis translation to the standing rest height, so the stroke is kept and the body stands.
//   node tools/roster/unpitch-swim.mjs <in.glb> <out.glb> Swim_Idle Swim_Forward Swim_Fast
// Edits the clips' pelvis rotation / translation accessors in place (same sizes); prints the correction per clip.
import fs from 'node:fs';

const [ inPath, outPath, ...clipNames ] = process.argv.slice( 2 );
if ( ! inPath || ! outPath || ! clipNames.length ) { console.error( 'usage: unpitch-swim.mjs <in.glb> <out.glb> Clip ...' ); process.exit( 1 ); }

const b = fs.readFileSync( inPath );
const jl = b.readUInt32LE( 12 ), json = JSON.parse( b.subarray( 20, 20 + jl ).toString() );
const binOff = 20 + jl + 8, binLen = b.readUInt32LE( 20 + jl );
const bin = Buffer.from( b.subarray( binOff, binOff + binLen ) ); // a copy we write into

const CT = { 5126: [ 'f32', 4 ], 5123: [ 'u16', 2 ], 5122: [ 'i16', 2 ], 5121: [ 'u8', 1 ], 5120: [ 'i8', 1 ] };
const NC = { SCALAR: 1, VEC3: 3, VEC4: 4 };
function view( i ) {

	const a = json.accessors[ i ], bv = json.bufferViews[ a.bufferView ], [ kind, size ] = CT[ a.componentType ], n = NC[ a.type ];
	const base = ( bv.byteOffset || 0 ) + ( a.byteOffset || 0 ), stride = bv.byteStride || size * n;
	const max = kind === 'i16' ? 32767 : kind === 'u16' ? 65535 : kind === 'i8' ? 127 : 255;
	const rd = ( o ) => kind === 'f32' ? bin.readFloatLE( o ) : kind === 'i16' ? bin.readInt16LE( o ) : kind === 'u16' ? bin.readUInt16LE( o ) : kind === 'i8' ? bin.readInt8( o ) : bin.readUInt8( o );
	const wr = ( o, v ) => kind === 'f32' ? bin.writeFloatLE( v, o ) : kind === 'i16' ? bin.writeInt16LE( v, o ) : kind === 'u16' ? bin.writeUInt16LE( v, o ) : kind === 'i8' ? bin.writeInt8( v, o ) : bin.writeUInt8( v, o );
	return {
		count: a.count, n,
		get( k ) { const out = []; for ( let c = 0; c < n; c ++ ) { const v = rd( base + k * stride + c * size ); out.push( a.normalized ? Math.max( v / max, - 1 ) : v ); } return out; },
		set( k, vals ) { for ( let c = 0; c < n; c ++ ) wr( base + k * stride + c * size, a.normalized ? Math.round( Math.max( - 1, Math.min( 1, vals[ c ] ) ) * max ) : vals[ c ] ); },
		minmax( vals ) { if ( a.min ) for ( let c = 0; c < n; c ++ ) { a.min[ c ] = Math.min( a.min[ c ], vals[ c ] ); a.max[ c ] = Math.max( a.max[ c ], vals[ c ] ); } },
	};

}

// quaternion / vector helpers ([ x, y, z, w ])
const qmul = ( a, b ) => [ a[ 3 ] * b[ 0 ] + a[ 0 ] * b[ 3 ] + a[ 1 ] * b[ 2 ] - a[ 2 ] * b[ 1 ], a[ 3 ] * b[ 1 ] - a[ 0 ] * b[ 2 ] + a[ 1 ] * b[ 3 ] + a[ 2 ] * b[ 0 ], a[ 3 ] * b[ 2 ] + a[ 0 ] * b[ 1 ] - a[ 1 ] * b[ 0 ] + a[ 2 ] * b[ 3 ], a[ 3 ] * b[ 3 ] - a[ 0 ] * b[ 0 ] - a[ 1 ] * b[ 1 ] - a[ 2 ] * b[ 2 ] ];
const qinv = ( q ) => [ - q[ 0 ], - q[ 1 ], - q[ 2 ], q[ 3 ] ];
const qrot = ( q, v ) => { const p = qmul( qmul( q, [ v[ 0 ], v[ 1 ], v[ 2 ], 0 ] ), qinv( q ) ); return [ p[ 0 ], p[ 1 ], p[ 2 ] ]; };
const qnorm = ( q ) => { const l = Math.hypot( ...q ) || 1; return q.map( ( x ) => x / l ); };
const add = ( a, b ) => [ a[ 0 ] + b[ 0 ], a[ 1 ] + b[ 1 ], a[ 2 ] + b[ 2 ] ];
const nrm = ( v ) => { const l = Math.hypot( ...v ) || 1; return v.map( ( x ) => x / l ); };
function arc( u, v ) { // shortest rotation taking unit u onto unit v

	const d = u[ 0 ] * v[ 0 ] + u[ 1 ] * v[ 1 ] + u[ 2 ] * v[ 2 ];
	const c = [ u[ 1 ] * v[ 2 ] - u[ 2 ] * v[ 1 ], u[ 2 ] * v[ 0 ] - u[ 0 ] * v[ 2 ], u[ 0 ] * v[ 1 ] - u[ 1 ] * v[ 0 ] ];
	return qnorm( [ c[ 0 ], c[ 1 ], c[ 2 ], 1 + d ] );

}

const nodes = json.nodes, byName = new Map( nodes.map( ( n, i ) => [ n.name, i ] ) );
const parent = new Map();
nodes.forEach( ( n, i ) => ( n.children || [] ).forEach( ( c ) => parent.set( c, i ) ) );
const restR = ( i ) => nodes[ i ].rotation || [ 0, 0, 0, 1 ], restT = ( i ) => nodes[ i ].translation || [ 0, 0, 0 ];
const PEL = byName.get( 'pelvis' ), CHAIN = [ 'spine_01', 'spine_02', 'neck_01' ].map( ( n ) => byName.get( n ) );
if ( PEL === undefined || CHAIN.includes( undefined ) ) { console.error( 'no pelvis / spine chain in', inPath ); process.exit( 1 ); }
// the pelvis' parent's world rotation (rest; the root / Armature are not animated in the roster GLBs)
let Pw = [ 0, 0, 0, 1 ];
for ( let k = parent.get( PEL ); k !== undefined; k = parent.get( k ) ) Pw = qmul( restR( k ), Pw );
const upP = nrm( qrot( qinv( Pw ), [ 0, 1, 0 ] ) ); // world up in the pelvis' parent space

// the standing pelvis translation: Idle_Breathe's first pelvis key, else the rest
let standT = restT( PEL );
const idle = json.animations.find( ( a ) => a.name === 'Idle_Breathe' );
if ( idle ) for ( const ch of idle.channels ) if ( ch.target.node === PEL && ch.target.path === 'translation' ) standT = view( idle.samplers[ ch.sampler ].output ).get( 0 );

for ( const name of clipNames ) {

	const an = json.animations.find( ( a ) => a.name === name );
	if ( ! an ) { console.log( 'MISSING', name ); continue; }
	const track = ( node, path ) => { const ch = an.channels.find( ( c ) => c.target.node === node && c.target.path === path ); return ch ? view( an.samplers[ ch.sampler ].output ) : null; };
	const pr = track( PEL, 'rotation' ), pt = track( PEL, 'translation' );
	if ( ! pr ) { console.log( 'NO PELVIS ROTATION', name ); continue; }
	const chain = CHAIN.map( ( i ) => track( i, 'rotation' ) );
	// mean pelvis -> neck direction in the parent space over the clip
	let mean = [ 0, 0, 0 ];
	for ( let k = 0; k < pr.count; k ++ ) {

		// neck position in pelvis space, walked back from the neck
		let p = [ 0, 0, 0 ];
		for ( let j = CHAIN.length - 1; j >= 0; j -- ) {

			const node = CHAIN[ j ], tr = chain[ j ];
			const r = tr ? tr.get( Math.min( k, tr.count - 1 ) ) : restR( node );
			p = add( restT( node ), qrot( r, p ) );

		}

		mean = add( mean, qrot( pr.get( k ), p ) );

	}

	const dir = nrm( mean ), C = arc( dir, upP );
	const deg = 2 * Math.acos( Math.min( 1, Math.abs( C[ 3 ] ) ) ) * 180 / Math.PI;
	for ( let k = 0; k < pr.count; k ++ ) { const q = qnorm( qmul( C, pr.get( k ) ) ); pr.set( k, q ); pr.minmax( q ); }
	if ( pt ) for ( let k = 0; k < pt.count; k ++ ) { pt.set( k, standT ); pt.minmax( standT ); }
	console.log( `UNPITCH ${ name } ${ deg.toFixed( 1 ) } deg (mean spine dir ${ dir.map( ( x ) => x.toFixed( 2 ) ).join( ' ' ) } -> up ${ upP.map( ( x ) => x.toFixed( 2 ) ).join( ' ' ) })` );

}

const js = Buffer.from( JSON.stringify( json ) ), jpad = ( 4 - js.length % 4 ) % 4, bpad = ( 4 - bin.length % 4 ) % 4;
const jsonChunk = Buffer.concat( [ js, Buffer.alloc( jpad, 0x20 ) ] ), binChunk = Buffer.concat( [ bin, Buffer.alloc( bpad ) ] );
const head = Buffer.alloc( 12 ); head.writeUInt32LE( 0x46546C67, 0 ); head.writeUInt32LE( 2, 4 ); head.writeUInt32LE( 12 + 8 + jsonChunk.length + 8 + binChunk.length, 8 );
const h1 = Buffer.alloc( 8 ); h1.writeUInt32LE( jsonChunk.length, 0 ); h1.writeUInt32LE( 0x4E4F534A, 4 );
const h2 = Buffer.alloc( 8 ); h2.writeUInt32LE( binChunk.length, 0 ); h2.writeUInt32LE( 0x004E4942, 4 );
fs.writeFileSync( outPath, Buffer.concat( [ head, h1, jsonChunk, h2, binChunk ] ) );
console.log( 'WROTE', outPath );
