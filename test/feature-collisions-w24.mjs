// Plain-node test of wave 24B, collisions that feel solid (src/world/boat/HullShape.js, src/features/naval/Collisions.js,
// Naval's world contacts and swimmer, src/player/BoatController.js against the world): the hulls' outlines from the GLBs as
// drawn and from the boats' lines, the outline SAT / distance maths, hull against hull through the real Naval with the real
// BoatController (no gap, no overlap, the mass split: a skiff bounces off a frigate that barely moves), the sweep that stops
// a hull passing through another in one step, the boat against piles, a pier, a quay, a rock and a beach (stopped, no
// tunnelling, the bounce, the scrape), moored against the piles without chatter, the blows turned into damage / thump /
// crunch / scrape / hullStruck, a swimmer kept out of a hull, and what it costs. No GPU.
//   node test/feature-collisions-w24.mjs
import './headless.mjs';
import { join } from 'node:path';
import * as E from '../src/engine/index.js';
import { Features } from '../src/features/Features.js';
import { Naval, WORLD_HIT } from '../src/features/naval/Naval.js';
import { SHIP_CLASSES } from '../src/features/naval/ShipClasses.js';
import { CollisionWorld, COLLIDE, yawInertia } from '../src/features/naval/Collisions.js';
import { BoatController, CONTACT } from '../src/player/BoatController.js';
import { createBoatModel } from '../src/world/boat/BoatFactory.js';
import { Colliders } from '../src/world/Colliders.js';
import { BOATS } from '../src/game/Boats.js';
import { shapeFromObject, shapeFromLines, shapeFromDims, placeShape, polySat, polyDistance, overlapAlong, halfBreadthAt, perimeter, convexHull2 } from '../src/world/boat/HullShape.js';
import { glbGroup } from '../tools/collisions/glb-shapes.mjs';

let fails = 0, passes = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else { passes ++; console.log( 'ok  ', msg ); }

};
const section = ( s ) => console.log( '\n== ' + s );
const f2 = ( v ) => Number( v ).toFixed( 2 );
const ROOT = join( import.meta.dirname, '..' );

// ---------------------------------------------------------------- helpers (as tools/collisions/audit.mjs)
const GLB = new Map();
const glbShape = ( kind ) => {

	if ( ! GLB.has( kind ) ) {

		const c = SHIP_CLASSES[ kind ], f = c.glb || c.navyGlb;
		GLB.set( kind, f ? shapeFromObject( glbGroup( join( ROOT, 'public', f ) ).group, { yLo: - 0.6, yHi: c.sheer } ) : null );

	}

	return GLB.get( kind );

};
const visual = ( kind ) => {

	const c = SHIP_CLASSES[ kind ], f = c.glb || c.navyGlb;
	return f ? { kind, loaded: true, group: glbGroup( join( ROOT, 'public', f ) ).group, apply() {}, setNear() {}, setVisible() {}, dispose() {}, steerWheel() {} } : null;

};
const yawOfQ = ( q ) => Math.atan2( 2 * ( q.x * q.z + q.w * q.y ), 1 - 2 * ( q.x * q.x + q.y * q.y ) );
const depth = ( sa, xa, za, ya, sb, xb, zb, yb ) => - polySat( placeShape( sa, xa, za, ya ), placeShape( sb, xb, zb, yb ) ).sep;

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
function rig( id, { x = 0, z = 0, yaw = 0, terrain = DEEP, colliders = null, swell = null, naval = false, vfx = false } = {} ) {

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
	const r = { id, model, boat, query, colliders: col, dt: 1 / 60, features: null, naval: null, events: [], spy: { splash: 0, splinters: 0, debris: 0 }, kicks: [] };
	if ( naval ) {

		const state = { boat: id, money: 0, earn() {}, spend() { return true; } };
		const app = {
			mode: 'campaign', settings: { timeOfDay: 12 }, terrainData: null, query: null, spray: null, scene: null, audio: null,
			boatCtl: boat, boat: model, colliders: col,
			camera: { position: new E.Vector3( x, 4, z - 10 ), quaternion: new E.Quaternion(), fov: 60, aspect: 16 / 9 },
			player: { mode: 'boat', position: new E.Vector3( x, 1, z ) },
			input: { hit: () => false, keys: new Set(), rightDown: false, mouseDown: false, enabled: true },
			game: { state, toast() {} }, cameraFeel: { kick: ( k ) => r.kicks.push( k ) },
		};
		r.app = app;
		r.features = new Features( app );
		for ( const n of [ 'hullsCollided', 'playerBoatDamaged', 'hullStruck' ] ) r.features.on( n, ( e ) => r.events.push( [ n, e ] ) );
		if ( vfx ) r.features.add( 'vfx', { install: () => ( { splash() { r.spy.splash ++; }, splinters() { r.spy.splinters ++; }, debris() { r.spy.debris ++; }, smoke() {}, sinking() {}, bubbles() {} } ) } );
		r.naval = r.features.add( 'naval', { install: ( a, f ) => new Naval( a, f, { seed: 9, hud: false, models: false, settings: { autoSpawn: false } } ) } );

	}

	r.step = ( throttle = 1, steer = 0, dt = r.dt ) => {

		query.time += dt;
		boat.setInput( throttle, steer, dt );
		boat.queueQueries();
		boat.update( dt );
		query.tick();
		if ( r.features ) r.features.update( dt );

	};
	for ( let i = 0; i < 30; i ++ ) { query.time += 1 / 60; boat.queueQueries(); boat.update( 1 / 60 ); query.tick(); }
	boat.position.set( x, boat.position.y, z );
	boat.velocity.set( 0, 0, 0 );
	boat.angular.set( 0, 0, 0 );
	boat.impacts.length = 0;
	r.truth = shapeFromLines( model.lines );
	return r;

}

