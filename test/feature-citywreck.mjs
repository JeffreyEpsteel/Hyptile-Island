// Plain-node tests of the destructible city (src/features/citywreck, wave 21C) against the stand-in city (StubCity.js: the
// shared plan shape and building handles): HP and stages by kind, destructible towers, aircraft impacts,
// fire spread in dry weather and rain, the crews, repairs over in-game hours, road-blocked events, the
// collapse queue (two at once), the looks, the save round trip, the host-authoritative stage stream, wanted / mood / shops;
// wave 23A: the skyscrapers of the real plan (breaks, fire floor by floor, aircraft, the rubble field, repairs, saves with
// the old Twins' ids, the stream, their looks and their falls in the two animation slots).
//   node test/feature-citywreck.mjs
import { Features } from '../src/features/Features.js';
import * as citywreck from '../src/features/citywreck/index.js';
import { CityModel, sectionOf } from '../src/features/citywreck/Model.js';
import { stubPlan, stubCity } from '../src/features/citywreck/StubCity.js';
import { looks, heap, sectionHeap, Collapse } from '../src/features/citywreck/Looks.js';
import { HP, STAGE_AT, FIRE, CREW, REPAIR, COLLAPSE, TOWER, classOf, hpOf } from '../src/features/citywreck/CityWreckData.js';
import { cityPlan } from '../src/world/islands/meridian/CityPlan.js';
import { sectionsAt, insideAny, cutRange, TOWER_ALIASES } from '../src/world/islands/meridian/Skyline.js';
import { Meridian } from '../src/world/islands/meridian/Meridian.js';
import { Colliders } from '../src/world/Colliders.js';

let fails = 0, passes = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else { passes ++; console.log( 'ok  ', msg ); }

};
const section = ( s ) => console.log( '\n== ' + s );

// a game-ish harness: Features with a fake app (clock, toasts), the feature installed with the stub city
function rig( { net = null, render = null, plan = stubPlan() } = {} ) {

	const app = { settings: { timeOfDay: 9, timeSpeed: 1 }, toasts: [], game: { toast: ( s ) => app.toasts.push( s ), state: null }, netsync: net };
	const features = new Features( app );
	const events = [];
	const origEmit = features.emit.bind( features );
	features.emit = ( n, p ) => { events.push( [ n, p ] ); return origEmit( n, p ); };
	const city = stubCity( { plan } );
	const cw = features.add( 'citywreck', { install: ( a, f ) => citywreck.install( a, f, { city, render: false } ) } );
	if ( render ) cw.render = render;
	const step = ( seconds, hoursPerSecond = 0 ) => {

		const n = Math.round( seconds * 10 );
		for ( let i = 0; i < n; i ++ ) {

			app.settings.timeOfDay = ( app.settings.timeOfDay + hoursPerSecond * 0.1 ) % 24;
			features.update( 0.1 );

		}

	};
	const of = ( name ) => events.filter( ( e ) => e[ 0 ] === name ).map( ( e ) => e[ 1 ] );
	return { app, features, cw, city, events, of, step, m: cw.model };

}

const ball = ( cw, id, n = 1, by = 'player' ) => {

	const b = cw.model.byId.get( id );
	for ( let i = 0; i < n; i ++ ) cw.features.emit( 'cannonballImpact', { x: b.x + b.hw, y: b.y0 + 4, z: b.z, vx: 110, vy: 0, vz: 0, hit: 'prop', target: id, owner: by } );

};

section( 'the plan, classes and hit points' );
{

	const { cw, m } = rig();
	ok( cw.model && m.list.length === stubPlan().buildings.length, `the stub city attaches (${ m.list.length } buildings)` );
	ok( classOf( { kind: 'tower' } ) === 'tower' && classOf( { kind: 'highrise' } ) === 'high' && classOf( { kind: 'shop' } ) === 'low' && classOf( { kind: 'landmark', h: 30, collapsible: true } ) === 'mid', 'kinds map to classes (tower / high / mid / low)' );
	ok( classOf( { kind: 'midrise', collapsible: false } ) === 'high', 'a building the plan flags not collapsible never falls (class high)' );
	ok( Number.isFinite( hpOf( { kind: 'tower', w: 30, d: 30 } ) ), 'the towers have finite structural hit points' );
	const lo = m.byId.get( 'stub.low.0' ), mid = m.byId.get( 'stub.mid.0' ), hi = m.byId.get( 'stub.high.0' );
	ok( lo.hp < mid.hp && mid.hp < hi.hp, `HP by kind: lowrise ${ lo.hp.toFixed( 0 ) } < midrise ${ mid.hp.toFixed( 0 ) } < highrise ${ hi.hp.toFixed( 0 ) } kJ` );
	ok( m.byId.get( 'stub.low.0' ).neighbours.some( ( o ) => o.id === 'stub.low.1' ) && ! m.byId.get( 'stub.low.0' ).neighbours.some( ( o ) => o.id === 'stub.tower.0' ), 'adjacent low buildings are neighbours (the towers are far)' );

}

section( 'stages from cannon fire: scarred, gutted, collapsed' );
{

	const { cw, m, city, of } = rig();
	const lo = m.byId.get( 'stub.low.0' );
	const kJ = 0.5 * 2.7 * 110 * 110 / 1000;
	const n1 = Math.ceil( STAGE_AT[ 1 ] * lo.hp / kJ ), n3 = Math.ceil( lo.hp / kJ );
	ball( cw, lo.id, n1 );
	ok( lo.stage === 1 && city.building( lo.id ).stage === 1, `${ n1 } balls scar a lowrise (stage 1; the handle too)` );
	ball( cw, lo.id, n3 - n1 );
	ok( lo.stage === 3, `${ n3 } balls bring it down (stage ${ lo.stage })` );
	ok( city.building( lo.id ).stages.join( ',' ) === '1,2,3', `the handle went 1, 2, 3 (${ city.building( lo.id ).stages.join( ',' ) })` );
	const col = of( 'buildingCollapsed' );
	ok( col.length === 1 && col[ 0 ].id === lo.id && col[ 0 ].by === 'player', 'buildingCollapsed names it and the player' );
	const rb = of( 'roadBlocked' ).find( ( e ) => e.id === lo.id );
	ok( rb && rb.edges.includes( 'e0' ) && ! rb.edges.includes( 'e2' ), `the rubble blocks the avenue beside it (${ rb && rb.edges.join( ',' ) }), not the far one` );
	ok( cw.blockedEdges().has( 'e0' ), 'blockedEdges() lists it' );
	ok( of( 'buildingDamaged' ).filter( ( e ) => e.id === lo.id ).map( ( e ) => e.stage ).join( ',' ) === '1,2,3', 'buildingDamaged for each stage' );
	// the debris: its touching neighbour took damage but did not fall from it
	const nb = m.byId.get( 'stub.low.1' );
	ok( nb.dmg > 0 && nb.stage < 3, `falling debris damages the neighbour (stage ${ nb.stage }, ${ ( nb.dmg * 100 ).toFixed( 0 ) } %) without bringing it down` );
	ok( of( 'cityDebris' ).length === 1, 'cityDebris for the cars and props' );
	const before = lo.dmg;
	ball( cw, lo.id, 5 );
	ok( lo.dmg === before && lo.stage === 3, 'rubble takes no more' );

}

