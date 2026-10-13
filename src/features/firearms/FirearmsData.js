// Firearms data and the pure maths the feature and its test share (no engine, no DOM).
//
//   WEAPONS[ id ]          the flintlock pistol and the musket: price, reload (s), draw (s), range / falloff (m), damage,
//                          spread / aimSpread (deg, the half-angle of the cone the ball leaves in), energy (J on props),
//                          walk (speed factor while drawn), zoom (FOV divisor while aiming), report (the sound)
//   POUCH                  the chandlery's cartridge pouch: `count` cartridges for `price`
//   damageAt( w, d )       damage of weapon w at d m (full to falloff, half at range, nothing past maxRange)
//   spreadRad( w, aiming ) the cone half-angle in radians
//   spreadDir( dir, half, u, v, out )   a direction inside the cone round dir (u, v uniform 0..1: uniform over the disc)
//   angleBetween( a, b )   radians between two unit vectors

export const DEG = Math.PI / 180;

export const WEAPONS = {
	pistol: {
		id: 'pistol', name: 'Flintlock pistol', price: 180, reload: 1.4, draw: 0.35, holster: 0.25,
		range: 22, falloff: 15, damage: 35, spread: 2.5, aimSpread: 1.0, energy: 420,
		walk: 1, zoom: 1.3, report: 'pistol', flash: 0.35, smoke: 0.35, kick: 0.8,
		desc: 'One shot, quick to load. Deadly inside 15 m, weak past 22 m',
	},
	musket: {
		id: 'musket', name: 'Musket', price: 420, reload: 3.2, draw: 0.8, holster: 0.45,
		range: 70, falloff: 45, damage: 70, spread: 1.2, aimSpread: 0.4, energy: 1500,
		walk: 0.85, zoom: 1.3, report: 'musket', flash: 0.6, smoke: 0.7, kick: 1.4,
		desc: 'One shot, a slow reload. Reaches 70 m; you walk a little slower with it shouldered',
	},
};

export const ORDER = [ 'pistol', 'musket' ];
export const POUCH = { id: 'pouch', name: 'Cartridge pouch', count: 12, price: 30, max: 120 };
// a ball keeps flying past the effective range at half power, fading to nothing at range * MAX_RANGE
export const MAX_RANGE = 1.5;
export const HEADSHOT = 1.6;

export const clamp = ( v, a, b ) => ( v < a ? a : v > b ? b : v );

export function maxRange( w ) {

	return w.range * MAX_RANGE;

}

// full damage to the falloff distance, then down to half at the effective range, then to nothing at maxRange
export function damageAt( w, d ) {

	if ( ! w || ! ( d >= 0 ) ) return 0;
	let k;
	if ( d <= w.falloff ) k = 1;
	else if ( d <= w.range ) k = 1 - 0.5 * ( d - w.falloff ) / ( w.range - w.falloff );
	else k = 0.5 * Math.max( 0, 1 - ( d - w.range ) / ( maxRange( w ) - w.range ) );
	return w.damage * k;

}

export function spreadRad( w, aiming ) {

	return ( aiming ? w.aimSpread : w.spread ) * DEG;

}

// a unit direction inside the cone of half-angle `half` round the unit vector dir; u, v in 0..1 (uniform over the disc)
export function spreadDir( dir, half, u, v, out = {} ) {

	const a = half * Math.sqrt( clamp( u, 0, 1 ) ), phi = v * Math.PI * 2;
	// a basis perpendicular to dir
	let px, py, pz;
	if ( Math.abs( dir.y ) < 0.9 ) { px = - dir.z; py = 0; pz = dir.x; } else { px = 0; py = dir.z; pz = - dir.y; }
	let l = Math.hypot( px, py, pz ) || 1;
	px /= l; py /= l; pz /= l;
	const qx = dir.y * pz - dir.z * py, qy = dir.z * px - dir.x * pz, qz = dir.x * py - dir.y * px;
	const s = Math.sin( a ), c = Math.cos( a ), cp = Math.cos( phi ), sp = Math.sin( phi );
	out.x = dir.x * c + ( px * cp + qx * sp ) * s;
	out.y = dir.y * c + ( py * cp + qy * sp ) * s;
	out.z = dir.z * c + ( pz * cp + qz * sp ) * s;
	l = Math.hypot( out.x, out.y, out.z ) || 1;
	out.x /= l; out.y /= l; out.z /= l;
	return out;

}

export function angleBetween( a, b ) {

	return Math.acos( clamp( a.x * b.x + a.y * b.y + a.z * b.z, - 1, 1 ) );

}

// the camera's forward ( -Z rotated by its quaternion )
export function forwardOf( q, out = {} ) {

	const x = q.x, y = q.y, z = q.z, w = q.w;
	out.x = - 2 * ( x * z + w * y );
	out.y = - 2 * ( y * z - w * x );
	out.z = - ( 1 - 2 * ( x * x + y * y ) );
	const l = Math.hypot( out.x, out.y, out.z ) || 1;
	out.x /= l; out.y /= l; out.z /= l;
	return out;

}

// ---- ray tests (o, d: plain { x, y, z }; d unit). Return the distance along the ray or -1

export function raySphere( o, d, c, r ) {

	const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
	const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r;
	const disc = b * b - cc;
	if ( disc < 0 ) return - 1;
	const s = Math.sqrt( disc );
	const t = - b - s;
	if ( t >= 0 ) return t;
	return - b + s >= 0 ? 0 : - 1; // inside

}

// a vertical cylinder ( x, z, radius r ) from y0 to y1: the side (and the top cap)
export function rayCylinderY( o, d, x, z, r, y0, y1 ) {

	const ox = o.x - x, oz = o.z - z;
	const a = d.x * d.x + d.z * d.z;
	let best = - 1;
	if ( a > 1e-9 ) {

		const b = ox * d.x + oz * d.z, c = ox * ox + oz * oz - r * r;
		const disc = b * b - a * c;
		if ( disc >= 0 ) {

			const t = ( - b - Math.sqrt( disc ) ) / a;
			if ( t >= 0 ) {

				const y = o.y + d.y * t;
				if ( y >= y0 && y <= y1 ) best = t;

			}

		}

	}

	// from above (a shot down on someone's crown or shoulders)
	if ( Math.abs( d.y ) > 1e-6 ) {

		const t = ( y1 - o.y ) / d.y;
		if ( t >= 0 && ( best < 0 || t < best ) ) {

			const hx = ox + d.x * t, hz = oz + d.z * t;
			if ( hx * hx + hz * hz <= r * r ) best = t;

		}

	}

	return best;

}
