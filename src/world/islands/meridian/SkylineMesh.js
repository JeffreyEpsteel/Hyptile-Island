import { Color } from '../../../engine/index.js';
import { towerForm, rect } from './Skyline.js';

// The skyscrapers' geometry (wave 23A) into a Facades accumulator: each tower's lofts (Skyline.js) with the facade
// material's codes (the windows drawn by the shader from metres along / up the wall), the roofs, the crowns, spires and
// masts, the LED lines that draw the skyline at night, helipads, planted terraces; a broken top at the height where an upper
// section came off (cut), a jagged stump when it fell (stage 3). Far LOD: fewer rings, no parapets, pads or planting.
//
//   towerInto( acc, b, { detail, stage, cut }, ctx ) -> { top, tiers }
//     ctx (from Facades.buildingInto): { STYLE, col, roofCol, aux( seed? ), roofAux, plainAux( code ), seed }

const C = ( hex ) => new Color( hex );
const DARK = C( 0x262422 ), WHITE = C( 0xe9e8e4 ), PAD = C( 0x3a3d40 ), BEACON = new Color( 1, 0.06, 0.03 );
const PARAPET_K = 0.86;
export const STUMP = 9; // m: what stands of a fallen tower (its colliders stop there too)

const hash2 = ( x, z ) => {

	const s = Math.sin( x * 12.9898 + z * 78.233 ) * 43758.5453;
	return s - Math.floor( s );

};
const sub = ( a, b ) => [ a[ 0 ] - b[ 0 ], a[ 1 ] - b[ 1 ], a[ 2 ] - b[ 2 ] ];
const cross = ( a, b ) => [ a[ 1 ] * b[ 2 ] - a[ 2 ] * b[ 1 ], a[ 2 ] * b[ 0 ] - a[ 0 ] * b[ 2 ], a[ 0 ] * b[ 1 ] - a[ 1 ] * b[ 0 ] ];
const norm = ( v ) => { const l = Math.hypot( v[ 0 ], v[ 1 ], v[ 2 ] ) || 1; return [ v[ 0 ] / l, v[ 1 ] / l, v[ 2 ] / l ]; };

// a quad facing n whatever order its corners come in (Acc's front: ( b - a ) x ( c - a ) along the normal)
function face( acc, P, n, uvs, col, aux ) {

	const c = cross( sub( P[ 1 ], P[ 0 ] ), sub( P[ 2 ], P[ 0 ] ) );
	if ( c[ 0 ] * n[ 0 ] + c[ 1 ] * n[ 1 ] + c[ 2 ] * n[ 2 ] < 0 ) { P = [ P[ 0 ], P[ 3 ], P[ 2 ], P[ 1 ] ]; uvs = [ uvs[ 0 ], uvs[ 3 ], uvs[ 2 ], uvs[ 1 ] ]; }
	acc.quad( P[ 0 ], P[ 1 ], P[ 2 ], P[ 3 ], n, uvs, col, aux );

}

const UV4 = [ [ 0, 0 ], [ 1, 0 ], [ 1, 1 ], [ 0, 1 ] ];

// the walls between two rings (one quad per edge), flat or radial normals; u runs on round the ring from u0
function walls( acc, r0, r1, base, col, aux, smooth, cx, cz ) {

	const n = r0.pts.length;
	let u0 = 0, u1 = 0;
	for ( let k = 0; k < n; k ++ ) {

		const j = ( k + 1 ) % n;
		const a = [ r0.pts[ k ][ 0 ], r0.y, r0.pts[ k ][ 1 ] ], b = [ r0.pts[ j ][ 0 ], r0.y, r0.pts[ j ][ 1 ] ];
		const c = [ r1.pts[ j ][ 0 ], r1.y, r1.pts[ j ][ 1 ] ], d = [ r1.pts[ k ][ 0 ], r1.y, r1.pts[ k ][ 1 ] ];
		const L0 = Math.hypot( b[ 0 ] - a[ 0 ], b[ 2 ] - a[ 2 ] ), L1 = Math.hypot( c[ 0 ] - d[ 0 ], c[ 2 ] - d[ 2 ] );
		const uv = [ [ u0, a[ 1 ] - base ], [ u0 + L0, b[ 1 ] - base ], [ u1 + L1, c[ 1 ] - base ], [ u1, d[ 1 ] - base ] ];
		if ( smooth ) {

			const i = acc.count;
			const N = ( p ) => norm( [ p[ 0 ] - cx, 0, p[ 2 ] - cz ] );
			acc._v( a, N( a ), uv[ 0 ][ 0 ], uv[ 0 ][ 1 ], col, aux );
			acc._v( b, N( b ), uv[ 1 ][ 0 ], uv[ 1 ][ 1 ], col, aux );
			acc._v( c, N( c ), uv[ 2 ][ 0 ], uv[ 2 ][ 1 ], col, aux );
			acc._v( d, N( d ), uv[ 3 ][ 0 ], uv[ 3 ][ 1 ], col, aux );
			acc.idx.push( i, i + 1, i + 2, i, i + 2, i + 3 );

		} else {

			const nn = norm( cross( sub( b, a ), sub( d, a ) ) );
			acc.quad( a, b, c, d, nn, uv, col, aux );

		}

		u0 += L0; u1 += L1;

	}

}