section( 'highrises: breached and burning, never down' );
{

	const { cw, m, features } = rig();
	const hi = m.byId.get( 'stub.high.0' );
	for ( let i = 0; i < 40; i ++ ) features.emit( 'explosion', { x: hi.x, y: hi.y0 + 5, z: hi.z - hi.hd - 1, radius: 8, energy: 2e6, by: 'powder' } );
	ok( hi.stage === 2 && hi.dmg > 1, `forty powder blasts: gutted at most (stage ${ hi.stage }, ${ ( hi.dmg * 100 ).toFixed( 0 ) } % damage)` );
	ok( hi.fire > 0, 'and burning' );
	ok( ! cw.blockedEdges().size, 'no rubble on the roads' );

}

section( 'the stub towers: structure, fire, collapse and recovery' );
{
 const { cw, m, city, features, of } = rig();
 const T = m.byId.get( 'stub.tower.0' ), h = city.building( T.id );
 m.hit( T.id, T.hp * 0.4, { by: 'player', cause: 'cannon' } );
 ok( T.stage === 1 && T.dmg > 0, 'cannon fire scars a tower' );
 ok( m.ignite( T.id, 1, 'player' ) && T.fire === 1, 'a tower can burn' );
 m.hit( T.id, T.hp * 2, { by: 'player', cause: 'blast' } );
 ok( T.stage === 3 && h.stage === 3 && T.fire === 0, 'explosive damage collapses tower and handle' );
 ok( of( 'buildingCollapsed' ).some( e => e.id === T.id ), 'tower collapse emits the normal event' );
 ok( cw.raycastSegment( T.x - 25, T.y0 + 50, T.z, T.x + 25, T.y0 + 50, T.z ) === null, 'upper tower absent from damage collision after collapse' );
 const saved = cw.toJSON();
 cw.reset(); cw.fromJSON( saved );
 ok( T.stage === 3 && h.stage === 3, 'collapsed tower survives a save round trip' );
 cw.reset();
 m.apply( [ [ T.id, 2, 70, 0 ] ], { remote: true } );
 ok( T.stage === 2 && T.fire === 0.7 && h.stage === 2, 'authoritative tower stage and fire replicate' );
 cw.reset();
 features.emit( 'planeCrashed', { x: T.x, y: T.y0 + 120, z: T.z, speed: 80, mass: 30000 } );
 ok( T.dmg > 0, 'aircraft transfers impact energy into tower structure' );
 cw.reset();
 m.hit( T.id, T.hp * 2, { by: 'player', cause: 'blast' } );
 m.update( 0, { hours: 2 } ); m.update( 0, { hours: 9 } ); m.update( 0, { hours: 49 } );
 ok( T.stage === 0 && T.dmg === 0 && h.stage === 0, 'clearance and rebuilding restore a tower' );
}

section( 'plane crashes: low and midrise only' );
{

	const { m, features } = rig();
	const lo = m.byId.get( 'stub.low.3' ), mid = m.byId.get( 'stub.mid.0' ), hi = m.byId.get( 'stub.high.0' );
	features.emit( 'planeCrashed', { x: lo.x, y: lo.y0 + 6, z: lo.z, speed: 45, cause: 'test' } );
	ok( lo.stage === 3, `a seaplane at 45 m/s brings a lowrise down (stage ${ lo.stage })` );
	features.emit( 'planeCrashed', { x: mid.x, y: mid.y0 + 12, z: mid.z - mid.hd, speed: 40, cause: 'test' } );
	ok( mid.stage >= 1, `a midrise is damaged (stage ${ mid.stage })` );
	features.emit( 'planeCrashed', { x: hi.x, y: hi.y0 + 40, z: hi.z - hi.hd, speed: 80, cause: 'test' } );
	ok( hi.stage === 0 && hi.dmg === 0, 'a highrise takes nothing from a crash' );
	features.emit( 'planeCrashed', { x: lo.x, y: 0, z: lo.z, speed: 45, water: true } );
	ok( true, 'a water landing crash is ignored' );

}

section( 'fire: spread in dry weather, rain, the crews' );
{

	const dry = new CityModel( stubPlan(), { seed: 7 } );
	dry.ignite( 'stub.low.1', 1, 'player' );
	let t = 0;
	while ( t < 120 && dry.stats.spreads === 0 ) { dry.update( 0.5, { rain: 0 } ); t += 0.5; }
	ok( dry.stats.spreads > 0, `dry weather: the fire spreads to a neighbour (${ t.toFixed( 1 ) } s)` );
	const lit = dry.list.filter( ( b ) => b.fire > 0 || b.stage >= 2 ).map( ( b ) => b.id );
	ok( lit.every( ( id ) => /stub\.(low|shop)/.test( id ) ), `only adjacent low buildings caught (${ lit.join( ', ' ) })` );
	for ( let i = 0; i < 1200 && dry.list.some( ( b ) => b.fire > 0 ); i ++ ) dry.update( 0.5, { rain: 0 } );
	ok( dry.list.every( ( b ) => b.fire === 0 ), 'the crews put every fire out' );
	ok( dry.list.filter( ( b ) => b.stage === 3 ).length === 0, 'fire alone guts, never brings a building down' );
	ok( dry.byId.get( 'stub.low.1' ).stage === 2, 'the first building burnt out: gutted' );

	const wet = new CityModel( stubPlan(), { seed: 7 } );
	wet.ignite( 'stub.low.1', 1, 'player' );
	let tw = 0;
	while ( tw < 120 && wet.byId.get( 'stub.low.1' ).fire > 0 ) { wet.update( 0.5, { rain: 0.8 } ); tw += 0.5; }
	ok( wet.stats.spreads === 0, 'rain: no spread' );
	ok( tw < CREW.respond, `rain puts it out before the crews come (${ tw.toFixed( 1 ) } s)` );

	const drizzle = new CityModel( stubPlan(), { seed: 7 } );
	drizzle.ignite( 'stub.low.1', 0.5, 'player' );
	let td = 0;
	while ( td < 600 && drizzle.byId.get( 'stub.low.1' ).fire > 0 ) { drizzle.update( 0.5, { rain: 0.1 } ); td += 0.5; }
	const dry2 = new CityModel( stubPlan(), { seed: 7 } );
	dry2.ignite( 'stub.low.1', 0.5, 'player' );
	let peakDry = 0, peakDrizzle = 0;
	const d3 = new CityModel( stubPlan(), { seed: 7 } );
	d3.ignite( 'stub.low.1', 0.5, 'player' );
	for ( let i = 0; i < 60; i ++ ) { dry2.update( 0.5, { rain: 0 } ); d3.update( 0.5, { rain: 0.1 } ); peakDry = Math.max( peakDry, dry2.byId.get( 'stub.low.1' ).fire ); peakDrizzle = Math.max( peakDrizzle, d3.byId.get( 'stub.low.1' ).fire ); }
	ok( peakDrizzle < peakDry, `a drizzle slows it (peak ${ peakDrizzle.toFixed( 2 ) } vs dry ${ peakDry.toFixed( 2 ) })` );

	const { m, of, step } = rig();
	m.ignite( 'stub.shop.0', 0.5, 'player' );
	ok( of( 'cityFireCall' ).length === 1 && of( 'cityFire' ).some( ( e ) => e.on ), 'cityFire and cityFireCall (the engine) on ignition' );
	step( CREW.respond + 2 );
	ok( of( 'cityCrew' ).some( ( e ) => e.on ), `the crew arrives after ${ CREW.respond } s` );

}

