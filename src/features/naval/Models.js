// Ship GLBs for the scene. One template per class is loaded with world/boat/StaticGLB.js (lit PBR materials,
// underwaterLighting 'lite') and every ship gets its own Group of meshes sharing the template's geometry and
// materials, so six ships cost six sets of draw calls but one set of textures.
//
//   const models = new ModelSet( { scene, baseUrl: '/' } );
//   const v = models.create( 'sloop' );           // a ShipVisual (empty until the template has loaded)
//   v.apply( ship, pose );                         // position / yaw / pitch / roll from a Ship + finalPose(); picks the LOD
//   v.setNear( bool )                              // shadows only for close ships; v.group.visible hides far ones
//   models.setNight( 0..1 )                        // the stern lantern glows
//   models.ready( kind ) -> Promise                // resolves when that class has loaded
//   v.wheel / v.steerWheel( ship )                 // the helm wheel turns with the ship's turn (apply() calls it)
//
// Orientation: the GLBs are +X forward (the fork's Blender export; the stern lantern is at -X, the bowsprit at
// +X); the Group inside the ship's group is turned by -PI/2 about Y so the bow points along +Z, the boat frame.
// Rotation order of the outer group is YXZ: yaw, then pitch (bow up = negative rotation about X), then roll.
//
// Wave 24C (the ships rebuilt by tools/ships/build_ships.py):
// - Levels of detail: <glb>_lod1.glb (~half the triangles: no ratlines, no small deck gear) and <glb>_lod2.glb (~1000
//   triangles: the silhouette, its sails and spars) beside every class GLB. They carry no textures: their meshes are named
//   like the full model's (one per material) and a visual swaps each mesh's geometry for the LOD's, keeping the full
//   model's materials (one set of textures, the sail shader everywhere). ShipVisual.apply picks the level from ship.dist
//   (LOD_DIST, nearer on phones) with a margin against flicker; a LOD file loads the first time a ship needs it.
// - shipMaterials( glb ) (ShipLooks.js): the sails fill on the side the wind blows to (square sails from astern, aback from ahead; fore-
//   and-aft sails to leeward) and shiver when they cannot fill, the flags wave, canvas glows when the sun is behind it,
//   the hull darkens and shines at the waterline. The GLB's UVs carry what the shader needs (tools/ships/shipkit.py).
//   The player's ship (world/boat/ShipBoatModel.js) calls it too (mirrored: the brigantine).
// - The maps are 512 px tiles shared by every material of a class (tools/ships/textures.py: painted planks, sheathing,
//   deck, timber, canvas, flags); the LOD files add none. (StaticGLB caches a file's textures per URL, so the player's ship
//   of a class shares the AI ships' set.)

import { Group, Mesh } from '../../engine/index.js';
import { LAYERS } from '../../core/SceneRenderer.js';
import { SHIP_CLASSES } from './ShipClasses.js';
import { MODEL_YAW, centreOnHull } from '../../world/boat/ShipFrame.js';
import { shipMaterials, SAIL_BRACE } from './ShipLooks.js';

export { MODEL_YAW, centreOnHull, shipMaterials, SAIL_BRACE };

// metres from the camera where a ship drops to LOD 1 / LOD 2 (phones: nearer)
export const LOD_DIST = [ 70, 190 ];
export const LOD_DIST_PHONE = [ 38, 110 ];
const LOD_MARGIN = 0.08;

export function lodUrl( url, level ) {

	return level > 0 ? String( url ).replace( /\.glb$/, `_lod${ level }.glb` ) : url;

}

// the level for a distance, from the current one (a margin each way so a ship at the edge does not flicker)
export function lodFor( dist, current = 0, dists = LOD_DIST ) {

	if ( ! Number.isFinite( dist ) ) return current;
	let l = 0;
	for ( let i = 0; i < dists.length; i ++ ) {

		const d = dists[ i ] * ( current > i ? 1 - LOD_MARGIN : 1 + LOD_MARGIN );
		if ( dist > d ) l = i + 1;

	}

	return l;

}

function defaultBase() {

	try {

		return ( import.meta.env && import.meta.env.BASE_URL ) || '/';

	} catch ( e ) {

		return '/';

	}

}

