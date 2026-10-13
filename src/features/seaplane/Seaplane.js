// The seaplane feature: a floatplane you buy at the hangar on the beach west of the pier, board from its jetty, taxi,
// take off from and land on the water. Flight.js is the rigid-body model (pure), Pilot.js the controls and what a
// touchdown means, Site.js the hangar / slipway / jetty, Model.js the GLB, PlaneAudio.js the engine, Remote.js the
// other players' planes, Panel.js the hangar window.
//
//   const sp = features.get( 'seaplane' );
//   sp.owned, sp.hp (0..100), sp.piloted, sp.flight (Flight), sp.board() / sp.exit(), sp.buy() / sp.repair() / sp.recall()
//   sp.marker() -> { x, z, heading } | null        (maps)
//   sp.decorateState( out ) -> out                 adds out.plane = { p, q, thr } while the local player flies / taxis
//   sp.updateRemote( states )                      the other players' states (array of { id, plane }, or a Map)
//   sp.view() (panel data), sp.open() / close() / isOpen, toJSON() / fromJSON() / reset() / dispose()
//
// Events: planeTookOff { id, x, z }, planeLanded { id, onWater, x, z, sink }, planeCrashed { id, cause, x, z, cost }.
// With the death feature installed a piloted crash also emits playerDied { cause: 'seaplane', text, x, y, z } (death respawns you).
// Keys: ShiftLeft claimed (throttle up), C (throttle down: the dive key, so it follows its binding; wave 5 moved it off
// Ctrl, since Ctrl+W with W pitching closed the tab), Comma / Period claimed (rudder); W A S D and C are read only while piloting
// (the player's walk / boat code is not running then). Player.js mode 'plane' gets the camera and the seated pose
// (enterVehicle / exitVehicle); App needs no per-frame hook (the plane steps inside Player.update while piloted,
// in this feature's update otherwise).
// Wave 8, the cockpit (Systems.js the switches, Cockpit.js the live panel): the engine has to be started (O, the
// START button, or simply opening the throttle: the starter cranks ~2 s first), U master, N nav lights, ; landing
// light, [ / ] flaps, - / = trim (held), Y autopilot, 3 the cockpit's switch panel (touch), M (or the radio) the map.
// A ~25 min tank: refuel at the hangar (free in the sandbox). sp.act( id ) runs a panel control; sp.refuel();
// sp.wantsMouse() while piloting (the left button belongs to the panel, not the rod); sp.lights (nav, landing, cabin).
// Wave 10, crashes you can see (Crash.js the table, Wreck.js the pieces): a strike is judged from the physics - a rough
// landing (hull damage, a float sprung: f.sprung lists it and drags until repaired; a splash and a bang, you stay
// aboard), a wreck (the GLB's parts tear off and fly, splash, float and sink; smoke ~40 s, fire ~20 s on land; you are
// thrown clear a few metres away, blacked out 0.8 s and hurt, alive) or a direct collision (playerDied as before).
// sp.lost: the plane is gone until it is recovered at the hangar (sp.recall(): the recovery fee CRASH.recovery, then the
// repair as before; free in the sandbox); sp.wreck { x, y, z, yaw, t, parts } while the fuselage is still up; a
// worldmap marker 'seaplane-wreck'. Ships (naval hull / rigging boxes), solid colliders and destruction props are struck
// too (Flight STRIKE points; props along the nose's path). planeCrashed gains { severity, speed, water, recovery };
// seaplaneRecovered { cost }. The floating fuselage's cabin roof is a perch (a walkable collider box riding it): a swimmer
// beside it climbs on with E (or swims onto it) instead of treading water; it goes when the wreck starts to sink.

import { Vector3, Quaternion } from '../../engine/index.js';
import { Flight, GEOM, STRIKE } from './Flight.js';
import { CRASH, throwPoint, wreckParts } from './Crash.js';
import { Wreck } from './Wreck.js';
import { Stun } from './Stun.js';
import { Pilot, judge, MAX_HP } from './Pilot.js';
import { SITE, SeaplaneSite, jettyPoint, distToBerth } from './Site.js';
import { PlaneModels } from './Model.js';
import { PlaneAudio } from './PlaneAudio.js';
import { RemotePlanes } from './Remote.js';
import { SeaplanePanel } from './Panel.js';
import { Systems, refuelCost, FUEL } from './Systems.js';
import { Cockpit } from './Cockpit.js';
import { t } from '../../i18n/index.js';

export const PRICE = 18000;
export const REPAIR_PER_HP = 15; // $ per point of condition: a full rebuild after a crash is $1,500
export const ID = 'seaplane';
const SIM_RANGE = 700; // m from the camera: an unattended plane further away is not simulated
// claimed for the plane (KeyC is the core dive key: read, not claimed). Nothing here ever combines Ctrl with a key.
export const KEYS = [ 'ShiftLeft', 'Comma', 'Period', 'KeyO', 'KeyU', 'KeyN', 'Semicolon', 'KeyY', 'BracketLeft', 'BracketRight', 'Minus', 'Equal', 'Digit3' ];
export const THROTTLE_DOWN = 'KeyC';
// the cockpit's keys -> Seaplane.act ids (pressed, not held; the trim keys are held: _keysNow)
export const COCKPIT_KEYS = { KeyO: 'engine', KeyU: 'master', KeyN: 'nav', Semicolon: 'landing', KeyY: 'ap', BracketLeft: 'flapsUp', BracketRight: 'flapsDown', Digit3: 'panel' };

const _v = new Vector3(), _v2 = new Vector3(), _v3 = new Vector3(), _nose = new Vector3(), _q = new Quaternion();
const WRECK_ID = 'seaplane-wreck';
const ROOF_Y = 3.1, ROOF_Z = 0.85; // the cabin roof over the seats (model frame): the wreck's perch
const PERCH_REACH = 4.2; // m from the fuselage's centre a swimmer can climb on from
const money$ = ( n ) => '$' + Math.round( n ).toLocaleString( 'en-US' );
// a point inside a naval yawBox ( { c, a: [ axes ], h: [ half extents ] } )
const inBox = ( b, x, y, z ) => {

	if ( ! b || ! b.c ) return false;
	const dx = x - b.c.x, dy = y - b.c.y, dz = z - b.c.z;
	for ( let i = 0; i < 3; i ++ ) if ( Math.abs( dx * b.a[ i ].x + dy * b.a[ i ].y + dz * b.a[ i ].z ) > b.h[ i ] ) return false;
	return true;

};

export class Seaplane {

