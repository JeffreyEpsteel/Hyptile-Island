// The fighters' look (wave 26A): public/models/warbirds/<Name>.glb (tools/warbirds/build_warbirds.py), one file per
// airframe with three levels of detail (nodes L0_ / L1_ / L2_<Part>), loaded once and shared by the local fighter, the
// parked ones, the other players' and the AI's. Each visual is a group in the model frame (+Z the nose, +X the left wing)
// with one group per wreck part (fuselage, wingL, wingR, tail, prop) holding all three levels' meshes, so a level switch
// is a visibility flip and a torn-off wing keeps its levels. The moving surfaces turn about hinges found from their
// bounds: the ailerons, the elevator and the rudder follow the stick, the undercarriage folds (out, in or back as built),
// the propeller spins and blurs into a disc. Until the GLB arrives (or if it fails) a small stand-in is drawn.
//
//   const models = new WarbirdModels( { scene } );
//   const v = models.create( 'sabrewing', { livery: 'own' | 'raider' | 'drone', pilot: true } );
//   v.setPose( position, quaternion );  v.update( dt, { rpm, gear, pitch, roll, yaw, cameraPos, cockpit } );
//   v.detach( 'wingL' | 'wingR' | 'tail' | 'prop' ) -> Group (into the scene, for the wreck)   v.setVisible( b )   v.dispose()
//   v.lod (0..2), v.loaded, v.parts { fuselage, wingL, wingR, tail, prop }

import { Group, Mesh, CircleGeometry, BufferGeometry, BufferAttribute, Matrix3, Matrix4, Quaternion, Vector3, Color } from '../../engine/index.js';
import { Material } from '../../engine/render/Material.js';
import { LAYERS } from '../../core/SceneRenderer.js';
import { loadGLB } from '../../engine/loaders/GLTF.js';
import { texturedMaterial } from '../../world/boat/StaticGLB.js';
import { prepare, mergePrepared, box, cylinder, mat4 } from '../../world/boat/GeoKit.js';
import { createPropMaterial, PAT } from '../../game/GameMaterials.js';
import { WARBIRDS } from './Warbirds.js';

export const LOD_DIST = [ 42, 170 ]; // m: level 1 past the first, level 2 past the second (phones: x 0.6)
const LOD_MARGIN = 0.1;
const PROP_SPIN = 52; // rad/s shown at full power (a stylised rate)
export const DEFLECT = { aileron: 0.38, elevator: 0.36, rudder: 0.4 }; // rad at full stick
// node part -> wreck group
const GROUP_OF = {
	Fuselage: 'fuselage', Glass: 'fuselage', Interior: 'fuselage', Sight: 'fuselage', Pilot: 'fuselage',
	WingL: 'wingL', AileronL: 'wingL', GearL: 'wingL', WingR: 'wingR', AileronR: 'wingR', GearR: 'wingR',
	Tail: 'tail', Elevator: 'tail', Rudder: 'tail', GearT: 'tail', Propeller: 'prop', Propeller2: 'prop2',
	Crew1: 'fuselage', Crew2: 'fuselage', Crew3: 'fuselage', Bomb: 'fuselage',
};
const HINGED = [ 'AileronL', 'AileronR', 'Elevator', 'Rudder', 'GearL', 'GearR', 'GearT' ];
export const GROUPS = [ 'fuselage', 'wingL', 'wingR', 'tail', 'prop', 'prop2' ];
// the turrets' nodes: Turret<Id> turns about up (yaw), Guns<Id> (its child) about the turret's span (pitch)
const turretKey = ( part ) => /^(Turret|Guns)([A-Za-z]+)$/.exec( part );

