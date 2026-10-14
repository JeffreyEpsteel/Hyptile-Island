// Headless CPU scenarios of the feature update loops (wave 12D): no GPU, no DOM, no GLBs. The feature modules run on
// stand-ins of the App the node tests use (stub avatars and input, the real TerrainData / Colliders / Features), so this
// measures the game logic the browser runs every frame on top of the renderer:
//   naval (12 ships: 4 merchants on the lane, 8 pirates on the patrols, collisions, brains, balls), crew (2 gunners),
//   pirates + boarding, melee (20 raiders in an arena), trade (market ticks, rivals, events), harbour (the residents'
//   schedules) + residents, destruction (Rapier, the port props).
// wave15 (wave 16C): the sea scenario in the two-tile world (TerrainData carries Tidemark's and Blackwater's tiles) with the
//   economy's rivals sailing, the harbour agents, a wanted stolen hull (hijack: the hunters), a rescue under way (a flare
//   answered: the launch or a merchant inbound) and the 12 AI ships.
// wave18 (wave 19A): Tidemark's market square at noon (the two-tile world): wave 18's townsfolk (townlife: 47 people, the
//   NavGrid built before the run, bodies on stand-in avatars), a cutlass drawn (weapons + firearms + melee, no raiders), the
//   harbour and its residents, trade with the rivals, destruction (the Tidemark props) and the 12 AI ships. The player
//   strolls round the square. (TownKit is static draws: nothing on the CPU after its merge.)
// 3600 frames at 60 Hz per scenario. Pass 1 times every module's update (performance.now around each call); pass 2 runs
// a fresh world again and counts the bytes each update allocates (a minor GC before every frame, a 64 MB young
// generation: no collection inside a frame, so heapUsed deltas are the allocations).
//   node tools/perf/cpu-scenarios.mjs [--frames=3600] [--scenario=sea,shore] [--detail] [--no-alloc] [--repeat=3] [--json=out.json] [--trace]
// --detail also times the naval / melee / residents sub-steps. The script restarts itself with --expose-gc.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if ( typeof globalThis.gc !== 'function' ) {

	const r = spawnSync( process.execPath, [ '--expose-gc', '--max-semi-space-size=64', fileURLToPath( import.meta.url ), ...process.argv.slice( 2 ) ], { stdio: 'inherit' } );
	process.exit( r.status ?? 1 );

}

const { performance } = await import( 'node:perf_hooks' );
const { writeFileSync } = await import( 'node:fs' );
const { Vector3, Quaternion, Group, PerspectiveCamera } = await import( '../../src/engine/index.js' );
const { TerrainData } = await import( '../../src/world/TerrainData.js' );
const { Colliders } = await import( '../../src/world/Colliders.js' );
const { WORLD } = await import( '../../src/world/WorldLayout.js' );
const { Residents } = await import( '../../src/world/Residents.js' );
const { Features } = await import( '../../src/features/Features.js' );
const { GameState } = await import( '../../src/game/GameState.js' );
const { Naval } = await import( '../../src/features/naval/Naval.js' );
const { PATROLS, MERCHANT_ROUTE } = await import( '../../src/features/naval/Routes.js' );
const { makeRng } = await import( '../../src/features/naval/util.js' );
const meleeModule = await import( '../../src/features/melee/index.js' );
const boardingModule = await import( '../../src/features/boarding/index.js' );
const piratesModule = await import( '../../src/features/pirates/index.js' );
const crewModule = await import( '../../src/features/crew/index.js' );
const tradeModule = await import( '../../src/features/trade/index.js' );
const harbourModule = await import( '../../src/features/harbour/index.js' );
const destructionModule = await import( '../../src/features/destruction/index.js' );
const agentsModule = await import( '../../src/features/agents/index.js' );
const hijackModule = await import( '../../src/features/hijack/index.js' );
const rescueModule = await import( '../../src/features/rescue/index.js' );
const townlifeModule = await import( '../../src/features/townlife/index.js' );
const weaponsModule = await import( '../../src/features/weapons/index.js' );
const firearmsModule = await import( '../../src/features/firearms/index.js' );
const { ensureTidemark } = await import( '../../src/world/islands/town/TidemarkTerrain.js' );
const { ensureBlackwater } = await import( '../../src/world/islands/BlackwaterTerrain.js' );
const { at: tidemarkAt } = await import( '../../src/world/islands/town/Layout.js' );
const { initPhysics } = await import( '../../src/physics/World.js' );
const { makeDoc } = await import( './fake-dom.mjs' );

