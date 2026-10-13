// Who owns the big ArrayBuffers? Parses a V8 heap snapshot (tools/perf/headless.mjs --heap-snapshot=<file>) and lists the
// largest ArrayBuffer backing stores with the typed array that views them and the properties that hold that view:
//   node tools/perf/heap-buffers.mjs <file.heapsnapshot> [--top=40] [--min-mb=0.5]
import { readFileSync } from 'node:fs';

const file = process.argv[ 2 ];
if ( ! file ) { console.error( 'usage: node tools/perf/heap-buffers.mjs <file.heapsnapshot> [--top=40] [--min-mb=0.5]' ); process.exit( 1 ); }
const arg = ( k, d ) => { const a = process.argv.find( ( x ) => x.startsWith( '--' + k + '=' ) ); return a ? Number( a.split( '=' )[ 1 ] ) : d; };
const TOP = arg( 'top', 40 ), MIN = arg( 'min-mb', 0.5 ) * 1048576;

const snap = JSON.parse( readFileSync( file, 'utf8' ) );
const meta = snap.snapshot.meta, nodes = snap.nodes, edges = snap.edges, strings = snap.strings;
const NF = meta.node_fields.length, EF = meta.edge_fields.length;
const nTypeI = meta.node_fields.indexOf( 'type' ), nNameI = meta.node_fields.indexOf( 'name' ), nSizeI = meta.node_fields.indexOf( 'self_size' ), nEdgesI = meta.node_fields.indexOf( 'edge_count' );
const eTypeI = meta.edge_fields.indexOf( 'type' ), eNameI = meta.edge_fields.indexOf( 'name_or_index' ), eToI = meta.edge_fields.indexOf( 'to_node' );
const nodeTypes = meta.node_types[ nTypeI ], edgeTypes = meta.edge_types[ eTypeI ];
const nodeCount = nodes.length / NF;

// first edge index of every node
const firstEdge = new Uint32Array( nodeCount + 1 );
for ( let i = 0, e = 0; i < nodeCount; i ++ ) { firstEdge[ i ] = e; e += nodes[ i * NF + nEdgesI ] * EF; }
firstEdge[ nodeCount ] = edges.length;
const nameOf = ( n ) => strings[ nodes[ n * NF + nNameI ] ];
const typeOf = ( n ) => nodeTypes[ nodes[ n * NF + nTypeI ] ];
const sizeOf = ( n ) => nodes[ n * NF + nSizeI ];

// reverse edges: who points at a node (edge name kept)
const parents = new Map(); // node -> [ { from, name, type } ]
for ( let n = 0; n < nodeCount; n ++ ) {

	for ( let e = firstEdge[ n ]; e < firstEdge[ n + 1 ]; e += EF ) {

		const to = edges[ e + eToI ] / NF, et = edgeTypes[ edges[ e + eTypeI ] ];
		if ( et === 'weak' ) continue;
		const nm = et === 'element' || et === 'hidden' ? '[' + edges[ e + eNameI ] + ']' : strings[ edges[ e + eNameI ] ];
		let list = parents.get( to );
		if ( ! list ) parents.set( to, list = [] );
		if ( list.length < 12 ) list.push( { from: n, name: nm, type: et } );

	}

}

// backing stores -> the ArrayBuffer -> the typed arrays viewing it -> the properties that hold those views
const out = [];
for ( let n = 0; n < nodeCount; n ++ ) {

	if ( nameOf( n ) !== 'system / JSArrayBufferData' || sizeOf( n ) < MIN ) continue;
	const size = sizeOf( n );
	const ab = ( parents.get( n ) || [] ).find( ( p ) => nameOf( p.from ) === 'ArrayBuffer' || nameOf( p.from ) === 'SharedArrayBuffer' );
	const views = ab ? ( parents.get( ab.from ) || [] ).filter( ( p ) => p.name === 'buffer' ) : [];
	const owners = [];
	for ( const v of views ) {

		const vn = v.from;
		for ( const p of parents.get( vn ) || [] ) {

			if ( p.type !== 'property' && p.type !== 'element' && p.type !== 'internal' ) continue;
			const owner = p.from, on = nameOf( owner );
			// one more level: the property of the object that holds the owner (e.g. terrain.heights -> TerrainData)
			const up = ( parents.get( owner ) || [] ).find( ( q ) => q.type === 'property' );
			owners.push( `${ up ? nameOf( up.from ) + '.' + up.name + ' > ' : '' }${ on }.${ p.name } (${ nameOf( vn ) })` );
			if ( owners.length >= 3 ) break;

		}

		if ( owners.length >= 3 ) break;

	}

	out.push( { size, owners: owners.length ? owners : [ ab ? 'ArrayBuffer with no live view (' + ( parents.get( ab.from ) || [] ).map( ( p ) => nameOf( p.from ) + '.' + p.name ).slice( 0, 3 ).join( ', ' ) + ')' : 'no ArrayBuffer parent' ] } );

}

// --group: the stores summed by their first owner signature (finds the many-small-buffers pattern)
if ( process.argv.includes( '--group' ) ) {

	const g = new Map();
	for ( const o of out ) { const k = o.owners[ 0 ].replace( /\[\d+\]/g, '[#]' ); const e = g.get( k ) || { size: 0, n: 0 }; e.size += o.size; e.n ++; g.set( k, e ); }
	const rows = [ ...g.entries() ].sort( ( a, b ) => b[ 1 ].size - a[ 1 ].size ).slice( 0, TOP );
	for ( const [ k, e ] of rows ) console.log( `${ ( e.size / 1048576 ).toFixed( 1 ).padStart( 8 ) } MB  x${ String( e.n ).padStart( 6 ) }  ${ k }` );
	process.exit( 0 );

}

out.sort( ( a, b ) => b.size - a.size );
let total = 0;
for ( const o of out ) total += o.size;
console.log( `${ out.length } backing stores >= ${ ( MIN / 1048576 ).toFixed( 1 ) } MB, ${ ( total / 1048576 ).toFixed( 1 ) } MB in all` );
for ( const o of out.slice( 0, TOP ) ) console.log( `${ ( o.size / 1048576 ).toFixed( 1 ).padStart( 8 ) } MB  ${ o.owners.join( ' | ' ) }` );
