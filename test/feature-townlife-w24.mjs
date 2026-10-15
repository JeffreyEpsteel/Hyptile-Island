// Plain-node tests of wave 24E's town life (src/features/townlife: Places.js, Events.js, Crowd.js, Citizens.js, index.js;
// src/world/wildlife/SeaLife.js): the derived places of every town, the calendar's occasions, the day's new routines (school,
// siesta, the evening walk in pairs, the stall set out in the morning, haggling at the counter), the rain (in out of it, or up
// with the umbrella; the workers on in oilskins; out again after it), a drawn gun (stares, the near ones back off), a ship
// coming in (the quay fills), a fire (a bucket chain from the quay), the catch unloaded from a skiff, a wedding procession,
// the festival's dance, the market day's busier stalls, the crowd figure's budget, the fish and dolphins over deep water
// only, and a deterministic day. No DOM, no GPU.
//   node test/feature-townlife-w24.mjs
import { Vector3, Quaternion } from '../src/engine/index.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { ensureTidemark } from '../src/world/islands/town/TidemarkTerrain.js';
import { ensureBlackwater } from '../src/world/islands/BlackwaterTerrain.js';
import { Features } from '../src/features/Features.js';
import * as townlife from '../src/features/townlife/index.js';
import { townPlans } from '../src/features/townlife/Towns.js';
import { townActivity, validTownSchedule, TOWN_SCHEDULES } from '../src/features/townlife/Citizens.js';
import { townPlaces } from '../src/features/townlife/Places.js';
import { Calendar } from '../src/features/townlife/Events.js';
import { figureGeometry, CROWD_LOOKS } from '../src/features/townlife/Crowd.js';
import { SeaLife } from '../src/world/wildlife/SeaLife.js';
import { FOLK_CHARACTERS } from '../src/world/residents/ResidentData.js';
import { Meridian } from '../src/world/islands/meridian/Meridian.js';
import { cityPlan } from '../src/world/islands/meridian/CityPlan.js';
import { RoadGraph } from '../src/features/cars/RoadGraph.js';
import { TRAFFIC } from '../src/features/cars/CarData.js';
import { Director } from '../src/features/harbour/Schedules.js';

let fails = 0, n = 0;
const ok = ( c, msg, info = '' ) => {

	n ++;
	if ( ! c ) { fails ++; console.log( 'FAIL', msg, info ); } else console.log( 'ok  ', msg, info );

};
const section = ( s ) => console.log( '\n== ' + s );

const terrain = new TerrainData();
ensureTidemark( terrain );
ensureBlackwater( terrain );
globalThis.__quietKit = true;
const meridianCity = new Meridian( { scene: null, terrain, colliders: null, kit: false } );
const plans = townPlans();
const plan = ( id ) => plans.find( ( p ) => p.id === id );

const BASE = [ 'Idle_Breathe', 'Walk_InPlace', 'Run_InPlace', 'Talk', 'Wave', 'Look_Around', 'Cheer_Clap', 'Dance', 'Fishing_Hold', 'Chat_Gesture', 'Inspect_Catch', 'Shrug', 'Point', 'Laugh', 'Friendly_Wave', 'Seated_Idle' ];
function fakeFactory() {

	return ( { character } ) => {

		const model = { clips: new Set( BASE ), current: null, play( name ) { this.current = name; }, update() {}, hold() {} };
		return { character, model, group: { position: new Vector3(), quaternion: new Quaternion(), scale: new Vector3( 1, 1, 1 ), visible: true, updateMatrixWorld() {} }, ready: Promise.resolve( model ), dispose() {} };

	};

}

function seq( seed = 5 ) {

	let a = seed >>> 0;
	return () => {

		a = ( a + 0x6d2b79f5 ) >>> 0;
		let t = a;
		t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
		t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;

	};

}

