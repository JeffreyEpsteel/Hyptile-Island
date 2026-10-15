// Hull planforms for collisions (wave 24B): the outline of a hull on the water plane as a convex polygon in the boat frame
// (+X port, +Z forward, metres), taken from whatever model is actually drawn, so a restyled GLB collides as it looks.
//
//   shapeFromObject( root, { yLo, yHi, withRoot } ) -> shape | null   every visible mesh under root (a ShipVisual's group, a
//                                         boat model's group), vertices between yLo and yHi in root's frame (its own pose left
//                                         out, its scale kept; withRoot: root's own local matrix applied too, for a hull pivot
//                                         inside a boat's group): the waterline-to-sheer band, so masts, yards and booms above
//                                         it do not count
//   shapeFromLines( lines )               the sheer line of a HullLines / SimpleHullLines body (the player's procedural hulls)
//   shapeFromDims( length, beam )         a ship-like planform (fine bow, a transom at 62 % of the beam) when nothing is loaded
//   makeShape( flat [ x0, z0, x1, z1, ... ] ) -> shape   convex hull of the points, simplified to SHAPE.maxVerts
//   perimeter( shape, spacing ) -> [ [ x, z ], ... ]     points along the outline (the boat's probes against piers and rocks)
//   halfBreadthAt( shape, z ) -> m        the outline's half breadth at z (0 past the ends)
//   inside( shape, lx, lz, margin ) -> signed distance (< 0 inside) to the outline (local frame)
//
// A shape: { poly: Float64Array [ x, z ]* counter-clockwise seen from above with +Z up the page, n (vertices),
// nrm: Float64Array outward edge normals (edge i runs from vertex i to i + 1), hx / hz (half extents about the origin, max |x|
// and max |z|), zBow, zAft, r (bounding radius about the origin), area (m^2), source ('mesh' | 'lines' | 'dims') }.

export const SHAPE = {
	maxVerts: 20, // polygon vertices kept (a ship's outline to ~5 cm; the SAT tests 2 x 20 axes a pair)
	minPoints: 12, // fewer vertices in the band: the model is not a hull (or not loaded), fall back
};

// Andrew's monotone chain on flat x / z pairs -> CCW hull (flat array), collinear points dropped
export function convexHull2( pts ) {

	const n = pts.length >> 1;
	if ( n < 3 ) return pts.slice();
	const idx = new Array( n );
	for ( let i = 0; i < n; i ++ ) idx[ i ] = i;
	idx.sort( ( a, b ) => pts[ 2 * a ] - pts[ 2 * b ] || pts[ 2 * a + 1 ] - pts[ 2 * b + 1 ] );
	const X = ( i ) => pts[ 2 * i ], Z = ( i ) => pts[ 2 * i + 1 ];
	const cross = ( o, a, b ) => ( X( a ) - X( o ) ) * ( Z( b ) - Z( o ) ) - ( Z( a ) - Z( o ) ) * ( X( b ) - X( o ) );
	const h = [];
	for ( const i of idx ) {

		while ( h.length >= 2 && cross( h[ h.length - 2 ], h[ h.length - 1 ], i ) <= 1e-12 ) h.pop();
		h.push( i );

	}

	const lower = h.length + 1;
	for ( let k = n - 2; k >= 0; k -- ) {

		const i = idx[ k ];
		while ( h.length >= lower && cross( h[ h.length - 2 ], h[ h.length - 1 ], i ) <= 1e-12 ) h.pop();
		h.push( i );

	}

	h.pop();
	const out = [];
	for ( const i of h ) out.push( X( i ), Z( i ) );
	return out;

}

// drop the vertex that cuts off the least area until `max` are left (Visvalingam; stays convex, inside the original)
export function simplifyConvex( poly, max = SHAPE.maxVerts ) {

	const p = poly.slice();
	while ( p.length / 2 > max ) {

		const n = p.length / 2;
		let best = - 1, area = Infinity;
		for ( let i = 0; i < n; i ++ ) {

			const a = ( i + n - 1 ) % n, b = ( i + 1 ) % n;
			const ar = Math.abs( ( p[ 2 * i ] - p[ 2 * a ] ) * ( p[ 2 * b + 1 ] - p[ 2 * a + 1 ] ) - ( p[ 2 * i + 1 ] - p[ 2 * a + 1 ] ) * ( p[ 2 * b ] - p[ 2 * a ] ) );
			if ( ar < area ) { area = ar; best = i; }

		}

		p.splice( 2 * best, 2 );

	}

	return p;

}

