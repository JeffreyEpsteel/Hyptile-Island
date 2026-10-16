// Root patches of wave 27B (load time). Each patch is an exact anchor (found once) and its replacement.
//   node tools/w27b/apply-patches.mjs [rootDir] [--check]
// rootDir defaults to the repo; --check only reports whether every anchor is found exactly once (nothing written).
// Root owns these files: run it (or copy the pairs) at integration time. Line ends follow each file (CRLF or LF).
//
// What they do (0): the new test/feature-dogfight-touch.mjs runs in `npm test`. (1): the pause menu's stats block for the helicopter's stunt board (wave 27B, Leaderboard.js).
// (2): Tidemark's warbird dispersal line (features/dogfight/Site.js, which moved the slots 3 m onto the graded
// shoulder) stood in the tall meadow. townClear( tile, x, z ) is the one gate the grass mask (buildTileGrassMasks) and
// the tree scatter share, so a clear strip along the line there keeps the grass, the palms and the shrubs off the
// aircraft and the dispersal tent.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NL = String.fromCharCode( 10 );
const lines = ( ...a ) => a.join( NL );

export const PATCHES = [
	// the phone's warbird cluster test joins the chain
	{ file: 'package.json', anchor: 'node test/feature-cars-touch.mjs && node test/feature-netsync-w22.mjs', replace: 'node test/feature-cars-touch.mjs && node test/feature-dogfight-touch.mjs && node test/feature-netsync-w22.mjs' },
	// the pause menu's stats: a feature with a pauseStats() (the helicopter's stunt board, features/helicopter/Leaderboard.js)
	// adds a small block under the sub line: its rank title, the best combo and the best of each trick flown
	{ file: 'src/ui/PauseMenu.js', anchor: '.pm-sub b { color: var(--tw-aqua); font-weight: 600; }',
	replace: lines(
		'.pm-sub b { color: var(--tw-aqua); font-weight: 600; }',
		'/* (wave 27B) the stunt board under the sub line */',
		'.pm-stats { margin: 0 0 var(--tw-3); padding: var(--tw-2) var(--tw-3); border-radius: var(--tw-r-md, 10px); background: rgba(0, 0, 0, 0.18); font-size: var(--tw-fs-sm); color: var(--tw-ink-3); }',
		'.pm-stats-h { display: flex; justify-content: space-between; gap: 12px; color: var(--tw-ink-2); font-weight: 600; }',
		'.pm-stats-h b { color: var(--tw-aqua); font-weight: 600; }',
		'.pm-stats-g { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 14px; margin-top: 4px; }',
		'.pm-stats-g div { display: flex; justify-content: space-between; gap: 8px; }',
		'.pm-stats-g b { color: var(--tw-ink-2); font-weight: 600; }' ) },
	{ file: 'src/ui/PauseMenu.js', anchor: '<div class="pm-sub">${ sub }</div>',
	replace: lines( '<div class="pm-sub">${ sub }</div>', '\t\t\t\t${ statsBlock( app ) }' ) },
	{ file: 'src/ui/PauseMenu.js', anchor: 'function esc( s ) {',
	replace: lines(
		'// wave 27B: the stats a feature offers (app.features.get( \'helicopter\' ).pauseStats(): its stunt board) as a small block; none until there is one',
		'function statsBlock( app ) {',
		'',
		'\tlet s = null;',
		'\ttry { const h = app.features && app.features.get && app.features.get( \'helicopter\' ); s = h && h.pauseStats ? h.pauseStats() : null; } catch ( e ) { s = null; }',
		'\tif ( ! s ) return \'\';',
		'\tconst n = ( v ) => Number( v ).toLocaleString( \'en-US\' );',
		'\tconst rows = s.tricks.map( ( r ) => `<div><span>${ esc( r.label ) }</span><b>${ n( r.points ) }</b></div>` ).join( \'\' );',
		'\treturn `<div class="pm-stats"><div class="pm-stats-h"><span>${ esc( t( \'pause.stunts\', \'Helicopter stunts\' ) ) }</span><b>${ esc( s.rank ) }</b></div>',
		'\t\t<div class="pm-stats-g"><div><span>${ esc( t( \'pause.stunts.best\', \'Best combo\' ) ) }</span><b>${ n( s.best ) }</b></div>${ rows }</div></div>`;',
		'',
		'}',
		'',
		'function esc( s ) {' ) },
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