// the glass of the canopy and the reflector sight: clear, a Fresnel edge and a soft streak (the seaplane's recipe)
const GLASS_SURFACE = /* wgsl */`
	let fres = pow( max( 1.0 - abs( dot( in.N, in.V ) ), 0.0 ), 4.0 );
	let band = fract( ( in.uv.x + in.uv.y * 0.8 ) * 1.3 );
	let streak = smoothstep( 0.0, 0.05, band ) * ( 1.0 - smoothstep( 0.05, 0.16, band ) );
	s.alpha = clamp( s.alpha + fres * 0.45 + streak * 0.06, 0.0, 0.7 );
	s.albedo = mix( s.albedo, vec3f( 1.0 ), streak * 0.35 );
	s.roughness = 0.04;
`;

// the paint schemes the code applies: the Blackwater raiders' black and red, the target drones' orange and white
export const LIVERIES = {
	raider: { WbMain: [ 0.09, 0.09, 0.1 ], WbUnder: [ 0.2, 0.18, 0.18 ], WbBand: [ 0.7, 0.08, 0.06 ], WbTrim: [ 0.55, 0.07, 0.05 ], WbInsignia: [ 0.75, 0.1, 0.08 ], WbInsigniaCore: [ 0.05, 0.05, 0.05 ], WbInsigniaDot: [ 0.9, 0.85, 0.75 ] },
	drone: { WbMain: [ 0.95, 0.42, 0.1 ], WbUnder: [ 0.94, 0.93, 0.9 ], WbBand: [ 0.1, 0.1, 0.1 ], WbTrim: [ 0.95, 0.42, 0.1 ] },
};

const srgbToLinear = ( c ) => ( c <= 0.04045 ? c / 12.92 : Math.pow( ( c + 0.055 ) / 1.055, 2.4 ) );

function defaultBase() {

	try {

		return ( import.meta.env && import.meta.env.BASE_URL ) || '/';

	} catch ( e ) {

		return '/';

	}

}

// a level and a part from a node name ( 'L1_WingL' -> [ 1, 'WingL' ] )
export function nodeKey( name ) {

	const m = /^L(\d)_([A-Za-z]+\d?)/.exec( name || '' );
	return m ? [ + m[ 1 ], m[ 2 ] ] : null;

}

// the level for a camera distance, with a margin against flicker
export function lodFor( dist, current = 0, dists = LOD_DIST ) {

	let level = 0;
	for ( let i = 0; i < dists.length; i ++ ) {

		const d = dists[ i ] * ( current > i ? 1 - LOD_MARGIN : 1 + LOD_MARGIN );
		if ( dist > d ) level = i + 1;

	}

	return level;

}

// the propeller's blur: a disc of soft radial streaks that thickens with the rpm
function propDiscMaterial() {

	return new Material( {
		name: 'warbird-prop-disc',
		color: new Color( 0.03, 0.03, 0.035 ),
		roughness: 0.6,
		transparent: true,
		depthWrite: false,
		side: 'double',
		velocityWeight: 0,
		uniforms: { spin: [ 'f32', 0 ], blades: [ 'f32', 4 ], amount: [ 'f32', 0 ] },
		surface: /* wgsl */`
	let d = in.uv - vec2f( 0.5 );
	let r = length( d ) * 2.0;
	let a = atan2( d.y, d.x );
	let streak = 0.55 + 0.45 * cos( a * mat.blades + mat.spin );
	let rim = smoothstep( 1.0, 0.86, r ) * smoothstep( 0.12, 0.3, r );
	let tip = smoothstep( 0.86, 0.93, r ) * smoothstep( 1.0, 0.95, r );
	s.alpha = mat.amount * ( rim * streak * 0.33 + tip * 0.5 );
	s.albedo = mix( s.albedo, vec3f( 0.9, 0.72, 0.15 ), tip );
`,
	} );

}