// a town world: the player at `at` (default the town's centre), a weather stub (rain, day), an optional firearms stub
function world( { town = 'tidemark', hour = 10, rain = 0, day = 1, drawn = false, at = null } = {} ) {

	const P = plan( town );
	const p = at || P.center;
	const app = {
		settings: { timeOfDay: hour }, terrainData: terrain, residents: null, mode: 'campaign',
		game: { toasts: [], toast( t ) { this.toasts.push( t ); } },
		player: { mode: 'walk', position: new Vector3( p.x, terrain.heightAt( p.x, p.z ), p.z ) },
		meridian: meridianCity,
	};
	const features = new Features( app );
	const weather = { rain, day };
	const firearms = { drawn };
	const vfxCalls = [];
	features.list.set( 'weather', { module: {}, instance: weather } );
	features.list.set( 'firearms', { module: {}, instance: firearms } );
	features.list.set( 'vfx', { module: {}, instance: { splash( x, y, z, s ) { vfxCalls.push( [ x, z, s ] ); } } } );
	const tl = townlife.install( app, features, { avatarFactory: fakeFactory(), rand: seq() } );
	features.list.set( 'townlife', { module: townlife, instance: tl } );
	return { app, features, tl, weather, firearms, vfxCalls, sim: tl.sims[ town ], P };

}

async function ready( w ) {

	for ( let k = 0; k < 600 && ( k < 2 || ! w.tl.towns.every( ( t ) => t.ready || ! t.grid ) ); k ++ ) w.tl.update( 0.05 );
	await Promise.resolve();

}

function run( w, seconds, dt = 0.1, each = null ) {

	for ( let t = 0; t < seconds; t += dt ) { w.tl.update( dt ); if ( each ) each( t ); }

}

const outdoors = ( c ) => ! c.hidden && c.indoorFloor === null;

// ---------------------------------------------------------------------------------------------------------------------
section( 'places and schedules' );
{

	for ( const p of plans ) {

		const pl = townPlaces( p );
		ok( pl.quay.length >= 5, `${ p.id }: a quay to gather on (${ pl.quay.length } spots)` );
		ok( pl.walk.length >= 3, `${ p.id }: an evening walk (${ pl.walk.length } points)` );
		ok( pl.school && Number.isFinite( pl.school.x ), `${ p.id }: a school door` );
		ok( Object.values( pl.fronts ).every( ( f ) => f.length === 4 ), `${ p.id }: two at each counter and two behind` );

	}

	ok( townPlaces( plan( 'tidemark' ) ).fest && townPlaces( plan( 'blackwater' ) ).fest, 'Tidemark has a festival square, Blackwater its fire' );
	ok( Object.values( TOWN_SCHEDULES ).every( validTownSchedule ), 'every town schedule is valid (school, siesta, promenade, festival)' );
	ok( townActivity( 'child', 9 ) === 'school' && townActivity( 'child', 15 ) === 'play', 'children: school, then play' );
	ok( townActivity( 'folk', 14 ) === 'siesta' && townActivity( 'folk', 18 ) === 'promenade' && townActivity( 'folk', 20 ) === 'tavern', 'folk: siesta, the evening walk, the tavern' );
	ok( townActivity( 'vendor', 19 ) === 'promenade', 'the vendors walk out after closing' );

}

// ---------------------------------------------------------------------------------------------------------------------
section( 'the calendar' );
{

	const cal = new Calendar();
	const days = [ ...Array( 12 ).keys() ];
	ok( days.filter( ( d ) => cal.at( 'tidemark', d, 10 ).market ).length === 4, 'Tidemark: a market day in three' );
	ok( ! cal.at( 'tidemark', 0, 16 ).market, 'the market is a morning thing' );
	ok( days.filter( ( d ) => cal.at( 'tidemark', d, 21 ).festival ).length === 3 && ! cal.at( 'tidemark', 2, 12 ).festival, 'a festival night in four (nights only)' );
	ok( cal.at( 'tidemark', 1, 0 ).procession === 16 && cal.at( 'home', 3, 0 ).procession === 11, 'processions: Tidemark at four, the village at eleven' );
	ok( cal.at( 'tidemark', 0, 15.5 ).regatta && ! cal.at( 'tidemark', 1, 15.5 ).regatta, 'the regatta: an afternoon in four' );
	ok( cal.force( 'festival', 'home', 10 ) && cal.at( 'home', 0, 12 ).festival, 'a forced occasion is on' );
	cal.tick( 11 );
	ok( ! cal.at( 'home', 0, 12 ).festival, 'and over after its time' );
	ok( ! cal.force( 'circus', 'home' ), 'an unknown occasion is refused' );

}

