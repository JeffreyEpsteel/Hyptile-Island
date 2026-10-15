// Ship and boat collision audit (wave 24B): the failure cases as numbers, in plain node (no GPU), against any copy of the
// game's source (--src=<root>, default this repository) so the same script measures the code before and after a change.
// What is measured is the TRUTH: the hulls as drawn (the ship GLBs through HullShape.shapeFromObject, the player's hull
// from its lines), never the collision code's own boxes.
//
//   node tools/collisions/audit.mjs [--src=<root>] [--json=<file>] [--only=ram,bow,...]
//
// Cases (the player's boats run the real BoatController on flat analytic water; the ships run the real Naval):
//   ram       the lobster boat at full throttle into a stopped sloop's beam
//   skiff     the skiff at full throttle into a frigate's side (the frigate barely moves, the skiff bounces and takes damage)
//   bow       a sloop and a brigantine bow to bow, 6 + 5 m/s
//   frigates  two frigates side by side converging at 1 m/s (they are drawn 9 m wide; the gap that should stay)
//   hitch     the skiff at 9 m/s into the sloop with 0.1 s frames (a frame hitch): does she come out on the far side?
//   sleepers  two far (sleeping) ships crossing at 7 m/s each, integrated in 0.33 s jumps
//   piles     the lobster boat at full throttle into a row of piles 3 m apart (a pier's legs)
//   pier      the player's brigantine at full throttle into a pier (piles and the deck 2.4 m up)
//   quay      the lobster boat at full throttle into a stone quay
//   rock      the skiff at full throttle into a rock (r 2.5 m)
//   beach     the lobster boat at full throttle up a 1:8 beach
//   moored    the lobster boat moored by the pier in a 0.6 m swell for 20 s (jitter)
//   swim      a swimmer pushed into a moored brigantine's side (is the swimmer kept out of the hull?)
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { glbGroup } from './glb-shapes.mjs';
import { shapeFromObject, shapeFromLines, shapeFromDims, polyDistance } from '../../src/world/boat/HullShape.js';

const arg = ( k, d = null ) => {

	const a = process.argv.find( ( x ) => x.startsWith( '--' + k + '=' ) );
	return a ? a.slice( k.length + 3 ) : d;

};

const HERE = resolve( import.meta.dirname, '..', '..' );
const SRC = resolve( arg( 'src', HERE ) );
const im = ( p ) => import( pathToFileURL( join( SRC, p ) ).href );
await im( 'test/headless.mjs' );
const E = await im( 'src/engine/index.js' );
const { Features } = await im( 'src/features/Features.js' );
const { Naval } = await im( 'src/features/naval/Naval.js' );
const { SHIP_CLASSES } = await im( 'src/features/naval/ShipClasses.js' );
const { BoatController } = await im( 'src/player/BoatController.js' );
const { createBoatModel } = await im( 'src/world/boat/BoatFactory.js' );
const { Colliders } = await im( 'src/world/Colliders.js' );
const { BOATS } = await im( 'src/game/Boats.js' );
const only = arg( 'only' ) ? arg( 'only' ).split( ',' ) : null;
const want = ( k ) => ! only || only.includes( k );
const results = {};
const f2 = ( v ) => Number( v ).toFixed( 2 );
const log = ( k, o ) => { results[ k ] = o; console.log( k.padEnd( 9 ), Object.entries( o ).map( ( [ a, b ] ) => `${ a } ${ typeof b === 'number' ? f2( b ) : b }` ).join( ', ' ) ); };

// ---------------------------------------------------------------- the truth: hulls as drawn
const TRUTH = new Map();
function shipTruth( kind ) {

	if ( TRUTH.has( kind ) ) return TRUTH.get( kind );
	const c = SHIP_CLASSES[ kind ], file = c.glb || c.navyGlb;
	const s = file ? shapeFromObject( glbGroup( join( HERE, 'public', file ) ).group, { yLo: - 0.6, yHi: c.sheer } ) : shapeFromDims( c.length, c.beam );
	TRUTH.set( kind, s );
	return s;

}

function boatTruth( id, model ) {

	const spec = BOATS[ id ];
	if ( spec.kind === 'ship' && spec.shipClass ) return shipTruth( spec.shipClass );
	return shapeFromLines( model.lines ) || shapeFromDims( spec.length, spec.beam );

}

