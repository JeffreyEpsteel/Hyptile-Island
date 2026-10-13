import { BoxGeometry, CylinderGeometry, Group, MathUtils, Mesh, Object3D, Vector3 } from '../../engine/index.js';
import { Material } from '../../engine/render/Material.js';
import { BOATS, boatUrl } from '../../game/Boats.js';
import { RHO_SEAWATER } from './HullLines.js';
import { SimpleHullLines } from './SimpleHullLines.js';
import { buildHullVolume } from './HullBuilder.js';
import { loadStaticGLB } from './StaticGLB.js';
import { triangleCount } from './GeoKit.js';
import { wheelGeometry } from './Wheelhouse.js';
import { WHEEL_TURNS, steerWheel, wheelGripPoints, helmStandFor } from '../BoatModel.js';

// A fleet hull (Boats.js kind 'fleet'): the GLB visual under a SimpleHullLines body, with the
// same public interface as the procedural BoatModel so BoatController / Player / BoatSpray /
// WakeSim / LocalLights / Birds can drive it unchanged:
//
//   const model = new FleetBoatModel( 'skiff' );   // synchronous: group, lines, hydro, anchors
//   await model.ready;                              // the GLB has replaced the placeholder box
//   model.group, lines, dimensions, hydro, helmEye, helmPoint, boardPoint, exitPoints, propeller,
//   rudder, bowSprayPoints, hullSamples, colliders, stations, contactPoints, outline, physics,
//   meshes (by material name once loaded), materials, setSteering / setThrottle / setPropellerRPM /
//   setNavLights, update( dt ), createHullVolumeGeometry(), triangleCount, dispose(),
//   the helm wheel as on BoatModel: wheelPivot / wheelMesh / wheelRadius / wheelGripAngle / wheelTurns, helmStand, steering,
//   wheelGrips( outL, outR ) (the hands' targets on the rim, boat frame, turning with the wheel)
//
// The fleet GLBs are single merged meshes with no wheel / tiller node, so every fleet hull gets the lobster boat's procedural
// wheel (Wheelhouse.wheelGeometry) on a pedestal HELM_WHEEL.ahead in front of the helm point; it exists from the constructor
// (setSteering turns it before the GLB is in) and moves into the hull node when the GLB arrives.
//
// Boat frame as BoatModel: +Z forward, +Y up, +X port, y = 0 the design waterline. The hull GLBs
// are authored in this frame (keel at y ~ -0.22, deck floor ~ 0.31, gunwale ~ 0.62-0.7).
//
// ShipBoatModel (the big ships, Boats.js kind 'ship') extends this class through four hooks: KINDS (the catalog
// kinds it accepts), _makeLines( spec ), _adoptGLB( glb ) (what is added to the group) and _buildColliders().

// lobster-boat (8.2 m x 2.9 m, draft 0.85) reference tables scaled to each hull
const LOBSTER = { length: 8.2, beam: 2.9, draft: 0.85 };
const STATIONS = [ [ - 3.4, 0.73 ], [ - 2.3, 0.78 ], [ - 1.2, 0.8 ], [ - 0.1, 0.77 ], [ 1.0, 0.62 ], [ 2.1, 0.33 ], [ 3.2, 0.14 ] ];
const CONTACTS = [
	[ 0, - 0.7, 3.2 ], [ 0, - 0.75, 0 ], [ 0, - 0.72, - 3.4 ],
	[ 1.1, - 0.4, 1.5 ], [ - 1.1, - 0.4, 1.5 ], [ 1.2, - 0.35, - 2.5 ], [ - 1.2, - 0.35, - 2.5 ],
	[ 0, 0.2, 4.2 ],
];
const OUTLINE = [ [ 0, 0.3, 4.1 ], [ 1.2, 0.3, 2.0 ], [ - 1.2, 0.3, 2.0 ], [ 1.4, 0.3, - 1.0 ], [ - 1.4, 0.3, - 1.0 ], [ 1.2, 0.3, - 3.8 ], [ - 1.2, 0.3, - 3.8 ] ];

// per-hull extras: solid wheelhouse box of the launch (GLB extents)
const WHEELHOUSE = { launch: { x: 0.63, y0: 0.31, y1: 1.68, z0: 1.2, z1: 1.8 } };
// the pedestal wheel of the fleet hulls: centre ahead of the helm point and above the deck (m), the face tilted back (rad)
const HELM_WHEEL = { ahead: 0.42, height: 0.92, tilt: 0.42, radius: 0.2 };
// The GLBs already have the bow at +Z: the rudder blade hangs at -Z (checked with test/world-fleet.mjs).

