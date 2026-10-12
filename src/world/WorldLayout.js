import * as THREE from '../engine/index.js';
import { ISLETS_BY_ID, isletWorld } from './terrain/IslandShape.js';

// Shared world layout. Coordinates in meters, y up, sea level y = 0.
// The open ocean lies to the south (+z); the island to the north (-z).
// Sun rises in the east (+x) and sets in the west (-x).
export const WORLD = {
	terrainSize: 2048, // heightmap domain, centered at origin
	terrainRes: 2048,

	// Central sandy beach inside the bay, shoreline near z ≈ -42 at x = 0.
	beach: { xMin: - 150, xMax: 170 },

	pier: {
		x: 55,
		zStart: - 64, // on dry sand
		zEnd: 40, // end of pier (~4 m depth)
		deckHeight: 2.3, // deck surface above sea level
		width: 2.6,
		headWidth: 14, // T-shaped platform at the end
		headDepth: 7,
	},

	// Where the boat is moored: east side of the pier head, bow pointing south.
	boatDock: { position: new THREE.Vector3( 64.5, 0, 36.5 ), heading: 0 },

	village: { center: new THREE.Vector3( 40, 0, - 118 ), radius: 95 },

	reef: { center: new THREE.Vector3( - 78, 0, 58 ), radius: 58 },

	// Islands in the shared heightmap. 'home' is the main island (north); Pons Cove is a small
	// island to the south-east reached by boat (terrain/IslandShape.js PONS holds its exact shape).
	islands: [
		{ id: 'home', center: new THREE.Vector3( 0, 0, - 330 ), radius: 560 },
		{ id: 'pons', center: new THREE.Vector3( 620, 0, 560 ), radius: 140 },
		{ id: 'gull', center: new THREE.Vector3( - 560, 0, 200 ), radius: 120 },
		{ id: 'key', center: new THREE.Vector3( 740, 0, 70 ), radius: 110 },
	],

	// Pons Cove: a timber dock on the north-west beach, running from `start` (on the sand) out to
	// `end` over the water (heading: the direction it runs out, bow convention of boatDock).
	// dock.position is where the boat moors, alongside the dock end.
	pons: {
		center: new THREE.Vector3( 620, 0, 560 ),
		radius: 140,
		dock: {
			position: new THREE.Vector3( 524.8, 0, 474.3 ), heading: - 2.3305,
			start: new THREE.Vector3( 549.5, 0, 493.4 ), end: new THREE.Vector3( 521.8, 0, 467.3 ),
			deckHeight: 1.3, width: 2.2,
		},
	},

	// Gull Rock (west-south-west): a rocky islet with a jetty and a lighthouse on top; Saltmarsh Key
	// (east): a low sandy key with mangroves and a fishing hut. Same dock fields as `pons`
	// (terrain/IslandShape.js ISLETS holds the exact shapes; src/world/islands/ builds them).
	gull: {
		center: new THREE.Vector3( - 560, 0, 200 ),
		radius: 120,
		dock: {
			position: new THREE.Vector3( - 494.1, 0, 179.4 ), heading: 1.8277,
			start: new THREE.Vector3( - 515.5, 0, 188.3 ), end: new THREE.Vector3( - 490.4, 0, 181.7 ),
			deckHeight: 1.15, width: 1.8,
		},
	},
	key: {
		center: new THREE.Vector3( 740, 0, 70 ),
		radius: 110,
		dock: {
			position: new THREE.Vector3( 672.9, 0, 69.8 ), heading: - 1.6208,
			start: new THREE.Vector3( 707, 0, 68.4 ), end: new THREE.Vector3( 670.1, 0, 66.5 ),
			deckHeight: 1.15, width: 2.0,
		},
	},

	// Every port, in the order home, pons, gull, key (filled in below). dock: where the boat moors
	// (position, heading in the boatDock convention) plus the jetty (start on the sand, end over the
	// water, deck height, width); stand: the trader's stall or the point of interest (map marker; yaw
	// faces the water); center / radius: the island; roads: an offshore anchorage; approach: sailing
	// waypoints [x, z] from the harbour anchorage (naval/Routes.js HARBOUR_ANCHORAGE) to the roads.
	ports: [],

	spawn: { position: new THREE.Vector3( 18, 0, - 60 ), yaw: Math.PI }, // kept clear of rocks, plants and debris
	// Jade Landing (src/world/start): the fisher's pavilion in the east corner of the bay, under the
	// headland. center / yaw: the pavilion (local +z, its front and steps, faces the bay to the WSW; local
	// +x is the sea side); totem: the carved jade-fish landmark on the sand; boardwalk: from the foot of the
	// steps west to the boathouse footpath (terrain/IslandShape.js PATHS 'east'), so Roid's yard, Ethena,
	// PoorGoat and the pier are one walk away; intro.path: the first-start camera glide in from the sea, over the beach east
	// of the totem and under its lantern string (it ends on the player's own camera, src/world/start/Intro.js).
	landing: {
		center: new THREE.Vector3( 178, 0, - 71 ), yaw: - 1.17,
		totem: new THREE.Vector3( 166, 0, - 61.5 ),
		boardwalk: [ [ 173.6, - 69.2 ], [ 166, - 67.7 ], [ 156, - 66.6 ], [ 144, - 65.8 ], [ 130, - 65.3 ], [ 116, - 65.1 ], [ 104, - 64.9 ], [ 96, - 64.7 ], [ 90.6, - 64.0 ] ],
		intro: { path: [ new THREE.Vector3( 152.2, 15, - 16.6 ), new THREE.Vector3( 170, 9, - 43.7 ), new THREE.Vector3( 172.5, 3.6, - 58.5 ) ] },
	},
	// where the player starts: on the boardwalk just off the landing's steps (the third-person camera clear of the
	// roof), the totem ahead on the left, the boardwalk running off to the village and the pier on the right
	// (Tidewater started at the pier foot, 53.6, -77)
	start: { position: new THREE.Vector3( 169, 0, - 68.29 ), yaw: 2.25 },

	// Incoming swell direction (unit, travel direction)
	swellDir: new THREE.Vector2( - 0.12, - 1 ).normalize(),
};