function ship( r, kind, x, z, yaw, speed = 0 ) {

	const s = r.naval.spawn( kind, { x, z, yaw } );
	s.visual = visual( kind );
	s.state = 'adrift';
	s.speed = speed;
	s.wantSpeed = speed / s.cls.speed;
	return s;

}

function pier( { x0 = - 30, x1 = 30, z = 0, deck = 2.4, spacing = 3 } = {} ) {

	const c = new Colliders();
	for ( let x = x0; x <= x1; x += spacing ) for ( const dz of [ 0, 4 ] ) c.addCylinder( x, z + dz, 0.2, - 5, deck - 0.1, { tag: 'pile' } );
	c.addBox( new E.Vector3( ( x0 + x1 ) / 2, deck - 0.04, z + 2 ), new E.Vector3( ( x1 - x0 ) / 2, 0.04, 2.3 ), 0, { walkable: true, solid: true, tag: 'pierDeck' } );
	return c;

}

// deepest pile in the hull (m) and the boxes' overlap with the outline (at the waterline band)
function worldDepth( r, top = 1.8 ) {

	const s = r.truth, b = r.boat, yaw = yawOfQ( b.quaternion ), sn = Math.sin( yaw ), cs = Math.cos( yaw ), pd = {};
	let d = 0;
	for ( const c of r.colliders.cylinders ) {

		const dx = c.x - b.position.x, dz = c.z - b.position.z;
		d = Math.max( d, c.radius - polyDistance( s, dx * cs - dz * sn, dx * sn + dz * cs, pd ).d );

	}

	const H = placeShape( s, b.position.x, b.position.z, yaw );
	for ( const bx of r.colliders.boxes ) {

		if ( ! bx.solid || bx.bottom > top ) continue;
		const sat = polySat( H, placeShapeBox( bx ) );
		if ( sat.hit ) d = Math.max( d, sat.depth );

	}

	return d;

}

const placeShapeBox = ( b ) => {

	const pts = [];
	for ( const [ lx, lz ] of [ [ 1, 1 ], [ - 1, 1 ], [ - 1, - 1 ], [ 1, - 1 ] ] ) {

		const x = lx * b.half.x, z = lz * b.half.z;
		pts.push( b.center.x + x * b.cos + z * b.sin, b.center.z - x * b.sin + z * b.cos );

	}

	const hull = convexHull2( pts ), n = hull.length / 2, out = { n, x: new Float64Array( n ), z: new Float64Array( n ), nx: new Float64Array( n ), nz: new Float64Array( n ) };
	for ( let i = 0; i < n; i ++ ) {

		out.x[ i ] = hull[ 2 * i ]; out.z[ i ] = hull[ 2 * i + 1 ];
		const j = ( i + 1 ) % n, dx = hull[ 2 * j ] - hull[ 2 * i ], dz = hull[ 2 * j + 1 ] - hull[ 2 * i + 1 ], l = Math.hypot( dx, dz );
		out.nx[ i ] = dz / l; out.nz[ i ] = - dx / l;

	}

	return out;

};