	constructor( app, features, opts = {} ) {

		this.app = app || {};
		this.features = features || null;
		this.opts = opts;
		this.owned = false;
		this.hp = MAX_HP;
		this.piloted = false;
		this.flight = new Flight();
		this.pilot = new Pilot();
		this.flight.engineOn = false;
		this.flight.place( SITE.berth.x, SITE.berth.z, SITE.berth.heading );
		this.stats = { flights: 0, landings: 0, crashes: 0, maxAlt: 0 };
		this.log = []; // the last few judged events (tests, debugging)
		this._driven = false;
		this._wasAir = false;
		this._ver = - 1;
		this._tipShown = false;
		this._sinceExit = Infinity;
		this._swimHint = false;
		this._offs = [];
		this.lost = false; // wrecked: gone until recovered at the hangar
		this._wreck = null; // the pieces (Wreck.js) while any of them is still about
		this._wfx = null; // the wreck's effects clock
		this._wq = [ false, false, false, false ]; // water probe slots pointed at wreck pieces
		this._prevNose = null;
		this._perchBox = null;
		this._perchHint = false;
		this.stun = new Stun( this.app );

		const terrain = this.app.terrainData || null;
		this.terrain = terrain;
		if ( terrain && terrain.heightAt ) this.flight.groundAt = ( x, z ) => terrain.heightAt( x, z );

		// four float probes from the shared GPU water queries
		this.query = this.app.query || null;
		this.slot = - 1;
		if ( this.query && this.query.allocate ) {

			try { this.slot = this.query.allocate( ID, 4 ); } catch ( e ) { console.warn( 'seaplane: no water query slots left (sea level 0)', e ); }

		}

		this.flight.hasWater = false;

		const scene = this.app.scene || null;
		this.site = opts.site === false ? null : new SeaplaneSite( { scene, terrain, colliders: this.app.colliders || null, mesh: !! scene } );
		this.models = opts.models === false || ! scene ? null : new PlaneModels( { scene } );
		this.visual = this.models ? this.models.create() : null;
		this.remote = new RemotePlanes( { models: this.models } );
		this.audio = new PlaneAudio( this.app );
		this.panel = new SeaplanePanel( this );
		this.systems = new Systems( this.flight, this.pilot );
		this.lights = this.systems.lights; // the registry hands them to the scene's local lights
		this.cockpit = new Cockpit( this );
		this._startTip = false;
		this.autoCrank = opts.autoCrank !== false; // the throttle cranks a stopped engine (touch lever, pad trigger)

		// the Player's view of the plane while piloting (Player.enterVehicle)
		const f = this.flight;
		this.vehicle = {
			kind: 'plane',
			quaternion: f.quaternion,
			seat: GEOM.seat,
			eye: GEOM.eye,
			focus: [ 0, 2.4, - 0.6 ],
			chase: 17,
			toWorld: ( l, out ) => f.toWorldXYZ( l.x ?? l[ 0 ], l.y ?? l[ 1 ], l.z ?? l[ 2 ], out ),
			drive: ( dt ) => this.drive( dt ),
			exit: () => this.exit(),
			prompt: () => ( this.canExit() ? t( 'seaplane.climbOut', 'Climb out' ) : null ),
			speed: () => f.airspeed,
			heading: () => f.heading(),
			seaLevel: () => f.seaLevel(),
		};

		this.keys = {};
		if ( this.features && this.features.claimKey ) for ( const k of KEYS ) this.keys[ k ] = this.features.claimKey( k, ID );

		this._interact = [];
		if ( this.features && this.features.interactable ) {

			// the cabin door, from the jetty (or swimming beside it)
			this._interact.push( this.features.interactable( {
				id: 'seaplane-door',
				position: () => f.toWorldXYZ( GEOM.door[ 0 ], GEOM.door[ 1 ], GEOM.door[ 2 ], _v2 ),
				radius: 3.2,
				when: () => ! this.piloted && ! this._aboard() && ! this.lost,
				prompt: () => ( ! this.owned ? t( 'seaplane.forSale', 'Seaplane for sale · ask at the hangar' ) : this.hp <= 0 ? t( 'seaplane.broken', 'Seaplane · needs repair at the hangar' ) : t( 'seaplane.board', 'Fly the seaplane' ) ),
				onInteract: () => this.board(),
			} ) );
			this._interact.push( this.features.interactable( {
				id: 'seaplane-hangar',
				position: () => ( { x: SITE.office.x, y: this.site ? this.site.floorY : undefined, z: SITE.office.z } ),
				radius: 3.0,
				when: () => ! this.piloted,
				prompt: () => t( 'seaplane.hangar', 'Seaplane hangar' ),
				onInteract: () => this.open(),
			} ) );

		}

		this._place();

	}

	// ------------------------------------------------------------------ state

	get free() {

		const st = this.features && this.features.state;
		return !! ( ( st && st.free ) || ( this.features && this.features.sandbox ) );

	}

	get home() {

		return distToBerth( this.flight.position.x, this.flight.position.z ) < SITE.homeRadius;

	}

	// what raising and towing the wreck costs (the repair comes on top)
	recoveryCost() {

		return this.free ? 0 : CRASH.recovery;

	}

	// the wreck while its fuselage is still up (it sinks after CRASH.afloat s at sea; on land it stays), else null
	get wreck() {

		const w = this._wreck;
		return w && ! w.sunk ? w : null;

	}

	repairCost() {

		return this.free ? 0 : Math.round( ( MAX_HP - this.hp ) * REPAIR_PER_HP );

	}

	view() {

		const st = this.features && this.features.state;
		const money = st ? st.money : 0;
		const fuel = this.flight.fuel, fuelCost = refuelCost( fuel, this.free ), s = this.systems, f = this.flight;
		return {
			owned: this.owned, free: this.free, price: PRICE, money, hp: this.hp, home: this.home, piloted: this.piloted,
			canBuy: ! this.owned && ( this.free || money >= PRICE ), repairCost: this.repairCost(),
			canRepair: this.owned && ! this.lost && this.hp < MAX_HP && ( this.free || money >= this.repairCost() ),
			lost: this.lost, wreck: !! this.wreck, recoveryCost: this.recoveryCost(), canRecover: this.lost && ( this.free || money >= this.recoveryCost() ),
			sprung: this.flight.sprung[ 0 ] > 0 || this.flight.sprung[ 1 ] > 0,
			fuel, litres: fuel * FUEL.litres, tank: FUEL.litres, refuelCost: fuelCost,
			canRefuel: this.owned && this.home && fuel < 0.995 && ! f.airborne && ( this.free || money >= fuelCost ),
			cockpit: { master: s.master, engine: f.engineOn, cranking: s.cranking, nav: s.nav, landing: s.landing, ap: s.apOn, flaps: f.flaps, trim: this.pilot.trim, canExit: this.canExit() },
		};

	}

	isOpen() {

		return this.panel.isOpen;

	}

	open() {

		return this.panel.open();

	}

	close() {

		this.panel.close();

	}

	_toast( text, ms = 2600 ) {

		const g = this.app.game;
		if ( g && g.toast ) g.toast( text, ms );

	}

	_emit( name, data ) {

		if ( this.features && this.features.emit ) this.features.emit( name, { id: ID, ...data } );

	}

	buy() {

		if ( this.owned ) return { ok: false, text: t( 'seaplane.owned', 'The seaplane is already yours' ) };
		const st = this.features && this.features.state;
		if ( ! this.free ) {

			if ( ! st || ! st.spend || ! st.spend( PRICE ) ) return { ok: false, text: t( 'seaplane.short', 'Not enough money yet' ) };

		}

		this.owned = true;
		this.hp = MAX_HP;
		this._save();
		this._emit( 'seaplaneBought', { price: this.free ? 0 : PRICE } );
		return { ok: true, text: t( 'seaplane.bought', 'The seaplane is yours. Board it at the door from the jetty.' ) };

	}

