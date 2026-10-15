// What a damaged building looks like, as instanced boxes (pure geometry, node-testable): scorch marks and broken windows
// (scarred), breaches with soot and a spill of rubble below (gutted), the rubble heap of a collapse and the rigid chunks
// that fall into it, the scaffolding of a repair, and the cosmetic marks on the twin towers' lower facade.
// Every item is { p: [ x, y, z ], q: [ x, y, z, w ], s: [ sx, sy, sz ], c: [ r, g, b ] }; all deterministic from the id.
//
//   looks( b, { stage, marks, repair, progress, heapN, phone } ) -> [ item ]     (b: a CityModel building)
//   heap( b, n ) -> [ item ]   collapse( b, n ) -> Collapse ( .at( t, out ) -> items, .duration )
// The skyscrapers (wave 23A) have their own: marks and breaches on their real outlines (Skyline.sectionsAt), the floors alight
// as glowing bands (an item whose colour runs past 1.25 is drawn hot: Render.js), rebar and soot at a broken top, the
// fallen section's heap where it landed (sectionHeap; SectionFall drops its chunks there), a wide rubble field, a crane.

import { COLORS, KIND_COLOR, COLLAPSE, RENDER, TOWER } from './CityWreckData.js';
import { rng32, hashStr, sectionOf } from './Model.js';
import { sectionsAt, insideAny } from '../../world/islands/meridian/Skyline.js';

const clamp = ( v, a, b ) => ( v < a ? a : v > b ? b : v );
const mix3 = ( a, b, t ) => [ a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * t, a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * t, a[ 2 ] + ( b[ 2 ] - a[ 2 ] ) * t ];
const shade = ( c, k ) => [ c[ 0 ] * k, c[ 1 ] * k, c[ 2 ] * k ];

// yaw then pitch then roll (Y X Z), as the destruction props
export function quatYXZ( yaw, pitch = 0, roll = 0 ) {

	const cy = Math.cos( yaw / 2 ), sy = Math.sin( yaw / 2 ), cx = Math.cos( pitch / 2 ), sx = Math.sin( pitch / 2 ), cz = Math.cos( roll / 2 ), sz = Math.sin( roll / 2 );
	return [
		sx * cy * cz + cx * sy * sz,
		cx * sy * cz - sx * cy * sz,
		cx * cy * sz - sx * sy * cz,
		cx * cy * cz + sx * sy * sz,
	];

}

// a building-local point to the world (the inverse of Model.local)
function toWorld( b, lx, ly, lz ) {

	return [ b.x + lx * b.cos + lz * b.sin, b.y0 + ly, b.z - lx * b.sin + lz * b.cos ];

}

const TOWER_COLOR = { deco: 'stone', zigg: 'stone', prism: 'steel', bronze: 'steel' };
export function colorOf( b ) {

	const key = ( b.p && b.p.wreckColor ) || ( b.cls === 'tower' && b.p && TOWER_COLOR[ b.p.style ] ) || KIND_COLOR[ b.kind ] || 'concrete';
	return COLORS[ key ] || COLORS.concrete;

}

// the glow of a floor alight (past 1.25 in red: Render.js draws it hot)
const HOT = [ 1.48, 0.6, 0.18 ];
const GLASS = [ 0.12, 0.16, 0.2 ];

// a point on one of the four facades: face 0 +x, 1 -x, 2 +z, 3 -z; u along it (-1..1), y up it; out: off the wall
function onFace( b, face, u, y, out ) {

	const ax = face < 2, sgn = face % 2 === 0 ? 1 : - 1;
	const half = ax ? b.hd : b.hw;
	const lx = ax ? sgn * ( b.hw + out ) : u * half, lz = ax ? u * half : sgn * ( b.hd + out );
	// the decal's own yaw: its thin axis (local z) along the facade's normal
	const yaw = b.yaw + ( ax ? Math.PI / 2 : 0 );
	return { p: toWorld( b, lx, y, lz ), yaw, half };

}

function decal( b, rnd, kind, yMin, yMax ) {

	const face = Math.floor( rnd() * 4 ), u = rnd() * 1.6 - 0.8;
	const y = yMin + rnd() * Math.max( 0.1, yMax - yMin );
	const f = onFace( b, face, u, y, 0.06 );
	if ( kind === 'window' ) return { p: f.p, q: quatYXZ( f.yaw ), s: [ 1.1 + rnd() * 0.5, 1.2 + rnd() * 0.4, 0.1 ], c: COLORS.window };
	const w = 1.4 + rnd() * 2.6, h = 1.6 + rnd() * 3.2;
	return { p: f.p, q: quatYXZ( f.yaw, 0, ( rnd() - 0.5 ) * 0.5 ), s: [ w, h, 0.08 ], c: mix3( COLORS.scorch, COLORS.soot, rnd() ) };

}

