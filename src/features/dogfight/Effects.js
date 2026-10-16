// The dogfight's own effects (wave 26A): tracer streaks and muzzle flashes (one instanced draw, unlit and hot so the
// bloom picks them up) and the wingtip vapour trails ("contrails at speed": ribbons of short segments from both
// wingtips while a fighter is fast or pulling hard, fading over a few seconds; one instanced transparent draw). Smoke,
// fire, splashes and explosions go through the vfx feature (features.get( 'vfx' )).
//
//   const fx = new DogfightFx( { scene } );
//   fx.tracers( rounds, camera )   rounds: Bullets.list (tracer ones drawn)   fx.flash( x, y, z, dx, dy, dz, kind )
//   fx.trail( key, flight, intensity01, dt )   per fighter and frame (intensity 0: no new vapour)   fx.update( dt, camera )
//   fx.dispose()    (no scene: everything is counted, nothing drawn - node tests)

import { InstancedMesh, BoxGeometry, CylinderGeometry, Matrix4, Quaternion, Vector3, Color } from '../../engine/index.js';
import { Material } from '../../engine/render/Material.js';
import { LAYERS } from '../../core/SceneRenderer.js';

export const TRACER = { max: 420, len: 14, flashes: 48 };
export const VAPOUR = { life: 1.8, every: 0.02, keep: 140, max: 2400, speed: 118, g: 4.2, w0: 0.14, grow: 0.9 };
export const SMOKE = { life: 5, every: 0.035, w0: 0.7, grow: 7 };
export const TRACER_COLOR = {
	light: [ 1.0, 0.62, 0.22 ], heavy: [ 1.0, 0.42, 0.16 ], cannon: [ 1.0, 0.88, 0.5 ], raider: [ 0.55, 1.0, 0.45 ], flash: [ 1.0, 0.75, 0.35 ],
};

const _m = new Matrix4(), _q = new Quaternion(), _p = new Vector3(), _s = new Vector3(), _d = new Vector3(), _z = new Vector3( 0, 0, 1 ), _c = new Color();
const _a = new Vector3(), _b = new Vector3();

export class DogfightFx {

	constructor( { scene = null } = {} ) {

		this.scene = scene;
		this.trails = new Map(); // key -> { pts: [ [ x, y, z, t, a ] x2 tips ], acc }
		this.flashes = [];
		this.t = 0;
		this.drawn = { tracers: 0, vapour: 0 };
		this.tracerMesh = null;
		this.vapourMesh = null;
		if ( ! scene ) return;
		const geo = new BoxGeometry( 1, 1, 1 );
		const hot = new Material( {
			name: 'dogfight-tracer', lit: false, color: new Color( 0, 0, 0 ), velocityWeight: 0,
			surface: 's.albedo = vec3f( 0.0 ); s.emissive = in.color.rgb * 9.0;',
		} );
		this.tracerMesh = new InstancedMesh( geo, hot, TRACER.max + TRACER.flashes );
		this.tracerMesh.name = 'dogfight-tracers';
		this.tracerMesh.frustumCulled = false;
		this.tracerMesh.noSizeCull = true;
		this.tracerMesh.castShadow = false;
		this.tracerMesh.receiveShadow = false;
		this.tracerMesh.count = 0;
		this.tracerMesh.setColorAt( 0, _c.setRGB( 1, 1, 1 ) );
		scene.add( this.tracerMesh );
		const vap = new Material( {
			name: 'dogfight-vapour', color: new Color( 0.96, 0.97, 1.0 ), roughness: 1, transparent: true, depthWrite: false, velocityWeight: 0, side: 'double',
			surface: 's.alpha = in.color.g * 0.5; s.albedo = vec3f( in.color.r ); s.emissive = vec3f( 0.04 ) * in.color.r + vec3f( 3.0, 1.1, 0.2 ) * in.color.b; s.alpha = min( 0.85, s.alpha + in.color.b * 0.5 );',
		} );
		// (a round tube along +Z for the trails: no flat faces, and the segments end where the next begins)
		const tube = new CylinderGeometry( 0.5, 0.5, 1, 8, 1, true );
		tube.rotateX( Math.PI / 2 );
		this.vapourMesh = new InstancedMesh( tube, vap, VAPOUR.max );
		this.vapourMesh.name = 'dogfight-vapour';
		this.vapourMesh.layers.set( LAYERS.TRANSPARENT );
		this.vapourMesh.frustumCulled = false;
		this.vapourMesh.noSizeCull = true;
		this.vapourMesh.castShadow = false;
		this.vapourMesh.receiveShadow = false;
		this.vapourMesh.count = 0;
		this.vapourMesh.setColorAt( 0, _c.setRGB( 1, 1, 1 ) );
		scene.add( this.vapourMesh );

	}