export function makeShape( points, { source = 'points', max = SHAPE.maxVerts } = {} ) {

	const hull = simplifyConvex( convexHull2( points ), max );
	const n = hull.length / 2;
	if ( n < 3 ) return null;
	const poly = new Float64Array( hull ), nrm = new Float64Array( 2 * n );
	let hx = 0, hz = 0, r = 0, zBow = - Infinity, zAft = Infinity, area = 0;
	for ( let i = 0; i < n; i ++ ) {

		const x = poly[ 2 * i ], z = poly[ 2 * i + 1 ], j = ( i + 1 ) % n;
		const dx = poly[ 2 * j ] - x, dz = poly[ 2 * j + 1 ] - z, l = Math.hypot( dx, dz ) || 1;
		nrm[ 2 * i ] = dz / l; // outward for a CCW outline
		nrm[ 2 * i + 1 ] = - dx / l;
		hx = Math.max( hx, Math.abs( x ) );
		hz = Math.max( hz, Math.abs( z ) );
		r = Math.max( r, Math.hypot( x, z ) );
		zBow = Math.max( zBow, z );
		zAft = Math.min( zAft, z );
		area += x * poly[ 2 * j + 1 ] - z * poly[ 2 * j ];

	}

	return { poly, nrm, n, hx, hz, r, zBow, zAft, area: area / 2, source };

}

// A ship-like outline from the dimensions: the parallel middle body, a fine bow that closes to the stem and a transom.
export function shapeFromDims( length, beam, { transom = 0.62, entry = 0.18, run = 0.38 } = {} ) {

	const L = Math.max( 0.5, length ) / 2, B = Math.max( 0.3, beam ) / 2;
	const pts = [];
	for ( let k = 0; k <= 24; k ++ ) {

		const u = - 1 + 2 * k / 24; // aft -> bow
		let f = 1;
		if ( u > entry ) f = Math.max( 0.03, 1 - ( ( u - entry ) / ( 1 - entry ) ) ** 1.7 );
		else if ( u < - run ) f = 1 - ( 1 - transom ) * ( ( - u - run ) / ( 1 - run ) ) ** 2;
		pts.push( B * f, u * L, - B * f, u * L );

	}

	return makeShape( pts, { source: 'dims' } );

}

// the sheer line (the widest waterline-to-deck line of the boats this game builds) of a hull body
export function shapeFromLines( lines ) {

	if ( ! lines || typeof lines.sheerX !== 'function' || typeof lines.sheerZ !== 'function' ) return null;
	const pts = [];
	for ( let k = 0; k <= 32; k ++ ) {

		const t = k / 32, x = Math.abs( lines.sheerX( t ) ), z = lines.sheerZ( t );
		if ( Number.isFinite( x ) && Number.isFinite( z ) ) pts.push( x, z, - x, z );

	}

	// (the transom and the stem: the line's ends)
	if ( Number.isFinite( lines.zBow ) ) pts.push( 0, lines.zBow );
	return pts.length >= 6 ? makeShape( pts, { source: 'lines' } ) : null;

}

