import { Group, Mesh, Vector3, Color } from '../../engine/index.js';
import { prepare, mergePrepared, box, cylinder, sphere, mat4 } from '../boat/GeoKit.js';
import { createPropMaterial, PAT } from '../../game/GameMaterials.js';
import { buildJetty } from './Jetty.js';
import { WOOD, WOODX, STONE, rng, frameAt, cottage, palm, lantern, cullParts } from './IslandKit.js';
import { strongholdLayout, bw, bwYaw } from './stronghold/Layout.js';
import { STRONGHOLD_KINDS, strongholdPlan } from './stronghold/Kinds.js';
import { rngFor } from '../../features/destruction/Kinds.js';

// Blackwater, the pirates' island (terrain/IslandShape.js BLACKWATER; wave 12B). The pirate town on the black-sand crescent
// inside the caldera cove - the Rum Hole tavern, the black market, the plunder store, huts, three timber docks - and the
// fort on the north headland above the entrance: a log blockhouse, the watchtower with its alarm bell, the flagstaff with
// the black flag, two gun platforms of three guns and their powder stores, all inside / beside a palisade.
// src/features/pirates/Stronghold.js builds this and runs the place.
//
//   const isle = new Blackwater( { scene, terrain, colliders } );
//   isle.group, isle.lights (LocalLights sources), isle.update( dt ) (distance culling), isle.distance (camera, m)
//   isle.structures   Map id -> Mesh: the breakable palisade runs, gun platforms and powder stores drawn here while the
//                     destruction feature does not own them (setStructuresDrawn( false ) once it does); setBroken( id, on )
//   isle.setSilenced( batteryId, on )   the guns of a broken battery slump on their carriages
//   isle.setBell( k )                   the bell swings (0..1) while the alarm rings; isle.setFlag( holder ) 'pirates' | 'player'

const NEAR = 900; // m: the town, the fort and the guns
const FAR = 3200; // m: the watchtower and the flag (a landmark from the lanes)
const TAR = 0x2c2620, SAIL = 0xb8ac94, RUST = 0x5a3d2c;

// a linear [ r, g, b ] (destruction piece colours) as an sRGB hex for GeoKit
const hexOf = ( c ) => c.reduce( ( h, v ) => h * 256 + Math.max( 0, Math.min( 255, Math.round( 255 * Math.pow( Math.max( 0, v ), 1 / 2.2 ) ) ) ), 0 );

export class Blackwater {

	constructor( { scene, terrain, colliders = null, material = null } ) {

		this.terrain = terrain;
		this.material = material || createPropMaterial( 'blackwater' );
		this.group = new Group();
		this.group.name = 'Blackwater';
		scene.add( this.group );
		this.L = strongholdLayout();
		this.center = new Vector3( this.L.center.x, 0, this.L.center.z );
		this.lights = [];
		this.distance = Infinity;
		this.structures = new Map();
		this.guns = new Map();
		this._bell = 0;
		this._t = 0;
		this.rnd = rng( 1717 );

		const P = [];
		const add = ( g, o ) => P.push( prepare( g, o ) );
		this._town( add, colliders );
		this._docks( add, colliders );
		this._fort( add, colliders );
		const near = new Mesh( mergePrepared( P ), this.material );
		near.name = 'BlackwaterProps';
		near.castShadow = true;
		this.group.add( near );

		// the landmark: the watchtower (its bell its own mesh, it swings) and the flag
		const T = [];
		this._tower( ( g, o ) => T.push( prepare( g, o ) ), colliders );
		const far = new Mesh( mergePrepared( T ), this.material );
		far.name = 'BlackwaterTower';
		far.castShadow = true;
		this.group.add( far );
		this.bell = this._mesh( ( add2 ) => add2( cylinder( 0.22, 0.42, 0.6, 10 ), { color: 0x9a7a3a, rough: 0.35, metal: 0.8 } ), 'BlackwaterBell' );
		this.bell.position.set( this.L.tower.x, this.L.fort.y + this.L.tower.h - 0.2, this.L.tower.z );
		this.flag = this._mesh( ( add2 ) => add2( box( 1.9, 1.2, 0.04 ), { color: 0x141414, rough: 0.9 } ), 'BlackwaterFlag' );
		this.flag.position.set( this.L.flag.x + 1.0, this.L.fort.y + 8.6, this.L.flag.z );

		for ( const b of this.L.batteries ) this.guns.set( b.id, this._battery( b ) );
		this._structures();

		this.parts = [ { object: near, dist: NEAR }, { object: far, dist: FAR }, { object: this.bell, dist: NEAR }, { object: this.flag, dist: FAR } ];
		for ( const m of this.guns.values() ) this.parts.push( { object: m, dist: NEAR } );
		this._structParts = [];
		for ( const m of this.structures.values() ) this._structParts.push( { object: m, dist: NEAR } );
		this._drawStructures = true;

	}