export class FleetBoatModel {

	static KINDS = [ 'fleet' ];

	constructor( boatId ) {

		const spec = BOATS[ boatId ];
		if ( ! spec || ! new.target.KINDS.includes( spec.kind ) ) throw new Error( `${ new.target.name }: not a ${ new.target.KINDS.join( '/' ) } boat: ${ boatId }` );
		this.id = boatId;
		this.spec = spec;

		const lines = this.lines = this._makeLines( spec );
		const L = spec.length, B = spec.beam;

		this.group = new Group();
		this.group.name = 'FleetBoat:' + boatId;
		this.meshes = {};
		this.materials = [];
		this.loaded = false;

		// placeholder hull until the GLB arrives
		const ph = new Mesh( new BoxGeometry( B * 0.9, spec.freeboard + spec.draft, L * 0.92 ), new Material( { name: 'boat-placeholder', color: 0x2a2a2e, roughness: 0.9, underwaterLighting: 'lite' } ) );
		ph.name = 'boat-placeholder';
		ph.position.y = ( spec.freeboard - spec.draft ) / 2;
		ph.castShadow = ph.receiveShadow = true;
		this.group.add( ph );
		this._placeholder = ph;

		// the helm wheel (before the GLB: setSteering works from the start)
		this._helmParts = null;
		this.wheelGripAngle = Math.PI / 6;
		this.wheelTurns = WHEEL_TURNS;
		this._buildHelm( spec, lines );

		this.ready = loadStaticGLB( boatUrl( spec ) ).then( ( glb ) => {

			this._glb = glb;
			for ( const m of glb.materials ) m.underwaterLighting = 'lite';
			for ( const m of glb.meshes ) this.meshes[ m.name.replace( /^boat-/, '' ) ] = m;
			this.materials = glb.materials;
			this.group.remove( ph );
			ph.geometry.dispose && ph.geometry.dispose();
			this._placeholder = null;
			const hull = this._adoptGLB( glb );
			this.group.add( hull );
			this._mountHelm( hull );
			this.loaded = true;
			return this;

		} );

		// ---- dimensions and hydrostatics

		this.dimensions = {
			length: L,
			beam: B,
			draft: spec.draft, // design draft: keel below the waterline (GLB)
			freeboard: lines.sheerY( 0 ),
			freeboardBow: lines.sheerY( 1 ),
			deckHeight: lines.deckY,
			hullDepth: lines.draftAt( lines.centerOfFlotationZ ),
			waterlineLength: lines.wlEnd - lines.wlStart,
			waterlineBeam: 2 * lines.halfBeamAt( lines.centerOfFlotationZ ),
			houseRoofHeight: WHEELHOUSE[ boatId ] ? WHEELHOUSE[ boatId ].y1 : lines.sheerY( 0.5 ) + 0.05,
		};

		const mass = spec.mass;
		this.hydro = {
			waterplaneArea: lines.waterplaneArea,
			canoeVolume: lines.canoeVolume, // what hullSamples integrate (draft solved for the mass)
			keelVolume: 0,
			displacedVolume: lines.canoeVolume,
			suggestedMass: mass,
			massWithKeel: mass,
			centerOfBuoyancy: lines.centerOfBuoyancy.clone(),
			centerOfFlotationZ: lines.centerOfFlotationZ,
			waterlineStart: lines.wlStart,
			waterlineEnd: lines.wlEnd,
			seawaterDensity: RHO_SEAWATER,
			centerOfMass: new Vector3( 0, 0.15, lines.centerOfBuoyancy.z ),
			metacentricRadius: lines.transverseInertia / lines.canoeVolume,
		};
		const kRoll = 0.36 * B, kPitch = 0.26 * L, kYaw = 0.27 * L;
		this.hydro.inertia = new Vector3( mass * kPitch * kPitch, mass * kYaw * kYaw, mass * kRoll * kRoll );

		// ---- anchor points (boat frame)

		this.helmEye = new Vector3( spec.helm.x, 1.55, spec.helm.z ); // standing at the tiller
		this.helmPoint = { x: spec.helm.x, z: spec.helm.z };
		this.helmStand = helmStandFor( this.wheelPivot, lines.deckY ); // the feet at the wheel (Player's boat pose may use it)
		this.boardPoint = new Vector3( spec.board.x, lines.deckY, spec.board.z );

		this.exitPoints = [];
		for ( const z of [ lines.zAft + 0.6, 0, lines.zFore - 0.6 ] ) {

			const t = lines.tAtSheerZ( z );
			for ( const s of [ 1, - 1 ] ) this.exitPoints.push( new Vector3( s * ( lines.sheerX( t ) - 0.035 ), lines.sheerY( t ) + 0.05, z ) );

		}

		this.propeller = new Vector3( 0, - 0.15, lines.zAft + 0.1 );
		this.rudder = { z: lines.zAft + 0.05 };

		this.bowSprayPoints = [];
		for ( const f of [ 0.45, 0.6, 0.75, 0.9 ] ) {

			const z = lines.zBow * f;
			const hb = lines.halfBeamAt( z );
			for ( const s of [ 1, - 1 ] ) this.bowSprayPoints.push( new Vector3( s * ( hb + 0.01 ), 0.05, z ) );

		}

		this.hullSamples = lines.buildHullSamples( 8 );
		this.colliders = this._buildColliders();

		// BoatController tables, scaled from the lobster boat
		const sz = L / LOBSTER.length, sx = B / LOBSTER.beam, sy = spec.draft / LOBSTER.draft;
		this.stations = STATIONS.map( ( [ z, a ] ) => [ z * sz, a * sx * sz ] );
		this.contactPoints = CONTACTS.map( ( [ x, y, z ] ) => new Vector3( x * sx, y < 0 ? y * sy : y * 0.5, z * sz ) );
		this.outline = OUTLINE.map( ( [ x, y, z ] ) => new Vector3( x * sx, y, z * sz ) );
		this.physics = { maxThrust: spec.maxThrust, pitchSpeed: spec.pitchSpeed, reverseFactor: 0.4, mass };

		// ---- state

		this._steer = 0;
		this._throttle = 0;
		this._rpm = 0;
		this._navLights = false;
		this._time = 0;

	}