// the rubble heap of a collapse: a mound over the footprint spilling past it, the floors' slabs among the pieces
export function heap( b, n, { shrink = 0 } = {} ) {

	const rnd = rng32( hashStr( b.id + ':heap' ) );
	const tower = b.cls === 'tower';
	const spill = tower ? Math.min( TOWER.spillMax, Math.max( COLLAPSE.spillMin, b.top * TOWER.spill ) ) : Math.min( COLLAPSE.spillMax, Math.max( COLLAPSE.spillMin, b.top * COLLAPSE.spill ) );
	const rx = b.hw + spill * 0.95, rz = b.hd + spill * 0.95;
	const H = Math.min( tower ? TOWER.heapMax : COLLAPSE.heapMax, b.top * COLLAPSE.heapHeight ) * ( 1 - shrink * 0.75 );
	const base = colorOf( b ), out = [];
	const scale = clamp( Math.sqrt( b.hw * b.hd ) / 6, 0.6, tower ? TOWER.heapScale : 1.8 );
	// the dust bed under it all
	out.push( { p: toWorld( b, 0, 0.12, 0 ), q: quatYXZ( b.yaw ), s: [ rx * 2 * 0.85, 0.3, rz * 2 * 0.85 ], c: mix3( mix3( COLORS.dust, base, 0.4 ), COLORS.soot, 0.35 ) } );
	const count = Math.max( 4, Math.round( n * ( 1 - shrink ) ) );
	for ( let i = 0; i < count; i ++ ) {

		// denser and bigger in the middle
		const a = rnd() * Math.PI * 2, r = Math.pow( rnd(), 0.75 );
		const lx = Math.cos( a ) * r * rx, lz = Math.sin( a ) * r * rz;
		const prof = H * ( 1 - Math.pow( r, 1.6 ) );
		const big = i < count * 0.25;
		const s = ( big ? 2.4 + rnd() * 1.8 : 0.7 + rnd() * 1.6 ) * scale * ( 1 - r * 0.35 );
		const kind = rnd();
		let size = [ s * ( 0.8 + rnd() * 0.8 ), s * ( 0.35 + rnd() * 0.45 ), s * ( 0.7 + rnd() * 0.6 ) ];
		let c = shade( base, 0.62 + rnd() * 0.5 );
		if ( kind < 0.12 ) { size = [ tower ? 0.5 : 0.12, tower ? 0.5 : 0.12, s * 1.6 ]; c = tower ? COLORS.steel : COLORS.rebar; } // bent rebar (a tower's: steel beams)
		else if ( tower && kind < 0.2 ) c = GLASS; // (a skyscraper's curtain wall in the heap)
		else if ( kind < 0.27 ) c = mix3( c, COLORS.soot, 0.7 );
		else if ( kind < 0.36 ) c = mix3( c, COLORS.dust, 0.6 );
		const y = Math.max( size[ 1 ] * 0.3, prof * ( 0.55 + rnd() * 0.45 ) - size[ 1 ] * 0.15 );
		out.push( { p: toWorld( b, lx, y, lz ), q: quatYXZ( b.yaw + rnd() * 6.28, ( rnd() - 0.5 ) * 0.9, ( rnd() - 0.5 ) * 0.9 ), s: size, c, big } );

	}

	// two or three floor slabs leaning out of it
	const slabs = Math.min( 3, Math.max( 1, Math.round( b.floors / 2 ) ) );
	for ( let k = 0; k < slabs; k ++ ) {

		const lx = ( rnd() - 0.5 ) * b.hw, lz = ( rnd() - 0.5 ) * b.hd;
		const w = b.hw * ( 0.8 + rnd() * 0.5 ), d = b.hd * ( 0.6 + rnd() * 0.5 );
		out.push( { p: toWorld( b, lx, H * ( 0.3 + rnd() * 0.4 ), lz ), q: quatYXZ( b.yaw + ( rnd() - 0.5 ) * 0.8, ( rnd() - 0.5 ) * 0.9, ( rnd() - 0.5 ) * 0.7 ), s: [ w, tower ? 1.2 : 0.35, d ], c: shade( base, 0.7 + rnd() * 0.2 ), big: true } );

	}

	// a fallen skyscraper: sheets of its facade standing up out of the field, leaning
	if ( tower && shrink < 0.5 ) for ( let k = 0; k < 5; k ++ ) {

		const a = rnd() * Math.PI * 2, r = 0.3 + rnd() * 0.5;
		const hgt = H * ( 1.1 + rnd() * 0.9 );
		out.push( { p: toWorld( b, Math.cos( a ) * r * b.hw, hgt * 0.45, Math.sin( a ) * r * b.hd ), q: quatYXZ( b.yaw + rnd() * 6.28, ( rnd() - 0.5 ) * 0.8, ( rnd() - 0.5 ) * 0.6 ), s: [ 6 + rnd() * 8, hgt, 0.8 ], c: shade( base, 0.5 + rnd() * 0.3 ) } );

	}

	return out;

}

