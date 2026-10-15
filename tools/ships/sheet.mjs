// A grid contact sheet of PNGs at half size (tools/ships/capture.mjs shots), row-major, 4 px white gaps, no text.
//   node tools/ships/sheet.mjs --out=<sheet.png> [--cols=3] [--full] <a.png> <b.png> ...
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { decodePNG } from '../../src/world/marine/WhaleTextures.js';

const arg = ( k, d = null ) => {

	const a = process.argv.find( ( x ) => x.startsWith( '--' + k + '=' ) );
	return a ? a.slice( k.length + 3 ) : d;

};
const files = process.argv.slice( 2 ).filter( ( a ) => ! a.startsWith( '--' ) && existsSync( a ) );
const cols = Number( arg( 'cols', '3' ) ), GAP = 4, full = process.argv.includes( '--full' );
const load = async ( f ) => {

	const b = readFileSync( f );
	return decodePNG( b.buffer.slice( b.byteOffset, b.byteOffset + b.byteLength ) );

};
const half = ( img ) => {

	const w = img.width >> 1, h = img.height >> 1, d = new Uint8Array( w * h * 4 ), s = img.data, sw = img.width * 4;
	for ( let y = 0; y < h; y ++ ) for ( let x = 0; x < w; x ++ ) for ( let c = 0; c < 4; c ++ ) {

		const i = ( y * 2 ) * sw + x * 8 + c;
		d[ ( y * w + x ) * 4 + c ] = ( s[ i ] + s[ i + 4 ] + s[ i + sw ] + s[ i + sw + 4 ] + 2 ) >> 2;

	}

	return { width: w, height: h, data: d };

};
const imgs = [];
for ( const f of files ) imgs.push( full ? await load( f ) : half( await load( f ) ) );
if ( ! imgs.length ) { console.log( 'no images' ); process.exit( 1 ); }
const cw = imgs[ 0 ].width, ch = imgs[ 0 ].height, rows = Math.ceil( imgs.length / cols ), nc = Math.min( cols, imgs.length );
const W = cw * nc + GAP * ( nc - 1 ), H = rows * ch + ( rows - 1 ) * GAP;
const px = new Uint8Array( W * H * 4 ).fill( 255 );
imgs.forEach( ( img, i ) => {

	const r = Math.floor( i / cols ), c = i % cols;
	for ( let y = 0; y < Math.min( ch, img.height ); y ++ ) px.set( img.data.subarray( y * img.width * 4, ( y * img.width + Math.min( cw, img.width ) ) * 4 ), ( ( r * ( ch + GAP ) + y ) * W + c * ( cw + GAP ) ) * 4 );

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
writeFileSync( arg( 'out', 'sheet.png' ), Buffer.concat( [ Buffer.from( [ 137, 80, 78, 71, 13, 10, 26, 10 ] ), chunk( 'IHDR', ihdr ), chunk( 'IDAT', deflateSync( raw, { level: 6 } ) ), chunk( 'IEND', Buffer.alloc( 0 ) ) ] ) );
console.log( `${ imgs.length } images -> ${ arg( 'out', 'sheet.png' ) } (${ W }x${ H })` );
