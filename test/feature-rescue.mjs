// Plain-node test of wave 15D: Player's one climb rule out of the water (a ledge, the rocks, an afloat-tagged box, the rider
// boxes on buoys / floats / shallow wrecks, your own hull over the rail or the ladder, an AI ship's deck with the hijack hook),
// the pull-up timer, the 'aboard' mode on a foreign hull, and the rescue feature (src/features/rescue): flares (count, price,
// cooldown, where they may be fired, the flight, the remote flare), who answers (launch, passing merchant, open ocean, a black
// sail), the launch's route and arrival alongside, the ride to the dock and to your boat, the tow, fees, the save. Headless
// naval (no models, no HUD), no DOM, no GPU.
//   node test/feature-rescue.mjs
import * as E from '../src/engine/index.js';
import { Features } from '../src/features/Features.js';
import { Naval } from '../src/features/naval/Naval.js';
import * as rescueModule from '../src/features/rescue/index.js';
import { FLARE, RESCUE, rescueFee, nearestPort, planResponse, shipHull } from '../src/features/rescue/index.js';
import { GameState } from '../src/game/GameState.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { Colliders } from '../src/world/Colliders.js';
import { WORLD } from '../src/world/WorldLayout.js';
import { Player, CLIMB } from '../src/player/Player.js';

let fails = 0, passes = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else { passes ++; console.log( 'ok  ', msg ); }

};
const section = ( s ) => console.log( '\n== ' + s );
const store = () => {

	const m = new Map();
	return { getItem: ( k ) => m.has( k ) ? m.get( k ) : null, setItem: ( k, v ) => m.set( k, v ) };

};
globalThis.localStorage = globalThis.localStorage || store();

const terrain = new TerrainData();
const SEA = { x: - 50, z: 300 }; // deep water ~290 m off the home dock

class InputStub {

	constructor() { this.keys = new Set(); this.pressed = new Set(); this.look = { x: 0, y: 0 }; this.wheel = 0; this.enabled = true; }
	down( c ) { return this.keys.has( c ); }
	hit( c ) { return this.pressed.has( c ); }
	consumeLook() { const l = { ...this.look }; this.look.x = this.look.y = 0; return l; }
	consumeWheel() { const w = this.wheel; this.wheel = 0; return w; }
	endFrame() { this.pressed.clear(); }

}

function stubQuery() {

	return {
		n: 1, cpu: new Float32Array( 64 * 4 ), points: new Float32Array( 64 * 4 ), cpuValid: true,
		allocate( name, n ) { const s = this.n; this.n += n; return s; },
		setPoint( i, x, z ) { this.points[ i * 4 ] = x; this.points[ i * 4 + 1 ] = z; },
	};

}

// a stand-in of the player's boat (BoatController's surface the Player and naval read): 8 m, beam 2.8, deck 0.5, rail `sheer`
function fakeBoat( x, z, { sheer = 0.95, yaw = 0 } = {} ) {

	const q = new E.Quaternion().setFromAxisAngle( new E.Vector3( 0, 1, 0 ), yaw );
	return {
		model: {
			id: 'test-hull', lines: { deckY: 0.5, zAft: - 4, zFore: 4, shell: 0.05, tAtSheerZ: ( z ) => z, halfBreadth: () => 1.4, sheerY: () => sheer },
			dimensions: { length: 8.2, beam: 2.8 }, boardPoint: new E.Vector3( 0, 0.5, - 1.75 ), exitPoints: [], colliders: [],
		},
		position: new E.Vector3( x, 0, z ), quaternion: q, velocity: new E.Vector3(), angular: new E.Vector3(),
		speed: 0, driven: false, moored: false, throttle: 0, enabled: true,
		mooring: { anchor: new E.Vector3( x, 0, z ), heading: yaw },
		getYaw() { const f = new E.Vector3( 0, 0, 1 ).applyQuaternion( this.quaternion ); return Math.atan2( f.x, f.z ); },
		toWorld( l, out ) { return out.copy( l ).applyQuaternion( this.quaternion ).add( this.position ); },
		applyCollision() {},
	};

}