	repair() {

		if ( this.lost ) return { ok: false, text: t( 'seaplane.recoverFirst', 'Recover the wreck first' ) };
		if ( ! this.owned || this.hp >= MAX_HP ) return { ok: false, text: t( 'seaplane.noRepair', 'Nothing to repair' ) };
		const cost = this.repairCost();
		const st = this.features && this.features.state;
		if ( cost > 0 && ( ! st || ! st.spend || ! st.spend( cost ) ) ) return { ok: false, text: t( 'seaplane.short', 'Not enough money yet' ) };
		this.hp = MAX_HP;
		this.flight.sprung[ 0 ] = this.flight.sprung[ 1 ] = 0;
		this._save();
		return { ok: true, text: t( 'seaplane.repaired', 'Repaired: good as new' ) };

	}

	// fill the tank at the ramp ($1 a litre in a campaign, free in the sandbox)
	refuel() {

		const f = this.flight;
		if ( ! this.owned ) return { ok: false, text: '' };
		if ( ! this.home || f.airborne ) return { ok: false, text: t( 'seaplane.refuelAway', 'Refuel at the ramp' ) };
		if ( f.fuel >= 0.995 ) return { ok: false, text: t( 'seaplane.full', 'The tank is full' ) };
		const cost = refuelCost( f.fuel, this.free );
		const st = this.features && this.features.state;
		if ( cost > 0 && ( ! st || ! st.spend || ! st.spend( cost ) ) ) return { ok: false, text: t( 'seaplane.short', 'Not enough money yet' ) };
		f.fuel = 1;
		this._save();
		return { ok: true, text: t( 'seaplane.refuelled', 'Tank full' ) + ( cost ? ` ($${ cost })` : '' ) };

	}

	// tow it home (left out at sea, or drifted off); a wreck is raised and towed by Captain Roid's crew for the recovery
	// fee and comes back to the ramp in pieces (the repair as before)
	recall() {

		if ( this.piloted ) return { ok: false, text: '' };
		if ( this.lost ) {

			const cost = this.recoveryCost();
			const st = this.features && this.features.state;
			if ( cost > 0 && ( ! st || ! st.spend || ! st.spend( cost ) ) ) return { ok: false, text: t( 'seaplane.short', 'Not enough money yet' ) + ` (${ money$( cost ) })` };
			this._clearWreck();
			this.lost = false;
			this._place();
			this._save();
			this._emit( 'seaplaneRecovered', { cost } );
			const rep = this.repairCost();
			return { ok: true, text: t( 'seaplane.recovered', "Captain Roid's crew raised the wreck and towed it to the ramp" ) + ( rep > 0 ? ` · ${ t( 'seaplane.repairNext', 'repair' ) } ${ money$( rep ) }` : '' ) };

		}

		this._place();
		return { ok: true, text: t( 'seaplane.towed', 'Towed back to the ramp' ) };

	}

	_save() {

		const st = this.features && this.features.state;
		if ( st && st.save ) try { st.save(); } catch ( e ) { /* the next autosave keeps it */ }

	}

	_place() {

		const f = this.flight;
		f.place( SITE.berth.x, SITE.berth.z, SITE.berth.heading );
		f.engineOn = false;
		f.flaps = f.flapPos = 0;
		f.clearStrikes();
		this.pilot.reset();
		if ( this.systems ) this.systems.reset();
		this._wasAir = false;
		this._syncVisual( 0 );

	}

	// ------------------------------------------------------------------ boarding

	board() {

		const p = this.app.player;
		if ( this.piloted ) return false;
		if ( ! this.owned || this.hp <= 0 || this.lost ) {

			this.open();
			return false;

		}

		if ( ! p || ! p.enterVehicle || this._aboard() ) return false;
		const f = this.flight;
		this.piloted = true;
		// the engine is cold: it starts on the starter (O, the panel's START, or opening the throttle)
		f.clearStrikes();
		this.pilot.reset();
		this.systems.ack();
		p.enterVehicle( this.vehicle );
		if ( ! this._tipShown ) {

			this._tipShown = true;
			this._toast( t( 'seaplane.tip', 'O or Shift starts the engine · Shift / C throttle · S pulls up near 28 m/s · V cockpit view' ), 4600 );

		}

		return true;

	}

	// aboard a boat (or riding another player's): the plane waits
	_aboard() {

		const p = this.app.player;
		return !! p && [ 'boat', 'deck', 'seat', 'ride' ].includes( p.mode );

	}

	// a swimmer beside the door climbs in with E (the game offers feature interactions only on foot / on deck)
	_swimmerBoard() {

		const p = this.app.player, inp = this.app.input;
		if ( ! p || p.mode !== 'swim' || ! this.owned || this.hp <= 0 || this.lost || this._sinceExit < 0.6 ) return;
		const d = this.flight.toWorldXYZ( GEOM.door[ 0 ], GEOM.door[ 1 ], GEOM.door[ 2 ], _v2 );
		if ( Math.hypot( d.x - p.position.x, d.z - p.position.z ) > 3.2 ) {

			this._swimHint = false;
			return;

		}

		if ( ! this._swimHint ) {

			this._swimHint = true;
			this._toast( t( 'seaplane.swimBoard', 'E: climb into the seaplane' ), 1800 );

		}

		if ( inp && inp.hit && inp.hit( 'KeyE' ) ) this.board();

	}

	canExit() {

		const f = this.flight;
		return this.piloted && ! f.airborne && f.airspeed < 3 && ( f.onWater || f.grounded );

	}

	// E while piloting: out onto the jetty at the ramp, into the water elsewhere, onto the sand when beached
	exit() {

		if ( ! this.piloted ) return false;
		if ( ! this.canExit() ) {

			this._toast( t( 'seaplane.slowDown', 'Slow down on the water to climb out' ), 1800 );
			return false;

		}

		this._leave();
		return true;

	}

	_leave() {

		const p = this.app.player, f = this.flight;
		this.piloted = false;
		this._sinceExit = 0; // (the same E press must not climb straight back in)
		this.systems.stop();
		f.controls.throttle = 0;
		if ( this.isOpen() ) this.close();
		this.pilot.reset();
		if ( ! p || ! p.exitVehicle ) return;
		const door = f.toWorldXYZ( GEOM.door[ 0 ] + 0.6, GEOM.door[ 1 ], GEOM.door[ 2 ], _v );
		const yaw = f.heading() + Math.PI;
		const jp = jettyPoint( door.x, door.z );
		const sea = f.seaLevel();
		const ground = this.terrain ? this.terrain.heightAt( door.x, door.z ) : - Infinity;
		if ( Math.hypot( jp.x - door.x, jp.z - door.z ) < 4 ) p.exitVehicle( jp.x, jp.y, jp.z, yaw - Math.PI / 2, 'walk' );
		else if ( ground > sea - 1.1 ) p.exitVehicle( door.x, Math.max( ground, sea - 1.1 ), door.z, yaw, 'walk' );
		else p.exitVehicle( door.x, sea - 0.2, door.z, yaw, 'swim', sea );

	}

	// ------------------------------------------------------------------ per frame

	// the pilot's keys / pad (Player.updatePlane calls this before it places the camera)
	_keysNow() {

		const inp = this.app.input;
		if ( ! inp || ! inp.down || ( this.features && this.features.panelOpen && this.features.panelOpen() ) ) return {};
		const d = ( c ) => !! inp.down( c );
		return {
			up: d( 'KeyW' ), down: d( 'KeyS' ), left: d( 'KeyA' ), right: d( 'KeyD' ),
			throttleUp: d( 'ShiftLeft' ) || d( 'ShiftRight' ), throttleDown: d( THROTTLE_DOWN ),
			yawLeft: d( 'Comma' ), yawRight: d( 'Period' ),
			trimUp: d( 'Equal' ) || d( 'NumpadAdd' ), trimDown: d( 'Minus' ) || d( 'NumpadSubtract' ),
		};

	}

