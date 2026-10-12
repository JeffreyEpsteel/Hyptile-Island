// Hand-authored large-scale structure of the island: the ridge skeleton of the volcanic
// massif, sea stacks off the headlands and the footpaths around the village.

// Ridge skeleton: polylines of [x, z, crest height] (optional 4th value: half width, defaults
// to 2.2 * height + 40 m). Each polyline is the max of its segments; polylines are combined
// with a p-norm so junctions and saddles round off naturally. The cross profile is concave
// (sharp crest, flanks easing out toward the valley floors).
export const RIDGES = [
	// main east-west divide with the summit north of the bay
	[ [ - 480, - 360, 40 ], [ - 380, - 410, 110 ], [ - 250, - 460, 150 ], [ - 120, - 495, 178 ], [ - 35, - 510, 215 ], [ 50, - 495, 176 ], [ 150, - 470, 168 ], [ 270, - 430, 124 ], [ 400, - 360, 60 ], [ 470, - 320, 25 ] ],
	// west headland spur
	[ [ - 250, - 460, 140 ], [ - 262, - 340, 100 ], [ - 272, - 200, 66 ], [ - 278, - 70, 48, 120 ], [ - 274, 60, 36, 100 ], [ - 264, 165, 20, 70 ] ],
	// east headland spur
	[ [ 150, - 470, 155 ], [ 240, - 340, 108 ], [ 284, - 190, 70 ], [ 294, - 50, 50, 125 ], [ 294, 80, 36, 105 ], [ 290, 190, 18, 70 ] ],
	// central spur behind the village
	[ [ - 35, - 505, 195 ], [ - 15, - 410, 138 ], [ 8, - 330, 80, 180 ], [ 22, - 275, 38, 110 ] ],
	// minor spurs framing the valley
	[ [ - 150, - 485, 160 ], [ - 135, - 370, 104 ], [ - 118, - 280, 44, 120 ] ],
	[ [ 105, - 485, 162 ], [ 140, - 370, 110 ], [ 162, - 275, 42, 120 ] ],
	// north spurs
	[ [ - 110, - 500, 170 ], [ - 160, - 640, 110 ], [ - 200, - 770, 38 ] ],
	[ [ 50, - 495, 168 ], [ 115, - 630, 112 ], [ 165, - 765, 38 ] ],
	[ [ - 380, - 410, 100 ], [ - 440, - 560, 56 ] ],
	[ [ 270, - 430, 115 ], [ 390, - 550, 52 ] ],
];

for ( const r of RIDGES ) for ( const p of r ) if ( p.length < 4 ) p.push( 2.5 * p[ 2 ] + 50 );

const P = 6;
const CREST = 0.07;
const CREST_N = Math.sqrt( 1 + CREST * CREST ) - CREST;

// smooth envelope height of the ridge skeleton at (x, z)
export function ridgeEnvelope( x, z ) {

	let sum = 0;
	for ( let r = 0; r < RIDGES.length; r ++ ) {

		const pts = RIDGES[ r ];
		let best = 0;
		for ( let k = 0; k < pts.length - 1; k ++ ) {

			const a = pts[ k ], b = pts[ k + 1 ];
			const abx = b[ 0 ] - a[ 0 ], abz = b[ 1 ] - a[ 1 ];
			let t = ( ( x - a[ 0 ] ) * abx + ( z - a[ 1 ] ) * abz ) / ( abx * abx + abz * abz );
			t = t < 0 ? 0 : t > 1 ? 1 : t;
			const dx = x - ( a[ 0 ] + abx * t ), dz = z - ( a[ 1 ] + abz * t );
			const Wd = a[ 3 ] + ( b[ 3 ] - a[ 3 ] ) * t;
			const u0 = Math.sqrt( dx * dx + dz * dz ) / Wd;
			if ( u0 >= 1 ) continue;
			// rounded crest (soft |u|), renormalised so u = 1 at the foot
			const u = ( Math.sqrt( u0 * u0 + CREST * CREST ) - CREST ) / CREST_N;
			const q = 1 - u;
			const v = ( a[ 2 ] + ( b[ 2 ] - a[ 2 ] ) * t ) * q * q * ( 1 + 0.5 * u );
			if ( v > best ) best = v;

		}

		if ( best > 0 ) {

			const b2 = best * best;
			sum += b2 * b2 * b2;

		}

	}

	return sum > 0 ? Math.pow( sum, 1 / P ) : 0;

}