	_mesh( build, name ) {

		const P = [];
		build( ( g, o ) => P.push( prepare( g, o ) ) );
		const m = new Mesh( mergePrepared( P ), this.material );
		m.name = name;
		m.castShadow = true;
		this.group.add( m );
		return m;

	}

	_y( x, z ) {

		return this.terrain.heightAt( x, z );

	}

	// ---- the town on the crescent

	_town( add, colliders ) {

		const rnd = this.rnd;
		for ( const b of this.L.town ) {

			const F = frameAt( b.x, this._y( b.x, b.z ), b.z, b.yaw );
			if ( b.kind === 'tavern' ) {

				cottage( add, F, { w: b.w, d: b.d, storeys: 2, wall: 0x6a5642, plank: true, roof: TAR, trim: 0x3a2a22, tin: true } );
				// the sign over the door: a board on two chains, a painted bottle
				add( box( 2.4, 0.7, 0.08 ), { ...WOOD( 0x3b2a1e ), matrix: F.m( 0, 3.3, b.d / 2 + 0.6 ) } );
				add( box( 0.3, 0.55, 0.1 ), { color: 0xa8692c, rough: 0.5, matrix: F.m( - 0.6, 3.3, b.d / 2 + 0.66 ) } );
				add( box( 0.05, 0.6, 0.05 ), { color: 0x333333, metal: 0.7, matrix: F.m( 1.0, 3.9, b.d / 2 + 0.6 ) } );
				add( box( 0.05, 0.6, 0.05 ), { color: 0x333333, metal: 0.7, matrix: F.m( - 1.0, 3.9, b.d / 2 + 0.6 ) } );
				// barrels and a bench out front
				for ( const s of [ - 1, 1 ] ) add( cylinder( 0.36, 0.36, 0.85, 10 ), { ...WOOD( 0x6b4a2c ), matrix: F.m( s * ( b.w / 2 - 0.3 ), 0.72, b.d / 2 + 0.9 ) } );
				add( box( 2.2, 0.1, 0.45 ), { ...WOOD( 0x5a4632 ), matrix: F.m( 1.6, 0.75, b.d / 2 + 1.4 ) } );
				const [ lx, lz ] = F.world( 0, b.d / 2 + 0.7 );
				this.lights.push( lantern( add, lx, F.y + 2.6, lz, { intensity: 8 } ) );
				if ( colliders ) colliders.addBox( new Vector3( F.x, F.y + 3, F.z ), new Vector3( b.w / 2 + 0.15, 3, b.d / 2 + 0.15 ), b.yaw, { tag: 'bwTavern' } );

			} else if ( b.kind === 'market' ) {

				cottage( add, F, { w: b.w, d: b.d, wall: 0x4f4538, plank: true, roof: RUST, tin: true, chimney: false } );
				// the fence's awning and his table of goods
				add( box( b.w + 0.4, 0.06, 2.4 ), { color: 0x6b2a24, rough: 0.8, matrix: F.m( 0, 2.45, b.d / 2 + 1.1, - 0.22, 0, 0 ) } );
				for ( const s of [ - 1, 1 ] ) add( box( 0.12, 2.3, 0.12 ), { ...WOOD( 0x4a3a2a ), matrix: F.m( s * ( b.w / 2 + 0.1 ), 1.15, b.d / 2 + 2.2 ) } );
				add( box( 2.6, 0.08, 0.9 ), { ...WOOD( 0x5a4632 ), matrix: F.m( 0, 0.9, b.d / 2 + 1.3 ) } );
				for ( let k = 0; k < 4; k ++ ) add( box( 0.42, 0.32, 0.36 ), { ...WOODX( 0x7a5a3a ), matrix: F.m( - 0.9 + k * 0.6, 1.1, b.d / 2 + 1.3, 0, rnd() * 0.4, 0 ) } );
				add( cylinder( 0.3, 0.3, 0.7, 10 ), { color: 0x2b2b2b, rough: 0.6, matrix: F.m( b.w / 2 + 0.6, 0.35, b.d / 2 + 0.6 ) } );
				const [ lx, lz ] = F.world( 0, b.d / 2 + 2.0 );
				this.lights.push( lantern( add, lx, F.y + 2.2, lz, { intensity: 6, range: 9 } ) );
				if ( colliders ) colliders.addBox( new Vector3( F.x, F.y + 1.6, F.z ), new Vector3( b.w / 2 + 0.15, 1.6, b.d / 2 + 0.15 ), b.yaw, { tag: 'bwMarket' } );

			} else {

				cottage( add, F, { w: b.w, d: b.d, wall: [ 0x584a3c, 0x4c4236, 0x62503e ][ Math.floor( rnd() * 3 ) ], plank: true, roof: rnd() < 0.5 ? RUST : TAR, tin: true, chimney: b.kind === 'store' } );
				if ( b.kind === 'store' ) for ( let k = 0; k < 5; k ++ ) add( box( 0.6, 0.6, 0.6 ), { ...WOODX( 0x7a5a3a ), matrix: F.m( - 2 + k * 0.9, 0.6 + ( k % 2 ) * 0.6, b.d / 2 + 0.8, 0, rnd() * 0.5, 0 ) } );
				if ( colliders ) colliders.addBox( new Vector3( F.x, F.y + 1.6, F.z ), new Vector3( b.w / 2 + 0.15, 1.6, b.d / 2 + 0.15 ), b.yaw, { tag: 'bwHut' } );

			}

		}

		// palms along the back of the crescent, nets drying on poles, a fire pit
		for ( let k = 0; k < 9; k ++ ) {

			const a = ( k / 8 - 0.5 ) * 2.0, q = bw( - 105 * 1.42 * Math.cos( a ), 85 * 1.42 * Math.sin( a ) );
			const h = this._y( q.x, q.z );
			if ( h < 0.6 || h > 9 ) continue;
			palm( add, q.x, h - 0.2, q.z, 6 + rnd() * 3, rnd, 0.3 );
			if ( colliders ) colliders.addCylinder( q.x, q.z, 0.25, h - 0.5, h + 3, { tag: 'bwPalm' } );

		}

		const pit = bw( - 112, 18 ), py = this._y( pit.x, pit.z );
		for ( let k = 0; k < 8; k ++ ) {

			const a = k / 8 * Math.PI * 2;
			add( sphere( 0.22, 6, 4 ), { ...STONE( 0x2e2c2a ), matrix: mat4( pit.x + Math.cos( a ) * 0.8, py + 0.08, pit.z + Math.sin( a ) * 0.8 ) } );

		}

		add( box( 1.0, 0.12, 0.2 ), { ...WOOD( 0x2a2016 ), matrix: mat4( pit.x, py + 0.15, pit.z, 0, 0.6, 0 ) } );

	}