	_padNow() {

		if ( typeof navigator === 'undefined' || ! navigator.getGamepads ) return null;
		let p = null;
		try { for ( const g of navigator.getGamepads() ) if ( g && g.connected ) { p = g; break; } } catch ( e ) { return null; }
		if ( ! p ) return null;
		const dz = ( v ) => ( Math.abs( v || 0 ) < 0.18 ? 0 : ( v - Math.sign( v ) * 0.18 ) / 0.82 );
		const bv = ( i ) => ( p.buttons[ i ] ? p.buttons[ i ].value || ( p.buttons[ i ].pressed ? 1 : 0 ) : 0 );
		// left stick: roll and pitch (pulled back = nose up), triggers: throttle, d-pad left / right: rudder
		return { roll: dz( p.axes[ 0 ] ), pitch: dz( p.axes[ 1 ] ), throttle: bv( 7 ) - bv( 6 ), yaw: bv( 15 ) - bv( 14 ) };

	}

	drive( dt ) {

		this._driven = true;
		const keys = this._keysNow(), pad = this._padNow();
		this._cockpitKeys();
		// opening the throttle with the engine off cranks it (the touch lever and a pad trigger have no START key)
		const f = this.flight;
		if ( ! f.engineOn && ! this.systems.cranking && f.fuel > 0 && ( keys.throttleUp || ( pad && pad.throttle > 0.3 ) ) && this.autoCrank ) this.act( 'engine', 'throttle' );
		this.pilot.read( keys, pad, f, dt );
		const drop = this.pilot.ap.dropped;
		if ( drop ) {

			this.pilot.ap.dropped = null;
			this.audio.click( 'switch' );
			this._toast( drop === 'water' ? t( 'seaplane.apWater', 'Autopilot off: on the water' ) : t( 'seaplane.apOff', 'Autopilot off: you have the stick' ), 1800 );

		}

		this._step( dt );

	}

	// the cockpit's keys (pressed this frame) while piloting
	_cockpitKeys() {

		const inp = this.app.input;
		if ( ! inp || ! inp.hit ) return;
		const open = !! ( this.features && this.features.panelOpen && this.features.panelOpen() );
		for ( const code in COCKPIT_KEYS ) {

			// with a panel open only 3 (closing the switch panel) is ours
			if ( open && code !== 'Digit3' ) continue;
			if ( inp.hit( code ) ) this.act( COCKPIT_KEYS[ code ], 'key' );

		}

	}

	// a panel control (the cockpit's click, its key, the touch switch panel): what it does, a click and a word
	act( id, how = 'click' ) {

		const f = this.flight, s = this.systems, pilot = this.pilot;
		if ( ! this.piloted ) return false;
		let ok = true, text = null, sound = 'switch';
		switch ( id ) {

			case 'engine': {

				if ( f.engineOn || s.cranking ) {

					s.stop();
					text = t( 'seaplane.engineOff', 'Engine off' );
					break;

				}

				const r = s.start();
				ok = r.ok;
				sound = 'clunk';
				if ( r.why === 'master' ) text = t( 'seaplane.needMaster', 'The master switch is off (U)' );
				else if ( r.why === 'fuel' ) text = t( 'seaplane.noFuel', 'The tank is empty: refuel at the ramp, or tow it home from the hangar' );
				else if ( r.ok && how === 'throttle' && ! this._startTip ) {

					this._startTip = true;
					text = t( 'seaplane.cranking', 'Starting the engine...' );

				}

				break;

			}

			case 'master': case 'nav': case 'landing': {

				const on = s.toggle( id );
				if ( id === 'master' ) text = on ? t( 'seaplane.masterOn', 'Master on' ) : t( 'seaplane.masterOff', 'Master off: panel and lights dark' );
				else if ( ! s.master ) text = t( 'seaplane.needMaster', 'The master switch is off (U)' );
				break;

			}

			case 'flapsUp': case 'flapsDown': {

				const was = f.flaps;
				f.flaps = Math.max( 0, Math.min( 2, Math.round( f.flaps ) + ( id === 'flapsDown' ? 1 : - 1 ) ) );
				ok = f.flaps !== was;
				sound = 'clunk';
				if ( ok ) text = [ t( 'seaplane.flaps0', 'Flaps up' ), t( 'seaplane.flaps1', 'Flaps 1: takeoff' ), t( 'seaplane.flaps2', 'Flaps 2: landing' ) ][ f.flaps ];
				break;

			}

			case 'trimUp': case 'trimDown':
				pilot.trim = Math.max( - 1, Math.min( 1, pilot.trim + ( id === 'trimUp' ? 0.1 : - 0.1 ) ) );
				break;

			case 'ap':
				if ( s.apOn ) {

					pilot.disengageAutopilot();
					text = t( 'seaplane.apOffShort', 'Autopilot off' );

				} else if ( ! s.master ) {

					ok = false;
					text = t( 'seaplane.needMaster', 'The master switch is off (U)' );

				} else if ( pilot.engageAutopilot( f ) ) text = t( 'seaplane.apOn', 'Autopilot on: wings level, holding' ) + ` ${ Math.round( Math.max( 0, f.position.y - f.seaLevel() ) ) } m`;
				else {

					ok = false;
					text = t( 'seaplane.apGround', 'The autopilot works in the air' );

				}

				break;

			case 'warn':
				s.ack();
				break;

			case 'map': {

				const wm = this.features && this.features.get ? this.features.get( 'worldmap' ) : null;
				ok = !! ( wm && wm.toggle );
				if ( ok ) {

					if ( this.isOpen() ) this.close();
					wm.toggle();

				}

				break;

			}

			case 'panel':
				if ( this.isOpen() ) this.close();
				else this.open();
				break;

			case 'exit':
				if ( this.isOpen() ) this.close();
				ok = this.exit();
				break;

			default:
				return false;

		}

		this.audio.click( ok ? sound : 'switch' );
		if ( text ) this._toast( text, 1600 );
		if ( this.isOpen() && id !== 'panel' ) this.panel.render();
		return ok;

	}

	_readWater() {

		const q = this.query, f = this.flight;
		if ( ! q || this.slot < 0 || ! q.cpuValid ) {

			f.hasWater = false;
			return;

		}

		if ( q.version === this._ver ) return;
		this._ver = q.version;
		for ( let i = 0; i < 4; i ++ ) {

			const h = q.cpu[ ( this.slot + i ) * 4 ];
			if ( Number.isFinite( h ) ) f.setWater( i, h, 0 );

		}

		f.hasWater = true;
		f.resetWaterAge();

	}

	_queueWater() {

		const q = this.query, f = this.flight;
		if ( ! q || this.slot < 0 || ! q.setPoint ) return;
		const lead = q.latency || 0.05;
		for ( let i = 0; i < 4; i ++ ) {

			f.probeWorld( i, _v, lead );
			q.setPoint( this.slot + i, _v.x, _v.z );

		}

	}

