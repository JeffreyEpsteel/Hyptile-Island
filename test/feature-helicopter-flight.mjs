// Wave 25E: the rescue helicopter's realistic flight model and its aerobatics (src/features/helicopter/Flight.js,
// Tricks.js, Helicopter.js). Headless: the flight envelope (hover needs hands on the controls, translational lift, the
// vortex ring, autorotation, RPM droop, torque yaw, ground effect), a backflip flown from an input sequence through the
// game's own key path and named by the trick detector, the combo, a crash when the height is misjudged, the assist mode.
import assert from 'node:assert/strict';
import { PerspectiveCamera } from '../src/engine/index.js';
import { Features } from '../src/features/Features.js';
import { Colliders } from '../src/world/Colliders.js';
import { Player } from '../src/player/Player.js';
import { Helicopter } from '../src/features/helicopter/Helicopter.js';
import { RotorFlight, HOVER_COLLECTIVE, ROTOR } from '../src/features/helicopter/Flight.js';
import { TrickDetector, TRICKS } from '../src/features/helicopter/Tricks.js';

let checks = 0;
const check = ( c, label, extra = '' ) => { assert.ok( c, label + ' ' + extra ); checks ++; console.log( 'ok', label, extra ); };
const DT = 1 / 60;
const real = ( y = 0, opts = {} ) => { const f = new RotorFlight( { mode: 'real', ...opts } ); f.place( 0, y, 0, 0 ); f.engineOn = true; f.rpm = 1; if ( y > 0 ) { f.grounded = false; f.agl = y; } return f; };
const fly = ( f, seconds, ctl = {}, each = null ) => { for ( let i = 0; i < seconds / DT; i ++ ) { Object.assign( f.controls, ctl ); if ( each ) each( f, i * DT ); f.update( DT ); } return f; };

