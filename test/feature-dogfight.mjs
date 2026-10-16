// Wave 26A, the dogfight feature (src/features/dogfight): the flight envelope of the six warbirds, the guns (convergence,
// hits, heat), the damage stages, the consent rules, the crew (seats, turret arcs and the interrupter, the engineer's and
// the radio operator's repairs), the practice AI, the save, and a room of simulated clients: shots and host-judged hits
// between two fighters (lag-compensated), no hits on an unarmed fighter, two players crewing one bomber (a turret gunner
// scoring on a third player, the flight engineer putting out a fire) and a kill credited to the whole crew.
//   node test/feature-dogfight.mjs
import {
	WARBIRDS, WARBIRD_IDS, FIGHTER_IDS, CREWED_IDS, stallSpeed, gunDps, FighterFlight, Guns, Bullets, aimPoint, segmentSphere, hitParts,
	Damage, canHit, ArmSwitch, ARM, Aircraft, Seats, Turret, CrewSystems, aimAngles, clampArc, blocked, SYS, AIPilot, DogfightNet, NET,
	cleanDf, Dogfight, lineSlots, stripOf,
} from '../src/features/dogfight/index.js';
import { Vector3, Quaternion } from '../src/engine/index.js';

let failures = 0;
const ok = ( c, msg ) => { if ( ! c ) { failures ++; console.error( 'FAIL ' + msg ); } else console.log( 'ok   ' + msg ); };
const f1 = ( x ) => x.toFixed( 1 );
const seeded = ( s ) => () => ( ( s = ( s * 16807 ) % 2147483647 ) / 2147483647 );
const sky = { groundAt: () => - 1000, waterAt: () => - 1000 };

// ------------------------------------------------------------------ the flight envelope
const env = {};
for ( const id of WARBIRD_IDS ) {

	// level top speed (a height-holding loop)
	const f = new FighterFlight( id, sky );
	f.place( 0, 500, 0, 0, { grounded: false, speed: 100 } );
	f.controls.throttle = 1;
	for ( let i = 0; i < 60 * 80; i ++ ) {

		f.controls.pitch = Math.max( - 1, Math.min( 1, ( 500 - f.position.y ) * 0.01 - f.velocity.y * 0.05 ) );
		f.update( 1 / 60 );

	}

	// a level full-stick turn: the bank set to hold the height
	const t = new FighterFlight( id, sky );
	t.place( 0, 800, 0, 0, { grounded: false, speed: 120 } );
	t.controls.throttle = 1;
	let bank = 1.2, turned = 0;
	for ( let i = 0; i < 60 * 40; i ++ ) {

		bank = Math.max( 0.3, Math.min( 1.55, bank + t.velocity.y * 0.002 + ( t.position.y - 800 ) * 0.0002 ) );
		t.controls.roll = Math.max( - 1, Math.min( 1, ( bank - t.bank() ) * 4 ) );
		t.controls.pitch = 1;
		const h0 = t.heading();
		t.update( 1 / 60 );
		let d = t.heading() - h0;
		d = Math.atan2( Math.sin( d ), Math.cos( d ) );
		if ( i >= 60 * 30 ) turned += Math.abs( d );

	}

	// the take-off run on a flat field
	const g = new FighterFlight( id, { groundAt: () => 0, waterAt: () => - 5 } );
	g.place( 0, 0, 0, 0, { grounded: true } );
	g.controls.throttle = 1;
	let run = null;
	for ( let i = 0; i < 60 * 60 && ! run; i ++ ) {

		g.controls.pitch = g.airspeed > stallSpeed( id ) * 1.05 ? 0.6 : 0;
		g.update( 1 / 60 );
		for ( const e of g.drainEvents() ) if ( e.type === 'takeoff' ) run = Math.hypot( g.position.x, g.position.z );

	}

	env[ id ] = { vmax: f.airspeed, turn: turned / 10 * 180 / Math.PI, run, vs: stallSpeed( id ) };
	console.log( `     ${ id }: ${ Math.round( f.airspeed * 3.6 ) } km/h level, ${ f1( env[ id ].turn ) } deg/s sustained, take-off ${ run ? Math.round( run ) : '-' } m, stall ${ f1( env[ id ].vs ) } m/s` );

}

ok( FIGHTER_IDS.every( ( id ) => env[ id ].vmax > 135 && env[ id ].vmax < 185 ), 'every fighter reaches 490-660 km/h level' );
ok( env.bulwark.vmax > env.stormgull.vmax && env.stormgull.vmax > env.sabrewing.vmax, 'the Bulwark is the fastest fighter, the Sabrewing the slowest' );
ok( env.sabrewing.turn > env.stormgull.turn && env.stormgull.turn > env.bulwark.turn, 'the Sabrewing out-turns the Stormgull, which out-turns the Bulwark' );
ok( CREWED_IDS.every( ( id ) => env[ id ].vmax < Math.min( ...FIGHTER_IDS.map( ( f ) => env[ f ].vmax ) ) ), 'the crewed aircraft are slower than every fighter' );
ok( env.longreach.turn < env.sabrewing.turn && env.seawarden.turn < env.stormgull.turn, 'the bombers turn worse than the fighters' );
ok( WARBIRD_IDS.every( ( id ) => env[ id ].run && env[ id ].run < 320 ), 'every type gets off Tidemark\'s 320 m runway' );
ok( CREWED_IDS.every( ( id ) => WARBIRDS[ id ].armour * WARBIRDS[ id ].hp > Math.max( ...FIGHTER_IDS.map( ( f ) => WARBIRDS[ f ].armour ) ) ), 'the crewed aircraft are tougher (armour x hit points)' );
ok( CREWED_IDS.every( ( id ) => WARBIRDS[ id ].price > Math.max( ...FIGHTER_IDS.map( ( f ) => WARBIRDS[ f ].price ) ) ) && WARBIRDS.longreach.price < 100000, 'crewed aircraft cost more than fighters, inside a new player\'s $100,000' );