// the stand-in: a fuselage, a wing, a tail as boxes in the airframe's colours
function standInGeometry( W ) {

	const c = ( rgb ) => ( ( Math.round( rgb[ 0 ] * 255 ) << 16 ) | ( Math.round( rgb[ 1 ] * 255 ) << 8 ) | Math.round( rgb[ 2 ] * 255 ) );
	const MAIN = { color: c( W.livery.main ), rough: 0.55, pattern: PAT.plain }, UNDER = { color: c( W.livery.trim ), rough: 0.5, pattern: PAT.plain };
	const P = [];
	P.push( prepare( box( 1.0, 1.1, W.length * 0.95 ), { ...MAIN, matrix: mat4( 0, 0.05, - 0.6 ) } ) );
	P.push( prepare( box( W.flight.span, 0.18, 2.0 ), { ...MAIN, matrix: mat4( 0, - 0.3, 0.4 ) } ) );
	P.push( prepare( box( 3.4, 0.12, 1.1 ), { ...MAIN, matrix: mat4( 0, 0.15, - W.length * 0.55 ) } ) );
	P.push( prepare( box( 0.12, 1.2, 1.2 ), { ...MAIN, matrix: mat4( 0, 0.85, - W.length * 0.56 ) } ) );
	P.push( prepare( box( 0.9, 0.9, 0.8 ), { ...UNDER, matrix: mat4( 0, 0.05, W.prop[ 2 ] - 0.6 ) } ) );
	P.push( prepare( cylinder( 0.12, 0.12, 1.4, 8 ), { color: 0x151515, rough: 0.8, matrix: mat4( W.gear.main[ 0 ], W.gear.main[ 1 ] + 0.7, W.gear.main[ 2 ] ) } ) );
	P.push( prepare( cylinder( 0.12, 0.12, 1.4, 8 ), { color: 0x151515, rough: 0.8, matrix: mat4( - W.gear.main[ 0 ], W.gear.main[ 1 ] + 0.7, W.gear.main[ 2 ] ) } ) );
	return mergePrepared( P );

}

export class WarbirdModels {

	constructor( { scene = null, baseUrl = defaultBase(), lodScale = 1 } = {} ) {

		this.scene = scene;
		this.baseUrl = baseUrl.endsWith( '/' ) ? baseUrl : baseUrl + '/';
		this.templates = new Map(); // id -> template
		this.loads = new Map();
		this.visuals = new Set();
		this.failed = new Set();
		this.lodScale = lodScale;
		this._painted = new Map();
		this._standIn = new Map();
		this._standInMat = null;

	}

	ready( id ) {

		return this._ensure( id );

	}

	_ensure( id ) {

		if ( this.loads.has( id ) ) return this.loads.get( id );
		const W = WARBIRDS[ id ];
		const url = this.baseUrl + W.model;
		const p = loadGLB( url ).then( ( gltf ) => this._template( id, gltf ) ).catch( ( e ) => {

			this.failed.add( id );
			console.warn( `dogfight: model ${ id } not loaded, using the stand-in`, e && e.message ? e.message : e );
			return null;

		} );
		this.loads.set( id, p );
		return p;

	}