// ---------------------------------------------------------------------------------------------------------------------
section( 'the day: school, siesta, the evening walk, the stalls' );
{

	const w = world( { hour: 9.5, day: 1 } );
	await ready( w );
	run( w, 200 );
	const kids = w.sim.list.filter( ( c ) => c.role === 'child' );
	ok( kids.length && kids.every( ( c ) => c.act === 'school' ), `the children are at school (${ kids.filter( ( c ) => c.act === 'school' ).length } of ${ kids.length })` );
	ok( kids.filter( ( c ) => c.hidden ).length >= kids.length - 1, 'indoors at it', kids.map( ( c ) => `${ c.hidden ? 'in' : 'out' }:${ c.goal && c.goal.kind }:${ c.moving }:${ Math.hypot( c.x - w.sim.places.school.x, c.z - w.sim.places.school.z ).toFixed( 0 ) }m` ).join( ' ' ) );
	const vendors = w.sim.list.filter( ( c ) => c.role === 'vendor' && c.goal && ( c.goal.kind === 'stall' || c.goal.kind === 'stallSetup' ) );
	ok( vendors.length >= 3, `the vendors keep their stalls (${ vendors.length })` );
	// a customer at a counter: the vendor gestures more (haggling)
	const counters = w.sim.list.filter( ( c ) => c.goal && c.goal.kind === 'browse' && c.goal.look && c.goal.look.gestures.includes( 'Chat_Gesture' ) );
	ok( counters.length >= 1, `customers haggle at the counters (${ counters.length })` );

	w.app.settings.timeOfDay = 6.9;
	const v = w.sim.list.find( ( c ) => c.role === 'vendor' );
	v.setupAt = - 1e9; v.act = null;
	run( w, 2 );
	w.app.settings.timeOfDay = 7.2;
	run( w, 30 );
	ok( v.goal && v.goal.kind === 'stallSetup', 'first thing in the morning the stall is set out', v.goal && v.goal.kind );
	run( w, 60 );
	ok( v.goal && v.goal.kind === 'stall', 'then the vendor keeps it', v.goal && v.goal.kind );

	w.app.settings.timeOfDay = 13.6;
	run( w, 120 );
	const nap = w.sim.list.filter( ( c ) => c.act === 'siesta' );
	ok( nap.length >= 10 && nap.every( ( c ) => c.sitting || c.hidden || c.moving || c.pending || c.path ), `siesta: folk on the benches or at home (${ nap.filter( ( c ) => c.sitting ).length } sitting, ${ nap.filter( ( c ) => c.hidden ).length } in)` );

	w.app.settings.timeOfDay = 17.8;
	run( w, 240 );
	const walkers = w.sim.list.filter( ( c ) => c.act === 'promenade' && c.pair && c.pairLead && c.pair.act === 'promenade' );
	const close = walkers.filter( ( c ) => Math.hypot( c.x - c.pair.x, c.z - c.pair.z ) < 4 );
	ok( walkers.length >= 4 && close.length >= walkers.length * 0.6, `the evening walk in pairs: ${ close.length } of ${ walkers.length } pairs side by side` );
	ok( w.sim.list.some( ( c ) => c.goal && c.goal.kind === 'promenade' && c.moving ), 'and walking' );

}