	_docks( add, colliders ) {

		for ( const d of this.L.docks ) {

			const foot = this._y( d.start.x, d.start.z );
			const D = { start: d.start, end: d.end, heading: d.heading, width: d.width, deckHeight: Math.max( 0.9, foot + 0.3 ) };
			const j = buildJetty( { D, terrain: this.terrain, add, colliders, tag: 'blackwater' + d.id, seed: 131 + d.id * 7, crates: d.id === 0, lanterns: d.id === 0 ? 1 : 0 } );
			this.lights.push( ...j.lights.slice( 0, 1 ) );

		}

	}

	// ---- the fort

	_fort( add, colliders ) {

		const L = this.L, y = L.fort.y;
		// the blockhouse: squat log walls, slits, a tar roof
		const B = frameAt( L.blockhouse.x, y, L.blockhouse.z, L.blockhouse.yaw );
		cottage( add, B, { w: 7, d: 5, wallH: 2.8, wall: 0x4e3e2e, plank: true, roof: TAR, trim: 0x2a1e16, chimney: false, slope: 0.4 } );
		if ( colliders ) colliders.addBox( new Vector3( B.x, y + 1.6, B.z ), new Vector3( 3.65, 1.6, 2.65 ), B.yaw, { tag: 'bwBlockhouse' } );
		// the flagstaff
		add( cylinder( 0.07, 0.11, 9.5, 8 ), { ...WOOD( 0x3a2e22 ), matrix: mat4( L.flag.x, y + 4.75, L.flag.z ) } );
		add( sphere( 0.14, 8, 6 ), { color: 0x9a7a3a, metal: 0.8, rough: 0.35, matrix: mat4( L.flag.x, y + 9.55, L.flag.z ) } );
		// braziers at the gate
		const G = L.gate;
		for ( const s of [ - 1, 1 ] ) {

			const a = bwYaw( 1, 0 ) + s * 0.4;
			const x = G.x + Math.sin( a ) * 2.4, z = G.z + Math.cos( a ) * 2.4;
			add( cylinder( 0.32, 0.18, 0.5, 8 ), { color: 0x2a2a2a, metal: 0.6, rough: 0.5, matrix: mat4( x, y + 1.25, z ) } );
			add( cylinder( 0.05, 0.05, 1.0, 6 ), { color: 0x2a2a2a, metal: 0.6, rough: 0.5, matrix: mat4( x, y + 0.5, z ) } );
			add( sphere( 0.24, 6, 4 ), { color: 0xffa040, rough: 1, matrix: mat4( x, y + 1.55, z ) } );

		}

		this.lights.push( { position: new Vector3( G.x, y + 2.2, G.z ), color: new Color( 1.0, 0.6, 0.3 ), intensity: 9, range: 13, kind: 'lantern', flicker: 0.18 } );
		// shot piles beside each battery
		for ( const b of L.batteries ) {

			const F = frameAt( b.x, b.y, b.z, b.yaw );
			for ( let k = 0; k < 6; k ++ ) add( sphere( 0.14, 6, 4 ), { color: 0x1c1c1f, metal: 0.6, rough: 0.45, matrix: F.m( - 3.9 + ( k % 3 ) * 0.28, 0.14 + Math.floor( k / 3 ) * 0.24, - 3.2 + ( k % 2 ) * 0.1 ) } );

		}

	}