// Sea stacks off the headland tips: [x, z, radius, height]
export const SEA_STACKS = [
	[ - 272, 216, 9, 17 ], [ - 300, 196, 6, 11 ], [ - 244, 240, 5.5, 8 ], [ - 316, 152, 7, 13 ], [ - 286, 238, 4, 6 ],
	[ 298, 252, 10, 19 ], [ 262, 246, 6, 10 ], [ 328, 228, 7, 12 ], [ 322, 186, 5, 9 ], [ 280, 272, 4.5, 7 ],
];

// Footpaths (x, z polylines) with half widths. Worn into the ground (darkened + slightly sunken).
export const PATHS = [
	// beach at the spawn up to the front row and on to the plaza
	{ w: 1.1, pts: [ [ 21, - 56 ], [ 20, - 68 ], [ 18.5, - 80 ], [ 16.5, - 92 ], [ 15.5, - 100 ], [ 20, - 102.5 ], [ 28, - 104.5 ], [ 35.5, - 108.5 ] ] },
	// plaza north up the valley and onto the central spur (hiking trail)
	{ w: 0.6, pts: [ [ 42, - 116.5 ], [ 45.5, - 126 ], [ 48, - 138 ], [ 49, - 150 ], [ 49.5, - 162 ], [ 47, - 175 ], [ 41, - 188 ], [ 36, - 199 ], [ 31, - 212 ], [ 33, - 224 ], [ 26, - 236 ], [ 20, - 247 ], [ 24, - 258 ], [ 16, - 270 ], [ 11, - 283 ], [ 15, - 296 ], [ 8, - 309 ], [ 4, - 322 ] ] },
	// east: boathouse up to the boardwalk
	{ w: 0.9, pts: [ [ 88, - 62 ], [ 80, - 72 ], [ 70, - 80 ], [ 60, - 86 ], [ 54.5, - 90 ] ] },
	// west: along the back of the beach to the western grove
	{ w: 0.8, pts: [ [ 18, - 62 ], [ 5, - 68 ], [ - 12, - 73 ], [ - 30, - 77 ], [ - 50, - 80 ], [ - 72, - 84 ] ] },
];

// distance from (x, z) to a polyline; returns [distance, arc length position of the closest point]
export function polylineDistance( pts, x, z ) {

	let best = Infinity, acc = 0, bestArc = 0;
	for ( let k = 0; k < pts.length - 1; k ++ ) {

		const a = pts[ k ], b = pts[ k + 1 ];
		const abx = b[ 0 ] - a[ 0 ], abz = b[ 1 ] - a[ 1 ];
		const len2 = abx * abx + abz * abz;
		let t = ( ( x - a[ 0 ] ) * abx + ( z - a[ 1 ] ) * abz ) / len2;
		t = t < 0 ? 0 : t > 1 ? 1 : t;
		const dx = x - ( a[ 0 ] + abx * t ), dz = z - ( a[ 1 ] + abz * t );
		const d = dx * dx + dz * dz;
		const len = Math.sqrt( len2 );
		if ( d < best ) {

			best = d;
			bestArc = acc + t * len;

		}

		acc += len;

	}

	return [ Math.sqrt( best ), bestArc ];

}

// ---------------------------------------------------------------------------- Pons Cove
// The small second island to the south-east (open sea before it): a low hump with lower hills,
// one sandy beach facing the main island (north-west) where the dock goes and a rocky far side
// with a few small stacks. Its own frame: u runs from the beach to the far side (south-east), v
// across it; (u, v) = (0, 0) at the island centre.
const PONS_AX = [ 0.727, 0.686 ];
const PONS_AL = Math.hypot( PONS_AX[ 0 ], PONS_AX[ 1 ] );
export const PONS = {
	x: 620, z: 560, // centre
	ax: PONS_AX[ 0 ] / PONS_AL, az: PONS_AX[ 1 ] / PONS_AL, // unit u axis (beach -> far side)
	ru: 115, rv: 150, // ellipse radii along u / v (coastline before the outline noise)
	reach: 400, // beyond this distance from the centre the island has no influence at all
	// hills [ u, v, sigma u, sigma v, height ] (gaussian humps on top of the beach profile)
	hills: [ [ 15, 20, 65, 80, 11 ], [ - 15, - 70, 50, 55, 8 ], [ 60, - 20, 45, 60, 6 ] ],
	// the timber dock on the beach: along u (v = 0), from the dry sand (u0) out over the water (u1)
	dock: { u0: - 93, u1: - 135, v: 0, width: 2.2, deck: 1.6, side: 1 },
	// deeper mooring pocket off the dock end so the boat floats there: [ u, v, sigma u, sigma v, depth ]
	pocket: [ - 137, 0, 14, 9, 2.2 ],
};