// a fan over a ring (up), or under it (down)
function cap( acc, ring, col, aux, down = false ) {

	const n = ring.pts.length, i0 = acc.count;
	let cx = 0, cz = 0;
	for ( const [ x, z ] of ring.pts ) { cx += x / n; cz += z / n; }
	const N = down ? [ 0, - 1, 0 ] : [ 0, 1, 0 ];
	acc._v( [ cx, ring.y, cz ], N, cx, cz, col, aux );
	for ( const [ x, z ] of ring.pts ) acc._v( [ x, ring.y, z ], N, x, z, col, aux );
	for ( let k = 0; k < n; k ++ ) {

		const a = i0 + 1 + k, b = i0 + 1 + ( k + 1 ) % n;
		if ( down ) acc.idx.push( i0, b, a ); else acc.idx.push( i0, a, b );

	}

}

// a band of quads round an outline from y up hgt, out off the wall (LED lines, parapets)
function band( acc, pts, y, hgt, out, col, aux, inner = false ) {

	const n = pts.length;
	for ( let k = 0; k < n; k ++ ) {

		const [ px, pz ] = pts[ k ], [ qx, qz ] = pts[ ( k + 1 ) % n ];
		const L = Math.hypot( qx - px, qz - pz );
		if ( L < 1e-3 ) continue;
		const nx = - ( qz - pz ) / L, nz = ( qx - px ) / L;
		if ( inner ) acc.wall( qx - nx * out, qz - nz * out, px - nx * out, pz - nz * out, y, y + hgt, y, col, aux );
		else acc.wall( px + nx * out, pz + nz * out, qx + nx * out, qz + nz * out, y, y + hgt, y, col, aux );

	}

}

// the ring of a loft clipped at y (rings above it dropped, the crossing interpolated); null when the part starts above y
function clipRings( rings, y ) {

	if ( rings[ 0 ].y >= y - 0.05 ) return null;
	const out = [];
	for ( let i = 0; i < rings.length; i ++ ) {

		const r = rings[ i ];
		if ( r.y <= y ) { out.push( r ); continue; }
		const a = rings[ i - 1 ], t = ( y - a.y ) / ( r.y - a.y );
		out.push( { y, pts: a.pts.map( ( p, k ) => [ p[ 0 ] + ( r.pts[ k ][ 0 ] - p[ 0 ] ) * t, p[ 1 ] + ( r.pts[ k ][ 1 ] - p[ 1 ] ) * t ] ) } );
		break;

	}

	return out.length >= 2 ? out : null;

}

// the broken top of a wall ring at y: shards of facade up to ~4.5 m (shared heights: a continuous jag), a dark floor slab
function broken( acc, ring, base, col, aux, darkAux, detail ) {

	const n = ring.pts.length, y = ring.y;
	const jag = ( x, z ) => 0.4 + hash2( x * 0.37, z * 0.41 ) * 4.2;
	if ( detail ) {

		let u = 0;
		for ( let k = 0; k < n; k ++ ) {

			const [ px, pz ] = ring.pts[ k ], [ qx, qz ] = ring.pts[ ( k + 1 ) % n ];
			const L = Math.hypot( qx - px, qz - pz ), m = Math.max( 1, Math.round( L / 3.5 ) );
			const nn = [ - ( qz - pz ) / L, 0, ( qx - px ) / L ];
			for ( let i = 0; i < m; i ++ ) {

				const t0 = i / m, t1 = ( i + 1 ) / m;
				const ax = px + ( qx - px ) * t0, az = pz + ( qz - pz ) * t0, bx = px + ( qx - px ) * t1, bz = pz + ( qz - pz ) * t1;
				const ja = jag( ax, az ), jb = jag( bx, bz );
				acc.quad( [ ax, y, az ], [ bx, y, bz ], [ bx, y + jb, bz ], [ ax, y + ja, az ], nn,
					[ [ u + L * t0, y - base ], [ u + L * t1, y - base ], [ u + L * t1, y + jb - base ], [ u + L * t0, y + ja - base ] ], col, aux );

			}

			u += L;

		}

	}

	cap( acc, { y: y - 0.5, pts: ring.pts }, DARK, darkAux );

}