// the heap of a skyscraper's broken-off section where it came down (Model.sectionOf): a long mound along the way it fell
export function sectionHeap( b, n, { shrink = 0 } = {} ) {

	const S = b.sec || sectionOf( b );
	if ( ! S ) return [];
	const rnd = rng32( hashStr( b.id + ':sec' ) );
	const c = Math.cos( S.yaw ), sn = Math.sin( S.yaw );
	const W = ( lx, ly, lz ) => [ S.x + lx * c + lz * sn, b.y0 + ly, S.z - lx * sn + lz * c ];
	const rx = S.wid / 2, rz = S.len / 2, H = S.h * ( 1 - shrink * 0.75 );
	const base = colorOf( b ), out = [];
	out.push( { p: W( 0, 0.15, 0 ), q: quatYXZ( S.yaw ), s: [ rx * 2.1, 0.3, rz * 2.1 ], c: mix3( mix3( COLORS.dust, base, 0.4 ), COLORS.soot, 0.3 ) } );
	const count = Math.max( 4, Math.round( n * ( 1 - shrink ) ) );
	for ( let i = 0; i < count; i ++ ) {

		const a = rnd() * Math.PI * 2, r = Math.pow( rnd(), 0.7 );
		const lx = Math.cos( a ) * r * rx, lz = Math.sin( a ) * r * rz;
		const prof = H * ( 1 - Math.pow( r, 1.5 ) );
		const big = i < count * 0.3;
		const s = ( big ? 3 + rnd() * 2.5 : 0.9 + rnd() * 1.8 ) * ( 1 - r * 0.3 ) * 1.6;
		const kind = rnd();
		let size = [ s * ( 0.8 + rnd() * 0.8 ), s * ( 0.35 + rnd() * 0.4 ), s * ( 0.7 + rnd() * 0.7 ) ];
		let col = shade( base, 0.6 + rnd() * 0.5 );
		if ( kind < 0.1 ) { size = [ 0.5, 0.5, s * 1.8 ]; col = COLORS.steel; } else if ( kind < 0.22 ) col = GLASS; else if ( kind < 0.34 ) col = mix3( col, COLORS.soot, 0.7 );
		const y = Math.max( size[ 1 ] * 0.3, prof * ( 0.55 + rnd() * 0.45 ) - size[ 1 ] * 0.15 );
		out.push( { p: W( lx, y, lz ), q: quatYXZ( S.yaw + rnd() * 6.28, ( rnd() - 0.5 ) * 0.9, ( rnd() - 0.5 ) * 0.9 ), s: size, c: col, big } );

	}

	// the section's facade lying along the heap, broken in two or three
	if ( shrink < 0.5 ) for ( let k = 0; k < 3; k ++ ) {

		const lz = ( k - 1 ) * rz * 0.6 + ( rnd() - 0.5 ) * 4;
		out.push( { p: W( ( rnd() - 0.5 ) * rx * 0.6, H * 0.5, lz ), q: quatYXZ( S.yaw + ( rnd() - 0.5 ) * 0.4, ( rnd() - 0.5 ) * 0.5, 0.3 + rnd() * 0.6 ), s: [ rx * 1.3, 1.4, rz * 0.55 ], c: shade( base, 0.65 + rnd() * 0.2 ), big: true } );

	}

	return out;

}

// the scaffolding of a repair, up to `height`, and the building's new shell rising inside it (a collapse being rebuilt)
function scaffold( b, progress, rebuilding ) {

	const out = [];
	const top = rebuilding ? Math.max( 3, b.top * progress ) : Math.min( b.top, b.cls === 'high' ? 40 : b.top );
	const H = Math.min( b.top + 1.5, top + 2 );
	if ( rebuilding ) out.push( { p: toWorld( b, 0, top / 2, 0 ), q: quatYXZ( b.yaw ), s: [ b.hw * 2 - 0.4, top, b.hd * 2 - 0.4 ], c: shade( COLORS.concrete, 0.95 ) } );
	const off = 1.3, step = 3.2, rows = Math.max( 1, Math.floor( H / 2.2 ) );
	const rnd = rng32( hashStr( b.id + ':scaf' ) );
	for ( let face = 0; face < 4; face ++ ) {

		const ax = face < 2, half = ax ? b.hd : b.hw;
		const n = Math.max( 2, Math.round( half * 2 / step ) + 1 );
		for ( let i = 0; i < n; i ++ ) {

			const u = n === 1 ? 0 : - 1 + 2 * i / ( n - 1 );
			const f = onFace( b, face, u * ( half + off ) / half, H / 2, off );
			out.push( { p: f.p, q: quatYXZ( f.yaw ), s: [ 0.12, H, 0.12 ], c: COLORS.steel } );

		}

		for ( let r = 1; r <= rows; r ++ ) {

			const f = onFace( b, face, 0, r * 2.2, off );
			out.push( { p: f.p, q: quatYXZ( f.yaw ), s: [ ( half + off ) * 2, 0.08, 0.9 ], c: COLORS.timber } );

		}

		// a tarp or two hung on it
		for ( let k = 0; k < 2; k ++ ) {

			if ( rnd() < 0.35 ) continue;
			const f = onFace( b, face, rnd() * 1.4 - 0.7, 2 + rnd() * Math.max( 0.5, H - 6 ), off + 0.5 );
			out.push( { p: f.p, q: quatYXZ( f.yaw ), s: [ 3 + rnd() * 3, 2.5 + rnd() * 2, 0.04 ], c: rnd() < 0.5 ? COLORS.tarp : [ 0.8, 0.8, 0.78 ] } );

		}

	}

	return out;

}

