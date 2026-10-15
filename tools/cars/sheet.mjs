// A contact sheet of captures (wave 24A): PNGs in a grid, each scaled by 1/n, for reading many shots at once.
//   node tools/cars/sheet.mjs --out=<file.png> [--cols=2] [--scale=2] <png> <png> ...
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { decodePNG } from '../../src/world/marine/WhaleTextures.js';

const arg = ( k, d = null ) => { const a = process.argv.find( ( x ) => x.startsWith( '--' + k + '=' ) ); return a ? a.slice( k.length + 3 ) : d; };
const files = process.argv.slice( 2 ).filter( ( a ) => ! a.startsWith( '--' ) );
const cols = Number( arg( 'cols', '2' ) ), k = Number( arg( 'scale', '2' ) ), GAP = 4;
const imgs = await Promise.all( files.map( ( f ) => { const b = readFileSync( f ); return decodePNG( b.buffer.slice( b.byteOffset, b.byteOffset + b.byteLength ) ); } ) );
const cw = Math.max( ...imgs.map( ( i ) => Math.floor( i.width / k ) ) ), ch = Math.max( ...imgs.map( ( i ) => Math.floor( i.height / k ) ) );
const rows = Math.ceil( imgs.length / cols ), W = cols * cw + ( cols - 1 ) * GAP, H = rows * ch + ( rows - 1 ) * GAP;
const out = new Uint8Array( W * H * 4 ).fill( 255 );
imgs.forEach( ( im, n ) => {

	const ox = ( n % cols ) * ( cw + GAP ), oy = Math.floor( n / cols ) * ( ch + GAP ), c = im.data.length / ( im.width * im.height );
	for ( let y = 0; y < Math.floor( im.height / k ); y ++ ) for ( let x = 0; x < Math.floor( im.width / k ); x ++ ) {

		const acc = [ 0, 0, 0 ];
		for ( let j = 0; j < k; j ++ ) for ( let i = 0; i < k; i ++ ) { const s = ( ( y * k + j ) * im.width + x * k + i ) * c; acc[ 0 ] += im.data[ s ]; acc[ 1 ] += im.data[ s + 1 ]; acc[ 2 ] += im.data[ s + 2 ]; }
		const d = ( ( oy + y ) * W + ox + x ) * 4;
		out[ d ] = acc[ 0 ] / ( k * k ); out[ d + 1 ] = acc[ 1 ] / ( k * k ); out[ d + 2 ] = acc[ 2 ] / ( k * k ); out[ d + 3 ] = 255;

	}

} );
const raw = Buffer.alloc( ( W * 4 + 1 ) * H );
for ( let y = 0; y < H; y ++ ) { raw[ y * ( W * 4 + 1 ) ] = 0; Buffer.from( out.buffer, y * W * 4, W * 4 ).copy( raw, y * ( W * 4 + 1 ) + 1 ); }
const crcT = new Int32Array( 256 ).map( ( _, n ) => { let c = n; for ( let i = 0; i < 8; i ++ ) c = c & 1 ? 0xedb88320 ^ ( c >>> 1 ) : c >>> 1; return c; } );
const crc = ( b ) => { let c = - 1; for ( const x of b ) c = crcT[ ( c ^ x ) & 255 ] ^ ( c >>> 8 ); return ( c ^ - 1 ) >>> 0; };
const chunk = ( t, d ) => { const l = Buffer.alloc( 4 ); l.writeUInt32BE( d.length ); const td = Buffer.concat( [ Buffer.from( t ), d ] ); const c = Buffer.alloc( 4 ); c.writeUInt32BE( crc( td ) ); return Buffer.concat( [ l, td, c ] ); };
const ihdr = Buffer.alloc( 13 ); ihdr.writeUInt32BE( W, 0 ); ihdr.writeUInt32BE( H, 4 ); ihdr[ 8 ] = 8; ihdr[ 9 ] = 6;
writeFileSync( arg( 'out', 'sheet.png' ), Buffer.concat( [ Buffer.from( [ 137, 80, 78, 71, 13, 10, 26, 10 ] ), chunk( 'IHDR', ihdr ), chunk( 'IDAT', deflateSync( raw ) ), chunk( 'IEND', Buffer.alloc( 0 ) ) ] ) );
console.log( 'sheet', W + 'x' + H, files.length, 'images' );