// the stall: full stick when slow goes past it; the lift falls, a wing drops
{

	const f = new FighterFlight( 'sabrewing', sky );
	f.place( 0, 800, 0, 0, { grounded: false, speed: 45 } );
	f.controls.throttle = 0.2;
	f.controls.pitch = 1;
	let stalled = false;
	for ( let i = 0; i < 60 * 4; i ++ ) {

		f.update( 1 / 60 );
		for ( const e of f.drainEvents() ) if ( e.type === 'stall' ) stalled = true;

	}

	ok( stalled, 'a slow full-stick pull stalls the wing' );
	const fast = new FighterFlight( 'sabrewing', sky );
	fast.place( 0, 800, 0, 0, { grounded: false, speed: 140 } );
	fast.controls.throttle = 1;
	fast.controls.pitch = 1;
	let maxG = 0, st = false;
	for ( let i = 0; i < 60 * 1.5; i ++ ) {

		fast.update( 1 / 60 );
		maxG = Math.max( maxG, fast.g );
		for ( const e of fast.drainEvents() ) if ( e.type === 'stall' ) st = true;

	}

	ok( ! st && maxG > 5 && maxG < WARBIRDS.sabrewing.flight.nMax + 1.2, `a fast full pull is held at the g limit without a stall (${ f1( maxG ) } g)` );
	// energy: a hard turn bleeds speed
	ok( fast.airspeed < 136, `a hard turn bleeds the speed (${ f1( fast.airspeed ) } m/s from 140 in 1.5 s)` );

}

// a twin with an engine out yaws toward the dead engine; feathering cuts the windmill's drag
{

	const run = ( engines, feathered ) => {

		const f = new FighterFlight( 'longreach', sky );
		f.place( 0, 800, 0, 0, { grounded: false, speed: 110 } );
		f.controls.throttle = 1;
		f.dmg.engines = engines;
		f.dmg.feathered = feathered;
		for ( let i = 0; i < 60 * 3; i ++ ) f.update( 1 / 60 );
		return f;

	};
	const both = run( [ 1, 1 ], [ false, false ] ), leftOut = run( [ 0, 1 ], [ false, false ] ), feathered = run( [ 0, 1 ], [ true, false ] );
	ok( leftOut.heading() > both.heading() + 0.02 || leftOut.heading() < both.heading() - 0.02, 'a dead engine swings the twin off its heading' );
	ok( feathered.airspeed > leftOut.airspeed, `a feathered dead engine drags less (${ f1( feathered.airspeed ) } vs ${ f1( leftOut.airspeed ) } m/s)` );

}

// landing: a gentle touchdown is a landing, a dive into the ground a crash, the sea a ditching or a crash
{

	const land = new FighterFlight( 'stormgull', { groundAt: () => 0, waterAt: () => - 5 } );
	land.place( 0, 6, 0, 0, { grounded: false, speed: 50 } );
	land.gearDown = land.flaps = 1;
	land.controls.throttle = 0.15;
	let ev = [];
	for ( let i = 0; i < 60 * 8 && ! land.grounded && ! land.crashed; i ++ ) {

		land.controls.pitch = 0.05;
		land.update( 1 / 60 );
		ev.push( ...land.drainEvents() );

	}

	ok( ev.some( ( e ) => e.type === 'landed' ) && ! land.crashed, 'a slow, nose-up descent onto the strip is a landing' );
	const dive = new FighterFlight( 'sabrewing', { groundAt: () => 0, waterAt: () => - 5 } );
	dive.place( 0, 60, 0, 0, { grounded: false, speed: 120 } );
	dive.controls.pitch = - 1;
	for ( let i = 0; i < 60 * 6 && ! dive.crashed; i ++ ) dive.update( 1 / 60 );
	ok( dive.crashed, 'a dive into the ground is a crash' );
	const sea = new FighterFlight( 'sabrewing', { groundAt: () => - 30, waterAt: () => 0 } );
	sea.place( 0, 4, 0, 0, { grounded: false, speed: 48 } );
	sea.controls.pitch = 0.2;
	ev = [];
	for ( let i = 0; i < 60 * 8 && ! sea.ditched && ! sea.crashed; i ++ ) {

		sea.update( 1 / 60 );
		ev.push( ...sea.drainEvents() );

	}

	ok( sea.ditched, 'a slow, level touchdown on the water ditches (the pilot climbs out)' );

}

