// Compares two PNGs written by tools/perf/shot.mjs (8-bit RGBA, filter 0): mean absolute difference per channel and
// the share of pixels that differ by more than a threshold. node tools/perf/pngdiff.mjs a.png b.png [threshold = 24]
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

function read( file ) {

	const b = readFileSync( file );
	let o = 8, w = 0, h = 0;
	const idat = [];
	while ( o < b.length ) {

		const len = b.readUInt32BE( o ), type = b.toString( 'ascii', o + 4, o + 8 );
		if ( type === 'IHDR' ) { w = b.readUInt32BE( o + 8 ); h = b.readUInt32BE( o + 12 ); }
		if ( type === 'IDAT' ) idat.push( b.subarray( o + 8, o + 8 + len ) );
		o += 12 + len;

	}

	return { w, h, raw: inflateSync( Buffer.concat( idat ) ) };

}

const a = read( process.argv[ 2 ] ), b = read( process.argv[ 3 ] ), thr = Number( process.argv[ 4 ] ) || 24;
if ( a.w !== b.w || a.h !== b.h ) throw new Error( 'sizes differ' );
let sum = 0, over = 0;
for ( let y = 0; y < a.h; y ++ ) for ( let x = 0; x < a.w; x ++ ) {

	const i = y * ( a.w * 4 + 1 ) + 1 + x * 4;
	let m = 0;
	for ( let c = 0; c < 3; c ++ ) { const d = Math.abs( a.raw[ i + c ] - b.raw[ i + c ] ); sum += d; if ( d > m ) m = d; }
	if ( m > thr ) over ++;

}

console.log( `mean abs diff ${ ( sum / ( a.w * a.h * 3 ) ).toFixed( 3 ) } / 255 · pixels over ${ thr }: ${ ( 100 * over / ( a.w * a.h ) ).toFixed( 3 ) } %` );