// ---------------------------------------------------------------------------------------------------------------------
section( 'rain' );
{

	const w = world( { hour: 10.5, day: 1 } );
	await ready( w );
	run( w, 60 );
	const out0 = w.sim.list.filter( ( c ) => outdoors( c ) && ( c.act === 'stroll' || c.act === 'wake' ) ).length;
	w.weather.rain = 0.8;
	run( w, 90 );
	const strollers = w.sim.list.filter( ( c ) => c.act === 'stroll' || c.act === 'wake' );
	const wetOut = strollers.filter( ( c ) => outdoors( c ) && ! c.umbrella && ! c.sheltering );
	ok( out0 >= 8 && wetOut.length <= 1, `in out of the rain: ${ out0 } strolling before, ${ wetOut.length } still out with no umbrella` );
	ok( strollers.filter( ( c ) => c.sheltering ).length >= 5, `gone in (${ strollers.filter( ( c ) => c.sheltering ).length })` );
	ok( strollers.some( ( c ) => c.umbrella && outdoors( c ) ), `umbrellas up (${ strollers.filter( ( c ) => c.umbrella ).length })` );
	ok( ! w.sim.list.some( ( c ) => c.sitting && outdoors( c ) && c.indoorFloor === null && ( c.act === 'stroll' || c.act === 'eat' ) ), 'nobody sits about outside in it' );
	const workers = w.sim.list.filter( ( c ) => c.act === 'work' && ( c.role === 'fisher' || c.role === 'dockworker' ) );
	ok( workers.length && workers.every( ( c ) => c.oilskin ), `the fishers and dockhands work on in oilskins (${ workers.length })` );
	w.weather.rain = 0;
	run( w, 120 );
	ok( ! w.sim.list.some( ( c ) => c.sheltering || c.umbrella || c.oilskin ), 'after it, everyone back out, umbrellas down' );
	ok( w.sim.list.filter( ( c ) => outdoors( c ) && ( c.act === 'stroll' || c.act === 'wake' ) ).length >= out0 * 0.6, 'the streets fill again' );

}

// ---------------------------------------------------------------------------------------------------------------------
section( 'a drawn gun, a ship, a fire, the catch' );
{

	const w = world( { hour: 10.5, day: 1 } );
	await ready( w );
	run( w, 60 );
	// stand the player among people
	const crowd = w.sim.list.filter( ( c ) => outdoors( c ) && ! c.sitting );
	let best = null, bn = 0;
	for ( const c of crowd ) { const k = crowd.filter( ( o ) => Math.hypot( o.x - c.x, o.z - c.z ) < 10 ).length; if ( k > bn ) { bn = k; best = c; } }
	w.app.player.position.set( best.x + 1.5, 0, best.z );
	w.firearms.drawn = true;
	let stared = 0, backed = 0;
	run( w, 3, 0.1, () => { for ( const c of w.sim.list ) { if ( c.react && ( c.react.clip === 'Stare' || c.react.clip === 'Swagger_Idle' ) ) stared ++; if ( c.goal && c.goal.kind === 'backoff' ) backed ++; } } );
	ok( stared > 0, `people turn and stare at the gun (${ bn } near)` );
	ok( w.app.game.toasts.some( ( t ) => /gun|pistol/.test( t ) ) || bn < 3, 'a tip says so (once in a while)' );
	w.firearms.drawn = false;

	const n = w.tl.shipArrived( 'tidemark' );
	ok( n >= 5, `a ship comes in: ${ n } go down to the quay` );
	run( w, 70 );
	const quay = w.sim.list.filter( ( c ) => c.eventRole === 'quay' );
	const Q = w.sim.quaySpots()[ 0 ];
	ok( quay.filter( ( c ) => c.arrived && Math.hypot( c.x - Q.x, c.z - Q.z ) < 12 ).length >= 4, `and stand there watching (${ quay.filter( ( c ) => c.arrived ).length })` );
	run( w, 200 );
	ok( ! w.sim.list.some( ( c ) => c.eventRole === 'quay' ), 'then back to their day' );

	const F = { x: w.P.center.x + 6, z: w.P.center.z + 4 };
	const chain = w.tl.fire( F.x, F.z );
	ok( chain >= 3, `a fire in town: a bucket chain of ${ chain }` );
	run( w, 30 );
	const C = w.sim.chain;
	ok( C && C.members.filter( ( c ) => c.arrived ).length >= chain - 1, 'they line up from the quay to the fire' );
	ok( C && C.members.every( ( c ) => c.bucket ), 'passing buckets' );
	ok( w.vfxCalls.length > 0, `water thrown on it (${ w.vfxCalls.length } splashes)` );
	w.tl.alarm( 'tidemark', 20 );
	ok( w.sim.chain && w.sim.chain.members.every( ( c ) => ! c.fleeing ), 'the chain holds its line through the alarm' );
	run( w, 40 );
	ok( ! w.sim.chain && ! w.sim.list.some( ( c ) => c.bucket ), 'the fire out, the chain breaks up' );

	run( w, 30 );
	const sk = w.P.skiffs[ 0 ];
	const carriers = w.sim.unloadCatch( sk.dock, 2 );
	ok( carriers >= 1, `a skiff in with the catch: ${ carriers } carry it up` );
	let loads = 0;
	run( w, 600, 0.1, () => { for ( const c of w.sim.list ) if ( c.unloadN > 0 && c.loaded ) loads ++; } );
	ok( loads > 0, 'crates carried up to the hall' );
	ok( ! w.sim.list.some( ( c ) => c.unloadN > 0 ), 'and everyone back to work once it is in' );

}

