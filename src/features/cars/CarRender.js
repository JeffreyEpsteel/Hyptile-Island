// The cars' looks: every car of a kind is an instance (public/models/cars/<kind>.glb, tools/cars/build_cars.py), so the
// whole city's traffic costs a few draws per kind on screen: the body's paint (tinted per car), its trim and its lamps in
// three damage variants (whole; dented; crumpled, made here by pushing the shell in, more at the ends), and the four
// wheels (one instanced wheel per kind, steered and spun). The lamps glow at night (headlights, tail lights, the taxi
// sign) and the police beacons flash in a chase (uniforms of the kind's lamp material). Without a scene nothing loads.
//
//   const r = new CarRender( scene, { base } );   await r.ready;
//   r.draw( records, { night, beacon } )   record: { kind, x, y, z, quat: { x, y, z, w }, bump, color (hex), stage 0..4,
//                                                    lights, steer, spin, hidden }
//   r.dispose()

import { InstancedMesh, Matrix4, Quaternion, Vector3, Color } from '../../engine/index.js';
import { loadStaticGLB } from '../../world/boat/StaticGLB.js';
import { KINDS, KIND_IDS } from './CarData.js';

function defaultBase() {

	try {

		return ( import.meta.env && import.meta.env.BASE_URL ) || '/';

	} catch ( e ) {

		return '/';

	}

}

// the lamp cells' glow (night) and the police beacons (the atlas's blue / red cells: u 0..0.25, v 0.75..0.875 in glTF uv)
const LAMP_SURFACE = /* wgsl */`
	let beacon = step( 0.75, in.uv.y ) * step( in.uv.y, 0.875 ) * step( in.uv.x, 0.25 );
	let red = step( 0.125, in.uv.x );
	let flash = mix( mat.beaconA, mat.beaconB, red );
	s.emissive += s.albedo * ( mat.glow * ( 1.0 - beacon ) + beacon * ( flash * 7.0 + mat.glow * 0.4 ) );
`;

const CAPS = { sedan: 140, taxi: 60, police: 24, pickup: 70, van: 70, sports: 30, bus: 8 };
const PARTS = [ 'CarPaint', 'CarTrim', 'CarLamp' ];
const DENT = [ 0, 0.07, 0.17 ]; // m: how far the shell is pushed in per variant

const _m = new Matrix4(), _mw = new Matrix4(), _mb = new Matrix4(), _q = new Quaternion(), _qw = new Quaternion(), _p = new Vector3(), _s = new Vector3( 1, 1, 1 ), _c = new Color();
const _ax = new Vector3( 1, 0, 0 ), _ay = new Vector3( 0, 1, 0 );

// the damage variant of a stage
export const variantOf = ( stage ) => ( stage <= 0 ? 0 : stage <= 2 ? 1 : 2 );

// a dented copy of a shell (positions hashed so the copies of a vertex on every face move together)
export function dentGeometry( geo, amount, spec ) {

	const g = geo.clone();
	const pos = g.attributes.position, a = pos.array;
	const L = spec.len / 2, H = spec.hgt;
	for ( let i = 0; i < pos.count; i ++ ) {

		const x = a[ i * 3 ], y = a[ i * 3 + 1 ], z = a[ i * 3 + 2 ];
		const k = Math.round( x * 50 ) * 73856093 ^ Math.round( y * 50 ) * 19349663 ^ Math.round( z * 50 ) * 83492791;
		const n = ( ( k >>> 0 ) % 1000 ) / 1000;
		const ends = Math.min( 1, Math.max( 0, ( Math.abs( z ) / L - 0.45 ) / 0.55 ) );
		const m = amount * ( 0.25 + 0.75 * n ) * ( 0.35 + 0.65 * ends );
		// in toward the middle of the car (a crumple, not a shrink): mostly across and along
		const cx = x, cy = y - H * 0.45, cz = z * 0.35;
		const d = Math.hypot( cx, cy, cz ) || 1;
		a[ i * 3 ] -= cx / d * m;
		a[ i * 3 + 1 ] -= cy / d * m * ( y > H * 0.7 ? 1.6 : 0.6 );
		a[ i * 3 + 2 ] -= cz / d * m;

	}

	pos.needsUpdate = true;
	if ( g.computeVertexNormals ) g.computeVertexNormals();
	return g;

}

export class CarRender {