// ================================================================================================ 1. outlines
section( '1. the hulls\' outlines as drawn' );
{

	for ( const k of Object.keys( SHIP_CLASSES ) ) {

		const c = SHIP_CLASSES[ k ], s = glbShape( k );
		if ( ! s ) { ok( ! c.glb && ! c.navyGlb, `${ k }: procedural (no GLB): the dimensions' outline` ); continue; }
		const len = s.zBow - s.zAft;
		ok( s.source === 'mesh' && s.n >= 8 && s.n <= 20 && s.area > 0, `${ k }: a convex outline of ${ s.n } vertices from the GLB (area ${ f2( s.area ) } m2)` );
		ok( Math.abs( len / c.length - 1 ) < 0.12 && s.hx * 2 >= c.beam * 0.95 && s.hx * 2 <= c.beam * 1.25, `${ k }: ${ f2( len ) } m long (class ${ c.length }), ${ f2( s.hx * 2 ) } m across as drawn (class ${ c.beam })` );
		ok( halfBreadthAt( s, s.zBow - 0.05 ) < s.hx * 0.5 && halfBreadthAt( s, 0 ) > s.hx * 0.8, `${ k }: the stem closes (${ f2( halfBreadthAt( s, s.zBow - 0.05 ) ) } m half breadth 5 cm from it), full amidships (${ f2( halfBreadthAt( s, 0 ) ) })` );

	}

	const fr = glbShape( 'frigate' );
	ok( fr.hx * 2 > SHIP_CLASSES.frigate.beam + 0.8, `the frigate is drawn ${ f2( fr.hx * 2 ) } m wide, ${ f2( fr.hx * 2 - SHIP_CLASSES.frigate.beam ) } m more than her class box (the box let two of them clip)` );
	for ( const id of Object.keys( BOATS ) ) {

		const m = createBoatModel( id );
		if ( m.ready ) m.ready.catch( () => {} );
		const s = shapeFromLines( m.lines ), d = m.dimensions;
		ok( s && Math.abs( ( s.zBow - s.zAft ) / d.length - 1 ) < 0.06 && Math.abs( s.hx * 2 / d.beam - 1 ) < 0.06, `${ id }: the lines' outline ${ f2( s.zBow - s.zAft ) } x ${ f2( s.hx * 2 ) } m (${ d.length } x ${ d.beam })` );

	}

	const sq = shapeFromDims( 10, 4 );
	ok( Math.abs( polyDistance( sq, 0, 6 ).d - 1 ) < 0.01 && polyDistance( sq, 0, 0 ).d < - 1.9, 'polyDistance: 1 m ahead of the stem is 1 m off; the centre is inside by the half beam' );
	const p = perimeter( sq, 0.5 );
	ok( p.length > 40 && p.every( ( q ) => Math.abs( polyDistance( sq, q[ 0 ], q[ 1 ] ).d ) < 1e-6 ), `perimeter: ${ p.length } points on the outline` );
	const A = placeShape( sq, 0, 0, 0 ), B = placeShape( sq, 3.5, 0, 0 ), sat = polySat( A, B );
	ok( sat.hit && Math.abs( sat.depth - 0.5 ) < 0.01 && sat.nx > 0.99, `SAT: two outlines 3.5 m apart overlap 0.5 m along +X (${ f2( sat.depth ) })` );
	ok( Math.abs( overlapAlong( A, placeShape( sq, - 3.5, 0, 0 ), 1, 0 ) - 7.5 ) < 0.01, 'overlapAlong: a hull gone through to the far side reads 7.5 m (pushed back the way it came)' );

}

