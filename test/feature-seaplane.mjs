// Plain-node tests of the seaplane feature (src/features/seaplane): the flight model (floats at rest, the hump and
// the step, a takeoff near 28 m/s with back pressure, the stall), the pilot's controls and assist, what touchdowns
// and strikes mean, the site's clearances on the real heightmap, the purchase / repair / save, a full flight with
// the real Player (board from the jetty, take off, refuse to climb out in the air, a nose-in crash and the tow home,
// a gentle landing and climbing out into the water), multiplayer state and remote planes, and the exported GLB.
// No DOM, no GPU.
//   node test/feature-seaplane.mjs
import fs from 'node:fs';
import * as E from '../src/engine/index.js';
import * as seaplane from '../src/features/seaplane/index.js';
import { install, Flight, GEOM, SPEC, liftCoefficient, waterResistance, Pilot, judge, MAX_HP, SITE, jettyPoint, PRICE, REPAIR_PER_HP } from '../src/features/seaplane/index.js';
import { RemotePlanes, INTERP } from '../src/features/seaplane/Remote.js';
import { KEYS as PLANE_KEYS, THROTTLE_DOWN } from '../src/features/seaplane/Seaplane.js';
import { buildSiteGeometry } from '../src/features/seaplane/Site.js';
import { buildStandIn } from '../src/features/seaplane/Model.js';
import { triangleCount } from '../src/world/boat/GeoKit.js';
import { Features } from '../src/features/Features.js';
import { GameState } from '../src/game/GameState.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { Colliders } from '../src/world/Colliders.js';
import { WORLD } from '../src/world/WorldLayout.js';
import { Player } from '../src/player/Player.js';
import { STALL_SITES } from '../src/features/trade/stall.js';
import { YARD } from '../src/game/BoatYard.js';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};
const finite = ( v ) => [ v.x, v.y, v.z ].every( Number.isFinite );
const store = () => {

	const m = new Map();
	return { getItem: ( k ) => m.has( k ) ? m.get( k ) : null, setItem: ( k, v ) => m.set( k, v ), map: m };

};
const DEG = 180 / Math.PI;

// runs a bare Flight for `sec` at 60 Hz with `ctl( f )` setting the controls each frame; returns the events
function fly( f, sec, ctl = () => {} ) {

	const ev = [];
	for ( let i = 0; i < sec * 60; i ++ ) {

		ctl( f );
		f.update( 1 / 60 );
		for ( const e of f.drainEvents() ) ev.push( { ...e, t: i / 60 } );

	}

	return ev;

}