	_step( dt ) {

		const f = this.flight;
		this._readWater();
		for ( const ev of this.systems.update( dt, { hp: this.hp } ) ) {

			if ( ev === 'noStart' && this.piloted ) this._toast( t( 'seaplane.noStart', 'The engine did not catch' ), 1600 );

		}

		f.update( dt );
		this._obstacles();
		const crashes = this.stats.crashes;
		for ( const e of f.drainEvents() ) {

			if ( e.type === 'fuelOut' ) {

				this.systems.stop();
				if ( this.piloted ) this._toast( t( 'seaplane.fuelOut', 'Out of fuel: the engine stopped. Glide down onto the water.' ), 4200 );
				continue;

			}

			this._event( e );
			if ( this.stats.crashes !== crashes ) break; // the rest of that step's strikes belong to the same wreck

		}

		if ( this.lost ) return; // (wrecked this step: the wreck draws itself now)
		this._queueWater();
		if ( f.airborne ) this.stats.maxAlt = Math.max( this.stats.maxAlt, f.agl );
		this._syncVisual( dt );

	}

	_syncVisual( dt ) {

		const f = this.flight;
		if ( this.visual ) {

			this.visual.setPose( f.position, f.quaternion );
			this.visual.spin( dt, f.rpm ); // (winding down after a stop, turning over on the starter)

		}

		const c = f.toWorldXYZ( GEOM.prop[ 0 ], GEOM.prop[ 1 ], GEOM.prop[ 2 ], _v2 );
		const p = this.app.player;
		const s = this.systems;
		this.audio.update( dt, {
			running: f.engineOn, rpm: f.rpm, airspeed: f.airspeed, x: c.x, y: c.y, z: c.z, inside: this.piloted && p && p.view === 'first',
			cranking: !! ( s && s.cranking ), flaps: Math.abs( f.flapPos - f.flaps ) > 0.01, horn: !! ( s && this.piloted && s.stallWarn ),
		} );

	}

	_event( e ) {

		const f = this.flight, r = judge( e, this.hp );
		this.log.push( { e, r } );
		if ( this.log.length > 24 ) this.log.shift();
		const x = f.position.x, z = f.position.z;
		const vfx = this.features && this.features.get ? this.features.get( 'vfx' ) : null;
		const fwd = _v.set( 0, 0, 1 ).applyQuaternion( f.quaternion );
		if ( r.kind === 'tookOff' ) {

			this.stats.flights ++;
			this._emit( 'planeTookOff', { x, z } );
			vfx?.spray?.( x, f.seaLevel(), z, 0.8, - fwd.x, - fwd.z );
			return;

		}

		if ( r.kind === 'landed' || r.kind === 'bounce' ) {

			if ( e.type === 'touch' ) {

				this.stats.landings ++;
				this._emit( 'planeLanded', { onWater: !! r.onWater, x, z, sink: e.sink } );
				if ( r.onWater ) vfx?.spray?.( x, f.seaLevel(), z, Math.min( 1.5, 0.6 + ( e.sink || 0 ) * 0.25 ), - fwd.x, - fwd.z );

			}

			if ( r.kind === 'bounce' ) this._rough( r, e );
			return;

		}

		if ( r.kind === 'crash' ) this._crash( r.text || 'The seaplane crashed', e, r );

	}

	// a rough landing (or a part dipped / clipped): hull damage, a float sprung, a splash and a bang; the pilot stays aboard
	_rough( r, e ) {

		const f = this.flight, x = f.position.x, z = f.position.z;
		const vfx = this.features && this.features.get ? this.features.get( 'vfx' ) : null;
		this.hp = Math.max( 1, this.hp - r.damage );
		if ( r.sprung ) {

			const i = r.sprung === 'L' ? 0 : 1;
			f.sprung[ i ] = Math.min( 1, f.sprung[ i ] + 0.6 );

		}

		const water = ! e.surface || e.surface === 'water';
		if ( water ) vfx?.splash?.( x, f.seaLevel(), z, 1.1 );
		else vfx?.splinters?.( x, f.position.y + 2, z, 0.7 );
		this.audio.crunch( 0.45, x, f.position.y + 1, z, water );
		this._toast( `${ r.text } (${ Math.round( this.hp ) }%)`, 2600 );
		if ( this.piloted ) this.app.cameraFeel?.kick?.( 'hit' );

	}

	// a wreck (or a direct collision): the plane breaks up where it hit and is gone until recovered; the pilot is thrown
	// clear (alive) unless it was a direct collision (playerDied, or the jetty without the death feature)
	_crash( cause, e = null, r = null ) {

		const f = this.flight;
		const x = f.position.x, y = f.position.y, z = f.position.z;
		const sea = f.seaLevel();
		const ground = this.terrain && this.terrain.heightAt ? this.terrain.heightAt( x, z ) : - Infinity;
		const surf = e && e.surface;
		const water = surf === 'water' || ( surf !== 'ground' && ground < sea - 0.5 );
		// (a bare _crash( cause ), without a judged event, is the old fatal crash: test/feature-death.mjs drives it so)
		const severity = r ? ( r.severity === 'death' ? 'death' : 'wreck' ) : 'death';
		const speed = r && Number.isFinite( r.speed ) && r.speed > 0 ? r.speed : f.velocity.length();
		this.stats.crashes ++;
		this.hp = this.free ? MAX_HP : 0;
		const cost = this.repairCost();
		const wasPiloted = this.piloted;
		this.piloted = false;
		this.systems.stop();
		f.controls.throttle = 0;
		this.pilot.reset();
		if ( this.isOpen() ) this.close();
		this.lost = true;
		this._breakUp( e, severity, water, wasPiloted );
		const p = this.app.player;
		const death = this.features && this.features.get ? this.features.get( 'death' ) : null;
		let died = false, thrown = null;
		if ( wasPiloted && p && p.exitVehicle ) {

			if ( severity === 'death' && death ) {

				// a direct collision kills the pilot: out of the cockpit where it hit, and the death feature
				// (src/features/death) cuts to black, leaves the sea chest there and wakes you at Jade Landing
				if ( water ) p.exitVehicle( x, sea - 0.3, z, p.yaw, 'swim', sea );
				else p.exitVehicle( x, y, z, p.yaw, 'walk' );
				died = true;

			} else if ( severity === 'death' ) {

				// (no death feature) rescued and set down on the jetty
				const jp = jettyPoint( SITE.berth.x + 3, SITE.berth.z - 4 );
				p.exitVehicle( jp.x, jp.y, jp.z, Math.PI, 'walk' );

			} else thrown = this._throwClear( e, r, water, sea );

		}

		const recovery = this.recoveryCost();
		this._emit( 'planeCrashed', { cause, x, y, z, cost, severity, speed, water, recovery } );
		if ( died ) this._emit( 'playerDied', { cause: 'seaplane', text: cause, x, y: water ? sea : y, z } );
		this._save();
		const bill = this.free ? '' : ` ${ t( 'seaplane.recoverAt', 'Recover it at the hangar' ) } (${ money$( recovery ) } + ${ t( 'seaplane.repairNext', 'repair' ) } ${ money$( cost ) }).`;
		if ( ! died ) this._toast( thrown ? `${ cause }. ${ t( 'seaplane.thrownClear', 'You were thrown clear.' ) }${ bill }` : `${ cause }.${ bill || ' ' + t( 'seaplane.recoverFree', 'Recover it at the hangar.' ) }`, 5600 );
		return thrown;

	}

