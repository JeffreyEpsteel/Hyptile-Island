// The fighters' guns (wave 26A), pure: mounts harmonised on the gunsight line at the convergence range, rate of fire,
// ammunition, barrel heat (the machine guns jam when hot until they cool; the cannons have few rounds), dispersion, the
// rounds as ballistic points (gravity, ~1.5 s of life) and their hits on the parts' spheres (Warbirds.js parts).
//
//   const g = new Guns( 'sabrewing' );  g.convergence = 250;
//   g.fire( dt, trigger, flight, out[] )         new rounds pushed to out (world position, velocity, dmg, tracer, owner)
//   g.state() -> { ammo, ammoMax, heat, jammed, cannon? }   g.rearm()   g.firing (rounds this frame)
//   const b = new Bullets();  b.add( round );  b.update( dt, targets, hits[], env )   b.list (live rounds, for tracers)
//   aimPoint( mount, eye, cv, vel ) -> [ x, y, z ]    leadPoint( shooterPos, shooterVel, targetPos, targetVel, vel ) -> { x, y, z, t }
//   segmentSphere( ax, ay, az, bx, by, bz, cx, cy, cz, r ) -> t (0..1) | -1
//   hitParts( localA, localB, parts ) -> { part, t } | null
// A target: { id, kind: 'fighter' | 'drone', flight (position, quaternion, toLocal), parts (Warbirds parts), radius, armed,
// can( owner ) -> bool (Consent.js: may this owner hurt it) }.

import { Vector3, Quaternion } from '../../engine/index.js';
import { WARBIRDS, G0 } from './Warbirds.js';

export const LIFE = 1.55; // s a round flies
export const CONVERGENCE = [ 150, 250, 350, 450 ]; // m: the hangar's choices (default 250)
export const RESUME = 0.35; // a jammed gun clears once its heat is back under this

const _a = new Vector3(), _b = new Vector3(), _d = new Vector3(), _q = new Quaternion();

// where a mount's guns point (model frame): through the sight line ( eye + forward * cv ), raised by the drop at that range
export function aimPoint( mount, eye, cv, vel = 830 ) {

	const t = cv / vel;
	return [ eye[ 0 ], eye[ 1 ] + 0.5 * G0 * t * t, eye[ 2 ] + cv ];

}

// t in 0..1 where the segment a -> b first enters the sphere, or -1 (an origin inside counts as 0)
export function segmentSphere( ax, ay, az, bx, by, bz, cx, cy, cz, r ) {

	const dx = bx - ax, dy = by - ay, dz = bz - az;
	const fx = ax - cx, fy = ay - cy, fz = az - cz;
	const a = dx * dx + dy * dy + dz * dz;
	const c = fx * fx + fy * fy + fz * fz - r * r;
	if ( c <= 0 ) return 0;
	if ( a < 1e-12 ) return - 1;
	const b = 2 * ( fx * dx + fy * dy + fz * dz );
	const disc = b * b - 4 * a * c;
	if ( disc < 0 ) return - 1;
	const t = ( - b - Math.sqrt( disc ) ) / ( 2 * a );
	return t >= 0 && t <= 1 ? t : - 1;

}

// the first part sphere a model-frame segment enters: { part, t, sphere } | null
export function hitParts( a, b, parts ) {

	let best = null;
	for ( const part in parts ) for ( const s of parts[ part ] ) {

		const t = segmentSphere( a.x, a.y, a.z, b.x, b.y, b.z, s[ 0 ], s[ 1 ], s[ 2 ], s[ 3 ] );
		if ( t >= 0 && ( ! best || t < best.t ) ) best = { part, t, sphere: s };

	}

	return best;

}

// the point to put the sight on to hit a target flying straight: where it will be when the rounds arrive, plus their drop
export function leadPoint( sp, sv, tp, tv, vel = 830 ) {

	let t = 0;
	for ( let i = 0; i < 4; i ++ ) {

		const x = tp.x + tv.x * t - sp.x, y = tp.y + tv.y * t - sp.y, z = tp.z + tv.z * t - sp.z;
		const d = Math.hypot( x, y, z );
		// the rounds carry the shooter's way along the line of fire
		const along = d > 1e-3 ? ( sv.x * x + sv.y * y + sv.z * z ) / d : 0;
		t = d / Math.max( 200, vel + along );

	}

	return { x: tp.x + tv.x * t, y: tp.y + tv.y * t + 0.5 * G0 * t * t, z: tp.z + tv.z * t, t };

}