	// the GLB's meshes by level and part (positions in the model frame), their materials, and the hinges
	_template( id, gltf ) {

		const mats = new Map();
		const materialFor = ( index ) => {

			if ( mats.has( index ) ) return mats.get( index );
			const gm = gltf.materials[ index ] || {};
			const pbr = gm.pbrMetallicRoughness || {};
			const name = gm.name || 'material' + index;
			const f = pbr.baseColorFactor || [ 1, 1, 1, 1 ];
			const glass = /Glass|Sight/.test( name );
			const opt = {
				name: 'warbird-' + name, color: new Color( f[ 0 ], f[ 1 ], f[ 2 ] ), roughness: pbr.roughnessFactor ?? 0.6, metalness: pbr.metallicFactor ?? 0,
				doubleSided: !! gm.doubleSided || glass, underwaterLighting: 'lite',
			};
			if ( glass ) Object.assign( opt, { transparent: true, opacity: /Sight/.test( name ) ? 0.22 : 0.1, surface: GLASS_SURFACE, depthWrite: false } );
			// the instrument dials glow a little (they are read in the shade of the cockpit)
			if ( /Dial/.test( name ) ) opt.emissive = new Color( f[ 0 ] * 0.25, f[ 1 ] * 0.25, f[ 2 ] * 0.22 );
			const m = { material: texturedMaterial( opt ), name, glass };
			m.material.userData.wb = name;
			mats.set( index, m );
			return m;

		};

		const toFloat = ( a ) => ( a.array instanceof Float32Array ? a.array : Float32Array.from( a.array ) );
		const nodeMatrix = ( n ) => new Matrix4().compose( new Vector3( ...n.t ), new Quaternion( ...n.r ), new Vector3( ...n.s ) );
		const items = [];
		const visit = ( ni, parent ) => {

			const node = gltf.nodes[ ni ];
			const world = new Matrix4().multiplyMatrices( parent, nodeMatrix( node ) );
			const key = nodeKey( node.name );
			if ( node.mesh !== undefined && key ) {

				for ( const p of gltf.meshes[ node.mesh ] ) {

					if ( p.mode !== undefined && p.mode !== 4 ) continue;
					const A = p.attributes;
					if ( ! A.POSITION ) continue;
					const geo = new BufferGeometry();
					geo.setAttribute( 'position', new BufferAttribute( toFloat( A.POSITION ).slice(), 3 ).applyMatrix4( world ) );
					if ( A.NORMAL ) geo.setAttribute( 'normal', new BufferAttribute( toFloat( A.NORMAL ).slice(), 3 ).applyNormalMatrix( new Matrix3().getNormalMatrix( world ) ) );
					if ( A.TEXCOORD_0 ) geo.setAttribute( 'uv', new BufferAttribute( toFloat( A.TEXCOORD_0 ), 2 ) );
					if ( p.indices ) geo.setIndex( new BufferAttribute( p.indices instanceof Uint8Array ? Uint16Array.from( p.indices ) : p.indices, 1 ) );
					if ( ! A.NORMAL ) geo.computeVertexNormals();
					geo.computeBoundingBox();
					geo.computeBoundingSphere();
					const m = materialFor( p.material ?? 0 );
					items.push( { level: key[ 0 ], part: key[ 1 ], geometry: geo, material: m.material, glass: m.glass, name: m.name } );

				}

			}

			for ( const c of node.children || [] ) visit( c, world );

		};

		for ( const ni of gltf.roots ) visit( ni, new Matrix4() );
		if ( ! items.length ) throw new Error( 'no L0_ / L1_ / L2_ nodes in ' + id );
		const W = WARBIRDS[ id ];
		const hinges = {};
		// hinges from the full level's bounds: the gear legs' tops, the control surfaces' leading edges
		for ( const part of HINGED ) {

			const list = items.filter( ( it ) => it.level === 0 && it.part === part );
			if ( ! list.length ) continue;
			let x0 = Infinity, x1 = - Infinity, y0 = Infinity, y1 = - Infinity, z0 = Infinity, z1 = - Infinity, topX = 0, topZ = 0;
			for ( const it of list ) {

				const a = it.geometry.attributes.position.array;
				for ( let i = 0; i < a.length; i += 3 ) {

					x0 = Math.min( x0, a[ i ] ); x1 = Math.max( x1, a[ i ] );
					z0 = Math.min( z0, a[ i + 2 ] ); z1 = Math.max( z1, a[ i + 2 ] );
					y0 = Math.min( y0, a[ i + 1 ] );
					if ( a[ i + 1 ] > y1 ) {

						y1 = a[ i + 1 ];
						topX = a[ i ];
						topZ = a[ i + 2 ];

					}

				}

			}

			if ( part.startsWith( 'Gear' ) ) hinges[ part ] = [ topX, y1, topZ ];
			else if ( part === 'Rudder' ) hinges[ part ] = [ 0, ( y0 + y1 ) / 2, z1 ];
			else hinges[ part ] = [ ( x0 + x1 ) / 2, ( y0 + y1 ) / 2, z1 ];

		}

		hinges.Propeller = W.props[ 0 ].slice();
		if ( W.props[ 1 ] ) hinges.Propeller2 = W.props[ 1 ].slice();
		for ( const T of W.turrets ) {

			const k = T.id[ 0 ].toUpperCase() + T.id.slice( 1 );
			hinges[ 'Turret' + k ] = T.at.slice();
			hinges[ 'Guns' + k ] = T.at.slice();

		}
		// the moving parts' meshes move to their hinge's origin (once: the geometry belongs to the template)
		for ( const it of items ) {

			const h = hinges[ it.part ];
			if ( h ) {

				it.geometry.translate( - h[ 0 ], - h[ 1 ], - h[ 2 ] );
				it.geometry.computeBoundingBox();
				it.geometry.computeBoundingSphere();

			}

		}

		const tpl = { id, items, hinges, materials: [ ...new Set( items.map( ( it ) => it.material ) ) ] };
		this.templates.set( id, tpl );
		for ( const v of this.visuals ) if ( v.id === id && ! v.loaded ) v._fill( tpl );
		return tpl;

	}

