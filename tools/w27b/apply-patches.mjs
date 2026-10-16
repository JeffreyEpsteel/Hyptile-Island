// Root patches of wave 27B (load time). Each patch is an exact anchor (found once) and its replacement.
//   node tools/w27b/apply-patches.mjs [rootDir] [--check]
// rootDir defaults to the repo; --check only reports whether every anchor is found exactly once (nothing written).
// Root owns these files: run it (or copy the pairs) at integration time. Line ends follow each file (CRLF or LF).
//
// What they do: Tidemark's warbird dispersal line (features/dogfight/Site.js, which moved the slots 3 m onto the graded
// shoulder) stood in the tall meadow. townClear( tile, x, z ) is the one gate the grass mask (buildTileGrassMasks) and
// the tree scatter share, so a clear strip along the line there keeps the grass, the palms and the shrubs off the
// aircraft and the dispersal tent.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NL = String.fromCharCode( 10 );
const lines = ( ...a ) => a.join( NL );

export const PATCHES = [
	{ file: 'src/world/islands/town/Vegetation.js', anchor: lines(
		'	for ( const R of STRIP ) if ( rectOut( u, v, R[ 0 ], R[ 1 ], R[ 2 ], R[ 3 ] ) < ( trees ? 10 : 1.5 ) ) return false;' ),
	replace: lines(
		'	for ( const R of STRIP ) if ( rectOut( u, v, R[ 0 ], R[ 1 ], R[ 2 ], R[ 3 ] ) < ( trees ? 10 : 1.5 ) ) return false;',
		'	// the warbirds\' dispersal line and its tent (dogfight/Site.js, wave 27B): the airframes\' strip beside the shoulder',
		'	if ( rectOut( u, v, LINE_CLEAR[ 0 ], LINE_CLEAR[ 1 ], LINE_CLEAR[ 2 ], LINE_CLEAR[ 3 ] ) < ( trees ? 3 : 0.5 ) ) return false;' ) },
	{ file: 'src/world/islands/town/Vegetation.js', anchor: 'const STRIP = airstripRects();',
	replace: lines(
		'const STRIP = airstripRects();',
		'// [ u0, u1, v0, v1 ]: along the runway from the desk (along -162) past the last stand (+20), out 8 m from the graded edge',
		'const LINE_CLEAR = [ I.airstrip.u - 176, I.airstrip.u + 40, I.airstrip.v - I.airstrip.width / 2 - 6 - 12, I.airstrip.v - I.airstrip.width / 2 - 6 ];' ) },
];

const dir = resolve( process.argv.find( ( a, i ) => i > 1 && ! a.startsWith( '--' ) ) ?? join( fileURLToPath( import.meta.url ), '..', '..', '..' ) );
const check = process.argv.includes( '--check' );
const count = ( s, a ) => s.split( a ).length - 1;
const files = new Map();
let ok = true;
for ( const p of PATCHES ) {

	const path = join( dir, p.file );
	let text = files.get( path ) ?? readFileSync( path, 'utf8' );
	const crlf = text.includes( '\r\n' );
	if ( crlf ) text = text.split( '\r\n' ).join( NL );
	if ( text.includes( p.replace ) ) { console.log( 'already applied: ' + p.file ); files.set( path, crlf ? text.split( NL ).join( '\r\n' ) : text ); continue; }
	const n = count( text, p.anchor );
	if ( n !== 1 ) { console.error( `anchor found ${ n } times in ${ p.file }: ${ p.anchor.slice( 0, 60 ) }` ); ok = false; continue; }
	text = text.replace( p.anchor, () => p.replace );
	files.set( path, crlf ? text.split( NL ).join( '\r\n' ) : text );

}

if ( ! ok ) process.exit( 1 );
if ( check ) { console.log( 'all anchors found' ); process.exit( 0 ); }
for ( const [ path, text ] of files ) writeFileSync( path, text );
console.log( 'patched ' + files.size + ' file(s)' );