// island frame <-> world
export function ponsLocal( x, z ) {

	const dx = x - PONS.x, dz = z - PONS.z;
	return [ dx * PONS.ax + dz * PONS.az, - dx * PONS.az + dz * PONS.ax ];

}

export function ponsWorld( u, v ) {

	return [ PONS.x + u * PONS.ax - v * PONS.az, PONS.z + u * PONS.az + v * PONS.ax ];

}

// sea stacks off the rocky far side: [x, z, radius, height] (world, from island coordinates)
export const PONS_STACKS = [ [ 146, 34, 5, 7 ], [ 158, - 44, 4, 5 ], [ 128, 86, 3.5, 4 ], [ 172, 6, 3, 3.5 ] ].map( ( [ u, v, r, h ] ) => {

	const [ x, z ] = ponsWorld( u, v );
	return [ Math.round( x * 10 ) / 10, Math.round( z * 10 ) / 10, r, h ];

} );

// the footpath from the dock foot up to the huts
PATHS.push( { w: 0.8, pts: [ [ - 93, 0 ], [ - 84, 6 ], [ - 76, 14 ], [ - 70, 22 ] ].map( ( [ u, v ] ) => {

	const [ x, z ] = ponsWorld( u, v );
	return [ Math.round( x * 10 ) / 10, Math.round( z * 10 ) / 10 ];

} ) } );

// ---------------------------------------------------------------- Gull Rock and Saltmarsh Key
// Two more small islands composed into the same heightmap exactly like Pons Cove, each in its own
// frame (u from the beach to the far side, v across; (0, 0) at the centre). TerrainData._islet
// turns the definitions into a signed coast distance, a beach zone and a mask; _base adds the
// hills, the height scale, the cliffs and the mooring pocket; _features adds the sea stacks, the
// building pads and the footpaths. Everything is exactly zero on the main island and Pons.
//   x, z, ax, az   centre and the unit u axis (beach -> far side)
//   ru, rv, far    ellipse radii before the outline noise; beyond `far` the island has no influence
//   shelf          [ distance, factor ]: beyond that many metres off the coast the distance (so the seabed
//                  depth) grows `factor` times faster, so the sea floor drops away within ~200 m
//   outline        [ scale 1, amplitude 1, scale 2, amplitude 2, noise offsets x4 ] (m)
//   beach          { sector: [ cos0, cos1 ] | ring: true, out: [ m, m ], inland: [ m, m ] } (d0 ranges)
//   hills          [ u, v, sigma u, sigma v, height ] gaussian humps; hillIn the (e0, e1) shore window
//   ridge          amplitude of the ridged relief (rocky side); heightScale scales the beach profile
//   cliffScale     scales the sea cliffs (Pons: 0.35)
//   pocket         [ u, v, sigma u, sigma v, depth ] a deeper pocket off the dock end
//   pads           [ u, v, radius, falloff, height ] flat building pads; stacks [ u, v, radius, height ]
//   dock           the timber jetty: along u (v = const) from the sand (u0) out over the water (u1)
const unit = ( dx, dz ) => {

	const l = Math.hypot( dx, dz );
	return [ dx / l, dz / l ];

};