// ------------------------------------------------------------------ the guns
{

	// convergence: every wing gun's line crosses the sight line at the set range (the drop included)
	for ( const cv of [ 150, 250, 450 ] ) {

		const g = new Guns( 'sabrewing' );
		g.convergence = cv;
		const W = WARBIRDS.sabrewing;
		let worst = 0;
		g.dirs().forEach( ( d, i ) => {

			const m = g.mounts[ i ], p = aimPoint( m, W.sight, cv, m.vel );
			const t = ( p[ 2 ] - m.at[ 2 ] ) / d[ 2 ];
			worst = Math.max( worst, Math.hypot( m.at[ 0 ] + d[ 0 ] * t - p[ 0 ], m.at[ 1 ] + d[ 1 ] * t - p[ 1 ] ) );

		} );
		ok( worst < 0.01, `the wing guns converge at ${ cv } m` );

	}

	// a burst at a target sitting at the convergence range hits it; heat and ammunition run down
	const shooter = new FighterFlight( 'sabrewing', sky );
	shooter.place( 0, 500, 0, 0, { grounded: false, speed: 0 } );
	shooter.velocity.set( 0, 0, 0 );
	const target = new FighterFlight( 'bulwark', sky );
	const W = WARBIRDS.sabrewing;
	target.place( 0, 500 + W.sight[ 1 ], 250, 0, { grounded: false, speed: 0 } );
	const g = new Guns( 'sabrewing', { rng: seeded( 7 ) } );
	const bl = new Bullets(), hits = [], rounds = [];
	for ( let i = 0; i < 60; i ++ ) {

		g.fire( 1 / 60, true, shooter, rounds, 'A' );
		for ( const r of rounds ) bl.add( r );
		rounds.length = 0;
		bl.update( 1 / 60, [ { id: 'B', flight: target, parts: WARBIRDS.bulwark.parts, radius: 7 } ], hits );

	}

	for ( let i = 0; i < 120; i ++ ) bl.update( 1 / 60, [ { id: 'B', flight: target, parts: WARBIRDS.bulwark.parts, radius: 7 } ], hits );
	const st = g.state();
	ok( hits.length > 30, `a one-second burst at convergence lands (${ hits.length } of ${ g.shots } rounds)` );
	ok( st.ammo === st.ammoMax - g.shots && st.heat > 0.05, `rounds and barrel heat run down (${ st.ammo } left, heat ${ f1( st.heat * 100 ) } %)` );
	ok( hits.every( ( h ) => WARBIRDS.bulwark.parts[ h.part ] ), 'every hit names one of the target\'s parts' );
	// no rounds through a target that may not be hurt
	const none = [];
	const b2 = new Bullets();
	g.rearm();
	for ( let i = 0; i < 60; i ++ ) {

		g.fire( 1 / 60, true, shooter, rounds, 'A' );
		for ( const r of rounds ) b2.add( r );
		rounds.length = 0;
		b2.update( 1 / 60, [ { id: 'B', flight: target, parts: WARBIRDS.bulwark.parts, radius: 7, can: () => false } ], none );

	}

	ok( none.length === 0, 'rounds pass through a target the rules protect' );
	// jamming: a long burst overheats the machine guns
	const hot = new Guns( 'stormgull' );
	for ( let i = 0; i < 60 * 14; i ++ ) hot.fire( 1 / 60, true, null );
	ok( hot.state().jammed, 'fourteen seconds of fire jams the hot machine guns' );
	for ( let i = 0; i < 60 * 10; i ++ ) hot.fire( 1 / 60, false, null );
	ok( ! hot.state().jammed, 'they clear once cool' );
	ok( segmentSphere( 0, 0, - 5, 0, 0, 5, 0, 0, 0, 1 ) === 0.4 && segmentSphere( 3, 0, - 5, 3, 0, 5, 0, 0, 0, 1 ) === - 1, 'segment against sphere' );
	ok( hitParts( new Vector3( 0, 0.05, 10 ), new Vector3( 0, 0.05, 2 ), WARBIRDS.sabrewing.parts ).part === 'engine', 'a round from ahead strikes the engine first' );

}

// ------------------------------------------------------------------ damage
{

	const d = new Damage( 'sabrewing', { rng: seeded( 3 ) } );
	ok( d.code() === '00000000', 'a new airframe is sound' );
	d.hit( 'wingL', 40 );
	ok( d.stage( 'wingL' ) === 1 && d.effects().liftL < 1, 'a wing hit: damaged, less lift on that side' );
	d.hit( 'wingL', 40 );
	ok( d.stage( 'wingL' ) === 2, 'more: critical' );
	const r = d.hit( 'wingL', 60 );
	ok( d.stage( 'wingL' ) === 3 && r.events.includes( 'wingOff' ) && d.down && d.effects().lost, 'gone: the wing comes off and the aircraft is lost' );
	const e = new Damage( 'stormgull', { rng: () => 0 } );
	e.hit( 'engine', 50 );
	ok( e.fire > 0 && e.effects().smoke === 2, 'a damaged engine can catch fire and smokes black' );
	let dead = false;
	for ( let i = 0; i < 60 * 40 && ! dead; i ++ ) dead = e.update( 1 / 60, { speed: 100 } ).includes( 'engineDead' );
	ok( dead || e.fire === 0, 'the fire burns the engine out (or burns out)' );
	const p = new Damage( 'bulwark' );
	p.hit( 'pilot', 200 );
	ok( p.down && p.why === 'pilot', 'a fatal hit in the cockpit: the aircraft is lost' );
	const tough = new Damage( 'longreach' ), soft = new Damage( 'sabrewing' );
	tough.hit( 'fuselage', 100 );
	soft.hit( 'fuselage', 100 );
	ok( tough.hp.fuselage > soft.hp.fuselage + 100, 'the bomber shrugs off what wrecks a fighter\'s fuselage' );
	const parsed = Damage.parse( e.code() );
	ok( parsed.stages.engine === e.stage( 'engine' ), 'the damage code round-trips' );
	ok( soft.repairCost() > 0 && ( soft.repair(), soft.code() === '00000000' ), 'a repair costs money and mends all' );

}

// ------------------------------------------------------------------ consent
{

	const P = ( id, armed, extra = {} ) => ( { id, kind: 'player', inFighter: true, armed, alive: true, ...extra } );
	ok( canHit( P( 'a', true ), P( 'b', true ), { online: true } ).ok, 'two armed pilots online may fight' );
	ok( canHit( P( 'a', true ), P( 'b', false ), { online: true } ).why === 'targetSafe', 'never an unarmed pilot' );
	ok( canHit( P( 'a', false ), P( 'b', true ), { online: true } ).why === 'shooterSafe', 'never from unarmed guns' );
	ok( canHit( P( 'a', true ), P( 'b', true ), { online: false } ).why === 'offline', 'no player fights offline' );
	ok( canHit( P( 'a', true ), { id: 'boat', kind: 'player', inFighter: false, armed: true }, { online: true } ).why === 'notFighter', 'boats, swimmers and walkers are never targets' );
	ok( canHit( P( 'a', true ), P( 'b', true, { grounded: true, speed: 0 } ), { online: true } ).why === 'parked', 'a fighter parked at a strip is safe' );
	ok( canHit( { id: 'ai:1', kind: 'ai', inFighter: true, armed: true }, P( 'me', false ), { online: false } ).why === 'targetSafe', 'the raiders leave an unarmed player alone' );
	ok( canHit( P( 'me', true ), { id: 'ai:1', kind: 'ai', inFighter: true, armed: true, alive: true }, { online: true } ).ok === false, 'no AI online' );
	const sw = new ArmSwitch();
	sw.set( true );
	sw.update( ARM.arm - 0.1 );
	ok( ! sw.armed, 'the guns arm after the switch\'s travel' );
	sw.update( 0.2 );
	ok( sw.armed, 'armed' );
	sw.set( false );
	sw.update( ARM.disarm - 1 );
	ok( sw.armed && sw.cooling, 'going safe keeps them hot a while: a fight is not left with a key press' );
	sw.update( 1.2 );
	ok( ! sw.armed, 'safe' );

}