// ---------------------------------------------------------------- flight model
{

	ok( waterResistance( 9 ) > waterResistance( 2 ) && waterResistance( 9 ) > waterResistance( 22 ) * 2, 'hull resistance peaks at the hump and drops on the step' );
	const w = SPEC.surfaces[ 0 ];
	ok( liftCoefficient( 12 / DEG, w ) > liftCoefficient( 6 / DEG, w ) && liftCoefficient( 24 / DEG, w ) < liftCoefficient( 14 / DEG, w ) * 0.85, 'wing lift rises with alpha and falls past the ~15 degree stall' );

	const f = new Flight();
	f.place( 0, 0, 0 );
	fly( f, 6, ( p ) => { p.controls.throttle = 0; } );
	ok( Math.abs( f.load - 1 ) < 0.05 && f.position.y > - 0.5 && f.position.y < 0 && Math.abs( f.pitchAngle() * DEG ) < 4, `floats at rest: water carries the weight (load ${ f.load.toFixed( 2 ) }), keel ${ ( - f.position.y ).toFixed( 2 ) } m deep, level` );

	// full power and back pressure from 12 m/s: off the water near 28 m/s
	const g = new Flight();
	g.place( 0, 0, 0 );
	const ev = fly( g, 40, ( p ) => { p.controls.throttle = 1; p.controls.pitch = p.forwardSpeed > 12 && ! p.airborne ? 0.6 : 0.1; } );
	const lift = ev.find( ( e ) => e.type === 'liftoff' );
	ok( lift && lift.speed > 23 && lift.speed < 34, `takes off at ${ lift ? lift.speed.toFixed( 1 ) : '-' } m/s with back pressure (~25-30)` );
	ok( g.airborne && g.agl > 30 && finite( g.position ), `climbs away (${ g.agl.toFixed( 0 ) } m)` );

	// stick neutral: the floats stay on the step much longer (needs a far higher speed)
	const h = new Flight();
	h.place( 0, 0, 0 );
	const ev2 = fly( h, 18, ( p ) => { p.controls.throttle = 1; p.controls.pitch = 0; } );
	ok( ! ev2.some( ( e ) => e.type === 'liftoff' ), 'without rotating it is still on the water after 18 s' );

	// taxiing: the water rudder turns the plane
	const r = new Flight();
	r.place( 0, 0, 0 );
	fly( r, 5, ( p ) => { p.controls.throttle = 0.35; p.controls.waterRudder = 1; } );
	const hd = r.heading() * DEG; // heading grows towards +x (port): a right turn makes it negative
	ok( hd < - 15, `water rudder (right) turns the bow to starboard (heading ${ hd.toFixed( 0 ) } deg after 5 s)` );

	// the stall: slow flight with the stick held back flags it
	const s = new Flight();
	s.place( 0, 0, 0 );
	s.position.y = 300;
	s.velocity.set( 0, 0, 22 );
	s.airborne = true;
	let maxStall = 0;
	fly( s, 10, ( p ) => { p.controls.throttle = 0; p.controls.pitch = 1; maxStall = Math.max( maxStall, p.stall ); } );
	ok( maxStall > 0.5, `idle with full back stick stalls the wing (stall ${ maxStall.toFixed( 2 ) })` );

}

// ---------------------------------------------------------------- pilot
{

	const f = new Flight();
	f.place( 0, 0, 0 );
	f.onWater = true;
	const p = new Pilot();
	for ( let i = 0; i < 30; i ++ ) p.read( { down: true, right: true, throttleUp: true }, null, f, 1 / 60 );
	ok( f.controls.pitch > 0.3 && p.throttle > 0.2 && p.throttle < 0.5, 'S pulls the nose up; Shift opens the throttle gradually' );
	ok( f.controls.waterRudder > 0.5 && Math.abs( f.controls.roll ) < 0.1, 'taxiing: D steers the water rudder, the ailerons stay out' );
	const thr0 = p.throttle;
	for ( let i = 0; i < 30; i ++ ) p.read( { throttleDown: true }, null, f, 1 / 60 );
	ok( p.throttle < thr0 - 0.25, `C (throttleDown) closes it again (${ thr0.toFixed( 2 ) } -> ${ p.throttle.toFixed( 2 ) })` );
	for ( let i = 0; i < 30; i ++ ) p.read( { throttleUp: true }, null, f, 1 / 60 );
	f.airborne = true;
	f.airspeed = 40;
	for ( let i = 0; i < 30; i ++ ) p.read( { right: true }, null, f, 1 / 60 );
	ok( f.controls.roll > 0.5, 'flying: D banks right' );
	const pad = p.read( {}, { pitch: - 0.8, roll: 0, yaw: 0, throttle: 0 }, f, 1 / 60 );
	ok( pad.pitch < - 0.5, 'an analogue stick drives the elevator' );

	// assist: a released stick levels a banked plane
	const a = new Flight();
	a.place( 0, 0, 0 );
	a.position.y = 400;
	a.velocity.set( 0, 0, 40 );
	a.quaternion.setFromAxisAngle( new E.Vector3( 0, 0, 1 ), 35 / DEG );
	a.airborne = true;
	const ap = new Pilot();
	ap.throttle = 0.7;
	const b0 = Math.abs( a.rollAngle() );
	fly( a, 8, ( q ) => { ap.read( {}, null, q, 1 / 60 ); } );
	ok( Math.abs( a.rollAngle() ) < b0 * 0.4 && a.agl > 250, `stick released: wings come level (${ ( b0 * DEG ).toFixed( 0 ) } -> ${ ( Math.abs( a.rollAngle() ) * DEG ).toFixed( 0 ) } deg), no spiral` );

}