export function towerInto( acc, b, { detail = true, stage = 0, cut = null } = {}, ctx ) {

	const { STYLE, col, roofCol, roofAux, plainAux } = ctx;
	const F = towerForm( b, { far: ! detail } );
	const base = b.y;
	// what stands: everything (whole), up to the break (an upper section fell), the stump (collapsed)
	const limit = stage >= 3 ? base + STUMP : Number.isFinite( cut ) && cut > 0 ? base + cut : Infinity;
	const metal = plainAux( STYLE.metal ), plain = plainAux( STYLE.plain ), led = plainAux( STYLE.led ), dark = plainAux( STYLE.plain );
	const tiers = [];
	for ( const p of F.parts ) {

		const aux = ctx.aux( p.lit > 1 ? 0.985 : null );
		if ( p.kind === 'wedge' ) { wedgeInto( acc, p, limit, base, col, aux, ctx, detail, tiers ); continue; }
		const rings = Number.isFinite( limit ) ? clipRings( p.rings, limit ) : p.rings;
		if ( ! rings ) continue;
		let cx = 0, cz = 0;
		for ( const [ x, z ] of rings[ 0 ].pts ) { cx += x / rings[ 0 ].pts.length; cz += z / rings[ 0 ].pts.length; }
		for ( let i = 1; i < rings.length; i ++ ) walls( acc, rings[ i - 1 ], rings[ i ], base, col, aux, p.smooth, cx, cz );
		const top = rings[ rings.length - 1 ];
		const clipped = top.y < p.rings[ p.rings.length - 1 ].y - 0.01;
		if ( clipped ) broken( acc, top, base, col, aux, dark, detail );
		else if ( p.cap ) cap( acc, top, p.cap === 'metal' ? C( 0x8d9094 ) : roofCol, p.cap === 'metal' ? metal : roofAux );
		if ( p.bottom ) cap( acc, rings[ 0 ], col.clone().multiplyScalar( 0.7 ), plain, true );
		let x0 = Infinity, x1 = - Infinity, z0 = Infinity, z1 = - Infinity;
		for ( const [ x, z ] of rings[ 0 ].pts ) { x0 = Math.min( x0, x ); x1 = Math.max( x1, x ); z0 = Math.min( z0, z ); z1 = Math.max( z1, z ); }
		tiers.push( { x0, x1, z0, z1, y0: rings[ 0 ].y, y1: top.y } );

	}

	for ( const e of F.extras ) {

		if ( ( e.detail || e.type === 'parapet' || e.type === 'tree' || e.type === 'vine' ) && ! detail ) continue;
		const lo = e.rings ? e.rings[ 0 ].y : e.y ?? Math.min( e.y0 ?? Infinity, e.y1 ?? Infinity );
		if ( lo >= limit - 0.05 ) continue;
		extraInto( acc, e, { limit, col, roofCol, metal, plain, led, STYLE, plainAux, detail } );

	}

	if ( detail && ! Number.isFinite( limit ) ) for ( const p of F.pads ) padInto( acc, p, plainAux, led, STYLE );
	return { top: Number.isFinite( limit ) ? Math.min( limit, F.top ) : F.top, tiers };

}