// a world: GameState, a real Player (swimming at `at`), colliders, a features registry with naval (headless) and rescue
function world( { mode = 'campaign', money = 500, at = SEA, naval = true, boat = null, terrainData = terrain, rng = null } = {} ) {

	const state = new GameState( store() );
	state.setMode( mode );
	state.money = money;
	state.boat = 'lobster';
	const input = new InputStub();
	const camera = new E.PerspectiveCamera( 60, 2, 0.1, 5000 );
	const colliders = new Colliders();
	const query = stubQuery();
	const boatCtl = boat || fakeBoat( WORLD.boatDock.position.x, WORLD.boatDock.position.z );
	const player = new Player( { camera, input, terrain: terrainData, colliders, query, boat: boatCtl } );
	player.mode = 'swim';
	player.position.set( at.x, - 0.06, at.z );
	player.view = 'first';
	const toasts = [], sent = [], marks = new Map();
	const app = {
		mode, terrainData, colliders, input, player, camera, query: null, scene: null, audio: null, spray: null,
		settings: { timeOfDay: 12, timeSpeed: 0 }, boatCtl, boat: { dimensions: { length: 8.2, beam: 2.8, draft: 0.8, freeboard: 0.9 } },
		game: { state, toast: ( t ) => toasts.push( t ) },
		netsync: { sendWorldEvent: ( kind, data ) => { sent.push( { kind, data } ); return true; } },
	};
	const features = new Features( app );
	const events = [];
	for ( const n of [ 'flareFired', 'flaresBought', 'rescueAnswered', 'rescueAlongside', 'rescueDelivered', 'rescueAbandoned', 'climbedAboard' ] ) features.on( n, ( e ) => events.push( { n, ...e } ) );
	features.list.set( 'worldmap', { module: null, instance: { addMarker: ( m ) => marks.set( m.id, { ...m } ), removeMarker: ( id ) => marks.delete( id ) } } );
	let nv = null;
	if ( naval ) nv = features.add( 'naval', { install: ( a, f ) => new Naval( a, f, { seed: 5, hud: false, models: false, settings: { autoSpawn: false } } ) } );
	const rescue = features.add( 'rescue', { install: ( a, f ) => rescueModule.install( a, f, rng ? { rng } : {} ) } );
	const frame = ( dt = 0.05 ) => {

		player.update( dt );
		features.update( dt );
		input.endFrame();

	};

	const run = ( seconds, dt = 0.05, until = null ) => {

		const n = Math.round( seconds / dt );
		for ( let i = 0; i < n; i ++ ) {

			frame( dt );
			if ( until && until() ) return ( i + 1 ) * dt;

		}

		return seconds;

	};

	return { state, app, features, events, player, input, toasts, sent, marks, naval: nv, rescue, colliders, frame, run };

}

const evs = ( W, n ) => W.events.filter( ( e ) => e.n === n );
// face the swimmer toward ( x, z ) (Player yaw 0 looks along -z)
const face = ( p, x, z ) => { p.yaw = Math.atan2( - ( x - p.position.x ), - ( z - p.position.z ) ); };
// hold Space until the swimmer is out of the water (or `max` s)
function pullUp( W, max = 1.5 ) {

	W.input.keys.add( 'Space' );
	let t = 0;
	for ( ; t < max && W.player.mode === 'swim'; t += 0.05 ) W.frame();
	W.input.keys.delete( 'Space' );
	return t;

}