// ---------------------------------------------------------------- touchdowns and strikes
{

	ok( judge( { type: 'touch', surface: 'water', sink: 1.5, speed: 26, pitch: 3, roll: 1 } ).kind === 'landed', 'sink 1.5 m/s on the water: a landing' );
	const b = judge( { type: 'touch', surface: 'water', sink: 4.2, speed: 26, pitch: 2, roll: 0 } );
	ok( b.kind === 'bounce' && b.damage > 0 && b.damage < MAX_HP, `sink 4.2 m/s: a hard bounce (${ b.damage } damage)` );
	ok( judge( { type: 'touch', surface: 'water', sink: 7, speed: 30, pitch: 0, roll: 0 } ).kind === 'crash', 'sink 7 m/s: a crash' );
	ok( judge( { type: 'touch', surface: 'water', sink: 2, speed: 28, pitch: 0, roll: 40 } ).kind === 'crash', 'a wing down on touchdown: a crash' );
	ok( judge( { type: 'touch', surface: 'water', sink: 4.5, speed: 26, pitch: 2, roll: 0 }, 10 ).kind === 'crash', 'a hard bounce with the plane already battered breaks it' );
	ok( judge( { type: 'strike', part: 'propeller', surface: 'ground', speed: 3 } ).kind === 'crash', 'propeller on the ground: a crash' );
	ok( judge( { type: 'strike', part: 'float', surface: 'ground', speed: 2 } ).kind === 'scrape' && judge( { type: 'strike', part: 'float', surface: 'ground', speed: 14 } ).kind === 'crash', 'beaching at a walk is fine, running aground at speed is not' );
	ok( judge( { type: 'strike', part: 'wingtip', surface: 'water', speed: 30 } ).kind === 'crash', 'a wingtip caught at speed: a crash' );

}

// ---------------------------------------------------------------- the site on the real heightmap
const terrain = new TerrainData();
{

	const B = SITE.berth;
	ok( terrain.heightAt( B.x, B.z ) < - 0.6 && terrain.heightAt( B.x - 3, B.z + 4 ) < - 0.5, `berth afloat (seabed ${ terrain.heightAt( B.x, B.z ).toFixed( 2 ) } m)` );
	let land = Infinity;
	for ( const dx of [ - 5, 0, 5 ] ) for ( const dz of [ - 4, 0, 4 ] ) land = Math.min( land, terrain.heightAt( SITE.hangar.x + dx, SITE.hangar.z + dz ) );
	ok( land > 0.3, `hangar on dry sand (lowest corner ${ land.toFixed( 2 ) } m)` );
	// the takeoff run: 400 m south of the berth is water deep enough, and clear of the reef by more than a half span
	let shallow = 0;
	for ( let z = B.z; z < B.z + 400; z += 5 ) if ( terrain.heightAt( B.x, z ) > - 0.6 ) shallow ++;
	ok( shallow === 0, 'the takeoff run south of the berth is open water' );
	const reef = WORLD.reef;
	ok( Math.abs( B.x - reef.center.x ) - reef.radius > GEOM.span / 2, 'the run passes the reef with the wingtip clear' );
	const far = ( x, z, d ) => Math.hypot( x - B.x, z - B.z ) > d && Math.hypot( x - SITE.hangar.x, z - SITE.hangar.z ) > d;
	ok( Math.abs( B.x - WORLD.pier.x ) > 20 && Math.abs( SITE.jetty.x - WORLD.pier.x ) > 20, 'clear of the pier' );
	ok( far( WORLD.boatDock.position.x, WORLD.boatDock.position.z, 30 ) && far( YARD.x, YARD.z, 40 ), 'clear of the boat berth and the yard' );
	ok( far( STALL_SITES.home.x, STALL_SITES.home.z, 25 ) && far( WORLD.spawn.position.x, WORLD.spawn.position.z, 12 ) && far( WORLD.start.position.x, WORLD.start.position.z, 25 ), 'clear of the stalls, the spawn and the start' );
	const { geometry, floorY } = buildSiteGeometry( terrain );
	const tris = triangleCount( geometry );
	ok( tris > 200 && tris < 12000 && floorY > land, `site mesh ${ tris } triangles, hangar floor at ${ floorY.toFixed( 2 ) } m` );
	const jp = jettyPoint( 10, - 30 );
	ok( Math.abs( jp.x - SITE.jetty.x ) <= SITE.jetty.w / 2 && jp.y === SITE.jetty.y, 'jettyPoint clamps onto the walkway' );
	ok( triangleCount( buildStandIn() ) < 600, 'the stand-in model is cheap' );

}