// ---------------------------------------------------------------------------------------------------------------------
section( 'occasions: the procession, the festival, the market day, the regatta' );
{

	const w = world( { hour: 16.1, day: 1 } );
	await ready( w );
	run( w, 30 );
	const E = w.sim.event;
	ok( E && E.kind === 'procession' && E.members.length >= 4, `a wedding procession at four (${ E ? E.members.length : 0 } walking)` );
	ok( w.app.game.toasts.some( ( t ) => /wedding/.test( t ) ), 'announced' );
	let maxK = 0, ended = false;
	run( w, 600, 0.1, () => { if ( w.sim.event ) maxK = Math.max( maxK, w.sim.event.k ); else ended = true; } );
	ok( maxK >= 3, `it winds along its route (${ maxK + 1 } legs)` );
	ok( ended && ! w.sim.list.some( ( c ) => c.eventRole === 'procession' ), 'ends with a cheer and everyone goes on' );
	ok( ! w.sim.event, 'once a day' );

	const f = world( { hour: 21, day: 3 } );
	await ready( f );
	ok( f.tl.startEvent( 'festival', 'tidemark', 600 ), 'a festival night (forced)' );
	run( f, 120 );
	const fest = f.sim.places.fest;
	const dancers = f.sim.list.filter( ( c ) => c.goal && c.goal.kind === 'festival' && c.arrived && Math.hypot( c.x - fest.x, c.z - fest.z ) < 9 );
	ok( f.sim.festival && dancers.length >= 8, `the square dances (${ dancers.length } round it)` );
	ok( dancers.some( ( c ) => c.goal.look.base === 'Dance' ), 'dancers and clapping watchers' );
	ok( f.tl.lights.filter( ( l ) => l.kind === 'festival' ).length >= 3, 'the festival has its lamps' );
	f.weather.rain = 0.9;
	run( f, 60 );
	ok( ! f.sim.festival, 'rain stops the festival' );

	const m0 = world( { hour: 10.5, day: 1 } ), m1 = world( { hour: 10.5, day: 3 } );
	await ready( m0 ); await ready( m1 );
	let b0 = 0, b1 = 0;
	run( m0, 240, 0.1, () => { b0 += m0.sim.list.filter( ( c ) => c.goal && c.goal.kind === 'browse' ).length; } );
	run( m1, 240, 0.1, () => { b1 += m1.sim.list.filter( ( c ) => c.goal && c.goal.kind === 'browse' ).length; } );
	ok( m1.sim.marketDay && ! m0.sim.marketDay && b1 > b0 * 1.3, `a market day fills the stalls (${ ( b1 / 2400 ).toFixed( 1 ) } at them on average, ${ ( b0 / 2400 ).toFixed( 1 ) } on another day)` );

	const r = world( { hour: 15.2, day: 4 } );
	await ready( r );
	run( r, 5 );
	const R = r.tl.regattas.get( 'tidemark' );
	ok( R && R.boats.length === 5, 'regatta day: five dinghies' );
	const x0 = R.boats.map( ( b ) => b.k );
	run( r, 120 );
	ok( R.boats.some( ( b, i ) => b.k !== x0[ i ] ), 'racing round the marks' );
	ok( r.sim.list.filter( ( c ) => c.eventRole === 'quay' ).length >= 4, 'the quay watches' );

}