// a shape placed in the world: flat x, z arrays
function place( s, x, z, yaw ) {

	const sn = Math.sin( yaw ), cs = Math.cos( yaw ), out = [];
	for ( let i = 0; i < s.n; i ++ ) {

		const lx = s.poly[ 2 * i ], lz = s.poly[ 2 * i + 1 ];
		out.push( [ x + lx * cs + lz * sn, z - lx * sn + lz * cs ] );

	}

	return out;

}

// SAT depth of two placed convex polygons (> 0: overlapping by that much; < 0: the gap)
function overlap( P, Q ) {

	let best = Infinity;
	for ( const [ A, B ] of [ [ P, Q ], [ Q, P ] ] ) for ( let i = 0; i < A.length; i ++ ) {

		const a = A[ i ], b = A[ ( i + 1 ) % A.length ];
		let nx = b[ 1 ] - a[ 1 ], nz = - ( b[ 0 ] - a[ 0 ] );
		const l = Math.hypot( nx, nz ) || 1;
		nx /= l; nz /= l;
		let a0 = Infinity, a1 = - Infinity, b0 = Infinity, b1 = - Infinity;
		for ( const p of A ) { const d = p[ 0 ] * nx + p[ 1 ] * nz; a0 = Math.min( a0, d ); a1 = Math.max( a1, d ); }
		for ( const p of B ) { const d = p[ 0 ] * nx + p[ 1 ] * nz; b0 = Math.min( b0, d ); b1 = Math.max( b1, d ); }
		best = Math.min( best, Math.min( a1 - b0, b1 - a0 ) );

	}

	return best;

}

const yawOfQ = ( q ) => Math.atan2( 2 * ( q.x * q.z + q.w * q.y ), 1 - 2 * ( q.x * q.x + q.y * q.y ) );

// ---------------------------------------------------------------- water, terrain, the rig
function makeQuery( swell = null ) {

	return {
		n: 0, points: new Float32Array( 8192 ), cpu: new Float32Array( 8192 ), resultInputs: new Float32Array( 8192 ), cpuValid: false, version: 0, resultTime: 0, latency: 2 / 60, time: 0,
		allocate( name, n ) { const s = this.n; this.n += n; return s; },
		setPoint( i, x, z ) { this.points[ i * 4 ] = x; this.points[ i * 4 + 1 ] = z; },
		tick() {

			for ( let i = 0; i < this.n; i ++ ) {

				const x = this.points[ i * 4 ], z = this.points[ i * 4 + 1 ];
				this.cpu[ i * 4 ] = swell ? swell( x, z, this.time ) : 0;
				this.cpu[ i * 4 + 1 ] = 0; this.cpu[ i * 4 + 2 ] = 0;
				this.resultInputs[ i * 4 ] = x; this.resultInputs[ i * 4 + 1 ] = z;

			}

			this.cpuValid = true; this.version ++; this.resultTime = this.time;

		},
	};

}

const DEEP = { heightAt: () => - 30 };

