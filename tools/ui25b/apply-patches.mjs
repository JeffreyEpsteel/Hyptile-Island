// Root patches of wave 25B (one UI language). Each patch is an exact anchor (found once) or a start / end span, and its
// replacement.   node tools/ui25b/apply-patches.mjs [rootDir] [--check]
// rootDir defaults to the repo; --check only reports whether every patch finds its anchor exactly once (nothing written).
// Root owns these files (Minimap.js, Game.js ...): run it at integration time. Line ends follow each file (CRLF or LF).
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NL = String.fromCharCode( 10 ), CRLF = String.fromCharCode( 13, 10 );
const lines = ( ...a ) => a.join( NL );

export const PATCHES = [
	// 2.5: the minimap's marker glyphs are the shared set of ui/icons.js (MARKER_ICONS), so the minimap and the world map
	// draw one icon family (ui.css .gm-mk gives both the same dark disc + ring in the kind's colour).
	{ file: 'src/game/Minimap.js', anchor: "import { YARD } from './BoatYard.js';",
		replace: lines( "import { YARD } from './BoatYard.js';", "import { MARKER_ICONS } from '../ui/icons.js';" ) },
	{ file: 'src/game/Minimap.js', start: 'export const ICON = {', end: '};\n\n// an ICON name or an svg string',
		replace: lines( '// (wave 25B) the glyph set lives in ui/icons.js so the minimap and the world map share it', 'export const ICON = { ...MARKER_ICONS };', '', '// an ICON name or an svg string' ) },
	// the wave's test joins npm test
	{ file: 'package.json', anchor: 'node test/feature-ui-w24.mjs', replace: 'node test/feature-ui-w24.mjs && node test/feature-ui-w25.mjs' },
];

const once = ( s, a ) => s.indexOf( a ) >= 0 && s.indexOf( a ) === s.lastIndexOf( a );

export function apply( root, { check = false } = {} ) {

	const files = new Map(), report = [];
	for ( const p0 of PATCHES ) {

		const path = join( root, p0.file );
		if ( ! files.has( path ) ) files.set( path, readFileSync( path, 'utf8' ) );
		const s = files.get( path );
		const eol = s.includes( CRLF ) ? CRLF : NL;
		const fix = ( x ) => ( x === undefined ? x : x.split( NL ).join( eol ) );
		const p = { ...p0, anchor: fix( p0.anchor ), start: fix( p0.start ), end: fix( p0.end ), replace: fix( p0.replace ) };
		const label = ( p.anchor || p.start ).slice( 0, 60 );
		if ( p.anchor !== undefined ) {

			if ( s.includes( p.replace ) ) { report.push( [ p.file, 'already applied' ] ); continue; }
			if ( ! once( s, p.anchor ) ) { report.push( [ p.file, 'ANCHOR NOT FOUND ONCE: ' + label ] ); continue; }
			files.set( path, s.replace( p.anchor, () => p.replace ) );

		} else {

			if ( s.includes( p.replace ) ) { report.push( [ p.file, 'already applied' ] ); continue; }
			const a = s.indexOf( p.start );
			const b = a < 0 ? - 1 : s.indexOf( p.end, a );
			if ( a < 0 || b < 0 || ! once( s, p.start ) ) { report.push( [ p.file, 'SPAN NOT FOUND ONCE: ' + label ] ); continue; }
			files.set( path, s.slice( 0, a ) + p.replace + s.slice( b + p.end.length ) );

		}

		report.push( [ p.file, 'ok' ] );

	}

	if ( ! check ) for ( const [ path, s ] of files ) writeFileSync( path, s );
	return report;

}

if ( process.argv[ 1 ] && resolve( process.argv[ 1 ] ) === fileURLToPath( import.meta.url ) ) {

	const root = resolve( process.argv.slice( 2 ).find( ( a ) => ! a.startsWith( '--' ) ) || join( import.meta.dirname, '..', '..' ) );
	const r = apply( root, { check: process.argv.includes( '--check' ) } );
	for ( const [ f, m ] of r ) console.log( m.padEnd( 16 ), f );
	if ( r.some( ( [ , m ] ) => m.startsWith( 'ANCHOR' ) || m.startsWith( 'SPAN' ) ) ) process.exit( 1 );

}
