// Root / other-owner patches for wave 24B (ship and boat collisions). Each patch is an exact anchor (found once) and its
// replacement.
//   node tools/collisions/apply-patches.mjs [rootDir] [--check]
// rootDir defaults to the repo; --check only reports whether every anchor is found exactly once (nothing written).
// Line ends follow each file (CRLF or LF).
//   1. src/features/netsync/HullLink.js (the remote boats, host authority unchanged): the remote and local boats carry their
//      outlines (the ships already do: Naval._shipBody), and the host's pair test and everybody's prediction use
//      Collisions.hullPair (the outlines when both hulls have one, the boxes otherwise) - a remote player's boat then stops
//      at a ship's drawn side exactly as the host's own boat does.
//   2. src/features/Features.js: the new event hullStruck in the vocabulary.
//   3. package.json: test/feature-collisions-w24.mjs in npm test.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NL = String.fromCharCode( 10 ), CRLF = String.fromCharCode( 13, 10 );
const lines = ( ...a ) => a.join( NL );

export const PATCHES = [
	{ file: 'src/features/netsync/HullLink.js',
		anchor: "import { obb2, satOverlap, contactPoint, resolveContact, isBowOn, ramDamage, yawInertia, COLLIDE } from '../naval/Collisions.js';",
		replace: lines(
			"import { obb2, satOverlap, contactPoint, resolveContact, isBowOn, ramDamage, yawInertia, COLLIDE, hullPair } from '../naval/Collisions.js';",
			"import { shapeFromDims } from '../../world/boat/HullShape.js';" ) },
	{ file: 'src/features/netsync/HullLink.js',
		anchor: "const finite = ( a, n ) => Array.isArray( a ) && a.length >= n && a.slice( 0, n ).every( Number.isFinite );",
		replace: lines(
			"const finite = ( a, n ) => Array.isArray( a ) && a.length >= n && a.slice( 0, n ).every( Number.isFinite );",
			"",
			"// wave 24B: a remote boat's outline (HullShape): a ship class's as the naval feature drew it, else from her catalogue size",
			"const _outlines = new Map();",
			"function outlineOf( naval, id, spec ) {",
			"",
			"\tconst cls = spec.shipClass;",
			"\tconst drawn = cls && naval && naval._shapes ? naval._shapes.get( cls + '@1.000' ) : null;",
			"\tif ( drawn ) return drawn;",
			"\tlet s = _outlines.get( id );",
			"\tif ( ! s ) _outlines.set( id, s = shapeFromDims( spec.length, spec.beam ) );",
			"\treturn s;",
			"",
			"}" ) },
	{ file: 'src/features/netsync/HullLink.js',
		anchor: lines( "\t\t\tr.boat = st.id;", "\t\t\tout.push( r );" ),
		replace: lines( "\t\t\tr.boat = st.id;", "\t\t\tr.shape = outlineOf( this._naval(), st.id, spec );", "\t\t\tout.push( r );" ) },
	{ file: 'src/features/netsync/HullLink.js',
		anchor: lines( "\t\tr.maxHp = n && n.playerHull && n.playerHull.max > 0 ? n.playerHull.max : spec.hp || 40 + 0.07 * r.mass;", "\t\treturn r;" ),
		replace: lines( "\t\tr.maxHp = n && n.playerHull && n.playerHull.max > 0 ? n.playerHull.max : spec.hp || 40 + 0.07 * r.mass;", "\t\tr.shape = b.hullShape || outlineOf( n, id, spec );", "\t\treturn r;" ) },
	{ file: 'src/features/netsync/HullLink.js',
		anchor: lines(
			"\t\tconst A = obb2( a.x, a.z, a.yaw, a.hx, a.hz ), B = obb2( b.x, b.z, b.yaw, b.hx, b.hz );",
			"\t\tconst s = satOverlap( A, B, this._sat );" ),
		replace: "\t\tconst s = hullPair( a, b, this._sat ); // (the outlines as drawn when both have one: wave 24B)" },
	{ file: 'src/features/netsync/HullLink.js',
		anchor: "\t\tconst pt = contactPoint( A, B, nx, nz );",
		replace: "\t\tconst pt = { x: s.x, z: s.z };" },
	{ file: 'src/features/netsync/HullLink.js',
		anchor: "\t\t\tconst s = satOverlap( obb2( lb.x, lb.z, lb.yaw, lb.hx, lb.hz ), obb2( r.x, r.z, r.yaw, r.hx, r.hz ), this._sat );",
		replace: "\t\t\tconst s = hullPair( lb, r, this._sat );" },
	{ file: 'src/features/Features.js',
		anchor: "//   hullsCollided { a, b, x, z, speed, damage: { a, b }, byPlayer }   shipCrippled { id, name, by?, x?, z? } (naval / boarding)",
		replace: lines(
			"//   hullsCollided { a, b, x, z, speed, damage: { a, b }, byPlayer }   shipCrippled { id, name, by?, x?, z? } (naval / boarding)",
			"//   hullStruck { what: 'pier' | 'rock' | 'ground' | 'object', x, z, speed, damage, byPlayer } (naval, wave 24B: the player's boat",
			"//               against piles, piers, quays, rocks and the bottom; a nudge under 1.2 m/s is a fender thump, no event)" ) },
	{ file: 'package.json',
		anchor: "node test/feature-capsize.mjs && ",
		replace: "node test/feature-capsize.mjs && node test/feature-collisions-w24.mjs && " },
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
