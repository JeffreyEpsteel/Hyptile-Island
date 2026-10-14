// Wave 18F: a close look at a region of the captures, side by side (nearest-neighbour zoom, a 4 px gap): shadow edges,
// the water around a hull, a lamp on the sea.
//   node tools/visuals/crop.mjs --rect=x,y,w,h [--zoom=2] --out=<file.png> <a.png> [b.png ...]
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { decodePNG } from '../../src/world/marine/WhaleTextures.js';

const arg = ( k, d = null ) => {

	const a = process.argv.find( ( x ) => x.startsWith( '--' + k + '=' ) );
	return a ? a.slice( k.length + 3 ) : d;

};
const [ rx, ry, rw, rh ] = arg( 'rect', '0,0,320,180' ).split( ',' ).map( Number );
const Z = Number( arg( 'zoom', '2' ) );
const files = process.argv.slice( 2 ).filter( ( a ) => ! a.startsWith( '--' ) );
const GAP = 4;
const W = files.length * rw * Z + ( files.length - 1 ) * GAP, H = rh * Z;
const px = new Uint8Array( W * H * 4 ).fill( 255 );
for ( let k = 0; k < files.length; k ++ ) {

	const b = readFileSync( files[ k ] );
	const img = await decodePNG( b.buffer.slice( b.byteOffset, b.byteOffset + b.byteLength ) );
	for ( let y = 0; y < H; y ++ ) for ( let x = 0; x < rw * Z; x ++ ) {

		const sx = Math.min( img.width - 1, rx + ( x / Z | 0 ) ), sy = Math.min( img.height - 1, ry + ( y / Z | 0 ) );
		const s = ( sy * img.width + sx ) * 4, d = ( y * W + k * ( rw * Z + GAP ) + x ) * 4;
		px[ d ] = img.data[ s ]; px[ d + 1 ] = img.data[ s + 1 ]; px[ d + 2 ] = img.data[ s + 2 ]; px[ d + 3 ] = 255;

	}

}

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
const out = arg( 'out', 'crop.png' );
writeFileSync( out, Buffer.concat( [ Buffer.from( [ 137, 80, 78, 71, 13, 10, 26, 10 ] ), chunk( 'IHDR', ihdr ), chunk( 'IDAT', deflateSync( raw ) ), chunk( 'IEND', Buffer.alloc( 0 ) ) ] ) );
console.log( `wrote ${ out } (${ W }x${ H })` );