	_tower( add, colliders ) {

		const T = this.L.tower, y = this.L.fort.y, h = T.h;
		for ( const sx of [ - 1, 1 ] ) for ( const sz of [ - 1, 1 ] ) add( box( 0.28, h, 0.28 ), { ...WOOD( 0x3e3022 ), matrix: mat4( T.x + sx * 1.3, y + h / 2, T.z + sz * 1.3, sz * 0.04, 0, - sx * 0.04 ) } );
		for ( const k of [ 0.3, 0.62 ] ) for ( const r of [ 0, Math.PI / 2 ] ) add( box( 2.9, 0.14, 0.14 ), { ...WOOD( 0x4a3a2a ), matrix: mat4( T.x, y + h * k, T.z, 0, r, 0 ) } );
		add( box( 3.4, 0.16, 3.4 ), { ...WOODX( 0x5a4632 ), matrix: mat4( T.x, y + h - 2.2, T.z ) } );
		for ( const r of [ 0, Math.PI / 2, Math.PI, - Math.PI / 2 ] ) add( box( 3.4, 0.9, 0.08 ), { ...WOOD( 0x4a3a2a ), matrix: mat4( T.x + Math.sin( r ) * 1.66, y + h - 1.7, T.z + Math.cos( r ) * 1.66, 0, r, 0 ) } );
		// the roof and the bell yoke
		add( cylinder( 0.05, 2.6, 1.3, 4 ), { color: TAR, rough: 0.8, matrix: mat4( T.x, y + h + 0.65, T.z, 0, Math.PI / 4, 0 ) } );
		add( box( 1.2, 0.12, 0.12 ), { ...WOOD( 0x2e241a ), matrix: mat4( T.x, y + h + 0.05, T.z ) } );
		// a ladder
		for ( let k = 0; k < 10; k ++ ) add( box( 0.6, 0.05, 0.05 ), { ...WOOD( 0x5a4632 ), matrix: mat4( T.x, y + 0.5 + k * ( h - 2.6 ) / 10, T.z + 1.45 ) } );
		if ( colliders ) colliders.addBox( new Vector3( T.x, y + h / 2, T.z ), new Vector3( 1.45, h / 2, 1.45 ), 0, { tag: 'bwTower' } );
		// the flag's halyard and a pennant on the tower
		add( box( 0.9, 0.35, 0.03 ), { color: 0x6b1e1a, rough: 0.9, matrix: mat4( T.x + 0.5, y + h + 1.5, T.z ) } );
		add( cylinder( 0.03, 0.03, 1.6, 5 ), { ...WOOD( 0x3a2e22 ), matrix: mat4( T.x, y + h + 1.1, T.z ) } );

	}

