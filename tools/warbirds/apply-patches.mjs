// Root patches for the dogfight feature (wave 26A). Each patch is an exact anchor (found once) and its replacement; a
// patch already applied is skipped (its marker text is present).
//   node tools/warbirds/apply-patches.mjs [rootDir] [--check]
// rootDir defaults to the repo; --check only reports whether every anchor is found exactly once (nothing written).
// Root owns these files: run it at integration time. Line ends follow each file (CRLF or LF).
//   install.js   the feature (after the helicopter: it reads seaplane's Chute, vfx, worldmap, death lazily)
//   NetSync.js   the state's df (the aircraft) / dc (a crew member aboard another's) / chute: first among the extras, so
//                the eight-extras cap (Protocol MAX_EXTRA) never drops the combat state
//   package.json npm test runs test/feature-dogfight.mjs
//   Features.js  the event vocabulary
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NL = String.fromCharCode( 10 ), CRLF = String.fromCharCode( 13, 10 );
const lines = ( ...a ) => a.join( NL );

export const PATCHES = [
	{ file: 'src/features/install.js', marker: "import * as dogfight from './dogfight/index.js';", anchor: "import * as helicopter from './helicopter/index.js';",
		replace: lines( "import * as helicopter from './helicopter/index.js';", "import * as dogfight from './dogfight/index.js';" ) },
	{ file: 'src/features/install.js', marker: "[ 'dogfight', dogfight ]", anchor: "\t[ 'helicopter', helicopter ], // coastal rescue rotorcraft and landable city roofs",
		replace: lines( "\t[ 'helicopter', helicopter ], // coastal rescue rotorcraft and landable city roofs",
			"\t[ 'dogfight', dogfight ], // wave 26A: warbirds (three fighters, three crewed aircraft) at the airstrips' dispersals; armed players fight" ) },
	{ file: 'src/features/netsync/NetSync.js', marker: "get?.( 'dogfight' )?.decorateState", anchor: "\t\t// other features' per-player fields (the seaplane's out.plane...) ride along: the server passes them through",
		replace: lines( "\t\t// wave 26A: the warbird's state first (df / dc / chute), so the extras' cap never drops the combat state",
			"\t\ttry { this.features?.get?.( 'dogfight' )?.decorateState?.( s ); } catch ( e ) { /* optional */ }",
			"\t\t// other features' per-player fields (the seaplane's out.plane...) ride along: the server passes them through" ) },
	{ file: 'package.json', marker: 'node test/feature-dogfight.mjs', anchor: '"test": "node test/', replace: '"test": "node test/feature-dogfight.mjs && node test/' },
	{ file: 'src/features/Features.js', marker: 'warbirdBought', anchor: '//   rightingSlipped { heel, letGo }; world events capsize / capsizeHelp   (death, wave 22B) breathLow { left } breathOut',
		replace: lines( '//   rightingSlipped { heel, letGo }; world events capsize / capsizeHelp   (death, wave 22B) breathLow { left } breathOut',
			'//   (dogfight, wave 26A) warbirdBought { airframe, price } warbirdTookOff / warbirdLanded { airframe } warbirdLost { airframe, how }',
			'//   airKill { victim, by, crew, airframe } gunsArmed { armed } crewBoarded { airframe, seat, owner }; playerDied { cause: \'dogfight\' };',
			'//   world events dfHit (a claim, to the host) dfDmg (the host\'s verdict) dfKill dfSeat dfCrew dfBomb' ) },
];

const once = ( s, a ) => s.indexOf( a ) >= 0 && s.indexOf( a ) === s.lastIndexOf( a );

export function apply( root, { check = false } = {} ) {

	const files = new Map(), report = [];
	for ( const p of PATCHES ) {

		const path = join( root, p.file );
		if ( ! files.has( path ) ) files.set( path, readFileSync( path, 'utf8' ) );
		let s = files.get( path );
		const crlf = s.includes( CRLF );
		const norm = crlf ? s.split( CRLF ).join( NL ) : s;
		if ( norm.includes( p.marker ) ) {

			report.push( `applied already: ${ p.file } (${ p.marker.slice( 0, 50 ) })` );
			continue;

		}

		if ( ! once( norm, p.anchor ) ) {

			report.push( `ANCHOR NOT FOUND ONCE: ${ p.file }: ${ p.anchor.slice( 0, 80 ) }` );
			continue;

		}

		const out = norm.replace( p.anchor, p.replace );
		files.set( path, crlf ? out.split( NL ).join( CRLF ) : out );
		report.push( `${ check ? 'would patch' : 'patched' }: ${ p.file } (${ p.marker.slice( 0, 50 ) })` );

	}

	if ( ! check ) for ( const [ path, s ] of files ) writeFileSync( path, s );
	return report;

}

if ( process.argv[ 1 ] && resolve( process.argv[ 1 ] ) === fileURLToPath( import.meta.url ) ) {

	const args = process.argv.slice( 2 );
	const root = resolve( args.find( ( a ) => ! a.startsWith( '--' ) ) || join( fileURLToPath( new URL( '../..', import.meta.url ) ) ) );
	const report = apply( root, { check: args.includes( '--check' ) } );
	for ( const r of report ) console.log( r );
	if ( report.some( ( r ) => r.startsWith( 'ANCHOR' ) ) ) process.exit( 1 );

}