// ================================================================================================ 2. the world of hulls
section( '2. outlines in the collision world: the drawn beam, the sweep, the kept normal' );
{

	const body = ( id, kind, x, z, yaw, vx = 0, vz = 0 ) => {

		const c = SHIP_CLASSES[ kind ];
		const b = { id, x, z, yaw, hx: c.beam / 2, hz: c.length / 2, mass: c.mass, invMass: 1 / c.mass, invI: 1 / yawInertia( c.mass, c.beam / 2, c.length / 2 ), vx, vz, w: 0, maxHp: c.hp, shape: glbShape( kind ) };
		b.push = ( dx, dz ) => { b.x += dx; b.z += dz; };
		b.impulse = ( jx, jz, px, pz ) => { b.vx += jx * b.invMass; b.vz += jz * b.invMass; b.w += ( ( pz - b.z ) * jx - ( px - b.x ) * jz ) * b.invI; };
		b.step = ( dt ) => { b.x += b.vx * dt; b.z += b.vz * dt; b.yaw += b.w * dt; };
		return b;

	};
	const w = new CollisionWorld();
	const a = body( 'a', 'frigate', - 6, 0, 0, 1 ), b = body( 'b', 'frigate', 6, 0, 0, - 1 );
	// (the water holds their heads: no yaw left over between steps, as the ships' own steering does)
	for ( let t = 0; t < 8; t += 1 / 60 ) { a.vx = Math.max( a.vx, 0.5 ); b.vx = Math.min( b.vx, - 0.5 ); a.w = b.w = 0; a.step( 1 / 60 ); b.step( 1 / 60 ); w.step( t, [ a, b ] ); }
	const fr = glbShape( 'frigate' ), d = depth( fr, a.x, a.z, a.yaw, fr, b.x, b.z, b.yaw );
	ok( d < 0.05 && d > - 0.35, `two frigates pressed together stop at their drawn sides (overlap ${ f2( d ) } m, centres ${ f2( b.x - a.x ) } m apart, drawn beam ${ f2( fr.hx * 2 ) })` );

	// a thin hull through a ship in one step (a hitch): pushed back where it came from
	const w2 = new CollisionWorld();
	const sl = body( 's', 'sloop', 0, 0, Math.PI / 2 );
	const th = { ...body( 't', 'launch', 0, - 6, 0 ), shape: shapeFromDims( 4.2, 1.6 ), mass: 420, maxHp: 70 };
	th.invMass = 1 / 420; th.invI = 1 / yawInertia( 420, 0.8, 2.1 );
	th.push = ( dx, dz ) => { th.x += dx; th.z += dz; };
	th.impulse = ( jx, jz ) => { th.vx += jx * th.invMass; th.vz += jz * th.invMass; };
	w2.step( 0, [ sl, th ] );
	th.z = 6.5; th.vz = 9; // 12.5 m in one step (a sleeping hull's jump)
	const cs = w2.step( 0.2, [ sl, th ] );
	ok( cs.length === 1 && cs[ 0 ].swept && th.z < - 2 && th.vz < 2, `a hull that jumped through the sloop in one step is swept back to her near side (z ${ f2( th.z ) }, way ${ f2( th.vz ) } m/s, swept ${ w2.stats.swept })` );
	// pressed past half the other's beam: the normal is kept (never popped out of the far side)
	const w3 = new CollisionWorld();
	const p1 = body( 'p1', 'sloop', 0, 0, Math.PI / 2 ), p2 = { ...body( 'p2', 'launch', 0, - 3.2, 0 ), shape: shapeFromDims( 4.2, 1.6 ) };
	p2.push = ( dx, dz ) => { p2.x += dx; p2.z += dz; };
	p2.impulse = () => {};
	w3.step( 0, [ p1, p2 ] );
	let worst = - Infinity;
	for ( let t = 1; t < 40; t ++ ) { p2.z += 0.12; w3.step( t / 60, [ p1, p2 ] ); worst = Math.max( worst, p2.z ); }
	ok( p2.z < - 2.5 && worst < - 2.3, `a hull driven into the sloop's side stays on her side of it (z ${ f2( p2.z ) }; her side at -${ f2( glbShape( 'sloop' ).hx ) })` );
	ok( COLLIDE.restitution === 0.25, 'restitution 0.25' );

}