// ---------------------------------------------------------------- the GLB
{

	const url = new URL( '../public/models/seaplane/Seaplane.glb', import.meta.url );
	const buf = fs.readFileSync( url );
	ok( buf.readUInt32LE( 0 ) === 0x46546c67, 'Seaplane.glb is a binary glTF' );
	const len = buf.readUInt32LE( 12 );
	const json = JSON.parse( buf.subarray( 20, 20 + len ).toString( 'utf8' ) );
	let tris = 0;
	for ( const m of json.meshes ) for ( const p of m.primitives ) tris += json.accessors[ p.indices ].count / 3;
	const mats = json.materials.map( ( m ) => m.name );
	const prop = json.nodes.find( ( n ) => n.name === 'Propeller' );
	ok( tris > 1000 && tris < 15000, `under 15k triangles (${ tris })` );
	ok( [ 'SeaplaneJade', 'SeaplaneCream', 'SeaplaneGlass', 'SeaplaneProp' ].every( ( n ) => mats.includes( n ) ), 'jade, cream, glass and propeller materials' );
	ok( prop && prop.translation && Math.abs( prop.translation[ 1 ] - GEOM.prop[ 1 ] ) < 0.01 && Math.abs( prop.translation[ 2 ] - GEOM.prop[ 2 ] ) < 0.01, 'the propeller is its own node at the hub' );
	let lo = Infinity, hi = - Infinity;
	for ( const a of json.accessors ) if ( a.type === 'VEC3' && a.min && a.max && a.min.length === 3 ) { lo = Math.min( lo, a.min[ 0 ] ); hi = Math.max( hi, a.max[ 0 ] ); }
	ok( Math.abs( hi - GEOM.span / 2 ) < 0.2, `wingspan matches the flight model (${ ( hi - lo ).toFixed( 1 ) } m)` );

}

// ---------------------------------------------------------------- the feature with the real Player
let time = 0;
const swell = ( x, z, t ) => 0.08 * Math.sin( 0.15 * x + 0.8 * t ) + 0.05 * Math.sin( 0.1 * z - 0.6 * t );
function makeQuery() {

	return {
		n: 1, cpu: new Float32Array( 128 * 4 ), points: new Float32Array( 128 * 4 ), resultInputs: new Float32Array( 128 * 4 ), cpuValid: false, version: 0, latency: 2 / 60,
		allocate( name, n ) { const s = this.n; this.n += n; return s; },
		setPoint( i, x, z ) { this.points[ i * 4 ] = x; this.points[ i * 4 + 1 ] = z; },
		tick() {

			for ( let i = 0; i < this.n; i ++ ) this.cpu[ i * 4 ] = swell( this.points[ i * 4 ], this.points[ i * 4 + 1 ], time );
			this.cpuValid = true;
			this.version ++;

		},
	};

}

class InputStub {

	constructor() { this.keys = new Set(); this.pressed = new Set(); this.look = { x: 0, y: 0 }; this.wheel = 0; this.enabled = true; }
	down( c ) { return this.keys.has( c ); }
	hit( c ) { return this.pressed.has( c ); }
	consumeLook() { const l = { ...this.look }; this.look.x = this.look.y = 0; return l; }
	consumeWheel() { const w = this.wheel; this.wheel = 0; return w; }
	endFrame() { this.pressed.clear(); }

}

