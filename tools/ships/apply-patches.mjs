// Wave 24C patches to files 24C does not own (root, 24B): exact anchors, each applied once; --check reports without writing.
//   node tools/ships/apply-patches.mjs [--check] [--root=<dir>]
// 1. src/world/boat/ShipBoatModel.js (24B): the player's ship gets the ship materials (wind in the sails, waving flags, wet
//    waterline) like the AI ships; the brigantine is mirrored.
// 2. test/feature-ships.mjs (24B): the hull's length / beam measured on the hull shell (HullPlank / SheerStripe / HullTar meshes):
//    the rebuilt ships carry a bowsprit, booms and braced yards past the hull.
// 3. test/feature-naval.mjs (24B): the same for the asset check; the render section's PNG decoder hands JPEG maps a grey 2 x 2
//    (the rebuilt GLBs embed JPEG).
// 4. package.json (root): test/feature-ship-looks.mjs in npm test.
// 5. CREDITS.md (root): the ships' credit line.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const arg = ( k, d = null ) => {

	const a = process.argv.find( ( x ) => x.startsWith( '--' + k + '=' ) );
	return a ? a.slice( k.length + 3 ) : d;

};
const ROOT = resolve( arg( 'root', join( import.meta.dirname, '..', '..' ) ) );
const CHECK = process.argv.includes( '--check' );

