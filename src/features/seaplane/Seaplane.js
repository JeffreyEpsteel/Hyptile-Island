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

import { Vector3, Quaternion } from '../../engine/index.js';
import { Flight, GEOM } from './Flight.js';
import { Pilot, judge, MAX_HP } from './Pilot.js';
import { SITE, SeaplaneSite, jettyPoint, distToBerth } from './Site.js';
import { PlaneModels } from './Model.js';
import { PlaneAudio } from './PlaneAudio.js';
import { RemotePlanes } from './Remote.js';
import { SeaplanePanel } from './Panel.js';
import { t } from '../../i18n/index.js';

export const PRICE = 18000;
export const REPAIR_PER_HP = 15; // $ per point of condition: a full rebuild after a crash is $1,500
export const ID = 'seaplane';
const SIM_RANGE = 700; // m from the camera: an unattended plane further away is not simulated
// claimed for the plane (KeyC is the core dive key: read, not claimed). Nothing here ever combines Ctrl with a key.
export const KEYS = [ 'ShiftLeft', 'Comma', 'Period' ];
export const THROTTLE_DOWN = 'KeyC';

const _v = new Vector3(), _v2 = new Vector3(), _q = new Quaternion();

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
				when: () => ! this.piloted && ! this._aboard(),
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

	repairCost() {

		return this.free ? 0 : Math.round( ( MAX_HP - this.hp ) * REPAIR_PER_HP );

	}

	view() {

		const st = this.features && this.features.state;
		const money = st ? st.money : 0;
		return {
			owned: this.owned, free: this.free, price: PRICE, money, hp: this.hp, home: this.home, piloted: this.piloted,
			canBuy: ! this.owned && ( this.free || money >= PRICE ), repairCost: this.repairCost(),
			canRepair: this.owned && this.hp < MAX_HP && ( this.free || money >= this.repairCost() ),
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

		if ( ! this.owned || this.hp >= MAX_HP ) return { ok: false, text: t( 'seaplane.noRepair', 'Nothing to repair' ) };
		const cost = this.repairCost();
		const st = this.features && this.features.state;
		if ( cost > 0 && ( ! st || ! st.spend || ! st.spend( cost ) ) ) return { ok: false, text: t( 'seaplane.short', 'Not enough money yet' ) };
		this.hp = MAX_HP;
		this._save();
		return { ok: true, text: t( 'seaplane.repaired', 'Repaired: good as new' ) };

	}

	// tow it home (left out at sea, or drifted off)
	recall() {

		if ( this.piloted ) return { ok: false, text: '' };
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
		f.clearStrikes();
		this.pilot.reset();
		this._wasAir = false;
		this._syncVisual( 0 );

	}

	// ------------------------------------------------------------------ boarding

	board() {

		const p = this.app.player;
		if ( this.piloted ) return false;
		if ( ! this.owned || this.hp <= 0 ) {

			this.open();
			return false;

		}

		if ( ! p || ! p.enterVehicle || this._aboard() ) return false;
		const f = this.flight;
		this.piloted = true;
		f.engineOn = true;
		f.clearStrikes();
		this.pilot.reset();
		p.enterVehicle( this.vehicle );
		if ( ! this._tipShown ) {

			this._tipShown = true;
			this._toast( t( 'seaplane.tip', 'Shift / C throttle · S pulls up near 28 m/s · E climbs out when slow' ), 4200 );

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
		if ( ! p || p.mode !== 'swim' || ! this.owned || this.hp <= 0 || this._sinceExit < 0.6 ) return;
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
		f.engineOn = false;
		f.controls.throttle = 0;
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
		this.pilot.read( this._keysNow(), this._padNow(), this.flight, dt );
		this._step( dt );

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
		f.update( dt );
		const crashes = this.stats.crashes;
		for ( const e of f.drainEvents() ) {

			this._event( e );
			if ( this.stats.crashes !== crashes ) break; // the rest of that step's strikes belong to the same wreck

		}

		this._queueWater();
		if ( f.airborne ) this.stats.maxAlt = Math.max( this.stats.maxAlt, f.agl );
		this._syncVisual( dt );

	}

	_syncVisual( dt ) {

		const f = this.flight;
		if ( this.visual ) {

			this.visual.setPose( f.position, f.quaternion );
			this.visual.spin( dt, f.engineOn ? f.rpm : 0 );

		}

		const c = f.toWorldXYZ( GEOM.prop[ 0 ], GEOM.prop[ 1 ], GEOM.prop[ 2 ], _v2 );
		const p = this.app.player;
		this.audio.update( dt, { running: f.engineOn, rpm: f.rpm, airspeed: f.airspeed, x: c.x, y: c.y, z: c.z, inside: this.piloted && p && p.view === 'first' } );

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

			if ( r.kind === 'bounce' ) {

				this.hp = Math.max( 1, this.hp - r.damage );
				this._toast( `${ r.text } (${ Math.round( this.hp ) }%)`, 2400 );
				this.app.cameraFeel?.kick?.( 'land' );

			}

			return;

		}

		if ( r.kind === 'crash' ) this._crash( r.text || 'The seaplane crashed', e );

	}

	_crash( cause, e = null ) {

		const f = this.flight;
		const x = f.position.x, y = f.position.y, z = f.position.z;
		const vfx = this.features && this.features.get ? this.features.get( 'vfx' ) : null;
		const water = ! e || e.surface !== 'ground';
		if ( water ) vfx?.splash?.( x, f.seaLevel(), z, 1.6 );
		vfx?.debris?.( x, y + 1.5, z, 1.2, 'wood' );
		this.stats.crashes ++;
		this.hp = this.free ? MAX_HP : 0;
		const cost = this.repairCost();
		const wasPiloted = this.piloted;
		this.piloted = false;
		this._place();
		const p = this.app.player;
		const death = this.features && this.features.get ? this.features.get( 'death' ) : null;
		let died = false;
		if ( wasPiloted && p && p.exitVehicle ) {

			if ( death ) {

				// the crash kills the pilot: out of the cockpit where it hit, and the death feature (src/features/death)
				// cuts to black, leaves the sea chest there and wakes you at Jade Landing
				const sea = typeof f.seaLevel === 'function' ? f.seaLevel() : 0;
				if ( water ) p.exitVehicle( x, sea - 0.3, z, p.yaw, 'swim', sea );
				else p.exitVehicle( x, y, z, p.yaw, 'walk' );
				died = true;

			} else {

				// rescued and set down on the jetty beside the towed-back plane
				const jp = jettyPoint( SITE.berth.x + 3, SITE.berth.z - 4 );
				p.exitVehicle( jp.x, jp.y, jp.z, Math.PI, 'walk' );

			}

		}

		this._emit( 'planeCrashed', { cause, x, z, cost } );
		if ( died ) this._emit( 'playerDied', { cause: 'seaplane', text: cause, x, y: water ? ( typeof f.seaLevel === 'function' ? f.seaLevel() : 0 ) : y, z } );
		this._save();
		this._toast( this.free ? `${ cause }. It was towed back to the ramp.` : `${ cause }. Towed back to the ramp: repair it at the hangar ($${ cost.toLocaleString( 'en-US' ) }).`, 5200 );

	}

	update( dt ) {

		const f = this.flight, p = this.app.player;
		this._sinceExit += dt;
		// something else took the player out of the cockpit (a rescue, a respawn, the free camera reset)
		if ( this.piloted && p && ( p.mode !== 'plane' || p.vehicle !== this.vehicle ) ) {

			this.piloted = false;
			f.engineOn = false;
			this.pilot.reset();

		}

		if ( this.piloted ) {

			// Player.updatePlane already stepped it this frame; otherwise (free camera, paused player) keep it flying
			if ( ! this._driven ) this._step( dt );
			this._driven = false;

		} else {

			this._idle( dt );
			this._swimmerBoard();

		}

		this.remote.update( dt );

	}

	// unattended: the engine is off; at the ramp the mooring lines hold it at the berth, elsewhere a sea anchor
	_idle( dt ) {

		const f = this.flight;
		f.engineOn = false;
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

		return { owned: this.owned, hp: Math.round( this.hp ), stats: { ...this.stats } };

	}

	fromJSON( d ) {

		if ( ! d || typeof d !== 'object' ) return;
		this.owned = d.owned === true;
		this.hp = Number.isFinite( d.hp ) ? Math.max( 0, Math.min( MAX_HP, d.hp ) ) : MAX_HP;
		if ( d.stats && typeof d.stats === 'object' ) for ( const k of Object.keys( this.stats ) ) if ( Number.isFinite( d.stats[ k ] ) ) this.stats[ k ] = d.stats[ k ];
		if ( ! this.piloted ) this._place();

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
		for ( const k of Object.keys( this.stats ) ) this.stats[ k ] = 0;
		this._place();

	}

	dispose() {

		for ( const off of this._interact ) off();
		for ( const off of this._offs ) off();
		this._interact = [];
		this.panel.dispose();
		this.audio.dispose();
		this.remote.dispose();
		if ( this.visual ) this.visual.dispose();
		if ( this.models ) this.models.dispose();
		if ( this.site ) this.site.dispose();

	}

}
