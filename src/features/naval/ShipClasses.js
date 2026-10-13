// The ship classes of the naval feature. Geometry comes from the fork's NavalShips manifest
// (Assets/NavalShips/manifest.json) and the exported GLBs (public/models/ships/*_v2.glb):
//   GLB frame: +X forward (bow), +Y up, origin at the waterline centre of the hull; the model is turned
//   by -PI/2 about Y to meet the game's boat frame (+Z forward, +X port), see Models.js.
//
// length / beam / draft / sheer / deck / mast are metres of the hull (keel at -draft, sheer top and main
// deck above the waterline, mast top). mass (kg, as Boats.js gives the player's hulls of the same class: collisions).
// speed (m/s), accel / decel (m/s^2) and turn (rad/s at full way) are
// the kinematics; hp the hull points; stations the guns of both broadsides (boat frame: forward offset z,
// beam offset x, height y; the manifest's broadside stations are at +-2.4 m forward and 2.1 / 2.9 / 2.5 m out).
//
// Pirates: sight is the detect radius by day (m), engage the range where they close to a broadside,
// lose the range where they give up, fleeAt the hull fraction where they run, shot = ballistic spread
// (rad, one sigma), damage per ball, reload seconds per side, traverse the half arc (rad) a gun can
// swivel from the beam.

import { DEG } from './util.js';

const stations = ( zs, beamX, deckY ) => zs.flatMap( ( z ) => [ { side: 'port', x: beamX, y: deckY + 0.55, z }, { side: 'starboard', x: - beamX, y: deckY + 0.55, z } ] );

export const SHIP_CLASSES = {
	trawler: {
		id: 'trawler', label: 'Merchant trawler', faction: 'merchant', glb: 'models/ships/trawler_v2.glb',
		length: 16.4, beam: 6.0, draft: 1.65, sheer: 3.48, deck: 2.4, mast: 11.2,
		speed: 4.2, accel: 0.45, decel: 0.7, turn: 0.22,
		mass: 42000, hp: 140, guns: 0, stations: [],
		sight: 0, engage: 0, lose: 0, fleeAt: 0.4, shot: 0, damage: 0, reload: 0, traverse: 0,
		loot: { crates: 3, value: [ 35, 70 ] },
	},
	sloop: {
		id: 'sloop', label: 'Black Flag sloop', faction: 'pirate', glb: 'models/ships/sloop_v2.glb',
		length: 14.4, beam: 5.2, draft: 1.4, sheer: 3.21, deck: 2.2, mast: 11.9,
		speed: 7.2, accel: 1.0, decel: 1.2, turn: 0.5,
		mass: 26000, hp: 120, guns: 2, stations: stations( [ - 2.4, 2.4 ], 2.1, 2.2 ),
		sight: 380, engage: 140, lose: 720, fleeAt: 0.28, shot: 0.017, damage: 26, reload: 5.2, traverse: 24 * DEG,
		loot: { crates: 2, value: [ 60, 110 ] },
	},
	brigantine: {
		id: 'brigantine', label: 'Two-masted brigantine', faction: 'pirate', glb: 'models/ships/brigantine_v2.glb',
		length: 20, beam: 6.8, draft: 1.9, sheer: 3.73, deck: 2.6, mast: 15.2,
		speed: 6.2, accel: 0.7, decel: 0.9, turn: 0.32,
		mass: 64000, hp: 260, guns: 3, stations: stations( [ - 4.2, 0, 4.2 ], 2.9, 2.6 ),
		sight: 440, engage: 150, lose: 800, fleeAt: 0.16, shot: 0.014, damage: 30, reload: 6.4, traverse: 22 * DEG,
		loot: { crates: 3, value: [ 90, 160 ] },
	},
};

export const SHIP_KINDS = Object.keys( SHIP_CLASSES );

export const PIRATE_CAPTAINS = [ 'Mad Meg Orrow', 'One-Eye Pell', 'Black Tam', 'Salt Annick', 'Captain Vane', 'Rook Delacroix', 'Old Bess Harrow', 'Tobias Grim', 'Sable Jory', 'Dread Hallam' ];
export const PIRATE_SHIPS = [ 'Black Gull', 'Salt Widow', 'Grey Cormorant', 'Hollow Tide', 'Red Kestrel', 'The Gannet\'s Debt', 'Night Heron', 'Drowned Lantern', 'Ashen Wake', 'Sable Petrel' ];
export const MERCHANT_SHIPS = [ 'Margit & Sons', 'Pons Packet', 'Gull Harbour Hauler', 'Brine & Barley', 'Tidewater Pride', 'Patient Mary' ];

// loot crate value roll, coins
export function lootValue( cls, rng ) {

	const [ a, b ] = cls.loot.value;
	return Math.round( a + ( b - a ) * rng() );

}