const args = Object.fromEntries( process.argv.slice( 2 ).map( ( a ) => {

	const m = /^--([^=]+)(?:=(.*))?$/.exec( a );
	return m ? [ m[ 1 ], m[ 2 ] ?? true ] : [ a, true ];

} ) );
const FRAMES = Number( args.frames ) || 3600;
const DT = 1 / 60;
const SCENARIOS = String( args.scenario || 'sea,shore,wave15,wave18' ).split( ',' );
// --cap=n: naval's awake-ship cap (Quality: Low 8, phones 6; none by default) for the before / after of the cap
const CAP = args.cap !== undefined ? Number( args.cap ) : null;
const DETAIL = !! args.detail;
const terrain = new TerrainData();

// ---------------------------------------------------------------- stand-ins (as test/feature-pirates.mjs, feature-harbour.mjs)

const CLIPS = [ 'Idle_Breathe', 'Walk_InPlace', 'Run_InPlace', 'Melee_Paddle', 'Hit_Reaction', 'Knockdown', 'GetUp_Front', 'Stumble', 'Laugh', 'Look_Around',
	'Swagger_Idle', 'Talk', 'Wave', 'Cheer_Clap', 'Dance', 'Fishing_Hold', 'Fishing_Reel', 'Chat_Gesture', 'Sweep_Work', 'Inspect_Catch', 'Shrug', 'Point',
	'Beckon', 'Prank_Laugh', 'Friendly_Wave', 'Jump' ];

class FakeModel {

	constructor() { this.clips = new Set( CLIPS ); this.cur = null; this.layer = null; this.materials = []; }
	get current() { return this.cur; }
	play( name, { speed = 1, loop = true } = {} ) { if ( name === this.cur && this.layer ) return this.layer; this.cur = name; this.layer = { name, time: 0, speed, ended: false, loop }; return this.layer; }
	update( dt ) { if ( this.layer ) this.layer.time += dt * this.layer.speed; }
	hold() {}

}

function avatarFactory( o = {} ) {

	const model = new FakeModel();
	return { group: new Group(), model, character: o.character, lite: o.lite, visible: true, ready: Promise.resolve( model ), update() {}, dispose() {} };

}

class FakeInput {

	constructor() { this.keys = new Set(); this.pressed = new Set(); this.mouseDown = false; this.rightDown = false; this.enabled = true; }
	down( c ) { return this.keys.has( c ); }
	hit( c ) { return this.pressed.has( c ); }
	endFrame() { this.pressed.clear(); }

}

const store = () => {

	const m = new Map();
	return { getItem: ( k ) => m.has( k ) ? m.get( k ) : null, setItem: ( k, v ) => m.set( k, v ), removeItem: ( k ) => m.delete( k ) };

};

// 20 raiders in a ring round (cx, cz), tiers 1-3, day and night
function arena( cx, cz ) {

	const chars = [ 'bonk', 'doge', 'pengu', 'pepe' ];
	const out = [];
	for ( let i = 0; i < 20; i ++ ) {

		const a = i / 20 * Math.PI * 2, r = 9 + ( i % 3 ) * 4;
		out.push( { id: 'perf' + i, x: cx + Math.cos( a ) * r, z: cz + Math.sin( a ) * r, when: 'day', characters: [ chars[ i % 4 ] ], tier: 1 + ( i % 3 ) } );

	}

	return out;

}

// ---------------------------------------------------------------- the world

const SEA = { x: 40, z: 520 }; // amid the patrols, outside the safe zones
const SHORE = { x: 60, z: - 70 }; // the old camp by the village (residents near)
const SQUARE = tidemarkAt( - 120, 8 ); // Tidemark's market square (wave18)
// the two-tile world for wave18 only (the other scenarios keep the terrain their fingerprints were taken on)
let tileTerrain = null;
const terrainFor = ( scenario ) => {

	if ( scenario !== 'wave18' ) return terrain;
	if ( ! tileTerrain ) { tileTerrain = new TerrainData(); ensureTidemark( tileTerrain ); ensureBlackwater( tileTerrain ); }
	return tileTerrain;

};

