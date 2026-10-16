import { shells } from '../world/interiors/Shells.js';
import { roofs } from '../world/Roofs.js';

// The pieces of the on-foot camera that are not the walk itself (wave 25C). Pure maths, no GPU: test/camera-rig.mjs.
//
//   LookSlew      the look input as a short slew (60-90 ms to settle) instead of the raw per-frame counts, and the gamepad's
//                 response curve (a soft start, then a little more at a held full tilt; per second, not per frame)
//   sweepArm()    the third-person spring arm as a sphere cast: the world's solid boxes (walls, roofs, hulls that are boxes),
//                 the tree trunks and posts (cylinders), the roofs of the enterable houses (their colliders stop at the
//                 eaves), your own boat's cabin boxes, and what a provider adds (addCameraBlocker: the ships' hull outlines)
//   rayPrism()    one provider's building block: a ray against an extruded convex outline, grown by the sphere's radius
//   StepSmoother  the visual offset of the feet after a step up (stairs, a ledge) or a pop (the pier ladder): the capsule
//                 still steps in one frame, the body and the camera ride the offset down to zero
//   hullCameraBlocker( naval )  a provider for src/features/naval's ships
//
// Frames: world, metres; a ray is origin ( ox, oy, oz ), unit direction ( dx, dy, dz ), length; r is the sphere's radius.

export const LOOK = {
	tau: 0.028, // s: time constant of the slew (90 % of a flick is applied by 64 ms, 95 % by 84 ms)
	padStart: 0.55, // share of the gamepad's turn rate in the first instant of a deflection
	padRamp: 0.22, // s to reach the full rate
	padBoost: 0.2, // extra rate after padBoostAfter s at a full tilt (a long sweep turns faster, a fine aim does not)
	padBoostAfter: 0.45,
	padHz: 60, // the pad's look counts are per frame at this rate (core/Gamepad.js LOOK_BASE): scaled by the real frame time
};

const clamp = ( v, a, b ) => Math.max( a, Math.min( b, v ) );
const smooth = ( t ) => { t = clamp( t, 0, 1 ); return t * t * ( 3 - 2 * t ); };

export class LookSlew {

	constructor( tau = LOOK.tau ) {

		this.tau = tau; // 0 turns the slew off
		this.px = 0; // look counts taken in but not applied yet
		this.py = 0;
		this._held = 0; // s the pad has been deflected
		this._full = 0; // s at a full tilt
		this.out = { x: 0, y: 0 };

	}

	reset() {

		this.px = this.py = this._held = this._full = 0;

	}

	// raw: Input.consumeLook() { x, y, padX?, padY?, pad? } (padX / padY: the gamepad's share of x / y, pad: the stick's tilt 0..1;
	// absent without the Input / Gamepad patch: the pad is then part of x / y, slewed like the mouse). Returns the counts to
	// apply this frame (the same object every call).
	step( dt, raw ) {

		dt = clamp( Number.isFinite( dt ) ? dt : 0, 0, 0.1 );
		const padX = raw.padX || 0, padY = raw.padY || 0, mag = raw.pad || 0;
		let x = raw.x - padX, y = raw.y - padY;
		if ( padX || padY || mag > 0.02 ) {

			this._held = mag > 0.05 ? this._held + dt : 0;
			this._full = mag > 0.85 ? this._full + dt : 0;
			const gain = ( LOOK.padStart + ( 1 - LOOK.padStart ) * smooth( this._held / LOOK.padRamp ) ) * ( 1 + LOOK.padBoost * smooth( ( this._full - LOOK.padBoostAfter ) / 0.4 ) );
			const perSecond = dt * LOOK.padHz; // 1 at 60 Hz: the same turn rate at 30 and at 240 fps
			x += padX * perSecond * gain;
			y += padY * perSecond * gain;

		} else this._held = this._full = 0;

		if ( ! ( this.tau > 0 ) ) {

			this.out.x = x + this.px;
			this.out.y = y + this.py;
			this.px = this.py = 0;
			return this.out;

		}

		this.px += x;
		this.py += y;
		const f = dt > 0 ? 1 - Math.exp( - dt / this.tau ) : 0;
		let ox = this.px * f, oy = this.py * f;
		this.px -= ox;
		this.py -= oy;
		// the last fraction of a count is not worth a frame of crawl
		if ( Math.abs( this.px ) < 0.02 ) { ox += this.px; this.px = 0; }
		if ( Math.abs( this.py ) < 0.02 ) { oy += this.py; this.py = 0; }
		this.out.x = ox;
		this.out.y = oy;
		return this.out;

	}

}