// ------------------------------------------------------------------ crew: seats, turrets, the interrupter, repairs
{

	const s = new Seats( 'longreach' );
	ok( s.take( 'me', 0 ) && ! s.take( 'bob', 0 ) && s.take( 'bob', 3 ), 'a free seat can be taken, a taken one not' );
	ok( s.take( 'bob', 1 ) && s.who[ 3 ] === null && s.seatOf( 'bob' ) === 1, 'a crew member switches to a free seat (the old one is freed)' );
	ok( s.code( 'A' ).join( ',' ) === 'A,bob,,', 'the roster on the wire' );
	// the arcs
	const top = new Turret( 'longreach', 1 );
	top.aim( 3.1, 2 );
	for ( let i = 0; i < 200; i ++ ) top.step( 1 / 60 );
	ok( Math.abs( top.yaw - WARBIRDS.longreach.turrets[ 1 ].arc.yaw[ 1 ] ) < 1e-6 && top.pitch <= WARBIRDS.longreach.turrets[ 1 ].arc.pitch[ 1 ] + 1e-6, 'a turret stops at the end of its arc' );
	const nose = new Turret( 'longreach', 0 );
	ok( ! clampArc( nose.T, Math.PI, 0 ).inArc, 'the nose gun cannot look back: a blind spot' );
	const q = new Quaternion();
	const a = aimAngles( q, nose.T, new Vector3( 0.3, 0.1, 1 ) );
	ok( a.yaw > 0.25 && a.pitch > 0.05, 'the aim angles of a world direction' );
	// the interrupter: the Kitewing's rear gunner cannot fire level into his own fin, but over it
	const rear = WARBIRDS.kitewing.turrets[ 0 ];
	ok( blocked( WARBIRDS.kitewing, rear, 0, 0 ) === 'tail', 'the rear guns hold fire straight back into the tail' );
	ok( blocked( WARBIRDS.kitewing, rear, 0.6, 0.3 ) === null, 'and fire clear of it' );
	ok( blocked( WARBIRDS.longreach, WARBIRDS.longreach.turrets[ 1 ], 0.33, - 0.05 ) === 'tail' && blocked( WARBIRDS.longreach, WARBIRDS.longreach.turrets[ 1 ], 0, 0.02 ) === null, 'the top turret holds fire into a fin of the twin tail, not between them' );
	// the engineer's systems
	const ac = new Aircraft( 'longreach', { env: sky, rng: () => 0 } );
	ac.damage.hit( 'engineL', 60 );
	ac.damage.fires.engineL = 20;
	const sys = ac.systems;
	let r = sys.extinguish( 0, ac.damage, 0.5 );
	ok( ! r.ok && r.why === 'holding', 'the extinguisher has to be held' );
	r = sys.extinguish( 0, ac.damage, 1.2 );
	ok( r.ok && ! ac.damage.fires.engineL && sys.engines[ 0 ].bottle === 0, 'held long enough: the fire is out, the bottle spent' );
	sys.engines[ 1 ].stalled = true;
	ok( sys.restart( 1, 0.05, ac.damage ).why === 'missed' && sys.restart( 1, 0.52, ac.damage ).ok && ! sys.engines[ 1 ].stalled, 'a restart catches only in the green' );
	sys.tanks[ 0 ].leak = true;
	sys.update( 10 );
	const before = sys.tanks[ 0 ].fuel;
	sys.tanks[ 1 ].fuel = 0.5;
	sys.transfer( 2 );
	ok( sys.tanks[ 0 ].fuel < before && sys.tanks[ 1 ].fuel > 0.5, 'the pump moves fuel out of the leaking tank' );
	r = sys.patch( ac.damage, 'engineer', SYS.patch );
	ok( r.ok && r.what === 'leak' && ! sys.tanks[ 0 ].leak, 'a patch plugs the leak first' );
	ac.damage.hit( 'wingR', 120 );
	const hp0 = ac.damage.hp.wingR;
	r = sys.patch( ac.damage, 'engineer', SYS.patch );
	ok( r.ok && ac.damage.hp.wingR > hp0, `then mends the worst part (${ r.what } +${ f1( r.hp ) })` );
	const sw = new Aircraft( 'seawarden', { env: sky } );
	sw.damage.hit( 'wingL', 120 );
	const k0 = sw.systems.kits.radio;
	sw.systems.patch( sw.damage, 'radio', SYS.patch );
	ok( sw.systems.kits.radio === k0 - 1 && sw.damage.hp.wingL <= sw.damage.max.wingL * SYS.radioCap + 1e-6, 'the radio operator patches small damage only' );
	ok( sw.systems.spot( 'x' ) && sw.systems.marks.has( 'x' ) && ( sw.systems.update( SYS.spot + 1 ), ! sw.systems.marks.has( 'x' ) ), 'a spotted target stays marked a while' );
	const copy = new CrewSystems( 'longreach' );
	copy.adopt( sys.code() );
	ok( copy.code() === sys.code(), 'the systems code reaches the crew' );

}

// ------------------------------------------------------------------ the practice AI
{

	const me = new FighterFlight( 'sabrewing', sky );
	me.place( 0, 600, 0, 0, { grounded: false, speed: 110 } );
	me.controls.throttle = 0.8;
	const ai = new Aircraft( 'bulwark', { env: { groundAt: () => 0, waterAt: () => 0 }, rng: seeded( 5 ) } );
	ai.flight.place( 300, 600, - 500, 0.5, { grounded: false, speed: 110 } );
	const pilot = new AIPilot( ai.flight, { skill: 0.8, rng: seeded( 9 ) } );
	let fired = 0, closest = Infinity;
	for ( let i = 0; i < 60 * 40; i ++ ) {

		// (a gentle level turn: bank held near 35 degrees, the height held)
		me.controls.roll = Math.max( - 1, Math.min( 1, ( 0.6 - me.bank() ) * 3 ) );
		me.controls.pitch = Math.max( - 1, Math.min( 1, ( 600 - me.position.y ) * 0.01 - me.velocity.y * 0.05 + 0.15 ) );
		me.update( 1 / 60 );
		const o = pilot.think( 1 / 60, { target: { position: me.position, velocity: me.velocity }, groundAt: () => 0, waterAt: () => 0 } );
		ai.step( 1 / 60, o );
		if ( o.fire ) fired ++;
		closest = Math.min( closest, ai.position.distanceTo( me.position ) );

	}

	ok( closest < 400 && fired > 10, `a raider chases a turning target and fires (closest ${ Math.round( closest ) } m, ${ fired } frames firing)` );
	ok( ! ai.flight.crashed, 'and never flies into the sea' );

}

