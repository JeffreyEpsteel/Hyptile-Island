// Reads the canvas texture of the headless App (tools/perf/headless-env.mjs) back into a PNG: a look at what a perf run
// drew (culls and packing must not change the picture). Used by headless.mjs --shot=<file.png>.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

export async function canvasPNG( GPU, file ) {

	const tex = GPU.context.getCurrentTexture();
	const w = tex.width, h = tex.height, bpr = Math.ceil( w * 4 / 256 ) * 256;
	const buf = GPU.device.createBuffer( { size: bpr * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ } );
	const enc = GPU.device.createCommandEncoder();
	enc.copyTextureToBuffer( { texture: tex }, { buffer: buf, bytesPerRow: bpr }, [ w, h ] );
	GPU.queue.submit( [ enc.finish() ] );
	await buf.mapAsync( GPUMapMode.READ );
	const src = new Uint8Array( buf.getMappedRange().slice( 0 ) );
	buf.unmap();
	const bgra = String( GPU.format ).startsWith( 'bgra' );
	const raw = Buffer.alloc( ( w * 4 + 1 ) * h );
	for ( let y = 0; y < h; y ++ ) {

		raw[ y * ( w * 4 + 1 ) ] = 0;
		for ( let x = 0; x < w; x ++ ) {

			const s = y * bpr + x * 4, d = y * ( w * 4 + 1 ) + 1 + x * 4;
			raw[ d ] = src[ s + ( bgra ? 2 : 0 ) ];
			raw[ d + 1 ] = src[ s + 1 ];
			raw[ d + 2 ] = src[ s + ( bgra ? 0 : 2 ) ];
			raw[ d + 3 ] = 255;

		}

	}

	const crcT = new Int32Array( 256 ).map( ( _, n ) => {

		let c = n;
		for ( let k = 0; k < 8; k ++ ) c = c & 1 ? 0xedb88320 ^ ( c >>> 1 ) : c >>> 1;
		return c;

	} );
	const crc = ( b ) => {

		let c = - 1;
		for ( const x of b ) c = crcT[ ( c ^ x ) & 255 ] ^ ( c >>> 8 );
		return ( c ^ - 1 ) >>> 0;

	};
	const chunk = ( type, data ) => {

		const out = Buffer.alloc( 12 + data.length );
		out.writeUInt32BE( data.length, 0 );
		out.write( type, 4, 'ascii' );
		data.copy( out, 8 );
		out.writeUInt32BE( crc( out.subarray( 4, 8 + data.length ) ), 8 + data.length );
		return out;

	};
	const ihdr = Buffer.alloc( 13 );
	ihdr.writeUInt32BE( w, 0 );
	ihdr.writeUInt32BE( h, 4 );
	ihdr[ 8 ] = 8;
	ihdr[ 9 ] = 6;
	writeFileSync( file, Buffer.concat( [ Buffer.from( [ 137, 80, 78, 71, 13, 10, 26, 10 ] ), chunk( 'IHDR', ihdr ), chunk( 'IDAT', deflateSync( raw ) ), chunk( 'IEND', Buffer.alloc( 0 ) ) ] ) );

}