// a boat on the water with its controller; `naval` adds the Naval feature with this boat as the player's
function rig( id, { x = 0, z = 0, yaw = 0, terrain = DEEP, colliders = null, swell = null, naval = false } = {} ) {

	const query = makeQuery( swell );
	const model = createBoatModel( id );
	if ( model.ready ) model.ready.catch( () => {} );
	const col = colliders || new Colliders();
	const boat = new BoatController( { model, query, terrain, colliders: col } );
	boat.position.set( x, 0, z );
	boat.quaternion.setFromAxisAngle( new E.Vector3( 0, 1, 0 ), yaw );
	boat.mooring.anchor.set( x, 0, z );
	boat.mooring.heading = yaw;
	boat.moored = false;
	boat.driven = true;
	boat.apply();
	const r = { id, model, boat, query, colliders: col, truth: boatTruth( id, model ), dt: 1 / 60, time: 0, features: null, naval: null };
	if ( naval ) {

		const state = { boat: id, money: 0, earn() {}, spend() { return true; } };
		const app = {
			mode: 'campaign', settings: { timeOfDay: 12 }, terrainData: null, query: null, spray: null, scene: null, audio: null,
			boatCtl: boat, boat: model, colliders: col,
			camera: { position: new E.Vector3( x, 4, z - 10 ), quaternion: new E.Quaternion(), fov: 60, aspect: 16 / 9 },
			player: { mode: 'boat', position: new E.Vector3( x, 1, z ) },
			input: { hit: () => false, keys: new Set(), rightDown: false, mouseDown: false, enabled: true },
			game: { state, toast() {} }, cameraFeel: { kick() {} },
		};
		r.app = app;
		r.features = new Features( app );
		r.events = [];
		for ( const n of [ 'hullsCollided', 'playerBoatDamaged', 'hullStruck' ] ) r.features.on( n, ( e ) => r.events.push( [ n, e ] ) );
		r.naval = r.features.add( 'naval', { install: ( a, f ) => new Naval( a, f, { seed: 9, hud: false, models: false, settings: { autoSpawn: false } } ) } );

	}

	r.step = ( throttle = 1, steer = 0, dt = r.dt ) => {

		query.time += dt;
		r.time += dt;
		boat.setInput( throttle, steer, dt );
		boat.queueQueries();
		boat.update( dt );
		query.tick();
		if ( r.features ) r.features.update( dt );

	};

	// settle on the water first (the read-backs arrive)
	for ( let i = 0; i < 30; i ++ ) { query.time += 1 / 60; boat.queueQueries(); boat.update( 1 / 60 ); query.tick(); }
	boat.position.set( x, boat.position.y, z );
	boat.velocity.set( 0, 0, 0 );
	boat.angular.set( 0, 0, 0 );
	return r;

}

// a loaded visual as the game's ModelSet makes it (the GLB in a pivot turned by MODEL_YAW): what the game's code reads
function visual( kind ) {

	const c = SHIP_CLASSES[ kind ], file = c.glb || c.navyGlb;
	if ( ! file ) return null;
	return { kind, loaded: true, group: glbGroup( join( HERE, 'public', file ) ).group, apply() {}, setNear() {}, setVisible() {}, dispose() {}, steerWheel() {} };

}

function ship( r, kind, x, z, yaw, speed = 0 ) {

	const s = r.naval.spawn( kind, { x, z, yaw } );
	s.visual = visual( kind );
	s.state = 'adrift';
	s.speed = speed;
	s.wantSpeed = speed / s.cls.speed;
	return s;

}

const boatPoly = ( r ) => place( r.truth, r.boat.position.x, r.boat.position.z, yawOfQ( r.boat.quaternion ) );
const shipPoly = ( s ) => place( shipTruth( s.kind ), s.x, s.z, s.yaw );
const hv = ( b ) => Math.hypot( b.velocity.x, b.velocity.z );

// ---------------------------------------------------------------- hull against hull
if ( want( 'ram' ) ) {

	const r = rig( 'lobster', { z: - 40, naval: true } );
	const s = ship( r, 'sloop', 0, 0, Math.PI / 2 );
	let pen = - Infinity, vIn = 0, vOut = null, first = null, t = 0;
	const hp0 = r.naval.playerHull.hp, shp0 = s.hp;
	for ( ; t < 20; t += r.dt ) {

		const v = r.boat.velocity.z;
		r.step( 1 );
		const o = overlap( boatPoly( r ), shipPoly( s ) );
		pen = Math.max( pen, o );
		if ( ! first && r.events.some( ( e ) => e[ 0 ] === 'hullsCollided' ) ) { first = { t, gap: - o }; vIn = v; }
		if ( first && vOut === null && t > first.t + 0.5 ) vOut = r.boat.velocity.z;

	}

	log( 'ram', { 'contact at (s)': first ? first.t : - 1, 'closing (m/s)': vIn, 'true gap at the blow (m)': first ? first.gap : NaN, 'max true overlap (m)': pen, 'rebound (m/s)': vOut ?? 0, 'boat hp lost': hp0 - r.naval.playerHull.hp, 'sloop hp lost': shp0 - s.hp, 'sloop drift (m/s)': Math.hypot( s.push.x, s.push.z ) } );

}