// ================================================================================================ 1. climb targets
section( '1. climb targets by kind' );
{

	// a ledge (a walkable box 1 m above the water) ahead: the pull-up timer
	const W = world( { naval: false } );
	const p = W.player;
	p.yaw = 0;
	W.colliders.addBox( new E.Vector3( SEA.x, 0.5, SEA.z - 1.0 ), new E.Vector3( 1, 0.5, 0.3 ), 0, { walkable: true } );
	W.frame();
	ok( p.climb && p.climb.kind === 'ledge' && Math.abs( p.climb.top - 1 ) < 1e-6 && p.prompt && p.prompt.text === 'Climb up' && p.prompt.key === 'Space', 'a ledge ahead: "Climb up" (Space)' );
	W.input.keys.add( 'Space' );
	for ( let i = 0; i < 4; i ++ ) W.frame();
	ok( p.mode === 'swim' && p.position.y > 0.2 && p._climb > 0.15, `0.2 s in: still pulling up (${ p.position.y.toFixed( 2 ) } m)` );
	for ( let i = 0; i < 4; i ++ ) W.frame();
	W.input.keys.delete( 'Space' );
	ok( p.mode === 'walk' && Math.abs( p.position.y - 1 ) < 0.05 && Math.abs( p.position.z - ( SEA.z - 0.9 ) ) < 0.31, `after ${ CLIMB.time } s: standing on it (${ p.position.y.toFixed( 2 ) } m)` );

	// let go early: the timer resets
	const W2 = world( { naval: false } );
	W2.player.yaw = 0;
	W2.colliders.addBox( new E.Vector3( SEA.x, 0.5, SEA.z - 1.0 ), new E.Vector3( 1, 0.5, 0.3 ), 0, { walkable: true } );
	W2.input.keys.add( 'Space' );
	for ( let i = 0; i < 4; i ++ ) W2.frame();
	W2.input.keys.delete( 'Space' );
	W2.frame();
	ok( W2.player.mode === 'swim' && W2.player._climb === 0, 'let go before the time: back in the water, the pull-up starts over' );

	// too high (a sea wall 3 m up) and too low: nothing
	const W3 = world( { naval: false } );
	W3.player.yaw = 0;
	W3.colliders.addBox( new E.Vector3( SEA.x, 1.5, SEA.z - 1.0 ), new E.Vector3( 1, 1.5, 0.3 ), 0, { walkable: true } );
	W3.frame();
	ok( ! W3.player.climb, 'a wall 3 m above the water: no climb' );

	// an afloat-tagged box (not walkable), with its own label; the seaplane wreck's perch
	const W4 = world( { naval: false } );
	W4.player.yaw = 0;
	const fb = W4.colliders.addBox( new E.Vector3( SEA.x, 0.3, SEA.z - 0.9 ), new E.Vector3( 0.5, 0.2, 0.4 ), 0, { tag: 'floating', solid: false } );
	fb.label = 'Climb onto the crate';
	W4.frame();
	ok( W4.player.climb && W4.player.climb.kind === 'floating' && W4.player.prompt.text === 'Climb onto the crate', 'a box tagged floating: its label' );
	fb.tag = 'seaplane-wreck';
	fb.label = undefined;
	fb.walkable = true;
	W4.frame();
	ok( W4.player.climb && W4.player.prompt.text === 'Climb onto the wreck', 'the seaplane wreck\'s perch: "Climb onto the wreck"' );
	ok( pullUp( W4 ) < 0.6 && W4.player.mode === 'walk' && Math.abs( W4.player.position.y - 0.5 ) < 0.05, 'pulled up onto it' );

	// the rocks: terrain rising out of the water ahead
	const rocky = { heightAt: ( x, z ) => ( z < SEA.z - 0.6 ? 1.2 : - 8 ) };
	const W5 = world( { naval: false, terrainData: rocky } );
	W5.player.yaw = 0;
	W5.player.position.set( SEA.x, - 0.06, SEA.z );
	W5.frame();
	ok( W5.player.climb && W5.player.climb.kind === 'rock' && W5.player.prompt.text === 'Climb onto the rocks', 'a rock shelf at the waterline: "Climb onto the rocks"' );
	ok( pullUp( W5 ) < 0.6 && W5.player.mode === 'walk' && Math.abs( W5.player.position.y - 1.2 ) < 0.05, 'and up onto it' );

	// rider boxes (Floaters): the yard's buoy, the parked seaplane's floats, a sunk boat lying shallow
	const W6 = world( { naval: false } );
	const buoy = { position: new E.Vector3( SEA.x, 0.1, SEA.z - 0.9 ) };
	W6.app.boatYard = { boats: new Map( [ [ 'skiff', { id: 'skiff', position: new E.Vector3( SEA.x + 30, 0, SEA.z ), yaw: 0, buoy, loaded: true } ] ] ) };
	W6.player.yaw = 0;
	W6.frame();
	W6.frame();
	ok( W6.rescue.floaters.boxes.length >= 2 && W6.player.climb && W6.player.prompt.text === 'Climb onto the buoy', 'the yard\'s mooring buoy carries a rider box: "Climb onto the buoy"' );
	ok( pullUp( W6 ) < 0.6 && W6.player.mode === 'walk' && W6.player.position.y > 0.25, 'onto the buoy' );
	for ( let i = 0; i < 10; i ++ ) W6.frame();
	ok( W6.player.mode === 'walk' && Math.abs( W6.player.position.y - 0.32 ) < 0.05, 'standing on it' );
	W6.app.boatYard = null;
	W6.player.mode = 'swim';
	W6.player.position.set( SEA.x + 200, - 0.06, SEA.z );
	W6.frame();
	ok( W6.rescue.floaters.boxes.length === 0 && ! W6.colliders.boxes.some( ( b ) => b.tag === 'floating' ), 'nothing afloat near: the rider boxes leave the colliders' );

	const W7 = world( { naval: false } );
	const flight = {
		position: new E.Vector3( SEA.x, 0, SEA.z - 3 ), quaternion: new E.Quaternion(), airborne: false, geom: null,
		toWorldXYZ( x, y, z, out ) { return out.set( x, y, z ).applyQuaternion( this.quaternion ).add( this.position ); },
		heading() { return 0; },
	};
	W7.features.list.set( 'seaplane', { module: null, instance: { owned: true, lost: false, piloted: false, flight } } );
	W7.player.position.set( SEA.x + 1.35, - 0.06, SEA.z - 3 + 3.5 ); // off the port float's tip
	W7.player.yaw = 0;
	W7.frame();
	W7.frame();
	ok( W7.player.climb && W7.player.prompt.text === 'Climb onto the float' && Math.abs( W7.player.climb.top - 0.62 ) < 1e-6, 'the parked seaplane: "Climb onto the float"' );

	const W8 = world();
	W8.naval.wrecks.own = { id: 'w1', boat: 'skiff', x: SEA.x, y: - 0.2, z: SEA.z - 2.5, yaw: 0 };
	W8.player.yaw = 0;
	W8.frame();
	W8.frame();
	ok( W8.player.climb && W8.player.prompt.text === 'Climb onto the wreck', 'your boat sunk in shallow water: "Climb onto the wreck"' );

	// your own hull: over the rail anywhere along her side (freeboard under 1.6 m), else the ladder
	const hull = fakeBoat( SEA.x - 2.2, SEA.z, { sheer: 0.95 } ); // (her starboard side 0.8 m off the swimmer, port... facing her)
	const W9 = world( { naval: false, boat: hull } );
	face( W9.player, hull.position.x, hull.position.z );
	W9.frame();
	ok( W9.player.climb && W9.player.climb.kind === 'boat' && W9.player.prompt.text === 'Climb aboard', 'your boat amidships, 0.95 m freeboard: "Climb aboard"' );
	pullUp( W9 );
	ok( W9.player.mode === 'deck' && Math.abs( W9.player.deckPos.z ) < 0.6 && Math.abs( W9.player.deckPos.x ) <= 0.91, `over the rail onto her deck where you were (deck ${ W9.player.deckPos.x.toFixed( 2 ) }, ${ W9.player.deckPos.z.toFixed( 2 ) }), not at the ladder` );
	const tall = fakeBoat( SEA.x - 2.2, SEA.z, { sheer: 1.9 } );
	const W10 = world( { naval: false, boat: tall } );
	face( W10.player, tall.position.x, tall.position.z );
	W10.frame();
	ok( W10.player.climb && W10.player.climb.ladder && /ladder/.test( W10.player.prompt.text ), 'a high side (1.9 m): the prompt sends you to the ladder' );
	pullUp( W10, 0.6 );
	ok( W10.player.mode === 'swim', 'and Space does not climb it' );

}

