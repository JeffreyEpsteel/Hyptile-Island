// Ship GLBs for the scene. One template per class is loaded with world/boat/StaticGLB.js (lit PBR materials,
// underwaterLighting 'lite') and every ship gets its own Group of meshes sharing the template's geometry and
// materials, so six ships cost six sets of draw calls but one set of textures.
//
//   const models = new ModelSet( { scene, baseUrl: '/' } );
//   const v = models.create( 'sloop' );           // a ShipVisual (empty until the template has loaded)
//   v.apply( ship, pose );                         // position / yaw / pitch / roll from a Ship + finalPose()
//   v.setNear( bool )                              // shadows only for close ships; v.group.visible hides far ones
//   models.setNight( 0..1 )                        // the stern lantern glows
//   models.ready( kind ) -> Promise                // resolves when that class has loaded
//
// Orientation: the GLBs are +X forward (the fork's Blender export; the stern lantern is at -X, the bowsprit at
// +X); the Group inside the ship's group is turned by -PI/2 about Y so the bow points along +Z, the boat frame.
// Rotation order of the outer group is YXZ: yaw, then pitch (bow up = negative rotation about X), then roll.

import { Group, Mesh } from '../../engine/index.js';
import { LAYERS } from '../../core/SceneRenderer.js';
import { SHIP_CLASSES } from './ShipClasses.js';
import { MODEL_YAW, centreOnHull } from '../../world/boat/ShipFrame.js';

export { MODEL_YAW, centreOnHull };

function defaultBase() {

	try {

		return ( import.meta.env && import.meta.env.BASE_URL ) || '/';

	} catch ( e ) {

		return '/';

	}

}

export class ShipVisual {

	constructor( set, kind ) {

		this.set = set;
		this.kind = kind;
		this.group = new Group();
		this.group.name = 'ship-' + kind;
		this.group.rotation.order = 'YXZ';
		this.pivot = new Group();
		this.pivot.rotation.y = MODEL_YAW;
		this.group.add( this.pivot );
		this.meshes = [];
		this.loaded = false;
		this.near = true;
		this.group.visible = false;
		if ( set.scene ) set.scene.add( this.group );

	}

	// copy the template's meshes (shared geometry + materials)
	fill( glb ) {

		if ( this.loaded ) return;
		this.loaded = true;
		for ( const m of glb.meshes ) {

			const c = new Mesh( m.geometry, m.material );
			c.name = m.name;
			c.castShadow = m.castShadow && this.near;
			c.receiveShadow = m.receiveShadow;
			c.renderOrder = m.renderOrder;
			if ( m.name === 'ship-glass' ) c.layers.set( LAYERS.TRANSPARENT );
			this.pivot.add( c );
			this.meshes.push( c );

		}

	}

	apply( ship, pose ) {

		const g = this.group;
		g.position.set( ship.x, pose.y, ship.z );
		g.rotation.set( - pose.pitch, ship.yaw, pose.roll );

	}

	setNear( near ) {

		if ( near === this.near ) return;
		this.near = near;
		for ( const m of this.meshes ) m.castShadow = near && m.name !== 'ship-glass';

	}

	setVisible( v ) {

		this.group.visible = v && this.loaded;

	}

	dispose() {

		if ( this.set.scene ) this.set.scene.remove( this.group );
		this.set.visuals.delete( this );
		this.meshes.length = 0;

	}

}

export class ModelSet {

	constructor( { scene = null, baseUrl = defaultBase(), loader = null } = {} ) {

		this.scene = scene;
		this.baseUrl = baseUrl;
		this.loader = loader; // ( url, options ) -> Promise<{ group, meshes, materials, dispose }>, default loadStaticGLB
		this.templates = new Map();
		this.visuals = new Set();
		this.night = 0;
		this.disposed = false;

	}

	_template( kind ) {

		let t = this.templates.get( kind );
		if ( t ) return t;
		t = { glb: null, failed: false, promise: null };
		this.templates.set( kind, t );
		t.promise = ( async () => {

			const load = this.loader || ( await import( '../../world/boat/StaticGLB.js' ) ).loadStaticGLB;
			const glb = await load( this.baseUrl + SHIP_CLASSES[ kind ].glb, { shadows: true, prefix: 'ship-', materials: () => ( { underwaterLighting: 'lite' } ) } );
			if ( this.disposed ) {

				glb.dispose();
				return null;

			}

			centreOnHull( glb );
			t.glb = glb;
			for ( const m of glb.materials ) m.underwaterLighting = 'lite';
			this._lantern( glb );
			for ( const v of this.visuals ) if ( v.kind === kind ) v.fill( glb );
			return glb;

		} )().catch( ( e ) => {

			t.failed = true;
			console.warn( `naval: ship model ${ kind } failed to load`, e );
			return null;

		} );
		return t;

	}

	ready( kind ) {

		return this._template( kind ).promise;

	}

	create( kind ) {

		const v = new ShipVisual( this, kind );
		this.visuals.add( v );
		const t = this._template( kind );
		if ( t.glb ) v.fill( t.glb );
		return v;

	}

	// the lantern glass is the only transparent material of the ships
	_lantern( glb ) {

		glb.lantern = glb.materials.find( ( m ) => m.name === 'ship-glass' ) || null;
		this._applyNight( glb );

	}

	_applyNight( glb ) {

		if ( glb.lantern ) glb.lantern.emissive = [ 4 * this.night, 2.6 * this.night, 0.9 * this.night ];

	}

	setNight( n ) {

		n = Math.round( n * 20 ) / 20;
		if ( n === this.night ) return;
		this.night = n;
		for ( const t of this.templates.values() ) if ( t.glb ) this._applyNight( t.glb );

	}

	dispose() {

		this.disposed = true;
		for ( const v of [ ...this.visuals ] ) v.dispose();
		for ( const t of this.templates.values() ) if ( t.glb ) t.glb.dispose();
		this.templates.clear();

	}

}