async function makeWorld( scenario ) {

	const state = new GameState( store() );
	state.boat = 'lobster'; // two berths: the two gunners
	state.money = 5000;
	state.character = 'hyptile';
	state.unlocked = [ 'hyptile', 'pepe', 'doge', 'pengu', 'bonk' ];
	const wave15 = scenario === 'wave15', wave18 = scenario === 'wave18';
	const terrain = terrainFor( scenario );
	const at = scenario === 'shore' ? SHORE : wave18 ? SQUARE : SEA;
	const atSea = scenario !== 'shore' && ! wave18;
	const player = {
		mode: atSea ? 'boat' : 'walk', camMode: 'third', position: new Vector3( at.x, atSea ? 1 : terrain.heightAt( at.x, at.z ), at.z ), velocity: new Vector3(), yaw: 0, pitch: 0,
		stamina: 1, grounded: true, prompt: null, busy: false, seat: null, action: null, launched: 0,
		leaveHelm() { this.mode = 'deck'; }, groundAt: ( x, z ) => terrain.heightAt( x, z ),
	};
	const boat = {
		position: new Vector3( atSea ? at.x : WORLD.boatDock.position.x, 0, atSea ? at.z : WORLD.boatDock.position.z ), quaternion: new Quaternion(), velocity: new Vector3( 0, 0, atSea ? 3 : 0 ),
		angular: new Vector3(), speed: atSea ? 3 : 0, driven: atSea, moored: ! atSea, enabled: true,
		getYaw() { return 0; }, toWorld( l, out ) { return out.copy( l ).add( this.position ); }, reset() { this.moored = true; },
	};
	const R = new Residents( { scene: { add() {}, remove() {} }, terrain, avatarFactory } );
	const input = new FakeInput();
	const dom = makeDoc();
	const hudEl = dom.doc.createElement( 'div' );
	dom.doc.body.append( hudEl );
	const app = {
		player, input, boatCtl: boat, boat: { dimensions: { length: 8.2, beam: 2.9, draft: 0.85, freeboard: 0.9 } },
		camera: new PerspectiveCamera( 60, 16 / 9, 0.1, 2000 ), scene: null,
		game: { state, hour: wave18 ? 12 : 10, rod: { equipped: false, equip() {} }, toast() {}, cancelLine() {}, contracts: { onCatch() {} }, habitatAtPoint: null },
		terrainData: terrain, colliders: new Colliders(), settings: { timeOfDay: wave18 ? 12 : 10, timeSpeed: 1 }, mode: 'campaign', paused: false, menuOpen: false, freeCam: false,
		avatar: { character: 'hyptile', model: new FakeModel(), playMontage: () => ( { stop() {} } ) }, ui: null, cameraFeel: { kick() { return true; } }, audio: null, query: null, spray: null,
		residents: R,
		netsync: { sendWorldEvent() {} },
	};
	app.camera.position.set( at.x, 6, at.z - 12 );
	const features = new Features( app );
	const add = ( name, mod, opts ) => features.add( name, { install: ( a, f ) => mod.install( a, f, opts ) } );
	const trade = add( 'trade', tradeModule, { seed: 4, toasts: false, stalls: false, ...( wave15 || wave18 ? { rivals: true } : {} ) } );
	const harbour = add( 'harbour', harbourModule, { rng: makeRng( 21 ), toasts: false, audio: false } );
	const melee = add( 'melee', meleeModule, { avatarFactory, doc: dom.doc, hudElement: hudEl, fx: false, seed: 5, captain: false, slots: wave18 ? [] : arena( SHORE.x, SHORE.z ), peaceZone: false,
		audio: { play() { return true; }, lead: () => 0.1, preload() {} } } );
	const naval = features.add( 'naval', { install: ( a, f ) => new Naval( a, f, { seed: 7, doc: dom.doc, models: false, settings: { autoSpawn: false } } ) } );
	const boarding = add( 'boarding', boardingModule, { avatarFactory, doc: dom.doc, hudElement: hudEl, seed: 11 } );
	const pirates = add( 'pirates', piratesModule, { seed: 3, hud: false, avatarFactory } );
	const crew = add( 'crew', crewModule, { rng: makeRng( 11 ), deck: false, doc: dom.doc } );
	const destruction = features.add( 'destruction', destructionModule );
	let agents = null, hijack = null, rescue = null, townlife = null, weapons = null;
	if ( wave18 ) {

		const vfx = {};
		for ( const k of [ 'flash', 'smoke', 'splash', 'dust', 'splinters', 'debris', 'fire', 'stopFire', 'explosion', 'spray', 'bubbles' ] ) vfx[ k ] = () => {};
		features.add( 'vfx', { install: () => vfx } );
		app.game.vendors = [];
		agents = features.add( 'agents', agentsModule );
		const yes = () => true;
		add( 'firearms', firearmsModule, { audio: { report: yes, click: yes }, mesh: false, hud: false, seed: 11 } );
		weapons = add( 'weapons', weaponsModule, { audio: { blast: yes, shatter: yes, hiss: yes, whoosh: yes, clang: yes, thud: yes, report: yes, click: yes }, mesh: false, seed: 11 } );
		townlife = add( 'townlife', townlifeModule, { avatarFactory, rand: makeRng( 18 ) } );

	}

	if ( wave15 ) {

		app.game.vendors = [];
		agents = features.add( 'agents', agentsModule );
		hijack = add( 'hijack', hijackModule, { models: false, seed: 5 } );
		rescue = add( 'rescue', rescueModule, { rng: makeRng( 13 ) } );

	}
	await initPhysics();
	await new Promise( ( r ) => setTimeout( r, 0 ) );

	// 12 ships: 4 merchants along the lane, 8 pirates on the patrol loops (two per loop)
	for ( let i = 0; i < 4; i ++ ) {

		const a = MERCHANT_ROUTE[ i % 3 ], b = MERCHANT_ROUTE[ i % 3 + 1 ];
		naval.spawn( 'trawler', { x: a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * 0.5, z: a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * 0.5, yaw: Math.atan2( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] ), route: MERCHANT_ROUTE, index: i % 3 + 1, speed: 2 } );

	}

	for ( let i = 0; i < 8; i ++ ) {

		const pts = PATROLS[ i % 4 ], k = ( i >> 2 ) * 2 % pts.length, n = ( k + 1 ) % pts.length;
		const kind = i % 3 === 0 ? 'brigantine' : 'sloop';
		naval.spawn( kind, { x: pts[ k ][ 0 ], z: pts[ k ][ 1 ], yaw: Math.atan2( pts[ n ][ 0 ] - pts[ k ][ 0 ], pts[ n ][ 1 ] - pts[ k ][ 1 ] ), route: pts, loop: true, index: n, speed: 4 } );

	}

	if ( wave15 ) {

		// a stolen hull, wanted (her faction keeps sending hunters), and a flare answered near the player
		hijack.vessel = { hull: state.boat, name: 'Perf Prize', kind: 'trawler', faction: 'merchant', port: 'home', at: 8, stolen: true, wanted: true, repaintAt: null, laundered: false, seen: false };
		rescue._dispatch( at.x, at.z, 'adrift' );

	}

	if ( wave18 ) {

		// the cutlass drawn; Tidemark's NavGrid built before the run (it builds in slices as the player nears the town)
		weapons.owned.cutlass = true;
		weapons.melee = 'cutlass';
		weapons.slot( 'melee' );
		for ( let i = 0; i < 2400 && ! townlife.towns.every( ( t ) => t.ready || Math.hypot( t.plan.center.x - at.x, t.plan.center.z - at.z ) > t.plan.radius + 600 ); i ++ ) features.update( DT );

	}

	if ( CAP !== null && naval.setShipCap ) naval.setShipCap( CAP );
	// two crew gunners on the lobster boat, with the swivel gun
	naval.playerGun.owned = true;
	const ctx = crew.ctx ? crew.ctx() : null;
	crew.setPost( 'pepe', 'gunner', ctx );
	crew.setPost( 'pengu', 'gunner', ctx );
	// settle: destruction builds; ashore the camp spawns while the player is 40 m off (raiders appear out of sight), then
	// the player walks in
	if ( ! atSea ) player.position.set( at.x + 40, terrain.heightAt( at.x + 40, at.z ), at.z );
	for ( let i = 0; i < 3; i ++ ) {

		features.update( DT );
		R.update( DT, player );
		await new Promise( ( r ) => setImmediate( r ) );

	}

	if ( ! atSea ) player.position.set( at.x, terrain.heightAt( at.x, at.z ), at.z );
	dom.reset();
	return { app, features, R, naval, melee, trade, harbour, boarding, pirates, crew, destruction, agents, hijack, rescue, townlife, weapons, terrain, scenario, player, boat, input, dom };

}