// ================================================================================================ 2. AI decks and the hijack hook
section( '2. climbing an AI ship: deck, hooks, aboard mode' );
{

	const W = world();
	const calls = [];
	W.features.list.set( 'hijack', { module: null, instance: { onClimb: ( s, ctx ) => { calls.push( { s, ctx } ); return false; } } } );
	const s = W.naval.spawn( 'sloop', { x: SEA.x - 3.5, z: SEA.z, yaw: 0, speed: 0, state: 'adrift' } );
	s.hp = s.maxHp * 0.2;
	s.wantSpeed = 0;
	face( W.player, s.x, s.z );
	W.frame();
	ok( W.player.climb && W.player.climb.kind === 'ship' && W.player.prompt.text === `Climb aboard the ${ s.name }`, `a crippled sloop alongside: "Climb aboard the ${ s.name }"` );
	pullUp( W );
	ok( W.player.mode === 'aboard' && W.player.hull && W.player.hull.ship === s, 'on her deck (mode aboard, her hull)' );
	ok( Math.abs( W.player.position.y - ( s.pose.y + s.cls.deck ) ) < 0.05, `at her deck height (${ W.player.position.y.toFixed( 2 ) } m)` );
	ok( evs( W, 'climbedAboard' ).length === 1 && evs( W, 'climbedAboard' )[ 0 ].ship === s && calls.length === 1 && calls[ 0 ].s === s && calls[ 0 ].ctx.player === W.player, 'climbedAboard { ship } and hijack.onClimb( ship, { player, hull } )' );
	// she gets under way with you aboard: you ride her deck
	s.state = 'dock';
	s.wantSpeed = 0.5;
	const before = { x: W.player.position.x, z: W.player.position.z };
	W.run( 6 );
	const l = { x: W.player.position.x - s.x, z: W.player.position.z - s.z };
	ok( Math.hypot( W.player.position.x - before.x, W.player.position.z - before.z ) > 3 && Math.hypot( l.x, l.z ) < s.cls.length / 2, `riding her deck as she sails (${ Math.hypot( W.player.position.x - before.x, W.player.position.z - before.z ).toFixed( 1 ) } m)` );
	const pose = W.player.pose( {} );
	ok( pose.mode === 'deck' && pose.frame && Math.abs( pose.yaw - ( W.player.deckYaw + Math.PI ) ) < 1e-9, 'the avatar pose: deck, in her heading frame' );
	// walk to the rail and go over the side
	W.player.deckYaw = Math.PI / 2; // (facing her port side)
	W.input.keys.add( 'KeyW' );
	W.run( 2 );
	W.input.keys.delete( 'KeyW' );
	ok( W.player.prompt && W.player.prompt.text === 'Jump overboard', 'at her rail: "Jump overboard"' );
	W.input.pressed.add( 'KeyE' );
	W.frame();
	ok( W.player.mode === 'swim' && ! W.player.hull, 'E: over the side, swimming' );

	// a ship under way: no climbing her
	const W2 = world();
	const m = W2.naval.spawn( 'trawler', { x: SEA.x - 4, z: SEA.z, yaw: 0, speed: 3, state: 'rescue' } );
	m.wantSpeed = 0.7;
	face( W2.player, m.x, m.z );
	W2.player.update( 0.05 );
	ok( W2.player.climb && W2.player.climb.ladder && /under way/.test( W2.player.prompt.text ), 'a ship under way: "under way", no climb' );

	// she sinks under you: back in the water
	const W3 = world();
	const t = W3.naval.spawn( 'trawler', { x: SEA.x, z: SEA.z - 20, yaw: 0, speed: 0, state: 'rescue' } );
	W3.player.boardHull( shipHull( t ), 0, 0 );
	W3.frame();
	ok( W3.player.mode === 'aboard', 'boardHull puts you on a hull' );
	t.state = 'gone';
	W3.frame();
	ok( W3.player.mode === 'swim', 'the hull gone: you are in the water' );

}