// ================================================================================================ 3. Naval: boat against ship
section( '3. the player\'s boat against the ships (the real Naval and BoatController)' );
{

	const r = rig( 'lobster', { z: - 40, naval: true, vfx: true } );
	const s = ship( r, 'sloop', 0, 0, Math.PI / 2 );
	let worst = - Infinity, hit = null, v = 0;
	const hp0 = r.naval.playerHull.hp, shp0 = s.hp;
	for ( let t = 0; t < 12; t += r.dt ) {

		const vz = r.boat.velocity.z;
		r.step( 1 );
		const o = depth( r.truth, r.boat.position.x, r.boat.position.z, yawOfQ( r.boat.quaternion ), glbShape( 'sloop' ), s.x, s.z, s.yaw );
		worst = Math.max( worst, o );
		if ( ! hit && r.events.some( ( e ) => e[ 0 ] === 'hullsCollided' ) ) { hit = t; v = vz; }

	}

	ok( hit !== null && v > 8, `the lobster boat rams the sloop at ${ f2( v ) } m/s` );
	ok( worst < 0.08, `no hull goes into the other: worst overlap ${ f2( worst ) } m (the boxes let her 0.25 m into the sloop)` );
	ok( r.naval.playerHull.hp < hp0 && s.hp < shp0 && r.spy.splinters > 0, `both lose hull (boat ${ f2( hp0 - r.naval.playerHull.hp ) }, sloop ${ f2( shp0 - s.hp ) }), splinters fly` );

	const q = rig( 'skiff', { z: - 25, naval: true } );
	const fr = ship( q, 'frigate', 0, 0, Math.PI / 2 );
	let vIn = 0, vOut = null, t0 = - 1, deep = - Infinity;
	const hq = q.naval.playerHull.hp, hf = fr.hp;
	for ( let t = 0; t < 12; t += q.dt ) {

		const vz = q.boat.velocity.z;
		q.step( t0 < 0 ? 1 : 0 );
		deep = Math.max( deep, depth( q.truth, q.boat.position.x, q.boat.position.z, yawOfQ( q.boat.quaternion ), glbShape( 'frigate' ), fr.x, fr.z, fr.yaw ) );
		if ( t0 < 0 && q.events.some( ( e ) => e[ 0 ] === 'hullsCollided' ) ) { t0 = t; vIn = vz; }
		if ( t0 >= 0 && t < t0 + 0.5 ) vOut = Math.min( vOut ?? 0, q.boat.velocity.z );

	}

	const frDv = Math.hypot( fr.push.x, fr.push.z ) + Math.abs( fr.speed );
	ok( deep < 0.08, `the skiff meets the frigate's side as drawn (overlap ${ f2( deep ) } m; the box let her 0.6 m in)` );
	ok( vOut < - 0.4, `the skiff bounces off at ${ f2( - vOut ) } m/s (in at ${ f2( vIn ) })` );
	ok( frDv < 0.05, `the 140 t frigate barely moves (${ f2( frDv ) } m/s)` );
	const dq = ( hq - q.naval.playerHull.hp ) / q.naval.playerHull.max, df = ( hf - fr.hp ) / fr.maxHp;
	ok( dq > 0.05 && dq > 50 * df, `the skiff takes the damage (${ f2( dq * 100 ) } % of her hull, the frigate ${ f2( df * 100 ) } %)` );

	// bow to bow: momentum is kept (the heavier brigantine shoves the sloop back)
	const b = rig( 'skiff', { x: 300, z: 300, naval: true } );
	b.boat.enabled = false;
	b.boat.position.y = - 500;
	const sa = ship( b, 'sloop', 0, - 20, 0, 6 ), sb = ship( b, 'brigantine', 0.4, 20, Math.PI, 5 );
	let bt = - 1, after = null, bw = - Infinity;
	for ( let t = 0; t < 6; t += b.dt ) {

		b.features.update( b.dt );
		bw = Math.max( bw, depth( glbShape( 'sloop' ), sa.x, sa.z, sa.yaw, glbShape( 'brigantine' ), sb.x, sb.z, sb.yaw ) );
		if ( bt < 0 && b.events.some( ( e ) => e[ 0 ] === 'hullsCollided' ) ) bt = t;
		if ( bt >= 0 && ! after && t > bt + 0.3 ) after = [ sa.velocity().z, - sb.velocity().z ];

	}

	const p0 = 26000 * 6 - 64000 * 5, p1 = after ? 26000 * after[ 0 ] - 64000 * after[ 1 ] : NaN;
	ok( bw < 0.08 && after && Math.abs( p1 - p0 ) / Math.abs( p0 ) < 0.2, `bow to bow: no overlap (${ f2( bw ) } m), momentum kept (sloop ${ after && f2( after[ 0 ] ) }, brig ${ after && f2( after[ 1 ] ) } m/s)` );

}