if ( want( 'skiff' ) ) {

	const r = rig( 'skiff', { z: - 25, naval: true } );
	const s = ship( r, 'frigate', 0, 0, Math.PI / 2 );
	let pen = - Infinity, vIn = 0, vOut = null, first = null;
	const hp0 = r.naval.playerHull.hp, shp0 = s.hp;
	for ( let t = 0; t < 20; t += r.dt ) {

		const v = r.boat.velocity.z;
		r.step( 1 );
		pen = Math.max( pen, overlap( boatPoly( r ), shipPoly( s ) ) );
		if ( ! first && r.events.some( ( e ) => e[ 0 ] === 'hullsCollided' ) ) { first = { t, gap: - overlap( boatPoly( r ), shipPoly( s ) ) }; vIn = v; }
		if ( first && vOut === null && t > first.t + 0.4 ) vOut = r.boat.velocity.z;

	}

	log( 'skiff', { 'closing (m/s)': vIn, 'true gap at the blow (m)': first ? first.gap : NaN, 'max true overlap (m)': pen, 'skiff rebound (m/s)': vOut ?? 0, 'skiff hp lost %': ( hp0 - r.naval.playerHull.hp ) / r.naval.playerHull.max * 100, 'frigate hp lost %': ( shp0 - s.hp ) / s.maxHp * 100, 'frigate dv (m/s)': Math.hypot( s.push.x, s.push.z ) } );

}

if ( want( 'bow' ) ) {

	const r = rig( 'skiff', { x: 200, z: 200, naval: true } );
	r.boat.enabled = false;
	r.boat.position.y = - 500; // (parked out of the way)
	const off = 0.4, a = ship( r, 'sloop', 0, - 20, 0, 6 ), b = ship( r, 'brigantine', off, 20, Math.PI, 5 );
	let pen = - Infinity, first = null, crossed = false;
	for ( let t = 0; t < 8; t += r.dt ) {

		r.features.update( r.dt );
		const o = overlap( shipPoly( a ), shipPoly( b ) );
		pen = Math.max( pen, o );
		if ( ! first && r.events.some( ( e ) => e[ 0 ] === 'hullsCollided' ) ) first = { t, gap: - o };
		if ( first && ! first.after && t > first.t + 0.3 ) first.after = [ a.speed, b.speed ];
		if ( a.z > b.z && Math.abs( a.x - b.x ) < 4 ) crossed = true;

	}

	log( 'bow', { 'true gap at the blow (m)': first ? first.gap : NaN, 'max true overlap (m)': pen, 'passed through': crossed ? 'YES' : 'no', 'sloop way 0.3 s after (m/s)': first && first.after ? first.after[ 0 ] : NaN, 'brig way 0.3 s after (m/s)': first && first.after ? first.after[ 1 ] : NaN } );

}

if ( want( 'frigates' ) ) {

	const r = rig( 'skiff', { x: 200, z: 200, naval: true } );
	r.boat.enabled = false;
	r.boat.position.y = - 500;
	const a = ship( r, 'frigate', - 6, 0, 0, 0 ), b = ship( r, 'frigate', 6, 0, 0, 0 );
	a.push.x = 0.5; b.push.x = - 0.5;
	let pen = - Infinity, flips = 0, last = 0;
	for ( let t = 0; t < 12; t += r.dt ) {

		a.push.x = Math.max( a.push.x, 0.5 ); b.push.x = Math.min( b.push.x, - 0.5 ); // pressed together
		r.features.update( r.dt );
		const o = overlap( shipPoly( a ), shipPoly( b ) );
		pen = Math.max( pen, o );
		const sgn = Math.sign( b.x - a.x - 9 );
		if ( last && sgn && sgn !== last ) flips ++;
		last = sgn || last;

	}

	log( 'frigates', { 'max true overlap (m)': pen, 'centres apart (m)': b.x - a.x, 'drawn beam (m)': shipTruth( 'frigate' ).hx * 2 } );

}

if ( want( 'hitch' ) ) {

	const r = rig( 'skiff', { z: - 12, naval: true } );
	const s = ship( r, 'sloop', 0, 0, Math.PI / 2 );
	r.boat.velocity.set( 0, 0, 9 );
	let pen = - Infinity;
	for ( let t = 0; t < 2.5; t += 0.1 ) {

		r.step( 1, 0, 0.1 );
		pen = Math.max( pen, overlap( boatPoly( r ), shipPoly( s ) ) );

	}

	log( 'hitch', { 'max true overlap (m)': pen, 'skiff ends at z (m)': r.boat.position.z, 'came out the far side': r.boat.position.z > 0 ? 'YES' : 'no' } );

}