// the wedge: four walls, the south and north faces' tops following the slope, a glazed sloping roof
function wedgeInto( acc, p, limit, base, col, aux, ctx, detail, tiers ) {

	const { x, z, hx, hz, y0, high, low } = p;
	const X0 = x - hx, X1 = x + hx, Z0 = z - hz, Z1 = z + hz;
	if ( Number.isFinite( limit ) && limit < low ) {

		// (a break never runs through the slope: Skyline's cutRange keeps it under the low edge)
		const ring = { y: limit, pts: rect( hx, hz, 0, x, z ) };
		walls( acc, { y: y0, pts: ring.pts }, ring, base, col, aux, false, x, z );
		broken( acc, ring, base, col, aux, ctx.plainAux( ctx.STYLE.plain ), detail );
		tiers.push( { x0: X0, x1: X1, z0: Z0, z1: Z1, y0, y1: limit } );
		return;

	}

	const v = ( y ) => y - base;
	face( acc, [ [ X0, y0, Z1 ], [ X1, y0, Z1 ], [ X1, low, Z1 ], [ X0, high, Z1 ] ], [ 0, 0, 1 ], [ [ 0, v( y0 ) ], [ 2 * hx, v( y0 ) ], [ 2 * hx, v( low ) ], [ 0, v( high ) ] ], col, aux );
	face( acc, [ [ X1, y0, Z0 ], [ X0, y0, Z0 ], [ X0, high, Z0 ], [ X1, low, Z0 ] ], [ 0, 0, - 1 ], [ [ 0, v( y0 ) ], [ 2 * hx, v( y0 ) ], [ 2 * hx, v( high ) ], [ 0, v( low ) ] ], col, aux );
	acc.wall( X1, Z1, X1, Z0, y0, low, base, col, aux );
	acc.wall( X0, Z0, X0, Z1, y0, high, base, col, aux );
	// the sloping roof: dark glazing on a 3 m grid (the prism's glass code, its uv down the slope)
	const S = Math.hypot( 2 * hx, high - low ), n = norm( [ ( high - low ) / ( 2 * hx ), 1, 0 ] );
	const glass = [ ctx.STYLE.prism, 3.2, 2.6, ctx.auxSeed ];
	face( acc, [ [ X0, high, Z0 ], [ X0, high, Z1 ], [ X1, low, Z1 ], [ X1, low, Z0 ] ], n, [ [ 0, 0 ], [ 2 * hz, 0 ], [ 2 * hz, S ], [ 0, S ] ], C( 0x30353a ), glass );
	tiers.push( { x0: X0, x1: X1, z0: Z0, z1: Z1, y0, y1: high } );

}

function extraInto( acc, e, k ) {

	const { limit, metal, plain, led, STYLE, plainAux, roofCol } = k;
	const ledCol = ( c ) => new Color( c[ 0 ], c[ 1 ], c[ 2 ] );
	const codeAux = ( code ) => ( code === 'metal' ? metal : code === 'led' ? led : code === 'foliage' ? plainAux( STYLE.foliage ) : plain );
	const colOf = ( c ) => ( Array.isArray( c ) ? new Color( c[ 0 ], c[ 1 ], c[ 2 ] ) : c );
	switch ( e.type ) {

		case 'box': acc.box( e.x0, e.x1, e.z0, e.z1, e.y0, Math.min( e.y1, limit ), e.y0, colOf( e.col ), codeAux( e.code ) ); break;
		case 'cyl': {

			const y1 = Math.min( e.y1, limit ), t = ( y1 - e.y0 ) / ( e.y1 - e.y0 );
			acc.cylinder( e.x, e.z, e.r0, e.r0 + ( e.r1 - e.r0 ) * t, e.y0, y1, e.seg || 8, colOf( e.col ), codeAux( e.code ) );
			break;

		}

		case 'strip': {

			const tx = e.nz, tz = - e.nx, o = 0.14, cx = e.x + e.nx * o, cz = e.z + e.nz * o, w = e.w / 2, y1 = Math.min( e.y1, limit - 0.2 );
			if ( y1 <= e.y0 ) break;
			face( acc, [ [ cx - tx * w, e.y0, cz - tz * w ], [ cx + tx * w, e.y0, cz + tz * w ], [ cx + tx * w, y1, cz + tz * w ], [ cx - tx * w, y1, cz - tz * w ] ], [ e.nx, 0, e.nz ], UV4, ledCol( e.col ), led );
			break;

		}

		case 'band': band( acc, e.pts, e.y, e.hgt, 0.13, ledCol( e.col ), led ); break;
		case 'parapet': {

			const pc = roofCol.clone().multiplyScalar( PARAPET_K * 1.25 );
			band( acc, e.pts, e.y, e.hgt, 0, pc, plain );
			band( acc, e.pts, e.y, e.hgt, 0.35, pc, plain, true );
			break;

		}

		case 'pyramid': {

			const a = [ e.x - e.hx, e.y0, e.z + e.hz ], b = [ e.x + e.hx, e.y0, e.z + e.hz ], c = [ e.x + e.hx, e.y0, e.z - e.hz ], d = [ e.x - e.hx, e.y0, e.z - e.hz ], t = [ e.x, e.y1, e.z ];
			const col = colOf( e.col ), aux = codeAux( e.code );
			for ( const [ p, q ] of [ [ a, b ], [ b, c ], [ c, d ], [ d, a ] ] ) acc.tri( p, q, t, norm( cross( sub( q, p ), sub( t, p ) ) ), col, aux );
			break;

		}

		case 'beacon': acc.box( e.x - 0.45, e.x + 0.45, e.z - 0.45, e.z + 0.45, e.y, e.y + 0.9, e.y, BEACON, plainAux( STYLE.beacon ) ); break;
		case 'tree': {

			acc.cylinder( e.x, e.z, 0.28, 0.22, e.y, e.y + 2.2, 6, C( 0x4a3a2a ), plain );
			acc.sphere( e.x, e.y + 2.2 + e.r * 0.8, e.z, e.r, 8, 5, C( 0x3d6a2a ), plainAux( STYLE.foliage ) );
			break;

		}

		case 'vine': {

			const tx = e.nz, tz = - e.nx, w = e.w / 2, o = 0.2;
			face( acc, [ [ e.x - tx * w + e.nx * o, e.y0, e.z - tz * w + e.nz * o ], [ e.x + tx * w + e.nx * o, e.y0, e.z + tz * w + e.nz * o ], [ e.x + tx * w + e.nx * o, e.y1, e.z + tz * w + e.nz * o ], [ e.x - tx * w + e.nx * o, e.y1, e.z - tz * w + e.nz * o ] ], [ e.nx, 0, e.nz ], UV4, C( 0x34561f ), plainAux( STYLE.foliage ) );
			break;

		}

		case 'spiral': {

			const R = e.rings, col = ledCol( e.col ), w = e.w / 2;
			const at = ( r ) => {

				const n = r.pts.length, p = r.pts[ e.edge % n ], q = r.pts[ ( e.edge + 1 ) % n ];
				const L = Math.hypot( q[ 0 ] - p[ 0 ], q[ 1 ] - p[ 1 ] ), tx = ( q[ 0 ] - p[ 0 ] ) / L, tz = ( q[ 1 ] - p[ 1 ] ) / L, nx = - tz, nz = tx;
				const mx = ( p[ 0 ] + q[ 0 ] ) / 2 + nx * 0.13, mz = ( p[ 1 ] + q[ 1 ] ) / 2 + nz * 0.13;
				return { a: [ mx - tx * w, r.y, mz - tz * w ], b: [ mx + tx * w, r.y, mz + tz * w ], n: [ nx, 0, nz ] };

			};
			for ( let i = 1; i < R.length; i ++ ) {

				if ( R[ i ].y > limit - 0.2 || R[ i - 1 ].y < R[ 0 ].y + 2.5 ) continue;
				const A = at( R[ i - 1 ] ), B = at( R[ i ] );
				face( acc, [ A.a, A.b, B.b, B.a ], A.n, UV4, col, led );

			}

			break;

		}

		case 'slope': {

			const ny = e.side || 1, z = e.z + ny * 0.13;
			face( acc, [ [ e.x0, e.y0 - 0.8, z ], [ e.x1, e.y1 - 0.8, z ], [ e.x1, e.y1 - 0.1, z ], [ e.x0, e.y0 - 0.1, z ] ], [ 0, 0, ny ], UV4, ledCol( e.col ), led );
			break;

		}

		default: break;

	}

}