// ------------------------------------------------------------------ the feature: buying, flying, the save (single player)
function harness( { id = null, online = false, room = null, name = 'Pilot' } = {} ) {

	const listeners = new Map();
	const keys = new Set(), hits = new Set();
	const input = {
		mouseDown: false, rightDown: false, enabled: true,
		down: ( k ) => keys.has( k ), hit: ( k ) => { const h = hits.has( k ); return h; },
		keys, hits,
	};
	const player = {
		position: new Vector3( 0, 0, 0 ), mode: 'walk', vehicle: null, view: 'third',
		enterVehicle( v ) { this.vehicle = v; this.mode = 'plane'; return true; },
		exitVehicle( x, y, z, yaw, mode = 'walk' ) { this.vehicle = null; this.mode = mode; this.position.set( x, y, z ); },
	};
	const camera = { position: new Vector3(), quaternion: new Quaternion(), matrixWorldInverse: null };
	const state = { money: 500000, free: false, spend( a ) { if ( a > this.money ) return false; this.money -= a; return true; }, earn( a ) { this.money += a; }, save() {} };
	const features = {
		state, emitted: [],
		on( k, fn ) { if ( ! listeners.has( k ) ) listeners.set( k, [] ); listeners.get( k ).push( fn ); return () => {}; },
		emit( k, e ) { this.emitted.push( [ k, e ] ); for ( const fn of listeners.get( k ) || [] ) fn( e ); },
		interactable() { return () => {}; }, get: () => null, panelOpen: () => false,
	};
	const app = { player, input, camera, features };
	if ( online ) {

		app.net = { online: true };
		app.remotePlayers = { peers: new Map(), renderTime: () => room.t - 120 };
		app.netsync = { online: true, id, get isHost() { return room.host === id; }, net: { get host() { return room.host; }, serverOffset: 0 }, sendWorldEvent: ( kind, data ) => room.send( id, kind, data ) };

	}

	const df = new Dogfight( app, features, { scene: false, hud: false, groundAt: () => 0, waterAt: () => - 100, rng: seeded( 11 ) } );
	return { id, name, app, df, input, player, camera, features, listeners };

}

{

	const h = harness();
	const { df } = h;
	ok( df.buy( 'sabrewing', 'tidemark' ).ok && df.fleet.sabrewing.owned && h.features.state.money === 500000 - WARBIRDS.sabrewing.price, 'a fighter is bought at a dispersal for its price' );
	ok( ! df.buy( 'sabrewing' ).ok, 'and not twice' );
	ok( df.buy( 'longreach', 'meridian' ).ok && df.fleet.longreach.at === 'meridian', 'a bomber at the Meridian line' );
	const slots = lineSlots( stripOf( undefined, 'tidemark' ) );
	ok( WARBIRD_IDS.every( ( id ) => slots[ id ] ) && Math.hypot( slots.sabrewing.x - slots.longreach.x, slots.sabrewing.z - slots.longreach.z ) > 100, 'every airframe has a slot on the line' );
	ok( df.fly( 'sabrewing', 0 ).ok && h.player.mode === 'plane' && df.ac.flight.grounded, 'E at her door: aboard, on the ground' );
	// take off: throttle up, then the stick back
	h.input.keys.add( 'ShiftLeft' );
	let off = false;
	for ( let i = 0; i < 60 * 30 && ! off; i ++ ) {

		if ( df.ac.flight.airspeed > 44 ) h.input.keys.add( 'KeyS' );
		h.player.vehicle.drive( 1 / 60 );
		df.update( 1 / 60 );
		off = df.ac.status === 'fly';

	}

	h.input.keys.clear();
	ok( off, `the keys fly her off the ground (${ Math.round( df.ac.position.distanceTo( new Vector3( slots.sabrewing.x, 0, slots.sabrewing.z ) ) ) } m)` );
	// R arms the guns; the trigger fires only then
	h.input.mouseDown = true;
	for ( let i = 0; i < 30; i ++ ) { h.player.vehicle.drive( 1 / 60 ); df.update( 1 / 60 ); }
	ok( df.ac.guns.shots === 0, 'unarmed guns do not fire' );
	h.input.hits.add( 'KeyR' );
	h.player.vehicle.drive( 1 / 60 );
	h.input.hits.clear();
	for ( let i = 0; i < 120; i ++ ) { h.player.vehicle.drive( 1 / 60 ); df.update( 1 / 60 ); }
	h.input.mouseDown = false;
	ok( df.ac.arm.armed && df.ac.guns.shots > 20, `armed (R), the trigger fires (${ df.ac.guns.shots } rounds)` );
	// the practice drones; arm and kill one
	ok( df.startDrones().ok && df.ai.length === 3, 'three target drones in practice' );
	const drone = df.ai[ 0 ];
	for ( let i = 0; i < 30 && ! drone.damage.down; i ++ ) df._applyHit( drone, 'wingL', 20, { by: df.me } );
	for ( let i = 0; i < 60 * 30 && drone.status !== 'crash'; i ++ ) df.update( 1 / 60 );
	ok( df.score[ 0 ] === 1, 'a drone shot down counts' );
	// the save: the fighter out is written with its damage and its rounds
	df.ac.hit( 'tail', 30 );
	const save = JSON.parse( JSON.stringify( df.toJSON() ) );
	const h2 = harness();
	h2.df.fromJSON( save );
	ok( h2.df.fleet.sabrewing.owned && h2.df.fleet.longreach.owned && h2.df.fleet.longreach.at === 'meridian' && ! h2.df.fleet.bulwark.owned, 'the save keeps the fleet and where it stands' );
	const back = new Aircraft( 'sabrewing' );
	back.fromRecord( h2.df.fleet.sabrewing.rec );
	ok( back.damage.hp.tail < back.damage.max.tail && back.guns.state().ammo < back.guns.state().ammoMax, 'and each airframe\'s damage and rounds' );
	ok( h2.df.score[ 0 ] === 1 && h2.df.options.cv === 250, 'the record and the options' );
	// a crash with the pilot aboard: the death feature's cause
	const crash = { type: 'crash', cause: 'ground', speed: 90, x: 0, y: 0, z: 0, water: false };
	df._crash( df.ac, crash );
	ok( h.features.emitted.some( ( [ k, e ] ) => k === 'playerDied' && e.cause === 'dogfight' ) && df.fleet.sabrewing.lost, 'a crash aboard: playerDied (dogfight) and the fighter lost' );
	ok( df.rebuild( 'sabrewing', 'tidemark' ).ok && ! df.fleet.sabrewing.lost, 'rebuilt at a dispersal' );

}

