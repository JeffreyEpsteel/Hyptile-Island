// Plain-node tests of wave 25F's life details (src/features/townlife, src/features/harbour/Schedules.js, src/world/start): idle
// variety (no two neighbours in the same pose), the umbrella held in a hand (contact IK), oilskins out in the rain, the wedding
// couple's clothes, the fish auction at the quay, a town entered mid-day already populated (townlife and the harbour's director),
// and the lantern strings (a catenary, gored paper). No DOM, no GPU.
//   node test/feature-townlife-w25.mjs
import { Vector3, Quaternion } from '../src/engine/index.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { ensureTidemark } from '../src/world/islands/town/TidemarkTerrain.js';
import { ensureBlackwater } from '../src/world/islands/BlackwaterTerrain.js';
import { Features } from '../src/features/Features.js';
import * as townlife from '../src/features/townlife/index.js';
import { townPlans } from '../src/features/townlife/Towns.js';
import { townActivity, validTownSchedule, TOWN_SCHEDULES, poseKey } from '../src/features/townlife/Citizens.js';
import { Kit, sagDrop, sagY, sag, addLantern, addLanternString } from '../src/world/start/Shapes.js';
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

		const model = { clips: new Set( BASE ), current: null, plays: [], play( name, o ) { this.current = name; this.plays.push( [ name, o ] ); }, update() {}, hold() {}, clipDuration() { return 4; } };
		const ik = { targets: null, calls: 0, setTargets( t ) { this.targets = t; this.calls ++; }, setAnchor() {}, dt: 0, enabled: false, footWeight: 0 };
		return { character, model, ik, group: { position: new Vector3(), quaternion: new Quaternion(), scale: new Vector3( 1, 1, 1 ), visible: true, updateMatrixWorld() {}, matrixWorld: { elements: new Float32Array( 16 ) } }, ready: Promise.resolve( model ), dispose() {} };

	};

}