if ( want( 'sleepers' ) ) {

	const r = rig( 'skiff', { x: 200, z: 200, naval: true } );
	r.boat.enabled = false;
	r.boat.position.y = - 500;
	const a = ship( r, 'sloop', - 14, 0, Math.PI / 2, 7 ), b = ship( r, 'trawler', 0, - 10, 0, 7 );
	// far from the camera, over the ship cap: the naval feature puts them to sleep (integrated in ~0.25 s jumps)
	r.app.camera.position.set( 5000, 4, 5000 );
	if ( r.naval.setShipCap ) r.naval.setShipCap( 1e-9 );
	a.state = 'patrol'; b.state = 'sail';
	let slept = false;
	let pen = - Infinity, hits = 0;
	for ( let t = 0; t < 6; t += r.dt ) {

		a.want = Math.PI / 2; b.want = 0; a.wantSpeed = b.wantSpeed = 1;
		r.features.update( r.dt );
		slept = slept || !! ( a._sleep || b._sleep );
		pen = Math.max( pen, overlap( shipPoly( a ), shipPoly( b ) ) );

	}

	hits = r.events.filter( ( e ) => e[ 0 ] === 'hullsCollided' ).length;
	log( 'sleepers', { 'max true overlap (m)': pen, 'blows': hits, 'slept': slept ? 'yes' : 'no' } );

}

// ---------------------------------------------------------------- hull against the world
function pierColliders( { x0 = - 30, x1 = 30, z = 0, deck = 2.4, spacing = 3 } = {} ) {

	const c = new Colliders();
	for ( let x = x0; x <= x1; x += spacing ) for ( const dz of [ 0, 4 ] ) c.addCylinder( x, z + dz, 0.2, - 5, deck - 0.1, { tag: 'pile' } );
	c.addBox( new E.Vector3( ( x0 + x1 ) / 2, deck - 0.04, z + 2 ), new E.Vector3( ( x1 - x0 ) / 2, 0.04, 2.3 ), 0, { walkable: true, solid: true, tag: 'pierDeck' } );
	return c;

}

// how deep the hull is in the world's solids (the piles' and rocks' circles, the boxes) at the water plane
function worldPen( r ) {

	const s = r.truth, b = r.boat, yaw = yawOfQ( b.quaternion ), sn = Math.sin( yaw ), cs = Math.cos( yaw );
	const toLocal = ( x, z ) => { const dx = x - b.position.x, dz = z - b.position.z; return [ dx * cs - dz * sn, dx * sn + dz * cs ]; };
	let pen = 0, tag = '';
	const pd = {};
	for ( const c of r.colliders.cylinders ) {

		const [ lx, lz ] = toLocal( c.x, c.z );
		const d = c.radius - polyDistance( s, lx, lz, pd ).d;
		if ( d > pen ) { pen = d; tag = c.tag; }

	}

	for ( const bx of r.colliders.boxes ) {

		if ( ! bx.solid || bx.top < - 0.5 || bx.bottom > ( r.top ?? 1.5 ) ) continue;
		// the hull's vertices inside the box (box frame)
		for ( const [ wx, wz ] of boatPoly( r ) ) {

			const dx = wx - bx.center.x, dz = wz - bx.center.z;
			const lx = dx * bx.cos - dz * bx.sin, lz = dx * bx.sin + dz * bx.cos;
			const d = Math.min( bx.half.x - Math.abs( lx ), bx.half.z - Math.abs( lz ) );
			if ( d > pen ) { pen = d; tag = bx.tag; }

		}

	}

	return { pen, tag };

}