// ---------------------------------------------------------------- instrumentation

function instrument( w, rec ) {

	const wrap = ( obj, key, name ) => {

		const fn = obj && obj[ key ];
		if ( typeof fn !== 'function' ) return;
		const slot = rec.slot( name );
		obj[ key ] = function () {

			slot.enter();
			try {

				return fn.apply( this, arguments );

			} finally {

				slot.leave();

			}

		};

	};

	for ( const [ name, f ] of w.features.list ) wrap( f.instance, 'update', name );
	wrap( w.R, 'update', 'residents' );
	if ( ! DETAIL ) return;
	for ( const k of [ '_syncBoat', '_refreshTarget', '_gatherTargets', '_updateAim', '_sail', '_avoidance', '_collide', '_checkCripple', '_updateShots', '_updateBalls', '_shipSystems', '_updateLoot', '_playerSystems', '_settleModel' ] ) wrap( w.naval, k, 'naval.' + k );
	for ( const k of [ 'update' ] ) for ( const o of [ w.naval.fx, w.naval.planks, w.naval.wrecks, w.naval.pool ] ) wrap( o, k, 'naval.' + ( o.constructor.name ) );
	for ( const [ k, v ] of Object.entries( w.melee ) ) if ( v && typeof v === 'object' && typeof v.update === 'function' && k !== 'app' && k !== 'features' ) wrap( v, 'update', 'melee.' + k );

}

