import { Mesh, Matrix4, Vector3, Quaternion } from '../../engine/index.js';
import { prepare, mergePrepared, cylinder, box, torus, mat4, triangleCount } from '../../world/boat/GeoKit.js';
import { createPropMaterial, PAT } from '../../game/GameMaterials.js';

// The gun in the hand: a procedural flintlock pistol and a musket (barrel, stock, lock, guard, ramrod) from GeoKit primitives in
// the game's prop material (GameMaterials createPropMaterial: colour + aux = roughness / metalness / pattern), each well under
// 600 triangles. Held like the fishing rod: the game hands us the avatar's right-hand prop socket (Avatar.handMatrix, the rig's
// weapon_r; FishingRod.anchor) and the gun hangs off it with its grip in the palm, the barrel along the socket's +Z (the rod's
// shaft) and its lock side up the socket's -Y (the rod's reel hangs toward +Y, below the blank). Without an avatar it sits
// off the camera, first-person style.
//
//   const w = new WeaponMesh( { scene } );   w.update( { kind, visible, anchor: Matrix4 | null, camera, recoil } )
//   w.muzzle( out ) -> world position of the muzzle ( { x, y, z } )    w.dispose()
//   buildWeaponGeometry( kind ) -> BufferGeometry (also used by the test to count triangles)
//
// Gun frame: origin at the grip (where the hand closes), +Z the muzzle, +Y up (the lock and the hammer on top, +X its right side).
// HOLD tunes the pose in the hand (pitch about the gun's X, rad: the Fishing_Hold overlay carries the rod raised, so the gun is
// tipped down to point ahead); FP is the first-person offset in camera space.

export const HOLD = { pitch: - 0.55, x: 0, y: 0, z: 0 };
export const FP = { x: 0.16, y: - 0.17, z: - 0.42 };
export const MUZZLE = { pistol: [ 0, 0.035, 0.245 ], musket: [ 0, 0.035, 1.02 ] };

const WOOD = { color: 0x5b3920, rough: 0.55, metal: 0, pattern: PAT.woodZ };
const DARK_WOOD = { color: 0x40271a, rough: 0.6, metal: 0, pattern: PAT.woodZ };
const STEEL = { color: 0x2d3034, rough: 0.34, metal: 0.85, pattern: PAT.machined };
const BRIGHT = { color: 0x8d9196, rough: 0.25, metal: 1, pattern: PAT.machined };
const BRASS = { color: 0xa8803a, rough: 0.3, metal: 1, pattern: PAT.machined };
const HALF_PI = Math.PI / 2;

export function buildWeaponGeometry( kind = 'pistol' ) {

	const parts = [];
	const add = ( g, o, m ) => parts.push( prepare( g, { ...o, matrix: m } ) );
	if ( kind === 'musket' ) {

		// barrel and muzzle, two bands, a front sight
		add( cylinder( 0.0105, 0.0125, 1.0, 10, 1 ), STEEL, mat4( 0, 0.035, 0.52, HALF_PI ) );
		add( cylinder( 0.0135, 0.0135, 0.02, 10, 1 ), BRIGHT, mat4( 0, 0.035, 1.01, HALF_PI ) );
		add( cylinder( 0.02, 0.02, 0.016, 10, 1 ), BRASS, mat4( 0, 0.028, 0.45, HALF_PI ) );
		add( cylinder( 0.02, 0.02, 0.016, 10, 1 ), BRASS, mat4( 0, 0.028, 0.78, HALF_PI ) );
		add( box( 0.004, 0.01, 0.012 ), BRASS, mat4( 0, 0.05, 0.98 ) );
		// the stock: forend under the barrel, the wrist the hand holds, the butt against the shoulder, a butt plate
		add( box( 0.036, 0.03, 0.82 ), WOOD, mat4( 0, 0.016, 0.42 ) );
		add( box( 0.034, 0.045, 0.16 ), WOOD, mat4( 0, 0.008, 0.0, - 0.12 ) );
		add( box( 0.04, 0.12, 0.34 ), DARK_WOOD, mat4( 0, - 0.045, - 0.24, - 0.16 ) );
		add( box( 0.044, 0.13, 0.012 ), BRASS, mat4( 0, - 0.072, - 0.41, - 0.16 ) );
		// the lock on the right side: plate, hammer (the cock), frizzen and pan
		add( box( 0.006, 0.03, 0.09 ), STEEL, mat4( 0.02, 0.03, 0.07 ) );
		add( box( 0.006, 0.035, 0.014 ), STEEL, mat4( 0.022, 0.058, 0.04, 0.45 ) );
		add( box( 0.006, 0.026, 0.012 ), BRIGHT, mat4( 0.022, 0.052, 0.09 ) );
		// trigger and guard
		add( box( 0.004, 0.022, 0.005 ), STEEL, mat4( 0, - 0.012, 0.05 ) );
		add( torus( 0.022, 0.0028, 4, 8, Math.PI ), BRASS, mat4( 0, 0, 0.05, 0, HALF_PI, Math.PI ) );
		// the ramrod under the barrel
		add( cylinder( 0.0035, 0.0035, 0.8, 6, 1 ), DARK_WOOD, mat4( 0, 0.0, 0.55, HALF_PI ) );

	} else {

		// barrel and muzzle swell, a front sight
		add( cylinder( 0.011, 0.0125, 0.25, 10, 1 ), STEEL, mat4( 0, 0.035, 0.115, HALF_PI ) );
		add( cylinder( 0.0145, 0.0145, 0.02, 10, 1 ), BRASS, mat4( 0, 0.035, 0.235, HALF_PI ) );
		add( box( 0.003, 0.008, 0.008 ), BRASS, mat4( 0, 0.049, 0.225 ) );
		// the stock: a short forend and the curved grip with its brass butt cap
		add( box( 0.03, 0.025, 0.2 ), WOOD, mat4( 0, 0.018, 0.07 ) );
		add( box( 0.028, 0.11, 0.045 ), WOOD, mat4( 0, - 0.03, - 0.03, - 0.4 ) );
		add( box( 0.034, 0.03, 0.055 ), BRASS, mat4( 0, - 0.083, - 0.058, - 0.4 ) );
		// the lock: plate, hammer, frizzen
		add( box( 0.006, 0.025, 0.06 ), STEEL, mat4( 0.016, 0.03, 0.0 ) );
		add( box( 0.006, 0.03, 0.012 ), STEEL, mat4( 0.017, 0.054, - 0.022, 0.45 ) );
		add( box( 0.006, 0.022, 0.01 ), BRIGHT, mat4( 0.017, 0.048, 0.02 ) );
		// trigger and guard
		add( box( 0.004, 0.018, 0.004 ), STEEL, mat4( 0, - 0.005, 0.012 ) );
		add( torus( 0.018, 0.0025, 4, 8, Math.PI ), BRASS, mat4( 0, 0.006, 0.012, 0, HALF_PI, Math.PI ) );
		// the ramrod
		add( cylinder( 0.003, 0.003, 0.2, 6, 1 ), DARK_WOOD, mat4( 0, 0.012, 0.11, HALF_PI ) );

	}

	return mergePrepared( parts );

}