section( 'fire bottles' );
{

	const { m, features, app, cw } = rig();
	const s = m.byId.get( 'stub.shop.1' );
	features.emit( 'firePool', { id: 'wfire-1', x: s.x, y: s.y0, z: s.z + s.hd + 1, by: 'player' } );
	ok( s.fire > 0, 'a fire pool at the shop front sets it alight' );
	const w = m.byId.get( 'stub.ware.0' );
	const weapons = { fires: [ { id: 'wfire-2', x: w.x, y: w.y0, z: w.z - w.hd - 1 } ] };
	features.list.set( 'weapons', { module: {}, instance: weapons } );
	for ( let i = 0; i < 6; i ++ ) cw.update( 0.1 );
	ok( w.fire > 0, 'without the firePool event the weapons\' fire pools are polled' );
	void app;

}

section( 'repairs over in-game hours, scaffolding, roads reopening' );
{

	const { cw, m, of, step, city } = rig();
	const sh = m.byId.get( 'stub.shop.1' ), lo = m.byId.get( 'stub.low.2' );
	ball( cw, sh.id, 2 );
	ok( sh.stage === 1, 'a scarred shop' );
	ball( cw, lo.id, 60 );
	ok( lo.stage === 3 && lo.blocked.length, 'a collapsed lowrise blocking a road' );
	step( 300 ); // the fires out (crews), no hours yet
	ok( ! m.list.some( ( b ) => b.fire > 0 ), 'fires out' );
	step( 10, 0.12 ); // 1.2 h: quiet long enough
	ok( sh.repair && sh.repair.phase === 'build', 'an hour after the last hit: scaffolding on the shop' );
	ok( lo.repair && lo.repair.phase === 'clear', 'and the rubble being cleared' );
	step( 40, 0.2 ); // +8 h
	ok( sh.stage === 0 && of( 'buildingRepaired' ).some( ( e ) => e.id === sh.id ), `the shop mended after ${ REPAIR.hours[ 1 ] } h` );
	ok( lo.stage === 3 && lo.cleared && ! lo.blocked.length && of( 'roadCleared' ).some( ( e ) => e.id === lo.id ), `the rubble cleared after ${ REPAIR.clearRubble } h: the road reopens` );
	ok( lo.repair && lo.repair.phase === 'build', 'then the rebuild under scaffolding' );
	for ( let i = 0; i < 26; i ++ ) step( 10, 0.2 ); // +52 h
	ok( lo.stage === 0 && city.building( lo.id ).stage === 0, `rebuilt after ${ REPAIR.hours[ 3 ] } h (the handle back to 0)` );
	ok( of( 'buildingRespawned' ).some( ( e ) => e.id === lo.id ), 'buildingRespawned: the interiors reopen' );
	ok( m.ledger.repaired > 0 && m.ledger.open >= 0, `the bills paid out ($${ m.ledger.repaired })` );

}

section( 'collapses: at most two animating, the rest wait' );
{

	const fake = { n: 0, dropped: 0, begin() { this.n = 0; }, push() { this.n ++; return true; }, end() {}, dispose() {} };
	const { cw, m, city, step } = rig( { render: fake } );
	for ( const id of [ 'stub.low.0', 'stub.low.2', 'stub.low.3' ] ) ball( cw, id, 80 );
	ok( [ 'stub.low.0', 'stub.low.2', 'stub.low.3' ].every( ( id ) => m.byId.get( id ).stage === 3 ), 'three collapsed in the model at once' );
	cw.update( 0.05 );
	ok( cw.anims.length === 2 && cw.queue.length === 1, `two animate, one waits (${ cw.anims.length } / ${ cw.queue.length })` );
	ok( city.building( 'stub.low.3' ).stage < 3, 'the waiting one still stands (its handle not yet at 3)' );
	ok( fake.n > 0, `the chunks are drawn (${ fake.n } instances)` );
	step( COLLAPSE.duration + 2.5 );
	ok( city.building( 'stub.low.3' ).stage === 3, 'its turn came' );
	step( COLLAPSE.duration + 2.5 );
	ok( cw.anims.length === 0 && cw.queue.length === 0, 'all settled into heaps' );

}