// every visible mesh under root, in root's frame (its own pose left out, its scale kept), vertices in the yLo..yHi band
export function shapeFromObject( root, { yLo = - 0.6, yHi = 3, max = SHAPE.maxVerts, withRoot = false } = {} ) {

	if ( ! root || typeof root.traverse !== 'function' ) return null;
	const pts = [];
	const own = withRoot || ! root.scale;
	const sx = own ? 1 : root.scale.x, sy = own ? 1 : root.scale.y, sz = own ? 1 : root.scale.z;
	if ( withRoot && typeof root.updateMatrix === 'function' ) root.updateMatrix();
	root.traverse( ( o ) => {

		if ( o === root || ! o.geometry || ! o.geometry.attributes ) return;
		const pos = o.geometry.attributes.position;
		if ( ! pos || ! pos.array ) return;
		// the chain of local matrices up to (not including) root; an invisible ancestor hides the mesh
		const chain = [];
		for ( let p = o; p && p !== root; p = p.parent ) {

			if ( p.visible === false ) return;
			if ( typeof p.updateMatrix === 'function' ) p.updateMatrix();
			chain.push( p.matrix && p.matrix.elements );

		}

		if ( withRoot ) chain.push( root.matrix && root.matrix.elements );

		const a = pos.array, stride = pos.itemSize || 3, count = pos.count ?? Math.floor( a.length / stride );
		for ( let i = 0; i < count; i ++ ) {

			let x = a[ i * stride ], y = a[ i * stride + 1 ], z = a[ i * stride + 2 ];
			for ( const e of chain ) {

				if ( ! e ) continue;
				const X = e[ 0 ] * x + e[ 4 ] * y + e[ 8 ] * z + e[ 12 ];
				const Y = e[ 1 ] * x + e[ 5 ] * y + e[ 9 ] * z + e[ 13 ];
				const Z = e[ 2 ] * x + e[ 6 ] * y + e[ 10 ] * z + e[ 14 ];
				x = X; y = Y; z = Z;

			}

			y *= sy;
			if ( y < yLo || y > yHi ) continue;
			pts.push( x * sx, z * sz );

		}

	} );
	if ( pts.length / 2 < SHAPE.minPoints ) return null;
	return makeShape( pts, { source: 'mesh', max } );

}

// half breadth of the outline at z (the widest crossing of the polygon at that station; 0 outside it)
export function halfBreadthAt( shape, z ) {

	const p = shape.poly, n = shape.n;
	let w = 0;
	for ( let i = 0; i < n; i ++ ) {

		const j = ( i + 1 ) % n;
		const z0 = p[ 2 * i + 1 ], z1 = p[ 2 * j + 1 ];
		if ( ( z < Math.min( z0, z1 ) ) || ( z > Math.max( z0, z1 ) ) || z0 === z1 ) continue;
		const x = p[ 2 * i ] + ( p[ 2 * j ] - p[ 2 * i ] ) * ( z - z0 ) / ( z1 - z0 );
		w = Math.max( w, Math.abs( x ) );

	}

	return w;

}

// signed distance (m) from a local point to the outline: < 0 inside (the deepest face's), > 0 outside (a lower bound
// past a corner)
export function inside( shape, lx, lz ) {

	const p = shape.poly, nr = shape.nrm;
	let d = - Infinity;
	for ( let i = 0; i < shape.n; i ++ ) d = Math.max( d, ( lx - p[ 2 * i ] ) * nr[ 2 * i ] + ( lz - p[ 2 * i + 1 ] ) * nr[ 2 * i + 1 ] );
	return d;

}

// points every `spacing` m along the outline (each vertex too), with the outward normal of their edge
export function perimeter( shape, spacing = 0.5 ) {

	const out = [], p = shape.poly, n = shape.n;
	for ( let i = 0; i < n; i ++ ) {

		const j = ( i + 1 ) % n;
		const x0 = p[ 2 * i ], z0 = p[ 2 * i + 1 ], x1 = p[ 2 * j ], z1 = p[ 2 * j + 1 ];
		const k = Math.max( 1, Math.ceil( Math.hypot( x1 - x0, z1 - z0 ) / spacing ) );
		for ( let s = 0; s < k; s ++ ) out.push( [ x0 + ( x1 - x0 ) * s / k, z0 + ( z1 - z0 ) * s / k, shape.nrm[ 2 * i ], shape.nrm[ 2 * i + 1 ] ] );

	}

	return out;

}

// ---- placed outlines and the tests on them (Collisions.js for hull against hull, BoatController for hull against the world)

// the outline in the world: out = { n, x: Float64Array, z, nx, nz } (vertices and outward edge normals), yaw about +Y
// (boat frame: port ( cos, -sin ), forward ( sin, cos ), as Ship.toWorld)
export function placeShape( shape, cx, cz, yaw, out = null ) {

	const n = shape.n;
	if ( ! out || out.x.length < n ) out = { n, x: new Float64Array( n ), z: new Float64Array( n ), nx: new Float64Array( n ), nz: new Float64Array( n ) };
	out.n = n;
	const s = Math.sin( yaw ), c = Math.cos( yaw ), p = shape.poly, r = shape.nrm;
	for ( let i = 0; i < n; i ++ ) {

		const lx = p[ 2 * i ], lz = p[ 2 * i + 1 ];
		out.x[ i ] = cx + lx * c + lz * s;
		out.z[ i ] = cz - lx * s + lz * c;
		const ax = r[ 2 * i ], az = r[ 2 * i + 1 ];
		out.nx[ i ] = ax * c + az * s;
		out.nz[ i ] = - ax * s + az * c;

	}

	return out;

}