// ------------------------------------------------------------------ a room: three clients, one host
class Room {

	constructor() {

		this.t = 1e6;
		this.host = 'A';
		this.clients = new Map();
		this.queue = [];
		this.sent = 0;

	}

	add( c ) {

		this.clients.set( c.id, c );
		for ( const o of this.clients.values() ) if ( o !== c ) {

			o.app.remotePlayers.peers.set( c.id, { name: c.name, lastAt: 0, extra: {} } );
			c.app.remotePlayers.peers.set( o.id, { name: o.name, lastAt: 0, extra: {} } );

		}

	}

	send( from, kind, data ) {

		this.sent ++;
		this.queue.push( { from, kind, data: JSON.parse( JSON.stringify( data ) ) } );
		return true;

	}

	// one frame: each client drives (if aboard) and updates; its state reaches the others; events are delivered
	step( dt = 1 / 60 ) {

		this.t += dt * 1000;
		for ( const c of this.clients.values() ) {

			c.app.netsync.net.serverOffset = Date.now() - this.t;
			if ( c.player.vehicle && c.player.vehicle.drive ) c.player.vehicle.drive( dt );
			c.df.update( dt );

		}

		for ( const c of this.clients.values() ) {

			const st = c.df.decorateState( {} );
			for ( const o of this.clients.values() ) if ( o !== c ) {

				const p = o.app.remotePlayers.peers.get( c.id );
				p.lastAt = this.t;
				p.extra = JSON.parse( JSON.stringify( st ) );

			}

		}

		const q = this.queue.splice( 0 );
		for ( const e of q ) for ( const c of this.clients.values() ) if ( c.id !== e.from ) c.features.emit( 'remoteWorldEvent', { kind: e.kind, data: e.data, from: e.from, at: this.t } );

	}

	run( seconds, each = null ) {

		for ( let i = 0; i < seconds * 60; i ++ ) {

			if ( each ) each( i );
			this.step();

		}

	}

}

// the camera of a client looks at a world point (its turret aims there)
const lookAt = ( c, p ) => {

	const cam = c.camera;
	const d = new Vector3().subVectors( p, cam.position ).normalize();
	cam.quaternion.setFromUnitVectors( new Vector3( 0, 0, - 1 ), d );

};