// everything a building shows beyond its own model at this stage
export function looks( b, { stage = b.stage, marks = b.marks || 0, repair = b.repair, progress = 0, heapN = COLLAPSE.heap.desktop, phone = false } = {} ) {

	if ( b.cls === 'tower' ) return towerLooks( b, { stage, repair, progress, phone } );
	const out = [];
	const rnd = rng32( hashStr( b.id + ':looks' ) );
	if ( stage === 3 ) {

		if ( repair && repair.phase === 'build' ) return out.concat( heap( b, Math.round( heapN * 0.2 ), { shrink: 1 } ), scaffold( b, progress, true ) );
		return heap( b, phone ? Math.min( heapN, COLLAPSE.heap.phone ) : heapN, { shrink: repair && repair.phase === 'clear' ? progress : 0 } );

	}

	if ( stage >= 1 ) {

		// more marks on a bigger facade
		const area = 2 * ( b.hw + b.hd ) * 2 * Math.min( b.top, 40 );
		const n = Math.round( RENDER.decals[ stage ] * clamp( area / 700, 1, 3 ) * ( phone ? 0.6 : 1 ) );
		const yMax = b.cls === 'high' ? b.top * 0.95 : b.top - 0.8;
		const yMin = b.cls === 'high' && stage === 2 ? b.top * 0.55 : 1;
		for ( let i = 0; i < n; i ++ ) out.push( decal( b, rnd, i % 5 < 3 ? 'window' : 'scorch', yMin, yMax ) );

	}

	if ( stage === 2 ) {

		// breaches through the facade, soot streaked above them, rubble spilled below
		const base = colorOf( b );
		const nb = ( b.cls === 'high' ? 3 : 2 ) + ( b.hw * b.hd * 4 > 900 ? 1 : 0 );
		for ( let i = 0; i < nb; i ++ ) {

			const face = Math.floor( rnd() * 4 ), u = rnd() * 1.2 - 0.6;
			const fl = b.cls === 'high' ? b.top * ( 0.6 + rnd() * 0.3 ) : Math.max( 2, b.top * ( 0.25 + rnd() * 0.5 ) );
			const w = Math.min( 7, 3 + rnd() * 4 ), h = Math.min( b.top * 0.5, 2.6 + rnd() * 2.4 );
			const f = onFace( b, face, u, fl, - 0.1 );
			out.push( { p: f.p, q: quatYXZ( f.yaw, 0, ( rnd() - 0.5 ) * 0.3 ), s: [ w, h, 0.5 ], c: COLORS.breach } );
			const s = onFace( b, face, u, fl + h / 2 + 2.6, 0.07 );
			out.push( { p: s.p, q: quatYXZ( s.yaw ), s: [ w * 0.8, 5.2, 0.06 ], c: COLORS.soot } );
			if ( b.cls !== 'high' || i === 0 ) {

				for ( let k = 0; k < ( phone ? 3 : 6 ); k ++ ) {

					const g = onFace( b, face, u + ( rnd() - 0.5 ) * 0.3, 0.3, 0.6 + rnd() * 2.2 );
					const sz = 0.5 + rnd() * 1.1;
					out.push( { p: [ g.p[ 0 ], b.y0 + sz * 0.25, g.p[ 2 ] ], q: quatYXZ( rnd() * 6.28, ( rnd() - 0.5 ) * 0.6, 0 ), s: [ sz, sz * 0.5, sz * 0.8 ], c: shade( base, 0.6 + rnd() * 0.4 ) } );

				}

			}

		}

	}

	if ( repair && repair.phase === 'build' && stage > 0 ) out.push( ...scaffold( b, progress, false ) );
	return out;

}

// ------------------------------------------------------------------ the skyscrapers

