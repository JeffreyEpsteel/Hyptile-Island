// Local collector for the bench and perf runs: a tiny HTTP server on 127.0.0.1 that writes every POSTed body to a
// file in an output folder. core/Bench.js (?bench&auto=tag: shots *.bgra, bench-tag.json) and tools/perf/runner.js
// (?bench&perf=all&tag=name: perf-name.json) post to http://127.0.0.1:5190/<file>.
//
//   node tools/perf/collect.mjs [outDir = tools/perf/out] [port = 5190]
//   then open  http://localhost:5173/?bench&perf=all&tag=mybox   (Vite dev server, run by the root)
//   node tools/perf/report.mjs tools/perf/out/perf-mybox.json        (a readable summary)
//
// Only 127.0.0.1 is bound; file names are reduced to [A-Za-z0-9._-]; bodies over 256 MB are refused.

import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

const out = resolve( process.argv[ 2 ] || join( import.meta.dirname || '.', 'out' ) );
const port = Number( process.argv[ 3 ] ) || 5190;
const MAX = 256 * 1024 * 1024;
mkdirSync( out, { recursive: true } );

function safeName( url ) {

	const name = basename( decodeURIComponent( String( url || '' ).split( '?' )[ 0 ] ) ).replace( /[^A-Za-z0-9._-]/g, '_' );
	return name && name !== '.' && name !== '..' ? name : 'upload.bin';

}

createServer( ( req, res ) => {

	res.setHeader( 'Access-Control-Allow-Origin', '*' );
	res.setHeader( 'Access-Control-Allow-Methods', 'POST, OPTIONS' );
	if ( req.method === 'OPTIONS' ) return res.end();
	if ( req.method !== 'POST' ) {

		res.statusCode = 405;
		return res.end();

	}

	const chunks = [];
	let size = 0;
	req.on( 'data', ( c ) => {

		size += c.length;
		if ( size > MAX ) req.destroy();
		else chunks.push( c );

	} );
	req.on( 'end', () => {

		const file = join( out, safeName( req.url ) );
		writeFileSync( file, Buffer.concat( chunks ) );
		console.log( `${ new Date().toLocaleTimeString() }  ${ file }  ${ ( size / 1024 ).toFixed( 1 ) } KB` );
		res.end( 'ok' );

	} );

} ).listen( port, '127.0.0.1', () => console.log( `collecting into ${ out } on http://127.0.0.1:${ port }/` ) );