// a helipad: a dark disc, its white ring and H, green edge lights (lit at night)
function padInto( acc, p, plainAux, led, STYLE ) {

	const y = p.y + 0.05, white = plainAux( STYLE.plain );
	acc.cylinder( p.x, p.z, p.r, p.r, p.y - 0.1, y, 28, PAD, plainAux( STYLE.roof ) );
	const n = 28, r0 = p.r - 1.3, r1 = p.r - 0.6;
	for ( let k = 0; k < n; k ++ ) {

		const a0 = k / n * Math.PI * 2, a1 = ( k + 1 ) / n * Math.PI * 2;
		const P = ( r, a ) => [ p.x + Math.cos( a ) * r, y + 0.02, p.z + Math.sin( a ) * r ];
		face( acc, [ P( r0, a0 ), P( r1, a0 ), P( r1, a1 ), P( r0, a1 ) ], [ 0, 1, 0 ], UV4, WHITE, white );

	}

	const s = p.r / 8;
	acc.flat( p.x - 2.4 * s, p.x - 1.5 * s, p.z - 3 * s, p.z + 3 * s, y + 0.03, WHITE, white );
	acc.flat( p.x + 1.5 * s, p.x + 2.4 * s, p.z - 3 * s, p.z + 3 * s, y + 0.03, WHITE, white );
	acc.flat( p.x - 1.5 * s, p.x + 1.5 * s, p.z - 0.45 * s, p.z + 0.45 * s, y + 0.03, WHITE, white );
	for ( let k = 0; k < 8; k ++ ) {

		const a = k / 8 * Math.PI * 2, x = p.x + Math.cos( a ) * ( p.r - 0.25 ), z = p.z + Math.sin( a ) * ( p.r - 0.25 );
		acc.box( x - 0.18, x + 0.18, z - 0.18, z + 0.18, y, y + 0.25, y, new Color( 0.35, 1.0, 0.45 ), led );

	}

}
