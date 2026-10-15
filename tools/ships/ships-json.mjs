// Wave 24C: the game's numbers for the ship builder (tools/ships/build_ships.py), so the new GLBs keep every measured
// dimension the game relies on: SHIP_CLASSES (length / beam / draft / deck / mast / stations / helm / wheel / decks), the
// player's ship entries of Boats.js (deck, helm platform, broadside, mirror), ShipDecks' layout (walkable surfaces with the
// ramps stepped, masts, solids), and the collision lines (SimpleHullLines) sampled at the sheer, which the visual hull
// must contain.
//   node tools/ships/ships-json.mjs [out.json]      (default tools/ships/ships.json)
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SHIP_CLASSES } from '../../src/features/naval/ShipClasses.js';
import { BOATS } from '../../src/game/Boats.js';
import { SHIP_LAYOUT, walkSurfaces, BULWARK, GAP } from '../../src/world/boat/ShipDecks.js';
import { SimpleHullLines } from '../../src/world/boat/SimpleHullLines.js';

const out = process.argv[ 2 ] || join( import.meta.dirname, 'ships.json' );
const data = { bulwark: BULWARK, gap: GAP, classes: {}, boats: {}, layout: {}, lines: {} };
for ( const [ k, c ] of Object.entries( SHIP_CLASSES ) ) {

	const { loot, ...rest } = c;
	data.classes[ k ] = rest;

}

for ( const [ k, b ] of Object.entries( BOATS ) ) {

	if ( b.kind !== 'ship' ) continue;
	data.boats[ k ] = { deckY: b.deckY, freeboard: b.freeboard, helm: b.helm, helmDeckY: b.helmDeckY ?? b.deckY, board: b.board, broadside: b.broadside || null, mirror: !! b.mirror, hull: b.hull, length: b.length, beam: b.beam, draft: b.draft };
	const L = SHIP_LAYOUT[ b.shipClass ];
	data.layout[ k ] = { deckEnd: L.deckEnd, masts: L.masts, solid: L.solid, surfaces: walkSurfaces( b.shipClass ), raw: L.surfaces, ramps: L.ramps };
	const lines = new SimpleHullLines( { ...b, ...b.hull } );
	const samples = [];
	for ( let i = 0; i <= 100; i ++ ) {

		const t = i / 100;
		samples.push( { t, z: lines.sheerZ( t ), sheerX: lines.sheerX( t ), sheerY: lines.sheerY( t ), hbDeck: lines.halfBreadth( t, b.deckY ), hbHelm: lines.halfBreadth( t, b.helmDeckY ?? b.deckY ) } );

	}

	data.lines[ k ] = { shell: lines.shell, zAft: lines.zAft, zBow: lines.zBow, samples };

}

writeFileSync( out, JSON.stringify( data, null, '\t' ) );
console.log( 'wrote ' + out );