// ---- the envelope
{
	const g = real( 0 );
	fly( g, 3, { collective: 0 } );
	check( g.grounded && g.position.y === 0, 'collective down: the aircraft stays on its skids with the rotor at speed' );
	fly( g, 3, { collective: HOVER_COLLECTIVE + 0.06 } );
	check( ! g.grounded && g.position.y > 1, 'a little over the hover collective lifts off', `(${ g.position.y.toFixed( 1 ) } m)` );
	check( Math.abs( g.yaw ) > 0.1, 'and the nose swings with the torque when the pedals are not used', `(${ g.yaw.toFixed( 2 ) } rad)` );

	// hover: neutral sticks at exactly the hover collective drift away (no auto-hover); the assist model holds
	const h = real( 60 );
	fly( h, 14, { collective: HOVER_COLLECTIVE } );
	const drift = Math.hypot( h.position.x, h.position.y - 60, h.position.z );
	check( drift > 2, 'realistic: a hover with the hands off drifts (the disc flaps back, the air moves)', `(${ drift.toFixed( 1 ) } m in 14 s)` );
	const a = new RotorFlight( { mode: 'assist' } ); a.place( 0, 0, 0, 0 ); a.engineOn = true; a.rpm = 1;
	fly( a, 5, { lift: 1 } ); fly( a, 3, { lift: 0 } ); const y0 = a.position.y; fly( a, 8, { lift: 0 } );
	check( Math.abs( a.position.y - y0 ) < 0.01, 'assist: neutral controls hold a stable hover (the option for new players)' );

	// ground effect: the same collective lifts more just over the pad than out of it
	const low = real( 0.2 ), highF = real( 80 );
	fly( low, 0.05, { collective: HOVER_COLLECTIVE } ); fly( highF, 0.05, { collective: HOVER_COLLECTIVE } );
	check( low.state.ge > 1.1 && highF.state.ge < 1.02, 'ground effect within a rotor diameter of the surface', `(${ low.state.ge.toFixed( 2 ) } vs ${ highF.state.ge.toFixed( 2 ) })` );

	// translational lift: the same collective climbs once the disc moves through clean air
	const still = real( 100 ), moving = real( 100 );
	moving.velocity.set( 0, 0, 14 );
	fly( still, 0.5, { collective: HOVER_COLLECTIVE } ); fly( moving, 0.5, { collective: HOVER_COLLECTIVE } );
	check( moving.state.etl > 1.1 && moving.velocity.y > still.velocity.y + 0.3, 'translational lift above ~15-20 kn', `(etl ${ moving.state.etl.toFixed( 2 ) }, climb ${ moving.velocity.y.toFixed( 2 ) } vs ${ still.velocity.y.toFixed( 2 ) } m/s)` );

	// the vortex ring: sinking fast at low airspeed with power on settles faster; forward speed flies out of it
	const vr = real( 300 ); vr.velocity.set( 0, - 5, 0 ); fly( vr, 3, { collective: 0.35 } );
	const out = real( 300 ); out.velocity.set( 0, - 5, 16 ); fly( out, 3, { collective: 0.35 } );
	check( vr.state.vrs > 0.6 && vr.velocity.y < - 8, 'settling with power: the vortex ring', `(vrs ${ vr.state.vrs.toFixed( 2 ) }, ${ vr.velocity.y.toFixed( 1 ) } m/s)` );
	check( out.state.vrs < 0.05 && out.velocity.y > - 3, 'forward speed keeps the disc in clean air', `(${ out.velocity.y.toFixed( 1 ) } m/s)` );

	// RPM droop: the turbine's torque limit under a full collective climb
	const pull = real( 100 ); fly( pull, 4, { collective: 1 } );
	check( pull.rpm < 0.97 && pull.rpm > 0.6, 'rotor RPM droops under a heavy collective', `(${ ( pull.rpm * 100 ).toFixed( 0 ) }%)` );

	// autorotation: the turbine cut, the collective down, the air keeps the rotor turning; pulling the collective bleeds it
	const auto = real( 500 ); auto.velocity.set( 0, 0, 20 ); auto.engineOn = false;
	// (the pilot holds a nose-down glide: a little attitude loop on the cyclic keeps the airspeed up, out of the vortex ring)
	const glide = ( g ) => { const fy = g.forward().y, ub = g.up().clone().applyQuaternion( g.quaternion.clone().invert() ).set( 0, 1, 0 ).applyQuaternion( g.quaternion.clone().invert() ); g.controls.pitch = Math.max( - 1, Math.min( 1, ( fy + 0.12 ) * 6 - g.omega.x * 0.6 ) ); g.controls.roll = Math.max( - 1, Math.min( 1, - ub.x * 6 - g.omega.z * 0.6 ) ); };
	fly( auto, 15, { collective: 0.08 }, glide );
	check( auto.rpm > 0.8 && auto.velocity.y > - 12 && auto.velocity.y < - 4, 'autorotation: the rotor stays in the green on a steady descent', `(rotor ${ ( auto.rpm * 100 ).toFixed( 0 ) }%, ${ auto.velocity.y.toFixed( 1 ) } m/s)` );
	const flare = auto.velocity.y;
	fly( auto, 1.2, { collective: 0.5, pitch: - 0.25, level: false } );
	check( auto.velocity.y > flare + 3 && auto.rpm < 0.9, 'a flare trades the rotor\'s energy for lift', `(${ auto.velocity.y.toFixed( 1 ) } m/s, rotor ${ ( auto.rpm * 100 ).toFixed( 0 ) }%)` );
	const dead = real( 500 ); dead.engineOn = false; fly( dead, 10, { collective: 0.7 } );
	check( dead.rpm < 0.7, 'with the collective held up the rotor bleeds away', `(${ ( dead.rpm * 100 ).toFixed( 0 ) }%)` );

	// retreating blade stall near VNE: the thrust falls and the aircraft rolls off
	const fast = real( 300 ); fast.velocity.set( 0, 0, 76 ); fly( fast, 0.3, { collective: HOVER_COLLECTIVE } );
	check( fast.state.rbs > 0.5 && fast.omega.z < - 0.2, 'retreating-blade stall at high speed rolls the aircraft', `(rbs ${ fast.state.rbs.toFixed( 2 ) }, roll rate ${ fast.omega.z.toFixed( 2 ) })` );

	// wind: a hover in a breeze drifts downwind
	const wind = { x: 8, y: 0, z: 0 };
	const breezy = real( 80, { windAt: () => wind } ); fly( breezy, 4, { collective: HOVER_COLLECTIVE } );
	check( breezy.position.x > 1, 'the wind carries a hands-off hover downwind', `(${ breezy.position.x.toFixed( 1 ) } m)` );

	// negative thrust: inverted with the collective below zero the aircraft holds its height
	const inv = real( 200 ); inv.quaternion.setFromAxisAngle( { x: 0, y: 0, z: 1 }, Math.PI );
	fly( inv, 1.5, { collective: - HOVER_COLLECTIVE - 0.02 } );
	check( Math.abs( inv.velocity.y ) < 1.5 && inv.up().y < - 0.9, 'the aerobatic head flies inverted on a negative collective', `(${ inv.velocity.y.toFixed( 2 ) } m/s)` );
}

