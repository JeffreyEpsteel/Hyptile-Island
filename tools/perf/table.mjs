// Markdown table of several perf runs side by side (docs/PERF.md): mean CPU and GPU ms per frame per scenario.
//   node tools/perf/table.mjs label=out/perf-a.json label2=out/perf-b.json ...
import { readFileSync } from 'node:fs';

const runs = process.argv.slice( 2 ).map( ( a ) => {

	const [ label, file ] = a.includes( '=' ) ? a.split( /=(.*)/s ) : [ a, a ];
	return { label, r: JSON.parse( readFileSync( file, 'utf8' ) ) };

} );
const ids = [ ...new Set( runs.flatMap( ( x ) => Object.keys( x.r.scenarios || {} ) ) ) ];
const f = ( v ) => ( Number.isFinite( v ) ? v.toFixed( 1 ) : '-' );
console.log( `| scenario | ${ runs.map( ( x ) => `${ x.label } CPU / GPU ms` ).join( ' | ' ) } |` );
console.log( `|---|${ runs.map( () => '---' ).join( '|' ) }|` );
for ( const id of ids ) console.log( `| ${ id } | ${ runs.map( ( x ) => {

	const s = x.r.scenarios[ id ];
	return s ? `${ f( s.cpu.mean ) } / ${ s.gpu ? f( s.gpu.mean ) : '-' }` : '-';

} ).join( ' | ' ) } |` );