// a box collider's footprint (Colliders: centre, half x / z, cos / sin of its yaw) as a placed outline
export function placeBox( b, out = null ) {

	if ( ! out ) out = { n: 4, x: new Float64Array( 4 ), z: new Float64Array( 4 ), nx: new Float64Array( 4 ), nz: new Float64Array( 4 ) };
	out.n = 4;
	// Colliders' local frame: lx = dx cos - dz sin, lz = dx sin + dz cos; back to the world: ( lx cos + lz sin, - lx sin + lz cos )
	const c = b.cos, s = b.sin, hx = b.half.x, hz = b.half.z;
	const L = [ [ hx, hz ], [ - hx, hz ], [ - hx, - hz ], [ hx, - hz ] ]; // CCW in the box frame
	const N = [ [ 0, 1 ], [ - 1, 0 ], [ 0, - 1 ], [ 1, 0 ] ];
	for ( let i = 0; i < 4; i ++ ) {

		const [ lx, lz ] = L[ i ], [ ax, az ] = N[ i ];
		out.x[ i ] = b.center.x + lx * c + lz * s;
		out.z[ i ] = b.center.z - lx * s + lz * c;
		out.nx[ i ] = ax * c + az * s;
		out.nz[ i ] = - ax * s + az * c;

	}

	return out;

}

// SAT of two placed convex outlines: out.sep (the largest gap over every edge normal, < 0: overlapping by depth = -sep),
// out.nx / nz (unit, from A towards B), out.hit, out.depth, out.ref (0: the axis is A's edge, 1: B's), out.edge
export function polySat( A, B, out = {} ) {

	out.sep = - Infinity;
	out.nx = 1; out.nz = 0; out.ref = 0; out.edge = 0;
	for ( let i = 0; i < A.n; i ++ ) {

		// A's face i: the least projection of B on its normal, from the face
		const nx = A.nx[ i ], nz = A.nz[ i ], d0 = A.x[ i ] * nx + A.z[ i ] * nz;
		let m = Infinity;
		for ( let j = 0; j < B.n; j ++ ) { const d = B.x[ j ] * nx + B.z[ j ] * nz - d0; if ( d < m ) m = d; }
		if ( m > out.sep ) { out.sep = m; out.nx = nx; out.nz = nz; out.ref = 0; out.edge = i; }

	}

	for ( let j = 0; j < B.n; j ++ ) {

		const nx = B.nx[ j ], nz = B.nz[ j ], d0 = B.x[ j ] * nx + B.z[ j ] * nz;
		let m = Infinity;
		for ( let i = 0; i < A.n; i ++ ) { const d = A.x[ i ] * nx + A.z[ i ] * nz - d0; if ( d < m ) m = d; }
		if ( m > out.sep ) { out.sep = m; out.nx = - nx; out.nz = - nz; out.ref = 1; out.edge = j; }

	}

	out.hit = out.sep < 0;
	out.depth = out.hit ? - out.sep : 0;
	return out;

}

// overlap of two placed outlines along a fixed unit axis ( nx, nz ) from A to B: max of A minus min of B (> 0: overlapping;
// a hull that went right through reads deeper than its own width, so it is pushed back the way it came)
export function overlapAlong( A, B, nx, nz ) {

	let a1 = - Infinity, b0 = Infinity;
	for ( let i = 0; i < A.n; i ++ ) a1 = Math.max( a1, A.x[ i ] * nx + A.z[ i ] * nz );
	for ( let j = 0; j < B.n; j ++ ) b0 = Math.min( b0, B.x[ j ] * nx + B.z[ j ] * nz );
	return a1 - b0;

}