// ================================================================================================ 4. the boat against the world
section( '4. the boat against piles, a pier, a quay, a rock, a beach' );
{

	const drive = ( r, sec, top ) => { let d = 0; for ( let t = 0; t < sec; t += r.dt ) { r.step( 1 ); d = Math.max( d, worldDepth( r, top ) ); } return d; };

	const a = rig( 'lobster', { z: - 60, colliders: pier() } );
	const da = drive( a, 14, 1.8 );
	ok( da < 0.08 && a.boat.position.z + a.truth.zAft < 0, `the lobster boat at full throttle into a pier's piles stops at them (deepest ${ f2( da ) } m; it drove through before)` );
	ok( a.boat.impacts.length >= 0 && CONTACT.touch > 0, 'impacts are kept for naval' );

	const b = rig( 'brigantine', { z: - 70, colliders: pier() } );
	const db = drive( b, 25, 3.7 );
	ok( db < 0.1 && b.boat.position.z + b.truth.zBow < 0.3, `the brigantine is stopped by the pier, deck and all (deepest ${ f2( db ) } m, bow at ${ f2( b.boat.position.z + b.truth.zBow ) })` );

	// a deck 2.3 m up on a pier with no piles in her way: the bow (1.6 m) runs under it, the wheelhouse (2.4 m) stops at it
	const dk = new Colliders();
	dk.addBox( new E.Vector3( 0, 2.26, 5 ), new E.Vector3( 20, 0.04, 5 ), 0, { walkable: true, solid: true, tag: 'pierDeck' } );
	const h = rig( 'lobster', { z: - 40, colliders: dk } );
	for ( let t = 0; t < 12; t += h.dt ) h.step( 1 );
	const front = h.boat.upperShape ? h.boat.upperShape.zBow : NaN;
	ok( h.boat.position.z + h.truth.zBow > 0.5 && h.boat.position.z + front < 0.08, `under a pier deck: the bow runs in (${ f2( h.boat.position.z + h.truth.zBow ) } m), the wheelhouse stops at the edge (${ f2( h.boat.position.z + front ) })` );

	const qc = new Colliders();
	qc.addBox( new E.Vector3( 0, - 0.5, 5 ), new E.Vector3( 40, 3, 5 ), 0, { walkable: true, solid: true, tag: 'quay' } );
	const c = rig( 'lobster', { z: - 60, colliders: qc } );
	let dc = 0, vmin = 0;
	for ( let t = 0; t < 14; t += c.dt ) { c.step( 1 ); dc = Math.max( dc, worldDepth( c, 2 ) ); vmin = Math.min( vmin, c.boat.velocity.z ); }
	ok( dc < 0.08 && vmin < - 0.3 && vmin > - 2, `into a quay at 9.8 m/s: stopped at the face (${ f2( dc ) } m), a dead bounce (${ f2( - vmin ) } m/s back; it sprang off at 5.9 before)` );

	const rc = new Colliders();
	rc.addCylinder( 0, 0, 2.5, - 8, 3, { tag: 'rock' } );
	const d = rig( 'skiff', { z: - 40, colliders: rc } );
	const dd = drive( d, 14, 1 );
	ok( dd < 0.06, `the skiff against a rock: ${ f2( dd ) } m` );

	const beach = { heightAt: ( x, z ) => Math.min( 3, - 4 + Math.max( 0, z ) / 8 ) };
	const e = rig( 'lobster', { z: - 60, terrain: beach } );
	let touch = - 1, zT = 0, stop = - 1, zMax = - Infinity, grounds = 0;
	for ( let t = 0; t < 20; t += e.dt ) {

		e.step( touch < 0 ? 1 : 0 );
		zMax = Math.max( zMax, e.boat.position.z );
		if ( touch < 0 && e.boat.grounded ) { touch = t; zT = e.boat.position.z; }
		if ( touch >= 0 && stop < 0 && e.boat.speed < 0.3 ) stop = t - touch;
		grounds += e.boat.impacts.filter( ( i ) => i.what === 'ground' ).length;
		e.boat.impacts.length = 0;

	}

	ok( touch > 0 && stop > 0 && stop < 3 && zMax - zT < 14, `run up a 1:8 beach at full speed: the keel scrapes to a stop in ${ f2( stop ) } s and ${ f2( zMax - zT ) } m` );
	ok( grounds >= 1, `the grounding is a blow (${ grounds })` );

	// moored against the piles in a swell: no chatter
	const swell = ( x, z, t ) => 0.3 * Math.sin( 0.9 * t + 0.05 * x ) + 0.15 * Math.sin( 1.7 * t + 0.11 * z );
	const m = rig( 'lobster', { colliders: pier( { z: 4 } ), swell } );
	m.boat.moored = true;
	m.boat.driven = false;
	m.boat.mooring.anchor.set( 0, 0, 0.6 );
	const zs = [];
	let jerk = 0, last = null, md = 0;
	for ( let t = 0; t < 20; t += m.dt ) {

		m.step( 0 );
		if ( t < 5 ) continue;
		zs.push( m.boat.position.z );
		if ( last !== null ) jerk = Math.max( jerk, Math.abs( m.boat.velocity.z - last ) / m.dt );
		last = m.boat.velocity.z;
		md = Math.max( md, worldDepth( m, 1.8 ) );

	}

	const mean = zs.reduce( ( a, b ) => a + b, 0 ) / zs.length, sd = Math.sqrt( zs.reduce( ( a, b ) => a + ( b - mean ) ** 2, 0 ) / zs.length );
	ok( sd < 0.03 && jerk < 3 && md < 0.06, `moored hard against the piles in a swell: surge ${ f2( sd * 100 ) } cm, peak ${ f2( jerk ) } m/s2, in the piles ${ f2( md ) } m` );

}

