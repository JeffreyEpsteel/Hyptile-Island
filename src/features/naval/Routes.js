// Sea lanes of the naval feature (world metres, y up, +z south; WorldLayout.js and TerrainData.js are the
// ground truth: test/feature-naval.mjs checks every leg against the heightmap).
//
// MERCHANT_ROUTE: the trading lane between the home harbour and Pons Cove. The pier head (WORLD.boatDock) is
// too shallow for a 16 m trawler, so she lies at the harbour anchorage 45 m off it (5.9 m of water) and at the
// Pons roads 75 m off the cove's dock (the dock pocket itself is 1-2 m deep). The lane bends through (100, 230)
// and (150, 500): the straight line would run through the east sea stacks (298, 252) and the shoals around them.
//
// PATROLS: closed loops in the deep water south of the island (z > 380, 5+ m deep over the whole leg and
// 20 m to either side), clear of both ports. SAFE_ZONES: pirates will not fight inside them.

import { WORLD } from '../../world/WorldLayout.js';
import { dist2 } from './util.js';

export const HARBOUR_ANCHORAGE = [ 80, 80 ];
export const PONS_ROADS = [ 452, 452 ];

export const MERCHANT_ROUTE = [ HARBOUR_ANCHORAGE, [ 100, 230 ], [ 150, 500 ], PONS_ROADS ];

export const PATROLS = [
	[ [ - 260, 380 ], [ - 60, 560 ], [ 160, 650 ], [ 60, 430 ] ],
	[ [ 240, 430 ], [ 330, 620 ], [ 120, 700 ], [ - 120, 640 ], [ - 300, 520 ], [ 0, 420 ] ],
	[ [ - 380, 560 ], [ - 200, 720 ], [ 100, 560 ], [ 300, 500 ], [ 200, 380 ], [ - 100, 380 ] ],
	[ [ 350, 700 ], [ 150, 600 ], [ - 50, 700 ], [ - 300, 650 ], [ - 150, 480 ], [ 60, 520 ] ],
];

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