// ---------------------------------------------------------------------------------------------------- the sphere cast

export const ARM_CAST = {
	radius: 0.22, // m: the camera's sphere (the near plane and the lens never reach a wall)
	lowStep: 0.5, // m above the feet: boxes and posts that stay below it do not stop the camera (a bench, a barrel, a kerb)
	minPost: 0.1, // m: cylinders thinner than this (lamp posts, rails) do not stop it
	skipTags: new Set( [ 'ladder' ] ),
};

// the solid boxes of a Colliders world (yaw-only boxes: center, half, cos, sin, top, bottom, radius)
function castBoxes( boxes, ox, oy, oz, dx, dy, dz, len, r, minTop, best ) {

	const dh2 = dx * dx + dz * dz;
	const ey = oy + dy * len, yLo = Math.min( oy, ey ) - r, yHi = Math.max( oy, ey ) + r;
	const skip = ARM_CAST.skipTags;
	for ( let i = 0; i < boxes.length; i ++ ) {

		const b = boxes[ i ];
		if ( ! b.solid || b.top < minTop || b.top < yLo || b.bottom > yHi ) continue;
		const cx = b.center.x - ox, cz = b.center.z - oz;
		const rb = b.radius + r;
		// the box must be near the ray's ground track (the closest approach of the segment to its centre)
		let tc = dh2 > 1e-9 ? ( cx * dx + cz * dz ) / dh2 : 0;
		tc = tc < 0 ? 0 : tc > best ? best : tc;
		const ex = cx - dx * tc, ez = cz - dz * tc;
		if ( ex * ex + ez * ez > rb * rb ) continue;
		if ( b.tag && skip.has( b.tag ) ) continue;
		const lox = - cx * b.cos + cz * b.sin, loz = - cx * b.sin - cz * b.cos; // origin in the box frame (the box centre at 0)
		const ldx = dx * b.cos - dz * b.sin, ldz = dx * b.sin + dz * b.cos;
		const hx = b.half.x + r, hy = b.half.y + r, hz = b.half.z + r;
		const loy = oy - b.center.y;
		// the origin inside the grown box: the body is against it, not behind it - it does not shorten the arm
		if ( Math.abs( lox ) < hx && Math.abs( loz ) < hz && Math.abs( loy ) < hy ) continue;
		let t0 = 0, t1 = best, ok = true;
		for ( let a = 0; a < 3 && ok; a ++ ) {

			const o = a === 0 ? lox : a === 1 ? loy : loz, d = a === 0 ? ldx : a === 1 ? dy : ldz, h = a === 0 ? hx : a === 1 ? hy : hz;
			if ( Math.abs( d ) < 1e-8 ) { if ( Math.abs( o ) > h ) ok = false; continue; }
			let a1 = ( - h - o ) / d, a2 = ( h - o ) / d;
			if ( a1 > a2 ) { const t = a1; a1 = a2; a2 = t; }
			if ( a1 > t0 ) t0 = a1;
			if ( a2 < t1 ) t1 = a2;
			if ( t0 > t1 ) ok = false;

		}

		if ( ok && t0 < best ) best = t0;

	}

	return best;

}

function castCylinders( cyls, ox, oy, oz, dx, dy, dz, len, r, minTop, best ) {

	const dh2 = dx * dx + dz * dz;
	if ( dh2 < 1e-9 ) return best; // straight up or down: the ground and roofs have it
	const ey = oy + dy * len, yLo = Math.min( oy, ey ) - r, yHi = Math.max( oy, ey ) + r;
	for ( let i = 0; i < cyls.length; i ++ ) {

		const c = cyls[ i ];
		if ( c.radius < ARM_CAST.minPost || c.yMax < minTop || c.yMax < yLo || c.yMin > yHi ) continue;
		const R = c.radius + r;
		const rx = ox - c.x, rz = oz - c.z;
		const cc = rx * rx + rz * rz - R * R;
		if ( cc <= 0 ) continue; // the origin is inside the grown post
		const bq = rx * dx + rz * dz; // half b
		if ( bq >= 0 ) continue; // moving away
		const disc = bq * bq - dh2 * cc;
		if ( disc < 0 ) continue;
		const sq = Math.sqrt( disc );
		let t0 = ( - bq - sq ) / dh2, t1 = ( - bq + sq ) / dh2;
		if ( t0 >= best ) continue;
		const y0 = c.yMin - r, y1 = c.yMax + r;
		if ( Math.abs( dy ) < 1e-8 ) {

			if ( oy < y0 || oy > y1 ) continue;

		} else {

			let a1 = ( y0 - oy ) / dy, a2 = ( y1 - oy ) / dy;
			if ( a1 > a2 ) { const t = a1; a1 = a2; a2 = t; }
			if ( a1 > t0 ) t0 = a1;
			if ( a2 < t1 ) t1 = a2;

		}

		if ( t0 < 0 ) t0 = 0;
		if ( t0 <= t1 && t0 < best ) best = t0;

	}

	return best;

}

