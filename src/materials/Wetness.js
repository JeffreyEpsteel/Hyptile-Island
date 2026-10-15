import { G } from '../engine/render/Frame.js';

// Wave 24D: how wet the world is from rain (G.wetness -> frame.wetness, read by every scene material's surface detail:
// materials/Materials.js). Surfaces soak quickly once it rains and dry slowly after it stops (sun and wind dry faster).
//
//   updateWetness( dt, rain, { sun = 0.5, wind = 5 } )   once per frame (the weather feature: rain 0..1)
//   stepWetness( w, rain, dt, sun, wind ) -> w          the same, pure (tests)

export const WETNESS = {
	soak: 1 / 25, // per s at full rain: a downpour soaks the world in ~25 s, a drizzle never fully
	dry: 1 / 240, // per s in still, overcast air: ~4 min to dry
	drySun: 2.5, // full sun dries this many times faster
	dryWind: 0.06, // and each m/s of wind adds this fraction
};

export function stepWetness( w, rain, dt, sun = 0.5, wind = 5 ) {

	const W = Number.isFinite( w ) ? Math.min( 1, Math.max( 0, w ) ) : 0;
	const r = Number.isFinite( rain ) ? Math.min( 1, Math.max( 0, rain ) ) : 0;
	const t = Number.isFinite( dt ) ? Math.min( 1, Math.max( 0, dt ) ) : 0;
	// rain drives it toward a level that grows with the rain (a drizzle leaves things damp, not running)
	const target = Math.min( 1, r * 1.6 );
	if ( r > 0.02 && W < target ) return Math.min( target, W + ( target - W ) * ( 1 - Math.exp( - t * WETNESS.soak * ( 1 + r * 3 ) ) ) + t * WETNESS.soak * r * 0.25 );
	const k = WETNESS.dry * ( 1 + WETNESS.drySun * Math.min( 1, Math.max( 0, sun ) ) ) * ( 1 + WETNESS.dryWind * Math.max( 0, wind || 0 ) );
	return Math.max( r > 0.02 ? Math.min( W, target ) : 0, W - t * k );

}

export function updateWetness( dt, rain, { sun = 0.5, wind = 5 } = {} ) {

	if ( ! G.wetness ) return 0;
	G.wetness.value = stepWetness( G.wetness.value, rain, dt, sun, wind );
	return G.wetness.value;

}
