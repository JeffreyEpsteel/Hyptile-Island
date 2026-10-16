import { Matrix4, Vector3 } from '../math/index.js';
import { ShadowUniforms, CAPSULE_FIGURES, CAPSULES_PER_FIGURE } from './wgsl/lighting.js';

// Capsule shadows of the figures near the camera (wave 25A; Unreal's capsule shadows): the player's avatar and the nearest
// islanders are each eight capsules on their skeleton (legs, feet, torso, head). The lit shaders (lighting.js
// characterOcclusion) take a soft ambient occlusion from them (the darkening on the sand round the feet and between the
// legs) and a contact shadow toward the sun that the shadow map's biases lose (the foot touching the ground, the 1-2 cm
// a map texel cannot hold). Long shadows stay the cascades' job: the capsule term fades out half a metre to a metre up
// its ray. Skinned materials skip it (a body is not occluded by its own capsules).
//
//   CapsuleShadows.update( camera )   once a frame before the passes (SunShadows.update calls it)
//   CapsuleShadows.enabled = false    no figures (the uniform count is 0: the shader loop is skipped)
//
// Figures come from every live SkinnedModel (Skinning.js registers them); the CAPSULE_FIGURES nearest to the camera within
// RANGE whose group is in the scene and visible are packed. Rigs without the mannequin bones get one upright capsule.

const RANGE = 40; // m from the camera
const INFLUENCE = 1.2; // m round a figure's bounds where its capsules still matter (ambient reach, contact shadow)

// [ bone a, bone b, radius as a share of the figure's leg length ] (b === a: a sphere)
const SEGMENTS = [
	[ 'thigh_l', 'calf_l', 0.085 ], [ 'calf_l', 'foot_l', 0.065 ], [ 'foot_l', 'ball_l', 0.055 ],
	[ 'thigh_r', 'calf_r', 0.085 ], [ 'calf_r', 'foot_r', 0.065 ], [ 'foot_r', 'ball_r', 0.055 ],
	[ 'pelvis', 'neck_01', 0.15 ], [ 'head', 'head', 0.12 ],
];

const _m = new Matrix4(), _w = new Matrix4(), _a = new Vector3(), _b = new Vector3(), _c = new Vector3();
const _chain = [];

// the world matrix of o from its own and its ancestors' current transforms (the scene's matrices are a frame old here)
function worldOf( o, out ) {

	_chain.length = 0;
	for ( let p = o; p; p = p.parent ) _chain.push( p );
	out.identity();
	for ( let i = _chain.length - 1; i >= 0; i -- ) {

		const p = _chain[ i ];
		if ( p.matrixAutoUpdate ) p.updateMatrix();
		out.multiply( p.matrix );

	}

	return out;

}

function inScene( o ) {

	let p = o;
	for ( ; p; p = p.parent ) {

		if ( ! p.visible ) return false;
		if ( p.isScene ) return true;

	}

	return false;

}