class Recorder {

	constructor( mode ) {

		this.mode = mode; // 'time' | 'alloc'
		this.slots = new Map();
		this.stack = [];

	}

	slot( name ) {

		let s = this.slots.get( name );
		if ( s ) return s;
		const rec = this;
		s = {
			name, ms: 0, calls: 0, bytes: 0, gcHit: 0, t0: 0, h0: 0, max: 0,
			enter() {

				if ( rec.mode === 'time' ) this.t0 = performance.now();
				else this.h0 = process.memoryUsage().heapUsed;

			},
			leave() {

				this.calls ++;
				if ( rec.mode === 'time' ) {

					const d = performance.now() - this.t0;
					this.ms += d;
					if ( d > this.max ) this.max = d;

				} else {

					const d = process.memoryUsage().heapUsed - this.h0 - rec.overhead;
					if ( d < - 65536 ) this.gcHit ++; // a collection ran inside (the young generation is emptied every frame)
					else if ( d > 0 ) this.bytes += d;

				}

			},
		};
		this.slots.set( name, s );
		return s;

	}

}

async function run( scenario, mode ) {

	const w = await makeWorld( scenario );
	const rec = new Recorder( mode );
	if ( mode === 'alloc' ) {

		// what one empty enter / leave costs in bytes (memoryUsage allocates its result)
		globalThis.gc( { type: 'minor' } );
		const probe = rec.slot( '__probe' );
		rec.overhead = 0;
		for ( let i = 0; i < 200; i ++ ) { probe.enter(); probe.leave(); }
		rec.overhead = probe.bytes / probe.calls;
		rec.slots.delete( '__probe' );

	}

	instrument( w, rec );
	const total = rec.slot( 'frame' );
	const start = { x: w.boat.position.x, z: w.boat.position.z };
	globalThis.gc();
	const heap0 = process.memoryUsage().heapUsed;
	const t0 = performance.now();
	for ( let i = 0; i < FRAMES; i ++ ) {

		if ( mode === 'alloc' ) globalThis.gc( { type: 'minor' } );
		// the player sails a slow circle at sea / strolls about the arena ashore
		const a = i * DT * 0.05;
		if ( scenario === 'wave18' ) {

			const x = SQUARE.x + Math.sin( a * 3 ) * 8, z = SQUARE.z + Math.cos( a * 3 ) * 8;
			w.player.position.set( x, w.terrain.heightAt( x, z ), z );

		} else if ( scenario !== 'shore' ) {

			w.boat.position.set( start.x + Math.sin( a ) * 60, 0, start.z + ( 1 - Math.cos( a ) ) * 60 );
			w.boat.velocity.set( Math.cos( a ) * 3, 0, Math.sin( a ) * 3 );
			w.player.position.set( w.boat.position.x, 1, w.boat.position.z );

		} else {

			const x = SHORE.x + Math.sin( a * 3 ) * 6, z = SHORE.z + Math.cos( a * 3 ) * 6;
			w.player.position.set( x, terrain.heightAt( x, z ), z );

		}

		// a long fight: the hull and the shot locker are topped up (the player would repair / rearm; nobody sinks)
		if ( w.naval.playerHull.hp < w.naval.playerHull.max * 0.5 ) w.naval.playerHull.hp = w.naval.playerHull.max;
		if ( w.naval.ammo.rounds < 4 ) w.naval.ammo.rounds = w.naval.ammo.max;
		w.app.camera.position.set( w.player.position.x, w.player.position.y + 6, w.player.position.z - 12 );
		total.enter();
		w.features.update( DT );
		w.R.update( DT, w.player );
		total.leave();
		w._contacts = ( w._contacts || 0 ) + w.naval.contacts.length;
		if ( w.naval.ships.length > ( w._maxShips || 0 ) ) w._maxShips = w.naval.ships.length;
		if ( ( w.naval._asleep || 0 ) > ( w._maxAsleep || 0 ) ) w._maxAsleep = w.naval._asleep;
		w.input.endFrame();
		if ( args.trace && mode === 'time' && i % 600 === 0 ) console.log( i, JSON.stringify( { hull: w.naval.playerHull, ok: w.naval.target.ok, ships: w.naval.ships.map( ( s ) => `${ s.kind[ 0 ] } ${ s.state } ${ Math.round( Math.hypot( s.x - w.boat.position.x, s.z - w.boat.position.z ) ) }` ) } ) );
		w.app.settings.timeOfDay = ( ( scenario === 'wave18' ? 12 : 10 ) + i * DT / 60 ) % 24; // a game minute per second
		w.app.game.hour = w.app.settings.timeOfDay;

	}

	const wall = performance.now() - t0;
	globalThis.gc();
	const heap1 = process.memoryUsage().heapUsed;
	const out = {};
	for ( const [ name, s ] of rec.slots ) out[ name ] = mode === 'time'
		? { msPerFrame: s.ms / FRAMES, maxMs: s.max, calls: s.calls }
		: { bytesPerFrame: s.bytes / FRAMES, gcHit: s.gcHit };
	const dom = { ...w.dom.counts };
	for ( const k in dom ) dom[ k ] = +( dom[ k ] / FRAMES ).toFixed( 2 );
	const stats = { ships: w.naval.ships.length, alive: w.naval.ships.filter( ( s ) => s.alive ).length, maxShips: w._maxShips || 0, asleep: w._maxAsleep || 0, raiders: w.melee.raiders.length, residents: w.R.list.length, shipShots: w.naval.stats.shots, crewShots: w.naval.crewShots, contacts: w._contacts || 0, hull: Math.round( w.naval.playerHull.hp ) };
	if ( w.townlife ) Object.assign( stats, { townsfolk: w.townlife.towns.reduce( ( n, t ) => n + t.sim.list.length, 0 ), bodies: w.townlife.bound.size, hand: w.weapons.hand + ':' + w.weapons.melee } );
	if ( w.rescue ) Object.assign( stats, { rescue: w.rescue.job ? w.rescue.job.phase : 'none', rivals: w.trade.rivals && w.trade.rivals.snapshot ? JSON.stringify( w.trade.rivals.snapshot() ).length : 0, hunters: w.pirates.retaliation && w.pirates.retaliation.active ? w.pirates.retaliation.active.length : 0 } );
	// a fingerprint of where everything ended up: equal before / after an optimisation = the same behaviour
	let fp = 0;
	for ( const s of w.naval.ships ) fp += s.x * 1.3 + s.z * 1.7 + s.hp * 2.9 + s.yaw;
	for ( const r of w.melee.raiders ) fp += ( r.x || 0 ) * 3.1 + ( r.z || 0 ) * 3.7 + ( r.hp || 0 );
	for ( const r of w.R.list ) fp += ( r.x || 0 ) * 0.7 + ( r.z || 0 ) * 0.9;
	fp += w.naval.playerHull.hp + w.app.game.state.money;
	if ( w.townlife ) for ( const t of w.townlife.towns ) for ( const c of t.sim.list ) fp += ( c.x || 0 ) * 0.11 + ( c.z || 0 ) * 0.13;
	if ( w.rescue && w.rescue.job && w.rescue.job.ship ) fp += w.rescue.job.ship.x * 0.3 + w.rescue.job.ship.z * 0.7;
	stats.fingerprint = fp.toFixed( 6 );
	try { w.features.dispose && w.features.dispose(); } catch ( e ) { /* stand-ins */ }
	return { out, wall, heapGrowth: heap1 - heap0, stats, dom };

}