const PATCHES = [
	{
		file: 'src/world/boat/ShipBoatModel.js',
		done: 'shipMaterials( glb',
		edits: [
			[ `import { helmStandFor } from '../BoatModel.js';`, `import { helmStandFor } from '../BoatModel.js';
import { shipMaterials } from '../../features/naval/ShipLooks.js';` ],
			[ `		if ( this.spec.mirror ) mirrorHull( glb );
		centreOnHull( glb );`, `		if ( this.spec.mirror ) mirrorHull( glb );
		centreOnHull( glb );
		shipMaterials( glb, { mirrored: !! this.spec.mirror } ); // (wave 24C: wind in the sails, waving flags, the wet waterline)` ],
		],
	},
	{
		file: 'test/feature-ships.mjs',
		done: 'hull shell (wave 24C)',
		edits: [
			[ `	let lo = Infinity, hi = - Infinity, top = - Infinity, bot = Infinity, wide = 0;
	for ( const m of Object.values( model.meshes ) ) {

		m.geometry.computeBoundingBox();
		const bb = m.geometry.boundingBox;
		lo = Math.min( lo, bb.min.x ); hi = Math.max( hi, bb.max.x ); top = Math.max( top, bb.max.y ); bot = Math.min( bot, bb.min.y );
		wide = Math.max( wide, bb.max.z, - bb.min.z );

	}`, `	let lo = Infinity, hi = - Infinity, top = - Infinity, bot = Infinity, wide = 0;
	for ( const [ name, m ] of Object.entries( model.meshes ) ) {

		m.geometry.computeBoundingBox();
		const bb = m.geometry.boundingBox;
		top = Math.max( top, bb.max.y ); bot = Math.min( bot, bb.min.y );
		// length and beam: the hull shell (wave 24C: the bowsprit, the booms and the braced yards reach past it)
		if ( ! /HullPlank|SheerStripe|HullTar/.test( name ) ) continue;
		lo = Math.min( lo, bb.min.x ); hi = Math.max( hi, bb.max.x );
		wide = Math.max( wide, bb.max.z, - bb.min.z );

	}` ],
		],
	},
	{
		file: 'test/feature-naval.mjs',
		done: 'hl[ 0 ]',
		edits: [
			[ `		let mn = [ 1e9, 1e9, 1e9 ], mx = [ - 1e9, - 1e9, - 1e9 ];
		let lantern = null;`, `		let mn = [ 1e9, 1e9, 1e9 ], mx = [ - 1e9, - 1e9, - 1e9 ];
		const hl = [ 1e9, - 1e9 ]; // the hull shell's X extent (wave 24C: spars reach past it)
		let lantern = null;` ],
			[ `					for ( let c = 0; c < 3; c ++ ) { mn[ c ] = Math.min( mn[ c ], P[ i + c ] ); mx[ c ] = Math.max( mx[ c ], P[ i + c ] ); }
					cx += P[ i ]; cn ++;`, `					for ( let c = 0; c < 3; c ++ ) { mn[ c ] = Math.min( mn[ c ], P[ i + c ] ); mx[ c ] = Math.max( mx[ c ], P[ i + c ] ); }
					if ( /HullPlank|SheerStripe|HullTar/.test( g.materials[ p.material ].name ) ) { hl[ 0 ] = Math.min( hl[ 0 ], P[ i ] ); hl[ 1 ] = Math.max( hl[ 1 ], P[ i ] ); }
					cx += P[ i ]; cn ++;` ],
			[ "		ok( near( mx[ 0 ] - mn[ 0 ], cls.length, 0.7 ), `${ k }: hull length ${ ( mx[ 0 ] - mn[ 0 ] ).toFixed( 2 ) } m matches the class (${ cls.length })` );",
				"		ok( near( hl[ 1 ] - hl[ 0 ], cls.length, 0.7 ), `${ k }: hull length ${ ( hl[ 1 ] - hl[ 0 ] ).toFixed( 2 ) } m matches the class (${ cls.length })` );" ],
			[ `		const b = Buffer.from( bytes );
		const w = b.readUInt32BE( 16 ), h = b.readUInt32BE( 20 ), bpp = b[ 25 ] === 6 ? 4 : 3;`, `		const b = Buffer.from( bytes );
		if ( b[ 0 ] !== 0x89 ) return { data: new Uint8Array( [ 150, 140, 125, 255, 150, 140, 125, 255, 150, 140, 125, 255, 150, 140, 125, 255 ] ), width: 2, height: 2 }; // (JPEG maps: grey)
		const w = b.readUInt32BE( 16 ), h = b.readUInt32BE( 20 ), bpp = b[ 25 ] === 6 ? 4 : 3;` ],
		],
	},
	{
		file: 'package.json',
		done: 'feature-ship-looks.mjs',
		edits: [ [ 'node test/feature-navy.mjs &&', 'node test/feature-navy.mjs && node test/feature-ship-looks.mjs &&' ] ],
	},
	{
		file: 'CREDITS.md',
		done: 'tools/ships/build_ships.py',
		edits: [ [ 'ship classes (`public/models/ships`), ', '' ], [ "| Navy frigate and revenue cutter (`public/models/navy`) | procedural, `tools/navy/build_navy_ships.py` (reusing the brigantine's textures) | this repository's MIT license |",
			"| Ships: the merchant trawler, the Black Flag sloop, the brigantine (`public/models/ships`), the navy frigate and revenue cutter (`public/models/navy`), each with two LOD files | procedural, `tools/ships/build_ships.py` (Blender headless) with procedural textures (`tools/ships/textures.py`, numpy), no scans or downloads | this repository's MIT license |" ] ],
	},
];

let bad = 0;
for ( const p of PATCHES ) {

	const path = join( ROOT, p.file );
	let src;
	try { src = readFileSync( path, 'utf8' ); } catch ( e ) { console.log( `MISSING ${ p.file }` ); bad ++; continue; }
	const crlf = src.includes( '\r\n' );
	let s = src.replace( /\r\n/g, '\n' );
	if ( s.includes( p.done ) ) { console.log( `already ${ p.file }` ); continue; }
	let ok = true;
	for ( const [ a ] of p.edits ) if ( s.split( a ).length !== 2 ) { console.log( `ANCHOR ${ p.file }: ${ s.split( a ).length - 1 } matches of ${ JSON.stringify( a.slice( 0, 70 ) ) }` ); ok = false; }
	if ( ! ok ) { bad ++; continue; }
	for ( const [ a, b ] of p.edits ) s = s.replace( a, () => b );
	if ( ! CHECK ) writeFileSync( path, crlf ? s.replace( /\n/g, '\r\n' ) : s );
	console.log( `${ CHECK ? 'would patch' : 'patched' } ${ p.file } (${ p.edits.length } edits)` );

}

process.exit( bad ? 1 : 0 );