// ---- the trick detector alone
{
	const f = real( 120 ), t = new TrickDetector();
	let names = [];
	let acc = 0;
	fly( f, 2.4, {}, ( g ) => {
		acc += g.omega.x * DT;
		const up = g.up(), flipping = acc > - Math.PI * 2 * 0.97;
		g.controls.pitch = flipping ? - 1 : 0;
		g.controls.collective = up.y > 0.2 ? 0.6 : up.y < - 0.2 ? - 0.6 : HOVER_COLLECTIVE;
		g.controls.level = ! flipping;
		for ( const e of t.step( DT, g ) ) names.push( e.name );
	} );
	check( names.length === 1 && / Backflip$/.test( names[ 0 ] ) && Math.abs( f.position.y - 120 ) < 25, 'a backflip in place is named', `(${ names.join( ', ' ) }, ${ ( f.position.y - 120 ).toFixed( 1 ) } m)` );
	names = []; acc = 0;
	fly( f, 3, {}, ( g ) => {
		acc += g.omega.z * DT;
		const up = g.up(), rolling = acc < Math.PI * 2 * 0.97;
		g.controls.pitch = 0; g.controls.roll = rolling ? 1 : 0;
		g.controls.collective = up.y > 0.2 ? 0.6 : up.y < - 0.2 ? - 0.6 : HOVER_COLLECTIVE;
		g.controls.level = ! rolling;
		for ( const e of t.step( DT, g ) ) names.push( e.name + ' x' + e.mult );
	} );
	check( names.length === 1 && /Roll x1.5$/.test( names[ 0 ] ), 'a roll right after chains the combo', `(${ names.join( ', ' ) }, ${ t.comboPoints } pts)` );
	check( t.crash() > 0 && t.combo === 0, 'a crash rug-pulls the combo' );
	check( Object.values( TRICKS ).every( ( d ) => d.flavour.length && d.points > 0 ), 'every trick has its points and its market flavour' );
}