export function weaponTriangles( kind ) {

	return triangleCount( buildWeaponGeometry( kind ) );

}

const _hold = new Matrix4(), _rot = new Matrix4(), _fp = new Matrix4(), _v = new Vector3();
const _x = new Vector3(), _y = new Vector3(), _z = new Vector3(), _hq = new Quaternion();

export class WeaponMesh {

	constructor( { scene = null } = {} ) {

		this.scene = scene;
		this.meshes = {};
		this.matrix = new Matrix4();
		this.kind = null;
		this.valid = false;
		if ( ! scene ) return;
		this.material = createPropMaterial( 'firearm' );
		for ( const kind of [ 'pistol', 'musket' ] ) {

			const m = new Mesh( buildWeaponGeometry( kind ), this.material );
			m.name = kind === 'musket' ? 'Musket' : 'FlintlockPistol';
			m.frustumCulled = false;
			m.castShadow = false;
			m.matrixAutoUpdate = false;
			m.visible = false;
			scene.add( m );
			this.meshes[ kind ] = m;

		}

	}

	// place the gun for this frame: in the hand (anchor) or off the camera; recoil (0..1) tips the muzzle up and back
	// hold: [ x, y, z, w ] the gun in the socket (GunPose.js: barrel ahead in that gun's aim pose), else HOLD's rod-hold pitch
	update( { kind = null, visible = false, anchor = null, camera = null, recoil = 0, hold = null } = {} ) {

		this.kind = kind;
		this.valid = false;
		const r = Math.max( 0, Math.min( 1, recoil ) );
		if ( kind && ( anchor || ( camera && camera.matrixWorld ) ) ) {

			if ( anchor ) {

				// gun +X -> socket -X, gun +Y -> socket -Y (away from the reel side), gun +Z -> socket +Z (the shaft)
				if ( hold ) {

					_hold.makeRotationFromQuaternion( _hq.set( hold[ 0 ], hold[ 1 ], hold[ 2 ], hold[ 3 ] ) );
					_rot.makeRotationX( - r * 0.35 );

				} else {

					_hold.makeBasis( _x.set( - 1, 0, 0 ), _y.set( 0, - 1, 0 ), _z.set( 0, 0, 1 ) ).setPosition( _v.set( HOLD.x, HOLD.y, HOLD.z ) );
					_rot.makeRotationX( HOLD.pitch - r * 0.35 );

				}
				this.matrix.multiplyMatrices( anchor, _hold ).multiply( _rot );

			} else {

				if ( camera.updateMatrixWorld ) camera.updateMatrixWorld();
				_fp.makeBasis( _x.set( - 1, 0, 0 ), _y.set( 0, 1, 0 ), _z.set( 0, 0, - 1 ) ).setPosition( _v.set( FP.x, FP.y, FP.z + r * 0.04 ) );
				_rot.makeRotationX( - r * 0.3 );
				this.matrix.multiplyMatrices( camera.matrixWorld, _fp ).multiply( _rot );

			}

			this.valid = true;

		}

		for ( const [ k, m ] of Object.entries( this.meshes ) ) {

			m.visible = !! ( visible && this.valid && k === kind );
			if ( m.visible ) {

				m.matrix.copy( this.matrix );
				m.matrixWorldNeedsUpdate = true;

			}

		}

	}

	// world position of the muzzle of `kind` (the last update's placement), or null before one
	muzzle( out = {}, kind = this.kind ) {

		if ( ! this.valid || ! kind ) return null;
		const m = MUZZLE[ kind ] || MUZZLE.pistol;
		_v.set( m[ 0 ], m[ 1 ], m[ 2 ] ).applyMatrix4( this.matrix );
		out.x = _v.x; out.y = _v.y; out.z = _v.z;
		return out;

	}

	dispose() {

		for ( const m of Object.values( this.meshes ) ) {

			if ( this.scene && this.scene.remove ) this.scene.remove( m );
			try { m.geometry.dispose(); } catch ( e ) { /* gone */ }

		}

		try { if ( this.material && this.material.dispose ) this.material.dispose(); } catch ( e ) { /* gone */ }
		this.meshes = {};

	}

}