	constructor( scene, { base = defaultBase(), kinds = KIND_IDS, caps = CAPS, shadows = true } = {} ) {

		this.scene = scene;
		this.base = base.endsWith( '/' ) ? base : base + '/';
		this.sets = new Map(); // kind -> { parts: [ [ InstancedMesh x3 ] x PARTS ], wheel, wheelPos, n: [ per variant ], nw }
		this.loaded = [];
		this.lampMats = new Map();
		this.caps = caps;
		this.shadows = shadows;
		this.drawn = 0;
		this.ready = Promise.all( kinds.map( ( k ) => this._load( k ).catch( ( e ) => {

			console.warn( 'cars: could not load ' + k, e && e.message ? e.message : e );
			return null;

		} ) ) );

	}

	async _load( kind ) {

		const K = KINDS[ kind ];
		const glb = await loadStaticGLB( this.base + 'models/' + K.glb, {
			prefix: 'car-',
			shadows: false,
			materials: ( info ) => {

				if ( /CarLamp/.test( info.name ) ) return { uniforms: { glow: [ 'f32', 0 ], beaconA: [ 'f32', 0 ], beaconB: [ 'f32', 0 ] }, surface: LAMP_SURFACE, roughness: 0.25 };
				if ( /CarPaint/.test( info.name ) ) return { roughness: 0.32, metalness: 0.2, color: new Color( 1, 1, 1 ) };
				return {};

			},
		} );
		this.loaded.push( glb );
		const cap = this.caps[ kind ] || 40;
		const set = { kind, parts: [], wheel: null, wheelPos: [], n: [ 0, 0, 0 ], nw: 0, cap };
		const wheels = [];
		for ( const part of PARTS ) {

			const src = glb.meshes.find( ( m ) => m.name === 'car-' + part || m.material.name === 'car-' + part );
			if ( ! src ) { set.parts.push( null ); continue; }
			if ( part === 'CarLamp' ) this.lampMats.set( kind, src.material );
			const variants = DENT.map( ( d, v ) => {

				const geo = v === 0 ? src.geometry : dentGeometry( src.geometry, d, K );
				const im = new InstancedMesh( geo, src.material, cap );
				im.name = `car-${ kind }-${ part }-${ v }`;
				im.frustumCulled = false;
				im.castShadow = this.shadows && part === 'CarPaint';
				im.receiveShadow = true;
				im.count = 0;
				im.visible = false;
				im.setColorAt( 0, _c.setRGB( 1, 1, 1 ) );
				this.scene.add( im );
				return im;

			} );
			set.parts.push( variants );

		}

		for ( const m of glb.meshes ) if ( /CarWheel/.test( m.name ) ) wheels.push( m );
		if ( wheels.length ) {

			// one wheel geometry about its hub; the hubs' model points FL, FR, RL, RR (+X is the car's left, +Z the nose)
			const hubs = wheels.map( ( w ) => {

				w.geometry.computeBoundingBox();
				const b = w.geometry.boundingBox;
				return { mesh: w, x: ( b.min.x + b.max.x ) / 2, y: ( b.min.y + b.max.y ) / 2, z: ( b.min.z + b.max.z ) / 2 };

			} );
			const pick = ( sx, sz ) => hubs.find( ( h ) => Math.sign( h.x ) === sx && Math.sign( h.z ) === sz ) || hubs[ 0 ];
			set.wheelPos = [ pick( 1, 1 ), pick( - 1, 1 ), pick( 1, - 1 ), pick( - 1, - 1 ) ].map( ( h ) => [ h.x, h.y, h.z ] );
			const fl = pick( 1, 1 );
			const geo = fl.mesh.geometry.clone();
			geo.translate( - fl.x, - fl.y, - fl.z );
			const im = new InstancedMesh( geo, fl.mesh.material, cap * 4 );
			im.name = `car-${ kind }-wheels`;
			im.frustumCulled = false;
			im.castShadow = false;
			im.receiveShadow = true;
			im.count = 0;
			im.visible = false;
			this.scene.add( im );
			set.wheel = im;

		}

		this.sets.set( kind, set );
		return set;

	}

	// lamps: glow (night) and the beacons' two phases
	_lamps( night, beacon, time ) {

		for ( const [ kind, m ] of this.lampMats ) {

			const ph = Math.floor( time * 4 ) % 2;
			const on = kind === 'police' && beacon;
			const set = ( k, v ) => { if ( m.uniforms && m.uniforms[ k ] ) m.uniforms[ k ].value = v; };
			set( 'glow', night ? 2.2 : 0 );
			set( 'beaconA', on ? ( ph ? 1 : 0.05 ) : 0 );
			set( 'beaconB', on ? ( ph ? 0.05 : 1 ) : 0 );

		}

	}