// the contact of two overlapping outlines along n (A -> B): the incident vertices (the other outline's, within tol of the
// deepest) that lie within the reference face's span, moved halfway back to the face
export function polyContact( A, B, sat, out = {} ) {

	const ref = sat.ref === 0 ? A : B, inc = sat.ref === 0 ? B : A;
	const nx = sat.ref === 0 ? sat.nx : - sat.nx, nz = sat.ref === 0 ? sat.nz : - sat.nz; // out of the reference outline
	const i = sat.edge, j = ( i + 1 ) % ref.n;
	const d0 = ref.x[ i ] * nx + ref.z[ i ] * nz;
	const tx = - nz, tz = nx;
	const t0 = ref.x[ i ] * tx + ref.z[ i ] * tz, t1 = ref.x[ j ] * tx + ref.z[ j ] * tz;
	const lo = Math.min( t0, t1 ) - 0.05, hi = Math.max( t0, t1 ) + 0.05;
	let m = Infinity;
	for ( let k = 0; k < inc.n; k ++ ) m = Math.min( m, inc.x[ k ] * nx + inc.z[ k ] * nz - d0 );
	let sx = 0, sz = 0, cnt = 0, ax = 0, az = 0, all = 0;
	for ( let k = 0; k < inc.n; k ++ ) {

		const d = inc.x[ k ] * nx + inc.z[ k ] * nz - d0;
		if ( d > m + 0.15 ) continue;
		const px = inc.x[ k ] - nx * d / 2, pz = inc.z[ k ] - nz * d / 2;
		ax += px; az += pz; all ++;
		const t = inc.x[ k ] * tx + inc.z[ k ] * tz;
		if ( t >= lo && t <= hi ) { sx += px; sz += pz; cnt ++; }

	}

	if ( cnt ) { out.x = sx / cnt; out.z = sz / cnt; } else { out.x = ax / all; out.z = az / all; }
	// a face against a face (two sides alongside): the middle of the overlap of their spans on the reference face
	if ( cnt === 0 || cnt > 1 ) {

		let ilo = Infinity, ihi = - Infinity;
		for ( let k = 0; k < inc.n; k ++ ) {

			const d = inc.x[ k ] * nx + inc.z[ k ] * nz - d0;
			if ( d > 0.05 ) continue;
			const t = inc.x[ k ] * tx + inc.z[ k ] * tz;
			ilo = Math.min( ilo, t ); ihi = Math.max( ihi, t );

		}

		const a = Math.max( lo, ilo ), b = Math.min( hi, ihi );
		if ( a <= b ) {

			const tm = ( a + b ) / 2, dm = d0 + m / 2;
			out.x = nx * dm + tx * tm;
			out.z = nz * dm + tz * tm;

		}

	}

	return out;

}

// exact distance from a local point to the outline: { d (< 0 inside), nx, nz (the local unit direction from the outline
// out to the point: the way to push the point out, or the hull away from it) }
export function polyDistance( shape, lx, lz, out = {} ) {

	const p = shape.poly, nr = shape.nrm, n = shape.n;
	let best = - Infinity, bi = 0;
	for ( let i = 0; i < n; i ++ ) {

		const d = ( lx - p[ 2 * i ] ) * nr[ 2 * i ] + ( lz - p[ 2 * i + 1 ] ) * nr[ 2 * i + 1 ];
		if ( d > best ) { best = d; bi = i; }

	}

	if ( best <= 0 ) {

		out.d = best; out.nx = nr[ 2 * bi ]; out.nz = nr[ 2 * bi + 1 ];
		return out;

	}

	// outside: the nearest point on the edges
	let d2 = Infinity, qx = 0, qz = 0;
	for ( let i = 0; i < n; i ++ ) {

		const j = ( i + 1 ) % n;
		const ax = p[ 2 * i ], az = p[ 2 * i + 1 ], ex = p[ 2 * j ] - ax, ez = p[ 2 * j + 1 ] - az;
		const t = Math.max( 0, Math.min( 1, ( ( lx - ax ) * ex + ( lz - az ) * ez ) / ( ex * ex + ez * ez || 1 ) ) );
		const x = ax + ex * t, z = az + ez * t, e2 = ( lx - x ) ** 2 + ( lz - z ) ** 2;
		if ( e2 < d2 ) { d2 = e2; qx = x; qz = z; }

	}

	const d = Math.sqrt( d2 ) || 1e-9;
	out.d = d; out.nx = ( lx - qx ) / d; out.nz = ( lz - qz ) / d;
	return out;

}
