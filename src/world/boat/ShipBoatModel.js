import { BoxGeometry, CylinderGeometry, Group, Mesh, Vector3 } from '../../engine/index.js';
import { Material } from '../../engine/render/Material.js';
import { FleetBoatModel } from './FleetBoatModel.js';
import { SimpleHullLines } from './SimpleHullLines.js';
import { MODEL_YAW, centreOnHull, mirrorHull } from './ShipFrame.js';
import { shipColliders, shipExitPoints, gunMounts, helmDeckY, MUZZLE_REACH } from './ShipDecks.js';

// The player's ship (Boats.js kind 'ship': trawler, sloop, brigantine): the fork's ship GLB under a SimpleHullLines body
// (measured shape options in the catalog entry), with the same public interface as FleetBoatModel / BoatModel so
// BoatController, Player, BoatSpray, WakeSim, Birds... drive it unchanged:
//
//   const model = new ShipBoatModel( 'sloop' );     // synchronous: group, lines, hydro, anchors, colliders, guns
//   await model.ready;                               // the GLB (turned into the boat frame, centred on the hull) is in
//
// Differences from the fleet hulls:
// - the GLB is +X forward, so it hangs in a pivot turned by MODEL_YAW and shifted by centreOnHull() (ShipFrame.js); the
//   brigantine (catalog `mirror`) is mirrored so its tender is not in the pier-side boarding opening;
// - the walking surfaces, bulwarks, mast tabernacles and the trawler's wheelhouse come from ShipDecks.js
//   (main deck at spec.deckY, the quarterdeck / helm platform at spec.helmDeckY, stepped ramps and stairs);
// - helmEye stands at the platform (helmDeckY + 1.55); `dimensions.helmDeckHeight` is the same height. The deck walker
//   (Player.pose / leaveHelm) should use it instead of `lines.deckY` for the avatar at the wheel;
// - exitPoints are the rail openings (amidships), the quarterdeck and the foredeck, at the local deck height;
// - `guns`: the swivel mounts of the built-in battery ( [ { side, x, y, z } ], boat frame, none for the trawler ) with a
//   mesh each (pintle post + barrel on the rail); a muzzle sits MUZZLE_REACH outboard of the mount;
// - setNavLights( true ) lights the stern lantern (the glass material glows).

const HANDLING = { rudderAft: 0.125, lateral: 0.5, kYaw: 0.2 };

export class ShipBoatModel extends FleetBoatModel {

	static KINDS = [ 'ship' ];

	constructor( boatId ) {

		super( boatId );
		const spec = this.spec, lines = this.lines;
		const hd = helmDeckY( spec );

		this.helmEye.set( spec.helm.x, hd + 1.55, spec.helm.z );
		this.dimensions.helmDeckHeight = hd;
		this.dimensions.houseRoofHeight = spec.deckY + 0.02; // where a gull perches (Birds.js)
		this.exitPoints = shipExitPoints( spec, lines );

		// deep keel: the screw sits well under the waterline
		this.propeller.set( 0, - 0.5, lines.zAft + 0.3 );
		// Handling. BoatController's rudder is a fixed 0.12 m2 blade and its lateral stations scale with the hull, so a
		// ship scaled up from the lobster boat would barely turn (a 14 m sloop: 90 deg in 13 s). A slender hull's
		// radius of gyration is ~0.2 L (the fleet formula 0.27 L is for beamy boats), half the lateral area lets the
		// stern swing, and the blade sits a bit aft of the transom for leverage: sloop 90 deg in ~9 s at full helm and
		// speed, brigantine ~13 s (test/feature-ships.mjs bounds them).
		const L = lines.length;
		this.rudder = { z: lines.zAft - HANDLING.rudderAft * L };
		this.stations = this.stations.map( ( [ z, a ] ) => [ z, a * HANDLING.lateral ] );
		this.hydro.inertia.y = spec.mass * ( HANDLING.kYaw * L ) ** 2;
		// rigging and a loaded deck raise the centre of mass above the fleet hulls'
		this.hydro.centerOfMass.y = 0.45;

		this.guns = gunMounts( spec, lines );
		this.gunMeshes = [];
		this._glass = null;
		this._gunParts = this.guns.length ? this._buildGuns() : null;

	}