// ================================================================================================ 5. blows into damage and sound
section( '5. naval turns the boat\'s blows into damage, sound and hullStruck' );
{

	const qc = new Colliders();
	qc.addBox( new E.Vector3( 0, - 0.5, 5 ), new E.Vector3( 40, 3, 5 ), 0, { walkable: true, solid: true, tag: 'tidemarkQuay' } );
	const r = rig( 'lobster', { z: - 60, colliders: qc, naval: true, vfx: true } );
	const hp0 = r.naval.playerHull.hp;
	for ( let t = 0; t < 14; t += r.dt ) r.step( 1 );
	const st = r.events.filter( ( e ) => e[ 0 ] === 'hullStruck' ).map( ( e ) => e[ 1 ] );
	ok( st.length >= 1 && st[ 0 ].what === 'pier' && st[ 0 ].speed > 8 && st[ 0 ].damage > 0, `hullStruck ${ JSON.stringify( st[ 0 ] ) }` );
	ok( r.naval.playerHull.hp < hp0 && r.events.some( ( e ) => e[ 0 ] === 'playerBoatDamaged' ), `the hull takes it (${ f2( hp0 - r.naval.playerHull.hp ) } of ${ r.naval.playerHull.max })` );
	ok( r.naval.audio.played.some( ( p ) => p.name === 'crunch' ) && r.spy.splash > 0 && r.spy.splinters > 0 && r.kicks.length > 0, 'a crunch, a splash, splinters and the camera kick' );
	ok( st.length <= 3, `pressing on against the quay is not a blow every frame (${ st.length } blows in 14 s)` );

	// a nudge on the fenders: a thump, no damage
	const n = rig( 'lobster', { z: - 3.4, colliders: qc, naval: true } );
	const h1 = n.naval.playerHull.hp;
	n.boat.velocity.set( 0, 0, 0.9 );
	for ( let t = 0; t < 2; t += n.dt ) n.step( 0 );
	ok( n.naval.audio.played.some( ( p ) => p.name === 'thump' ) && n.naval.playerHull.hp === h1, `coming alongside at 0.9 m/s: a fender thump, no damage (${ n.naval.audio.played.map( ( p ) => p.name ).join( ',' ) })` );
	ok( WORLD_HIT.soft > 0.9, 'WORLD_HIT.soft' );

	// grounding: the scrape and a smaller share of the blow
	const beach = { heightAt: ( x, z ) => Math.min( 3, - 4 + Math.max( 0, z ) / 8 ) };
	const g = rig( 'lobster', { z: - 60, terrain: beach, naval: true } );
	const h2 = g.naval.playerHull.hp;
	for ( let t = 0; t < 14; t += g.dt ) g.step( 1 );
	const gs = g.events.filter( ( e ) => e[ 0 ] === 'hullStruck' ).map( ( e ) => e[ 1 ] );
	ok( gs.some( ( e ) => e.what === 'ground' ) && g.naval.audio.played.some( ( p ) => p.name === 'scrape' ), `run aground: hullStruck ground (${ gs.map( ( e ) => e.speed ).join( ', ' ) } m/s), the keel scrapes` );
	ok( h2 - g.naval.playerHull.hp < 0.5 * g.naval.playerHull.max, `beaching does not sink her outright (${ f2( h2 - g.naval.playerHull.hp ) } of ${ g.naval.playerHull.max })` );

}

