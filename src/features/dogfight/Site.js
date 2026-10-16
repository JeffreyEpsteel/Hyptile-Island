// Where the warbirds stand (wave 26A): a dispersal line beside the runway at each airstrip (Tidemark, Meridian:
// WORLD.<island>.airstrip, read each time), clear of the seaplane feature's pad, hangar and courtesy stands, on the graded
// shoulder (the slots' ground is levelled flat by the strips themselves). Each airframe has its slot, nosed toward the
// runway at an angle; the dispersal tent (the sales and crew desk) stands at the line's head.
//
//   stripOf( world, name ) -> strip | null    lineSlots( strip ) -> { [ id ]: { x, z, heading, door: { x, z } } }   deskAt( strip )
//   nearestStrip( world, x, z ) -> { name, strip, dist }   buildDesk( strip, groundAt ) -> merged geometry (a tent, a table, drums)

import { WORLD } from '../../world/WorldLayout.js';
import { WARBIRD_IDS, WARBIRDS, STRIPS } from './Warbirds.js';
import { prepare, mergePrepared, box, cylinder, mat4 } from '../../world/boat/GeoKit.js';
import { PAT } from '../../game/GameMaterials.js';

// per airframe (WARBIRD_IDS order): metres along the runway from its centre (the take-off direction +), and off its
// centreline (the side away from the seaplane's pad: +)
export const LINE = {
	along: [ - 138, - 116, - 94, - 64, - 26, 20 ],
	perp: [ 19.5, 19.5, 19.5, 20.5, 21, 22 ],
	desk: [ - 162, 26 ],
	nose: 0.65, // rad the noses point off the runway's line, toward it
	side: { meridian: 1 }, // Meridian: the north apron (the courtesy stands take the south one)
	// metres the line moves toward the runway (Tidemark: onto the graded shoulder, whose edge was the old line, in the
	// grass: world/islands/town/Vegetation.townClear also keeps the meadow off the line's strip, wave 27B)
	inset: { tidemark: 3 },
};

export function stripOf( world = WORLD, name ) {

	const s = world && world[ name ] && world[ name ].airstrip;
	return s && [ s.x, s.z, s.y, s.heading ].every( Number.isFinite ) ? { ...s, name } : null;

}

export function strips( world = WORLD ) {

	return STRIPS.map( ( n ) => stripOf( world, n ) ).filter( Boolean );

}

// a point on the strip's frame: along the take-off direction, off the centreline (+ to the line's side)
export function stripPoint( strip, along, perp ) {

	const h = strip.heading, dx = Math.sin( h ), dz = Math.cos( h ), px = Math.cos( h ), pz = - Math.sin( h );
	// the line goes on the side away from the pad (the Kestrel's / the courtesy aircraft's)
	const side = LINE.side[ strip.name ] ?? ( strip.pad ? ( ( strip.pad.x - strip.x ) * px + ( strip.pad.z - strip.z ) * pz > 0 ? - 1 : 1 ) : 1 );
	return { x: strip.x + dx * along + px * perp * side, z: strip.z + dz * along + pz * perp * side, side };

}

export function lineSlots( strip ) {

	const out = {};
	if ( ! strip ) return out;
	const h = strip.heading;
	WARBIRD_IDS.forEach( ( id, i ) => {

		const p = stripPoint( strip, LINE.along[ i ], LINE.perp[ i ] - ( LINE.inset[ strip.name ] ?? 0 ) );
		// the nose toward the runway and its take-off end
		const heading = h - p.side * LINE.nose;
		const W = WARBIRDS[ id ];
		// the door: the left side of the cockpit (the model's +X), on the ground
		const dx = Math.cos( heading ), dz = - Math.sin( heading );
		const e = W.seats[ 0 ].eye;
		const fx = Math.sin( heading ), fz = Math.cos( heading );
		const door = { x: p.x + dx * ( e[ 0 ] + 2.2 ) + fx * e[ 2 ], z: p.z + dz * ( e[ 0 ] + 2.2 ) + fz * e[ 2 ] };
		out[ id ] = { x: p.x, z: p.z, heading, door };

	} );
	return out;

}

export function deskAt( strip ) {

	if ( ! strip ) return null;
	const p = stripPoint( strip, LINE.desk[ 0 ], LINE.desk[ 1 ] - ( LINE.inset[ strip.name ] ?? 0 ) );
	return { x: p.x, z: p.z, heading: strip.heading };

}

export function nearestStrip( world = WORLD, x, z ) {

	let best = null;
	for ( const s of strips( world ) ) {

		const d = Math.hypot( s.x - x, s.z - z );
		if ( ! best || d < best.dist ) best = { name: s.name, strip: s, dist: d };

	}

	return best;

}

// the dispersal tent: a canvas fly on poles, a trestle table with a field radio, fuel drums and ammunition boxes
export function buildDesk( desk, y = 0 ) {

	const P = [];
	const c = Math.cos( desk.heading ), sn = Math.sin( desk.heading );
	const at = ( lx, ly, lz, rx = 0, rz = 0 ) => mat4( desk.x + lx * c + lz * sn, y + ly, desk.z - lx * sn + lz * c, rx, desk.heading, rz, 1, 1, 1, 'YXZ' );
	const CANVAS = { color: 0x6f6b4c, rough: 0.95, pattern: PAT.cloth }, POLE = { color: 0x4a3a28, rough: 0.8, pattern: PAT.wood };
	// the fly: two sloping sheets over a ridge
	P.push( prepare( box( 6.2, 0.05, 2.5 ), { ...CANVAS, matrix: at( 0, 2.35, 1.05, 0.42 ) } ) );
	P.push( prepare( box( 6.2, 0.05, 2.5 ), { ...CANVAS, matrix: at( 0, 2.35, - 1.05, - 0.42 ) } ) );
	for ( const sx of [ - 3, 3 ] ) for ( const sz of [ - 2.1, 0, 2.1 ] ) P.push( prepare( cylinder( 0.05, 0.05, sz ? 1.9 : 2.85, 6 ), { ...POLE, matrix: at( sx, sz ? 0.95 : 1.42, sz ) } ) );
	// the table and the radio
	P.push( prepare( box( 2.2, 0.06, 0.9 ), { ...POLE, matrix: at( 0, 0.8, 0 ) } ) );
	for ( const sx of [ - 0.95, 0.95 ] ) P.push( prepare( box( 0.06, 0.78, 0.8 ), { ...POLE, matrix: at( sx, 0.39, 0 ) } ) );
	P.push( prepare( box( 0.5, 0.32, 0.3 ), { color: 0x3b4436, rough: 0.6, matrix: at( - 0.5, 0.99, 0 ) } ) );
	P.push( prepare( box( 0.42, 0.02, 0.3 ), { color: 0xe8e0c8, rough: 0.9, matrix: at( 0.45, 0.84, 0.05 ) } ) );
	// drums and ammunition boxes
	for ( let k = 0; k < 3; k ++ ) P.push( prepare( cylinder( 0.3, 0.3, 0.9, 12 ), { color: k === 1 ? 0x2f5f8a : 0x7a2a22, rough: 0.6, metal: 0.4, pattern: PAT.rusty, matrix: at( 3.9 + k * 0.65, 0.45, 1.6 ) } ) );
	for ( let k = 0; k < 4; k ++ ) P.push( prepare( box( 0.75, 0.32, 0.4 ), { color: 0x51573a, rough: 0.85, pattern: PAT.wood, matrix: at( - 3.9, 0.16 + ( k >> 1 ) * 0.33, 1.2 + ( k & 1 ) * 0.45 ) } ) );
	return mergePrepared( P );

}