// ================================================================================================ 3. flares
section( '3. flares: the pack, the price, where, the hold, the cooldown, the flight' );
{

	const W = world( { naval: false, money: 200 } );
	const r = W.rescue;
	ok( r.flares === 0 && ! r.canFire(), 'no flares at first: none to fire' );
	ok( /Distress flares/.test( r.shopRows() ) && /data-flare/.test( r.shopRows() ) && /\$45/.test( r.shopRows() ), 'a chandlery row with a data-flare button ($45)' );
	const b1 = r.buy();
	ok( b1.ok && b1.added === FLARE.pack && r.flares === 3 && W.state.money === 200 - FLARE.price && evs( W, 'flaresBought' ).length === 1, `a pack of ${ FLARE.pack } for $${ FLARE.price }` );
	r.buy();
	r.buy();
	ok( r.flares === FLARE.max && r.buy().reason === 'full', `at most ${ FLARE.max }` );
	const W0 = world( { naval: false, money: 10 } );
	ok( W0.rescue.buy().reason === 'money' && W0.rescue.flares === 0, 'too poor: no sale' );
	const S = world( { naval: false, mode: 'sandbox', money: 0 } );
	ok( S.rescue.buy().ok && S.rescue.flares === 3 && S.rescue.agentRow( 'pons' ).price === 0, 'free in the sandbox (the agents\' row too)' );
	const row = r.agentRow( WORLD.ports[ 1 ].id );
	ok( row.key === 'flares' && row.have === 'Full' && row.disabled, 'the harbour agents\' row (full here)' );

	// where: on land no, swimming yes, adrift in your boat (no fuel) yes, on a float yes
	W.player.mode = 'walk';
	W.player.position.set( 60, 3, - 60 );
	ok( r.situation() === null && ! r.canFire(), 'on foot ashore: no flare' );
	W.player.mode = 'deck';
	ok( r.situation() === null, 'on your deck with fuel aboard: no flare' );
	W.state.fuel = 0;
	ok( r.adrift() && r.situation() === 'adrift', 'out of fuel at sea: adrift, a flare' );
	W.state.fuel = null;
	W.player.mode = 'walk';
	const fl = W.colliders.addBox( new E.Vector3( 60, 2.9, - 60 ), new E.Vector3( 1, 0.1, 1 ), 0, { walkable: true, solid: false, tag: 'floating' } );
	ok( r.situation() === 'wreck', 'standing on something afloat: a flare' );
	W.colliders.boxes.splice( W.colliders.boxes.indexOf( fl ), 1 );
	W.player.mode = 'swim';
	W.player.position.set( SEA.x, - 0.06, SEA.z );
	ok( r.situation() === 'swim' && r.canFire(), 'swimming: a flare' );

	// F held FLARE.hold s fires one; held on, no second; the cooldown
	W.input.keys.add( 'KeyF' );
	W.run( 0.3 );
	ok( r.flares === FLARE.max, 'F held 0.3 s: not yet' );
	W.run( 0.25 );
	ok( r.flares === FLARE.max - 1 && evs( W, 'flareFired' ).length === 1 && W.sent.some( ( s ) => s.kind === 'flareFired' && Number.isFinite( s.data.x ) ), 'F held 0.5 s: a flare (flareFired, the world event)' );
	W.run( 1.5 );
	ok( r.flares === FLARE.max - 1, 'held on: one flare per press' );
	W.input.keys.delete( 'KeyF' );
	W.frame();
	W.input.keys.add( 'KeyF' );
	W.run( 0.6 );
	ok( r.flares === FLARE.max - 1 && r.cooldown > 0, `inside the cooldown (${ FLARE.cooldown } s): no flare` );
	W.input.keys.delete( 'KeyF' );
	W.run( FLARE.cooldown );
	W.input.keys.add( 'KeyF' );
	W.run( 0.6 );
	W.input.keys.delete( 'KeyF' );
	ok( r.flares === FLARE.max - 2, 'after it: the next one' );
	ok( r.wantsKey( 'KeyF' ) && ! r.wantsKey( 'KeyG' ), 'wantsKey: F is the flare while one could be fired (the free camera gives way)' );
	W.player.mode = 'walk';
	ok( ! r.wantsKey( 'KeyF' ), 'ashore F is the free camera again' );
	W.player.mode = 'swim';

	// the flight: climbs, bursts high, burns red FLARE.burn s with a light, then goes out
	const f = r.fx.list[ r.fx.list.length - 1 ];
	ok( f && f.phase === 'rise', 'the flare climbs' );
	W.run( FLARE.rise );
	ok( f.phase === 'burn' && f.y > 100 && r.fx.lights.some( ( L ) => L.enabled ), `bursts at ${ f.y.toFixed( 0 ) } m and lights up red` );
	const y0 = f.y;
	W.run( 10 );
	ok( f.y < y0 - 10 && f.y > 50, 'drifts down under its parachute' );
	W.run( FLARE.burn );
	ok( ! r.fx.list.includes( f ) && ! r.fx.lights.some( ( L ) => L.enabled ), 'and goes out' );

	// someone else's flare (the universe relays it)
	W.toasts.length = 0;
	W.features.emit( 'remoteWorldEvent', { kind: 'flareFired', data: { x: SEA.x + 600, z: SEA.z }, from: 'b' } );
	ok( r.fx.list.length === 1 && r.fx.list[ 0 ].remote && W.toasts.some( ( t ) => /red flare to the east/.test( t ) ), 'a remote flare: seen in the sky, a toast with its bearing' );
	W.features.emit( 'remoteWorldEvent', { kind: 'flareFired', data: { x: 0, z: 0 }, from: 'b', replay: true } );
	ok( r.fx.list.length === 1, 'a replayed one (joining later) is not shown' );

}