// a point on a tower's real outline at h m up (an edge picked by its length): { p, yaw (the facade's normal), len } | null
function onSection( b, rnd, h, out ) {

	const secs = sectionsAt( b.p, b.y0 + h );
	if ( ! secs.length ) return null;
	const sec = secs[ Math.floor( rnd() * secs.length ) % secs.length ];
	const n = sec.length, L = [];
	let total = 0;
	for ( let k = 0; k < n; k ++ ) { const p = sec[ k ], q = sec[ ( k + 1 ) % n ]; const l = Math.hypot( q[ 0 ] - p[ 0 ], q[ 1 ] - p[ 1 ] ); L.push( l ); total += l; }
	let r = rnd() * total, k = 0;
	while ( k < n - 1 && r > L[ k ] ) { r -= L[ k ]; k ++; }
	const p = sec[ k ], q = sec[ ( k + 1 ) % n ], l = L[ k ] || 1, t = clamp( r / l, 0.1, 0.9 );
	const tx = ( q[ 0 ] - p[ 0 ] ) / l, tz = ( q[ 1 ] - p[ 1 ] ) / l, nx = - tz, nz = tx;
	return { p: [ p[ 0 ] + ( q[ 0 ] - p[ 0 ] ) * t + nx * out, b.y0 + h, p[ 1 ] + ( q[ 1 ] - p[ 1 ] ) * t + nz * out ], yaw: Math.atan2( nx, nz ), len: l };

}

// the floors alight: a glowing band round the section every four floors of the fire, soot streaked above it
function fireBands( b, out, phone ) {

	if ( b.fireLo < 0 || ! ( b.fire > 0 ) ) return;
	const y0 = b.fireLo * b.fh, y1 = ( b.fireHi + 1 ) * b.fh, step = 4 * b.fh;
	const glow = [ HOT[ 0 ], HOT[ 1 ] * ( 0.85 + b.fire * 0.3 ), HOT[ 2 ] ];
	for ( let ya = y0; ya < y1 - 0.1; ya += step ) {

		const hgt = Math.min( step, y1 - ya ), ym = ya + hgt / 2;
		for ( const sec of sectionsAt( b.p, b.y0 + ym ) ) {

			const n = sec.length, every = phone && n > 10 ? 2 : 1;
			for ( let k = 0; k < n; k += every ) {

				const p = sec[ k ], q = sec[ ( k + every ) % n ];
				const l = Math.hypot( q[ 0 ] - p[ 0 ], q[ 1 ] - p[ 1 ] );
				if ( l < 0.5 ) continue;
				const nx = - ( q[ 1 ] - p[ 1 ] ) / l, nz = ( q[ 0 ] - p[ 0 ] ) / l;
				out.push( { p: [ ( p[ 0 ] + q[ 0 ] ) / 2 + nx * 0.3, b.y0 + ym, ( p[ 1 ] + q[ 1 ] ) / 2 + nz * 0.3 ], q: quatYXZ( Math.atan2( nx, nz ) ), s: [ l * 0.96, hgt * 0.9, 0.4 ], c: glow } );

			}

		}

	}

	// the soot over the top floor alight
	for ( const sec of sectionsAt( b.p, b.y0 + y1 + b.fh * 2 ) ) {

		const n = sec.length, every = n > 10 ? 2 : 1;
		for ( let k = 0; k < n; k += every ) {

			const p = sec[ k ], q = sec[ ( k + every ) % n ];
			const l = Math.hypot( q[ 0 ] - p[ 0 ], q[ 1 ] - p[ 1 ] );
			if ( l < 0.5 ) continue;
			const nx = - ( q[ 1 ] - p[ 1 ] ) / l, nz = ( q[ 0 ] - p[ 0 ] ) / l;
			out.push( { p: [ ( p[ 0 ] + q[ 0 ] ) / 2 + nx * 0.25, b.y0 + y1 + b.fh * 2.2, ( p[ 1 ] + q[ 1 ] ) / 2 + nz * 0.25 ], q: quatYXZ( Math.atan2( nx, nz ) ), s: [ l * 0.9, b.fh * 4, 0.3 ], c: COLORS.soot } );

		}

	}

}

// a skyscraper's broken top: steel and rebar standing up out of the break, a slab hanging off it
function brokenTop( b, rnd, out ) {

	const secs = sectionsAt( b.p, b.y0 + b.cut - 0.5 );
	for ( const sec of secs ) {

		const n = sec.length;
		for ( let k = 0; k < n; k ++ ) {

			if ( rnd() < 0.35 ) continue;
			const [ x, z ] = sec[ k ];
			const h = 2 + rnd() * 7;
			out.push( { p: [ x, b.y0 + b.cut + h / 2, z ], q: quatYXZ( rnd() * 6.28, ( rnd() - 0.5 ) * 0.7, ( rnd() - 0.5 ) * 0.7 ), s: [ 0.45, h, 0.45 ], c: COLORS.steel } );

		}

	}

	const f = onSection( b, rnd, b.cut - 2, 1.5 );
	if ( f ) out.push( { p: f.p, q: quatYXZ( f.yaw, 0.9, 0.2 ), s: [ Math.min( 14, f.len * 0.6 ), 0.6, 6 ], c: shade( colorOf( b ), 0.7 ) } );

}