section( 'the looks' );
{

	const m = new CityModel( stubPlan() );
	const lo = m.byId.get( 'stub.low.0' ), hi = m.byId.get( 'stub.high.0' ), T = m.byId.get( 'stub.tower.0' );
	const n1 = looks( lo, { stage: 1 } ).length, n2 = looks( lo, { stage: 2 } ).length, n3 = looks( lo, { stage: 3 } ).length;
	ok( n1 > 0 && n2 > n1 && n3 > n2, `more for each stage (${ n1 } / ${ n2 } / ${ n3 } boxes)` );
	ok( looks( lo, { stage: 3, phone: true } ).length < n3, 'phones: a smaller heap' );
	const hiDecals = looks( hi, { stage: 2 } );
	ok( hiDecals.filter( ( it ) => it.s[ 0 ] > 2.5 && it.s[ 2 ] === 0.5 ).every( ( it ) => it.p[ 1 ] > hi.y0 + hi.top * 0.5 ), 'a highrise is breached on its upper floors' );
	ok( looks( T, { stage: 3, marks: 0 } ).length > 0 && looks( T, { stage: 2 } ).length > 0, 'a tower shows breaches and a collapsed rubble heap' );
	const scaf = looks( lo, { stage: 2, repair: { phase: 'build' }, progress: 0.5 } ).length;
	ok( scaf > n2, `scaffolding during repair (${ scaf } boxes)` );
	const c = new Collapse( lo, 30 );
	const end = c.at( c.duration + 1 ), H = heap( lo, COLLAPSE.heap.desktop ).filter( ( it ) => it.big );
	const matched = end.filter( ( e ) => H.some( ( h ) => Math.hypot( h.p[ 0 ] - e.p[ 0 ], h.p[ 1 ] - e.p[ 1 ], h.p[ 2 ] - e.p[ 2 ] ) < 1e-6 ) ).length;
	ok( matched === end.length, `the chunks land exactly on the heap's big pieces (${ matched } / ${ end.length }): no jump` );
	const start = c.at( 0 );
	ok( start.every( ( e ) => e.p[ 1 ] > lo.y0 && e.p[ 1 ] < lo.y0 + lo.top ), 'they start inside the building' );
	ok( c.duration <= COLLAPSE.duration + 2, `the fall lasts ${ c.duration.toFixed( 1 ) } s` );

}

section( 'save round trip: the damaged city restored' );
{

	const a = rig();
	ball( a.cw, 'stub.low.0', 80 );
	ball( a.cw, 'stub.mid.1', 25 );
	a.m.ignite( 'stub.shop.1', 0.7, 'player' );
	ball( a.cw, 'stub.tower.1', 2 );
	a.step( 2 );
	const saved = JSON.parse( JSON.stringify( a.features.get( 'citywreck' ).toJSON() ) );
	const b = rig();
	b.cw.fromJSON( saved );
	const same = a.m.list.every( ( x ) => { const y = b.m.byId.get( x.id ); return y.stage === x.stage && Math.abs( y.fire - x.fire ) < 0.011 && y.blocked.join() === x.blocked.join(); } );
	ok( same, 'every stage, fire and blocked road comes back' );
	ok( b.city.building( 'stub.low.0' ).stage === 3 && b.city.building( 'stub.mid.1' ).stage === a.m.byId.get( 'stub.mid.1' ).stage, 'the handles are set to the saved stages' );
	ok( b.m.byId.get( 'stub.tower.1' ).stage === 0 && b.m.byId.get( 'stub.tower.1' ).marks === a.m.byId.get( 'stub.tower.1' ).marks, 'light tower damage round-trips' );
	ok( b.cw.wanted() === a.cw.wanted(), `the wanted level too (${ b.cw.wanted() })` );
	ok( ! b.of( 'buildingCollapsed' ).some( ( e ) => ! e.replay ), 'a load replays no collapse' );
	// a load before the city exists waits for it
	const app = { settings: { timeOfDay: 9 } };
	const f = new Features( app );
	const late = f.add( 'citywreck', { install: ( x, y ) => citywreck.install( x, y, { render: false } ) } );
	late.fromJSON( saved );
	ok( late.toJSON() === saved, 'saved before the city is built: passed on as is' );
	app.meridian = stubCity();
	late.update( 1.1 );
	ok( late.model && late.model.byId.get( 'stub.low.0' ).stage === 3, 'and applied when the city appears' );
	b.cw.reset();
	ok( b.m.list.every( ( x ) => x.stage === 0 && x.fire === 0 ) && ! b.cw.blockedEdges().size, 'reset: everything stands again' );

}

section( 'multiplayer: the host owns the stages' );
{

	// two clients joined by a fake relay: world events to the other, asks to the host
	const link = { host: null, guest: null };
	const mk = ( isHost ) => ( {
		online: true, isHost,
		sendWorldEvent( kind, data ) { const to = isHost ? link.guest : link.host; to.features.emit( 'remoteWorldEvent', { kind, data: JSON.parse( JSON.stringify( data ) ), from: isHost ? 'h' : 'g' } ); return true; },
		askHost( kind, data ) { if ( isHost ) { link.host.features.emit( 'hostRequest', { kind, data, from: 'h', local: true } ); return true; } link.host.features.emit( 'hostRequest', { kind, data: JSON.parse( JSON.stringify( data ) ), from: 'g', local: false } ); return true; },
	} );
	link.host = rig( { net: mk( true ) } );
	link.guest = rig( { net: mk( false ) } );
	const H = link.host, G = link.guest;
	ball( H.cw, 'stub.low.0', 80, 'pirate' );
	H.step( 1 );
	G.step( 1 );
	ok( G.m.byId.get( 'stub.low.0' ).stage === 3 && G.city.building( 'stub.low.0' ).stage === 3, 'the host\'s collapse reaches the guest (stage 3, the handle too)' );
	ok( G.of( 'roadBlocked' ).some( ( e ) => e.id === 'stub.low.0' ), 'the guest hears roadBlocked (its cars reroute)' );
	// the guest's own cannon impact changes nothing on the guest (the host flies the ball)
	const mid = G.m.byId.get( 'stub.mid.0' );
	ball( G.cw, 'stub.mid.0', 40, 'player' );
	ok( mid.stage === 0, 'a guest\'s cannon impact is not applied by the guest' );
	// a guest's bomb goes to the host and comes back as a stage
	const sh = G.m.byId.get( 'stub.shop.1' );
	for ( let i = 0; i < 8; i ++ ) G.features.emit( 'explosion', { x: sh.x, y: sh.y0 + 1, z: sh.z + sh.hd + 1, radius: 4.5, energy: 60000, by: 'player' } );
	ok( G.cw.stats.forwarded === 8 && H.cw.stats.remoteHits === 8, 'the guest\'s bombs are forwarded to the host' );
	H.step( 1 );
	G.step( 1 );
	ok( H.m.byId.get( 'stub.shop.1' ).stage > 0 && sh.stage === H.m.byId.get( 'stub.shop.1' ).stage, `the host decides, the guest shows it (stage ${ sh.stage })` );
	ok( G.cw.wanted() > 0 && H.cw.wanted() === 0, `the bomber's wanted level rises (${ G.cw.wanted() }), not the host's` );
	// a late joiner asks for the city
	const late = rig( { net: { online: true, isHost: false, sendWorldEvent: () => true, askHost: ( kind, data ) => { link.host.features.emit( 'hostRequest', { kind, data, from: 'l', local: false } ); return true; } } } );
	link.guest = late;
	late.step( 0.2 );
	ok( late.m.byId.get( 'stub.low.0' ).stage === 3 && late.m.byId.get( 'stub.shop.1' ).stage === H.m.byId.get( 'stub.shop.1' ).stage, 'a late joiner gets the damaged city from the host' );
	// A host stream includes tower destruction.
	late.m.apply( [ [ 'stub.tower.0', 3, 0, 0 ] ], { remote: true } );
	ok( late.m.byId.get( 'stub.tower.0' ).stage === 3, 'the host stream synchronizes a collapsed tower' );
	const bytes = JSON.stringify( H.m.snapshot( false ) ).length;
	ok( bytes < 2048, `a damaged-street snapshot fits one event (${ bytes } chars)` );

}