	// a muzzle flash this frame (drawn once)
	flash( x, y, z, dx, dy, dz, kind = 'light' ) {

		if ( this.flashes.length < TRACER.flashes ) this.flashes.push( { x, y, z, dx, dy, dz, kind } );

	}

	// one streak per tracer round: from where it was a streak's length ago to where it is
	tracers( rounds, camera ) {

		const im = this.tracerMesh;
		let n = 0;
		const cam = camera && camera.position;
		for ( const r of rounds ) {

			if ( ! r.tracer || n >= TRACER.max ) continue;
			const sp = Math.hypot( r.vx, r.vy, r.vz ) || 1;
			const len = Math.min( TRACER.len, sp * Math.max( 0.004, r.t ) );
			_d.set( r.vx / sp, r.vy / sp, r.vz / sp );
			_p.set( r.x - _d.x * len * 0.5, r.y - _d.y * len * 0.5, r.z - _d.z * len * 0.5 );
			// thicker with distance, so a far burst still reads as a line (about 1.5 px)
			const dist = cam ? Math.hypot( cam.x - _p.x, cam.y - _p.y, cam.z - _p.z ) : 50;
			const w = Math.max( 0.1, dist * 0.0024 );
			if ( im ) {

				_q.setFromUnitVectors( _z, _d );
				_m.compose( _p, _q, _s.set( w, w, len ) );
				im.setMatrixAt( n, _m );
				const c = TRACER_COLOR[ r.owner && String( r.owner ).startsWith( 'ai:' ) ? 'raider' : r.kind ] || TRACER_COLOR.light;
				im.setColorAt( n, _c.setRGB( c[ 0 ], c[ 1 ], c[ 2 ] ) );

			}

			n ++;

		}

		for ( const f of this.flashes ) {

			if ( n >= TRACER.max + TRACER.flashes ) break;
			if ( im ) {

				_d.set( f.dx, f.dy, f.dz ).normalize();
				_q.setFromUnitVectors( _z, _d );
				const big = f.kind === 'cannon' ? 1.6 : 1;
				_p.set( f.x + _d.x * 0.35 * big, f.y + _d.y * 0.35 * big, f.z + _d.z * 0.35 * big );
				// (a flicker: not every round's flash is the same size)
				const k = big * ( 0.55 + 0.45 * ( ( n * 7919 + Math.floor( this.t * 60 ) ) % 5 ) / 4 );
				_m.compose( _p, _q, _s.set( 0.1 * k, 0.1 * k, 0.32 * k ) );
				im.setMatrixAt( n, _m );
				const c = TRACER_COLOR.flash;
				im.setColorAt( n, _c.setRGB( c[ 0 ] * 0.6, c[ 1 ] * 0.5, c[ 2 ] * 0.3 ) );

			}

			n ++;

		}

		this.flashes.length = 0;
		this.drawn.tracers = n;
		if ( im ) {

			im.count = n;
			im.visible = n > 0;
			if ( n ) {

				im.instanceMatrix.needsUpdate = true;
				if ( im.instanceColor ) im.instanceColor.needsUpdate = true;

			}

		}

		return n;

	}

	// the wingtips' vapour: intensity 0..1 (speed and g); points every VAPOUR.every s while it is above 0
	trail( key, flight, intensity, dt, span = 11 ) {

		const tr = this._trail( key, 2, 'vapour' );
		tr.acc += dt;
		if ( tr.acc < VAPOUR.every ) return;
		tr.acc = 0;
		const half = span / 2 - 0.15;
		for ( let k = 0; k < 2; k ++ ) {

			flight.toWorld( [ k ? - half : half, 0.02, - 0.35 ], _a );
			this._push( tr.tips[ k ], _a, intensity, 0 );

		}

	}

	// a damaged engine's smoke (intensity 0..1, dark with damage) and its fire (the first metres glow): one ribbon
	smoke( key, x, y, z, intensity, fire, dt ) {

		const tr = this._trail( key, 1, 'smoke' );
		tr.acc += dt;
		if ( tr.acc < SMOKE.every ) return;
		tr.acc = 0;
		this._push( tr.tips[ 0 ], _a.set( x, y, z ), intensity, fire ? 1 : 0 );

	}