export const CapsuleShadows = {

	enabled: true,
	live: new Set(), // WeakRef( SkinnedModel )
	count: 0, // figures packed last update
	_picked: [],

	register( model ) {

		this.live.add( typeof WeakRef === 'function' ? new WeakRef( model ) : { deref: () => model } );

	},

	unregister( model ) {

		for ( const r of this.live ) if ( r.deref() === model ) this.live.delete( r );

	},

	// bone indices of a model (cached on it): the segments' node indices, -1 where the rig has no such bone
	_bones( model ) {

		if ( model.__capBones ) return model.__capBones;
		const nodes = model.gltf && model.gltf.nodes || [];
		const find = ( n ) => nodes.findIndex( ( x ) => x.name === n );
		const seg = SEGMENTS.map( ( [ a, b ] ) => [ find( a ), find( b ) ] );
		const ok = seg.every( ( [ a, b ] ) => a >= 0 && b >= 0 );
		model.__capBones = ok ? seg : null;
		return model.__capBones;

	},

	update( camera ) {

		const U = ShadowUniforms.fields;
		if ( ! this.enabled || ! camera ) { this.count = U.capFigures.value = 0; return; }
		camera.updateMatrixWorld();
		const cx = camera.matrixWorld.elements[ 12 ], cy = camera.matrixWorld.elements[ 13 ], cz = camera.matrixWorld.elements[ 14 ];
		const picked = this._picked;
		picked.length = 0;
		for ( const r of this.live ) {

			const m = r.deref();
			if ( ! m ) { this.live.delete( r ); continue; }
			const g = m.group;
			if ( ! g || ! inScene( g ) ) continue;
			worldOf( g, _w );
			const e = _w.elements;
			const d = Math.hypot( e[ 12 ] - cx, e[ 13 ] - cy, e[ 14 ] - cz );
			if ( d > RANGE ) continue;
			picked.push( { m, d, w: _w.clone() } );

		}

		picked.sort( ( a, b ) => a.d - b.d );
		const n = Math.min( picked.length, CAPSULE_FIGURES );
		const caps = U.capsules.value, bounds = U.capBounds.value;
		for ( let f = 0; f < n; f ++ ) this._pack( picked[ f ].m, picked[ f ].w, f, caps, bounds );
		this.count = U.capFigures.value = n;

	},

	_pack( model, world, f, caps, bounds ) {

		const W = model.world, bones = this._bones( model );
		const base = f * CAPSULES_PER_FIGURE * 2;
		const sc = Math.cbrt( Math.abs( world.determinant() ) ) || 1;
		let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = - Infinity, y1 = - Infinity, z1 = - Infinity;
		const grow = ( v, r ) => {

			x0 = Math.min( x0, v.x - r ); y0 = Math.min( y0, v.y - r ); z0 = Math.min( z0, v.z - r );
			x1 = Math.max( x1, v.x + r ); y1 = Math.max( y1, v.y + r ); z1 = Math.max( z1, v.z + r );

		};
		const node = ( i, out ) => out.set( W[ i * 16 + 12 ], W[ i * 16 + 13 ], W[ i * 16 + 14 ] ).applyMatrix4( world );
		if ( bones ) {

			// radii scale with the figure's leg (thigh to foot): a child, a tall captain and the island's alien differ
			const leg = node( bones[ 0 ][ 0 ], _a ).distanceTo( node( bones[ 1 ][ 1 ], _b ) ) || 0.85;
			for ( let k = 0; k < CAPSULES_PER_FIGURE; k ++ ) {

				const [ ia, ib ] = bones[ k ];
				node( ia, _a );
				node( ib, _b );
				let r = SEGMENTS[ k ][ 2 ] * leg / 0.85;
				// the head: a sphere half way to the top of the skull (the neck to the head bone is about a head's radius)
				if ( ia === ib ) {

					node( bones[ 6 ][ 1 ], _c ); // neck_01
					const up = Math.max( 0.06, _a.distanceTo( _c ) );
					r = Math.max( r, up * 0.9 );
					_a.addScaledVector( _a.clone().sub( _c ).normalize(), r * 0.6 );
					_b.copy( _a );

				}

				caps[ base + k * 2 ].set( _a.x, _a.y, _a.z, r );
				caps[ base + k * 2 + 1 ].set( _b.x, _b.y, _b.z, 0 );
				grow( _a, r );
				grow( _b, r );

			}

		} else {

			// an unknown rig: one upright capsule over its origin (the figure's height from its scale)
			const e = world.elements;
			_a.set( e[ 12 ], e[ 13 ] + 0.25 * sc, e[ 14 ] );
			_b.set( e[ 12 ], e[ 13 ] + 1.45 * sc, e[ 14 ] );
			caps[ base ].set( _a.x, _a.y, _a.z, 0.2 * sc );
			caps[ base + 1 ].set( _b.x, _b.y, _b.z, 0 );
			grow( _a, 0.2 * sc );
			grow( _b, 0.2 * sc );
			for ( let k = 1; k < CAPSULES_PER_FIGURE; k ++ ) caps[ base + k * 2 ].w = 0;

		}

		const hx = ( x1 - x0 ) / 2, hy = ( y1 - y0 ) / 2, hz = ( z1 - z0 ) / 2;
		bounds[ f ].set( x0 + hx, y0 + hy, z0 + hz, Math.hypot( hx, hy, hz ) + INFLUENCE );

	},

};