// ---------------------------------------------------------------------------------------------------------------------
section( 'Meridian: the lights, the bus; the harbour residents in the rain' );
{

	const w = world( { town: 'meridian', hour: 10.5, day: 1 } );
	const g = new RoadGraph( cityPlan().roads, { signal: TRAFFIC.signal } );
	const traffic = { time: 0, cars: [] };
	const sig = [ ...g.nodes.values() ].filter( ( n ) => n.signal ).map( ( n ) => n.id );
	w.features.list.set( 'cars', { module: {}, instance: { graph: g, traffic, busLoop: () => sig } } );
	await ready( w );
	run( w, 2 );
	ok( w.sim.crossings.length >= 6, `crossings at the lights inside the quarter (${ w.sim.crossings.length })` );
	ok( w.sim.busStops.length >= 1, `bus stops (${ w.sim.busStops.length })` );
	const waiting = new Map(), seen = new Set();
	let crossed = 0, onRed = 0, waited = 0;
	run( w, 600, 0.1, () => {

		traffic.time += 0.1;
		for ( const c of w.sim.list ) {

			const k = c.goal && c.goal.kind;
			if ( k === 'crossWait' && c.cross ) { if ( c.arrived && ! seen.has( c ) ) { waited ++; seen.add( c ); } waiting.set( c, c.cross.cr ); }
			else if ( k === 'crossing' && waiting.has( c ) ) {

				const cr = waiting.get( c );
				waiting.delete( c );
				seen.delete( c );
				crossed ++;
				if ( g.light( cr.node, cr.edge, traffic.time ) === 'red' ) onRed ++;

			}

		}

	} );
	ok( waited >= 3 && crossed >= 3, `people wait at the kerb and cross (${ waited } waited, ${ crossed } crossed)` );
	ok( onRed === crossed, `only when their road's traffic has a red light (${ onRed } of ${ crossed })` );

	const stop = w.sim.busStops[ 0 ];
	const rider = w.sim.list.filter( ( c ) => ! c.hidden && c.act === 'stroll' && ! c.eventRole ).sort( ( a, b ) => Math.hypot( a.x - stop.x, a.z - stop.z ) - Math.hypot( b.x - stop.x, b.z - stop.z ) )[ 0 ];
	w.sim._goal( rider, { x: stop.x, z: stop.z, yaw: stop.yaw, look: { base: 'Idle_Breathe', gestures: [] }, kind: 'busWait', stop: stop.node, dwell: 600 } );
	run( w, 240, 0.1, () => { traffic.time += 0.1; } );
	ok( rider.goal.kind === 'busWait' && rider.arrived, 'someone waits at the stop', rider.goal.kind + ' ' + Math.hypot( rider.x - stop.x, rider.z - stop.z ).toFixed( 0 ) + ' m' );
	const n = g.nodes.get( stop.node );
	traffic.cars.push( { id: 'bus1', kind: 'bus', x: n.x - 14, z: n.z, yaw: Math.PI / 2, ai: { v: 0, L: { to: stop.node }, bus: { stopT: 6, i: 0 } } } );
	run( w, 1, 0.1 );
	ok( rider.goal.kind === 'board', 'the bus stops: on they get' );
	run( w, 60, 0.1 );
	ok( rider.hidden, 'and are gone with it' );

	// the harbour's residents (Director): leisure goes in out of the rain, work goes on, out again after it
	const d = new Director( { places: { home: { homes: { h1: { door: { x: 0, z: 0, yaw: 0 } } }, plaza: [ { x: 6, z: 6, yaw: 0 } ] } } } );
	const mk = ( id, role ) => ( { id, port: 'home', role, data: { role, home: 'h1' }, x: 6, z: 6, hidden: false, arrived: true, task: null, setTask( t ) { this.task = t; } } );
	const eater = mk( 'r1', 'merchant' ), worker = mk( 'r2', 'guard' );
	d.tick( [ eater, worker ], 12.5, 10 );
	ok( eater.task && eater.task.id === 'eat', 'a resident eats out at noon', eater.task && eater.task.id );
	d.rain = 0.8;
	d.tick( [ eater, worker ], 12.5, 10 );
	ok( eater.task && eater.task.id === 'shelter' && eater.task.indoors, 'rain: in out of it' );
	ok( ! worker.task || worker.task.id !== 'shelter', 'the watch stays at its post' );
	d.rain = 0;
	d.tick( [ eater, worker ], 12.5, 10 );
	ok( eater.task && eater.task.id === 'eat', 'dry again: back out', eater.task && eater.task.id );

}