function makeWorld( { mode = null, money = 0 } = {} ) {

	const state = new GameState( store() );
	if ( mode ) state.setMode( mode );
	state.money = money;
	const query = makeQuery();
	const colliders = new Colliders();
	const input = new InputStub();
	const camera = new E.PerspectiveCamera( 60, 2, 0.1, 5000 );
	const player = new Player( { camera, input, terrain, colliders, query, boat: null } );
	const toasts = [];
	const app = { terrainData: terrain, colliders, query, input, camera, player, mode: mode || 'campaign', game: { state, toast: ( t ) => toasts.push( t ) } };
	const features = new Features( app );
	const events = [];
	for ( const n of [ 'planeTookOff', 'planeLanded', 'planeCrashed' ] ) features.on( n, ( e ) => events.push( { n, ...e } ) );
	const sp = install( app, features );
	features.list.set( 'seaplane', { module: seaplane, instance: sp } );
	const frame = ( dt = 1 / 60 ) => {

		time += dt;
		query.tick();
		player.update( dt );
		features.update( dt );
		input.endFrame();

	};

	return { state, app, features, sp, player, input, camera, colliders, query, toasts, events, frame };

}

{

	const W = makeWorld( { money: 0 } );
	const { sp, player, input, state, features, events, frame } = W;
	ok( ! sp.owned && sp.hp === MAX_HP && sp.slot > 0, 'starts unowned, at full condition, with its water probes' );
	ok( W.colliders.groundHeightAt( SITE.jetty.x, - 25, 5 ) === SITE.jetty.y, 'the jetty is walkable' );
	ok( features.claimKey( 'ShiftLeft', 'other' ) === false && sp.keys.Comma && sp.keys.Period, 'throttle and rudder keys claimed' );
	ok( ! sp.board() && player.mode === 'walk', 'an unowned plane cannot be boarded (the hangar window opens instead)' );
	ok( ! sp.buy().ok && ! sp.owned, 'cannot buy it broke' );
	state.money = PRICE + 2000;
	ok( sp.buy().ok && sp.owned && state.money === 2000, `buys it for $${ PRICE.toLocaleString( 'en-US' ) }` );

	// settle at the berth, then walk onto the jetty beside the door and press E
	for ( let i = 0; i < 120; i ++ ) frame();
	const fp = sp.flight.position;
	ok( Math.hypot( fp.x - SITE.berth.x, fp.z - SITE.berth.z ) < 1.5, 'moored at the berth while unattended' );
	const door = sp.flight.toWorldXYZ( ...GEOM.door, new E.Vector3() );
	const jp = jettyPoint( door.x, door.z );
	player.position.set( jp.x, jp.y, jp.z );
	const it = features.nearestInteractable( player.position );
	ok( it && /Fly/.test( it.prompt() ), 'the door offers to fly' );
	it.onInteract();
	ok( player.mode === 'plane' && sp.piloted && player.vehicle === sp.vehicle, 'boarded: the player pilots the plane' );
	const pose = player.pose( {} );
	ok( pose.mode === 'seat' && pose.frame === sp.flight.quaternion && finite( pose.position ), 'seated pose in the plane frame' );

	// full throttle, pull back past 20 m/s
	input.keys.add( 'ShiftLeft' );
	let took = null;
	for ( let i = 0; i < 60 * 45 && ! took; i ++ ) {

		if ( sp.flight.forwardSpeed > 20 ) input.keys.add( 'KeyS' );
		frame();
		took = events.find( ( e ) => e.n === 'planeTookOff' );

	}

	ok( took && sp.flight.airborne, `took off (${ sp.flight.forwardSpeed.toFixed( 1 ) } m/s) and emitted planeTookOff` );
	for ( let i = 0; i < 180; i ++ ) frame();
	input.keys.delete( 'KeyS' );
	ok( sp.flight.agl > 10 && finite( W.camera.position ) && W.camera.position.y > 0.5, `climbing (${ sp.flight.agl.toFixed( 0 ) } m), chase camera above the water` );
	// wave 5: the throttle comes down on C (the dive key), never on Ctrl (Ctrl+W, W pitching, closed the browser tab)
	input.keys.add( 'ControlLeft' );
	ok( ! sp._keysNow().throttleDown, 'Ctrl does nothing in the seaplane any more' );
	input.keys.delete( 'ControlLeft' );
	input.keys.add( 'KeyC' );
	const kn = sp._keysNow();
	ok( THROTTLE_DOWN === 'KeyC' && kn.throttleDown && kn.throttleUp, 'C closes the throttle, Shift opens it' );
	input.keys.delete( 'KeyC' );
	ok( ! PLANE_KEYS.some( ( k ) => /^Control/.test( k ) ), `no Ctrl among the plane's keys (${ PLANE_KEYS.join( ', ' ) })` );
	const planeSrc = [ 'Seaplane.js', 'Pilot.js' ].map( ( f ) => fs.readFileSync( new URL( `../src/features/seaplane/${ f }`, import.meta.url ), 'utf8' ).replace( /\/\/.*$/gm, '' ) ).join( '\n' );
	ok( ! /Control(Left|Right)|ctrlKey/.test( planeSrc ), 'the seaplane code never reads Ctrl' );
	const st = sp.decorateState( {} );
	ok( st.plane && st.plane.p.length === 3 && st.plane.q.length === 4 && st.plane.p.every( Number.isFinite ), 'multiplayer state carries the plane' );
	input.pressed.add( 'KeyE' );
	frame();
	ok( player.mode === 'plane' && W.toasts.some( ( t ) => /Slow down/.test( t ) ), 'no climbing out in the air' );

	// first person: the eye is in the cockpit
	player.setView( 'first' );
	frame();
	const eye = sp.flight.toWorldXYZ( ...GEOM.eye, new E.Vector3() );
	ok( W.camera.position.distanceTo( eye ) < 0.01, 'first person: the camera sits at the pilot eye' );
	player.setView( 'third' );

	// nose down at full power into the sea: a crash, towed home, the player on the jetty, repair due
	input.keys.add( 'KeyW' );
	let crash = null;
	for ( let i = 0; i < 60 * 30 && ! crash; i ++ ) {

		frame();
		crash = events.find( ( e ) => e.n === 'planeCrashed' );

	}

	input.keys.clear();
	ok( !! crash, `nose-in: crashed (${ crash ? crash.cause : '-' })` );
	ok( ! sp.piloted && player.mode === 'walk' && Math.abs( player.position.y - SITE.jetty.y ) < 0.01, 'the pilot is set down on the jetty' );
	ok( sp.home && sp.hp === 0 && crash && crash.cost === MAX_HP * REPAIR_PER_HP, `the plane is back at the ramp, repair $${ crash ? crash.cost : '-' }` );
	ok( ! sp.board() && player.mode === 'walk', 'a wrecked plane cannot fly' );
	state.money = 1000;
	ok( ! sp.repair().ok, 'repair needs the money' );
	state.money = 5000;
	ok( sp.repair().ok && sp.hp === MAX_HP && state.money === 5000 - MAX_HP * REPAIR_PER_HP, 'repaired at the hangar' );

	// a gentle approach set up by hand: 2 m over the water at 27 m/s sinking 1.2 m/s, power off
	ok( sp.board(), 'boards again' );
	const f = sp.flight;
	f.position.set( 0, 2.2, 160 );
	f.quaternion.setFromAxisAngle( new E.Vector3( 0, 1, 0 ), 0 ).multiply( new E.Quaternion().setFromAxisAngle( new E.Vector3( 1, 0, 0 ), - 4 / DEG ) );
	f.velocity.set( 0, - 1.2, 27 );
	f.angular.set( 0, 0, 0 );
	f.airborne = true;
	f._wasAir = true;
	f.airTime = 2;
	sp.pilot.throttle = 0;
	let landed = null;
	for ( let i = 0; i < 60 * 8 && ! landed; i ++ ) {

		frame();
		landed = events.find( ( e ) => e.n === 'planeLanded' );

	}

	ok( landed && landed.onWater && landed.sink < 3 && sp.hp === MAX_HP && sp.piloted, `a gentle landing on the water (sink ${ landed ? landed.sink.toFixed( 2 ) : '-' } m/s), planeLanded` );
	for ( let i = 0; i < 60 * 40 && f.airspeed > 2.5; i ++ ) frame();
	ok( f.airspeed < 3 && sp.canExit(), `slowed to ${ f.airspeed.toFixed( 1 ) } m/s on the water` );
	input.pressed.add( 'KeyE' );
	frame();
	ok( player.mode === 'swim' && ! sp.piloted && player.vehicle === null, 'climbed out into the water (far from the jetty)' );
	for ( let i = 0; i < 60; i ++ ) frame();
	input.pressed.add( 'KeyE' );
	frame();
	ok( player.mode === 'plane' && sp.piloted, 'a swimmer beside the door climbs back in with E' );
	input.pressed.add( 'KeyE' );
	frame();
	ok( player.mode === 'swim', 'and out again' );
	ok( sp.recall().ok && sp.home, 'towed back to the ramp from the hangar' );

	// save round trip
	const saved = JSON.parse( JSON.stringify( sp.toJSON() ) );
	const W2 = makeWorld();
	W2.sp.fromJSON( saved );
	ok( W2.sp.owned && W2.sp.hp === MAX_HP && W2.sp.stats.crashes === saved.stats.crashes && saved.stats.crashes >= 1 && W2.sp.stats.flights >= 1, 'ownership, condition and stats survive a save' );
	W2.sp.reset();
	ok( ! W2.sp.owned && W2.sp.stats.flights === 0, 'a new game starts without the plane' );

}