// ---------------------------------------------------------------- report

// --sites: where the bytes come from (V8's sampling heap profiler, collected objects included), top 30 by self size
if ( args.sites ) {

	const { Session } = await import( 'node:inspector/promises' );
	const session = new Session();
	session.connect();
	for ( const sc of SCENARIOS ) {

		await session.post( 'HeapProfiler.startSampling', { samplingInterval: 512, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true } );
		await run( sc, 'time' );
		const { profile } = await session.post( 'HeapProfiler.stopSampling' );
		const sites = new Map();
		const name = ( f ) => `${ f.functionName || '(anon)' } ${ f.url.replace( /^.*[\/]src[\/]/, 'src/' ) }:${ f.lineNumber + 1 }`;
		// a builtin (Math.hypot, an iterator's next, sort) is named with its caller
		const walk = ( n, parent ) => {

			const f = n.callFrame, key = f.url ? name( f ) : `${ f.functionName } <- ${ parent }`;
			sites.set( key, ( sites.get( key ) || 0 ) + n.selfSize );
			for ( const c of n.children ) walk( c, f.url ? name( f ) : parent );

		};

		walk( profile.head, '' );
		const top = [ ...sites ].sort( ( a, b ) => b[ 1 ] - a[ 1 ] ).slice( 0, Number( args.sites ) || 30 );
		console.log( `
== ${ sc }: allocation sites, KB per frame (sampled)` );
		for ( const [ k, v ] of top ) console.log( ( v / 1024 / FRAMES ).toFixed( 2 ).padStart( 8 ) + '  ' + k );

	}

	process.exit( 0 );

}