// The template's baked spoked wheel lifted out of the hull's triangles (once per class; every visual shares the parts) with
// the player's ship's own carve (world/boat/ShipBoatModel _buildHelm / _carveWheel, run on a stand-in: the wheel's place
// comes from the Boats.js entry of the same class). -> { position (boat frame), parts: [ { geometry, material } ], turns,
// radius, triangles } or null (no wheel found, e.g. inside a wheelhouse: nothing turns).
export async function carveShipWheel( kind, glb ) {

	try {

		const [ { ShipBoatModel }, { BOATS } ] = await Promise.all( [ import( '../../world/boat/ShipBoatModel.js' ), import( '../../game/Boats.js' ) ] );
		const spec = Object.values( BOATS ).find( ( b ) => b.kind === 'ship' && ( b.shipClass || '' ) === kind );
		if ( ! spec || ! glb.meshes || ! glb.meshes.length ) return null;
		const ctx = { group: new Group(), spec, helmStand: null };
		ShipBoatModel.prototype._buildHelm.call( ctx, spec );
		const triangles = ShipBoatModel.prototype._carveWheel.call( ctx, glb );
		if ( ! triangles ) return null;
		const parts = ctx.wheelMesh.children.map( ( m ) => ( { geometry: m.geometry, material: m.material } ) );
		return { position: ctx.wheelPivot.position.clone(), parts, turns: ctx.wheelTurns, radius: ctx.wheelRadius, triangles };

	} catch ( e ) {

		console.warn( `naval: no turning wheel for ${ kind }`, e );
		return null;

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
		this.lod = 0;
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
			c.userData.geo0 = m.geometry;
			if ( m.name === 'ship-glass' ) c.layers.set( LAYERS.TRANSPARENT );
			this.pivot.add( c );
			this.meshes.push( c );

		}

		this._fillWheel( glb.wheel );

	}

	// ---- the helm wheel (wave 11C): copies of the template's carved wheel (carveShipWheel) under a pivot in the boat frame
	_fillWheel( w ) {

		if ( ! w || this.wheel ) return;
		const pivot = new Group();
		pivot.name = 'ship-wheel-pivot';
		pivot.position.copy( w.position ); // the axle along +Z (forward), as ShipBoatModel's wheelPivot
		const spin = new Group();
		spin.name = 'ship-wheel';
		for ( const p of w.parts ) {

			const m = new Mesh( p.geometry, p.material );
			m.name = 'ship-wheel';
			m.receiveShadow = true;
			spin.add( m );

		}

		pivot.add( spin );
		this.group.add( pivot );
		this.wheel = spin;
		this.wheelPivot = pivot;
		this.wheelTurns = w.turns;

	}

	// the wheel's spin from the ship's turn: a brain's steer (-1..1, + = port) when it sets one, else Ship.yawRate over the
	// class's turn rate (+ yaw rate = turning to port); counter-clockwise from the helm for port, as BoatModel.steerWheel
	steerWheel( ship ) {

		if ( ! this.wheel || ! ship ) return 0;
		const brain = Number.isFinite( ship.steer ) ? ship.steer : ship.brain && Number.isFinite( ship.brain.steer ) ? ship.brain.steer : null;
		const turn = ship.cls && ship.cls.turn > 0 ? ship.cls.turn : 0.3;
		const s = Math.max( - 1, Math.min( 1, brain !== null ? brain : ( ship.yawRate || 0 ) / turn ) );
		this.wheel.rotation.z = - s * ( this.wheelTurns || 1 ) * Math.PI * 2;
		return s;

	}

	apply( ship, pose ) {

		const g = this.group;
		g.position.set( ship.x, pose.y, ship.z );
		g.rotation.set( - pose.pitch, ship.yaw, pose.roll );
		if ( this.loaded ) this.setLod( lodFor( ship.dist, this.lod, this.set.lodDist ) );
		this.steerWheel( ship );

	}

	// swap every mesh's geometry for the level's (the LOD file loads the first time; until then the level stays)
	setLod( level ) {

		if ( level === this.lod || ! this.loaded ) return this.lod;
		let geos = null;
		if ( level > 0 ) {

			const t = this.set._lodTemplate ? this.set._lodTemplate( this.kind, level ) : null;
			if ( ! t || ! t.geos ) return this.lod;
			geos = t.geos;

		}

		for ( const m of this.meshes ) {

			const g = level === 0 ? m.userData.geo0 : geos.get( m.name );
			if ( g ) m.geometry = g;

		}

		this.lod = level;
		if ( this.wheelPivot ) this.wheelPivot.visible = level === 0;
		this.setNear( this.near, true );
		return level;

	}

	setNear( near, force = false ) {

		if ( near === this.near && ! force ) return;
		this.near = near;
		// (the far silhouette casts none: at that distance the shadow map's texels are bigger than its spars)
		for ( const m of this.meshes ) m.castShadow = near && this.lod < 2 && m.name !== 'ship-glass';

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

	constructor( { scene = null, baseUrl = defaultBase(), loader = null, lodDist = null } = {} ) {

		this.scene = scene;
		this.baseUrl = baseUrl;
		this.loader = loader; // ( url, options ) -> Promise<{ group, meshes, materials, dispose }>, default loadStaticGLB
		this.templates = new Map();
		this.lods = new Map(); // kind + ':' + level -> { geos: Map( mesh name -> geometry ), failed, promise }
		this.lodDist = lodDist || ( globalThis.__phoneBudget ? LOD_DIST_PHONE : LOD_DIST );
		this.visuals = new Set();
		this.night = 0;
		this.disposed = false;

	}

	_template( kind ) {

		let t = this.templates.get( kind );
		if ( t ) return t;
		t = { glb: null, failed: false, promise: null, url: SHIP_CLASSES[ kind ].glb };
		this.templates.set( kind, t );
		t.promise = ( async () => {

			const load = this.loader || ( await import( '../../world/boat/StaticGLB.js' ) ).loadStaticGLB;
			const glb = await load( this.baseUrl + SHIP_CLASSES[ kind ].glb, { shadows: true, prefix: 'ship-', materials: () => ( { underwaterLighting: 'lite' } ) } );
			if ( this.disposed ) {

				glb.dispose();
				return null;

			}

			centreOnHull( glb );
			glb.wheel = await carveShipWheel( kind, glb );
			this._adopt( glb );
			t.glb = glb;
			for ( const v of this.visuals ) if ( v.kind === kind ) v.fill( glb );
			return glb;

		} )().catch( ( e ) => {

			t.failed = true;
			console.warn( `naval: ship model ${ kind } failed to load`, e );
			return null;

		} );
		return t;

	}

	// what every class template gets once loaded (the navy's too: NavyModels calls it): the wind in the sails, the flags,
	// the canvas lit from behind, the wet waterline, the lantern glass
	_adopt( glb ) {

		for ( const m of glb.materials ) m.underwaterLighting = 'lite';
		shipMaterials( glb );
		this._lantern( glb );

	}

	// a level of detail of a class: its GLB's meshes by name (the template's materials stay); loaded once, on demand
	_lodTemplate( kind, level ) {

		const key = kind + ':' + level;
		let t = this.lods.get( key );
		if ( t ) return t;
		const base = this.templates.get( kind );
		if ( ! base || ! base.glb || ! base.url ) return null; // (the full model first)
		t = { geos: null, failed: false, promise: null };
		this.lods.set( key, t );
		t.promise = ( async () => {

			const load = this.loader || ( await import( '../../world/boat/StaticGLB.js' ) ).loadStaticGLB;
			const glb = await load( this.baseUrl + lodUrl( base.url, level ), { shadows: true, prefix: 'ship-' } );
			if ( this.disposed ) { glb.dispose(); return null; }
			centreOnHull( glb );
			const geos = new Map();
			for ( const m of glb.meshes ) if ( ! geos.has( m.name ) ) geos.set( m.name, m.geometry );
			// (only the geometry is kept: the full model's materials draw it)
			for ( const m of glb.materials ) if ( m.dispose ) m.dispose();
			t.geos = geos;
			t.dispose = () => { for ( const g of geos.values() ) if ( g.dispose ) g.dispose(); };
			return t;

		} )().catch( ( e ) => {

			t.failed = true;
			console.warn( `naval: LOD ${ level } of ${ kind } failed to load (the full model stays)`, e );
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
		for ( const t of this.lods.values() ) if ( t.dispose ) t.dispose();
		this.templates.clear();
		this.lods.clear();

	}

}