// a ray against an extruded convex outline, grown by r (Cyrus-Beck on the edge planes, a slab on y).
// poly: { n, x, z, nx, nz } counter-clockwise with outward edge normals (world/boat/HullShape.js placeShape); y0 / y1: its height range.
// Returns the distance, or Infinity: a miss, or the origin already inside (the player stands on / in the thing).
export function rayPrism( poly, y0, y1, ox, oy, oz, dx, dy, dz, len, r ) {

	let t0 = - Infinity, t1 = len;
	for ( let i = 0; i < poly.n; i ++ ) {

		const num = ( ox - poly.x[ i ] ) * poly.nx[ i ] + ( oz - poly.z[ i ] ) * poly.nz[ i ] - r; // > 0: outside this edge's grown plane
		const den = dx * poly.nx[ i ] + dz * poly.nz[ i ];
		if ( Math.abs( den ) < 1e-9 ) { if ( num > 0 ) return Infinity; continue; }
		const t = - num / den;
		if ( den < 0 ) { if ( t > t0 ) t0 = t; } else if ( t < t1 ) t1 = t;
		if ( t0 > t1 ) return Infinity;

	}

	const lo = y0 - r, hi = y1 + r;
	if ( Math.abs( dy ) < 1e-8 ) { if ( oy < lo || oy > hi ) return Infinity; } else {

		let a1 = ( lo - oy ) / dy, a2 = ( hi - oy ) / dy;
		if ( a1 > a2 ) { const t = a1; a1 = a2; a2 = t; }
		if ( a1 > t0 ) t0 = a1;
		if ( a2 < t1 ) t1 = a2;
		if ( t0 > t1 ) return Infinity;

	}

	return t0 <= 0 ? Infinity : t0;

}

const _roof = { n: 4, x: new Float64Array( 4 ), z: new Float64Array( 4 ), nx: new Float64Array( 4 ), nz: new Float64Array( 4 ) };
// +Z forward frame of a shell (registerShell: x, z, yaw): local ( lx, lz ) -> world as Ship.toWorld
const CORNERS = [ [ 1, 1 ], [ - 1, 1 ], [ - 1, - 1 ], [ 1, - 1 ] ];
const NORMALS = [ [ 0, 1 ], [ - 1, 0 ], [ 0, - 1 ], [ 1, 0 ] ];

// the roofs: the enterable houses' (their hollow colliders stop at the eaves) and the ones buildings register (world/Roofs.js: the
// porch eave over a front door is only drawn)
function castRoof( s, cz, hw, hd, y0, y1, ox, oy, oz, dx, dy, dz, r, best ) {

	const rr = Math.hypot( hw, hd ) + Math.abs( cz ) + r + best;
	if ( Math.abs( s.x - ox ) > rr || Math.abs( s.z - oz ) > rr ) return best;
	const sn = Math.sin( s.yaw || 0 ), cs = Math.cos( s.yaw || 0 );
	for ( let i = 0; i < 4; i ++ ) {

		const lx = CORNERS[ i ][ 0 ] * hw, lz = cz + CORNERS[ i ][ 1 ] * hd;
		_roof.x[ i ] = s.x + lx * cs + lz * sn;
		_roof.z[ i ] = s.z - lx * sn + lz * cs;
		_roof.nx[ i ] = NORMALS[ i ][ 0 ] * cs + NORMALS[ i ][ 1 ] * sn;
		_roof.nz[ i ] = - NORMALS[ i ][ 0 ] * sn + NORMALS[ i ][ 1 ] * cs;

	}

	const t = rayPrism( _roof, y0, y1, ox, oy, oz, dx, dy, dz, best, r );
	return t < best ? t : best;

}