	_makeLines( spec ) {

		return new SimpleHullLines( { ...spec, ...spec.hull } );

	}

	// the GLB turned into the boat frame (+Z forward), centred on the hull
	_adoptGLB( glb ) {

		if ( this.spec.mirror ) mirrorHull( glb );
		centreOnHull( glb );
		const pivot = new Group();
		pivot.name = 'boat-hull';
		pivot.rotation.y = MODEL_YAW;
		pivot.add( glb.group );
		this._glass = glb.materials.find( ( m ) => m.name === 'boat-glass' ) || null;
		this._applyLantern();
		return pivot;

	}

	_buildColliders() {

		return shipColliders( this.spec, this.lines );

	}

	setNavLights( on ) {

		super.setNavLights( on );
		this._applyLantern();

	}

	_applyLantern() {

		if ( this._glass ) this._glass.emissive = this._navLights ? [ 4, 2.6, 0.9 ] : [ 0, 0, 0 ];

	}

	// swivel guns on the rails: an iron barrel on a timber pintle post, muzzle outboard
	_buildGuns() {

		const iron = new Material( { name: 'ship-gun-iron', color: 0x2b2c2f, roughness: 0.5, metalness: 0.65, underwaterLighting: 'lite' } );
		const wood = new Material( { name: 'ship-gun-wood', color: 0x5b3e27, roughness: 0.85, underwaterLighting: 'lite' } );
		const barrels = { port: new CylinderGeometry( 0.11, 0.17, 1.45, 12 ).rotateZ( - Math.PI / 2 ), starboard: new CylinderGeometry( 0.11, 0.17, 1.45, 12 ).rotateZ( Math.PI / 2 ) }; // thin end = the muzzle, outboard
		const post = new BoxGeometry( 0.2, 1, 0.2 );
		const block = new BoxGeometry( 0.7, 0.14, 0.5 );
		const deckY = this.spec.deckY;
		const group = new Group();
		group.name = 'ship-guns';
		for ( const g of this.guns ) {

			const sg = g.side === 'port' ? 1 : - 1;
			const root = new Group();
			root.position.set( g.x, 0, g.z );
			const b = new Mesh( barrels[ g.side ], iron );
			b.position.set( sg * 0.225, g.y, 0 ); // pintle 0.5 m from the breech, muzzle MUZZLE_REACH out
			const h = g.y - deckY - 0.1;
			const p = new Mesh( post, wood );
			p.scale.y = h;
			p.position.set( 0, deckY + h / 2, 0 );
			const k = new Mesh( block, wood );
			k.position.set( 0, g.y - 0.19, 0 );
			for ( const m of [ b, p, k ] ) { m.castShadow = true; m.receiveShadow = true; root.add( m ); }
			b.name = 'boat-gun-barrel';
			group.add( root );
			this.gunMeshes.push( root );

		}

		this.group.add( group );
		return { geos: [ barrels.port, barrels.starboard, post, block ], mats: [ iron, wood ], group };

	}

	// muzzle position of gun `index` in the boat frame
	muzzle( index ) {

		const g = this.guns[ index ];
		return g ? new Vector3( g.x + ( g.side === 'port' ? 1 : - 1 ) * MUZZLE_REACH, g.y, g.z ) : null;

	}

	dispose() {

		super.dispose();
		if ( this._gunParts ) {

			for ( const g of this._gunParts.geos ) g.dispose && g.dispose();
			for ( const m of this._gunParts.mats ) m.dispose && m.dispose();

		}

	}

}
