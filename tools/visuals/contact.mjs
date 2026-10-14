// Side by side contact sheet of the before / after captures (capture.mjs): one row per view, before on the left,
// after on the right, each frame at half size, a 4 px gap. No text (the row order is printed and in docs/VISUALS.md).
//   node tools/visuals/contact.mjs [--profile=medium] [--out=tools/visuals/out/compare.png] [--views=homeNoon,...]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';
import { decodePNG } from '../../src/world/marine/WhaleTextures.js';

const arg = ( k, d = null ) => {

	const a = process.argv.find( ( x ) => x.startsWith( '--' + k + '=' ) );
	return a ? a.slice( k.length + 3 ) : d;

};
const dir = join( import.meta.dirname, 'out' );
const profile = arg( 'profile', 'medium' );
const views = ( arg( 'views' ) || 'homeNoon,homeGolden,homeNight,homeOverview,tidemarkNoon,tidemarkNight,blackwaterDusk,underwater,storm' ).split( ',' );
const out = arg( 'out', join( dir, profile === 'medium' ? 'compare.png' : `compare-${ profile }.png` ) );
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
for ( const v of views ) {

	const a = join( dir, 'before', `${ profile }-${ v }.png` ), b = join( dir, 'after', `${ profile }-${ v }.png` );
	if ( ! existsSync( a ) || ! existsSync( b ) ) { console.log( 'missing ' + v ); continue; }
	rows.push( [ half( await load( a ) ), half( await load( b ) ) ] );
	console.log( `row ${ rows.length }: ${ v }` );

}

const cw = rows[ 0 ][ 0 ].width, ch = rows[ 0 ][ 0 ].height;
const W = cw * 2 + GAP, H = rows.length * ch + ( rows.length - 1 ) * GAP;
const px = new Uint8Array( W * H * 4 ).fill( 255 );
rows.forEach( ( r, ri ) => r.forEach( ( img, ci ) => {

	for ( let y = 0; y < Math.min( ch, img.height ); y ++ ) px.set( img.data.subarray( y * img.width * 4, ( y * img.width + Math.min( cw, img.width ) ) * 4 ), ( ( ri * ( ch + GAP ) + y ) * W + ci * ( cw + GAP ) ) * 4 );

} ) );

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
console.log( `wrote ${ out } (${ W }x${ H })` );