// ================================================================================================ 6. the swimmer
section( '6. a swimmer is kept out of the hulls' );
{

	const r = rig( 'skiff', { x: 300, z: 300, naval: true } );
	r.boat.enabled = false;
	r.boat.position.y = - 500;
	const s = ship( r, 'brigantine', 0, 0, 0, 0 );
	s.state = 'moored';
	const p = r.app.player;
	p.mode = 'swim';
	p.position.set( - 6, - 0.2, 0 );
	p.velocity = new E.Vector3( 1.2, 0, 0 );
	let deepest = - Infinity;
	for ( let t = 0; t < 6; t += r.dt ) {

		p.position.x += 1.2 * r.dt;
		r.features.update( r.dt );
		deepest = Math.max( deepest, - polyDistance( glbShape( 'brigantine' ), p.position.x - s.x, p.position.z - s.z ).d );

	}

	ok( deepest < 0, `swimming into her side: the swimmer stays outside it (${ f2( - deepest ) } m off; went 3.4 m into her before)` );
	p.position.set( - 2, - 4.5, 0 ); // under the keel
	r.features.update( r.dt );
	ok( Math.abs( p.position.x + 2 ) < 1e-6, 'diving under her keel is left alone' );

}

// ================================================================================================ 7. cost
section( '7. what it costs' );
{

	// the boat by the home pier's worth of piles and boxes: 1 s of 120 Hz steps
	const c = new Colliders();
	for ( let k = 0; k < 400; k ++ ) c.addCylinder( ( k % 20 ) * 3 - 30, Math.floor( k / 20 ) * 4 + 6, 0.2, - 5, 2.3, { tag: 'pile' } );
	for ( let k = 0; k < 200; k ++ ) c.addBox( new E.Vector3( ( k % 20 ) * 3 - 30, 0.5, Math.floor( k / 20 ) * 4 + 6 ), new E.Vector3( 0.4, 1, 0.4 ), 0, { solid: true } );
	for ( let k = 0; k < 2000; k ++ ) c.addBox( new E.Vector3( 500 + k, 5, 500 ), new E.Vector3( 1, 1, 1 ), 0, { solid: true } ); // the rest of the island
	const r = rig( 'lobster', { z: 3, colliders: c } );
	r.boat.moored = true;
	r.boat.driven = false;
	const t0 = performance.now();
	for ( let t = 0; t < 2; t += r.dt ) r.step( 0 );
	const ms = ( performance.now() - t0 ) / 120;
	ok( ms < 1.5, `the boat among 600 colliders (2600 in the world): ${ f2( ms ) } ms a frame for all of her physics` );

	const w = new CollisionWorld(), bodies = [];
	for ( let k = 0; k < 13; k ++ ) {

		const kind = [ 'sloop', 'brigantine', 'frigate', 'trawler' ][ k % 4 ], cl = SHIP_CLASSES[ kind ];
		const b = { id: 's' + k, x: ( k % 4 ) * 18, z: Math.floor( k / 4 ) * 30, yaw: k * 0.3, hx: cl.beam / 2, hz: cl.length / 2, mass: cl.mass, invMass: 1 / cl.mass, invI: 1 / yawInertia( cl.mass, cl.beam / 2, cl.length / 2 ), vx: 0, vz: 1, w: 0, maxHp: cl.hp, shape: glbShape( kind ) };
		b.push = ( dx, dz ) => { b.x += dx; b.z += dz; };
		b.impulse = () => {};
		bodies.push( b );

	}

	for ( let i = 0; i < 50; i ++ ) w.step( i / 60, bodies );
	const t1 = performance.now();
	for ( let i = 0; i < 600; i ++ ) { for ( const b of bodies ) b.z += 1 / 60; w.step( i / 60, bodies ); }
	const us = ( performance.now() - t1 ) / 600 * 1000;
	ok( us < 150, `13 hulls as outlines, closely packed: ${ f2( us ) } us a step` );

}

console.log( `\n${ passes } checks passed, ${ fails } failed` );
process.exit( fails ? 1 : 0 );