	// out of the breaking plane: a few metres clear of the hull into the water or onto the ground, a black-out, hurt
	_throwClear( e, r, water, sea ) {

		const p = this.app.player, w = this._wreck;
		const o = { x: w.x, y: w.y, z: w.z, yaw: w.yaw };
		const terrain = this.terrain;
		const env = {
			seaLevel: sea,
			groundAt: ( x, z ) => ( terrain && terrain.heightAt ? terrain.heightAt( x, z ) : - Infinity ),
			jetty: ( x, z ) => jettyPoint( x, z ),
			solidAt: ( x, y, z ) => !! this._solidAt( x, y, z ),
		};
		// away from the side that hit (the port door otherwise)
		const side = e && e.side > 0 ? - 1 : 1;
		const tp = throwPoint( o, side, env, this._rand || Math.random );
		const yaw = Math.atan2( o.x - tp.x, o.z - tp.z ) + Math.PI; // facing the wreck (Player yaw 0 faces -Z)
		p.exitVehicle( tp.x, tp.y, tp.z, yaw, tp.mode, tp.mode === 'swim' ? sea : null );
		this._sinceExit = 0;
		this.stun.start( CRASH.stun );
		const hurt = r && r.hurt ? r.hurt : CRASH.hurt[ 0 ];
		const melee = this.features && this.features.get ? this.features.get( 'melee' ) : null;
		const c = melee && melee.combat;
		if ( c && Number.isFinite( c.hp ) ) {

			c.hp = Math.max( 1, c.hp - hurt ); // hurt, never killed by the throw
			if ( 'sinceHurt' in c ) c.sinceHurt = 0;

		}

		this.thrown = { ...tp, hurt };
		return this.thrown;

	}

	// the wreck: the pieces (Wreck.js), the GLB's parts torn off the visual, the impact's effects
	_breakUp( e, severity, water, piloted ) {

		const f = this.flight;
		const seed = Number.isFinite( this.opts.seed ) ? this.opts.seed + this.stats.crashes : ( Math.random() * 1e9 ) | 0;
		if ( this._wreck ) this._clearWreck(); // (a second wreck replaces a first that was never recovered)
		const w = new Wreck( { position: f.position, quaternion: f.quaternion, velocity: f.velocity, angular: f.angular, seed } );
		this._rand = w.rand;
		for ( const n of wreckParts( e || {}, severity, w.rand ) ) w.detach( n );
		this._wreck = w;
		this._wq.fill( false );
		if ( this.visual ) for ( const n of w.detached ) this.visual.detach( n );
		const sea = f.seaLevel();
		this._wSea = sea;
		this._wfx = { t: 0, smokeT: 0, bubbleT: 0, markT: 0, fire: false, water, rpm: f.rpm };
		f.velocity.set( 0, 0, 0 );
		f.angular.set( 0, 0, 0 );
		f.engineOn = false;
		f.rpm = 0;
		// the impact
		const vfx = this.features && this.features.get ? this.features.get( 'vfx' ) : null;
		const x = w.x, y = w.y, z = w.z;
		const eng = _v3.copy( w.fuselage.c ).add( _v.set( 0, 0.4, 2.6 ).applyQuaternion( w.fuselage.q ) );
		if ( water ) {

			vfx?.splash?.( x, sea, z, 2.6 );

		} else {

			const g = this.terrain && this.terrain.heightAt ? this.terrain.heightAt( x, z ) : y;
			vfx?.dust?.( x, g, z, 2.2 );
			vfx?.debris?.( x, g + 1, z, 1.3, 'dirt' );
			vfx?.flash?.( eng.x, eng.y, eng.z, 1.2 );
			vfx?.fire?.( WRECK_ID, eng.x, eng.y, eng.z, 1.2 );
			this._wfx.fire = true;

		}

		vfx?.splinters?.( x, y + 1.5, z, 1.6 );
		vfx?.debris?.( x, y + 1.5, z, 1.3, 'wood' );
		vfx?.debris?.( x, y + 1.5, z, 0.8, 'metal' );
		vfx?.smoke?.( eng.x, eng.y, eng.z, 1.2 );
		this.audio.crunch( 1.7, x, y, z, water );
		const cf = this.app.cameraFeel;
		if ( cf && cf.kick ) {

			if ( piloted ) cf.kick( 'broadside', { scale: 1.6 } );
			else cf.kick( 'explosion', { x, y, z, radius: 8, energy: 2e5 } );

		}

		this._syncWreck();
		this._mark( true );

	}

	// the water under a wreck piece: the plane's four probe slots follow the first four pieces, the rest (and a missing
	// query) use the sea level where it went down
	_seaAt( x, z, i ) {

		const q = this.query;
		let h = this._wSea ?? 0;
		if ( q && this.slot >= 0 && i < 4 && q.setPoint ) {

			if ( this._wq[ i ] && q.cpuValid ) {

				const v = q.cpu[ ( this.slot + i ) * 4 ];
				if ( Number.isFinite( v ) ) h = v;

			}

			q.setPoint( this.slot + i, x, z );
			this._wq[ i ] = true;

		}

		return h;

	}

	_updateWreck( dt ) {

		const w = this._wreck, fx = this._wfx;
		if ( ! w ) return;
		const terrain = this.terrain;
		const events = w.update( dt, { seaAt: ( x, z, i ) => this._seaAt( x, z, i ), groundAt: ( x, z ) => ( terrain && terrain.heightAt ? terrain.heightAt( x, z ) : - Infinity ) } );
		const vfx = this.features && this.features.get ? this.features.get( 'vfx' ) : null;
		for ( const ev of events ) this._wreckEvent( ev, vfx );
		fx.t += dt;
		const fus = w.fuselage, up = fus.state !== 'gone';
		// the engine dies: a last cough, then quiet
		this.audio.update( dt, { running: fx.t < 0.35 && fx.rpm > 0.1, rpm: fx.rpm * Math.exp( - fx.t * 2 ), airspeed: 0, x: w.x, y: w.y, z: w.z, inside: false } );
		const eng = _v3.copy( fus.c ).add( _v.set( 0, 0.4, 2.6 ).applyQuaternion( fus.q ) );
		if ( fx.fire && ( fx.t > CRASH.fire || ! up || fus.state === 'sinking' ) ) {

			vfx?.stopFire?.( WRECK_ID );
			fx.fire = false;

		} else if ( fx.fire ) vfx?.fire?.( WRECK_ID, eng.x, eng.y, eng.z, 1.2 * ( 1 - fx.t / CRASH.fire ) + 0.3 );

		fx.smokeT -= dt;
		if ( up && fx.t < CRASH.smoke && fx.smokeT <= 0 && eng.y > ( this._wSea ?? 0 ) - 0.2 ) {

			fx.smokeT = 0.3;
			vfx?.smoke?.( eng.x, eng.y + 0.3, eng.z, 0.25 + 0.9 * ( 1 - fx.t / CRASH.smoke ) );

		}

		fx.bubbleT -= dt;
		if ( fus.state === 'sinking' && fx.bubbleT <= 0 ) {

			fx.bubbleT = 0.45;
			vfx?.bubbles?.( fus.c.x, this._wSea ?? 0, fus.c.z, 1.2 );

		}

		fx.markT -= dt;
		if ( fx.markT <= 0 ) {

			fx.markT = 1;
			this._mark( true );

		}

		this._syncWreck();
		this._perch( fus );
		// everything gone under: the pieces are done (the plane stays lost until recovered)
		let left = false;
		for ( const b of w.bodies.values() ) if ( b.state !== 'gone' ) left = true;
		if ( ! left ) {

			this._dropPerch();
			vfx?.stopFire?.( WRECK_ID );
			this._mark( true );
			this._wreck = null;
			this._wfx = null;

		}

	}