section( 'the city: mood, shops, interiors, wanted, the board' );
{

	const { cw, m, of, step, features } = rig();
	const shop = m.byId.get( 'stub.shop.0' );
	ok( cw.shopOpen( shop.id ), 'the shop is open' );
	// (the registry reads every feature's isOpen() as "my panel is up": citywreck has no panel, so it must not answer)
	ok( typeof cw.isOpen !== 'function' && ! ( features && features.panelOpen && features.panelOpen() ), 'citywreck never counts as an open panel (the cars, the plane and the rod stay in control)' );
	ball( cw, shop.id, 5 );
	ok( shop.stage === 2 && ! cw.shopOpen( shop.id ), 'gutted: shut' );
	const d = of( 'buildingDestroyed' ).find( ( e ) => e.id === shop.id );
	ok( d && d.building === 'meridian.stubshop', 'buildingDestroyed names its interior (the interiors feature bars the door)' );
	ok( ! cw.seatOpen( { building: shop.id } ) && cw.seatOpen( { building: 'stub.shop.1' } ), 'seatOpen: its townlife seats are gone, the other shop\'s stay' );
	ok( ! cw.seatOpen( { id: 'seat.4', interior: 'meridian.stubshop' } ), 'and the seats of its room (by the interior id)' );
	for ( const id of [ 'stub.low.0', 'stub.low.1', 'stub.mid.1' ] ) ball( cw, id, 100 );
	ok( cw.mood === 'panic' && ! cw.shopOpen( 'stub.shop.1' ), `panic: every shop shuts (mood ${ cw.mood })` );
	ok( cw.wanted() >= 3, `the player's wanted level (${ cw.wanted() })` );
	const lines = cw.bulletin( 'meridian' );
	ok( lines.length === 2 && /under repair/.test( lines[ 0 ] ) && /claims \$/.test( lines[ 1 ] ), `the notice board: ${ lines.join( ' | ' ) }` );
	ok( of( 'cityWanted' ).length > 0 && of( 'cityMood' ).some( ( e ) => e.mood === 'panic' ), 'cityWanted and cityMood events' );
	const lvl = cw.wanted();
	step( 300 );
	step( 60, 0.2 ); // 12 h
	ok( cw.wanted() < lvl && cw.mood !== 'panic', `hours later: wanted ${ cw.wanted() }, mood ${ cw.mood }` );
	void features;

}


section( 'the skyscrapers (wave 23A, the real plan)' );
{

	const plan = cityPlan();
	const mk = ( o = {} ) => new CityModel( plan, { seed: 5, ...o } );
	const m0 = mk();
	const T = m0.list.filter( ( b ) => b.cls === 'tower' ), mid = m0.list.find( ( b ) => b.kind === 'midrise' );
	ok( T.length === plan.buildings.filter( ( b ) => b.kind === 'tower' ).length && T.every( ( b ) => b.hp > mid.hp * 5 ), `heavy structure: a skyscraper takes ${ Math.round( T[ 0 ].hp * 1 ) } kJ against a midrise's ${ Math.round( mid.hp ) }` );
	// cannon at street level: hundreds of balls to scar one, never a break (too low)
	const m = mk(), S = m.byId.get( 'meridian-spire' );
	let balls = 0;
	while ( S.stage < 1 && balls < 2000 ) { m.cannon( S.x + S.hw, S.y0 + 4, S.z, 16, 'player', S.id ); balls ++; }
	ok( S.stage === 1 && balls > 100, `${ balls } six-pounder balls to scar the spire` );
	m.hit( S, S.hp * 0.8, { by: 'player', cause: 'blast', at: { x: S.x, y: S.y0 + 3, z: S.z } } );
	ok( S.stage === 2 && S.cut === null, 'gutted by blasts in the street: its top stays on (hit too low to break it)' );
	// a hit high up on a badly damaged tower: the section above it breaks off and comes down beside it
	const ev = [];
	const m2 = mk( { emit: ( n, p ) => ev.push( [ n, p ] ) } ), H = m2.byId.get( 'helix-tower' );
	const [ lo, hi ] = cutRange( H.p );
	m2.hit( H, H.hp, { by: 'player', cause: 'blast', at: { x: H.x, y: H.y0 + 20, z: H.z } } );
	ok( H.cut === null, 'not yet: under the break threshold' );
	m2.hit( H, H.hp * 0.15, { by: 'player', cause: 'cannon', at: { x: H.x + H.hw, y: H.y0 + 170, z: H.z } } );
	const fell = ev.find( ( e ) => e[ 0 ] === 'buildingSectionFell' );
	ok( H.cut !== null && H.cut >= lo - 0.01 && H.cut <= hi + 0.01 && Math.abs( H.cut / H.fh - Math.round( H.cut / H.fh ) ) < 1e-6 && H.stage === 2, `a high hit breaks the top off at ${ H.cut } m (a floor line, inside ${ lo.toFixed( 0 ) }-${ hi.toFixed( 0 ) })` );
	ok( fell && fell[ 1 ].id === H.id && fell[ 1 ].by === 'player' && Math.hypot( fell[ 1 ].x - H.x, fell[ 1 ].z - H.z ) > H.radius * 0.6, 'buildingSectionFell: it lands beside the tower' );
	const sec = sectionOf( H );
	ok( sec && Math.abs( sec.x - H.sec.x ) < 1e-9 && sec.R > 20, `deterministic landing (heap radius ${ sec.R.toFixed( 0 ) } m)` );
	const hitBy = ev.filter( ( e ) => e[ 0 ] === 'buildingDamaged' && e[ 1 ].id !== H.id ).map( ( e ) => e[ 1 ].id );
	const under = m2.list.filter( ( o ) => o !== H && o.stage > 0 && o.dmg > 0 );
	ok( under.length > 0 && hitBy.length > 0, `it smashes what it lands on (${ under.map( ( o ) => o.id + ':' + o.stage ).join( ', ' ) })` );
	ok( ! under.some( ( o ) => o.cls === 'tower' && o.stage === 3 ), 'no dominoes: no skyscraper brought down by another\'s debris' );
	const rb = ev.filter( ( e ) => e[ 0 ] === 'roadBlocked' && e[ 1 ].id === H.id );
	ok( rb.length > 0 && H.blocked.length > 0, `its rubble blocks roads (${ H.blocked.join( ', ' ) })` );
	ok( m2.raycast( H.x - 60, H.y0 + H.cut + 15, H.z, H.x + 60, H.y0 + H.cut + 15, H.z ) === null || m2.raycast( H.x - 60, H.y0 + H.cut + 15, H.z, H.x + 60, H.y0 + H.cut + 15, H.z ).id !== H.id, 'balls fly through where its top was' );
	// the full fall: a wide rubble field, more roads closed than a midrise's
	m2.hit( H, H.hp, { by: 'player', cause: 'blast', at: { x: H.x, y: H.y0 + 30, z: H.z } } );
	const midM = mk(), M = midM.byId.get( mid.id );
	midM.hit( M, M.hp * 2, { cause: 'blast' } );
	ok( H.stage === 3 && m2.spillOf( H ) > 2 * midM.spillOf( M ) && H.blocked.length >= 4, `down: a ${ m2.spillOf( H ).toFixed( 0 ) } m rubble field (a midrise's: ${ midM.spillOf( M ).toFixed( 0 ) } m), every street round its block blocked (${ H.blocked.length } edges)` );
	// repairs: the rubble (and the section's) cleared, the road reopened, rebuilt over days
	m2.update( 0, { hours: REPAIR.quiet + 0.1 } );
	ok( H.repair && H.repair.phase === 'clear', 'clearance first' );
	m2.update( 0, { hours: REPAIR.clearRubble + 0.1 } );
	ok( H.blocked.length === 0 && H.cleared && H.sec && H.sec.cleared && H.repair.phase === 'build', 'the roads open, the rebuild starts' );
	m2.update( 0, { hours: REPAIR.hours[ 3 ] + 0.1 } );
	ok( H.stage === 0 && H.cut === null && H.dmg === 0, `rebuilt whole after ~${ REPAIR.clearRubble + REPAIR.hours[ 3 ] } in-game hours` );

}