	_trail( key, n, kind ) {

		let tr = this.trails.get( key );
		if ( ! tr ) {

			tr = { tips: Array.from( { length: n }, () => [] ), acc: 0, last: 0, kind };
			this.trails.set( key, tr );

		}

		tr.last = this.t;
		return tr;

	}

	_push( pts, p, intensity, fire ) {

		if ( intensity > 0.02 ) pts.push( [ p.x, p.y, p.z, this.t, intensity, fire ] );
		else if ( pts.length && pts[ pts.length - 1 ][ 4 ] > 0 ) pts.push( [ ...pts[ pts.length - 1 ].slice( 0, 3 ), this.t, 0, 0 ] ); // (a break)
		while ( pts.length > VAPOUR.keep ) pts.shift();

	}

	update( dt, camera ) {

		this.t += dt;
		const im = this.vapourMesh;
		let n = 0, nv = 0, ns = 0;
		for ( const [ key, tr ] of this.trails ) {

			const S = tr.kind === 'smoke' ? SMOKE : VAPOUR;
			for ( const pts of tr.tips ) {

				while ( pts.length && this.t - pts[ 0 ][ 3 ] > S.life ) pts.shift();
				for ( let i = 1; i < pts.length && n < VAPOUR.max; i ++ ) {

					const A = pts[ i - 1 ], B = pts[ i ];
					if ( ! A[ 4 ] || ! B[ 4 ] ) continue;
					const age = ( this.t - B[ 3 ] ) / S.life;
					const a = Math.min( A[ 4 ], B[ 4 ] ) * ( 1 - age ) * ( tr.kind === 'smoke' ? 1 : 1 - age );
					if ( a < 0.01 ) continue;
					if ( im ) {

						_a.set( A[ 0 ], A[ 1 ], A[ 2 ] );
						_b.set( B[ 0 ], B[ 1 ], B[ 2 ] );
						_d.subVectors( _b, _a );
						const len = _d.length();
						if ( len < 1e-3 ) continue;
						_d.multiplyScalar( 1 / len );
						_q.setFromUnitVectors( _z, _d );
						// the trail spreads as it ages (smoke much more than vapour)
						const w = S.w0 + age * S.grow;
						_m.compose( _p.addVectors( _a, _b ).multiplyScalar( 0.5 ), _q, _s.set( w, w * ( tr.kind === 'smoke' ? 0.9 : 0.7 ), len ) );
						im.setMatrixAt( n, _m );
						// (r: the grey, g: the opacity, b: the fire's glow)
						if ( tr.kind === 'smoke' ) {

							const glow = B[ 5 ] ? Math.max( 0, 1 - age * 30 ) : 0;
							im.setColorAt( n, _c.setRGB( 0.12 + age * 0.35, a * 0.9, glow ) );

						} else im.setColorAt( n, _c.setRGB( 0.95, a * 0.35, 0 ) );

					}

					n ++;
					if ( tr.kind === 'smoke' ) ns ++;
					else nv ++;

				}

			}

			if ( tr.tips.every( ( p ) => ! p.length ) && this.t - tr.last > 1 ) this.trails.delete( key );

		}

		this.drawn.vapour = nv;
		this.drawn.smoke = ns;
		if ( im ) {

			im.count = n;
			im.visible = n > 0;
			if ( n ) {

				im.instanceMatrix.needsUpdate = true;
				if ( im.instanceColor ) im.instanceColor.needsUpdate = true;

			}

		}

	}

	// how much vapour a fighter makes: fast, or pulling hard (0..1)
	static vapour( speed, g ) {

		const s = Math.max( 0, Math.min( 1, ( speed - VAPOUR.speed ) / 35 ) );
		const p = Math.max( 0, Math.min( 1, ( Math.abs( g ) - VAPOUR.g ) / 2.5 ) ) * Math.min( 1, speed / 70 );
		return Math.max( s * 0.7, p );

	}

	dispose() {

		for ( const m of [ this.tracerMesh, this.vapourMesh ] ) {

			if ( ! m ) continue;
			m.removeFromParent();
			m.geometry.dispose && m.geometry.dispose();
			if ( m === this.vapourMesh ) { /* (its own tube) */ }
			m.material.dispose && m.material.dispose();

		}

		this.tracerMesh = this.vapourMesh = null;
		this.trails.clear();

	}

}