// a tower crane by a skyscraper under repair: its mast to y (world), its jib swung out over the work
function crane( b, y, out ) {

	const x = b.x + b.hw + 4, z = b.z - b.hd * 0.5, Y = b.y0;
	const yellow = [ 0.85, 0.66, 0.12 ];
	out.push( { p: [ x, ( Y + y + 8 ) / 2, z ], q: quatYXZ( 0 ), s: [ 2.2, y + 8 - Y, 2.2 ], c: yellow } );
	out.push( { p: [ x - 18, y + 8.5, z ], q: quatYXZ( 0 ), s: [ 52, 1.6, 1.6 ], c: yellow } );
	out.push( { p: [ x + 9, y + 7.2, z ], q: quatYXZ( 0 ), s: [ 5, 3, 3 ], c: COLORS.concrete } );

}

function towerLooks( b, { stage, repair, progress, phone } ) {

	const out = [];
	const rnd = rng32( hashStr( b.id + ':tlooks' ) );
	const heapN = phone ? TOWER.heap.phone : TOWER.heap.desktop, secN = phone ? TOWER.section.phone : TOWER.section.desktop;
	const clearing = repair && repair.phase === 'clear' ? progress : 0;
	// the section's heap where it came down, until it is cleared
	if ( b.sec && ! b.sec.cleared ) out.push( ...sectionHeap( b, secN, { shrink: clearing } ) );
	if ( stage === 3 ) {

		if ( repair && repair.phase === 'build' ) {

			// the new tower rising: its core, the climbing scaffold at the top of it, the crane
			const top = Math.max( 6, b.top * progress );
			out.push( ...heap( b, Math.round( heapN * 0.15 ), { shrink: 1 } ) );
			out.push( { p: toWorld( b, 0, top / 2, 0 ), q: quatYXZ( b.yaw ), s: [ b.hw * 1.2, top, b.hd * 1.2 ], c: shade( COLORS.concrete, 0.95 ) } );
			for ( const [ lx, lz, sx, sz ] of [ [ 0, b.hd * 0.62, b.hw * 1.3, 0.3 ], [ 0, - b.hd * 0.62, b.hw * 1.3, 0.3 ], [ b.hw * 0.62, 0, 0.3, b.hd * 1.3 ], [ - b.hw * 0.62, 0, 0.3, b.hd * 1.3 ] ] ) out.push( { p: toWorld( b, lx, top - 4, lz ), q: quatYXZ( b.yaw ), s: [ sx, 8, sz ], c: COLORS.steel } );
			crane( b, b.y0 + top, out );
			return out;

		}

		return out.concat( heap( b, heapN, { shrink: clearing } ) );

	}

	if ( stage >= 1 ) {

		// broken panes and scorch round the real outline, more near the last hit; breaches when gutted
		const top = b.cut ?? b.top;
		const n = Math.round( RENDER.decals[ stage ] * 3 * ( phone ? 0.5 : 1 ) );
		const near = b.hitY ?? top * 0.5;
		for ( let i = 0; i < n; i ++ ) {

			const h = clamp( i % 2 ? near + ( rnd() - 0.5 ) * 40 : 2 + rnd() * ( top - 4 ), 1.5, top - 1.5 );
			const f = onSection( b, rnd, h, 0.06 );
			if ( ! f ) continue;
			if ( i % 5 < 3 ) out.push( { p: f.p, q: quatYXZ( f.yaw ), s: [ 1.3 + rnd() * 0.8, 1.6 + rnd() * 1.2, 0.1 ], c: COLORS.window } );
			else out.push( { p: f.p, q: quatYXZ( f.yaw, 0, ( rnd() - 0.5 ) * 0.4 ), s: [ 2.5 + rnd() * 4, 3 + rnd() * 6, 0.08 ], c: mix3( COLORS.scorch, COLORS.soot, rnd() ) } );

		}

		if ( stage === 2 ) for ( let i = 0; i < ( phone ? 3 : 6 ); i ++ ) {

			const h = clamp( near + ( rnd() - 0.4 ) * 50, 4, top - 3 );
			const f = onSection( b, rnd, h, - 0.2 );
			if ( ! f ) continue;
			const w = Math.min( f.len * 0.7, 5 + rnd() * 7 ), hh = 3.5 + rnd() * 5;
			out.push( { p: f.p, q: quatYXZ( f.yaw, 0, ( rnd() - 0.5 ) * 0.3 ), s: [ w, hh, 0.6 ], c: COLORS.breach } );
			const sf = onSection( b, rnd, h + hh / 2 + 4, 0.08 );
			if ( sf ) out.push( { p: sf.p, q: quatYXZ( sf.yaw ), s: [ w * 0.8, 8, 0.07 ], c: COLORS.soot } );

		}

	}

	if ( b.cut !== null ) brokenTop( b, rnd, out );
	fireBands( b, out, phone );
	if ( repair && repair.phase === 'build' && stage > 0 ) {

		// scaffolding up the lower floors; a crane at the break while the top is rebuilt
		const low = { ...b, top: Math.min( b.top, 36 ), cls: 'high' };
		out.push( ...scaffold( low, progress, false ) );
		if ( b.cut !== null ) {

			const h = ( b.top - b.cut ) * progress;
			if ( h > 1 ) out.push( { p: toWorld( b, 0, b.cut + h / 2, 0 ), q: quatYXZ( b.yaw ), s: [ b.hw * 1.1, h, b.hd * 1.1 ], c: shade( COLORS.concrete, 0.95 ) } );
			crane( b, b.y0 + b.cut + h, out );

		}

	}

	return out;

}