	// a repainted clone of a material for a livery (shared per scheme)
	painted( material, livery ) {

		const L = LIVERIES[ livery ];
		const name = material && material.userData && material.userData.wb;
		const rgb = L && name && L[ name ];
		if ( ! rgb ) return material;
		const key = material.id + '|' + livery;
		let m = this._painted.get( key );
		if ( ! m ) {

			m = material.clone();
			m.color = rgb.map( srgbToLinear );
			this._painted.set( key, m );

		}

		return m;

	}

	standIn( id ) {

		if ( ! this._standIn.has( id ) ) this._standIn.set( id, standInGeometry( WARBIRDS[ id ] ) );
		if ( ! this._standInMat ) this._standInMat = createPropMaterial( 'warbirdStandIn' );
		return { geometry: this._standIn.get( id ), material: this._standInMat };

	}

	discGeometry( id ) {

		const k = 'disc|' + id;
		if ( ! this._standIn.has( k ) ) this._standIn.set( k, new CircleGeometry( WARBIRDS[ id ].propRadius * 1.02, 40 ) );
		return this._standIn.get( k );

	}

	create( id, opts = {} ) {

		if ( ! WARBIRDS[ id ] ) id = 'sabrewing';
		const v = new WarbirdVisual( this, id, opts );
		this.visuals.add( v );
		if ( this.scene ) this.scene.add( v.group );
		const tpl = this.templates.get( id );
		if ( tpl ) v._fill( tpl );
		else {

			v._fillStandIn();
			this._ensure( id );

		}

		return v;

	}

	release( v ) {

		this.visuals.delete( v );
		if ( v.group.parent ) v.group.removeFromParent();

	}

	dispose() {

		for ( const v of [ ...this.visuals ] ) v.dispose();
		for ( const m of this._painted.values() ) m.dispose && m.dispose();
		this._painted.clear();
		for ( const g of this._standIn.values() ) g.dispose && g.dispose();
		this._standIn.clear();
		for ( const t of this.templates.values() ) {

			for ( const it of t.items ) it.geometry.dispose && it.geometry.dispose();
			for ( const m of t.materials ) m.dispose && m.dispose();

		}

		this.templates.clear();

	}

}

const _cam = new Vector3(), _up = new Vector3( 0, 1, 0 ), _right = new Vector3( 1, 0, 0 ), _qa = new Quaternion(), _qb = new Quaternion(), _qc = new Quaternion();

export class WarbirdVisual {