	draw( list, { night = false, beacon = false, time = 0 } = {} ) {

		this._lamps( night, beacon, time );
		for ( const set of this.sets.values() ) { set.n[ 0 ] = set.n[ 1 ] = set.n[ 2 ] = 0; set.nw = 0; }
		let drawn = 0;
		for ( const r of list ) {

			if ( r.hidden ) continue;
			const set = this.sets.get( r.kind );
			if ( ! set ) continue;
			const v = variantOf( r.stage || 0 );
			const i = set.n[ v ];
			if ( i >= set.cap ) continue;
			set.n[ v ] ++;
			drawn ++;
			const q = r.quat;
			_q.set( q.x, q.y, q.z, q.w );
			_mb.compose( _p.set( r.x, r.y + ( r.bump || 0 ), r.z ), _q, _s.set( 1, 1, 1 ) );
			const wreck = ( r.stage || 0 ) >= 4;
			for ( let k = 0; k < PARTS.length; k ++ ) {

				const vs = set.parts[ k ];
				if ( ! vs ) continue;
				const im = PARTS[ k ] === 'CarLamp' ? vs[ 0 ] : vs[ v ];
				const idx = PARTS[ k ] === 'CarLamp' ? set.n[ 0 ] + set.n[ 1 ] + set.n[ 2 ] - 1 : i;
				im.setMatrixAt( idx, _mb );
				if ( k === 0 ) {

					if ( wreck ) _c.setRGB( 0.06, 0.055, 0.05 );
					else _c.setHex( r.color ?? 0xcccccc );
					// (the scorch of a burning car)
					if ( ! wreck && r.stage === 3 ) _c.multiplyScalar( 0.55 );
					im.setColorAt( idx, _c );

				} else if ( k === 1 ) im.setColorAt( idx, _c.setRGB( wreck ? 0.2 : 1, wreck ? 0.2 : 1, wreck ? 0.2 : 1 ) );
				else im.setColorAt( idx, wreck ? _c.setRGB( 0.1, 0.1, 0.1 ) : r.lights ? _c.setRGB( 1, 1, 1 ) : _c.setRGB( 0.42, 0.42, 0.42 ) );

			}

			// the wheels: steered (front), spun, under the body
			if ( set.wheel && set.nw + 4 <= set.cap * 4 ) {

				for ( let w = 0; w < 4; w ++ ) {

					const hp = set.wheelPos[ w ];
					if ( ! hp ) continue;
					_qw.setFromAxisAngle( _ay, w < 2 ? ( r.steer || 0 ) : 0 );
					_q.setFromAxisAngle( _ax, r.spin || 0 );
					_qw.multiply( _q );
					_mw.compose( _p.set( hp[ 0 ], hp[ 1 ] - ( r.bump || 0 ), hp[ 2 ] ), _qw, _s.set( 1, 1, 1 ) );
					_m.multiplyMatrices( _mb, _mw );
					set.wheel.setMatrixAt( set.nw ++, _m );

				}

			}

		}

		for ( const set of this.sets.values() ) {

			const total = set.n[ 0 ] + set.n[ 1 ] + set.n[ 2 ];
			set.parts.forEach( ( vs, k ) => {

				if ( ! vs ) return;
				vs.forEach( ( im, v ) => {

					const n = PARTS[ k ] === 'CarLamp' ? ( v === 0 ? total : 0 ) : set.n[ v ];
					im.count = n;
					im.visible = n > 0;
					if ( n ) {

						im.instanceMatrix.needsUpdate = true;
						if ( im.instanceColor ) im.instanceColor.needsUpdate = true;

					}

				} );

			} );
			if ( set.wheel ) {

				set.wheel.count = set.nw;
				set.wheel.visible = set.nw > 0;
				if ( set.nw ) set.wheel.instanceMatrix.needsUpdate = true;

			}

		}

		this.drawn = drawn;
		return drawn;

	}

	// draws in use (instanced meshes with something to show)
	draws() {

		let n = 0;
		for ( const set of this.sets.values() ) {

			for ( const vs of set.parts ) if ( vs ) for ( const im of vs ) if ( im.visible ) n ++;
			if ( set.wheel && set.wheel.visible ) n ++;

		}

		return n;

	}

	dispose() {

		for ( const set of this.sets.values() ) {

			for ( const vs of set.parts ) if ( vs ) for ( const im of vs ) { this.scene.remove( im ); if ( im.geometry !== vs[ 0 ].geometry ) im.geometry.dispose && im.geometry.dispose(); }
			if ( set.wheel ) { this.scene.remove( set.wheel ); set.wheel.geometry.dispose && set.wheel.geometry.dispose(); }

		}

		for ( const g of this.loaded ) g && g.dispose && g.dispose();
		this.sets.clear();

	}

}