// the instanced lists as counters (townlife draws into them each frame)
function stubMeshes() {

	const lists = {};
	const list = ( k ) => lists[ k ] || ( lists[ k ] = { n: 0, items: [], push( ...a ) { this.n ++; this.items.push( a ); } } );
	for ( const k of [ 'pegs', 'crates', 'barrows', 'lanterns', 'glow', 'skiffs', 'umbrellas', 'buckets', 'bulbs', 'posts', 'dinghies', 'capes', 'gowns', 'coats', 'hats', 'toppers', 'veils' ] ) list( k );
	const M = new Proxy( {}, { get: ( t, k ) => {

		if ( k === 'begin' ) return () => { for ( const l of Object.values( lists ) ) { l.n = 0; l.items.length = 0; } };
		if ( k === 'end' || k === 'dispose' ) return () => {};
		if ( k === 'lists' ) return lists;
		return list( k );

	} } );
	return M;

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

// (the avatars' models arrive on a microtask: loops that need bodies yield each step)
async function runA( w, seconds, dt = 0.1 ) {

	for ( let t = 0; t < seconds; t += dt ) { w.tl.update( dt ); await Promise.resolve(); }

}

function run( w, seconds, dt = 0.1, each = null ) {

	for ( let t = 0; t < seconds; t += dt ) { w.tl.update( dt ); if ( each ) each( t ); }

}

const outdoors = ( c ) => ! c.hidden && c.indoorFloor === null;

// ---------------------------------------------------------------------------------------------------------------------
section( 'idle variety: no two neighbours in the same pose' );
{

	const w = world( { hour: 10.5, day: 1 } );
	await ready( w );
	run( w, 150 );
	w.sim.varyIdles();
	const stand = w.sim.list.filter( ( c ) => c.near && ! c.hidden && c.arrived && ! c.react && ! c.gesture && c.talkT <= 0 && c.goal && c.goal.look && ! c.sitting );
	let pairs = 0, same = 0;
	for ( let i = 0; i < stand.length; i ++ ) for ( let j = i + 1; j < stand.length; j ++ ) {

		if ( Math.hypot( stand[ i ].x - stand[ j ].x, stand[ i ].z - stand[ j ].z ) > 3.2 ) continue;
		pairs ++;
		if ( poseKey( stand[ i ] ) === poseKey( stand[ j ] ) ) same ++;

	}

	ok( stand.length >= 12, `standing citizens exist (${ stand.length } standing, ${ pairs } pairs within 3.2 m)` );
	ok( same === 0, `no pair of neighbours holds the same loop at the same point of it (${ same } of ${ pairs })` );
	const names = new Set( stand.map( ( c ) => c.idleClip() ) );
	ok( names.size >= 4, `the town stands in ${ names.size } different loops`, [ ...names ].join( ' ' ) );
	const phases = new Set( stand.map( ( c ) => Math.floor( c.idlePhase * 8 ) ) );
	ok( phases.size >= 5, `and not in step (${ phases.size } start phases of 8)` );
	const c0 = stand[ 0 ], clip = c0.clip();
	ok( clip.from >= 0 && clip.from < 1 && clip.speed >= 0.9 && clip.speed <= 1.1, 'a standing citizen\'s clip carries its start phase and its own rate', JSON.stringify( clip ) );
	// two forced into the same pose are moved on
	const a = stand[ 0 ], b = stand.find( ( c ) => c !== a );
	b.x = a.x + 1; b.z = a.z; b.idleSeed = a.idleSeed; b.idleVar = a.idleVar; b.idlePhase = a.idlePhase;
	b.goal = { ...b.goal, look: a.goal.look };
	const before = poseKey( b ) === poseKey( a );
	const changed = w.sim.varyIdles();
	ok( before && changed >= 1 && poseKey( b ) !== poseKey( a ), 'two made identical are told apart again' );
	// a crowd of six packed into one spot, all in the same pose: each ends up in its own
	const six = stand.slice( 0, 6 );
	six.forEach( ( c, i ) => { c.x = a.x + ( i % 3 ) * 0.9; c.z = a.z + Math.floor( i / 3 ) * 0.9; c.goal = { ...c.goal, look: a.goal.look }; c.idleSeed = a.idleSeed; c.idleVar = a.idleVar; c.idlePhase = a.idlePhase; } );
	w.sim.varyIdles();
	ok( new Set( six.map( poseKey ) ).size === 6, `six packed together all end up in different poses (${ new Set( six.map( poseKey ) ).size } of 6)` );
	// a body gets the phase when its clip starts (and the facing jitter is bounded)
	const w2 = world( { hour: 10.5, day: 1 } );
	await ready( w2 );
	await runA( w2, 60 );
	const bodies = [ ...w2.tl.bound.values() ].filter( ( b2 ) => b2.model );
	const withFrom = bodies.filter( ( b2 ) => b2.model.plays.some( ( [ n2, o ] ) => o && o.from > 0 ) );
	ok( bodies.length >= 6 && withFrom.length >= bodies.length / 3, `bodies start their standing loops part-way in (${ withFrom.length } of ${ bodies.length })` );
	ok( w2.sim.list.every( ( c ) => Math.abs( c.yawJit ) <= 0.36 ), 'the idle facing jitter stays under 0.36 rad' );

}

// ---------------------------------------------------------------------------------------------------------------------
section( 'rain: umbrellas in the hand (contact IK), oilskins on the hardy' );
{

	const w = world( { hour: 10.5, day: 1 } );
	w.tl.meshes = stubMeshes();
	await ready( w );
	await runA( w, 60 );
	w.weather.rain = 0.8;
	await runA( w, 90 );
	const L = w.sim.list;
	const hardy = L.filter( ( c ) => c.hardy && c.oilskin && ! c.hidden );
	ok( hardy.length >= 2, `some stay out in oilskins (${ hardy.length })` );
	ok( L.filter( ( c ) => c.hardy ).every( ( c ) => ! c.hasUmbrella && c.role !== 'child' ), 'the hardy are never the umbrella holders, nor children' );
	const held = L.filter( ( c ) => c.umbrella && c.body && c.body.model );
	ok( held.length >= 2, `umbrellas up on bound bodies (${ held.length })` );
	ok( held.every( ( c ) => c.body.ikHeld && c.body.avatar.ik.targets && c.body.avatar.ik.targets.rightHand && Number.isFinite( c.body.avatar.ik.targets.rightHand.y ) ), 'each held by the right hand: the IK target is set' );
	const g = held[ 0 ], t = g.body.avatar.ik.targets.rightHand;
	const reach = Math.hypot( t.x - g.x, t.z - g.z );
	ok( t.y - g.y > 1.1 * g.scale && t.y - g.y < 1.5 * g.scale && reach > 0.15 && reach < 0.6, `the grip is at chest-to-head height, ahead and out to the side (${ ( t.y - g.y ).toFixed( 2 ) } m up, ${ reach.toFixed( 2 ) } m out)` );
	const M = w.tl.meshes.lists;
	ok( M.umbrellas && M.umbrellas.n >= 2, `umbrellas drawn (${ M.umbrellas && M.umbrellas.n })` );
	const u = M.umbrellas.items[ 0 ];
	ok( Number.isFinite( u[ 0 ] ) && u[ 1 ] > 1.2, 'the canopy rides over the grip' );
	ok( M.capes && M.capes.n >= 1 && M.hats && M.hats.n >= 2, `oilskin capes and sou-westers drawn (${ M.capes && M.capes.n } capes, ${ M.hats && M.hats.n } hats)` );
	w.weather.rain = 0;
	await runA( w, 120 );
	ok( ! L.some( ( c ) => c.oilskin || c.umbrella ), 'all dry again once it stops' );
	ok( L.filter( ( c ) => c.body && c.body.avatar.ik ).every( ( c ) => ! c.body.ikHeld ), 'and every hand let go' );

}

// ---------------------------------------------------------------------------------------------------------------------
section( 'the wedding couple' );
{

	const w = world( { hour: 11, day: 1 } );
	w.tl.meshes = stubMeshes();
	await ready( w );
	await runA( w, 60 );
	ok( w.tl.startEvent( 'procession', 'tidemark' ), 'a procession starts' );
	const E = w.sim.event;
	{ const b0 = E.members[ 0 ]; w.app.player.position.set( b0.x, terrain.heightAt( b0.x, b0.z ), b0.z ); }
	ok( E && E.members[ 0 ].dress === 'bride' && E.members[ 1 ].dress === 'groom' && E.members.slice( 2 ).every( ( c ) => ! c.dress ), 'the first two are the bride and the groom' );
	await runA( w, 5 );
	const M = w.tl.meshes.lists;
	const bound = E.members.slice( 0, 2 ).filter( ( c ) => c.body && c.body.model );
	ok( bound.length === 2 && M.gowns.n === 1 && M.veils.n === 1 && M.coats.n === 1 && M.toppers.n === 1, `a gown and veil, a coat and a top hat (${ M.gowns.n }, ${ M.veils.n }, ${ M.coats.n }, ${ M.toppers.n })` );
	const members = E.members.slice();
	run( w, 900, 0.25 );
	ok( ! w.sim.event && members.every( ( c ) => ! c.dress ), 'the clothes come off at the end' );

}

function crateCount( w ) {

	return w.tl.meshes.lists.crates ? w.tl.meshes.lists.crates.n : 0;

}

// ---------------------------------------------------------------------------------------------------------------------
section( 'the fish auction' );
{

	for ( const town of [ 'tidemark', 'home' ] ) {

		const w = world( { town, hour: 15.2, day: 1 } );
		w.tl.meshes = stubMeshes();
		await ready( w );
		run( w, 120 );
		const occ = [];
		w.features.on( 'townOccasion', ( e ) => occ.push( e ) );
		const W = w.sim.auctionPlace();
		ok( W && W.ring.length >= 5 && W.crates.length === 3, `${ town }: a lot, a host spot and a fan of bidders (${ W && W.ring.length })` );
		const n = w.sim.auction();
		ok( n >= 4, `${ town }: the host and ${ n - 1 } bidders`, n );
		const A = w.sim.auc;
		ok( A && A.members.every( ( c ) => c.eventRole === 'auction' ) && A.host.goal.kind === 'auction', `${ town }: all of them are in it` );
		run( w, 1 );
		ok( w.tl.occasions[ town ].auction === true, `${ town }: the occasion is on` );
		run( w, 70 );
		ok( A.stage === 'bidding' || A.stage === 'sold', `${ town }: the lots start once the crowd is in (${ A.stage })` );
		const there = A.members.filter( ( c ) => c.arrived );
		ok( there.length >= A.members.length - 1, `${ town }: they have taken their places (${ there.length } of ${ A.members.length })` );
		const h = A.host;
		const dh = Math.hypot( h.x - A.lot.x, h.z - A.lot.z );
		ok( dh > 0.5 && dh < 2.5, `${ town }: the host stands behind the crates (${ dh.toFixed( 1 ) } m)` );
		const off = ( c ) => { const want = Math.atan2( - ( A.lot.x - c.x ), - ( A.lot.z - c.z ) ); return Math.abs( Math.atan2( Math.sin( c.yaw - want ), Math.cos( c.yaw - want ) ) ); };
		const facing = A.members.filter( ( c ) => c !== h && c.arrived ).map( off );
		ok( facing.length >= 3 && facing.every( ( f ) => f < 0.5 ), `${ town }: the bidders face the lot (worst ${ Math.max( ...facing ).toFixed( 2 ) } rad)` );
		ok( crateCount( w ) >= 3, `${ town }: the crates are on the quay (${ crateCount( w ) } drawn)` );
		const gest = new Set();
		run( w, 20, 0.1, () => { for ( const c of A.members ) if ( c.gesture ) gest.add( c.gesture ); } );
		ok( gest.size >= 1, `${ town }: the host calls and the bidders raise a hand (${ [ ...gest ].join( ', ' ) })` );
		run( w, 60 );
		ok( ! w.sim.auc && A.members.every( ( c ) => c.eventRole === null ), `${ town }: over, and everyone back to the day` );
		ok( occ.some( ( e ) => e.kind === 'auction' && e.on ) && occ.some( ( e ) => e.kind === 'auction' && ! e.on ), `${ town }: townOccasion went on and off`, JSON.stringify( occ.map( ( e ) => e.kind + e.on ) ) );

	}

	// a skiff coming back to the dock brings one
	const w = world( { town: 'home', hour: 14.4, day: 1 } );
	await ready( w );
	run( w, 60 );
	const sk = w.tl.towns.find( ( t ) => t.plan.id === 'home' ).skiffs[ 0 ];
	w.app.settings.timeOfDay = sk.back + 0.02;
	w.tl.update( 0.1 );
	ok( sk.phase === 'in', 'the skiff is on its way in' );
	w.app.settings.timeOfDay = sk.back + sk.tr + 0.05;
	w.tl.update( 0.1 );
	ok( sk.phase === 'dock' && !! w.sim.auc, 'it ties up, and the catch goes under the hammer' );
	ok( w.app.game.toasts.some( ( t ) => /hammer/.test( t ) ), 'with a word to the player' );
	// an alarm breaks it up
	w.sim.alarm( null, null, 30 );
	run( w, 1 );
	ok( ! w.sim.auc, 'an alarm breaks it up' );

}

// ---------------------------------------------------------------------------------------------------------------------
section( 'a town entered mid-day is already populated' );
{

	for ( const [ town, hour ] of [ [ 'tidemark', 12.5 ], [ 'home', 12.5 ], [ 'tidemark', 16 ] ] ) {

		const w = world( { town, hour, day: 1 } );
		await ready( w );
		const L = w.sim.list, vis = L.filter( ( c ) => ! c.hidden );
		const atDoor = vis.filter( ( c ) => Math.hypot( c.x - c.home.x, c.z - c.home.z ) < 3 );
		ok( vis.length >= L.length * 0.7 && atDoor.length <= vis.length * 0.15 && ! L.some( ( c ) => c.moving && c.path && c.path.length > 3 && Math.hypot( c.x - c.home.x, c.z - c.home.z ) < 3 ),
			`${ town } ${ hour }: ${ vis.length } of ${ L.length } out, ${ atDoor.length } at their own door, nobody walking out of one` );

	}

	// the harbour's director: a resident it meets for the first time is put at its task; later changes walk
	const { Director } = await import( '../src/features/harbour/Schedules.js' );
	const mk = ( id ) => ( { id, role: 'fisher', port: 'home', data: { role: 'fisher', home: { x: 1, z: 1, yaw: 0 }, spot: { x: 5, z: 5 } }, arrived: true, state: 'idle', hidden: false, farTicks: 0, tasks: [], setTask( t ) { this.tasks.push( t ); }, farTick() { this.farTicks ++; } } );
	const d = new Director( { places: { home: { homes: {}, plaza: [ { x: 9, z: 9, yaw: 0 } ], patio: [], tavern: null, mouth: [] } } } );
	const rs = [ mk( 'a' ), mk( 'b' ) ];
	d.tick( rs, 12.5, 1 );
	ok( rs.every( ( r ) => r.tasks.length === 1 && r.farTicks === 1 ), 'first met: the task is set and reached at once' );
	d.tick( rs, 19.5, 1 );
	ok( rs.every( ( r ) => r.tasks.length === 2 && r.farTicks === 1 ), 'later activity changes are walked (no second snap)' );
	rs.push( mk( 'c' ) );
	d.tick( rs, 19.6, 1 );
	ok( rs[ 2 ].farTicks === 1 && rs[ 0 ].farTicks === 1, 'a resident that joins later is snapped too' );

}

// ---------------------------------------------------------------------------------------------------------------------
section( 'the lantern strings' );
{

	ok( Math.abs( sagDrop( 0.8, 0 ) ) < 1e-9 && Math.abs( sagDrop( 0.8, 1 ) ) < 1e-9 && Math.abs( sagDrop( 0.8, 0.5 ) - 0.8 ) < 1e-9, 'a catenary: zero at the posts, the stated depth in the middle' );
	const parab = ( d, t ) => d * 4 * t * ( 1 - t );
	ok( Math.abs( sagDrop( 1, 0.15 ) - parab( 1, 0.15 ) ) > 0.01 && sagDrop( 1, 0.4 ) < sagDrop( 1, 0.5 ) && sagDrop( 1, 0.1 ) < sagDrop( 1, 0.2 ), 'it is not the parabola, and it falls smoothly toward the middle' );
	const a = new Vector3( 0, 4, 0 ), b = new Vector3( 10, 4.5, 0 );
	const pts = sag( a, b, 1.0 );
	ok( pts.length >= 34 && pts[ 0 ].distanceTo( a ) < 1e-9 && pts[ pts.length - 1 ].distanceTo( b ) < 1e-9, `a 10 m string has a point every 0.3 m (${ pts.length })` );
	const mid = pts[ pts.length >> 1 ];
	ok( Math.abs( mid.y - ( 4.25 - 1.0 ) ) < 0.05, 'its middle hangs a metre under the chord' );
	const kit = new Kit();
	const out = addLanternString( kit, a, b, { depth: 1.0, n: 5, size: 0.2 } );
	ok( out.length === 5 && out.every( ( c ) => c.y < sagY( a, b, 1.0, c.x / 10 ) ), 'five lanterns hang under the line' );
	const body = kit.buckets.get( 'solid' ).find( ( g ) => g.attributes.color && g.attributes.position.count > 150 );
	const col = body.attributes.color;
	let lo = 9, hi = 0;
	for ( let i = 0; i < col.count; i ++ ) { const v = col.getX( i ); lo = Math.min( lo, v ); hi = Math.max( hi, v ); }
	ok( lo / hi < 0.62, `the paper is gored: ribs run darker than the panels (${ ( lo / hi ).toFixed( 2 ) })` );

}

console.log( `\n${ n - fails } / ${ n } passed` );
process.exit( fails ? 1 : 0 );