export const ISLETS = [
	{
		id: 'gull', name: 'Gull Rock',
		x: - 560, z: 200, ax: unit( - 0.967, 0.254 )[ 0 ], az: unit( - 0.967, 0.254 )[ 1 ],
		ru: 56, rv: 44, far: 150, shelf: [ 90, 3 ],
		outline: [ 60, 13, 20, 3, 11.3, 4.4, 8.8, - 2.2 ],
		beach: { sector: [ 0.82, 0.96 ], out: [ 10, 36 ], inland: [ - 26, - 10 ] },
		hills: [ [ 2, 0, 26, 22, 14 ], [ 28, 14, 16, 13, 4 ] ], hillIn: [ 4, 18 ], ridge: 2.5, heightScale: 1, cliffScale: 0.55,
		pocket: [ - 64, 0, 14, 9, 2.2 ],
		pads: [ [ 0, 0, 6, 8, 16 ] ], stacks: [ [ 74, 10, 4.5, 9 ], [ 84, - 14, 3, 6 ], [ 66, 36, 3.2, 5 ], [ 30, - 56, 2.6, 4 ] ],
		dock: { u0: - 46, u1: - 72, v: 0, width: 1.8, deck: 1.15 },
	},
	{
		id: 'key', name: 'Saltmarsh Key',
		x: 740, z: 70, ax: unit( 0.999, 0.05 )[ 0 ], az: unit( 0.999, 0.05 )[ 1 ],
		ru: 55, rv: 36, far: 150, shelf: [ 90, 3 ],
		outline: [ 50, 6, 18, 1.8, 21.7, - 6.2, 3.1, 14.8 ],
		beach: { ring: true, out: [ 20, 70 ], inland: [ - 200, - 150 ] },
		hills: [ [ - 5, 0, 22, 14, 0.8 ], [ 18, 8, 12, 9, 0.5 ], [ 30, - 10, 9, 7, 0.7 ], [ - 2, 14, 8, 6, 0.5 ] ], hillIn: [ 6, 30 ], ridge: 0, heightScale: 0.5, cliffScale: 1,
		pocket: [ - 66, 0, 24, 13, 2.2 ],
		pads: [ [ - 22, - 8, 5.5, 5, 1.6 ] ], stacks: [],
		dock: { u0: - 33, u1: - 70, v: 0, width: 2.0, deck: 1.15 },
	},
];

export const ISLETS_BY_ID = Object.fromEntries( ISLETS.map( ( I ) => [ I.id, I ] ) );

export function isletLocal( I, x, z ) {

	const dx = x - I.x, dz = z - I.z;
	return [ dx * I.ax + dz * I.az, - dx * I.az + dz * I.ax ];

}

export function isletWorld( I, u, v ) {

	return [ I.x + u * I.ax - v * I.az, I.z + u * I.az + v * I.ax ];

}

// sea stacks of the small islands: [x, z, radius, height] (world, from island coordinates)
export const ISLET_STACKS = [];
export function refreshIsletStacks() {

	ISLET_STACKS.length = 0;
	for ( const I of ISLETS ) {

		for ( const [ u, v, r, h ] of I.stacks ) {

			const [ x, z ] = isletWorld( I, u, v );
			ISLET_STACKS.push( [ Math.round( x * 10 ) / 10, Math.round( z * 10 ) / 10, r, h ] );

		}

	}

}

refreshIsletStacks();

// the footpaths: Gull Rock's jetty foot up to the lighthouse door, Saltmarsh Key's dock foot to the hut
for ( const [ id, w, pts ] of [
	[ 'gull', 0.7, [ [ - 46, 0 ], [ - 38, 3 ], [ - 31, 6 ], [ - 23, 4 ], [ - 15, 2 ], [ - 7, 0.5 ] ] ],
	[ 'key', 0.8, [ [ - 33, 0 ], [ - 29, - 3 ], [ - 26, - 6 ], [ - 22, - 7 ] ] ],
] ) {

	PATHS.push( { w, pts: pts.map( ( [ u, v ] ) => {

		const [ x, z ] = isletWorld( ISLETS_BY_ID[ id ], u, v );
		return [ Math.round( x * 10 ) / 10, Math.round( z * 10 ) / 10 ];

	} ) } );

}

// ------------------------------------------------- West Haven, The Shrine, Quiet Shoal, the Inverted Isles
// Islands 5-8 of the Unreal game's eight (UpsideDownFishing reports/hyptile/world-setup.json names the landings
// Home, Pons, Lantern island, Quiet shoal, Old ruins, Windward isle, The shrine, West haven; DESIGN.md and
// TASKS.md give the inverted world: suspended islands, hanging roots, upward waterfalls, horizon silhouettes).
// The same recipe as Gull Rock and Saltmarsh Key, with three optional fields:
//   atoll     [ inner ru, inner rv ]: land only between the outer and this inner ellipse (a ring round a lagoon)
//   channel   [ v, half width, u from, u to ]: a dredged gap through the ring (water, ~2.7 m deep on its axis)
//   lagoon    the lagoon floor (m): it drops to this depth within ~14 m of the inner shore and stays there
//             (calm, sandy, a long seaplane run)
//   box       the island lies outside the 1 m passes' main rows: TerrainData gives it its own box of rows
// Everything they add is exactly zero beyond `far` of each island (the main island and Pons stay bit-identical).
const axis = ( dx, dz ) => unit( dx, dz );
const HAVEN_AX = axis( - 1, 0.12 ), SHRINE_AX = axis( 0.54, - 0.84 ), SHOAL_AX = axis( - 0.5, - 0.866 ), INV_AX = axis( - 0.765, 0.644 );