	_wreckEvent( ev, vfx ) {

		const big = ev.name === 'fuselage';
		if ( ev.type === 'splash' ) {

			vfx?.splash?.( ev.x, ev.y, ev.z, ev.strength * ( big ? 1 : 0.7 ) );
			if ( ! big ) vfx?.splinters?.( ev.x, ev.y + 0.3, ev.z, 0.5 );

		} else if ( ev.type === 'land' ) {

			vfx?.dust?.( ev.x, ev.y, ev.z, ev.strength );
			vfx?.debris?.( ev.x, ev.y + 0.4, ev.z, ev.strength * 0.6, big ? 'metal' : 'wood' );

		} else if ( ev.type === 'sinking' && big ) {

			vfx?.sinking?.( WRECK_ID, ev.x, ev.z, 1.8 );
			if ( this._near( ev.x, ev.z, 120 ) ) this._toast( t( 'seaplane.wreckSinking', 'The seaplane wreck is going down' ), 2600 );

		} else if ( ev.type === 'sunk' && big ) {

			this._mark( true ); // (relabelled: where it went down)
			if ( this._near( ev.x, ev.z, 200 ) ) this._toast( t( 'seaplane.wreckSunk', "The wreck sank. Captain Roid's crew can raise it: see the hangar." ), 4200 );

		}

	}

	_near( x, z, r ) {

		const p = this.app.player && this.app.player.position;
		return ! p || Math.hypot( p.x - x, p.z - z ) < r;

	}

	// the visual follows the pieces: the plane's group is the fuselage, the torn-off parts their own groups
	_syncWreck() {

		const w = this._wreck, v = this.visual;
		if ( ! w || ! v ) return;
		if ( w.pose( 'fuselage', _v, _q ) ) v.setPose( _v, _q );
		v.setVisible( w.fuselage.state !== 'gone' );
		for ( const n of w.detached ) {

			const on = w.pose( n, _v, _q );
			v.setPart( n, _v, _q );
			v.partVisible( n, on );

		}

	}

	// the wreck's pin on the world map and the minimap
	_mark( on ) {

		const wm = this.features && this.features.get ? this.features.get( 'worldmap' ) : null;
		if ( ! wm || ! wm.addMarker ) return;
		const w = this._wreck;
		if ( on && w ) wm.addMarker( { id: WRECK_ID, kind: 'wreck', icon: 'wreck', x: w.x, z: w.z, label: w.sunk ? t( 'seaplane.wreckSunkPin', 'Seaplane wreck (sunk)' ) : t( 'seaplane.wreckPin', 'Seaplane wreck' ) } );
		else if ( ! on && wm.removeMarker ) wm.removeMarker( WRECK_ID );

	}

	// the floating fuselage's cabin roof is a perch: a walkable collider box that rides it (a swimmer beside it climbs on
	// with E, or swims onto it); it goes when the fuselage starts to sink (you are back in the water) or on land
	_perch( fus ) {

		const col = this.app.colliders, p = this.app.player;
		const want = !! ( fus && fus.state === 'afloat' && col && col.addBox );
		let b = this._perchBox;
		if ( ! want ) {

			if ( b ) this._dropPerch();
			return;

		}

		const yaw = this._wreck.yaw;
		const top = _v3.copy( fus.c ).add( _v.set( 0, ROOF_Y - GEOM.com[ 1 ], ROOF_Z ).applyQuaternion( fus.q ) );
		if ( ! b ) b = this._perchBox = col.addBox( new Vector3( top.x, top.y - 0.15, top.z ), new Vector3( 0.55, 0.15, 1.75 ), yaw, { walkable: true, solid: false, tag: 'seaplane-wreck' } );
		b.center.set( top.x, top.y - 0.15, top.z );
		b.rotY = yaw;
		b.cos = Math.cos( yaw );
		b.sin = Math.sin( yaw );
		b.top = top.y;
		b.bottom = top.y - 0.3;
		// a swimmer beside it: E climbs onto the roof
		if ( ! p || p.mode !== 'swim' || ! p.exitVehicle ) return;
		if ( Math.hypot( p.position.x - fus.c.x, p.position.z - fus.c.z ) > PERCH_REACH ) {

			this._perchHint = false;
			return;

		}

		if ( ! this._perchHint ) {

			this._perchHint = true;
			this._toast( t( 'seaplane.perchHint', 'E: climb onto the wreck' ), 1800 );

		}

		const inp = this.app.input;
		if ( inp && inp.hit && inp.hit( 'KeyE' ) ) p.exitVehicle( top.x, top.y, top.z, p.yaw, 'walk' );

	}

	_dropPerch() {

		const b = this._perchBox, col = this.app.colliders;
		this._perchBox = null;
		if ( ! b || ! col || ! col.boxes ) return;
		const i = col.boxes.indexOf( b );
		if ( i >= 0 ) col.boxes.splice( i, 1 );

	}

	// the pieces gone (recovered, a new game): the plane whole again
	_clearWreck() {

		this._dropPerch();
		const vfx = this.features && this.features.get ? this.features.get( 'vfx' ) : null;
		if ( this._wfx && this._wfx.fire ) vfx?.stopFire?.( WRECK_ID );
		this._wreck = null;
		this._wfx = null;
		this._wq.fill( false );
		if ( this.visual ) {

			this.visual.reassemble();
			this.visual.setVisible( true );

		}

		this._mark( false );

	}

	// ships, buildings and rocks: what a STRIKE point is inside of ('ship' | 'object' | null)
	_solidAt( x, y, z ) {

		const nv = this.features && this.features.get ? this.features.get( 'naval' ) : null;
		if ( nv && nv.ships ) {

			for ( const sh of nv.ships ) {

				if ( ! sh || sh.alive === false || Math.abs( sh.x - x ) > 45 || Math.abs( sh.z - z ) > 45 ) continue;
				try {

					if ( inBox( sh.hullBox && sh.hullBox(), x, y, z ) || inBox( sh.riggingBox && sh.riggingBox(), x, y, z ) ) return 'ship';

				} catch ( err ) { /* a ship without its pose yet */ }

			}

		}

		// solid colliders (buildings, rocks, the hangar); decks and jetties are walkable and left out
		const col = this.app.colliders;
		if ( col && col.boxes ) {

			for ( const b of col.boxes ) {

				if ( ! b.solid || b.walkable || y > b.top || y < b.bottom ) continue;
				const dx = x - b.center.x, dz = z - b.center.z;
				if ( dx * dx + dz * dz > b.radius * b.radius ) continue;
				const lx = dx * b.cos - dz * b.sin, lz = dx * b.sin + dz * b.cos;
				if ( Math.abs( lx ) <= b.half.x && Math.abs( lz ) <= b.half.z ) return 'object';

			}

		}

		return null;

	}

