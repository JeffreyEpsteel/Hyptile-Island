// Sea lanes of the naval feature (world metres, y up, +z south; WorldLayout.js and TerrainData.js are the
// ground truth: test/feature-naval.mjs checks every leg against the heightmap).
//
// MERCHANT_ROUTE: the trading lane between the home harbour and Pons Cove. The pier head (WORLD.boatDock) is
// too shallow for a 16 m trawler, so she lies at the harbour anchorage 45 m off it (5.9 m of water) and at the
// Pons roads 75 m off the cove's dock (the dock pocket itself is 1-2 m deep). The lane bends through (100, 230)
// and (150, 500): the straight line would run through the east sea stacks (298, 252) and the shoals around them.
//
// PATROLS: closed loops in deep water (5+ m deep over the whole leg and 20 m to either side), clear of both ports:
// one across the heightmap's south band between home and Blackwater, the rest round Blackwater on its own terrain tile.
// SAFE_ZONES: pirates will not fight inside them.

import { WORLD } from '../../world/WorldLayout.js';
import { dist2 } from './util.js';

export const HARBOUR_ANCHORAGE = [ 80, 80 ];
export const PONS_ROADS = [ 452, 452 ];

export const MERCHANT_ROUTE = [ HARBOUR_ANCHORAGE, [ 100, 230 ], [ 150, 500 ], PONS_ROADS ];

// Lane 0 patrols the heightmap's south band (z 380-930, between the home island and Blackwater, 300+ m clear of the
// Inverted Isles and Pons): pirates still meet the player on the way south. The others circle Blackwater (wave 14D: on its
// own terrain tile at WORLD.blackwater.center) in its deep water, as offsets from the island's centre so they move with
// it: north across the approach from home, east past the entrance, south, and west under the summit.
const BW = WORLD.blackwater.center;
const round = ( pts ) => pts.map( ( [ dx, dz ] ) => [ Math.round( BW.x + dx ), Math.round( BW.z + dz ) ] );
export const SOUTH_BAND_PATROL = [ [ - 260, 380 ], [ 200, 440 ], [ 280, 700 ], [ 80, 930 ], [ - 240, 870 ], [ - 160, 620 ] ];
export const BLACKWATER_PATROLS = [
	SOUTH_BAND_PATROL,
	round( [ [ - 205, - 308 ], [ 255, - 248 ], [ 115, - 293 ], [ - 5, - 263 ] ] ),
	round( [ [ 295, - 258 ], [ 385, - 128 ], [ 375, 72 ], [ 215, 262 ], [ 355, 212 ], [ 435, - 48 ], [ 395, - 218 ] ] ),
	round( [ [ - 275, 242 ], [ - 5, 302 ], [ 295, 262 ], [ 15, 262 ] ] ),
	round( [ [ - 300, - 230 ], [ - 390, - 20 ], [ - 330, 230 ], [ - 420, 90 ] ] ),
];

export const PATROLS = BLACKWATER_PATROLS;

// pirates break off and merchants are safe inside these (the harbour and the cove)
export const SAFE_ZONES = [
	{ id: 'harbour', x: WORLD.boatDock.position.x, z: WORLD.boatDock.position.z, r: 140 },
	{ id: 'pons', x: WORLD.pons.dock.position.x, z: WORLD.pons.dock.position.z, r: 140 },
];

export function inSafeZone( x, z, zones = SAFE_ZONES ) {

	for ( const s of zones ) if ( dist2( x, z, s.x, s.z ) < s.r ) return s;
	return null;

}

// index of the point of a route nearest to (x, z)
export function nearestIndex( points, x, z ) {

	let best = 0, bd = Infinity;
	for ( let i = 0; i < points.length; i ++ ) {

		const d = dist2( x, z, points[ i ][ 0 ], points[ i ][ 1 ] );
		if ( d < bd ) { bd = d; best = i; }

	}

	return best;

}

// the legs of a route as [ a, b ] pairs (a loop closes back to the first point)
export function legs( points, loop = false ) {

	const out = [];
	for ( let i = 0; i < points.length - 1; i ++ ) out.push( [ points[ i ], points[ i + 1 ] ] );
	if ( loop && points.length > 2 ) out.push( [ points[ points.length - 1 ], points[ 0 ] ] );
	return out;

}

export function routeLength( points, loop = false ) {

	let l = 0;
	for ( const [ a, b ] of legs( points, loop ) ) l += dist2( a[ 0 ], a[ 1 ], b[ 0 ], b[ 1 ] );
	return l;

}

// a route cursor: { points, index, dir, loop }. next() advances after reaching the current point and returns
// 'end' when a ping-pong route turned around at an end, else null.
export function makeCursor( points, { loop = false, index = 0, dir = 1 } = {} ) {

	return { points, loop, index, dir };

}

export function advance( cur ) {

	const n = cur.points.length;
	if ( cur.loop ) {

		cur.index = ( cur.index + 1 ) % n;
		return null;

	}

	let next = cur.index + cur.dir;
	let ev = null;
	if ( next >= n || next < 0 ) {

		cur.dir = - cur.dir;
		next = cur.index + cur.dir;
		ev = 'end';

	}

	cur.index = next;
	return ev;

}