export const ISLES_5_8 = [
	{
		// the trading harbour town: a broad green island west of the main island, its beach and long pier facing
		// the harbour (east-south-east), the town on terraces behind the quay, hills behind the town
		id: 'haven', name: 'West Haven',
		x: - 806, z: - 200, ax: HAVEN_AX[ 0 ], az: HAVEN_AX[ 1 ],
		ru: 70, rv: 112, far: 150, shelf: [ 80, 5 ],
		outline: [ 70, 10, 22, 2.5, 4.1, - 7.3, 12.2, 3.3 ],
		beach: { sector: [ 0.5, 0.85 ], out: [ 10, 40 ], inland: [ - 75, - 45 ] },
		hills: [ [ 40, 0, 36, 64, 24 ], [ 22, 68, 24, 24, 11 ], [ 16, - 70, 24, 24, 13 ] ], hillIn: [ 14, 40 ], ridge: 2, heightScale: 1, cliffScale: 0.6,
		pocket: [ - 96, 0, 22, 16, 2.8 ],
		// the plaza at the pier foot, the quay row, the upper row and the watchtower on the hill
		pads: [ [ - 43, 0, 9, 5, 1.9 ], [ - 36, - 24, 5.5, 4, 2.3 ], [ - 36, 24, 5.5, 4, 2.3 ], [ - 36, - 42, 5, 4, 2.2 ], [ - 36, 42, 5, 4, 2.2 ],
			[ - 22, - 14, 5.5, 4.5, 4.0 ], [ - 22, 12, 5.5, 4.5, 4.0 ], [ - 22, 32, 5, 4, 4.2 ], [ - 22, - 34, 5, 4, 4.0 ], [ 12, 0, 5, 5, 17.0 ] ],
		stacks: [ [ 30, 124, 4, 7 ], [ 0, - 128, 3, 5 ] ],
		dock: { u0: - 52, u1: - 100, v: 0, width: 3.0, deck: 2.1 },
	},
	{
		// the basalt sea-stack cluster: a steep dark rock with a dozen columns standing round it in the sea, one
		// pocket beach and a landing facing south-west, the hermit fisher's hut above it and a shrine on top
		id: 'shrine', name: 'The Shrine',
		x: 810, z: - 370, ax: SHRINE_AX[ 0 ], az: SHRINE_AX[ 1 ],
		ru: 42, rv: 34, far: 120, shelf: [ 80, 3 ],
		outline: [ 40, 8, 14, 2.5, 8.1, 1.9, - 4.4, 6.6 ],
		beach: { sector: [ 0.86, 0.97 ], out: [ 8, 60 ], inland: [ - 18, - 8 ] },
		hills: [ [ 6, 0, 20, 16, 16 ], [ 22, - 10, 12, 10, 6 ] ], hillIn: [ 3, 14 ], ridge: 3.5, heightScale: 1, cliffScale: 1,
		pocket: [ - 62, 0, 16, 9, 2.4 ],
		pads: [ [ - 27, 13, 3, 3, 1.7 ], [ 10, 10, 3, 4, 23.2 ] ], // the hermit's hut above the landing, the shrine on top
		stacks: [ [ 52, 18, 7, 26 ], [ 60, - 16, 6, 21 ], [ 44, 44, 5, 17 ], [ 30, - 46, 6.5, 24 ], [ 72, 4, 4.5, 15 ], [ 8, 52, 5.5, 19 ],
			[ - 4, - 52, 4.5, 14 ], [ 66, 36, 3.5, 11 ], [ 50, - 40, 4, 13 ], [ 84, - 22, 3.2, 9 ], [ 24, 60, 3, 8 ], [ - 22, 48, 3.8, 10 ] ],
		dock: { u0: - 34.5, u1: - 62, v: 0, width: 1.8, deck: 0.9 },
	},
	{
		// the mangrove and root island: a low muddy key on a wide shoal, mangroves round the shore and the
		// Hanging Roots (a giant fig with curtains of aerial roots, the Unreal game's second fishing spot) inland
		id: 'shoal', name: 'Quiet Shoal',
		x: - 760, z: - 740, ax: SHOAL_AX[ 0 ], az: SHOAL_AX[ 1 ],
		ru: 60, rv: 48, far: 140, shelf: [ 120, 2.2 ],
		outline: [ 45, 7, 16, 2, 13.3, 2.8, - 9.1, 5.4 ],
		beach: { ring: true, out: [ 15, 55 ], inland: [ - 200, - 150 ] },
		hills: [ [ 2, 0, 22, 18, 1.4 ], [ 22, - 14, 12, 10, 0.8 ], [ - 8, 20, 10, 8, 0.6 ] ], hillIn: [ 6, 30 ], ridge: 0, heightScale: 0.55, cliffScale: 1,
		pocket: [ - 82, 0, 22, 12, 2.4 ],
		pads: [ [ 0, 2, 6, 5, 3.0 ], [ - 34, 14, 3, 3, 1.15 ] ], stacks: [], // the Hanging Roots fig, the net shed
		dock: { u0: - 40, u1: - 78, v: 0, width: 2.0, deck: 1.05 },
	},
	{
		// the Inverted Isles, far to the south-west: a low sand atoll round a calm lagoon (a seaplane can land in it),
		// a gap through the ring for boats, and above it the suspended upside-down islands (world/islands/InvertedIsles.js)
		id: 'inverted', name: 'The Inverted Isles',
		x: - 670, z: 700, ax: INV_AX[ 0 ], az: INV_AX[ 1 ],
		ru: 150, rv: 125, far: 190, shelf: [ 110, 9 ],
		atoll: [ 112, 90 ], channel: [ 40, 9, - 185, - 75 ], lagoon: 3.2, box: true,
		outline: [ 60, 5, 20, 1.5, 3.7, - 1.2, 7.7, 9.9 ],
		beach: { ring: true, out: [ 100, 200 ], inland: [ - 200, - 150 ] },
		hills: [ [ 0, 100, 20, 14, 1.2 ], [ 40, - 98, 22, 14, 1.4 ], [ 128, 20, 14, 30, 1.0 ], [ - 60, - 104, 16, 10, 0.8 ] ], hillIn: [ 4, 14 ], ridge: 0, heightScale: 1.4, cliffScale: 1,
		pocket: [ - 172, - 30, 16, 10, 2.4 ],
		pads: [], stacks: [],
		dock: { u0: - 136, u1: - 168, v: - 30, width: 2.2, deck: 1.2 },
	},
];