WORLD.ports.push(
	{
		id: 'home', name: 'Hyptile Harbour',
		dock: { position: WORLD.boatDock.position, heading: WORLD.boatDock.heading },
		stand: { x: 49.9, z: - 74.6, yaw: 1.45 },
		center: WORLD.islands[ 0 ].center, radius: WORLD.islands[ 0 ].radius,
		roads: [ 80, 80 ], approach: [],
	},
	{
		id: 'pons', name: 'Pons Cove',
		dock: { ...WORLD.pons.dock },
		stand: { x: 561.6, z: 498, yaw: WORLD.pons.dock.heading },
		center: WORLD.islands[ 1 ].center, radius: WORLD.islands[ 1 ].radius,
		roads: [ 452, 452 ], approach: [ [ 100, 230 ], [ 150, 500 ], [ 452, 452 ] ],
	},
	{
		id: 'gull', name: 'Gull Rock',
		dock: { ...WORLD.gull.dock },
		stand: { x: - 555, z: 198.7, yaw: WORLD.gull.dock.heading },
		center: WORLD.islands[ 2 ].center, radius: WORLD.islands[ 2 ].radius,
		roads: [ - 437.2, 167.7 ], approach: [ [ 30, 200 ], [ - 110, 330 ], [ - 300, 360 ], [ - 430, 280 ], [ - 437.2, 167.7 ] ],
	},
	{
		id: 'key', name: 'Saltmarsh Key',
		dock: { ...WORLD.key.dock },
		stand: { x: 715.9, z: 60.8, yaw: WORLD.key.dock.heading },
		center: WORLD.islands[ 3 ].center, radius: WORLD.islands[ 3 ].radius,
		roads: [ 615.1, 63.7 ], approach: [ [ 100, 230 ], [ 260, 350 ], [ 420, 330 ], [ 560, 190 ], [ 615.1, 63.7 ] ],
	},
);