// ---------------------------------------------------------------------------------------------------------------------
section( 'the far crowd, the sea, determinism, cost' );
{

	const g = figureGeometry();
	const tris = g.index.count / 3;
	ok( tris < 1300, `a crowd figure: ${ tris } triangles` );
	const codes = new Set( Array.from( g.attributes.aux.array ).filter( ( _, i ) => i % 4 === 3 ).map( ( v ) => Math.round( v ) % 10 ) );
	ok( [ 0, 1, 2, 3, 4, 5, 6, 7, 8 ].every( ( b ) => codes.has( b ) ), 'skinned: root, head, thighs, shins, arms, the umbrella' );
	ok( FOLK_CHARACTERS.every( ( c ) => CROWD_LOOKS[ c ] ) && CROWD_LOOKS.clown, 'every townsfolk character has its far look' );

	const splashes = [];
	const deep = { heightAt: () => - 20 }, land = { heightAt: () => 4 };
	const s = new SeaLife( { terrain: deep, render: false, splash: ( x, y, z, k ) => splashes.push( k ) } );
	let fish = 0, pods = 0;
	for ( let t = 0; t < 900; t += 0.1 ) { s.update( 0.1, { x: 0, z: 0 }, { hour: 10 } ); fish = Math.max( fish, s.fish.length ); pods = Math.max( pods, s.pods.length ); }
	ok( fish > 0 && splashes.some( ( k ) => k < 0.2 ), `fish jump (and splash) over deep water` );
	ok( pods > 0 && splashes.some( ( k ) => k > 0.25 ), 'a pod of dolphins crosses now and then, splashing' );
	const l = new SeaLife( { terrain: land, render: false } );
	for ( let t = 0; t < 900; t += 0.1 ) l.update( 0.1, { x: 0, z: 0 }, { hour: 10 } );
	ok( ! l.fish.length && ! l.pods.length, 'nothing over land' );

	const fp = async () => {

		const w = world( { hour: 15.9, day: 1, rain: 0 } );
		await ready( w );
		run( w, 60 );
		w.weather.rain = 0.7;
		run( w, 60 );
		w.tl.fire( w.P.center.x + 6, w.P.center.z + 4 );
		run( w, 60 );
		return w.sim.list.reduce( ( s, c ) => s + c.x * 0.13 + c.z * 0.07 + ( c.hidden ? 1 : 0 ), 0 ).toFixed( 4 );

	};

	const a = await fp(), b = await fp();
	ok( a === b, `the same day twice: the same town (${ a })` );

	const w = world( { hour: 18, day: 2 } );
	await ready( w );
	run( w, 30 );
	const t0 = performance.now();
	run( w, 30, 1 / 60 );
	const ms = ( performance.now() - t0 ) / ( 30 * 60 );
	ok( ms < 1.5, `townlife's logic at Tidemark in the evening: ${ ms.toFixed( 3 ) } ms a frame (no render)` );

}

console.log( `\n${ n - fails } / ${ n } passed` );
process.exit( fails ? 1 : 0 );