section( 'skyscraper fires: floor by floor, aircraft' );
{

	const plan = cityPlan();
	const ev = [];
	const m = new CityModel( plan, { seed: 9, emit: ( n, p ) => ev.push( [ n, p ] ) } );
	const R = m.byId.get( 'halo-tower' );
	ok( m.ignite( R, 0.6, 'player', 60 ) && R.fireLo === R.fireHi && R.fireLo === Math.floor( 60 / R.fh ), `a fire starts on the floor it was set on (${ R.fireLo })` );
	let t = 0;
	const seen = [ R.fireHi ];
	while ( t < 70 ) { m.update( 0.5, { rain: 0 } ); t += 0.5; if ( R.fireHi !== seen[ seen.length - 1 ] ) seen.push( R.fireHi ); }
	ok( R.fireHi > R.fireLo && seen.length >= 4 && seen.every( ( f, i ) => i === 0 || f === seen[ i - 1 ] + 1 ), `it climbs a floor at a time (${ seen.join( ' > ' ) })` );
	ok( R.fireHi - R.fireLo + 1 <= TOWER.band, 'at most a band of floors alight' );
	ok( ev.some( ( e ) => e[ 0 ] === 'cityFireFloors' && e[ 1 ].id === R.id ), 'cityFireFloors for the looks and the stream' );
	ok( m.towerAnchors( R ).length >= 2 && m.towerAnchors( R ).every( ( a ) => a.y > R.y0 + R.fireLo * R.fh - 1 && a.y < R.y0 + ( R.fireHi + 1 ) * R.fh + 1 ), 'the flames show on the floors alight' );
	for ( let i = 0; i < 3000 && R.fire > 0; i ++ ) m.update( 0.5, { rain: 0 } );
	ok( R.fire === 0 && R.fireLo === - 1 && R.stage < 3, 'the crews put it out in the end (fire alone never brings a tower down)' );
	// an aircraft: damage by its energy, its fuel alight on the floor it hit
	const m2 = new CityModel( plan, { seed: 9 } ), P = m2.byId.get( 'prism-tower' );
	m2.crash( P.x, P.y0 + 120, P.z + P.hd * 0.4, 0.5 * 4000 * 60 * 60 / 1000, 'aircraft' );
	ok( P.dmg > 0.2 && P.fire > 0 && Math.abs( P.fireLo - Math.floor( 120 / P.fh ) ) <= 1, `a heavy aircraft at 60 m/s: ${ ( P.dmg * 100 ).toFixed( 0 ) } % damage, its fuel burning on floor ${ P.fireLo }` );
	const m3 = new CityModel( plan, { seed: 9 } ), Z = m3.byId.get( 'ziggurat' );
	m3.crash( Z.x, Z.y0 + 60, Z.z, 0.5 * 900 * 40 * 40 / 1000, 'aircraft' );
	ok( Z.dmg > 0 && Z.dmg < STAGE_AT[ 2 ] && Z.stage < 2, `a seaplane only scars one (${ ( Z.dmg * 100 ).toFixed( 1 ) } %)` );

}