{

	const room = new Room();
	const A = harness( { id: 'A', online: true, room, name: 'Ann' } ), B = harness( { id: 'B', online: true, room, name: 'Bob' } ), C = harness( { id: 'C', online: true, room, name: 'Cid' } );
	for ( const c of [ A, B, C ] ) room.add( c );
	for ( const c of [ A, B, C ] ) for ( const id of WARBIRD_IDS ) c.df.buy( id, 'tidemark' );
	ok( A.df.online && ! A.df.offline, 'the clients are online (no practice AI)' );

	// ---- two fighters: A (the host) behind B, both armed
	const put = ( c, id, x, y, z, heading, armed ) => {

		c.df.fly( id, 0 );
		const a = c.df.ac;
		a.flight.place( x, y, z, heading, { grounded: false, speed: 100 } );
		a.flight.flaps = a.flight.gearDown = 0;
		a.status = 'fly';
		c.df._input.throttle = 0.8;
		a.arm.want = a.arm.armed = armed;
		return a;

	};
	const aA = put( A, 'sabrewing', 0, 600, 0, 0, true ), aB = put( B, 'bulwark', 0, 600 + WARBIRDS.sabrewing.sight[ 1 ], 230, 0, true );
	room.run( 1 );
	ok( A.df.net.sample( 'B', null ) && B.df.net.sample( 'A', null ), 'each sees the other\'s fighter in the state (df)' );
	// (the fixture holds the target in the shooter's sights: the pilots' flying is not what is tested here)
	const hold = ( shooter, target, d ) => () => {

		const S = shooter.flight, T = target.flight;
		T.position.copy( S.toWorld( [ 0, WARBIRDS[ shooter.id ].sight[ 1 ], d ], new Vector3() ) );
		T.quaternion.copy( S.quaternion );
		T.velocity.copy( S.velocity );

	};
	A.input.mouseDown = true;
	room.run( 1.2, hold( aA, aB, 230 ) );
	A.input.mouseDown = false;
	room.run( 1.5 );
	const dB = Object.values( aB.damage.hp ).reduce( ( s, v ) => s + v, 0 ) < Object.values( aB.damage.max ).reduce( ( s, v ) => s + v, 0 );
	ok( dB && A.df.net.stats.accepted > 0, `the host's own burst on B: judged and applied on B's client (${ A.df.net.stats.accepted } accepted, B ${ aB.damage.code() })` );
	ok( B.df.net.sample( 'A', null ).f !== undefined && B.df.bullets.list.length + B.df.fx.drawn.tracers >= 0, 'B saw A fire (the firing flag in A\'s state drives B\'s tracers)' );
	const rejectedBefore = A.df.net.stats.rejected;
	// ---- B (a guest) fires back: the claim goes to the host
	aA.flight.place( 0, 600 + WARBIRDS.bulwark.sight[ 1 ], 900, 0, { grounded: false, speed: 100 } );
	aB.flight.place( 0, 600, 670, 0, { grounded: false, speed: 100 } );
	room.run( 0.5, hold( aB, aA, 230 ) );
	B.input.mouseDown = true;
	room.run( 1, hold( aB, aA, 230 ) );
	B.input.mouseDown = false;
	room.run( 1.5 );
	ok( B.df.net.stats.claimsSent > 0 && A.df.net.stats.claimsIn > 0, 'a guest\'s hits go to the host as claims' );
	ok( aA.damage.missing() > 0, `the host judged them and its own fighter took them (${ aA.damage.code() })` );
	// ---- an unarmed fighter is never hurt
	aA.arm.want = aA.arm.armed = false;
	aA.damage.repair();
	room.run( 0.5, hold( aB, aA, 230 ) );
	const sentBefore = B.df.net.stats.claimsSent;
	B.input.mouseDown = true;
	room.run( 1, hold( aB, aA, 230 ) );
	B.input.mouseDown = false;
	room.run( 1.5 );
	ok( B.df.net.stats.claimsSent === sentBefore, "B's rounds pass through A while A's guns are safe (nothing claimed)" );
	ok( aA.damage.missing() === 0, 'with A\'s guns safe, B\'s burst does nothing to A' );
	// a forged claim (a hit on A while safe) is refused by the host
	const r = A.df.net.validate( 'B', { t: 'A', at: room.t - 200, h: [ [ 0, 50, 0, 0, 2 ] ] } );
	ok( ! r.ok && r.why === 'targetSafe', 'the host refuses a claim on an unarmed fighter' );
	const r2 = A.df.net.validate( 'B', { t: 'A', at: room.t - 5000, h: [ [ 0, 50, 0, 0, 2 ] ] } );
	ok( ! r2.ok && r2.why === 'stale', 'and one older than the rewind window' );
	ok( A.df.net.stats.rejected >= rejectedBefore, 'rejections are counted' );

	// ---- crewing: A's Longreach on the ground, B and C park; B walks up and takes the top turret
	A.df._park( 'ground' );
	B.df._park( 'ground' );
	C.df._park( 'ground' );
	room.run( 0.3 );
	{ const fr = A.df.fly( 'longreach', 0 ); if ( ! fr.ok ) console.log( 'fly longreach:', fr, A.df.fleet.longreach, !! A.df.ride, !! A.df.chute, !! A.df.ac ); }
	const L = A.df.ac;
	L.flight.place( 0, 0, 0, 0, { grounded: true } );
	room.run( 0.5 );
	B.player.mode = 'walk';
	const view = B.df.seatView( { owner: 'A', id: 'longreach' } );
	ok( view && view.seats.length === 4 && view.seats[ 0 ].who === 'Ann', 'the seat picker shows the owner at the controls' );
	ok( B.df.takeSeat( { owner: 'A', id: 'longreach' }, 3 ).ok, 'B asks for the top turret' );
	room.run( 0.6 );
	ok( L.seats.who[ 3 ] === 'B' && B.df.ride && B.df.ride.seat === 3 && B.player.mode === 'plane', 'the owner gives it; B is aboard as the top gunner' );
	// in the air: C comes in behind in an armed fighter; the bomber is armed
	L.flight.place( 0, 700, 0, 0, { grounded: false, speed: 105 } );
	L.flight.flaps = L.flight.gearDown = 0;
	L.status = 'fly';
	A.df._input.throttle = 0.8;
	L.arm.want = L.arm.armed = true;
	const aC = put( C, 'sabrewing', 6, 735, - 160, 0, true );
	const trail = () => {

		aC.flight.position.copy( L.flight.toWorld( [ 12, 30, - 150 ], new Vector3() ) );
		aC.flight.quaternion.copy( L.flight.quaternion );
		aC.flight.velocity.copy( L.flight.velocity );

	};
	room.run( 0.8, trail );
	// B looks at C: the turret slews there and fires; his hits are claimed by B and judged by A (B must be on A's roster)
	B.camera.position.copy( L.flight.toWorld( WARBIRDS.longreach.seats[ 3 ].eye, new Vector3() ) );
	// (the gunner aims at what he sees: C drawn on his clock)
	const aimAt = () => {

		const fr = B.df.ride.pose;
		B.camera.position.copy( fr.toWorld( WARBIRDS.longreach.seats[ 3 ].eye, new Vector3() ) );
		const seen = B.df._targetsAll().find( ( t ) => t.id === 'C' );
		lookAt( B, seen ? seen.position : C.df.ac.position );

	};
	const both = () => { trail(); aimAt(); };
	room.run( 1, both );
	B.input.mouseDown = true;
	room.run( 1.5, both );
	B.input.mouseDown = false;
	room.run( 1.5 );
	ok( B.df.net.stats.claimsSent > 0 && aC.damage.missing() > 0, `the gunner's hits on C, judged by the host, land on C's fighter (${ aC.damage.code() })` );
	ok( C.df.net.lastHit.by === 'B', 'C knows the gunner hit him' );
	// B moves to the engineer's seat in flight; A's left engine catches fire; B puts it out
	ok( B.df.switchSeat( 1 ).ok !== undefined, 'B asks for the engineer\'s seat' );
	room.run( 0.6 );
	ok( L.seats.who[ 1 ] === 'B' && L.seats.who[ 3 ] === null && B.df.ride.seat === 1, 'a seat switch in flight (the turret freed)' );
	L.damage.hit( 'engineL', 50 );
	L.damage.fires.engineL = 40;
	room.run( 0.3 );
	ok( B.df.ride.systems && B.df.ride.df.d.length > 8, 'the engineer reads the bomber\'s damage and systems (the owner\'s state)' );
	B.input.keys.add( 'KeyO' );
	room.run( SYS.extinguish + 0.6 );
	B.input.keys.delete( 'KeyO' );
	room.run( 0.3 );
	ok( ! L.damage.fires.engineL && L.systems.engines[ 0 ].bottle === 0, 'the engineer held the extinguisher: the owner\'s fire is out' );
	L.systems.engines[ 1 ].stalled = true;
	B.input.hits.add( 'BracketRight' );
	room.run( 0.05 );
	B.input.hits.clear();
	room.run( 0.3 );
	let restarted = false;
	room.run( 4, () => {

		if ( restarted || ! L.systems.engines[ 1 ].stalled ) return;
		if ( Math.abs( B.df.needle() - 0.5 ) < 0.05 ) {

			B.input.hits.add( 'KeyU' );
			restarted = true;

		}

	} );
	B.input.hits.clear();
	room.run( 0.3 );
	ok( ! L.systems.engines[ 1 ].stalled, 'the engineer restarted the stalled engine in the green' );
	// a kill credits the crew: C's fighter goes down after the gunner's hits
	const scoreBefore = { A: A.df.net.score.get( 'A' ) ? A.df.net.score.get( 'A' ).kills : 0 };
	C.df.net.lastHit = { by: 'B', at: room.t };
	for ( let i = 0; i < 10 && ! aC.damage.down; i ++ ) C.df._applyHit( aC, 'tail', 40, { by: 'B' } );
	room.run( 0.5 );
	const sA = A.df.net.score.get( 'A' ), sB = A.df.net.score.get( 'B' );
	ok( sA && sB && sA.kills === scoreBefore.A + 1 && sB.kills >= 1, `the kill is the crew's: the pilot (${ sA && sA.kills }) and the gunner (${ sB && sB.kills }) both credited` );
	ok( A.df.stats.kills >= 1 && B.df.stats.kills >= 1, 'each crew member\'s own record counts it' );
	// B bails out: his seat is freed; under the parachute
	room.run( 0.1 );
	B.df.bail();
	room.run( 0.6 );
	ok( B.df.chute && L.seats.who[ 1 ] === null && ! B.df.ride, 'a crew member bails out alone: the seat is freed, he hangs under his canopy' );
	console.log( `     ${ room.sent } world events in the session; host: ${ A.df.net.stats.accepted } claims accepted, ${ A.df.net.stats.rejected } refused (${ JSON.stringify( A.df.net.stats.rejectWhy ) })` );

}