// Islands 5-8 (terrain/IslandShape.js ISLES_5_8, the Unreal game's West Haven, The Shrine, Quiet Shoal and the
// Inverted Isles; src/world/islands/ builds them, src/game/ports/Ports.js runs their ports). Their WORLD[ id ]
// and WORLD.ports entries are derived from the terrain definitions so the jetty always sits where the beach and
// the mooring pocket were shaped: dock.start / end from the island's dock (u0 -> u1 at v), dock.position
// alongside the end, stand / roads in island coordinates. The Inverted Isles add `lagoon` { x, z, radius }: the
// calm water inside the atoll (a seaplane can land there).
for ( const [ id, radius, standUV, roadsUV, approach ] of [
	[ 'haven', 130, [ - 44, 7 ], [ - 142, 0 ], [ [ 30, 200 ], [ - 110, 330 ], [ - 300, 360 ], [ - 420, 280 ], [ - 420, 140 ], [ - 470, 40 ], [ - 560, - 60 ] ] ],
	[ 'shrine', 100, [ - 29.5, 10 ], [ - 95, 0 ], [ [ 100, 230 ], [ 260, 350 ], [ 420, 330 ], [ 560, 190 ], [ 590, 40 ], [ 630, - 120 ], [ 700, - 240 ] ] ],
	[ 'shoal', 90, [ - 9, 3 ], [ - 120, 0 ], [ [ 30, 200 ], [ - 110, 330 ], [ - 300, 360 ], [ - 420, 280 ], [ - 420, 140 ], [ - 470, 40 ], [ - 560, - 60 ], [ - 650, - 260 ], [ - 690, - 420 ], [ - 700, - 560 ] ] ],
	[ 'inverted', 170, [ - 128, - 30 ], [ - 205, - 30 ], [ [ 30, 200 ], [ - 150, 360 ], [ - 350, 520 ], [ - 480, 600 ] ] ],
] ) {

	const I = ISLETS_BY_ID[ id ], D = I.dock;
	const r1 = ( v ) => Math.round( v * 10 ) / 10;
	const [ sx, sz ] = isletWorld( I, D.u0, D.v ), [ ex, ez ] = isletWorld( I, D.u1, D.v );
	const [ mx, mz ] = isletWorld( I, D.u1 + 3, D.v + D.width / 2 + 2.3 );
	const heading = Math.atan2( ex - sx, ez - sz );
	const center = new THREE.Vector3( I.x, 0, I.z );
	WORLD[ id ] = {
		center, radius,
		dock: {
			position: new THREE.Vector3( mx, 0, mz ), heading,
			start: new THREE.Vector3( sx, 0, sz ), end: new THREE.Vector3( ex, 0, ez ),
			deckHeight: D.deck, width: D.width,
		},
	};
	WORLD.islands.push( { id, center, radius } );
	const [ tx, tz ] = isletWorld( I, standUV[ 0 ], standUV[ 1 ] ), [ rx, rz ] = isletWorld( I, roadsUV[ 0 ], roadsUV[ 1 ] );
	const roads = [ r1( rx ), r1( rz ) ];
	WORLD.ports.push( {
		id, name: I.name,
		dock: { ...WORLD[ id ].dock },
		stand: { x: r1( tx ), z: r1( tz ), yaw: heading },
		center, radius,
		roads, approach: [ ...approach, roads ],
	} );

}

{

	const I = ISLETS_BY_ID.inverted;
	WORLD.inverted.lagoon = { x: I.x, z: I.z, radius: 70 };
	WORLD.ports.find( ( p ) => p.id === 'inverted' ).lagoon = WORLD.inverted.lagoon;

}