// ================================================================================================ 4. who answers
section( '4. who answers a flare' );
{

	const rng0 = () => 0;
	const home = planResponse( { x: SEA.x, z: SEA.z, rng: rng0 } );
	ok( home.by === 'launch' && home.port.id === 'home' && home.delay >= RESCUE.answer[ 0 ] && home.delay <= RESCUE.answer[ 1 ], `near the home island: the ${ home.port.name } launch, in ${ home.delay } s` );
	const passer = { alive: true, faction: 'merchant', state: 'sail', x: SEA.x + 300, z: SEA.z };
	const pass = planResponse( { x: SEA.x, z: SEA.z, ships: [ passer, { alive: true, faction: 'pirate', state: 'patrol', x: SEA.x, z: SEA.z } ], rng: rng0 } );
	ok( pass.by === 'merchant' && pass.ship === passer && pass.delay <= RESCUE.passAnswer[ 1 ], 'a merchant within 600 m answers first (never a pirate)' );
	ok( planResponse( { x: SEA.x, z: SEA.z, ships: [ { ...passer, x: SEA.x + 900 } ], rng: rng0 } ).by === 'launch', 'one 900 m off does not' );
	ok( planResponse( { x: SEA.x, z: SEA.z, notoriety: 5, rng: rng0 } ).by === 'pirate' && planResponse( { x: SEA.x, z: SEA.z, notoriety: 2, rng: rng0 } ).by === 'launch', 'a high notoriety may bring a black sail' );
	let far = null;
	for ( let r = 2600; r < 6000 && ! far; r += 200 ) for ( let a = 0; a < 16 && ! far; a ++ ) {

		const x = Math.sin( a / 16 * Math.PI * 2 ) * r, z = Math.cos( a / 16 * Math.PI * 2 ) * r;
		if ( nearestPort( x, z ).d > RESCUE.portRange ) far = { x, z };

	}

	const ocean = planResponse( { ...far, rng: rng0 } );
	ok( far && ocean.by === 'merchant' && ocean.ocean && ocean.delay >= RESCUE.ocean[ 0 ], `open ocean (${ Math.round( nearestPort( far.x, far.z ).d ) } m from any dock): a merchant on passage after ${ ocean.delay } s` );
	ok( rescueFee( 0 ) === 25 && rescueFee( 1000 ) === 85 && rescueFee( 1000, { tow: true } ) === 128, 'the fee: $25 + $60 / km, x1.5 for a tow' );

}

