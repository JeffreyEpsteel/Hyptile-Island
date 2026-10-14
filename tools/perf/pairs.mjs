// Before / after contact sheet from explicit pairs (wave 19A: the captures of tools/visuals/capture.mjs written to any
// folders): one row per pair, before on the left, after on the right, each at half size, a 4 px gap.
//   node tools/perf/pairs.mjs --out=<sheet.png> <before.png>=<after.png> [...]
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { decodePNG } from '../../src/world/marine/WhaleTextures.js';

const out = ( process.argv.find( ( a ) => a.startsWith( '--out=' ) ) || '--out=pairs.png' ).slice( 6 );
const pairs = process.argv.slice( 2 ).filter( ( a ) => ! a.startsWith( '--' ) ).map( ( a ) => a.split( '=' ) );
const GAP = 4;
const load = async ( f ) => {

	const b = readFileSync( f );
	return decodePNG( b.buffer.slice( b.byteOffset, b.byteOffset + b.byteLength ) );

};
// 2x2 box filter
const half = ( img ) => {

	const w = img.width >> 1, h = img.height >> 1, d = new Uint8Array( w * h * 4 ), s = img.data, sw = img.width * 4;
	for ( let y = 0; y < h; y ++ ) for ( let x = 0; x < w; x ++ ) for ( let c = 0; c < 4; c ++ ) {

		const i = ( y * 2 ) * sw + x * 8 + c;
		d[ ( y * w + x ) * 4 + c ] = ( s[ i ] + s[ i + 4 ] + s[ i + sw ] + s[ i + sw + 4 ] + 2 ) >> 2;

	}

	return { width: w, height: h, data: d };

};

const rows = [];
for ( const [ a, b ] of pairs ) rows.push( [ half( await load( a ) ), half( await load( b ) ) ] );
const cw = Math.max( ...rows.map( ( r ) => r[ 0 ].width ) ), heights = rows.map( ( r ) => Math.max( r[ 0 ].height, r[ 1 ].height ) );
const W = cw * 2 + GAP, H = heights.reduce( ( s, h ) => s + h, 0 ) + ( rows.length - 1 ) * GAP;
const px = new Uint8Array( W * H * 4 ).fill( 255 );
let y0 = 0;
rows.forEach( ( r, ri ) => {

	r.forEach( ( img, ci ) => {

		for ( let y = 0; y < img.height; y ++ ) px.set( img.data.subarray( y * img.width * 4, ( y + 1 ) * img.width * 4 ), ( ( y0 + y ) * W + ci * ( cw + GAP ) ) * 4 );

	} );
	y0 += heights[ ri ] + GAP;

} );

const raw = Buffer.alloc( ( W * 4 + 1 ) * H );
for ( let y = 0; y < H; y ++ ) Buffer.from( px.buffer, y * W * 4, W * 4 ).copy( raw, y * ( W * 4 + 1 ) + 1 );
const crcT = new Int32Array( 256 ).map( ( _, n ) => { let c = n; for ( let k = 0; k < 8; k ++ ) c = c & 1 ? 0xedb88320 ^ ( c >>> 1 ) : c >>> 1; return c; } );
const crc = ( b ) => { let c = - 1; for ( const x of b ) c = crcT[ ( c ^ x ) & 255 ] ^ ( c >>> 8 ); return ( c ^ - 1 ) >>> 0; };
const chunk = ( type, data ) => {

	const o = Buffer.alloc( 12 + data.length );
	o.writeUInt32BE( data.length, 0 );
	o.write( type, 4, 'ascii' );
	data.copy( o, 8 );
	o.writeUInt32BE( crc( o.subarray( 4, 8 + data.length ) ), 8 + data.length );
	return o;

};
const ihdr = Buffer.alloc( 13 );
ihdr.writeUInt32BE( W, 0 );
ihdr.writeUInt32BE( H, 4 );
ihdr[ 8 ] = 8;
ihdr[ 9 ] = 6;
writeFileSync( out, Buffer.concat( [ Buffer.from( [ 137, 80, 78, 71, 13, 10, 26, 10 ] ), chunk( 'IHDR', ihdr ), chunk( 'IDAT', deflateSync( raw, { level: 9 } ) ), chunk( 'IEND', Buffer.alloc( 0 ) ) ] ) );
console.log( `wrote ${ out } (${ W }x${ H }, ${ rows.length } rows)` );