export class Guns {

	constructor( id = 'sabrewing', { rng = Math.random } = {} ) {

		const W = WARBIRDS[ id ] || WARBIRDS.sabrewing;
		this.id = W.id;
		this.W = W;
		this.rng = rng;
		this.convergence = 250;
		this.mounts = W.guns.map( ( g ) => ( { ...g, left: g.ammo, heat: 0, jam: false, acc: 0, n: 0 } ) );
		this.firing = 0;
		this.shots = 0;
		this._dirs = null;
		this._cv = - 1;

	}

	rearm() {

		for ( const m of this.mounts ) {

			m.left = m.ammo;
			m.heat = 0;
			m.jam = false;
			m.acc = 0;

		}

	}

	// each mount's unit aim direction (model frame), cached per convergence
	dirs() {

		if ( this._dirs && this._cv === this.convergence ) return this._dirs;
		this._cv = this.convergence;
		this._dirs = this.mounts.map( ( m ) => {

			const p = aimPoint( m, this.W.sight, this.convergence, m.vel );
			const x = p[ 0 ] - m.at[ 0 ], y = p[ 1 ] - m.at[ 1 ], z = p[ 2 ] - m.at[ 2 ];
			const l = Math.hypot( x, y, z );
			return [ x / l, y / l, z / l ];

		} );
		return this._dirs;

	}

	// pull the trigger for dt: rounds into out (world frame, from the flight's pose); returns how many
	fire( dt, trigger, flight, out = [], owner = null ) {

		this.firing = 0;
		const dirs = this.dirs();
		for ( let i = 0; i < this.mounts.length; i ++ ) {

			const m = this.mounts[ i ];
			if ( ! trigger || m.left <= 0 || m.jam ) {

				// barrels cool when they rest; a jammed one clears under RESUME
				m.acc = 0;
				m.heat = Math.max( 0, m.heat - m.cool * dt );
				if ( m.jam && m.heat < RESUME ) m.jam = false;
				continue;

			}

			m.acc += m.rof * dt;
			while ( m.acc >= 1 && m.left > 0 && ! m.jam ) {

				m.acc -= 1;
				m.left --;
				m.n ++;
				m.heat += m.heatPer;
				if ( m.heatPer > 0 && m.heat >= 1 ) {

					m.heat = 1;
					m.jam = true;

				}

				if ( flight && out ) out.push( this._round( m, dirs[ i ], flight, owner, m.acc / m.rof ) );
				this.firing ++;
				this.shots ++;

			}

		}

		return this.firing;

	}

	_round( m, dir, flight, owner, age ) {

		const q = flight.quaternion;
		const s = m.spread, r = this.rng;
		// a little dispersion: a cone of ~spread radians
		_d.set( dir[ 0 ] + ( r() - 0.5 ) * 2 * s, dir[ 1 ] + ( r() - 0.5 ) * 2 * s, dir[ 2 ] ).normalize().applyQuaternion( q );
		const p = _a.set( m.at[ 0 ], m.at[ 1 ], m.at[ 2 ] ).applyQuaternion( q ).add( flight.position );
		const v = flight.velocity;
		const vx = v.x + _d.x * m.vel, vy = v.y + _d.y * m.vel, vz = v.z + _d.z * m.vel;
		// (the part of the frame the round was already out: it does not all start at the muzzle)
		return {
			x: p.x + vx * age, y: p.y + vy * age, z: p.z + vz * age, vx, vy, vz, t: age, owner, kind: m.kind,
			dmg: m.dmg, shell: m.shell, tracer: m.n % m.tracer === 0, px: p.x, py: p.y, pz: p.z,
		};

	}

	state() {

		let ammo = 0, max = 0, heat = 0, jam = false, can = 0, canMax = 0;
		for ( const m of this.mounts ) {

			if ( m.kind === 'cannon' ) {

				can += m.left;
				canMax += m.ammo;

			} else {

				ammo += m.left;
				max += m.ammo;
				heat = Math.max( heat, m.heat );
				jam = jam || m.jam;

			}

		}

		return { ammo, ammoMax: max, heat, jammed: jam, cannon: canMax ? can : null, cannonMax: canMax || null, empty: ammo + can <= 0 };

	}