// ---------------------------------------------------------------- sandbox: free, crashes cost nothing
{

	const W = makeWorld( { mode: 'sandbox', money: 0 } );
	ok( W.sp.free && W.sp.buy().ok && W.sp.owned, 'sandbox: the plane is free' );
	W.sp.board();
	W.sp._crash( 'test' );
	ok( W.sp.hp === MAX_HP && W.sp.repairCost() === 0 && W.player.mode === 'walk', 'sandbox: a crash costs nothing' );

}

// ---------------------------------------------------------------- remote planes
{

	const r = new RemotePlanes( { models: null, localId: 'me' } );
	r.ingest( [ { id: 'a', plane: { p: [ 0, 10, 0 ], q: [ 0, 0, 0, 1 ], thr: 0.4 } }, { id: 'me', plane: { p: [ 1, 1, 1 ], q: [ 0, 0, 0, 1 ] } }, { id: 'b' }, { id: 'c', plane: { p: [ NaN, 0, 0 ], q: [ 0, 0, 0, 1 ] } } ], 1000 );
	r.ingest( [ { id: 'a', plane: { p: [ 10, 12, 0 ], q: [ 0, 0, 0, 1 ], thr: 0.8 } } ], 1100 );
	ok( r.count === 1, 'remote planes: only valid states of other players are kept' );
	const s = r.sample( 'a', 1050 + INTERP );
	ok( s && Math.abs( s.position.x - 5 ) < 1e-6 && Math.abs( s.position.y - 11 ) < 1e-6 && Math.abs( s.thr - 0.6 ) < 1e-6, 'interpolated INTERP ms behind the newest sample' );
	r.update( 1 / 60, 9000 );
	ok( r.count === 0, 'a plane not heard of for 3 s is dropped' );
	const map = new Map( [ [ 'x', { plane: { p: [ 1, 2, 3 ], q: [ 0, 0, 0, 1 ], thr: 0 } } ] ] );
	r.ingest( map, 10000 );
	ok( r.count === 1, 'also takes a Map of peer states' );

}

console.log( fails ? `\n${ fails } FAILED` : '\nall seaplane tests passed' );
process.exit( fails ? 1 : 0 );