// the collapse: rigid chunks of the building fall floor by floor (the lowest first, the rest following it down) and settle
// as the heap's big pieces, so the heap takes over without a jump
export class Collapse {

	// section: a skyscraper's broken-off top (its chunks start above the break and land in sectionHeap)
	constructor( b, n, { heapN = COLLAPSE.heap.desktop, section = false } = {} ) {

		this.b = b;
		const H = section ? sectionHeap( b, heapN ) : heap( b, heapN );
		const targets = H.filter( ( it ) => it.big ).slice( 0, n );
		const rnd = rng32( hashStr( b.id + ( section ? ':secfall' : ':fall' ) ) );
		const m = targets.length;
		const y0 = section ? b.cut : 0, y1 = section ? b.top : b.cut ?? b.top;
		const floors = Math.max( 1, Math.min( b.floors, Math.ceil( m / 4 ) ) );
		const per = Math.ceil( m / floors );
		const nx = Math.max( 1, Math.round( Math.sqrt( per * b.hw / Math.max( 1, b.hd ) ) ) ), nz = Math.max( 1, Math.ceil( per / nx ) );
		const fh = ( y1 - y0 ) / floors;
		// starts: a grid of blocks through the building's volume, lowest first; targets sorted by height to match (a
		// skyscraper's cells only where its section is at that height: a cylinder's corners are air)
		const starts = [];
		const tower = b.cls === 'tower' && b.p;
		for ( let k = 0; k < floors && starts.length < m; k ++ ) {

			const yc = y0 + ( k + 0.5 ) * fh;
			const secs = tower ? sectionsAt( b.p, b.y0 + yc ) : null;
			const cells = [];
			for ( let i = 0; i < nx; i ++ ) for ( let j = 0; j < nz; j ++ ) {

				const lx = - b.hw + ( i + 0.5 ) * ( 2 * b.hw / nx ), lz = - b.hd + ( j + 0.5 ) * ( 2 * b.hd / nz );
				const p = toWorld( b, lx, yc, lz );
				if ( ! secs || ! secs.length || insideAny( secs, p[ 0 ], p[ 2 ] ) ) cells.push( p );

			}

			if ( ! cells.length ) cells.push( toWorld( b, 0, yc, 0 ) );
			for ( let c = 0; c < per && starts.length < m; c ++ ) starts.push( { p: cells[ c % cells.length ], s: [ 2 * b.hw / nx * 0.97, fh * 0.94, 2 * b.hd / nz * 0.97 ], level: k } );

		}

		targets.sort( ( a, c ) => a.p[ 1 ] - c.p[ 1 ] );
		// a section first tips over as one block on the edge of the break (the way it falls), then breaks up as it drops
		const S = section ? b.sec || sectionOf( b ) : null;
		this.topple = null;
		if ( S ) {

			const dx = Math.sin( S.yaw ), dz = Math.cos( S.yaw ), r = Math.min( b.hw, b.hd ) * 0.8;
			this.topple = { p: [ b.x + dx * r, b.y0 + b.cut, b.z + dz * r ], k: [ dz, 0, - dx ], max: 0.62, T: 1.5 };

		}

		this.chunks = [];
		let end = 0;
		for ( let i = 0; i < starts.length; i ++ ) {

			const s0 = starts[ i ], t = targets[ i ];
			const q0 = quatYXZ( b.yaw );
			// (after the tip: where the chunk is, how it is turned)
			const s = this.topple ? { ...s0, p: tip( this.topple, s0.p, this.topple.max ) } : s0;
			// (a section breaks up together once tipped; a building goes from the bottom up)
			const delay = this.topple ? this.topple.T + rnd() * 0.25 : 0.05 + s.level * 0.11 + rnd() * 0.12;
			const drop = Math.max( 0.5, s.p[ 1 ] - t.p[ 1 ] );
			const T = Math.max( 0.45, Math.sqrt( 2 * drop / COLLAPSE.gravity ) );
			this.chunks.push( { s0, s, t, delay, T, drop, q00: q0, q0: this.topple ? qmul( axisQuat( this.topple.k, this.topple.max ), q0 ) : q0, c: shade( colorOf( b ), 0.8 + rnd() * 0.25 ) } );
			end = Math.max( end, delay + T );

		}

		this.duration = b.cls === 'tower' ? end + 0.4 : Math.min( COLLAPSE.duration + 2, end + 0.4 );
		this.landedAt = Math.min( ...this.chunks.map( ( c ) => c.delay + c.T ) );

	}