	toJSON() {

		return { cv: this.convergence, left: this.mounts.map( ( m ) => m.left ) };

	}

	fromJSON( d ) {

		if ( ! d || typeof d !== 'object' ) return;
		if ( CONVERGENCE.includes( d.cv ) ) this.convergence = d.cv;
		if ( Array.isArray( d.left ) ) this.mounts.forEach( ( m, i ) => {

			const v = d.left[ i ];
			if ( Number.isFinite( v ) ) m.left = Math.max( 0, Math.min( m.ammo, Math.round( v ) ) );

		} );

	}

}

// the rounds in the air: gravity, the targets' part spheres, the sea and the ground
export class Bullets {

	constructor( { max = 900 } = {} ) {

		this.list = [];
		this.max = max;

	}

	add( r ) {

		if ( this.list.length >= this.max ) this.list.shift();
		this.list.push( r );

	}

	clear() {

		this.list.length = 0;

	}

	// targets: [ { id, flight, parts, radius, can( owner ) } ]; hits: { target, part, x, y, z, local: [ x, y, z ], dmg, shell,
	// owner, kind } pushed; env: { waterAt( x, z ), groundAt( x, z ), onImpact( kind, x, y, z, round ) }
	update( dt, targets = [], hits = [], env = {} ) {

		const L = this.list;
		let w = 0;
		for ( let i = 0; i < L.length; i ++ ) {

			const r = L[ i ];
			const ax = r.x, ay = r.y, az = r.z;
			r.vy -= G0 * dt;
			r.x += r.vx * dt;
			r.y += r.vy * dt;
			r.z += r.vz * dt;
			r.t += dt;
			r.px = ax; r.py = ay; r.pz = az;
			let gone = r.t > LIFE;
			if ( ! gone ) {

				let best = null;
				for ( const tg of targets ) {

					if ( tg.id === r.owner || ( tg.can && ! tg.can( r.owner ) ) ) continue;
					const p = tg.flight.position, R = tg.radius || 7;
					// (broad phase: the segment's closest approach to the target's centre)
					const sx = r.x - ax, sy = r.y - ay, sz = r.z - az;
					const l2 = sx * sx + sy * sy + sz * sz;
					const k = l2 > 0 ? Math.max( 0, Math.min( 1, ( ( p.x - ax ) * sx + ( p.y - ay ) * sy + ( p.z - az ) * sz ) / l2 ) ) : 0;
					if ( Math.hypot( ax + sx * k - p.x, ay + sy * k - p.y, az + sz * k - p.z ) > R ) continue;
					_q.copy( tg.flight.quaternion ).invert();
					_a.set( ax - p.x, ay - p.y, az - p.z ).applyQuaternion( _q );
					_b.set( r.x - p.x, r.y - p.y, r.z - p.z ).applyQuaternion( _q );
					const h = hitParts( _a, _b, tg.parts );
					if ( h && ( ! best || h.t < best.h.t ) ) best = { tg, h, lx: _a.x + ( _b.x - _a.x ) * h.t, ly: _a.y + ( _b.y - _a.y ) * h.t, lz: _a.z + ( _b.z - _a.z ) * h.t };

				}

				if ( best ) {

					const t = best.h.t;
					hits.push( {
						target: best.tg.id, part: best.h.part, dmg: r.dmg, shell: r.shell, owner: r.owner, kind: r.kind,
						x: ax + ( r.x - ax ) * t, y: ay + ( r.y - ay ) * t, z: az + ( r.z - az ) * t, local: [ best.lx, best.ly, best.lz ], at: r.at,
					} );
					gone = true;

				}

			}

			if ( ! gone && env.waterAt ) {

				const sea = env.waterAt( r.x, r.z );
				if ( r.y < sea ) {

					if ( env.onImpact ) env.onImpact( 'water', r.x, sea, r.z, r );
					gone = true;

				} else if ( env.groundAt ) {

					const g = env.groundAt( r.x, r.z );
					if ( Number.isFinite( g ) && r.y < g ) {

						if ( env.onImpact ) env.onImpact( 'ground', r.x, g, r.z, r );
						gone = true;

					}

				}

			}

			if ( ! gone ) L[ w ++ ] = r;

		}

		L.length = w;
		return hits;

	}

}