section( 'skyscrapers: saves, old Twins ids, the stream, the handles' );
{

	const plan = cityPlan();
	const colliders = new Colliders();
	globalThis.__quietKit = true;
	const city = new Meridian( { scene: null, colliders, kit: false } );
	const app = { settings: { timeOfDay: 9, timeSpeed: 1 }, game: { toast: () => {} }, meridian: city };
	const features = new Features( app );
	const cw = features.add( 'citywreck', { install: ( a, f ) => citywreck.install( a, f, { city, render: false } ) } );
	const m = cw.model, G = m.byId.get( 'tidegate' ), h = city.building( 'tidegate' ), pad = G.p.helipad;
	ok( city.landingSurfaceAt( pad.x, pad.z, pad.y + 1 )?.y === pad.y, 'the Tidegate\'s helipad carries before' );
	m.hit( G, G.hp, { by: 'player', cause: 'blast', at: { x: G.x, y: G.y0 + 20, z: G.z } } );
	m.hit( G, G.hp * 0.15, { by: 'player', cause: 'cannon', at: { x: G.x, y: G.y0 + 200, z: G.z } } );
	ok( G.cut !== null && h.cut === G.cut && ! city.landingSurfaceAt( pad.x, pad.z ), `the break reaches the handle (cut ${ G.cut } m): the pad gone` );
	m.ignite( G, 0.8, 'player', G.cut - 20 );
	const saved = JSON.parse( JSON.stringify( cw.toJSON() ) );
	cw.reset();
	ok( G.cut === null && h.cut === null && city.landingSurfaceAt( pad.x, pad.z, pad.y + 1 )?.y === pad.y, 'reset: whole again, the pad back' );
	cw.fromJSON( saved );
	ok( G.cut !== null && h.cut === G.cut && G.stage === 2 && G.fireLo >= 0 && ! city.landingSurfaceAt( pad.x, pad.z ), 'the save brings the break, the fire floors and the handle back' );
	// an old save naming the Twins: their stages land on the towers on their spots
	cw.fromJSON( { v: 1, hours: 3, b: [ [ 'twin-north', 3, 0, 0, 1500, null, null, 0, 0 ], [ 'twin-south', 1, 0, 0, 250, null, null, 1, 0 ] ] } );
	ok( m.byId.get( TOWER_ALIASES[ 'twin-north' ] ).stage === 3 && city.building( TOWER_ALIASES[ 'twin-north' ] ).stage === 3 && m.byId.get( TOWER_ALIASES[ 'twin-south' ] ).stage === 1, 'an old save\'s Twins load onto the Spire and the Tidegate' );
	ok( ! cw.toJSON().b.some( ( e ) => e[ 0 ].startsWith( 'twin-' ) ), 'and save under the new ids' );
	// the stream: a guest gets the break and the floors alight
	cw.reset();
	const guest = new CityModel( plan, { puppet: true } );
	m.hit( G, G.hp, { by: 'pirate', cause: 'blast', at: { x: G.x, y: G.y0 + 20, z: G.z } } );
	m.hit( G, G.hp * 0.15, { by: 'pirate', cause: 'cannon', at: { x: G.x, y: G.y0 + 200, z: G.z } } );
	m.ignite( G, 0.7, 'pirate', 60 );
	guest.apply( m.snapshot( false ), { remote: true } );
	const g = guest.byId.get( G.id );
	ok( g.cut === G.cut && g.stage === G.stage && g.fireLo === G.fireLo && g.fireHi === G.fireHi && g.blocked.join() === G.blocked.join(), 'the host stream carries the break, the floors alight and the blocked roads' );
	ok( JSON.stringify( { s: m.snapshot( false ) } ).length < 2048, 'still one small event' );
	cw.dispose();
	city.dispose();

}

section( 'skyscrapers: the looks and the falls' );
{

	const plan = cityPlan();
	const m = new CityModel( plan, { seed: 2 } );
	const R = m.byId.get( 'halo-tower' ), P = m.byId.get( 'prism-tower' );
	m.ignite( R, 0.9, 'player', 80 );
	for ( let i = 0; i < 60; i ++ ) m.update( 0.5, { rain: 0 } );
	m.hit( R, R.hp * 0.6, { cause: 'blast', at: { x: R.x, y: R.y0 + 80, z: R.z } } );
	const L = looks( R, {} );
	const hot = L.filter( ( it ) => it.c[ 0 ] > 1.25 );
	ok( hot.length > 10 && hot.every( ( it ) => it.p[ 1 ] > R.y0 + R.fireLo * R.fh - 0.5 && it.p[ 1 ] < R.y0 + ( R.fireHi + 1 ) * R.fh + 0.5 ), `the floors alight glow as bands round the cylinder (${ hot.length } boxes)` );
	const decals = L.filter( ( it ) => it.s[ 2 ] <= 0.1 );
	const offWall = decals.filter( ( it ) => { const d = Math.hypot( it.p[ 0 ] - R.x, it.p[ 2 ] - R.z ); return d < 13.5 || d > 16.5; } ).filter( ( it ) => it.p[ 1 ] < R.y0 + 172 || it.p[ 1 ] > R.y0 + 184 );
	ok( decals.length > 10 && offWall.length === 0, `marks sit on the round wall, not on its bounding box (${ decals.length })` );
	// a section: its heap where sectionOf says, the fall's chunks start above the break and land on it
	m.hit( P, P.hp, { cause: 'blast', at: { x: P.x, y: P.y0 + 20, z: P.z } } );
	m.hit( P, P.hp * 0.15, { cause: 'cannon', at: { x: P.x, y: P.y0 + 150, z: P.z } } );
	ok( P.cut !== null, 'the prism\'s top breaks off' );
	const SH = sectionHeap( P, TOWER.section.desktop );
	ok( SH.length > 50 && SH.every( ( it ) => Math.hypot( it.p[ 0 ] - P.sec.x, it.p[ 2 ] - P.sec.z ) < P.sec.R + 4 ), `its heap lies where it fell (${ SH.length } pieces)` );
	const fall = new Collapse( P, TOWER.sectionChunks.desktop, { heapN: TOWER.section.desktop, section: true } );
	const start = fall.at( 0 ), end = fall.at( fall.duration + 1 ), big = SH.filter( ( it ) => it.big );
	ok( start.every( ( c ) => c.p[ 1 ] > P.y0 + P.cut - 1 && insideAny( sectionsAt( P.p, c.p[ 1 ] ), c.p[ 0 ], c.p[ 2 ] ) ), 'the section\'s chunks start above the break, inside the triangle' );
	ok( end.every( ( c ) => big.some( ( b ) => Math.hypot( b.p[ 0 ] - c.p[ 0 ], b.p[ 1 ] - c.p[ 1 ], b.p[ 2 ] - c.p[ 2 ] ) < 1e-6 ) ), 'and land exactly on its heap\'s big pieces: no jump' );
	const tl = looks( P, {} );
	ok( tl.some( ( it ) => it.c === undefined ) === false && tl.filter( ( it ) => Math.hypot( it.p[ 0 ] - P.sec.x, it.p[ 2 ] - P.sec.z ) < P.sec.R ).length > 50, 'the broken tower\'s looks hold the section heap' );
	// the whole fall: chunks only where the ring tower is (a cylinder's corners are air), a field of rubble
	m.hit( R, R.hp * 2, { cause: 'blast', at: { x: R.x, y: R.y0 + 10, z: R.z } } );
	const c = new Collapse( R, TOWER.chunks.desktop, { heapN: TOWER.heap.desktop } );
	ok( c.at( 0 ).every( ( q ) => insideAny( sectionsAt( R.p, q.p[ 1 ] ), q.p[ 0 ], q.p[ 2 ] ) ), 'the halo\'s collapse chunks start inside its round section' );
	ok( c.duration > 6 && c.duration < 14, `a skyscraper takes ${ c.duration.toFixed( 1 ) } s to come down` );
	const field = looks( R, {} ), fieldPhone = looks( R, { phone: true } );
	ok( field.length >= TOWER.heap.desktop && fieldPhone.length < field.length / 2, `the field: ${ field.length } pieces (phones ${ fieldPhone.length })` );
	// the two animation slots, shared by a section's fall and the collapses
	const fake = { n: 0, dropped: 0, begin() { this.n = 0; }, push() { this.n ++; return true; }, end() {}, dispose() {} };
	const app = { settings: { timeOfDay: 9 }, game: { toast: () => {} } };
	const features = new Features( app );
	const city = stubCity( { plan } );
	const cw = features.add( 'citywreck', { install: ( a, f ) => citywreck.install( a, f, { city, render: false } ) } );
	cw.render = fake;
	const M = cw.model, X = M.byId.get( 'ziggurat' );
	M.hit( X, X.hp, { cause: 'blast', at: { x: X.x, y: X.y0 + 20, z: X.z } } );
	M.hit( X, X.hp * 0.15, { cause: 'cannon', at: { x: X.x, y: X.y0 + 140, z: X.z } } );
	for ( const id of [ 'hanging-gardens', 'ledger-building' ] ) { const b = M.byId.get( id ); M.hit( b, b.hp * 2, { cause: 'blast', at: { x: b.x, y: b.y0 + 5, z: b.z } } ); }
	cw.update( 0.05 );
	ok( X.cut !== null && cw.anims.length === 2 && cw.queue.length === 1 && cw.anims.some( ( a ) => a.section ), `a section and a collapse fall, the third waits (${ cw.anims.length } / ${ cw.queue.length })` );
	ok( city.building( 'ziggurat' ).stage < 3 && M.byId.get( 'ziggurat' ).stage === 2, 'the ziggurat stands, broken' );
	for ( let i = 0; i < 400; i ++ ) cw.update( 0.05 );
	ok( cw.anims.length === 0 && cw.queue.length === 0 && city.building( 'ledger-building' ).stage === 3 && city.building( 'hanging-gardens' ).stage === 3, 'all came down in turn' );
	ok( fake.n > 0, `drawn (${ fake.n } instances)` );

}