function castRoofs( ox, oy, oz, dx, dy, dz, len, r, best ) {

	const map = shells();
	if ( map && map.size ) for ( const s of map.values() ) {

		if ( ! Number.isFinite( s.top ) || ! Number.isFinite( s.floorY ) ) continue;
		const eave = s.floorY + ( s.h || 2.4 ) * ( s.stories || 1 ) - 0.1;
		if ( s.top < eave + 0.2 ) continue;
		best = castRoof( s, 0, s.w / 2 + 0.35, s.d / 2 + 0.35, eave, s.top, ox, oy, oz, dx, dy, dz, r, best );

	}

	const rm = roofs();
	if ( rm && rm.size ) for ( const s of rm.values() ) best = castRoof( s, s.cz || 0, s.w / 2, s.d / 2, s.y0, s.y1, ox, oy, oz, dx, dy, dz, r, best );
	return best;

}

// Your own boat's solid boxes (model.colliders, boat frame, axis aligned): the ray is taken into the boat's frame.
function castBoat( boat, ox, oy, oz, dx, dy, dz, len, r, minTopLocal, best ) {

	const cols = boat && boat.model && boat.model.colliders;
	if ( ! cols || ! cols.length || ! boat.quaternion || ! boat.position ) return best;
	const q = boat.quaternion;
	// v rotated by the inverse of the boat's quaternion: v + 2w (u x v) + 2 u x (u x v), u = -( q.x, q.y, q.z )
	const rot = ( x, y, z, out ) => {

		const ux = - q.x, uy = - q.y, uz = - q.z, w = q.w;
		const cx = uy * z - uz * y, cy = uz * x - ux * z, cz = ux * y - uy * x;
		out[ 0 ] = x + 2 * ( w * cx + uy * cz - uz * cy );
		out[ 1 ] = y + 2 * ( w * cy + uz * cx - ux * cz );
		out[ 2 ] = z + 2 * ( w * cz + ux * cy - uy * cx );

	};

	const lo = _lo, ld = _ld;
	rot( ox - boat.position.x, oy - boat.position.y, oz - boat.position.z, lo );
	rot( dx, dy, dz, ld );
	for ( let i = 0; i < cols.length; i ++ ) {

		const c = cols[ i ];
		if ( ! c.solid ) continue;
		const top = c.center.y + c.half.y;
		if ( top < minTopLocal ) continue;
		const hx = c.half.x + r, hy = c.half.y + r, hz = c.half.z + r;
		const px = lo[ 0 ] - c.center.x, py = lo[ 1 ] - c.center.y, pz = lo[ 2 ] - c.center.z;
		if ( Math.abs( px ) < hx && Math.abs( py ) < hy && Math.abs( pz ) < hz ) continue;
		let t0 = 0, t1 = best, ok = true;
		for ( let a = 0; a < 3 && ok; a ++ ) {

			const o = a === 0 ? px : a === 1 ? py : pz, d = ld[ a ], h = a === 0 ? hx : a === 1 ? hy : hz;
			if ( Math.abs( d ) < 1e-8 ) { if ( Math.abs( o ) > h ) ok = false; continue; }
			let a1 = ( - h - o ) / d, a2 = ( h - o ) / d;
			if ( a1 > a2 ) { const t = a1; a1 = a2; a2 = t; }
			if ( a1 > t0 ) t0 = a1;
			if ( a2 < t1 ) t1 = a2;
			if ( t0 > t1 ) ok = false;

		}

		if ( ok && t0 < best ) best = t0;

	}

	return best;

}

const _lo = [ 0, 0, 0 ], _ld = [ 0, 0, 0 ];

// How far a sphere of radius r can travel from ( ox, oy, oz ) along ( dx, dy, dz ) before it touches something, up to len.
// w: { colliders, boat, blockers: [ fn( ox, oy, oz, dx, dy, dz, len, r ) -> distance | Infinity ], feetY }
export function sweepArm( w, ox, oy, oz, dx, dy, dz, len, r = ARM_CAST.radius ) {

	let best = len;
	const minTop = ( Number.isFinite( w.feetY ) ? w.feetY : oy - 1.5 ) + ARM_CAST.lowStep;
	const col = w.colliders;
	if ( col ) {

		if ( col.boxes ) best = castBoxes( col.boxes, ox, oy, oz, dx, dy, dz, len, r, minTop, best );
		if ( col.cylinders ) best = castCylinders( col.cylinders, ox, oy, oz, dx, dy, dz, len, r, minTop, best );

	}

	best = castRoofs( ox, oy, oz, dx, dy, dz, best, r, best );
	if ( w.boat ) best = castBoat( w.boat, ox, oy, oz, dx, dy, dz, len, r, minTop - ( w.boat.position ? w.boat.position.y : 0 ), best );
	const bl = w.blockers;
	if ( bl ) for ( let i = 0; i < bl.length; i ++ ) {

		let t = Infinity;
		try { t = bl[ i ]( ox, oy, oz, dx, dy, dz, best, r ); } catch ( e ) { t = Infinity; }
		if ( t < best ) best = t;

	}

	return best < 0 ? 0 : best;

}