// ================================================================================================ 5. the launch: out, alongside, aboard, the dock
section( '5. the launch: route, alongside, the ride to the dock, the fee' );
{

	const W = world( { money: 400, rng: () => 0.5 } );
	const r = W.rescue;
	r.flares = 3;
	r.fire();
	const j = r.job;
	ok( j && j.phase === 'waiting' && j.plan.by === 'launch' && j.delay === 90, `flare away: the answer in ${ j && j.delay } s` );
	W.run( 95, 0.05, () => j.phase !== 'waiting' );
	const s = j.ship;
	ok( j.phase === 'inbound' && s && W.naval.ships.includes( s ) && s.state === 'rescue' && /Hyptile Harbour launch/.test( s.name ), `the ${ s && s.name } puts out (naval.spawn, state rescue)` );
	ok( s.cls.speed === 9 && s.faction === 'navy' && W.toasts.some( ( t ) => /harbour launch is putting out/.test( t ) ), 'a fast launch hull; a toast as she sets out' );
	ok( evs( W, 'rescueAnswered' ).some( ( e ) => e.by === 'launch' && e.port === 'home' ), 'rescueAnswered { by: launch, port }' );
	ok( W.marks.has( 'rescue' ), 'a blip on the maps' );
	ok( r.lights.some( ( L ) => L.kind === 'launchLamp' && L.enabled ), 'her lamp is lit' );
	const t0 = W.run( 200, 0.05, () => j.phase === 'alongside' );
	const gap = Math.hypot( s.x - W.player.position.x, s.z - W.player.position.z );
	ok( j.phase === 'alongside' && Math.abs( s.speed ) < 2 && gap < s.cls.length, `alongside after ${ t0.toFixed( 0 ) } s (${ gap.toFixed( 1 ) } m from her centre)` );
	ok( W.toasts.some( ( t ) => /in sight/.test( t ) ) && W.toasts.some( ( t ) => /Alongside/.test( t ) ), 'toasts: in sight, alongside' );
	// swim to her side and climb aboard (the climb rule)
	let k = 0;
	for ( ; k < 400 && ! ( W.player.climb && W.player.climb.kind === 'ship' ); k ++ ) {

		face( W.player, s.x, s.z );
		W.input.keys.add( 'KeyW' );
		W.player.pitch = 0;
		W.frame();

	}

	W.input.keys.delete( 'KeyW' );
	ok( W.player.climb && W.player.climb.kind === 'ship' && W.player.prompt.text === `Climb aboard the ${ s.name }`, `swam to her side (${ ( k * 0.05 ).toFixed( 1 ) } s): "Climb aboard"` );
	pullUp( W );
	W.frame();
	ok( W.player.mode === 'aboard' && W.player.hull === j.hull && j.phase === 'ride' && j.port.id === 'home', 'aboard: bound for the home dock' );
	ok( ! evs( W, 'climbedAboard' ).length, 'the rescue hull is no hijack' );
	const money = W.state.money;
	const t1 = W.run( 300, 0.05, () => j.phase !== 'ride' );
	const dock = WORLD.boatDock.position, stand = WORLD.ports[ 0 ].stand;
	const dd = Math.hypot( W.player.position.x - dock.x, W.player.position.z - dock.z );
	const ds = Math.hypot( j.ship.x - dock.x, j.ship.z - dock.z );
	// (headless there is no pier collider by the dock: the port's stand ashore is the landing then)
	const atStand = Math.hypot( W.player.position.x - stand.x, W.player.position.z - stand.z ) < 0.5;
	ok( W.player.mode === 'walk' && ! W.player.hull && ( dd < 40 || atStand ) && W.player.position.y > 0.2 && ds < 60, `she brought you in after ${ t1.toFixed( 0 ) } s (${ ds.toFixed( 0 ) } m off the dock); set down ${ atStand ? 'at the port stand' : dd.toFixed( 1 ) + ' m from the dock' } (${ W.player.position.y.toFixed( 2 ) } m up)` );
	ok( r.landingSpot( { dock: { position: new E.Vector3( SEA.x, 0, SEA.z ) }, stand: { x: 0, z: 0 } } ) && ( () => { const c = W.colliders.addBox( new E.Vector3( SEA.x + 4, 1.5, SEA.z ), new E.Vector3( 1, 0.2, 1 ), 0, { walkable: true } ); const q = r.landingSpot( { dock: { position: new E.Vector3( SEA.x, 0, SEA.z ) } } ); W.colliders.boxes.splice( W.colliders.boxes.indexOf( c ), 1 ); return Math.abs( q.y - 1.7 ) < 1e-6 && Math.hypot( q.x - SEA.x, q.z - SEA.z ) <= 4; } )(), 'the landing: the jetty deck by the dock when there is one' );
	const del = evs( W, 'rescueDelivered' )[ 0 ];
	ok( del && del.fee === 0 && del.dest === 'dock' && W.state.money === money && r.firstFree === false && W.toasts.some( ( t ) => /No charge this once/.test( t ) ), 'the first rescue is free (campaign)' );
	W.run( RESCUE.leave + 2 );
	ok( ! r.job && ! W.naval.ships.includes( s ) && ! W.marks.has( 'rescue' ), 'she leaves; the blip goes' );

	// a second one is paid, by distance
	W.player.mode = 'swim';
	W.player.position.set( SEA.x, - 0.06, SEA.z );
	r.fire();
	W.run( 100, 0.05, () => r.job.phase !== 'waiting' );
	W.run( 200, 0.05, () => r.job.phase === 'alongside' );
	r.job.ship.speed = 0;
	W.player.boardHull( r.job.hull, 0, 0 );
	const j2 = r.job;
	W.run( 300, 0.05, () => j2.phase !== 'ride' && j2.phase !== 'alongside' && j2.phase !== 'inbound' );
	const paid = evs( W, 'rescueDelivered' )[ 1 ];
	const want = rescueFee( Math.hypot( SEA.x - W.player.position.x, SEA.z - W.player.position.z ) );
	ok( paid && paid.fee === want && W.state.money === money - want && want > 30, `the second costs $${ want } (by distance)` );

}

