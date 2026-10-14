// Root patches for the cars feature (wave 21B). Each patch is an exact anchor (found once) and its replacement.
//   node tools/cars/apply-patches.mjs [rootDir] [--check]
// rootDir defaults to the repo; --check only reports whether every anchor is found exactly once (nothing written).
// Root owns these files: run it (or copy the pairs) at integration time. Line ends follow each file (CRLF or LF).
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NL = String.fromCharCode( 10 ), CRLF = String.fromCharCode( 13, 10 );
const lines = ( ...a ) => a.join( NL );

export const PATCHES = [
	// the feature: after navy (it reads destruction, townlife, vfx, navy, pirates, citywreck lazily)
	{ file: 'src/features/install.js', anchor: "import * as interiors from '../world/interiors/index.js';",
		replace: lines( "import * as interiors from '../world/interiors/index.js';", "import * as cars from './cars/index.js';" ) },
	{ file: 'src/features/install.js', anchor: "\t[ 'navy', navy ], // wave 19B: Tidemark's frigate and cutters, hails, navy bounties and standing, sea events",
		replace: lines( "\t[ 'navy', navy ], // wave 19B: Tidemark's frigate and cutters, hails, navy bounties and standing, sea events", "\t[ 'cars', cars ], // wave 21B: Meridian's traffic, parked cars, police; every car drivable (E at a door)" ) },
	// no avatar drawn inside a car (the islanders do not fit the cabins)
	{ file: 'src/App.js', anchor: "this.avatar.visible = this.freeCam || ( p.mode === 'boat' ? p.camMode === 'third' : p.view === 'third' );",
		replace: "this.avatar.visible = this.freeCam || ( ! this.features?.get?.( 'cars' )?.hidesDriver?.() && ( p.mode === 'boat' ? p.camMode === 'third' : p.view === 'third' ) );" },
	// L in a car: the headlamps (automatic -> on / off -> automatic)
	{ file: 'src/App.js', anchor: "if ( this.player && this.player.mode === 'boat' ) this.toggleBoatLights();",
		replace: lines( "if ( this.player && this.player.mode === 'boat' ) this.toggleBoatLights();",
			"\t\t\telse if ( this.features?.get?.( 'cars' )?.driving ) {", "",
			"\t\t\t\tconst on = this.features.get( 'cars' ).toggleLights();",
			"\t\t\t\tif ( this.ui ) this.ui.ui.toast( on === null ? 'Headlights: automatic' : on ? 'Headlights on' : 'Headlights off' );", "",
			"\t\t\t}" ) },
	// H is the horn while driving, not the settings panel
	{ file: 'src/ui/UI.js', anchor: "\t\tif ( e.code === 'KeyH' ) {", replace: "\t\tif ( e.code === 'KeyH' && ! globalThis.__hyptileDriving ) {" },
	// netsync (20E): the driven car rides in the player state like the seaplane's
	{ file: 'src/features/netsync/NetSync.js', anchor: "\t\ttry { this.planes.decorate( s ); } catch ( e ) { /* optional */ }",
		replace: lines( "\t\ttry { this.planes.decorate( s ); } catch ( e ) { /* optional */ }", "\t\ttry { this.features?.get?.( 'cars' )?.decorateState?.( s ); } catch ( e ) { /* optional */ }" ) },
];

const once = ( s, a ) => s.indexOf( a ) >= 0 && s.indexOf( a ) === s.lastIndexOf( a );

export function apply( root, { check = false } = {} ) {

	const files = new Map(), report = [];
	for ( const p0 of PATCHES ) {

		const path = join( root, p0.file );
		if ( ! files.has( path ) ) files.set( path, readFileSync( path, 'utf8' ) );
		const s = files.get( path );
		const eol = s.includes( CRLF ) ? CRLF : NL;
		const p = { ...p0, anchor: p0.anchor.split( NL ).join( eol ), replace: p0.replace.split( NL ).join( eol ) };
		if ( s.includes( p.replace ) ) { report.push( [ p.file, 'already applied' ] ); continue; }
		if ( ! once( s, p.anchor ) ) { report.push( [ p.file, 'ANCHOR NOT FOUND ONCE: ' + p.anchor.slice( 0, 60 ) ] ); continue; }
		files.set( path, s.replace( p.anchor, () => p.replace ) );
		report.push( [ p.file, 'ok' ] );

	}

	if ( ! check ) for ( const [ path, s ] of files ) writeFileSync( path, s );
	return report;

}

if ( process.argv[ 1 ] && resolve( process.argv[ 1 ] ) === fileURLToPath( import.meta.url ) ) {

	const root = resolve( process.argv.slice( 2 ).find( ( a ) => ! a.startsWith( '--' ) ) || join( import.meta.dirname, '..', '..' ) );
	const r = apply( root, { check: process.argv.includes( '--check' ) } );
	for ( const [ f, m ] of r ) console.log( m.padEnd( 16 ), f );
	process.exit( r.some( ( x ) => x[ 1 ].startsWith( 'ANCHOR' ) ) ? 1 : 0 );

}