function drive( r, seconds, throttle = 1 ) {

	let pen = 0, tag = '', vmax = 0, vAt = 0, minV = Infinity;
	const z0 = r.boat.position.z;
	let zMax = - Infinity;
	for ( let t = 0; t < seconds; t += r.dt ) {

		r.step( throttle );
		const w = worldPen( r );
		if ( w.pen > pen ) { pen = w.pen; tag = w.tag; }
		const v = hv( r.boat );
		if ( v > vmax ) vmax = v;
		if ( pen > 0 && ! vAt ) vAt = vmax;
		zMax = Math.max( zMax, r.boat.position.z );
		minV = Math.min( minV, r.boat.velocity.z );

	}

	return { pen, tag, vmax, zMax: zMax - z0, minVz: minV };

}

if ( want( 'piles' ) ) {

	const col = pierColliders( { deck: 2.4 } );
	const r = rig( 'lobster', { z: - 60, colliders: col } );
	r.top = 1.75; // (her sheer: the bow may run under the deck, 2.3 m up, but not through a pile)
	const d = drive( r, 14 );
	const piles = Math.max( 0, ...col.cylinders.map( ( c ) => { const b = r.boat, yaw = yawOfQ( b.quaternion ), dx = c.x - b.position.x, dz = c.z - b.position.z; return c.radius - polyDistance( r.truth, dx * Math.cos( yaw ) - dz * Math.sin( yaw ), dx * Math.sin( yaw ) + dz * Math.cos( yaw ) ).d; } ) );
	log( 'piles', { 'pile overlap at the end (m)': piles, 'top speed (m/s)': d.vmax, 'max overlap with a pile (m)': d.pen, 'into': d.tag, 'went through the pier': r.boat.position.z + r.truth.zAft > 0.4 ? 'YES' : 'no', 'ends at z (m)': r.boat.position.z, 'rebound (m/s)': d.minVz } );

}

if ( want( 'pier' ) ) {

	const col = pierColliders( { deck: 2.4 } );
	const r = rig( 'brigantine', { z: - 70, colliders: col } );
	r.top = 3.7; // (her bulwarks)
	const d = drive( r, 30 );
	log( 'pier', { 'top speed (m/s)': d.vmax, 'max overlap (m)': d.pen, 'into': d.tag, 'bow past the pier face': r.boat.position.z + r.truth.zBow > 0.4 ? 'YES' : 'no', 'ends at z (m)': r.boat.position.z } );

}

if ( want( 'quay' ) ) {

	const col = new Colliders();
	col.addBox( new E.Vector3( 0, - 0.5, 5 ), new E.Vector3( 40, 3, 5 ), 0, { walkable: true, solid: true, tag: 'quay' } );
	const r = rig( 'lobster', { z: - 60, colliders: col } );
	const d = drive( r, 14 );
	log( 'quay', { 'top speed (m/s)': d.vmax, 'max overlap (m)': d.pen, 'rebound (m/s)': d.minVz, 'ends at z (m)': r.boat.position.z } );

}

if ( want( 'rock' ) ) {

	const col = new Colliders();
	col.addCylinder( 0, 0, 2.5, - 8, 3, { tag: 'rock' } );
	const r = rig( 'skiff', { z: - 40, colliders: col } );
	const d = drive( r, 14 );
	log( 'rock', { 'top speed (m/s)': d.vmax, 'max overlap (m)': d.pen, 'rebound (m/s)': d.minVz, 'ends at z (m)': r.boat.position.z } );

}

if ( want( 'beach' ) ) {

	// the sea bed rises 1 m in 8 from 4 m deep at z = 0 to dry land at z = 32
	const beach = { heightAt: ( x, z ) => Math.min( 3, - 4 + Math.max( 0, z ) / 8 ) };
	// full throttle until the keel touches, then the helmsman lets go of the throttle (and once more holding it)
	for ( const hold of [ false, true ] ) {

		const r = rig( 'lobster', { z: - 60, terrain: beach } );
		let vmax = 0, tTouch = - 1, zTouch = 0, vTouch = 0, tStop = - 1, zMax = - Infinity, keelUp = - Infinity, hits = 0;
		const ground = () => { const p = r.boat.position; return beach.heightAt( p.x, p.z + r.truth.zBow * 0.7 ) > p.y - 0.8; };
		for ( let t = 0; t < 25; t += r.dt ) {

			r.step( tTouch < 0 || hold ? 1 : 0 );
			vmax = Math.max( vmax, hv( r.boat ) );
			zMax = Math.max( zMax, r.boat.position.z );
			keelUp = Math.max( keelUp, r.boat.position.y );
			if ( tTouch < 0 && ground() ) { tTouch = t; zTouch = r.boat.position.z; vTouch = hv( r.boat ); }
			if ( tTouch >= 0 && tStop < 0 && hv( r.boat ) < 0.3 ) tStop = t - tTouch;
			if ( r.boat.impacts ) hits += r.boat.impacts.filter( ( i ) => i.what === 'ground' ).length, r.boat.impacts.length = 0;

		}

		log( hold ? 'beachHold' : 'beach', { 'speed at the touch (m/s)': vTouch, 'slid on (m)': zMax - zTouch, 'bow ran to z (m)': zMax + r.truth.zBow, 'ground at the bow (m)': beach.heightAt( 0, zMax + r.truth.zBow ), 'hull rose (m)': keelUp, 'stopped after (s)': tStop, 'grounding blows': hits } );

	}

}