// ---------------------------------------------------------------------------------------------------- the ships' hulls

const _hull = { n: 0, x: new Float64Array( 32 ), z: new Float64Array( 32 ), nx: new Float64Array( 32 ), nz: new Float64Array( 32 ) };

// A provider for Player.addCameraBlocker: every ship's hull outline (naval._hullShape, HullShape.placeShape) from her keel to her
// sheer. A ship you stand in (the origin inside her outline) never stops the arm.
// placeShape is passed in (the player folder does not import the world's boat code).
export function hullCameraBlocker( naval, placeShape ) {

	return ( ox, oy, oz, dx, dy, dz, len, r ) => {

		let best = Infinity;
		const ships = naval && naval.ships;
		if ( ! ships || ! placeShape ) return best;
		for ( let i = 0; i < ships.length; i ++ ) {

			const s = ships[ i ], c = s.cls;
			if ( ! c || ! s.pose ) continue;
			const reach = c.length * 0.6 + len + r;
			if ( Math.abs( s.x - ox ) > reach || Math.abs( s.z - oz ) > reach ) continue;
			const shape = naval._hullShape( s );
			if ( ! shape || shape.n > 32 ) continue;
			const p = placeShape( shape, s.x, s.z, s.yaw, _hull );
			const t = rayPrism( p, s.pose.y - ( c.draft || 1 ), s.pose.y + ( c.sheer || 2 ), ox, oy, oz, dx, dy, dz, Math.min( len, best ), r );
			if ( t < best ) best = t;

		}

		return best;

	};

}

// ---------------------------------------------------------------------------------------------------- steps

export const STEP = {
	maxUp: 0.45, // m: a pop larger than this is not smoothed (a teleport)
	rate: 11, // 1/s: the offset eases to zero (exponential)
	floor: 0.5, // m/s: and at least this fast (it ends)
	slope: 1.3, // rise per metre walked that is a slope, not a step
	slack: 0.03, // m of every frame's rise that is the terrain's own
	maxOff: 0.42, // m: the feet never trail the real ground by more
	maxDown: 0.36, // m: a drop of this much or less while walking is a step down (the feet stay on the ground)
};

// The visual offset between the physical feet and the body / camera: add( dy ) when the physics moved up by dy in one go (the
// body stays where it was and eases up), carry( dx, dy, dz ) for a jump of any direction (a ladder's top).
export class StepSmoother {

	constructor() {

		this.x = 0;
		this.y = 0;
		this.z = 0;
		this.rate = STEP.rate;

	}

	get active() {

		return this.x !== 0 || this.y !== 0 || this.z !== 0;

	}

	clear() {

		this.x = this.y = this.z = 0;
		this.rate = STEP.rate;

	}

	// the physics rose by dy (> 0) or dropped (< 0) in one step: the visual keeps its place
	step( dy ) {

		this.y = clamp( this.y - dy, - STEP.maxOff, STEP.maxOff );
		this.rate = STEP.rate;

	}

	// the physics moved by ( dx, dy, dz ): the visual stays and eases over
	carry( dx, dy, dz, maxLen = 1.8 ) {

		this.x -= dx; this.y -= dy; this.z -= dz;
		const l = Math.hypot( this.x, this.y, this.z );
		if ( l > maxLen ) { const k = maxLen / l; this.x *= k; this.y *= k; this.z *= k; }
		this.rate = 6;

	}

	update( dt ) {

		if ( ! this.active || ! ( dt > 0 ) ) return;
		const l = Math.hypot( this.x, this.y, this.z );
		const k = Math.exp( - this.rate * dt );
		const nl = Math.max( 0, Math.min( l * k, l - STEP.floor * dt ) );
		if ( nl < 1e-3 ) { this.x = this.y = this.z = 0; return; }
		const s = nl / l;
		this.x *= s; this.y *= s; this.z *= s;

	}

}