	constructor( owner, id, { livery = 'own', pilot = true, interior = false } = {} ) {

		this.owner = owner;
		this.id = id;
		this.W = WARBIRDS[ id ];
		this.livery = livery;
		this.pilot = pilot;
		this.interior = interior;
		this.group = new Group();
		this.group.name = 'Warbird-' + id;
		this.parts = {};
		for ( const n of GROUPS ) {

			const g = new Group();
			g.name = 'warbird-' + n;
			this.parts[ n ] = g;
			this.group.add( g );

		}

		this.pivots = {};
		this.meshes = [];
		this.byLevel = [ [], [], [] ];
		this.blades = [];
		this.detached = new Set();
		this.lod = - 1;
		this.loaded = false;
		this.angle = 0;
		this.disc = null;
		this._last = { gear: - 1 };

	}

	_clear() {

		for ( const m of this.meshes ) m.removeFromParent();
		this.meshes = [];
		this.byLevel = [ [], [], [] ];
		this.blades = [];
		for ( const p of Object.values( this.pivots ) ) p.removeFromParent();
		this.pivots = {};
		for ( const d of this.discs || [] ) {

			d.removeFromParent();
			if ( d.material && d.material.dispose ) d.material.dispose();

		}

		this.discs = [];
		this.disc = null;

	}

	_pivot( part, h ) {

		if ( this.pivots[ part ] ) return this.pivots[ part ];
		const g = new Group();
		g.name = 'warbird-pivot-' + part;
		const tk = turretKey( part );
		if ( tk && tk[ 1 ] === 'Guns' ) {

			// the guns ride the turret: their pivot is the turret's (same point), a child of it
			const base = this._pivot( 'Turret' + tk[ 2 ], h );
			base.add( g );
			this.pivots[ part ] = g;
			return g;

		}

		g.position.set( h[ 0 ], h[ 1 ], h[ 2 ] );
		this.parts[ GROUP_OF[ part ] || 'fuselage' ].add( g );
		this.pivots[ part ] = g;
		return g;

	}

	_fill( t ) {

		this._clear();
		for ( const it of t.items ) {

			if ( it.part === 'Interior' || it.part === 'Sight' ) if ( it.level !== 0 ) continue;
			const h = t.hinges[ it.part ];
			const parent = h ? this._pivot( it.part, h ) : this.parts[ GROUP_OF[ it.part ] || 'fuselage' ];
			const m = new Mesh( it.geometry, this.livery !== 'own' ? this.owner.painted( it.material, this.livery ) : it.material );
			m.name = 'warbird-' + it.name + '-' + it.part;
			m.castShadow = ! it.glass && it.level < 2;
			m.receiveShadow = ! it.glass;
			if ( it.glass ) {

				m.layers.set( LAYERS.TRANSPARENT );
				m.renderOrder = 1;

			}

			m.userData.level = it.level;
			m.userData.part = it.part;
			parent.add( m );
			this.meshes.push( m );
			this.byLevel[ it.level ].push( m );
			if ( it.part === 'Propeller' || it.part === 'Propeller2' ) this.blades.push( m );

		}

		// the blur disc at each hub, facing the nose (its own material: every propeller blurs at its own rpm)
		this.discs = [];
		for ( const name of [ 'Propeller', 'Propeller2' ] ) {

			const prop = this.pivots[ name ];
			if ( ! prop ) continue;
			const d = new Mesh( this.owner.discGeometry( this.id ), propDiscMaterial() );
			d.name = 'warbird-prop-disc';
			d.layers.set( LAYERS.TRANSPARENT );
			d.castShadow = false;
			d.position.z = 0.05;
			d.renderOrder = 2;
			prop.add( d );
			this.discs.push( d );

		}

		this.disc = this.discs[ 0 ] || null;
		this.crewShown = this.crewShown || null;

		this.loaded = true;
		this.lod = - 1;
		this.setLod( 0 );

	}

	_fillStandIn() {

		this._clear();
		const s = this.owner.standIn( this.id );
		const m = new Mesh( s.geometry, s.material );
		m.name = 'warbird-standin';
		m.castShadow = true;
		m.userData.level = - 1;
		this.parts.fuselage.add( m );
		this.meshes.push( m );

	}