if ( want( 'moored' ) ) {

	const col = pierColliders( { deck: 2.4, z: 4 } );
	const swell = ( x, z, t ) => 0.3 * Math.sin( 0.9 * t + 0.05 * x ) + 0.15 * Math.sin( 1.7 * t + 0.11 * z );
	const r = rig( 'lobster', { x: 0, z: 0, colliders: col, swell } );
	r.boat.moored = true;
	r.boat.driven = false;
	r.boat.mooring.anchor.set( 0, 0, 0.6 ); // (berthed a little tight to the piles: the fenders should take it)
	const xs = [], ys = [], hs = [];
	let jerk = 0, lastV = null;
	for ( let t = 0; t < 20; t += r.dt ) {

		r.step( 0 );
		if ( t < 5 ) continue;
		xs.push( r.boat.position.x ); ys.push( r.boat.position.z ); hs.push( yawOfQ( r.boat.quaternion ) );
		const v = r.boat.velocity.z;
		if ( arg( 'trace' ) && lastV !== null && Math.abs( v - lastV ) / r.dt > 5 ) console.log( `  t ${ f2( t ) } vz ${ f2( lastV ) } -> ${ f2( v ) } w ${ [ r.boat.angular.x, r.boat.angular.y, r.boat.angular.z ].map( f2 ) } z ${ f2( r.boat.position.z ) } y ${ f2( r.boat.position.y ) }` );
		if ( lastV !== null ) jerk = Math.max( jerk, Math.abs( v - lastV ) / r.dt );
		lastV = v;

	}

	const sd = ( a ) => { const m = a.reduce( ( p, c ) => p + c, 0 ) / a.length; return Math.sqrt( a.reduce( ( p, c ) => p + ( c - m ) ** 2, 0 ) / a.length ); };
	log( 'moored', { 'surge sd (cm)': sd( ys ) * 100, 'sway sd (cm)': sd( xs ) * 100, 'yaw sd (deg)': sd( hs ) * 180 / Math.PI, 'peak accel (m/s2)': jerk, 'overlap with the piles (m)': worldPen( r ).pen } );

}

if ( want( 'swim' ) ) {

	const r = rig( 'skiff', { x: 300, z: 300, naval: true } );
	r.boat.enabled = false;
	r.boat.position.y = - 500;
	const s = ship( r, 'brigantine', 0, 0, 0, 0 );
	s.state = 'moored';
	// a swimmer at the waterline swimming into her side at 1.2 m/s
	const p = r.app.player;
	p.mode = 'swim';
	p.position.set( - 6, - 0.2, 0 );
	p.velocity = new E.Vector3();
	let deepest = - Infinity;
	const shape = shipTruth( 'brigantine' );
	for ( let t = 0; t < 6; t += r.dt ) {

		p.position.x += 1.2 * r.dt;
		r.features.update( r.dt );
		deepest = Math.max( deepest, - polyDistance( shape, p.position.x - s.x, p.position.z - s.z ).d );

	}

	log( 'swim', { 'swimmer inside the hull by (m)': deepest, 'ends at x (m)': p.position.x, 'hull side at (m)': - shape.hx } );

}

const file = arg( 'json' );
if ( file ) writeFileSync( file, JSON.stringify( { src: SRC, results }, null, 1 ) );
process.exit( 0 );