// ---- through the game: keys, the collective lever, a backflip, a crash, the assist toggle
function world() {
	const terrain = { heightAt: () => 1, normalAt: ( x, z, out ) => out.set( 0, 1, 0 ) }, colliders = new Colliders();
	const input = { keys: new Set(), pressed: new Set(), enabled: true, down( k ) { return this.keys.has( k ); }, hit( k ) { return this.pressed.has( k ); }, consumeLook: () => ( { x: 0, y: 0 } ), consumeWheel: () => 0 };
	const query = { allocate: () => 0, setPoint() {}, cpuValid: false, cpu: new Float32Array( 16 ), resultInputs: new Float32Array( 16 ), version: 0 };
	const camera = new PerspectiveCamera( 60, 1.6, 0.1, 5000 );
	const player = new Player( { terrain, colliders, input, query, camera, boat: null } );
	const toasts = [], events = [], app = { terrainData: terrain, colliders, input, query, camera, player, mode: 'campaign', scene: null, settings: {}, game: { toast: s => toasts.push( s ), state: { save() {} } } };
	const features = new Features( app ), h = new Helicopter( app, features, { render: false, windAt: () => null } );
	features.list.set( 'helicopter', { instance: h } );
	for ( const k of [ 'helicopterTrick', 'helicopterCrashed' ] ) features.on( k, ( e ) => events.push( { k, ...e } ) );
	const tick = ( keys = [] ) => { input.keys = new Set( keys ); player.update( DT ); features.update( DT ); input.pressed.clear(); };
	return { app, h, player, input, toasts, events, tick };
}
{
	const W = world(), { h } = W, f = h.flight;
	check( ! h.assist && f.mode === 'real', 'the game defaults to the realistic model' );
	W.player.position.copy( f.toWorld( [ 1.35, 0.2, 0.65 ] ) ); check( h.board(), 'board' );
	for ( let i = 0; i < 180; i ++ ) W.tick();
	check( h.systems.running && f.rpm > 0.95 && f.grounded, 'the turbine spools up; collective down, it sits' );
	// raise the lever with Shift, let go: it stays
	for ( let i = 0; i < 40; i ++ ) W.tick( [ 'ShiftLeft' ] );
	const lever = h.collective;
	for ( let i = 0; i < 30; i ++ ) W.tick();
	check( lever > 0.45 && h.collective === lever, 'Shift moves the collective lever, which stays where it is left', `(${ ( lever * 100 ).toFixed( 0 ) }%)` );
	for ( let i = 0; i < 360; i ++ ) W.tick( f.position.y < 90 ? [ 'ShiftLeft' ] : f.velocity.y > 0.5 ? [ 'KeyC', 'Space' ] : [ 'Space' ] );
	for ( let i = 0; i < 240 && f.position.y < 70; i ++ ) W.tick( [ 'Space', ...( h.collective < 0.62 ? [ 'ShiftLeft' ] : [] ) ] );
	const top = f.position.y;
	check( top > 40 && ! f.grounded, 'a realistic climb out on the collective, levelled by Space', `(${ top.toFixed( 0 ) } m)` );
	// the backflip by keys: S (cyclic back) through the turn, the collective pushed below zero (C) while inverted, Space
	// to level out
	let acc = 0, inverted = false;
	for ( let i = 0; i < 300; i ++ ) {
		acc += f.omega.x * DT;
		const up = f.up(), flipping = acc > - Math.PI * 2 * 0.97;
		const keys = flipping ? [ 'KeyS' ] : [ 'Space' ];
		if ( up.y < - 0.2 && h.collective > - 0.6 ) keys.push( 'KeyC' );
		if ( up.y > 0.2 && h.collective < 0.6 ) keys.push( 'ShiftLeft' );
		if ( up.y < - 0.8 ) inverted = true;
		W.tick( keys );
	}
	const trick = W.events.find( ( e ) => e.k === 'helicopterTrick' && e.trick === 'backflip' );
	check( inverted && trick && trick.trick === 'backflip' && W.toasts.some( ( t ) => / Backflip \+\d+/.test( t ) ), 'a backflip flown on the keys (S, C while inverted, Space) is named and scored', `(${ trick && trick.name }, ${ ( top - f.position.y ).toFixed( 1 ) } m lost)` );
	check( h.hp === 100 && ! f.grounded, 'and the aircraft flies on' );
	// now misjudge the height: a front flip with the lever down, straight into the ground
	Object.assign( h, { collective: 0 } );
	for ( let i = 0; i < 900 && ! W.events.some( ( e ) => e.k === 'helicopterCrashed' ); i ++ ) W.tick( [ 'KeyW' ] );
	const crash = W.events.find( ( e ) => e.k === 'helicopterCrashed' );
	check( crash && h.hp === 0 && W.toasts.some( ( t ) => /^Crashed/.test( t ) ), 'misjudging the height is a crash', `(${ crash && crash.why })` );
	// the assist mode: K in the cockpit, and a saved choice
	h.recall?.();
	const W2 = world(), h2 = W2.h;
	W2.player.position.copy( h2.flight.toWorld( [ 1.35, 0.2, 0.65 ] ) ); h2.board();
	W2.input.pressed.add( 'KeyK' ); W2.tick();
	check( h2.assist && h2.flight.mode === 'assist' && W2.app.settings.helicopterAssist === true, 'K switches to the assisted mode (and the setting remembers it)' );
	const saved = h2.toJSON();
	const W3 = world(); W3.h.fromJSON( saved );
	check( W3.h.assist && W3.h.flight.mode === 'assist', 'the choice survives a save' );
	check( h2.systems.toggleHold().ok === false || h2.flight.grounded, 'hover hold stays an assist feature' );
}

console.log( `\n${ checks } realistic helicopter checks passed (headless).` );