	// which meshes draw: the level's, the cockpit only on the local aircraft (interior), the figure only on others'
	setLod( level ) {

		level = Math.max( 0, Math.min( 2, level | 0 ) );
		const flags = `${ this.interior }|${ this.pilot }|${ this.crewShown ? this.crewShown.join( '' ) : '' }|${ this.bombShown }`;
		if ( level === this.lod && this._flags === flags ) return;
		this.lod = level;
		this._flags = flags;
		for ( const m of this.meshes ) {

			const lv = m.userData.level;
			if ( lv < 0 ) continue;
			let on = lv === level;
			if ( m.userData.part === 'Interior' || m.userData.part === 'Sight' ) on = this.interior;
			if ( m.userData.part === 'Pilot' ) on = on && this.pilot && ( ! this.crewShown || this.crewShown[ 0 ] !== false );
			const ck = /^Crew(\d)$/.exec( m.userData.part );
			if ( ck ) on = on && !! this.crewShown && !! this.crewShown[ + ck[ 1 ] ];
			if ( m.userData.part === 'Bomb' ) on = on && this.bombShown !== false;
			m.visible = on;

		}

	}

	setPose( p, q ) {

		this.group.position.copy( p );
		this.group.quaternion.copy( q );

	}

	// rpm 0..1, gear 0 (up) .. 1 (down), the stick and rudder -1..1; cameraPos picks the level; cockpit: the camera is in it
	update( dt, { rpm = 0, gear = 1, pitch = 0, roll = 0, yaw = 0, cameraPos = null, cockpit = false, lodScale = 1 } = {} ) {

		if ( cameraPos && this.loaded ) {

			const d = cockpit ? 0 : _cam.copy( cameraPos ).distanceTo( this.group.position ) / Math.max( 0.2, lodScale );
			this.setLod( lodFor( d, this.lod ) );

		}

		// the propellers: spin, then blur into the discs (rpm: one value, or one per engine)
		const rpms = Array.isArray( rpm ) ? rpm : [ rpm, rpm ];
		this.angle = ( this.angle + dt * Math.min( 1, rpms[ 0 ] ) * PROP_SPIN ) % ( Math.PI * 2 );
		this.angle2 = ( ( this.angle2 || 0 ) + dt * Math.min( 1, rpms[ 1 ] ?? rpms[ 0 ] ) * PROP_SPIN ) % ( Math.PI * 2 );
		[ 'Propeller', 'Propeller2' ].forEach( ( name, k ) => {

			const prop = this.pivots[ name ];
			if ( prop && ! this.detached.has( k ? 'prop2' : 'prop' ) ) prop.rotation.set( 0, 0, k ? - this.angle2 : this.angle );
			const r = rpms[ k ] ?? rpms[ 0 ];
			const blur = Math.max( 0, Math.min( 1, ( r - 0.3 ) / 0.35 ) );
			for ( const b of this.blades ) if ( b.userData.level === this.lod && b.userData.part === name ) b.visible = blur < 0.98;
			const d = this.discs && this.discs[ k ];
			if ( d ) {

				d.visible = blur > 0.02;
				const m = d.material;
				if ( m && m.uniforms ) {

					m.uniforms.amount.value = blur;
					m.uniforms.blades.value = this.W.props.length > 1 ? 3 : 4;
					m.uniforms.spin.value = ( k ? this.angle2 : this.angle ) * 3;

				}

			}

		} );

		// the control surfaces
		const P = this.pivots;
		if ( P.AileronL ) P.AileronL.rotation.set( - roll * DEFLECT.aileron, 0, 0 );
		if ( P.AileronR ) P.AileronR.rotation.set( roll * DEFLECT.aileron, 0, 0 );
		if ( P.Elevator ) P.Elevator.rotation.set( pitch * DEFLECT.elevator, 0, 0 );
		if ( P.Rudder ) P.Rudder.rotation.set( 0, yaw * DEFLECT.rudder, 0 );
		// the undercarriage folds as built: out / in along the span (about the nose axis) or back (about the span)
		if ( Math.abs( gear - this._last.gear ) > 1e-3 ) {

			this._last.gear = gear;
			const up = 1 - Math.max( 0, Math.min( 1, gear ) );
			const r = this.W.gear.retract || 'in';
			const a = up * 1.55;
			if ( r === 'fixed' ) {

				// (spatted: always down)

			} else if ( r === 'back' ) {

				if ( P.GearL ) P.GearL.rotation.set( a, 0, 0 );
				if ( P.GearR ) P.GearR.rotation.set( a, 0, 0 );

			} else {

				const s = r === 'out' ? 1 : - 1;
				if ( P.GearL ) P.GearL.rotation.set( 0, 0, s * a );
				if ( P.GearR ) P.GearR.rotation.set( 0, 0, - s * a );

			}

			if ( P.GearT ) P.GearT.rotation.set( up * 1.4, 0, 0 );
			for ( const n of [ 'GearL', 'GearR', 'GearT' ] ) if ( P[ n ] ) P[ n ].visible = up < 0.98;

		}

	}

