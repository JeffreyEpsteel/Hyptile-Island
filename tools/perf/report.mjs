// Prints a perf run (tools/perf/runner.js output, perf-<tag>.json) as a short table: frame times per scenario, the
// costliest CPU scopes and GPU passes, and the P2 culling candidates (or why they are unverified).
//   node tools/perf/report.mjs tools/perf/out/perf-mybox.json [top = 8]
import { readFileSync } from 'node:fs';
import { cullingCandidates } from './scenarios.js';

const file = process.argv[ 2 ];
const top = Number( process.argv[ 3 ] ) || 8;
if ( ! file ) {

	console.log( 'usage: node tools/perf/report.mjs <perf-tag.json> [top]' );
	process.exit( 1 );

}

const r = JSON.parse( readFileSync( file, 'utf8' ) );
const f = ( v ) => ( Number.isFinite( v ) ? v.toFixed( 2 ) : '-' );
console.log( `${ r.tag } · ${ r.at } · ${ r.size ? r.size.join( 'x' ) : '?' } · GPU timestamps ${ r.gpuTimestamps ? 'on' : 'off' }` );
for ( const [ id, s ] of Object.entries( r.scenarios || {} ) ) {

	console.log( `\n${ s.name } (${ id }) · ${ s.frames } frames · CPU mean ${ f( s.cpu.mean ) } p95 ${ f( s.cpu.p95 ) } max ${ f( s.cpu.max ) } ms · over 16.7 ms: ${ Math.round( s.budget.share * 100 ) } %` +
		( s.gpu ? ` · GPU mean ${ f( s.gpu.mean ) } p95 ${ f( s.gpu.p95 ) } ms` : '' ) );
	if ( s.setup && s.setup.notes && s.setup.notes.length ) console.log( '  notes: ' + s.setup.notes.join( '; ' ) );
	for ( const row of ( s.scopes || [] ).filter( ( r ) => ! r.nested ).slice( 0, top ) ) console.log( `  cpu  ${ row.name.padEnd( 24 ) } ${ f( row.mean ) } ms  p95 ${ f( row.p95 ) }  ${ Math.round( row.share * 100 ) } %` );
	for ( const row of ( s.scopes || [] ).filter( ( r ) => r.nested && r.name.startsWith( 'pass:' ) ) ) {

		const d = ( s.scopes || [] ).find( ( r ) => r.name === 'draws:' + row.name.slice( 5 ) );
		console.log( `  pass ${ row.name.slice( 5 ).padEnd( 24 ) } ${ f( row.mean ) } ms  p95 ${ f( row.p95 ) }  ${ d ? Math.round( d.mean ) + ' draws' : '' }` );

	}
	for ( const [ k, v ] of ( s.passes || [] ).slice( 0, top ) ) console.log( `  gpu  ${ String( k ).padEnd( 24 ) } ${ f( v ) } ms` );

}

const c = r.candidates ? r : cullingCandidates( r );
console.log( '\nP2 culling candidates:' );
for ( const x of c.candidates ) console.log( `  ${ x.kind }: ${ x.scope } ${ f( x.mean ) } ms (${ x.scenario }) -> ${ x.fix }` );
if ( ! c.candidates.length ) console.log( '  none over the thresholds' );
for ( const x of c.unverified ) console.log( `  unverified ${ x.kind }: ${ x.why }` );