for ( const I of ISLES_5_8 ) {

	ISLETS.push( I );
	ISLETS_BY_ID[ I.id ] = I;

}

refreshIsletStacks();

// footpaths: West Haven's pier foot up through the town to the watchtower, the Shrine's landing to the hut and up
// the steps to the shrine, Quiet Shoal's dock foot to the fig
for ( const [ id, w, pts ] of [
	[ 'haven', 1.0, [ [ - 55, 0 ], [ - 48, 0 ], [ - 38, 2 ], [ - 30, 0 ], [ - 22, - 1 ], [ - 14, 1 ], [ - 6, 0 ], [ 2, 1 ], [ 8, 0 ] ] ],
	[ 'haven', 0.8, [ [ - 40, - 46 ], [ - 41, - 30 ], [ - 42, - 12 ], [ - 42, 12 ], [ - 41, 30 ], [ - 40, 46 ] ] ],
	[ 'shrine', 0.6, [ [ - 34.5, 0 ], [ - 31, 5 ], [ - 28, 10 ] ] ],
	[ 'shrine', 0.5, [ [ - 27, 7 ], [ - 21, 4 ], [ - 15, 2 ], [ - 8, 3 ], [ - 1, 6 ], [ 6, 9 ] ] ],
	[ 'shoal', 0.7, [ [ - 40, 0 ], [ - 31, 4 ], [ - 20, 4 ], [ - 9, 3 ] ] ],
] ) {

	PATHS.push( { w, pts: pts.map( ( [ u, v ] ) => {

		const [ x, z ] = isletWorld( ISLETS_BY_ID[ id ], u, v );
		return [ Math.round( x * 10 ) / 10, Math.round( z * 10 ) / 10 ];

	} ) } );

}