const report = { frames: FRAMES, node: process.version, date: new Date().toISOString(), scenarios: {} };
for ( const sc of SCENARIOS ) {

	// the timing pass --repeat times (fresh worlds), each module's median: this machine is shared and noisy
	const reps = [];
	for ( let k = 0; k < ( Number( args.repeat ) || 3 ); k ++ ) reps.push( await run( sc, 'time' ) );
	const t = reps[ 0 ];
	for ( const name of Object.keys( t.out ) ) {

		const v = reps.map( ( r ) => r.out[ name ] ? r.out[ name ].msPerFrame : 0 ).sort( ( a, b ) => a - b );
		t.out[ name ].msPerFrame = v[ v.length >> 1 ];

	}

	const a = args[ 'no-alloc' ] ? null : await run( sc, 'alloc' );
	const rows = Object.keys( t.out ).map( ( name ) => ( { name, ms: t.out[ name ].msPerFrame, max: t.out[ name ].maxMs, kb: a && a.out[ name ] ? a.out[ name ].bytesPerFrame / 1024 : null, gcHit: a && a.out[ name ] ? a.out[ name ].gcHit : null } ) );
	rows.sort( ( x, y ) => ( x.name === 'frame' ) - ( y.name === 'frame' ) || y.ms - x.ms );
	report.scenarios[ sc ] = { rows, wallMs: t.wall, heapGrowthKB: t.heapGrowth / 1024, stats: t.stats, domPerFrame: t.dom };
	console.log( `\n== ${ sc }: ${ FRAMES } frames, ${ ( t.wall / 1000 ).toFixed( 2 ) } s wall, ${ JSON.stringify( t.stats ) }, heap growth ${ ( t.heapGrowth / 1024 ).toFixed( 0 ) } KB` );
	console.log( 'module'.padEnd( 28 ) + 'ms/frame'.padStart( 10 ) + 'max ms'.padStart( 9 ) + 'KB/frame'.padStart( 10 ) );
	console.log( 'HUD DOM writes per frame: ' + JSON.stringify( t.dom ) );
	for ( const r of rows ) console.log( r.name.padEnd( 28 ) + r.ms.toFixed( 4 ).padStart( 10 ) + r.max.toFixed( 2 ).padStart( 9 ) + ( r.kb === null ? '-' : r.kb.toFixed( 2 ) ).padStart( 10 ) + ( r.gcHit ? `  (${ r.gcHit } frames lost to GC)` : '' ) );

}

if ( args.json ) writeFileSync( args.json, JSON.stringify( report, null, '\t' ) );
process.exit( 0 );
