// Root patches of wave 25C (camera and movement). Each patch is an exact anchor (found once) and its replacement.
//   node tools/camera25c/apply-patches.mjs [rootDir] [--check]
// rootDir defaults to the repo; --check only reports whether every anchor is found exactly once (nothing written).
// Root owns these files: run it (or copy the pairs) at integration time. Line ends follow each file (CRLF or LF).
//
//   src/core/Input.js    padLook: the gamepad's share of the look (consumeLook() returns padX / padY / pad beside x / y)
//   src/core/Gamepad.js  fills padLook (the look still goes to input.look as before: nothing else changes)
//   src/features/naval/Naval.js  the ships' hull outlines stop the third-person arm (Player.addCameraBlocker)
//   src/world/Village.js  each house's roof (porch eave included) is a box the arm cannot enter (src/world/Roofs.js)
//   package.json         test/camera-rig.mjs joins npm test
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NL = String.fromCharCode( 10 ), CRLF = String.fromCharCode( 13, 10 );
const lines = ( ...a ) => a.join( NL );

export const PATCHES = [
	// ---- Input: the pad's share of the look. Player.lookSlew subtracts it from x / y to slew the mouse and touch alone, and applies
	// the pad per second (not per frame) with its response curve.
	{ file: 'src/core/Input.js', anchor: '\t\tthis.look = { x: 0, y: 0 };',
		replace: lines( '\t\tthis.look = { x: 0, y: 0 };',
			'\t\tthis.padLook = { x: 0, y: 0, mag: 0 }; // (wave 25C) the gamepad\'s share of `look` (counts, the stick\'s tilt 0..1), core/Gamepad.js' ) },
	{ file: 'src/core/Input.js', anchor: lines( '\t\tconst l = { x: this.look.x, y: this.invertY ? - this.look.y : this.look.y };',
		'\t\tthis.look.x = 0;', '\t\tthis.look.y = 0;', '\t\treturn l;' ),
		replace: lines( '\t\tconst pl = this.padLook;',
			'\t\tconst l = { x: this.look.x, y: this.invertY ? - this.look.y : this.look.y, padX: pl.x, padY: this.invertY ? - pl.y : pl.y, pad: pl.mag };',
			'\t\tthis.look.x = 0;', '\t\tthis.look.y = 0;', '\t\tpl.x = pl.y = pl.mag = 0;', '\t\treturn l;' ) },
	// ---- Gamepad: the same counts into padLook (Gamepad.update runs before the input is read each frame)
	{ file: 'src/core/Gamepad.js', anchor: lines( '\t\tthis.input.look.x += rx * Math.abs( rx ) * this.lookSpeed;', '\t\tthis.input.look.y += ry * Math.abs( ry ) * this.lookSpeed;' ),
		replace: lines( '\t\tthis.input.look.x += rx * Math.abs( rx ) * this.lookSpeed;', '\t\tthis.input.look.y += ry * Math.abs( ry ) * this.lookSpeed;',
			'\t\tconst pl = this.input.padLook; // (wave 25C) Player slews the mouse alone and applies the pad per second, with a soft start',
			'\t\tif ( pl ) {', '', '\t\t\tpl.x += rx * Math.abs( rx ) * this.lookSpeed;', '\t\t\tpl.y += ry * Math.abs( ry ) * this.lookSpeed;',
			'\t\t\tpl.mag = Math.max( pl.mag, Math.hypot( rx, ry ) );', '', '\t\t}' ) },
	// ---- Naval: every ship's hull outline stops the arm (the spring arm used to pass through a hull that is not a box collider)
	{ file: 'src/features/naval/Naval.js', anchor: "import { shapeFromObject, shapeFromDims, polyDistance } from '../../world/boat/HullShape.js';",
		replace: lines( "import { shapeFromObject, shapeFromDims, polyDistance, placeShape } from '../../world/boat/HullShape.js';",
			"import { hullCameraBlocker } from '../../player/CameraRig.js';" ) },
	{ file: 'src/features/naval/Naval.js', anchor: lines( '\t\tdt = Math.min( dt, 0.1 );', '\t\tthis._dt = dt;' ),
		replace: lines( '\t\tdt = Math.min( dt, 0.1 );', '\t\tthis._dt = dt;',
			'\t\t// (wave 25C) the ships\' hull outlines stop the third-person camera arm',
			'\t\tif ( ! this._camBlock && this.app && this.app.player && this.app.player.addCameraBlocker ) this._camBlock = this.app.player.addCameraBlocker( hullCameraBlocker( this, placeShape ) );' ) },
	{ file: 'src/features/naval/Naval.js', anchor: lines( '\t\tfor ( const off of this._offs ) off();', '\t\tthis._offs.length = 0;', '\t\tthis._clearWorld();', '\t\tthis.balls.dispose();' ),
		replace: lines( '\t\tfor ( const off of this._offs ) off();', '\t\tthis._offs.length = 0;', '\t\tif ( this._camBlock ) { this._camBlock(); this._camBlock = null; }', '\t\tthis._clearWorld();', '\t\tthis.balls.dispose();' ) },
	// ---- Village: the houses' roofs and porch eaves are only drawn (the body collider ends under them): register each as a box the
	// camera's arm cannot enter (src/world/Roofs.js; the porch is at the front, local +z)
	{ file: 'src/world/Village.js', anchor: "import { buildBoardwalk } from './village/Boardwalk.js';",
		replace: lines( "import { buildBoardwalk } from './village/Boardwalk.js';", "import { registerRoof } from './Roofs.js';" ) },
	{ file: 'src/world/Village.js', anchor: "			this.buildings.push( { name: s.name, x: s.x, z: s.z, floorY: res.floorY, roofTop: res.roofTop, stilts: s.foundation === 'stilts', footprint: res.footprint } );",
		replace: lines( "			this.buildings.push( { name: s.name, x: s.x, z: s.z, floorY: res.floorY, roofTop: res.roofTop, stilts: s.foundation === 'stilts', footprint: res.footprint } );",
			"			registerRoof( 'village:' + s.name, { x: s.x, z: s.z, yaw: s.yaw || 0, w: s.w + 0.9, d: s.d + 0.9 + ( res.porchDepth || 0 ), cz: ( res.porchDepth || 0 ) / 2, y0: res.eaveY - 0.15, y1: res.roofTop } ); // (wave 25C)" ) },
	// ---- the wave's test joins npm test
	{ file: 'package.json', anchor: '"test": "node test/game-logic.mjs && ', replace: '"test": "node test/camera-rig.mjs && node test/game-logic.mjs && ' },
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