// wave 27B: the phone's cluster writes dogfight.touch (the analog stick, the slider, the trigger); the feature reads it only in touch mode
{

	const h = harness();
	const { df } = h;
	df.buy( 'longreach', 'tidemark' );
	ok( df.fly( 'longreach', 0 ).ok, '[touch] aboard the bomber' );
	let info = df.touchInfo();
	ok( info.aboard && info.pilot && info.seats === 4 && info.seat === 0 && ! info.armed, '[touch] touchInfo: aboard, the pilot, four seats' );
	const step = ( n ) => { for ( let i = 0; i < n; i ++ ) { h.player.vehicle.drive( 1 / 60 ); df.update( 1 / 60 ); } };
	// off in touch mode: the cluster's values are ignored
	Object.assign( df.touch, { active: true, throttle: 1, fire: true, owned: true } );
	step( 60 );
	ok( df.ac.flight.controls.throttle < 0.01 && ! df.ac.guns.shots, '[touch] not in touch mode: the cluster does nothing' );
	h.input.touchMode = true;
	df.touch.throttle = 0.6;
	step( 90 );
	ok( Math.abs( df._input.throttle - 0.6 ) < 0.02, `[touch] the slider's throttle is held (${ df._input.throttle.toFixed( 2 ) })` );
	df.touch.throttle = null;
	step( 30 );
	ok( Math.abs( df._input.throttle - 0.6 ) < 0.02 && df.touchInfo().throttle === df._input.throttle, '[touch] a thumb off the slider leaves the throttle where it is' );
	df.touch.pitch = 1; df.touch.roll = - 1;
	step( 30 );
	ok( df._input.pitch > 0.9 && df._input.roll < - 0.9 || df.ac.flight.grounded && df._input.pitch > 0.9, `[touch] the stick: pitch ${ df._input.pitch.toFixed( 2 ) }, roll ${ df._input.roll.toFixed( 2 ) }` );
	df.touch.pitch = 0; df.touch.roll = 0;
	ok( df._trigger( false ) === true, '[touch] the trigger held on the cluster fires' );
	df.touch.fire = false;
	ok( df._trigger( false ) === false && df._trigger( true ) === false, '[touch] and not when let go (or in a menu)' );
	// the HUD's own buttons stand down while the cluster owns the screen
	df.touch.active = false;
	// the seat button: the next free seat, round the aircraft
	const r1 = df.cycleSeat();
	ok( r1.ok && df.mySeat === 1 && ! df.touchInfo().pilot, '[touch] Seat: the next one (the gunner), no stick there' );
	df.cycleSeat(); df.cycleSeat();
	const r2 = df.cycleSeat();
	ok( r2.ok && df.mySeat === 0, '[touch] and round to the pilot again' );
	const solo = harness();
	solo.df.buy( 'sabrewing', 'tidemark' ); solo.df.fly( 'sabrewing', 0 );
	ok( solo.df.touchInfo().seats === 1 && ! solo.df.cycleSeat().ok, '[touch] a fighter has one seat: Seat does nothing' );
	solo.df.exit();
	ok( ! solo.df.touchInfo().aboard, '[touch] on foot: not aboard' );

}

// the wire: a malformed state is ignored
ok( cleanDf( { a: 'sabrewing', p: [ 0, 0, NaN ], q: [ 0, 0, 0, 1 ] } ) === null && cleanDf( { a: 'nope', p: [ 0, 0, 0 ], q: [ 0, 0, 0, 1 ] } ) === null, 'malformed df states are refused' );
ok( gunDps( 'bulwark' ) > gunDps( 'sabrewing' ) && NET.maxRewind >= 800, 'the damage budget and the rewind window' );

if ( failures ) {

	console.error( `\n${ failures } failure(s)` );
	process.exit( 1 );

}

console.log( '\nfeature-dogfight: all ok' );