	// three guns on carriages across the platform's front (their own mesh: a silenced battery's guns slump)
	_battery( b ) {

		const m = this._mesh( ( add ) => {

			for ( const g of b.guns ) {

				const lx = ( g.x - b.x ) * Math.cos( b.yaw ) - ( g.z - b.z ) * Math.sin( b.yaw );
				const F = frameAt( 0, 0, 0, 0 );
				add( box( 0.9, 0.42, 1.5 ), { ...WOOD( 0x4a3424 ), matrix: F.m( lx, 1.58, 1.0 ) } );
				for ( const s of [ - 1, 1 ] ) for ( const z of [ 0.45, 1.55 ] ) add( cylinder( 0.22, 0.22, 0.1, 10 ), { ...WOOD( 0x3a2a1c ), matrix: F.m( lx + s * 0.5, 1.45, z, 0, 0, Math.PI / 2 ) } );
				add( cylinder( 0.13, 0.19, 2.1, 10 ), { color: 0x232526, metal: 0.7, rough: 0.4, matrix: F.m( lx, 1.92, 1.35, Math.PI / 2 - 0.06, 0, 0 ) } );
				add( sphere( 0.2, 8, 6 ), { color: 0x232526, metal: 0.7, rough: 0.4, matrix: F.m( lx, 1.92, 0.3 ) } );

			}

		}, 'BlackwaterGuns.' + b.id );
		m.position.set( b.x, b.y, b.z );
		m.rotation.set( 0, b.yaw, 0 );
		return m;

	}

	// the breakable structures as plain meshes (one each) while the destruction feature does not draw them
	_structures() {

		for ( const p of strongholdPlan( this.terrain ) ) {

			const K = STRONGHOLD_KINDS[ p.kind ];
			const pieces = K.build( rngFor( p.site + p.kind + p.id ), p.opts || {} );
			const m = this._mesh( ( add ) => {

				for ( const q of pieces ) {

					const rx = q.quat && q.quat.x ? 2 * Math.asin( Math.max( - 1, Math.min( 1, q.quat.x ) ) ) : 0;
					const g = q.type === 'barrel' ? cylinder( q.size[ 0 ] / 2, q.size[ 0 ] / 2, q.size[ 1 ], 10 ) : box( q.size[ 0 ], q.size[ 1 ], q.size[ 2 ] );
					add( g, { color: hexOf( q.color ), rough: 0.9, pattern: q.type === 'barrel' ? 0 : PAT.wood, matrix: mat4( q.pos.x, q.pos.y, q.pos.z, rx, 0, 0 ) } );

				}

			}, 'BlackwaterStructure.' + p.id );
			m.position.set( p.x, p.y, p.z );
			m.rotation.set( 0, p.yaw, 0 );
			this.structures.set( p.id, m );

		}

	}

	setStructuresDrawn( on ) {

		this._drawStructures = !! on;
		for ( const m of this.structures.values() ) m.visible = on && ! m.userData.broken && this.distance < NEAR;

	}

	setBroken( id, on ) {

		const m = this.structures.get( id );
		if ( ! m ) return;
		m.userData.broken = !! on;
		m.visible = this._drawStructures && ! on && this.distance < NEAR;

	}

	setSilenced( id, on ) {

		const m = this.guns.get( id );
		if ( ! m ) return;
		// the guns tip off their broken deck
		m.rotation.set( on ? 0.18 : 0, this.L.batteries.find( ( b ) => b.id === id ).yaw, on ? 0.12 : 0 );
		m.position.y = this.L.batteries.find( ( b ) => b.id === id ).y - ( on ? 0.9 : 0 );

	}

	setBell( k ) {

		this._bell = Math.max( 0, Math.min( 1, k ) );

	}

	setFlag( holder ) {

		this._holder = holder;
		if ( holder === 'player' ) this.flag.visible = false;

	}

	update( dt ) {

		this._t += dt;
		this.distance = cullParts( this.center, this.parts );
		if ( this._drawStructures ) for ( const p of this._structParts ) p.object.visible = ! p.object.userData.broken && ( ! Number.isFinite( this.distance ) || this.distance < p.dist );
		if ( this.bell.visible ) this.bell.rotation.z = this._bell * 0.6 * Math.sin( this._t * 7 );
		if ( this._holder === 'player' ) this.flag.visible = false;
		if ( this.flag.visible ) this.flag.rotation.y = 0.15 * Math.sin( this._t * 1.7 );

	}

	dispose() {

		if ( this.group.parent ) this.group.parent.remove( this.group );
		for ( const c of this.group.children ) if ( c.geometry && c.geometry.dispose ) c.geometry.dispose();
		if ( this.material && this.material.dispose ) this.material.dispose();

	}

}