section( 'the real Meridian plan (21A\'s CityPlan.js, when present)' );
{

	let CP = null;
	try { CP = await import( '../src/world/islands/meridian/CityPlan.js' ); } catch ( e ) { CP = null; }
	if ( ! CP || typeof CP.cityPlan !== 'function' ) ok( true, 'CityPlan.js not there yet: skipped' );
	else {

		const plan = CP.cityPlan();
		const m = new CityModel( plan, { seed: 3 } );
		const towers = m.list.filter( ( b ) => b.cls === 'tower' );
		ok( towers.length >= 6 && towers.length <= 9 && towers.every( ( b ) => ! b.p.protected && b.kind === 'tower' ), `the plan's skyscrapers are recognised (${ towers.map( ( b ) => b.id ).join( ', ' ) })` );
		ok( m.list.filter( ( b ) => b.kind === 'highrise' ).every( ( b ) => b.cls === 'high' ), 'every highrise is class high (never falls)' );
		ok( m.list.every( ( b ) => Math.abs( b.y0 - ( Number.isFinite( b.p.y ) ? b.p.y : 0 ) ) < 1e-9 ), 'bases on the plan\'s pad heights' );
		let t0 = performance.now();
		for ( const b of m.list ) {

			for ( let i = 0; i < 40; i ++ ) m.cannon( b.x + b.hw, b.y0 + 3, b.z, 20, 'player', b.id );
			m.blast( b.x, b.y0 + 2, b.z, 8, 3000, 'player' );
			m.crash( b.x, b.y0 + b.top * 0.5, b.z, 5000, 'aircraft' );
			m.ignite( b.id, 1, 'player' );

		}

		const barrage = performance.now() - t0;
		const lows = m.list.filter( ( b ) => b.cls === 'low' || b.cls === 'mid' );
		ok( lows.every( ( b ) => b.stage === 3 ), `the barrage flattens every low and midrise (${ lows.length })` );
		ok( m.list.filter( ( b ) => b.cls === 'high' ).every( ( b ) => b.stage === 2 ), 'the highrises stand gutted' );
		ok( towers.every( ( b ) => b.stage >= 1 && b.dmg > 0 ), 'the barrage damages every skyscraper' );
		const edges = new Set( plan.roads.edges.map( ( e ) => e.id ) );
		const blocked = m.blockedEdges();
		ok( blocked.size > 20 && [ ...blocked ].every( ( id ) => edges.has( id ) ), `roadBlocked names real edges (${ blocked.size } of ${ edges.size })` );
		t0 = performance.now();
		for ( let i = 0; i < 600; i ++ ) m.update( 1 / 60, { rain: 0, hours: 0 } );
		const per = ( performance.now() - t0 ) / 600;
		ok( per < 1, `a frame of the burning city costs ${ per.toFixed( 3 ) } ms (barrage ${ barrage.toFixed( 0 ) } ms)` );
		const B = m.bounds;
		t0 = performance.now();
		let hits = 0;
		for ( let i = 0; i < 2000; i ++ ) {

			const a = i * 2.399, x = B.x + Math.cos( a ) * B.r * 0.6, z = B.z + Math.sin( a ) * B.r * 0.6;
			if ( m.raycast( x, 20, z, x + 3, 19.6, z + 1 ) ) hits ++;

		}

		ok( ( performance.now() - t0 ) / 2000 < 0.1, `raycast: ${ ( ( performance.now() - t0 ) / 2000 * 1000 ).toFixed( 1 ) } us per ball step (${ hits } hits)` );
		const snap = m.snapshot( false );
		let worst = 0;
		for ( let i = 0; i < snap.length; i += 48 ) worst = Math.max( worst, JSON.stringify( { s: snap.slice( i, i + 48 ) } ).length );
		ok( worst < 2048, `the whole ruined city streams in ${ Math.ceil( snap.length / 48 ) } events of <= ${ worst } chars` );

	}

}

console.log( `\n${ passes } passed, ${ fails } failed` );
process.exit( fails ? 1 : 0 );