	// strikes against ships / buildings (the STRIKE points) and destruction props (along the nose's path this frame)
	_obstacles() {

		const f = this.flight, v = f.velocity.length();
		const nose = f.toWorldXYZ( 0, 2.2, 4.0, _nose );
		const prev = this._prevNose;
		if ( v < CRASH.dip ) {

			this._prevNose = null;
			return;

		}

		const nf = f.noseFirst();
		for ( const [ part, x, y, z ] of STRIKE ) {

			const key = part + 'S';
			if ( f._struck.has( key ) ) continue;
			const pw = f.toWorldXYZ( x, y, z, _v3 );
			const kind = this._solidAt( pw.x, pw.y, pw.z );
			if ( ! kind ) continue;
			f._struck.add( key );
			f.events.push( { type: 'strike', part, surface: kind, speed: v, nose: nf, side: Math.sign( x ) } );

		}

		const d = this.features && this.features.get ? this.features.get( 'destruction' ) : null;
		if ( prev && d && d.raycastSegment && ! f._struck.has( 'noseP' ) ) {

			const hit = d.raycastSegment( prev.x, prev.y, prev.z, nose.x, nose.y, nose.z );
			if ( hit ) {

				f._struck.add( 'noseP' );
				f.events.push( { type: 'strike', part: 'nose', surface: 'prop', speed: v, nose: nf, side: 0, prop: hit.id } );

			}

		}

		this._prevNose = ( prev || new Vector3() ).copy( nose );

	}

	update( dt ) {

		const f = this.flight, p = this.app.player;
		this._sinceExit += dt;
		this.stun.update( dt );
		// something else took the player out of the cockpit (a rescue, a respawn, the free camera reset)
		if ( this.piloted && p && ( p.mode !== 'plane' || p.vehicle !== this.vehicle ) ) {

			this.piloted = false;
			this.systems.stop();
			this.pilot.reset();
			if ( this.isOpen() ) this.close();

		}

		if ( this.lost ) {

			// wrecked: the pieces float, burn and sink (Wreck.js); the plane itself is gone until recovered
			this._driven = false;
			this._updateWreck( dt );

		} else if ( this.piloted ) {

			// Player.updatePlane already stepped it this frame; otherwise (free camera, paused player) keep it flying
			if ( ! this._driven ) this._step( dt );
			this._driven = false;

		} else {

			this._idle( dt );
			this._swimmerBoard();

		}

		this.cockpit.update( dt );
		this.remote.update( dt );

	}

	// while flying the left button works the panel (Game skips the rod's cast / strike)
	wantsMouse() {

		return this.piloted;

	}

	// unattended: the engine is off; at the ramp the mooring lines hold it at the berth, elsewhere a sea anchor
	_idle( dt ) {

		const f = this.flight;
		if ( f.engineOn || this.systems.cranking ) this.systems.stop();
		const c = f.controls;
		c.throttle = c.pitch = c.roll = c.yaw = c.waterRudder = 0;
		const cam = this.app.camera && this.app.camera.position;
		if ( cam && Math.hypot( cam.x - f.position.x, cam.z - f.position.z ) > SIM_RANGE && ! f.airborne ) {

			this._syncVisual( dt );
			return;

		}

		if ( ! f.airborne && f.onWater ) {

			const k = 1 - Math.exp( - dt * ( this.home ? 0.9 : 0.4 ) );
			if ( this.home ) {

				// mooring lines: pull to the berth and turn to its heading
				const b = SITE.berth;
				f.velocity.x += ( ( b.x - f.position.x ) * 0.25 - f.velocity.x ) * k;
				f.velocity.z += ( ( b.z - f.position.z ) * 0.25 - f.velocity.z ) * k;
				let dh = b.heading - f.heading();
				dh = Math.atan2( Math.sin( dh ), Math.cos( dh ) );
				f.angular.y += ( dh * 0.4 - f.angular.y ) * k;

			} else {

				f.velocity.x -= f.velocity.x * k;
				f.velocity.z -= f.velocity.z * k;

			}

		}

		this._step( dt );

	}

	// ------------------------------------------------------------------ maps and multiplayer

	marker() {

		if ( this.lost ) return null; // (the wreck has its own pin)
		const f = this.flight;
		return { x: f.position.x, z: f.position.z, heading: f.heading(), owned: this.owned, flying: this.piloted && f.airborne };

	}

	decorateState( out ) {

		if ( ! out || ! this.piloted ) return out;
		const f = this.flight, p = f.position, q = f.quaternion;
		const r = ( v ) => Math.round( v * 1000 ) / 1000;
		out.plane = { p: [ r( p.x ), r( p.y ), r( p.z ) ], q: [ r( q.x ), r( q.y ), r( q.z ), r( q.w ) ], thr: r( f.rpm ) };
		// the avatar faces the nose for clients that do not know mode 'plane' yet (Player yaw convention: 0 faces -Z)
		out.yaw = f.heading() + Math.PI;
		return out;

	}

	updateRemote( states ) {

		const net = this.app.net;
		if ( net && net.id ) this.remote.localId = net.id;
		this.remote.ingest( states );

	}

	// ------------------------------------------------------------------ save

	toJSON() {

		const sp = this.flight.sprung;
		return { owned: this.owned, hp: Math.round( this.hp ), fuel: Math.round( this.flight.fuel * 1000 ) / 1000, switches: this.systems.toJSON(), stats: { ...this.stats }, lost: this.lost, sprung: [ sp[ 0 ], sp[ 1 ] ] };

	}

	fromJSON( d ) {

		if ( ! d || typeof d !== 'object' ) return;
		this.owned = d.owned === true;
		this.hp = Number.isFinite( d.hp ) ? Math.max( 0, Math.min( MAX_HP, d.hp ) ) : MAX_HP;
		this.flight.fuel = Number.isFinite( d.fuel ) ? Math.max( 0, Math.min( 1, d.fuel ) ) : 1; // (older saves: a full tank)
		this.systems.fromJSON( d.switches );
		if ( d.stats && typeof d.stats === 'object' ) for ( const k of Object.keys( this.stats ) ) if ( Number.isFinite( d.stats[ k ] ) ) this.stats[ k ] = d.stats[ k ];
		// a wreck left unrecovered: gone (its pieces are not saved: it sank / was picked over while you were away)
		this._clearWreck();
		this.lost = d.lost === true && this.owned;
		const sp = Array.isArray( d.sprung ) ? d.sprung : [];
		for ( let i = 0; i < 2; i ++ ) this.flight.sprung[ i ] = Number.isFinite( sp[ i ] ) ? Math.max( 0, Math.min( 1, sp[ i ] ) ) : 0;
		if ( ! this.piloted ) this._place();
		if ( this.lost && this.visual ) this.visual.setVisible( false );

	}

	reset() {

		const p = this.app.player;
		if ( this.piloted && p && p.exitVehicle ) {

			this.piloted = false;
			const jp = jettyPoint( SITE.berth.x + 3, SITE.berth.z );
			p.exitVehicle( jp.x, jp.y, jp.z, Math.PI, 'walk' );

		}

		this.piloted = false;
		this.owned = false;
		this.hp = MAX_HP;
		this.flight.fuel = 1;
		this.lost = false;
		this._clearWreck();
		this.flight.sprung[ 0 ] = this.flight.sprung[ 1 ] = 0;
		for ( const k of Object.keys( this.stats ) ) this.stats[ k ] = 0;
		this._place();

	}

	dispose() {

		for ( const off of this._interact ) off();
		for ( const off of this._offs ) off();
		this._interact = [];
		this._clearWreck();
		this.stun.dispose();
		this.cockpit.dispose();
		this.panel.dispose();
		this.audio.dispose();
		this.remote.dispose();
		if ( this.visual ) this.visual.dispose();
		if ( this.models ) this.models.dispose();
		if ( this.site ) this.site.dispose();

	}

}
