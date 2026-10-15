import { yawToward } from '../../world/residents/ResidentData.js';

// Wave 24E: the places of a town's life beyond its plan (Towns.js), derived from the plan so every town (and any added later)
// gets them: the quay where a crowd gathers to watch a ship come in (and the bucket chain draws its water), the school the
// children walk to, the evening walk along the front, the festival's dance floor and its watchers, and room at the stalls
// for a second customer behind the one at the counter. Plain data; a spot's yaw is the way the person faces (Player.yaw).
//
//   townPlaces( plan ) -> { quay: [ spot ], school: spot, walk: [ { x, z } ], fest: { x, z, r, dance: [ spot ], watch: [ spot ],
//                          posts: [ { x, z } ] } | null, fronts: { [ stallId ]: [ spot ] } }

const r2 = ( v ) => Math.round( v * 100 ) / 100;
const S = ( x, z, yaw ) => ( { x: r2( x ), z: r2( z ), yaw } );
const forward = ( yaw ) => [ - Math.sin( yaw ), - Math.cos( yaw ) ]; // the way a spot's yaw faces

export function townPlaces( plan ) {

	return { quay: quaySpots( plan ), school: schoolOf( plan ), walk: walkOf( plan ), fest: festOf( plan ), fronts: frontsOf( plan ) };

}

// two rows of five behind each of the first two skiff berths, facing out along the skiffs' way to sea; without skiffs, round
// the fish spots on the pier (Meridian), facing the way they face
function quaySpots( plan ) {

	const out = [];
	for ( const s of ( plan.skiffs || [] ).slice( 0, 2 ) ) {

		const d = s.dock, o = s.out && s.out[ 0 ] || d;
		let sx = o.x - d.x, sz = o.z - d.z;
		const L = Math.hypot( sx, sz ) || 1;
		sx /= L; sz /= L;
		const px = sz, pz = - sx;
		const yaw = yawToward( 0, 0, sx, sz );
		for ( let row = 0; row < 2; row ++ ) for ( let k = - 2; k <= 2; k ++ ) {

			const back = 2.6 + row * 1.25, side = k * 1.15 + ( row ? 0.55 : 0 );
			out.push( S( d.x - sx * back + px * side, d.z - sz * back + pz * side, yaw ) );

		}

	}

	if ( ! out.length ) for ( const f of ( plan.work && plan.work.fish ) || [] ) {

		const [ fx, fz ] = forward( f.yaw );
		for ( let k = - 2; k <= 2; k ++ ) out.push( S( f.x + fz * k * 1.15 - fx * 0.8, f.z - fx * k * 1.15 - fz * 0.8, f.yaw ) );

	}

	return out;

}

// the school: a building the children walk to together (a hall in the middle of the homes; the harbourmaster's office at
// Tidemark, the town's most official door)
function schoolOf( plan ) {

	const H = plan.homes || [];
	return H.find( ( h ) => /office|school|chapel/.test( h.id || '' ) ) || H[ Math.floor( H.length / 2 ) ] || plan.center;

}

// the evening walk: the longest of the town's ways (its streets and the barrow runs), a point every ~10 m
function walkOf( plan ) {

	const all = [ ...( plan.streets || [] ).map( ( s ) => s.pts.map( ( [ x, z ] ) => ( { x, z } ) ) ), ...( ( plan.work && plan.work.barrow ) || [] ).map( ( l ) => l.map( ( p ) => ( { x: p.x, z: p.z } ) ) ) ];
	// each way cut to its longest stretch within the town (a road out to the country is not an evening walk)
	const R = ( plan.radius || 150 ) * 0.8, C = plan.center || { x: 0, z: 0 };
	const ways = all.map( ( w ) => {

		let run = [], best = [];
		for ( const p of w ) {

			if ( Math.hypot( p.x - C.x, p.z - C.z ) <= R ) { run.push( p ); if ( run.length > best.length ) best = run; } else run = [];

		}

		return best;

	} );
	let best = null, bl = 0;
	for ( const w of ways ) {

		let L = 0;
		for ( let i = 1; i < w.length; i ++ ) L += Math.hypot( w[ i ].x - w[ i - 1 ].x, w[ i ].z - w[ i - 1 ].z );
		if ( L > bl ) { bl = L; best = w; }

	}

	if ( ! best ) return [];
	const out = [ best[ 0 ] ];
	for ( let i = 1; i < best.length; i ++ ) {

		const a = best[ i - 1 ], b = best[ i ], L = Math.hypot( b.x - a.x, b.z - a.z ), n = Math.max( 1, Math.round( L / 10 ) );
		for ( let k = 1; k <= n; k ++ ) out.push( { x: r2( a.x + ( b.x - a.x ) * k / n ), z: r2( a.z + ( b.z - a.z ) * k / n ) } );

	}

	return out;

}

// the festival: on the market square (the middle of the stalls: towns with two or more), a ring of dancers and the watchers
// round them; four posts the lantern strings hang from
function festOf( plan ) {

	const st = plan.stalls || [];
	// without a square (one stall or none): round the tavern's patio (Blackwater's fire), a smaller ring
	const ring = st.length >= 2 ? st : ( plan.tavern && plan.tavern.patio && plan.tavern.patio.length >= 5 ? plan.tavern.patio : null );
	if ( ! ring ) return null;
	const k = ring === st ? 1 : 0.72;
	const x = ring.reduce( ( s, q ) => s + q.x, 0 ) / ring.length, z = ring.reduce( ( s, q ) => s + q.z, 0 ) / ring.length;
	const dance = [], watch = [], posts = [];
	for ( let i = 0; i < 14; i ++ ) {

		const a = i / 14 * Math.PI * 2, r = ( i % 2 ? 4.6 : 3.4 ) * k;
		const px = x + Math.cos( a ) * r, pz = z + Math.sin( a ) * r;
		dance.push( S( px, pz, yawToward( px, pz, x, z ) ) );

	}

	for ( let i = 0; i < 16; i ++ ) {

		const a = ( i + 0.5 ) / 16 * Math.PI * 2, r = 7.2 * k;
		const px = x + Math.cos( a ) * r, pz = z + Math.sin( a ) * r;
		watch.push( S( px, pz, yawToward( px, pz, x, z ) ) );

	}

	for ( let i = 0; i < 4; i ++ ) {

		const a = ( i + 0.5 ) / 4 * Math.PI * 2;
		posts.push( { x: r2( x + Math.cos( a ) * 9 * k ), z: r2( z + Math.sin( a ) * 9 * k ) } );

	}

	return { x: r2( x ), z: r2( z ), r: 9 * k, dance, watch, posts };

}

// each stall's customers: the two at its counter, then two waiting a step behind them
function frontsOf( plan ) {

	const out = {};
	for ( const s of plan.stalls || [] ) {

		const f = s.front || [];
		out[ s.id ] = [ ...f, ...f.map( ( q ) => { const [ fx, fz ] = forward( q.yaw ); return S( q.x - fx * 1.15, q.z - fz * 1.15, q.yaw ); } ) ];

	}

	return out;

}

// a list of spots moved onto free ground of the grid (nearest free cell within `r` m); spots with none are dropped
export function onFreeGround( grid, list, r = 3 ) {

	if ( ! grid || ! grid.ready ) return list;
	const out = [];
	for ( const q of list ) {

		const f = grid.nearestFree( q.x, q.z, r );
		if ( f && ! out.some( ( o ) => Math.hypot( o.x - f.x, o.z - f.z ) < 0.7 ) ) out.push( { ...q, x: f.x, z: f.z } );

	}

	return out;

}