	// the crew figures (seat i occupied by somebody drawn in it: the AI, another player), the bomb on its crutch
	setCrew( shown ) {

		this.crewShown = shown ? shown.slice() : null;
		const l = this.lod;
		this.lod = - 1;
		this.setLod( l < 0 ? 0 : l );

	}

	setBomb( on ) {

		if ( this.bombShown === on ) return;
		this.bombShown = on;
		const l = this.lod;
		this.lod = - 1;
		this.setLod( l < 0 ? 0 : l );

	}

	// a turret's angles (Crew.js turretQuat: yaw about up, then pitch about the turret's span at its rest heading)
	setTurret( index, yaw, pitch ) {

		const T = this.W.turrets[ index ];
		if ( ! T ) return;
		const k = T.id[ 0 ].toUpperCase() + T.id.slice( 1 );
		const base = this.pivots[ 'Turret' + k ], guns = this.pivots[ 'Guns' + k ];
		if ( base ) base.rotation.set( 0, yaw, 0 );
		if ( guns ) {

			// Ry( rest ) Rx( - pitch ) Ry( - rest ): the barrels were built pointing along the rest heading
			_qa.setFromAxisAngle( _up, T.rest );
			_qb.setFromAxisAngle( _right, - pitch );
			_qc.setFromAxisAngle( _up, - T.rest );
			guns.quaternion.copy( _qa ).multiply( _qb ).multiply( _qc );

		}

	}

	// a part torn off: out of the aircraft into the scene, where it was (the wreck flies it from there)
	detach( name ) {

		const g = this.parts[ name ];
		if ( ! g || this.detached.has( name ) ) return null;
		this.detached.add( name );
		this.group.updateMatrixWorld( true );
		const wp = new Vector3(), wq = new Quaternion();
		this.group.getWorldPosition( wp );
		this.group.getWorldQuaternion( wq );
		g.removeFromParent();
		g.position.copy( wp );
		g.quaternion.copy( wq );
		const scene = this.owner.scene;
		if ( scene ) scene.add( g );
		return g;

	}

	// every part back (a repaired / respawned aircraft)
	reassemble() {

		for ( const n of this.detached ) {

			const g = this.parts[ n ];
			g.removeFromParent();
			g.position.set( 0, 0, 0 );
			g.quaternion.identity();
			g.visible = true;
			this.group.add( g );

		}

		this.detached.clear();

	}

	setVisible( v ) {

		this.group.visible = v;
		for ( const n of this.detached ) this.parts[ n ].visible = v;

	}

	dispose() {

		this.reassemble();
		this._clear();
		this.owner.release( this );

	}

}