	// the lines plan of the catalog entry (SimpleHullLines; ships pass the measured shape options)
	_makeLines( spec ) {

		return new SimpleHullLines( spec );

	}

	// the node that goes into the group for a loaded GLB (ships turn it into the boat frame first)
	_adoptGLB( glb ) {

		glb.group.name = 'boat-hull';
		return glb.group;

	}

	// Closed low-poly hull volume (parabolic sections lofted along the plan, transom and lid at the
	// sheer) in the boat frame; a water-exclusion mask, not added to the group.
	createHullVolumeGeometry() {

		return buildHullVolume( this.lines );

	}

	halfBeamAt( z ) {

		return this.lines.halfBeamAt( z );

	}

	draftAt( z ) {

		return this.lines.draftAt( z );

	}

	// -1..1, positive turns to port (the wheel turns counter-clockwise as seen from the helm)
	setSteering( a ) {

		this._steer = MathUtils.clamp( a, - 1, 1 );
		steerWheel( this.wheelMesh, this._steer, this.wheelTurns );

	}

	get steering() {

		return this._steer;

	}

	// the helmsman's hand targets on the wheel rim (boat frame), turning with the wheel
	wheelGrips( outL, outR ) {

		return wheelGripPoints( this.wheelPivot, this.wheelMesh, this.wheelRadius, this.wheelGripAngle, outL, outR );

	}

	// the procedural wheel on a pedestal in front of the helm point (a teak wheel, a brass binnacle cap)
	_buildHelm( spec, lines ) {

		const deck = lines.deckY, W = HELM_WHEEL;
		const stand = new Group();
		stand.name = 'boat-helm';
		const wood = new Material( { name: 'boat-helm-wood', color: 0x8a5a36, roughness: 0.6, underwaterLighting: 'lite' } );
		const brass = new Material( { name: 'boat-helm-brass', color: 0xb8913f, roughness: 0.35, metalness: 0.85, underwaterLighting: 'lite' } );
		const pivot = this.wheelPivot = new Object3D();
		pivot.name = 'boat-wheel-pivot';
		pivot.position.set( spec.helm.x, deck + W.height, spec.helm.z + W.ahead );
		pivot.rotation.x = W.tilt; // the axle runs forward and down into the pedestal
		const wheelGeo = wheelGeometry();
		const wheel = this.wheelMesh = new Mesh( wheelGeo, wood );
		wheel.name = 'boat-wheel';
		pivot.add( wheel );
		stand.add( pivot );
		// the pedestal from the deck up to the shaft, just ahead of the wheel
		const h = W.height - 0.07;
		const postGeo = new CylinderGeometry( 0.045, 0.065, h, 12 );
		const post = new Mesh( postGeo, wood );
		post.position.set( pivot.position.x, deck + h / 2, pivot.position.z + 0.09 );
		const capGeo = new BoxGeometry( 0.13, 0.11, 0.15 );
		const cap = new Mesh( capGeo, brass );
		cap.position.set( pivot.position.x, deck + h + 0.02, pivot.position.z + 0.08 );
		cap.rotation.x = W.tilt;
		for ( const m of [ wheel, post, cap ] ) { m.castShadow = true; m.receiveShadow = true; }
		stand.add( post, cap );
		this.group.add( stand );
		this.wheelRadius = W.radius;
		this._helm = stand;
		this._helmParts = { geos: [ wheelGeo, postGeo, capGeo ], mats: [ wood, brass ] };

	}