// ================================================================================================ 6. your boat instead; the tow; the sandbox; no naval
section( '6. to your boat, a tow, the sandbox, open ocean, without naval' );
{

	// your boat afloat elsewhere: ask the coxswain at the stern
	const boat = fakeBoat( SEA.x + 120, SEA.z + 60 );
	const W = world( { mode: 'sandbox', boat, rng: () => 0.5 } );
	const r = W.rescue;
	r.flares = 2;
	r.fire();
	W.run( 100, 0.05, () => r.job.phase !== 'waiting' );
	const j = r.job;
	W.player.boardHull( j.hull, 0, - j.ship.cls.length * 0.35 );
	W.frame();
	W.frame();
	ok( j.phase === 'ride' && W.player.prompt && /take me to my boat/.test( W.player.prompt.text ), 'at the stern: "take me to my boat"' );
	W.input.pressed.add( 'KeyE' );
	W.frame();
	ok( j.dest === 'boat', 'E: bound for your boat' );
	W.run( 300, 0.05, () => j.phase === 'leave' );
	ok( W.player.mode === 'deck' && evs( W, 'rescueDelivered' )[ 0 ].dest === 'boat' && evs( W, 'rescueDelivered' )[ 0 ].fee === 0, 'set aboard your own boat (free in the sandbox)' );

	// adrift: no fuel; the launch comes alongside your boat, you step across, she tows your boat in
	const drift = fakeBoat( SEA.x, SEA.z );
	const D = world( { boat: drift, rng: () => 0.5, money: 1000 } );
	D.rescue.firstFree = false;
	D.state.fuel = 0;
	D.player.boardBoat();
	D.player.update( 0.05 );
	ok( D.rescue.situation() === 'adrift', 'adrift in your boat' );
	D.rescue.flares = 1;
	D.rescue.fire();
	ok( D.rescue.job.tow, 'a tow job' );
	D.run( 100, 0.05, () => D.rescue.job.phase !== 'waiting' );
	D.run( 200, 0.05, () => D.rescue.job.phase === 'alongside' );
	const dj = D.rescue.job;
	ok( dj.phase === 'alongside' && D.rescue._canStepAcross(), 'alongside your boat: E steps across' );
	D.rescue.stepAcross();
	D.frame();
	ok( D.player.mode === 'aboard' && dj.phase === 'ride', 'aboard the launch' );
	D.run( 300, 0.05, () => dj.phase === 'leave' );
	const port = WORLD.ports.find( ( p ) => p.id === 'home' );
	const del = evs( D, 'rescueDelivered' )[ 0 ];
	ok( del && del.tow && del.fee > rescueFee( 0 ) && Math.hypot( drift.position.x - port.dock.position.x, drift.position.z - port.dock.position.z ) < 1 && drift.moored, `your boat towed in and moored at the dock; the fee x1.5 ($${ del && del.fee })` );

	// open ocean, no naval at all: this module sails the merchant itself
	let far = null;
	for ( let rr = 2600; rr < 6000 && ! far; rr += 200 ) for ( let a = 0; a < 16 && ! far; a ++ ) {

		const x = Math.sin( a / 16 * Math.PI * 2 ) * rr, z = Math.cos( a / 16 * Math.PI * 2 ) * rr;
		if ( nearestPort( x, z ).d > RESCUE.portRange && terrain.heightAt( x, z ) < - 20 ) far = { x, z };

	}

	const O = world( { naval: false, at: far, rng: () => 0.5 } );
	O.rescue.flares = 1;
	O.rescue.fire();
	ok( O.rescue.job.plan.ocean && O.rescue.job.delay === 150, 'open ocean: a passing merchant in 150 s' );
	O.run( 160, 0.1, () => O.rescue.job.phase !== 'waiting' );
	const os = O.rescue.job.ship;
	ok( os && O.rescue._ownSim.includes( os ) && Math.abs( Math.hypot( os.x - far.x, os.z - far.z ) - RESCUE.oceanSpawn ) < 1, 'no naval here: the rescue sails her itself, 420 m off' );
	O.run( 240, 0.1, () => O.rescue.job.phase === 'alongside' );
	ok( O.rescue.job.phase === 'alongside', 'and she comes alongside' );

	// a black sail: only the event
	const P = world( { naval: false, rng: () => 0 } );
	P.features.list.set( 'pirates', { module: null, instance: { notorietyLevel: () => 5 } } );
	P.rescue.flares = 1;
	P.rescue.fire();
	P.run( 70, 0.1, () => ! P.rescue.job );
	ok( ! P.rescue.job && evs( P, 'rescueAnswered' ).some( ( e ) => e.by === 'pirate' ), 'notorious: rescueAnswered { by: pirate } and nothing more here' );

}

// ================================================================================================ 7. save
section( '7. save round-trip' );
{

	const W = world( { naval: false } );
	W.rescue.flares = 5;
	W.rescue.firstFree = false;
	W.rescue.stats.fired = 4;
	const d = JSON.parse( JSON.stringify( W.features.toJSON().rescue ) );
	const W2 = world( { naval: false } );
	W2.rescue.fromJSON( d );
	ok( W2.rescue.flares === 5 && W2.rescue.firstFree === false && W2.rescue.stats.fired === 4, 'flares, the free first rescue used, the stats' );
	W2.rescue.fromJSON( { flares: 99, firstFree: 'x', stats: null } );
	ok( W2.rescue.flares === FLARE.max && W2.rescue.firstFree === true, 'garbage is clamped' );
	W2.rescue.reset();
	ok( W2.rescue.flares === 0 && W2.rescue.firstFree && ! W2.rescue.job, 'a new game: none' );
	W2.rescue.dispose();
	ok( W2.player.climbables.length === 0, 'dispose takes the climb provider off the player' );

}

console.log( `\n${ passes } passed, ${ fails } failed` );
process.exit( fails ? 1 : 0 );