	// the chunks' poses at t seconds into the fall
	at( t, out = [] ) {

		const tp = this.topple;
		for ( const c of this.chunks ) {

			if ( tp && t < tp.T ) {

				// tipping over the edge of the break, slow then faster
				const th = tp.max * ( t / tp.T ) * ( t / tp.T );
				out.push( { p: tip( tp, c.s0.p, th ), q: qmul( axisQuat( tp.k, th ), c.q00 ), s: c.s0.s, c: c.c } );
				continue;

			}

			const f = clamp( ( t - c.delay ) / c.T, 0, 1 );
			const e = f * f; // falling: slow then fast
			const h = f * f * ( 3 - 2 * f );
			const p = [ c.s.p[ 0 ] + ( c.t.p[ 0 ] - c.s.p[ 0 ] ) * h, c.s.p[ 1 ] - c.drop * e, c.s.p[ 2 ] + ( c.t.p[ 2 ] - c.s.p[ 2 ] ) * h ];
			const s = [ c.s.s[ 0 ] + ( c.t.s[ 0 ] - c.s.s[ 0 ] ) * h, c.s.s[ 1 ] + ( c.t.s[ 1 ] - c.s.s[ 1 ] ) * h, c.s.s[ 2 ] + ( c.t.s[ 2 ] - c.s.s[ 2 ] ) * h ];
			const q = f >= 1 ? c.t.q : slerp( c.q0, c.t.q, h );
			out.push( { p, q, s, c: f >= 1 ? c.t.c : mix3( c.c, c.t.c, h ) } );

		}

		return out;

	}

}

// a point turned by th about the axis k through the tip's pivot (Rodrigues)
function tip( T, p, th ) {

	const v = [ p[ 0 ] - T.p[ 0 ], p[ 1 ] - T.p[ 1 ], p[ 2 ] - T.p[ 2 ] ], k = T.k;
	const c = Math.cos( th ), s = Math.sin( th ), d = k[ 0 ] * v[ 0 ] + k[ 1 ] * v[ 1 ] + k[ 2 ] * v[ 2 ];
	const x = [ k[ 1 ] * v[ 2 ] - k[ 2 ] * v[ 1 ], k[ 2 ] * v[ 0 ] - k[ 0 ] * v[ 2 ], k[ 0 ] * v[ 1 ] - k[ 1 ] * v[ 0 ] ];
	return [ 0, 1, 2 ].map( ( i ) => T.p[ i ] + v[ i ] * c + x[ i ] * s + k[ i ] * d * ( 1 - c ) );

}

const axisQuat = ( k, th ) => [ k[ 0 ] * Math.sin( th / 2 ), k[ 1 ] * Math.sin( th / 2 ), k[ 2 ] * Math.sin( th / 2 ), Math.cos( th / 2 ) ];
// a then b: the Hamilton product a * b
function qmul( a, b ) {

	return [
		a[ 3 ] * b[ 0 ] + a[ 0 ] * b[ 3 ] + a[ 1 ] * b[ 2 ] - a[ 2 ] * b[ 1 ],
		a[ 3 ] * b[ 1 ] - a[ 0 ] * b[ 2 ] + a[ 1 ] * b[ 3 ] + a[ 2 ] * b[ 0 ],
		a[ 3 ] * b[ 2 ] + a[ 0 ] * b[ 1 ] - a[ 1 ] * b[ 0 ] + a[ 2 ] * b[ 3 ],
		a[ 3 ] * b[ 3 ] - a[ 0 ] * b[ 0 ] - a[ 1 ] * b[ 1 ] - a[ 2 ] * b[ 2 ],
	];

}

function slerp( a, b, t ) {

	let d = a[ 0 ] * b[ 0 ] + a[ 1 ] * b[ 1 ] + a[ 2 ] * b[ 2 ] + a[ 3 ] * b[ 3 ];
	const sg = d < 0 ? - 1 : 1;
	d = Math.abs( d );
	const x = a[ 0 ] + ( b[ 0 ] * sg - a[ 0 ] ) * t, y = a[ 1 ] + ( b[ 1 ] * sg - a[ 1 ] ) * t, z = a[ 2 ] + ( b[ 2 ] * sg - a[ 2 ] ) * t, w = a[ 3 ] + ( b[ 3 ] * sg - a[ 3 ] ) * t;
	const l = Math.hypot( x, y, z, w ) || 1;
	return [ x / l, y / l, z / l, w / l ];

}