	// the GLB is in: the helm goes into the hull node (the fleet GLBs are in the boat frame)
	_mountHelm( hull ) {

		if ( this._helm && hull !== this.group ) hull.add( this._helm );

	}

	setThrottle( t ) {

		this._throttle = MathUtils.clamp( t, - 1, 1 );

	}

	setPropellerRPM( rpm ) {

		this._rpm = rpm;

	}

	setNavLights( on ) {

		this._navLights = !! on;

	}

	update( dt ) {

		if ( ! ( dt > 0 ) ) return;
		this._time += dt;

	}

	dispose() {

		if ( this._placeholder ) this._placeholder.geometry.dispose && this._placeholder.geometry.dispose();
		if ( this._glb ) this._glb.dispose();
		if ( this._helmParts ) {

			for ( const g of this._helmParts.geos ) g.dispose && g.dispose();
			for ( const m of this._helmParts.mats ) m.dispose && m.dispose();

		}

	}

	get triangleCount() {

		let n = 0;
		this.group.traverse( ( o ) => {

			if ( o.isMesh && o.geometry ) n += triangleCount( o.geometry );

		} );
		return n;

	}

	// Boat-frame colliders (axis-aligned boxes: { tag, center, half, walkable, solid }) for the
	// character controller: the open deck, low solid gunwales, the transom, a thwart to stand on and,
	// on the launch, the wheelhouse.
	_buildColliders() {

		const L = this.lines;
		const boxes = [];
		const V = ( x, y, z ) => new Vector3( x, y, z );
		const add = ( tag, min, max, walkable = false, solid = true ) => {

			const center = new Vector3().addVectors( min, max ).multiplyScalar( 0.5 );
			const half = new Vector3().subVectors( max, min ).multiplyScalar( 0.5 );
			boxes.push( { tag, center, half, walkable, solid } );

		};

		const inner = ( z ) => Math.max( 0.15, L.halfBreadth( L.tAtSheerZ( z ), L.deckY ) - L.shell );
		const zMid = ( L.zAft + L.zFore ) / 2;
		add( 'deck', V( - inner( zMid ), L.deckY - 0.1, L.zAft + L.shell ), V( inner( zMid ), L.deckY, L.zFore ), true, false );

		// gunwales in four segments following the sheer
		const n = 4;
		for ( let i = 0; i < n; i ++ ) {

			const z0 = L.zAft + ( L.zBow - L.zAft ) * i / n, z1 = L.zAft + ( L.zBow - L.zAft ) * ( i + 1 ) / n;
			const t0 = L.tAtSheerZ( z0 ), t1 = L.tAtSheerZ( z1 );
			const top = Math.max( L.sheerY( t0 ), L.sheerY( t1 ) ) + 0.045;
			const xo = Math.max( L.sheerX( t0 ), L.sheerX( t1 ) );
			const xi = Math.max( 0.1, Math.min( inner( z0 ), inner( z1 ) ) );
			for ( const s of [ 1, - 1 ] ) add( 'bulwark', V( Math.min( s * xi, s * xo ), L.deckY, z0 ), V( Math.max( s * xi, s * xo ), top, z1 ) );

		}

		add( 'transom', V( - L.sheerX( 0 ), L.deckY, L.zAft ), V( L.sheerX( 0 ), L.sheerY( 0 ) + 0.045, L.zAft + L.shell ) );
		// stem: a solid wedge box in front of the walkable deck
		add( 'stem', V( - inner( L.zFore ), L.deckY, L.zFore ), V( inner( L.zFore ), L.sheerY( 1 ) + 0.045, L.zBow ) );
		// a thwart (seat) across the hull, walkable
		const zt = 0.35, wt = inner( zt );
		add( 'thwart', V( - wt, L.deckY, zt - 0.12 ), V( wt, L.deckY + 0.22, zt + 0.12 ), true );

		const wh = WHEELHOUSE[ this.id ];
		if ( wh ) add( 'wheelhouse', V( - wh.x, wh.y0, wh.z0 ), V( wh.x, wh.y1, wh.z1 ) );

		return boxes;

	}

}
