// The dogfight feature (wave 26A): WW2-style warbirds for air combat. "I want to be able to fight other players with
// airplanes. I'd like 2-4 WW2 style ones." and "Make some additional dogfighting planes for more players, like with 2-3-4
// seats. Like gunners or mechanics or whatever fits. Keep the single pilot ones too."
//
//   Aircraft    three fighters (Sabrewing, Stormgull, Bulwark) and three crewed aircraft (Kitewing, a two-seat dive bomber;
//               Seawarden, a three-seat patrol bomber; Longreach, a four-seat twin-engine medium bomber): Warbirds.js.
//               Sold at the warbird dispersal of each airstrip (Tidemark, Meridian: the tent at the head of the line; E at
//               an aircraft of the line too). Yours stand on the line of the strip they were last parked at, or where you left
//               them in the field; a loss is rebuilt there for a share of the price.
//   Flying      FighterFlight.js (arcade-sim: stall, energy, a turn rate per type). Keys while piloting: W / S stick back /
//               forward... (S pulls the nose up), A / D roll, , / . rudder, Shift / C throttle, Space or the left button
//               fires, R arms the guns (a red ARMED badge for everybody: only armed pilots can be shot, and only by armed
//               pilots), B the dive brakes (Kitewing), the right button drops the bomb, ' twice (or X) bails out, V the
//               cockpit, G the scoreboard, 1-4 another seat (a crewed aircraft), E out when stopped on the ground.
//   Crew        any free seat (E at the door of a crewed aircraft standing still: the seat picker; 1-4 in flight). Gunners aim
//               where they look (the turret slews within its arc; the interrupter holds fire across the own tail); the
//               radio operator spots (the left button: a red diamond for the whole crew), runs the radio (Y: enemy bearings)
//               and patches small damage (; held); the flight engineer ([ / ] picks an engine) puts out fires (O held),
//               restarts a stalled engine (U when the needle is in the green), feathers a dead one (N), pumps fuel out of a
//               leaking tank (Y held) and patches holes (; held). Empty gun seats take an AI gunner in single player (option).
//               With the pilot's seat empty the aircraft holds its wings level and its height.
//   Combat      Guns.js (rounds, convergence, heat, ammunition), Damage.js (parts, stages, fire, lost control), Effects.js
//               (tracers, muzzle flashes, wingtip vapour), the vfx feature (smoke, fire, explosions, splashes). Bail out
//               with the seaplane's parachute (seaplane/Chute.js); the wreck falls and splashes. A death while aboard goes to
//               the death feature (playerDied { cause: 'dogfight' }).
//   Players     Net.js: the state's df (the owner's aircraft) / dc (a crew member aboard another's), host-authoritative
//               hits with lag compensation, the kill feed (a kill credits the killer's whole crew) and the scoreboard.
//   Practice    single player: target drones over the strip and Blackwater's raiders (AI.js), a bounty for each raider.
//
//   const df = features.get( 'dogfight' );
//   df.fleet[ id ] { owned, lost, at, pose, rec }   df.ac (the aircraft out, an Aircraft)   df.mySeat   df.ride (crewing)
//   df.buy( id ) / fly( id, seat ) / exit() / bail() / takeSeat( target, i ) / act( name, value, strip ) / view( strip )
//   df.decorateState( out )   df.updateRemote()   df.startDrones() / startRaiders()   toJSON / fromJSON / reset / dispose
// Events: warbirdBought { airframe, price }, warbirdTookOff / warbirdLanded { airframe }, warbirdLost { airframe, how },
// airKill { victim, by, crew, airframe }, gunsArmed { armed }, crewBoarded { airframe, seat, owner }.
// World events (netsync): dfHit (to the host), dfDmg (the host's verdicts), dfKill, dfSeat, dfCrew, dfBomb.

import { Vector3, Quaternion, Mesh } from '../../engine/index.js';
import { G } from '../../core/Globals.js';
import { isOnlineSession } from '../../game/GameMode.js';
import { createPropMaterial } from '../../game/GameMaterials.js';
import { WARBIRDS, WARBIRD_IDS, STRIPS, COSTS, ROLE_NAMES, rebuildPrice } from './Warbirds.js';
import { FighterFlight } from './FighterFlight.js';
import { Damage } from './Damage.js';
import { Bullets, leadPoint, CONVERGENCE } from './Guns.js';
import { canHit, ARM } from './Consent.js';
import { Aircraft } from './Aircraft.js';
import { Turret, CrewSystems, AIGunner, aimAngles, turretQuat, SYS } from './Crew.js';
import { AIPilot } from './AI.js';
import { DogfightNet, NET, hot } from './Net.js';
import { WarbirdModels } from './Model.js';
import { DogfightFx } from './Effects.js';
import { DogfightHud } from './Hud.js';
import { DogfightPanel } from './Panel.js';
import { FighterAudio, GunVoice } from './Audio.js';
import { stripOf, strips, lineSlots, deskAt, nearestStrip, buildDesk } from './Site.js';
import { Chute, CHUTE } from '../seaplane/Chute.js';
import { WORLD } from '../../world/WorldLayout.js';

export const ID = 'dogfight';
export const SAVE_V = 1;
const FAR = { x: 1e9, y: - 1e9, z: 1e9 };
const LINE_NEAR = 1800, LINE_FAR = 2400; // m from a strip: its line is built / dropped
const PARK_RANGE = 260; // m from a strip's centre: an aircraft left here goes back on its line
const RAID = { range: 1500, cooldown: 180 };
const STRIP_NAMES = { tidemark: 'Tidemark', meridian: 'Meridian' };
const SEAT_KEYS = [ 'Digit1', 'Digit2', 'Digit3', 'Digit4' ];
const clamp = ( v, a, b ) => ( v < a ? a : v > b ? b : v );
const money$ = ( n ) => '$' + Math.round( n ).toLocaleString( 'en-US' );
const _v = new Vector3(), _v2 = new Vector3(), _v3 = new Vector3(), _q = new Quaternion(), _q2 = new Quaternion(), _up = new Vector3( 0, 1, 0 );

// a pose with the flight's frame helpers (a remote aircraft drawn from its state, a parked one)
class Pose {

	constructor() {

		this.position = new Vector3();
		this.quaternion = new Quaternion();
		this.velocity = new Vector3();

	}

	toWorld( l, out = new Vector3() ) {

		return out.set( l.x ?? l[ 0 ], l.y ?? l[ 1 ], l.z ?? l[ 2 ] ).applyQuaternion( this.quaternion ).add( this.position );

	}

	toLocal( p, out = new Vector3() ) {

		return out.copy( p ).sub( this.position ).applyQuaternion( _q2.copy( this.quaternion ).invert() );

	}

	fromDf( df ) {

		this.position.fromArray( df.p );
		this.quaternion.fromArray( df.q );
		this.velocity.fromArray( df.v );
		return this;

	}

}

export class Dogfight {

	constructor( app, features, opts = {} ) {

		this.app = app || {};
		this.features = features || null;
		this.opts = opts;
		this.options = { lead: false, cv: 250, aiGunners: true };
		this.fleet = {};
		for ( const id of WARBIRD_IDS ) this.fleet[ id ] = { owned: false, lost: false, at: 'tidemark', pose: null, rec: null };
		this.score = [ 0, 0 ];
		this.stats = { sorties: 0, kills: 0, losses: 0, bailouts: 0, landings: 0 };
		this.ac = null; // the local aircraft out (mine)
		this.mySeat = - 1;
		this.ride = null; // crewing another player's aircraft
		this.chute = null;
		this.ai = [];
		this.bombs = [];
		this.debris = [];
		this.wrecks = [];
		this.lines = new Map();
		this.remoteVis = new Map();
		this.bullets = new Bullets();
		this._hits = [];
		this._rounds = [];
		this._offs = [];
		this._t = 0;
		this._driven = false;
		this._sinceExit = 10;
		this._raidT = 0;
		this._aiN = 0;
		this._bail = - 10;
		this._tips = new Set();
		this._peerAt = new Map();
		this._smokeT = new Map();
		this._fires = new Set();
		this._input = { pitch: 0, roll: 0, yaw: 0, throttle: 0, brakes: 0, fire: false };
		this._rmb = false;
		this._needle = 0;
		this._engineSel = 0;
		this._hold = {};
		this._lastHitTick = 0;
		this.rng = opts.rng || Math.random;
		const scene = opts.scene === false ? null : this.app.scene || null;
		this.scene = scene;
		this.lodScale = globalThis.__phoneBudget ? 0.6 : 1;

		// the world the aircraft fly in
		const self = this;
		this.env = {
			groundAt: ( x, z, maxY = Infinity ) => self.groundAt( x, z, maxY ),
			waterAt: ( x, z ) => self.waterAt( x, z ),
			obstacle: ( o, d, max ) => {

				const c = self.app.colliders;
				if ( ! c || ! c.raycast ) return Infinity;
				const t = c.raycast( o, d, max );
				return Number.isFinite( t ) && t < max ? t : Infinity;

			},
		};

		this.models = opts.models === false || ! scene ? null : new WarbirdModels( { scene, lodScale: this.lodScale } );
		this.fx = new DogfightFx( { scene } );
		this.hud = opts.hud === false ? null : new DogfightHud( this.app );
		this.panel = new DogfightPanel( this );
		if ( this.hud ) this.hud.onArm = () => {

			if ( this.ac && this.mySeat >= 0 ) this._toggleArm( this.ac );
			else if ( this.ride ) this.net.crewAction( this.ride.owner, { act: 'arm' } );

		};
		this.audio = new FighterAudio( this.app, 'sabrewing' );
		this.guns = new GunVoice( this.app );
		this.othersGuns = new GunVoice( this.app, { spatial: true } );
		this.othersAudio = [ null, null ];
		this.net = new DogfightNet( {
			net: () => this._session(),
			onDamage: ( hits, by ) => this._remoteDamage( hits, by ),
			onKill: ( e ) => this._onKill( e ),
			onSparks: ( target, hits ) => this._sparks( target, hits ),
			onSeat: ( from, seat ) => this._seatRequest( from, seat ),
			onCrew: ( from, d ) => this._crewAction( from, d ),
		} );

		const f = this.features;
		if ( f && f.on ) {

			this._offs.push( f.on( 'remoteWorldEvent', ( e ) => this._remoteEvent( e ) ) );
			this._offs.push( f.on( 'playerDied', ( e ) => {

				if ( e && e.cause === 'dogfight' ) return;
				this._dropAboard( 'died' );

			} ) );

		}

		this._interactables();

	}

	// ------------------------------------------------------------------ the world

	groundAt( x, z, maxY = Infinity ) {

		if ( this.opts.groundAt ) return this.opts.groundAt( x, z, maxY );
		const td = this.app.terrainData;
		let y = td && td.heightAt ? td.heightAt( x, z ) : 0;
		const c = this.app.colliders;
		if ( c && c.groundHeightAt ) {

			const h = c.groundHeightAt( x, z, maxY, 0 );
			if ( Number.isFinite( h ) && h > y ) y = h;

		}

		return y;

	}

	waterAt( x, z ) {

		if ( this.opts.waterAt ) return this.opts.waterAt( x, z );
		return G && G.seaLevel && Number.isFinite( G.seaLevel.value ) ? G.seaLevel.value : 0;

	}

	get online() {

		return !! this._session();

	}

	// single player: no room, no universe (the practice opponents exist only here)
	get offline() {

		return ! isOnlineSession( this.app );

	}

	_session() {

		const s = this.app.netsync;
		if ( ! s || ! s.online ) return null;
		const net = s.net || {};
		if ( ! this._sess || this._sess.id !== s.id || this._sess.net !== net ) {

			this._sess = {
				online: true, net, id: s.id,
				get host() { return net.host; },
				get isHost() { return !! s.isHost; },
				serverNow: () => Date.now() - ( Number.isFinite( net.serverOffset ) ? net.serverOffset : 0 ),
				send: ( kind, data ) => s.sendWorldEvent( kind, data ),
			};

		}

		return this._sess;

	}

	// the owner id my rounds carry
	get me() {

		const s = this._session();
		return s ? s.id : 'me';

	}

	_emit( type, data = {} ) {

		try { if ( this.features && this.features.emit ) this.features.emit( type, data ); } catch ( e ) { /* listeners are optional */ }

	}

	_toast( text, ms = 2800 ) {

		const g = this.app.game;
		if ( g && g.toast ) g.toast( text, ms );

	}

	_tip( key, text, ms = 4200 ) {

		if ( this._tips.has( key ) ) return;
		this._tips.add( key );
		this._toast( text, ms );

	}

	_save() {

		try { this.features && this.features.state && this.features.state.save && this.features.state.save(); } catch ( e ) { /* autosave retries */ }

	}

	_vfx() {

		try { return this.features && this.features.get ? this.features.get( 'vfx' ) : null; } catch ( e ) { return null; }

	}

	_onFoot() {

		const p = this.app.player;
		return !! p && [ 'walk', 'deck', 'swim' ].includes( p.mode ) && ! this.chute;

	}

	// ------------------------------------------------------------------ the lines at the strips

	_line( name ) {

		let L = this.lines.get( name );
		if ( L ) return L;
		const strip = stripOf( this.opts.world || WORLD, name );
		if ( ! strip ) return null;
		L = { name, strip, slots: lineSlots( strip ), desk: deskAt( strip ), visuals: {}, deskMesh: null, built: false };
		for ( const id in L.slots ) {

			const s = L.slots[ id ];
			s.y = this.groundAt( s.x, s.z, strip.y + 4 );
			s.door.y = this.groundAt( s.door.x, s.door.z, strip.y + 4 );

		}

		L.desk.y = this.groundAt( L.desk.x, L.desk.z, strip.y + 4 );
		this.lines.set( name, L );
		return L;

	}

	// what stands on a slot: the airframe (for sale, or yours parked here), or nothing (yours is away / lost)
	slotState( name, id ) {

		const r = this.fleet[ id ];
		if ( ! r.owned ) return 'sale';
		if ( r.lost ) return 'lost';
		if ( r.at === name ) return 'here';
		return 'away';

	}

	// the parked pose of an airframe at a point (three-point on the ground)
	parkedPose( id, x, z, heading, y = null ) {

		const f = this._parkFlight || ( this._parkFlight = new Map() );
		let fl = f.get( id );
		if ( ! fl ) f.set( id, fl = new FighterFlight( id, { groundAt: ( gx, gz, maxY ) => this.groundAt( gx, gz, maxY ), waterAt: () => - 100 } ) );
		const gy = y ?? this.groundAt( x, z );
		fl.place( x, gy, z, heading, { grounded: true } );
		return { position: fl.position.clone(), quaternion: fl.quaternion.clone() };

	}

	_updateLines( cam ) {

		for ( const name of STRIPS ) {

			const L = this._line( name );
			if ( ! L ) continue;
			const d = cam ? Math.hypot( cam.x - L.strip.x, cam.z - L.strip.z ) : 0;
			if ( d < LINE_NEAR && ! L.built ) this._buildLine( L );
			else if ( d > LINE_FAR && L.built ) this._dropLine( L );
			if ( ! L.built ) continue;
			for ( const id of WARBIRD_IDS ) {

				const show = [ 'sale', 'here' ].includes( this.slotState( name, id ) ) && ! ( this.ac && this.ac.id === id );
				const v = L.visuals[ id ];
				if ( v ) {

					v.setVisible( show );
					if ( show && cam ) v.update( 0, { rpm: 0, gear: 1, cameraPos: cam, lodScale: this.lodScale } );

				}

			}

		}

	}

	_buildLine( L ) {

		L.built = true;
		if ( ! this.models ) return;
		for ( const id of WARBIRD_IDS ) {

			const s = L.slots[ id ];
			const v = this.models.create( id, { pilot: false } );
			const pose = this.parkedPose( id, s.x, s.z, s.heading, s.y );
			v.setPose( pose.position, pose.quaternion );
			v.setCrew( [] );
			L.visuals[ id ] = v;

		}

		if ( this.scene && ! L.deskMesh ) {

			L.deskMesh = new Mesh( buildDesk( L.desk, L.desk.y ), createPropMaterial( 'warbirdDispersal' ) );
			L.deskMesh.name = 'warbird-dispersal-' + L.name;
			L.deskMesh.castShadow = true;
			L.deskMesh.receiveShadow = true;
			this.scene.add( L.deskMesh );

		}

	}

	_dropLine( L ) {

		L.built = false;
		for ( const id in L.visuals ) L.visuals[ id ].dispose();
		L.visuals = {};
		if ( L.deskMesh ) {

			L.deskMesh.removeFromParent();
			L.deskMesh.geometry.dispose && L.deskMesh.geometry.dispose();
			L.deskMesh = null;

		}

	}

	// ------------------------------------------------------------------ the E prompts

	_interactables() {

		const f = this.features;
		if ( ! f || ! f.interactable ) return;
		const add = ( o ) => this._offs.push( f.interactable( o ) );
		for ( const name of STRIPS ) {

			add( {
				id: 'dogfight-desk-' + name, radius: 4.5,
				position: () => {

					const L = this._line( name );
					return L ? { x: L.desk.x, y: L.desk.y, z: L.desk.z } : FAR;

				},
				when: () => this._onFoot(),
				prompt: () => 'Warbird dispersal · buy, crew, rearm, practice',
				onInteract: () => this.panel.openShop( name ),
			} );
			for ( const id of WARBIRD_IDS ) add( {
				id: `dogfight-${ name }-${ id }`, radius: 4.2,
				position: () => {

					const L = this._line( name );
					if ( ! L || ( this.ac && this.ac.id === id ) ) return FAR;
					const s = L.slots[ id ].door;
					return { x: s.x, y: s.y, z: s.z };

				},
				when: () => this._onFoot() && this._sinceExit > 0.6,
				prompt: () => this._slotPrompt( name, id ),
				onInteract: () => this._slotUse( name, id ),
			} );

		}

		// yours, left in the field
		for ( const id of WARBIRD_IDS ) add( {
			id: 'dogfight-field-' + id, radius: 4.2,
			position: () => {

				const r = this.fleet[ id ];
				if ( ! r.owned || r.lost || r.at !== 'field' || ! r.pose || ( this.ac && this.ac.id === id ) ) return FAR;
				return this._doorOf( id, r.pose );

			},
			when: () => this._onFoot() && this._sinceExit > 0.6,
			prompt: () => `${ WARBIRDS[ id ].crew > 1 ? 'Board' : 'Fly' } your ${ WARBIRDS[ id ].name }`,
			onInteract: () => ( WARBIRDS[ id ].crew > 1 ? this.panel.openSeats( { owner: 'me', id } ) : this.fly( id, 0 ) ),
		} );
		// another player's crewed aircraft standing still with a free seat
		add( {
			id: 'dogfight-crew', radius: 5,
			position: () => {

				const c = this._crewCandidate();
				return c ? c.door : FAR;

			},
			when: () => this._onFoot() && this._sinceExit > 0.6,
			prompt: () => {

				const c = this._crewCandidate();
				return c ? `Crew ${ c.name }'s ${ WARBIRDS[ c.df.a ].name } · pick a seat` : null;

			},
			onInteract: () => {

				const c = this._crewCandidate();
				if ( c ) this.panel.openSeats( { owner: c.id, id: c.df.a } );

			},
		} );

	}

	_doorOf( id, pose ) {

		const e = WARBIRDS[ id ].seats[ 0 ].eye, h = pose[ 3 ];
		const c = Math.cos( h ), s = Math.sin( h );
		const x = pose[ 0 ] + c * ( e[ 0 ] + 2.2 ) + s * e[ 2 ], z = pose[ 2 ] - s * ( e[ 0 ] + 2.2 ) + c * e[ 2 ];
		return { x, y: this.groundAt( x, z, pose[ 1 ] + 2 ), z };

	}

	_slotPrompt( name, id ) {

		const W = WARBIRDS[ id ], st = this.slotState( name, id ), r = this.fleet[ id ];
		if ( st === 'sale' ) return `${ W.name } for sale · ${ money$( W.price ) } · E to look`;
		if ( st === 'here' ) return W.crew > 1 ? `Board your ${ W.name } · pick a seat` : `Fly your ${ W.name }`;
		if ( st === 'lost' ) return `Your ${ W.name } was lost · rebuild ${ money$( rebuildPrice( id ) ) }`;
		if ( r.at === 'out' ) return null;
		return `Your ${ W.name } is ${ r.at === 'field' ? 'in the field' : 'at ' + STRIP_NAMES[ r.at ] } · ferry it here ${ money$( COSTS.ferry ) }`;

	}

	_slotUse( name, id ) {

		const st = this.slotState( name, id );
		if ( st === 'sale' || st === 'lost' ) {

			this.panel.openShop( name, WARBIRDS[ id ].kind === 'crew' ? 'crewed' : 'fighters' );
			return;

		}

		if ( st === 'away' ) {

			const r = this.ferry( id, name );
			this._toast( r.text, 2600 );
			return;

		}

		if ( WARBIRDS[ id ].crew > 1 ) this.panel.openSeats( { owner: 'me', id, strip: name } );
		else this.fly( id, 0, { strip: name } );

	}

	// the nearest other player's crewed aircraft standing still with a free seat (online)
	_crewCandidate() {

		if ( ! this.online || ! this.app.player ) return null;
		const p = this.app.player.position;
		let best = null, bd = 6;
		for ( const r of this.net.remotes( null ) ) {

			const W = WARBIRDS[ r.df.a ];
			if ( ! W || W.crew < 2 || ! r.df.cr || Math.hypot( ...r.df.v ) > 1.2 || r.df.st !== 'ground' ) continue;
			if ( ! r.df.cr.some( ( w ) => ! w || w === 'ai' ) ) continue;
			const pose = [ r.df.p[ 0 ], r.df.p[ 1 ], r.df.p[ 2 ], Math.atan2( 2 * ( r.df.q[ 3 ] * r.df.q[ 1 ] + r.df.q[ 0 ] * r.df.q[ 2 ] ), 1 - 2 * ( r.df.q[ 1 ] ** 2 + r.df.q[ 2 ] ** 2 ) ) ];
			const door = this._doorOf( r.df.a, pose );
			const d = Math.hypot( door.x - p.x, door.z - p.z );
			if ( d < bd ) {

				bd = d;
				best = { id: r.id, name: r.name, df: r.df, door };

			}

		}

		return best;

	}

	// ------------------------------------------------------------------ the shop

	view( strip ) {

		const st = this.features && this.features.state;
		const fleet = {};
		for ( const id of WARBIRD_IDS ) {

			const r = this.fleet[ id ], W = WARBIRDS[ id ];
			let repair = 0, rearm = false;
			if ( r.owned && ! r.lost && r.rec ) {

				const d = new Damage( id );
				d.fromJSON( r.rec.dmg );
				repair = d.repairCost();
				rearm = this._needsRearm( id, r.rec );

			}

			fleet[ id ] = {
				owned: r.owned, lost: r.lost, at: r.at, atName: STRIP_NAMES[ r.at ] || r.at, here: r.owned && ! r.lost && r.at === strip,
				rebuild: rebuildPrice( id ), ferry: COSTS.ferry, repair, rearm, rearmCost: COSTS.rearm * W.crew, vmax: this._vmax( id ),
			};

		}

		return {
			stripName: STRIP_NAMES[ strip ] || '', money: st ? st.money : 0, free: !! ( st && st.free ), fleet, options: { ...this.options },
			online: ! this.offline, score: this.score.slice(), board: this.online ? this.net.board( 'You', this.score ) : null,
		};

	}

	_vmax( id ) {

		// (the level top speed the flight model reaches: Warbirds.js documents the tuning)
		const T = { sabrewing: 149, stormgull: 156, bulwark: 168, kitewing: 119, seawarden: 124, longreach: 128 };
		return T[ id ] || 140;

	}

	_needsRearm( id, rec ) {

		if ( ! rec ) return false;
		const W = WARBIRDS[ id ];
		const full = ( list, left ) => Array.isArray( left ) && list.some( ( g, i ) => ( left[ i ] ?? g.ammo ) < g.ammo );
		if ( rec.guns && full( W.guns, rec.guns.left ) ) return true;
		if ( Array.isArray( rec.turrets ) && W.turrets.some( ( t, i ) => rec.turrets[ i ] && full( t.guns, rec.turrets[ i ].left ) ) ) return true;
		return !! W.bomb && rec.bombs === 0;

	}

	_pay( price ) {

		const st = this.features && this.features.state;
		if ( price <= 0 ) return true;
		return !! ( st && st.spend && st.spend( price ) );

	}

	buy( id, strip = null ) {

		const W = WARBIRDS[ id ], r = this.fleet[ id ];
		if ( ! W ) return { ok: false, text: '' };
		if ( r.owned ) return { ok: false, text: `The ${ W.name } is already yours` };
		if ( ! this._pay( W.price ) ) return { ok: false, text: `Not enough money yet (${ money$( W.price ) })` };
		Object.assign( r, { owned: true, lost: false, at: strip || this._nearestStripName() || 'tidemark', pose: null, rec: null } );
		this._emit( 'warbirdBought', { airframe: id, price: W.price } );
		this._save();
		return { ok: true, text: `The ${ W.name } is yours: on the line at ${ STRIP_NAMES[ r.at ] }. ${ W.crew > 1 ? 'E at her door picks a seat.' : 'E at her door to fly.' }` };

	}

	rebuild( id, strip ) {

		const W = WARBIRDS[ id ], r = this.fleet[ id ];
		if ( ! r.owned || ! r.lost ) return { ok: false, text: '' };
		const price = rebuildPrice( id );
		if ( ! this._pay( price ) ) return { ok: false, text: `Not enough money yet (${ money$( price ) })` };
		Object.assign( r, { lost: false, at: strip || 'tidemark', pose: null, rec: null } );
		this._save();
		return { ok: true, text: `The ground crew rebuilt your ${ W.name }: on the line at ${ STRIP_NAMES[ r.at ] }` };

	}

	ferry( id, strip ) {

		const W = WARBIRDS[ id ], r = this.fleet[ id ];
		if ( ! r.owned || r.lost || r.at === strip || r.at === 'out' ) return { ok: false, text: '' };
		if ( ! this._pay( COSTS.ferry ) ) return { ok: false, text: `Not enough money yet (${ money$( COSTS.ferry ) })` };
		r.at = strip;
		r.pose = null;
		this._save();
		return { ok: true, text: `A ferry pilot brought your ${ W.name } to ${ STRIP_NAMES[ strip ] }` };

	}

	repair( id ) {

		const r = this.fleet[ id ];
		if ( ! r.owned || r.lost || ! r.rec ) return { ok: false, text: 'Nothing to repair' };
		const d = new Damage( id );
		d.fromJSON( r.rec.dmg );
		const cost = d.repairCost();
		if ( cost <= 0 ) return { ok: false, text: 'Nothing to repair' };
		if ( ! this._pay( cost ) ) return { ok: false, text: `Not enough money yet (${ money$( cost ) })` };
		d.repair();
		r.rec.dmg = d.toJSON();
		this._save();
		return { ok: true, text: `Patched and doped: the ${ WARBIRDS[ id ].name } is as new` };

	}

	rearm( id ) {

		const r = this.fleet[ id ], W = WARBIRDS[ id ];
		if ( ! r.owned || r.lost ) return { ok: false, text: '' };
		const cost = COSTS.rearm * W.crew;
		if ( ! this._pay( cost ) ) return { ok: false, text: `Not enough money yet (${ money$( cost ) })` };
		const a = new Aircraft( id );
		a.fromRecord( r.rec );
		a.rearm();
		r.rec = a.toRecord();
		this._save();
		return { ok: true, text: `Belts loaded${ W.bomb ? ', the bomb on its crutch' : '' }${ W.kind === 'crew' ? ', tanks full, kits restocked' : '' }` };

	}

	act( name, v, strip ) {

		switch ( name ) {

			case 'buy': return this.buy( v, strip );
			case 'rebuild': return this.rebuild( v, strip );
			case 'ferry': return this.ferry( v, strip );
			case 'repair': return this.repair( v );
			case 'rearm': return this.rearm( v );
			case 'fly': {

				const r = WARBIRDS[ v ].crew > 1 ? ( this.panel.openSeats( { owner: 'me', id: v, strip } ), { ok: true } ) : this.fly( v, 0, { strip } );
				return { ...r, close: WARBIRDS[ v ].crew === 1 };

			}

			case 'lead': this.options.lead = ! this.options.lead; this._save(); return { ok: true, text: this.options.lead ? 'Lead indicator on' : 'Lead indicator off' };
			case 'cv': {

				const c = + v;
				if ( CONVERGENCE.includes( c ) ) this.options.cv = c;
				if ( this.ac ) this.ac.guns.convergence = this.options.cv;
				this._save();
				return { ok: true, text: `The wing guns now meet at ${ this.options.cv } m` };

			}

			case 'aiGunners': this.options.aiGunners = ! this.options.aiGunners; this._save(); return { ok: true, text: this.options.aiGunners ? 'AI gunners man the empty gun seats' : 'Empty gun seats stay empty' };
			case 'drones': return { ...this.startDrones(), close: true };
			case 'raiders': return { ...this.startRaiders(), close: true };

		}

		return { ok: false, text: '' };

	}

	_nearestStripName() {

		const p = this.app.player && this.app.player.position;
		const n = p ? nearestStrip( this.opts.world || WORLD, p.x, p.z ) : null;
		return n ? n.name : null;

	}

	// ------------------------------------------------------------------ seats

	seatView( target ) {

		if ( ! target ) return null;
		const W = WARBIRDS[ target.id ];
		if ( ! W ) return null;
		let who = null;
		if ( target.owner === 'me' ) who = this.ac && this.ac.id === target.id ? this.ac.seats.who : W.seats.map( () => null );
		else {

			const df = this.net.sample( target.owner, null );
			if ( ! df || ! df.cr ) return null;
			const sess = this._session();
			who = df.cr.map( ( w ) => ( w === sess?.id ? 'me' : w || null ) );

		}

		const name = ( w ) => ( ! w ? null : w === 'ai' ? 'AI gunner (yours if you take it)' : w === 'me' ? 'You' : ( this.net.buf.get( w ) || {} ).name || this._peerName( w ) || 'A player' );
		const NOTE = {
			pilot: W.guns.length ? 'Flies her and fires the fixed guns' : 'Flies her',
			gunner: 'A turret: aim where you look, the left button fires',
			radio: 'Spots for the crew, runs the radio, patches small damage',
			engineer: 'Fires, fuel, engines, patches: keeps her flying',
		};
		return {
			title: `${ W.name } · crew of ${ W.crew }`,
			sub: target.owner === 'me' ? 'Your aircraft: pick your seat (1-4 changes seat in flight)' : `${ name( target.owner ) || 'Another player' }'s aircraft: pick a free seat`,
			seats: W.seats.map( ( s, i ) => ( { role: s.role, note: NOTE[ s.role ] + ( s.turret ? ` (${ s.turret.id })` : '' ), who: who[ i ] && who[ i ] !== 'me' ? name( who[ i ] ) : null, mine: who[ i ] === 'me' && this.mySeat === i } ) ),
		};

	}

	_peerName( id ) {

		const rp = this.app.remotePlayers;
		const p = rp && rp.peers && rp.peers.get( id );
		return p ? p.name : null;

	}

	takeSeat( target, i ) {

		if ( ! target ) return { ok: false, text: '' };
		if ( target.owner === 'me' ) {

			if ( this.ac && this.ac.id === target.id ) return this.switchSeat( i );
			return this.fly( target.id, i, { strip: target.strip } );

		}

		// another player's aircraft: ask its owner
		if ( ! this._onFoot() ) return { ok: false, text: 'Not from here' };
		this.net.requestSeat( target.owner, i );
		this._pendingSeat = { owner: target.owner, id: target.id, seat: i, t: 0 };
		return { ok: true, text: 'Asking for the seat...' };

	}

	// ------------------------------------------------------------------ taking an aircraft out

	fly( id, seat = 0, { strip = null } = {} ) {

		const W = WARBIRDS[ id ], r = this.fleet[ id ], p = this.app.player;
		if ( ! W || ! r.owned ) return { ok: false, text: 'Not yours yet' };
		if ( r.lost ) return { ok: false, text: 'Lost: rebuild it at a dispersal' };
		if ( this.ac || this.ride || this.chute ) return { ok: false, text: 'You are flying already' };
		if ( ! p || ! p.enterVehicle ) return { ok: false, text: '' };
		let pose = null;
		if ( r.at === 'field' && r.pose ) pose = r.pose;
		else {

			const L = this._line( r.at );
			if ( ! L ) return { ok: false, text: '' };
			const s = L.slots[ id ];
			pose = [ s.x, s.y, s.z, s.heading ];

		}

		const a = new Aircraft( id, { env: this.env, owner: this.me, rng: this.rng } );
		a.fromRecord( r.rec );
		a.guns.convergence = this.options.cv;
		a.flight.place( pose[ 0 ], pose[ 1 ], pose[ 2 ], pose[ 3 ], { grounded: true } );
		a.flight.controls.throttle = 0;
		a.status = 'ground';
		a.visual = this.models ? this.models.create( id, { pilot: true, interior: true } ) : null;
		a.aiGunners = new Map();
		r.at = 'out';
		this.ac = a;
		this.audio.dispose();
		this.audio = new FighterAudio( this.app, id );
		this._input = { pitch: 0, roll: 0, yaw: 0, throttle: 0, brakes: 0, fire: false };
		this.stats.sorties ++;
		seat = clamp( seat | 0, 0, W.crew - 1 );
		a.seats.take( 'me', seat );
		this._fillAI();
		this._enterSeat( seat );
		this._tip( 'fly', `${ W.name } · Shift opens the throttle · S lifts the nose at ${ Math.round( this._takeoffSpeed( id ) * 3.6 ) } km/h · R arms the guns · V cockpit`, 6000 );
		this._emit( 'crewBoarded', { airframe: id, seat, owner: 'me' } );
		return { ok: true, text: '' };

	}

	_takeoffSpeed( id ) {

		const F = WARBIRDS[ id ].flight;
		return Math.sqrt( 2 * F.mass * 9.81 / ( 1.225 * F.area * ( F.clMax + 0.25 ) ) ) * 1.1;

	}

	// empty gun seats take an AI gunner (single player, the option)
	_fillAI() {

		const a = this.ac;
		if ( ! a ) return;
		const want = this.offline && this.options.aiGunners;
		a.W.seats.forEach( ( s, i ) => {

			if ( ! s.turret ) return;
			if ( want && ! a.seats.who[ i ] ) a.seats.who[ i ] = 'ai';
			if ( ! want && a.seats.who[ i ] === 'ai' ) a.seats.who[ i ] = null;

		} );

	}

	// the Player's view of a seat (Player.enterVehicle): the seat's frame faces its rest heading
	_seatVehicle( frame, W, seat ) {

		const S = W.seats[ seat ], self = this;
		const q = new Quaternion();
		const face = new Quaternion().setFromAxisAngle( _up, S.face || 0 );
		const pilot = S.role === 'pilot';
		const v = {
			kind: 'plane', quaternion: q, seat: S.seat, eye: S.eye,
			focus: [ 0, 0.6, - 0.5 ], chase: Math.max( 15, W.flight.span * 1.35 ),
			toWorld: ( l, out ) => frame().toWorld( l, out ),
			drive: ( dt ) => {

				q.copy( frame().quaternion ).multiply( face );
				self.drive( dt );
				q.copy( frame().quaternion ).multiply( face );

			},
			exit: () => self.exit(),
			prompt: () => ( self.canExit() ? 'Climb out' : null ),
			// (a gunner's chase camera never swings back behind the tail on its own)
			speed: () => ( pilot ? frame().velocity.length() : 0 ),
			heading: () => {

				const f = _v3.set( 0, 0, 1 ).applyQuaternion( q );
				return Math.atan2( f.x, f.z );

			},
			seaLevel: () => self.waterAt( frame().position.x, frame().position.z ),
		};
		q.copy( frame().quaternion ).multiply( face );
		return v;

	}

	_enterSeat( seat ) {

		const p = this.app.player, a = this.ac;
		if ( ! a || ! p ) return;
		this.mySeat = seat;
		this.vehicle = this._seatVehicle( () => a.flight, a.W, seat );
		p.enterVehicle( this.vehicle );
		if ( a.visual ) {

			a.visual.interior = true;
			a.visual.pilot = seat !== 0;

		}

		const role = a.W.seats[ seat ].role;
		if ( role === 'gunner' ) this._tip( 'gunner', 'Gunner · aim where you look · the left button fires · the turret will not fire through your own tail', 4800 );
		if ( role === 'engineer' ) this._tip( 'engineer', 'Flight engineer · [ / ] an engine · O (hold) extinguisher · U restart in the green · N feather · Y (hold) pump fuel · ; (hold) patch', 7000 );
		if ( role === 'radio' ) this._tip( 'radio', 'Radio operator · the left button spots a target for the crew · Y radio · ; (hold) patch small damage', 6000 );

	}

	switchSeat( i ) {

		if ( this.ride ) {

			if ( this.ride.seat === i ) return { ok: false, text: '' };
			const df = this.net.sample( this.ride.owner, null );
			if ( ! df || ! df.cr || ( df.cr[ i ] && df.cr[ i ] !== 'ai' ) ) return { ok: false, text: 'That seat is taken' };
			this.net.requestSeat( this.ride.owner, i );
			this._pendingSeat = { owner: this.ride.owner, id: this.ride.id, seat: i, t: 0, switch: true };
			return { ok: true, text: '' };

		}

		const a = this.ac;
		if ( ! a || i < 0 || i >= a.W.crew || i === this.mySeat ) return { ok: false, text: '' };
		const w = a.seats.who[ i ];
		if ( w && w !== 'ai' ) return { ok: false, text: 'That seat is taken' };
		a.seats.who[ i ] = null;
		a.seats.take( 'me', i );
		this._fillAI();
		this._enterSeat( i );
		this._toast( `${ ROLE_NAMES[ a.W.seats[ i ].role ] }${ a.seats.who[ 0 ] ? '' : ' · nobody at the controls: she holds her wings level' }`, 2200 );
		return { ok: true, text: '' };

	}

	canExit() {

		if ( this.ride ) {

			const df = this.net.sample( this.ride.owner, null );
			return !! df && df.st === 'ground' && Math.hypot( ...df.v ) < 2;

		}

		const a = this.ac;
		return !! a && a.flight.grounded && a.flight.airspeed < 2.5 || !! a && a.flight.ditched;

	}

	// E aboard: out onto the ground (or into the water from a ditched aircraft)
	exit() {

		if ( ! this.canExit() ) {

			this._toast( 'Land and stop before you climb out (\' twice bails out)', 2000 );
			return false;

		}

		const p = this.app.player;
		if ( this.ride ) {

			const pose = this._rideFrame();
			this.net.requestSeat( this.ride.owner, - 1 );
			this._leaveRide();
			if ( p && p.exitVehicle && pose ) {

				const d = pose.toWorld( [ 2.6, 0, 0 ], _v );
				p.exitVehicle( d.x, this.groundAt( d.x, d.z ), d.z, 0, 'walk' );

			}

			this._sinceExit = 0;
			return true;

		}

		const a = this.ac;
		const f = a.flight;
		const door = f.toWorld( [ a.W.seats[ 0 ].eye[ 0 ] + 2.4, 0, a.W.seats[ 0 ].eye[ 2 ] ], _v );
		if ( f.ditched ) {

			const sea = this.waterAt( door.x, door.z );
			this._park( 'lost', 'ditched' );
			if ( p && p.exitVehicle ) p.exitVehicle( door.x, sea - 0.2, door.z, f.heading(), 'swim', sea );

		} else {

			this._park( 'ground' );
			if ( p && p.exitVehicle ) p.exitVehicle( door.x, this.groundAt( door.x, door.z, f.position.y + 1 ), door.z, f.heading() + Math.PI / 2, 'walk' );

		}

		this._sinceExit = 0;
		return true;

	}

	// the aircraft out goes back on a line (near a strip), stays in the field, or is lost
	_park( how, cause = null ) {

		const a = this.ac;
		if ( ! a ) return;
		const r = this.fleet[ a.id ];
		r.rec = a.toRecord();
		if ( how === 'lost' ) {

			r.lost = true;
			r.at = this._nearestStripName() || 'tidemark';
			r.pose = null;
			this.stats.losses ++;
			this._emit( 'warbirdLost', { airframe: a.id, how: cause || 'lost' } );

		} else {

			const f = a.flight;
			const n = nearestStrip( this.opts.world || WORLD, f.position.x, f.position.z );
			if ( n && n.dist < PARK_RANGE ) {

				r.at = n.name;
				r.pose = null;
				this._toast( `The ground crew wheels your ${ a.W.name } back onto the line`, 2400 );

			} else {

				r.at = 'field';
				r.pose = [ f.position.x, f.position.y - f.rideHeight( f.sitPitch * ( 1 - f.tailUp ) ), f.position.z, f.heading() ];

			}

		}

		if ( a.visual ) a.visual.dispose();
		a.visual = null;
		this.ac = null;
		this.mySeat = - 1;
		this.vehicle = null;
		this._stopFires( 'mine' );
		this._marker();
		this._save();

	}

	// ------------------------------------------------------------------ bailing out

	canBail() {

		const f = this.ride ? this._rideFrame() : this.ac && this.ac.flight;
		if ( ! f ) return false;
		const agl = this.ride ? f.position.y - Math.max( this.groundAt( f.position.x, f.position.z ), this.waterAt( f.position.x, f.position.z ) ) : f.agl;
		return agl > CHUTE.minAgl;

	}

	bail() {

		const p = this.app.player;
		if ( ! p || ! p.enterVehicle || this.chute ) return { ok: false, why: 'player' };
		if ( ! this.canBail() ) {

			this._toast( 'Too low to bail out', 1600 );
			return { ok: false, why: 'low' };

		}

		let frame, W, seat;
		if ( this.ride ) {

			frame = this._rideFrame();
			W = WARBIRDS[ this.ride.id ];
			seat = this.ride.seat;
			this.net.requestSeat( this.ride.owner, - 1 );
			this._leaveRide();

		} else {

			const a = this.ac;
			frame = a.flight;
			W = a.W;
			seat = this.mySeat;
			a.seats.leave( 'me' );
			a.abandoned = ! a.seats.who[ 0 ] || a.seats.who[ 0 ] === 'ai';
			this.mySeat = - 1;
			this.vehicle = null;

		}

		const S = W.seats[ seat ];
		const at = frame.toWorld( [ S.eye[ 0 ] + ( S.eye[ 0 ] >= 0 ? 1.4 : - 1.4 ), S.eye[ 1 ] + 0.6, S.eye[ 2 ] ], new Vector3() );
		const side = _v.set( 1, 0, 0 ).applyQuaternion( frame.quaternion );
		const vel = frame.velocity.clone().multiplyScalar( 0.8 ).addScaledVector( side, 3 ).add( _v2.set( 0, 2, 0 ) );
		const agl = at.y - Math.max( this.groundAt( at.x, at.z ), this.waterAt( at.x, at.z ) );
		const cam = this.app.camera;
		this.chute = new Chute( {
			position: at, velocity: vel, heading: Math.atan2( vel.x, vel.z ), agl, scene: this.scene,
			seaAt: ( x, z ) => this.waterAt( x, z ), groundAt: ( x, z ) => this.groundAt( x, z ),
			look: () => ( cam && cam.quaternion ? _v3.set( 0, 0, - 1 ).applyQuaternion( cam.quaternion ) : null ),
		} );
		this.chute.onDrive = ( ev ) => this._chuteEvents( ev );
		p.enterVehicle( this.chute.vehicle );
		this.stats.bailouts ++;
		this._toast( 'Bailed out! Look where you want to drift.', 2400 );
		return { ok: true };

	}

	_chuteEvents( ev ) {

		const c = this.chute, p = this.app.player;
		if ( ! c ) return;
		for ( const e of ev ) {

			if ( e.type !== 'landed' ) continue;
			if ( p && p.exitVehicle && p.vehicle === c.vehicle ) p.exitVehicle( e.x, e.y, e.z, c.yaw + Math.PI, e.mode, e.mode === 'swim' ? e.sea : null );
			this._sinceExit = 0;
			c.dispose();
			this.chute = null;
			this._emit( 'chuteLanded', { x: e.x, z: e.z, mode: e.mode } );

		}

	}

	// the player left by another way (a death): nobody aboard any more
	_dropAboard( why ) {

		if ( this.ride ) {

			this.net.requestSeat( this.ride.owner, - 1 );
			this._leaveRide();

		}

		if ( this.ac && this.mySeat >= 0 ) {

			this.ac.seats.leave( 'me' );
			this.ac.abandoned = true;
			this.mySeat = - 1;
			this.vehicle = null;

		}

		if ( this.chute && why === 'died' ) {

			this.chute.dispose();
			this.chute = null;

		}

	}

	// ------------------------------------------------------------------ per frame: aboard

	// Player.updatePlane calls this before it places the camera (the local player is in one of the seats)
	drive( dt ) {

		this._driven = true;
		const inp = this.app.input;
		const modal = this._modal();
		if ( inp && inp.hit && ! modal ) {

			for ( let i = 0; i < SEAT_KEYS.length; i ++ ) if ( inp.hit( SEAT_KEYS[ i ] ) ) {

				const r = this.switchSeat( i );
				if ( r.text ) this._toast( r.text, 1600 );

			}

			if ( inp.hit( 'Quote' ) || inp.hit( 'KeyX' ) ) {

				if ( this._t - this._bail < 1.2 || inp.hit( 'KeyX' ) ) {

					this.bail();
					return;

				}

				this._bail = this._t;
				this._toast( '\' again to bail out', 1200 );

			}

			if ( inp.hit( 'KeyG' ) && this.hud ) this.hud.toggleBoard();

		}

		if ( this.ride ) {

			this._driveRide( dt, modal );
			return;

		}

		if ( this.ac ) this._stepMine( dt, modal );

	}

	_modal() {

		const f = this.features;
		return !! ( this.panel.isOpen || ( f && f.panelOpen && f.panelOpen() ) || ( this.app.input && this.app.input.enabled === false ) );

	}

	_trigger( modal ) {

		const inp = this.app.input;
		if ( ! inp || modal ) return false;
		return !! ( inp.mouseDown || ( inp.down && inp.down( 'Space' ) ) || this._pad().fire || ( this.hud && this.hud.touchFire ) );

	}

	_pad() {

		if ( typeof navigator === 'undefined' || ! navigator.getGamepads ) return {};
		let g = null;
		try { for ( const x of navigator.getGamepads() ) if ( x && x.connected ) { g = x; break; } } catch ( e ) { return {}; }
		if ( ! g ) return {};
		const dz = ( v ) => ( Math.abs( v || 0 ) < 0.16 ? 0 : ( v - Math.sign( v ) * 0.16 ) / 0.84 );
		const b = ( i ) => ( g.buttons[ i ] ? g.buttons[ i ].value || ( g.buttons[ i ].pressed ? 1 : 0 ) : 0 );
		return { roll: dz( g.axes[ 0 ] ), pitch: dz( g.axes[ 1 ] ), throttle: b( 7 ) - b( 6 ), fire: b( 5 ) > 0.5, bomb: b( 4 ) > 0.5, yaw: dz( g.axes[ 2 ] ) };

	}

	// the pilot's keys on my aircraft: the stick, the bomb, the arming switch
	_pilotInput( dt, a, modal ) {

		const c = this._stick( dt, a.flight.grounded, a.flight.airspeed, a.W, modal );
		const inp = this.app.input, pad = modal ? {} : this._pad();
		// the bomb: the right button (or the pad's left bumper) once
		const rmb = ! modal && !! ( inp && ( inp.rightDown || pad.bomb ) );
		if ( rmb && ! this._rmb && a.W.bomb ) this._dropBomb( a );
		this._rmb = rmb;
		if ( inp && inp.hit && ! modal && inp.hit( 'KeyR' ) ) this._toggleArm( a );
		return c;

	}

	// the stick ramps (the keyboard is all or nothing), the throttle walks
	_stick( dt, ground, airspeed, W, modal ) {

		const inp = this.app.input, c = this._input, pad = modal ? {} : this._pad();
		const d = ( k ) => ! modal && !! ( inp && inp.down && inp.down( k ) );
		const pitchK = ( d( 'KeyS' ) ? 1 : 0 ) - ( d( 'KeyW' ) ? 1 : 0 );
		const rollK = ( d( 'KeyD' ) ? 1 : 0 ) - ( d( 'KeyA' ) ? 1 : 0 );
		const yawK = ( d( 'Period' ) ? 1 : 0 ) - ( d( 'Comma' ) ? 1 : 0 );
		const ramp = ( cur, want, rate ) => cur + clamp( want - cur, - rate * dt, rate * dt );
		const pitchW = pad.pitch || pitchK, rollW = pad.roll || rollK;
		c.pitch = ramp( c.pitch, pitchW, pitchW === 0 ? 6 : 3.2 );
		c.roll = ramp( c.roll, rollW, rollW === 0 ? 8 : 5 );
		// on the ground A / D steer as the rudder does
		c.yaw = ramp( c.yaw, pad.yaw || yawK || ( ground ? rollK : 0 ), 4 );
		const up = d( 'ShiftLeft' ) || d( 'ShiftRight' ) || pad.throttle > 0.3, down = d( 'KeyC' ) || pad.throttle < - 0.3;
		if ( up ) c.throttle = Math.min( 1, c.throttle + dt * 0.7 );
		if ( down ) c.throttle = Math.max( 0, c.throttle - dt * 0.7 );
		// the wheel brakes: C held with the throttle closed, or B; in the air B is the dive brakes' switch
		c.wheel = ground && ( ( down && c.throttle <= 0.01 ) || d( 'KeyB' ) || ( c.throttle < 0.02 && airspeed < 0.6 ) ) ? 1 : 0;
		if ( ! ground && W.brakes && inp && inp.hit && ! modal && inp.hit( 'KeyB' ) ) {

			c.brakes = c.brakes ? 0 : 1;
			this._toast( c.brakes ? 'Dive brakes out' : 'Dive brakes in', 1200 );

		}

		if ( ground ) c.brakes = 0;
		c.fire = this._trigger( modal );
		return { pitch: c.pitch, roll: ground ? 0 : c.roll, yaw: c.yaw, throttle: c.throttle, brake: c.wheel, brakes: c.brakes, fire: c.fire };

	}

	_toggleArm( a, by = 'me' ) {

		a.arm.toggle();
		const on = a.arm.want;
		this._emit( 'gunsArmed', { armed: on } );
		if ( by === 'me' ) this._toast( on ? ( this.online ? 'Guns ARMED · other armed pilots can shoot at you, and you at them' : 'Guns ARMED' ) : `Guns going safe · hot for ${ ARM.disarm } s more`, 2600 );

	}

	// nobody at the controls: wings level, the height held, the throttle where it was (on the ground: brakes)
	_autopilot( a ) {

		const f = a.flight;
		if ( f.grounded ) return { pitch: 0, roll: 0, yaw: 0, throttle: 0, brake: 1, brakes: 0, fire: false };
		if ( a.abandoned && ! a.seats.who[ 0 ] ) {

			// bailed out of: a slow diving turn into the sea
			return { pitch: - 0.15, roll: 0.25, yaw: 0, throttle: f.controls.throttle, brake: 0, brakes: 0, fire: false };

		}

		if ( a._hold === undefined || a._hold === null ) a._hold = f.position.y;
		const vy = f.velocity.y;
		return {
			pitch: clamp( ( a._hold - f.position.y ) * 0.01 - vy * 0.06, - 0.4, 0.5 ), roll: clamp( - f.bank() * 2, - 1, 1 ), yaw: 0,
			throttle: Math.max( 0.55, f.controls.throttle ), brake: 0, brakes: 0, fire: false,
		};

	}

	_stepMine( dt, modal = false ) {

		const a = this.ac;
		if ( ! a ) return;
		const pilot = a.seats.who[ 0 ];
		let ctl;
		if ( pilot === 'me' ) {

			ctl = this._pilotInput( dt, a, modal );
			a._hold = null;

		} else if ( pilot && pilot !== 'ai' ) {

			// another player at the controls: his stick arrives with his state
			const dc = this.net.crewOf( pilot );
			ctl = dc && dc.o === this.me && dc.s === 0 && dc.c ? { pitch: dc.c[ 0 ], roll: a.flight.grounded ? 0 : dc.c[ 1 ], yaw: dc.c[ 2 ], throttle: clamp( dc.c[ 3 ], 0, 1 ), brake: a.flight.grounded && dc.c[ 3 ] < 0.02 ? 1 : 0, brakes: dc.c[ 5 ] > 0.5 ? 1 : 0, fire: dc.c[ 4 ] > 0.5 } : this._autopilot( a );

		} else ctl = this._autopilot( a );

		const events = a.step( dt, ctl );
		// the pilot's fixed guns (live only when armed)
		const armed = a.arm.armed;
		if ( ctl.fire && ! armed && pilot === 'me' ) this._tip( 'safe', 'Guns safe: R arms them', 2200 );
		const fired = a.firePilot( dt, ctl.fire && armed, this._rounds, this.me );
		if ( fired ) this._flash( a.flight, a.W.guns );
		this._lastFire = { pilot: fired, turrets: 0 };
		// the turrets: mine (where I look), another player's (his aim from his state), the AI's
		a.turrets.forEach( ( tu, i ) => {

			const seat = tu.T.seat, who = a.seats.who[ seat ];
			let fire = false;
			if ( who === 'me' ) {

				this._aimTurret( tu, a.flight );
				fire = this._trigger( modal );

			} else if ( who === 'ai' ) {

				let g = a.aiGunners.get( i );
				if ( ! g ) a.aiGunners.set( i, g = new AIGunner( tu, { rng: this.rng } ) );
				fire = g.think( dt, a.flight, this._hostilesFor( a ) );

			} else if ( who ) {

				const dc = this.net.crewOf( who );
				if ( dc && dc.o === this.me && dc.s === seat ) {

					tu.aim( dc.y, dc.p );
					// (his rounds are his to fly and claim: here they are only shown)
					if ( dc.f ) {

						const n = a.fireTurret( i, dt, true, this._rounds, 'show:' + who );
						if ( n ) this._flash( tu.frame( a.flight ), tu.guns.mounts, true );

					}

				}

			}

			if ( fire && ! armed && who === 'me' ) this._tip( 'safe', 'Guns safe: R arms them', 2200 );
			const n = who === 'me' || who === 'ai' ? a.fireTurret( i, dt, fire && ( armed || who === 'ai' ), this._rounds, who === 'ai' ? this.me : this.me ) : 0;
			if ( n ) {

				this._lastFire.turrets |= 1 << i;
				this._flash( tu.frame( a.flight ), tu.guns.mounts, true );

			}

			if ( who === 'me' && fire && tu.blockedBy ) this._tip( 'interrupter', 'The interrupter holds fire: your own tail is in the line', 2000 );

		} );
		if ( this.mySeat >= 0 ) this._stationInput( dt, modal, a.systems, a.damage, ( act ) => this._applyCrew( a, act, 'me' ) );
		this._mineEvents( events );

	}

	// a turret slews toward where the camera looks
	_aimTurret( tu, frame ) {

		const cam = this.app.camera;
		if ( ! cam || ! cam.quaternion ) return;
		const dir = _v.set( 0, 0, - 1 ).applyQuaternion( cam.quaternion );
		const a = aimAngles( frame.quaternion, tu.T, dir );
		tu.aim( a.yaw, a.pitch );

	}

	// the hostiles an AI gunner may engage: the practice AI (offline) or armed players (online: never: AI is single player)
	_hostilesFor( a ) {

		if ( ! this.offline ) return [];
		return this.ai.filter( ( x ) => x.kind === 'raider' && x.status !== 'crash' && ! x.damage.down ).map( ( x ) => ( { position: x.position, velocity: x.velocity } ) );

	}

	_flash( frame, mounts, turret = false ) {

		const q = frame.quaternion;
		for ( const m of mounts ) {

			const p = _v.set( m.at[ 0 ], m.at[ 1 ], m.at[ 2 ] ).applyQuaternion( q ).add( frame.position );
			const d = _v2.set( 0, 0, 1 ).applyQuaternion( q );
			this.fx.flash( p.x, p.y, p.z, d.x, d.y, d.z, m.kind );

		}

	}

	_dropBomb( a ) {

		const b = a.dropBomb();
		if ( ! b ) return;
		this.bombs.push( b );
		if ( a.visual ) a.visual.setBomb( false );
		this._toast( 'Bomb away', 1000 );
		const s = this._session();
		if ( s ) s.send( 'dfBomb', { p: [ b.x, b.y, b.z ].map( ( v ) => Math.round( v * 10 ) / 10 ), v: [ b.vx, b.vy, b.vz ].map( ( v ) => Math.round( v * 10 ) / 10 ) } );

	}

	// the radio operator's and the flight engineer's keys (aboard mine, or another player's through `apply`)
	_stationInput( dt, modal, sys, damage, apply ) {

		const inp = this.app.input;
		const W = this.ac ? this.ac.W : WARBIRDS[ this.ride && this.ride.id ];
		const seat = this.ride ? this.ride.seat : this.mySeat;
		const role = W && W.seats[ seat ] ? W.seats[ seat ].role : null;
		this._needle = ( this._needle + dt * 0.9 ) % 2;
		if ( ! inp || modal || ! sys || ( role !== 'engineer' && role !== 'radio' ) ) return;
		const d = ( k ) => !! ( inp.down && inp.down( k ) ), h = ( k ) => !! ( inp.hit && inp.hit( k ) );
		if ( role === 'engineer' ) {

			if ( h( 'BracketLeft' ) ) this._engineSel = 0;
			if ( h( 'BracketRight' ) ) this._engineSel = Math.min( sys.engines.length - 1, 1 );
			const i = Math.min( this._engineSel, sys.engines.length - 1 );
			this._holdAct( 'ext', d( 'KeyO' ), dt, SYS.extinguish, () => apply( { act: 'ext', i } ) );
			if ( h( 'KeyU' ) ) apply( { act: 'restart', i, v: Math.round( this.needle() * 100 ) / 100 } );
			if ( h( 'KeyN' ) ) apply( { act: 'feather', i } );
			if ( d( 'KeyY' ) ) {

				this._xferT = ( this._xferT || 0 ) + dt;
				if ( this._xferT >= 0.5 ) {

					apply( { act: 'xfer', v: this._xferT } );
					this._xferT = 0;

				}

			}

		} else {

			if ( h( 'KeyY' ) ) apply( { act: 'radio' } );
			if ( this.app.input.mouseDown && ! this._spotLatch ) {

				const t = this._spotTarget();
				if ( t ) apply( { act: 'spot', id: t } );
				else this._toast( 'Nothing to spot there', 900 );

			}

			this._spotLatch = !! this.app.input.mouseDown;

		}

		this._holdAct( 'patch', d( 'Semicolon' ), dt, SYS.patch, () => apply( { act: 'patch', role } ) );

	}

	// the restart needle: sweeps 0..1..0
	needle() {

		const n = this._needle;
		return n < 1 ? n : 2 - n;

	}

	// a held key's minigame: the progress fills while it is held, the action fires once when full
	_holdAct( name, down, dt, time, done ) {

		const p = this._hold[ name ] || 0;
		if ( ! down ) {

			this._hold[ name ] = 0;
			return;

		}

		const np = p + dt / time;
		if ( np >= 1 ) {

			this._hold[ name ] = 0;
			done();

		} else this._hold[ name ] = np;

	}

	// the target the radio operator spots: the nearest to the line of sight (an armed player online, the practice AI offline)
	_spotTarget() {

		const cam = this.app.camera;
		if ( ! cam ) return null;
		const fwd = _v.set( 0, 0, - 1 ).applyQuaternion( cam.quaternion );
		let best = null, ba = SYS.spotCone;
		for ( const t of this._targetsAll() ) {

			const d = _v2.copy( t.position ).sub( cam.position );
			const dist = d.length();
			if ( dist > SYS.spotRange ) continue;
			const ang = Math.acos( clamp( d.dot( fwd ) / dist, - 1, 1 ) );
			if ( ang < ba ) {

				ba = ang;
				best = t.id;

			}

		}

		return best;

	}

	// a crew action on my aircraft (from my own station, or from a crew member through dfCrew)
	_applyCrew( a, d, from ) {

		const sys = a.systems;
		if ( d.act === 'arm' ) {

			this._toggleArm( a, from );
			return;

		}

		if ( d.act === 'bomb' ) {

			this._dropBomb( a );
			return;

		}

		if ( ! sys ) return;
		let r = null;
		switch ( d.act ) {

			case 'ext': r = sys.extinguish( d.i | 0, a.damage, SYS.extinguish ); if ( r.ok ) this._crewSay( from, 'Fire out', 1400 ); else if ( r.why === 'empty' ) this._crewSay( from, 'That engine\'s bottle is spent: dive to blow the fire out', 2200 ); break;
			case 'restart': r = sys.restart( d.i | 0, + d.v, a.damage ); this._crewSay( from, r.ok ? 'Engine caught!' : r.why === 'missed' ? 'It coughed: try in the green' : r.why === 'destroyed' ? 'That engine is wrecked' : r.why === 'fuel' ? 'No fuel in its tank' : 'It is running', 1600 ); break;
			case 'feather': this._crewSay( from, sys.feather( d.i | 0 ) ? 'Propeller feathered' : 'Propeller unfeathered', 1400 ); break;
			case 'xfer': sys.transfer( clamp( + d.v || 0, 0, 1 ) ); break;
			case 'patch': {

				const role = from === 'me' ? ( a.W.seats[ this.mySeat ] || {} ).role : ( a.W.seats[ a.seats.seatOf( from ) ] || {} ).role;
				r = sys.patch( a.damage, role === 'radio' ? 'radio' : 'engineer', SYS.patch );
				this._crewSay( from, r.ok ? ( r.what === 'leak' ? 'The tank is plugged' : 'Patched' ) : r.why === 'noKits' ? 'No patch kits left' : 'Nothing to patch', 1400 );
				break;

			}

			case 'spot': if ( typeof d.id === 'string' && sys.spot( d.id ) ) this._crewSay( from, 'Target spotted', 1000 ); break;
			case 'radio': this._crewSay( from, sys.toggleRadio() ? 'Radio on: bearings to the enemy' : 'Radio off', 1400 ); break;

		}

	}

	_crewSay( from, text, ms ) {

		if ( from === 'me' ) this._toast( text, ms );

	}

	// a crew member's action, sent to me (the owner)
	_crewAction( from, d ) {

		const a = this.ac;
		if ( ! a || ! d ) return;
		const seat = a.seats.seatOf( from );
		if ( seat < 0 ) return;
		const role = a.W.seats[ seat ].role;
		const allowed = { ext: [ 'engineer' ], restart: [ 'engineer' ], feather: [ 'engineer' ], xfer: [ 'engineer' ], patch: [ 'engineer', 'radio' ], spot: [ 'radio' ], radio: [ 'radio' ], arm: [ 'pilot', 'gunner', 'radio', 'engineer' ], bomb: [ 'pilot' ] };
		if ( ! allowed[ d.act ] || ! allowed[ d.act ].includes( role ) ) return;
		this._applyCrew( a, d, from );

	}

	// a player asks me for a seat in my aircraft (-1: he leaves)
	_seatRequest( from, seat ) {

		const a = this.ac;
		if ( ! a ) return;
		if ( seat < 0 ) {

			if ( a.seats.leave( from ) >= 0 ) {

				this._fillAI();
				this._toast( `${ this._peerName( from ) || 'A crew member' } left the aircraft`, 1800 );

			}

			return;

		}

		if ( seat >= a.W.crew || ( a.seats.who[ seat ] && a.seats.who[ seat ] !== 'ai' ) ) return;
		const aboard = a.seats.seatOf( from ) >= 0;
		// boarding: on the ground and stopped; a switch: anywhere
		if ( ! aboard && ! ( a.flight.grounded && a.flight.airspeed < 1.5 ) ) return;
		if ( a.seats.who[ seat ] === 'ai' ) a.seats.who[ seat ] = null;
		a.seats.take( from, seat );
		this._toast( `${ this._peerName( from ) || 'A player' } is your ${ ROLE_NAMES[ a.W.seats[ seat ].role ].toLowerCase() }`, 2200 );
		this._emit( 'crewBoarded', { airframe: a.id, seat, owner: 'me', crew: from } );

	}

	// ------------------------------------------------------------------ crewing another player's aircraft

	_rideFrame() {

		const r = this.ride;
		if ( ! r ) return null;
		const rp = this.app.remotePlayers;
		const t = rp && rp.renderTime ? rp.renderTime() : null;
		const df = this.net.sample( r.owner, t );
		if ( df ) {

			r.pose.fromDf( df );
			r.df = df;
			r.seen = this._t;

		}

		return r.pose;

	}

	_startRide( owner, id, seat ) {

		const p = this.app.player;
		const W = WARBIRDS[ id ];
		const pose = new Pose();
		const T = W.seats[ seat ].turret ? W.turrets.findIndex( ( t ) => t.seat === seat ) : - 1;
		this.ride = { owner, id, seat, pose, df: null, seen: this._t, turret: T >= 0 ? new Turret( id, T ) : null, systems: W.kind === 'crew' ? new CrewSystems( id ) : null, damage: new Damage( id ), lost: 0 };
		this._rideFrame();
		this.vehicle = this._seatVehicle( () => this.ride.pose, W, seat );
		if ( p && p.enterVehicle ) p.enterVehicle( this.vehicle );
		this._enterRideTips( W, seat );

	}

	_enterRideTips( W, seat ) {

		const role = W.seats[ seat ].role;
		this._toast( `${ ROLE_NAMES[ role ] } aboard ${ W.name } · ' twice bails out · 1-4 another free seat`, 3000 );

	}

	_leaveRide() {

		this.ride = null;
		this.vehicle = null;

	}

	_driveRide( dt, modal ) {

		const r = this.ride;
		const frame = this._rideFrame();
		if ( ! frame ) return;
		const df = r.df;
		const sess = this._session();
		const W = WARBIRDS[ r.id ];
		if ( df && df.sy && r.systems ) r.systems.adopt( df.sy );
		if ( df ) r.damage.fromJSON( null );
		// my seat as the owner sees it (he may have given it away)
		if ( df && df.cr && sess && df.cr[ r.seat ] !== sess.id ) r.lost += dt;
		else r.lost = 0;
		r.fire = false;
		if ( r.turret ) {

			this._aimTurret( r.turret, frame );
			r.turret.step( dt );
			r.fire = this._trigger( modal );
			const armed = df && hot( df.ar );
			if ( r.fire && ! armed ) this._tip( 'safe', 'Guns safe: R asks the pilot to arm them', 2000 );
			const fr = r.turret.frame( { toWorld: ( l, o ) => frame.toWorld( l, o ), quaternion: frame.quaternion, velocity: frame.velocity } );
			const n = r.turret.guns.fire( dt, r.fire && armed && ! r.turret.blockedBy, fr, this._rounds, this.me );
			if ( n ) this._flash( fr, r.turret.guns.mounts, true );

		}

		const inp = this.app.input;
		if ( inp && inp.hit && ! modal && inp.hit( 'KeyR' ) ) this.net.crewAction( r.owner, { act: 'arm' } );
		// at the controls of another's aircraft: the stick goes with my state
		if ( W.seats[ r.seat ].role === 'pilot' ) {

			const c = this._stick( dt, df ? df.st === 'ground' : true, frame.velocity.length(), W, modal );
			r.controls = [ c.pitch, c.roll, c.yaw, c.throttle, c.fire ? 1 : 0, c.brakes ? 1 : 0 ];
			const rmb = ! modal && !! ( inp && inp.rightDown );
			if ( rmb && ! this._rmb && W.bomb ) this.net.crewAction( r.owner, { act: 'bomb' } );
			this._rmb = rmb;

		}

		this._stationInput( dt, modal, r.systems, null, ( act ) => this.net.crewAction( r.owner, act ) );

	}

	// ------------------------------------------------------------------ per frame

	update( dt ) {

		if ( ! Number.isFinite( dt ) || dt <= 0 ) return;
		dt = Math.min( dt, 0.1 );
		this._t += dt;
		this._sinceExit += dt;
		const cam = this.app.camera && this.app.camera.position;
		// the aircraft out, when nobody local drove it this frame (abandoned, under the parachute)
		if ( this.ac && ! this._driven ) this._stepMine( dt, true );
		this._driven = false;
		if ( this.chute && this.app.player && this.app.player.vehicle !== this.chute.vehicle ) {

			// (the player left the harness some other way)
			this.chute.dispose();
			this.chute = null;

		}

		this._netIn( dt );
		this._pending( dt );
		this._rideCheck( dt );
		this._stepAI( dt );
		this._stepBombs( dt );
		this._shoot( dt );
		this._visuals( dt, cam );
		this._updateLines( cam );
		this._netOut( dt );
		this._hudUpdate( dt );
		this._audio( dt );
		this.panel.refresh && this.panel.isOpen && this._t % 0.5 < dt && this.panel.refresh();

	}

	// ------------------------------------------------------------------ networking

	_netIn( dt ) {

		const rp = this.app.remotePlayers;
		if ( ! this.online || ! rp || ! rp.peers ) {

			if ( this.net.buf.size || this.net.crewBuf.size ) this.net.reset();
			return;

		}

		for ( const [ id, p ] of rp.peers ) {

			const ex = p.extra || {};
			if ( ex.df || ex.dc ) p.inCar = true; // (the avatar is not drawn: the aircraft's crew figures are)
			if ( this._peerAt.get( id ) === p.lastAt ) continue;
			this._peerAt.set( id, p.lastAt );
			this.net.ingest( id, p.lastAt, ex.df || null, p.name );
			this.net.ingestCrew( id, p.lastAt, ex.dc || null );

		}

		for ( const id of [ ...this.net.buf.keys(), ...this.net.crewBuf.keys() ] ) if ( ! rp.peers.has( id ) ) {

			this.net.drop( id );
			this._peerAt.delete( id );
			if ( this.ac ) this.ac.seats.leave( id );

		}

	}

	// a seat I asked another player for
	_pending( dt ) {

		const ps = this._pendingSeat;
		if ( ! ps ) return;
		ps.t += dt;
		const df = this.net.sample( ps.owner, null );
		const sess = this._session();
		if ( df && df.cr && sess && df.cr[ ps.seat ] === sess.id ) {

			this._pendingSeat = null;
			if ( ps.switch && this.ride ) {

				const W = WARBIRDS[ ps.id ];
				const T = W.turrets.findIndex( ( t ) => t.seat === ps.seat );
				this.ride.seat = ps.seat;
				this.ride.turret = T >= 0 ? new Turret( ps.id, T ) : null;
				this.vehicle = this._seatVehicle( () => this.ride.pose, W, ps.seat );
				this.app.player && this.app.player.enterVehicle && this.app.player.enterVehicle( this.vehicle );
				this._enterRideTips( W, ps.seat );

			} else if ( ! ps.switch && this._onFoot() ) this._startRide( ps.owner, ps.id, ps.seat );
			return;

		}

		if ( ps.t > 3.5 ) {

			this._pendingSeat = null;
			this._toast( 'No answer: that seat was not given', 2000 );

		}

	}

	// crewing: the aircraft crashed under me, landed and was left, or its owner went
	_rideCheck( dt ) {

		const r = this.ride;
		if ( ! r ) return;
		const df = this.net.sample( r.owner, null );
		const gone = ! df || this._t - r.seen > 2.5;
		const p = this.app.player;
		if ( df && df.st === 'crash' || gone && r.df && r.df.st !== 'ground' ) {

			const at = r.pose.position;
			this._leaveRide();
			this._emit( 'playerDied', { cause: 'dogfight', text: `Went down with ${ this._peerName( r.owner ) || 'the' }'s ${ WARBIRDS[ r.id ].name }`, x: at.x, y: at.y, z: at.z } );
			return;

		}

		if ( gone || r.lost > 3 || ( df && df.st === 'ditched' ) ) {

			const at = r.pose.toWorld( [ 2.6, 0, 0 ], _v );
			this._leaveRide();
			const sea = this.waterAt( at.x, at.z ), g = this.groundAt( at.x, at.z );
			if ( p && p.exitVehicle ) {

				if ( g < sea - 1 ) p.exitVehicle( at.x, sea - 0.2, at.z, 0, 'swim', sea );
				else p.exitVehicle( at.x, g, at.z, 0, 'walk' );

			}

			this._sinceExit = 0;
			this._toast( df && df.st === 'ditched' ? 'Ditched: into the water' : 'The aircraft was parked', 1800 );

		}

	}

	_remoteEvent( e ) {

		if ( ! e ) return;
		if ( e.kind === 'dfBomb' && ! e.replay && e.data && Array.isArray( e.data.p ) && Array.isArray( e.data.v ) ) {

			const [ x, y, z ] = e.data.p, [ vx, vy, vz ] = e.data.v;
			if ( [ x, y, z, vx, vy, vz ].every( Number.isFinite ) ) this.bombs.push( { x, y, z, vx, vy, vz, t: 0, owner: 'show:' + e.from, radius: 22, dmg: 0, show: true } );
			return;

		}

		this.net.onEvent( e );

	}

	// the state's df / dc and the parachute, built once a frame (decorateState copies them)
	_netOut( dt ) {

		const sess = this._session();
		this._df = null;
		this._dc = null;
		const a = this.ac;
		if ( a && ( this.mySeat >= 0 || a.status === 'fly' || a.status === 'down' || ( a.status === 'crash' && this._t - ( a.crashT || 0 ) < 1.5 ) ) ) {

			const f = a.flight;
			const ar = a.arm.armed ? ( a.arm.want ? 1 : 3 ) : a.arm.want ? 2 : 0;
			const st = a.status === 'crash' ? 'crash' : a.status === 'ditched' ? 'ditched' : a.status === 'down' ? 'down' : f.grounded ? 'ground' : this.mySeat < 0 ? 'bail' : 'fly';
			const fire = ( this._lastFire && this._lastFire.pilot ? 1 : 0 ) | ( a.W.guns.some( ( g ) => g.kind === 'cannon' ) && this._lastFire && this._lastFire.pilot ? 2 : 0 );
			this._df = DogfightNet.pack( {
				id: a.id, flight: f, rpm: f.rpm, gear: f.gearDown, controls: f.controls, firing: fire, armed: ar, damage: a.damage.code(), convergence: a.guns.convergence,
				score: this.online ? this.net.myScore() : this.score, status: st,
				crew: a.W.crew > 1 ? a.seats.code( sess ? sess.id : 'me' ) : null, systems: a.systems ? a.systems.code() : null,
				turrets: a.turrets, turretFire: this._lastFire ? this._lastFire.turrets : 0, marks: a.systems ? [ ...a.systems.marks.keys() ] : null,
			} );
			if ( sess ) this.net.recordSelf( sess.serverNow(), this._df );

		}

		if ( this.ride && this.ride.df ) {

			const r = this.ride, fr = r.pose, W = WARBIRDS[ r.id ];
			const dc = { o: r.owner, a: r.id, s: r.seat, ar: r.df.ar, f: r.fire ? 1 : 0 };
			if ( r.turret ) {

				const g = fr.toWorld( r.turret.T.at, _v );
				const q = turretQuat( fr.quaternion, r.turret.T, r.turret.yaw, r.turret.pitch, _q );
				const d = _v2.set( 0, 0, 1 ).applyQuaternion( q );
				Object.assign( dc, { y: Math.round( r.turret.yaw * 100 ) / 100, p: Math.round( r.turret.pitch * 100 ) / 100, g: [ g.x, g.y, g.z ].map( ( v ) => Math.round( v * 100 ) / 100 ), d: [ d.x, d.y, d.z ].map( ( v ) => Math.round( v * 1000 ) / 1000 ) } );

			}

			if ( W.seats[ r.seat ].role === 'pilot' && r.controls ) dc.c = r.controls.map( ( v ) => Math.round( v * 100 ) / 100 );
			this._dc = dc;
			if ( sess ) this.net.recordSelfCrew( sess.serverNow(), dc );

		}

		this.net.update( dt );

	}

	decorateState( out ) {

		if ( ! out ) return out;
		if ( this._df ) out.df = this._df;
		if ( this._dc ) out.dc = this._dc;
		const c = this.chute;
		if ( c && c.position && c.state !== 'landed' ) out.chute = [ c.position.x, c.position.y, c.position.z, c.yaw, c.state === 'open' ? Math.max( 0.05, c.open01 || 0 ) : 0 ].map( ( v ) => Math.round( v * 100 ) / 100 );
		return out;

	}

	// the host's verdict: hits on my aircraft
	_remoteDamage( hits, by ) {

		const a = this.ac;
		if ( ! a ) return;
		for ( const h of hits ) this._applyHit( a, h.part, h.dmg, { by } );

	}

	// the sparks of a hit somebody else took
	_sparks( target, hits ) {

		const df = this.net.sample( target, null );
		const vfx = this._vfx();
		if ( ! df || ! vfx ) return;
		vfx.flash( df.p[ 0 ], df.p[ 1 ], df.p[ 2 ], 0.25 );
		vfx.debris && vfx.debris( df.p[ 0 ], df.p[ 1 ], df.p[ 2 ], 0.2, 'metal' );

	}

	_onKill( e ) {

		if ( this.hud ) this.hud.feed( { killer: e.killer, victim: e.victim, airframe: WARBIRDS[ e.airframe ] ? WARBIRDS[ e.airframe ].name : '', mine: e.mine } );
		const s = this._session();
		if ( s && e.crew && e.crew.includes( s.id ) ) {

			this.stats.kills ++;
			this._toast( e.crew.length > 1 ? `Your crew shot down ${ e.victim }` : `You shot down ${ e.victim }`, 2600 );

		}

		this._emit( 'airKill', { victim: e.v, by: e.by, crew: e.crew || [], airframe: e.airframe } );

	}

	// ------------------------------------------------------------------ hits and kills

	_applyHit( a, part, dmg, { shell = false, by = null } = {} ) {

		const r = a.hit( part, dmg, { shell, by } );
		const mine = a === this.ac;
		if ( mine ) {

			this.guns.hit( 'clank' );
			if ( this.hud ) this.hud.hurt();

		}

		for ( const ev of r.events ) {

			if ( ev === 'wingOff' ) this._tearOff( a, r.part );
			if ( ev === 'tailOff' ) this._tearOff( a, 'tail' );
			if ( ev === 'breakup' ) {

				const vfx = this._vfx();
				if ( vfx ) vfx.explosion( a.position.x, a.position.y, a.position.z, 1.4, 'metal' );

			}

			if ( mine && ev === 'fire' ) this._toast( a.systems ? 'FIRE! (engineer: O held)' : 'FIRE! Dive hard to blow it out, or bail out', 2400 );
			if ( mine && ev === 'pilotKilled' ) this._pilotKilled( a, by );
			if ( ev === 'down' ) this._down( a, by );

		}

		if ( mine && r.systems ) for ( const e of r.systems ) {

			if ( e.type === 'leak' ) this._toast( 'Fuel leak!', 1600 );
			if ( e.type === 'quit' ) this._toast( 'An engine quit!', 1600 );

		}

		return r;

	}

	_tearOff( a, part ) {

		const v = a.visual;
		if ( ! v ) return;
		const g = v.detach( part );
		if ( g ) this.debris.push( { g, vel: a.velocity.clone().add( _v.set( ( this.rng() - 0.5 ) * 12, 6, ( this.rng() - 0.5 ) * 12 ) ), spin: new Vector3( this.rng() * 3, this.rng() * 3, this.rng() * 3 ), t: 0 } );

	}

	// the pilot's seat took a fatal hit
	_pilotKilled( a, by ) {

		if ( a === this.ac && this.mySeat === 0 ) {

			const at = a.position;
			this._dropAboard( 'killed' );
			this._emit( 'playerDied', { cause: 'dogfight', text: this._byText( by, 'The cockpit took a burst' ), x: at.x, y: at.y, z: at.z, by } );

		}

	}

	_byText( by, fallback ) {

		if ( ! by ) return fallback;
		if ( String( by ).startsWith( 'ai:' ) ) return 'Shot down by a Blackwater raider';
		return `Shot down by ${ this._peerName( by ) || 'another pilot' }`;

	}

	// an aircraft out of control (a wing or the tail gone, broken, the pilot dead)
	_down( a, by ) {

		if ( a._downed ) return;
		a._downed = true;
		const how = a.damage.why;
		if ( a === this.ac ) {

			this._toast( a.seats.who[ 0 ] === 'me' || this.mySeat >= 0 ? 'She is going down: BAIL OUT (\' twice)' : '', 3000 );
			this._credit( a, how );

		} else if ( a.ai ) this._aiDown( a );

	}

	// my aircraft's loss: the kill goes to whoever hit it last
	_credit( a, how ) {

		if ( a._credited ) return;
		a._credited = true;
		this.score[ 1 ] ++;
		if ( this.online ) this.net.reportKill( a.id, how );
		else if ( a.lastHitBy && String( a.lastHitBy ).startsWith( 'ai:' ) && this.hud ) this.hud.feed( { killer: 'A Blackwater raider', victim: 'You', airframe: a.W.name, mine: true } );

	}

	_aiDown( a ) {

		if ( a.lastHitBy === this.me ) {

			this.score[ 0 ] ++;
			this.stats.kills ++;
			const st = this.features && this.features.state;
			if ( a.kind === 'raider' && st && st.earn && ! st.free ) st.earn( COSTS.raiderBounty );
			if ( this.hud ) this.hud.feed( { killer: 'You', victim: a.kind === 'raider' ? 'a Blackwater raider' : 'a target drone', airframe: a.W.name, mine: true } );
			this._toast( a.kind === 'raider' ? `Raider down · bounty ${ money$( COSTS.raiderBounty ) }` : 'Drone down', 2200 );
			this._emit( 'airKill', { victim: a.owner, by: this.me, crew: [ this.me ], airframe: a.id } );

		}

	}

	// my aircraft's events this step
	_mineEvents( events ) {

		const a = this.ac;
		for ( const e of events ) {

			if ( e.type === 'takeoff' ) {

				this._emit( 'warbirdTookOff', { airframe: a.id } );
				this._tip( 'gear', 'The gear comes up by itself once you climb away', 2400 );

			} else if ( e.type === 'landed' ) {

				this.stats.landings ++;
				if ( e.hard ) {

					const k = e.belly ? 40 : Math.max( 0, ( e.sink - 2.8 ) * 18 );
					for ( const p of [ 'fuselage', 'wingL', 'wingR' ] ) a.hit( p, k * ( p === 'fuselage' ? 1 : 0.5 ) );
					this.audio.crunch( Math.min( 1, k / 40 ), e.x, e.y, e.z, false );
					this._toast( e.belly ? 'A belly landing!' : 'A hard landing', 1800 );

				}

				this._emit( 'warbirdLanded', { airframe: a.id } );

			} else if ( e.type === 'stall' && this.mySeat === 0 ) this._tip( 'stall', 'STALL: ease the stick forward and let her fly', 2200 );
			else if ( e.type === 'crash' ) this._crash( a, e );
			else if ( e.type === 'ditched' ) {

				a.status = 'ditched';
				this._toast( 'Ditched! E to climb out into the water', 2600 );
				if ( ! a._credited && a.lastHitBy ) this._credit( a, 'ditched' );

			} else if ( e.type === 'engineDead' ) this._toast( a.systems ? 'An engine is gone!' : 'The engine is gone: glide her down', 2000 );
			else if ( e.type === 'fireOut' && this.mySeat >= 0 ) this._toast( 'The fire is out', 1400 );
			else if ( e.type === 'down' ) this._down( a, a.lastHitBy );
			else if ( e.type === 'breakup' ) {

				const vfx = this._vfx();
				if ( vfx ) vfx.explosion( a.position.x, a.position.y, a.position.z, 1.4, 'metal' );

			}

		}

	}

	// the end of an aircraft: the impact, the wreck; whoever was aboard dies (the death feature respawns)
	_crash( a, e ) {

		a.status = 'crash';
		a.crashT = this._t;
		const vfx = this._vfx();
		const water = !! e.water;
		const sea = this.waterAt( e.x, e.z );
		if ( vfx ) {

			if ( water ) {

				vfx.splash( e.x, sea, e.z, 3 );
				vfx.bubbles && vfx.bubbles( e.x, sea - 1, e.z, 1.5 );

			} else {

				vfx.explosion( e.x, e.y, e.z, 1.6, 'metal' );
				const id = 'dogfight-wreck-' + ( ++ this._aiN );
				vfx.fire( id, e.x, e.y, e.z, 1.2 );
				this.wrecks.push( { id, t: 0 } );

			}

		}

		if ( a === this.ac || this._near( e ) ) this.audio.crunch( 1.6, e.x, e.y, e.z, water );
		if ( a.visual ) a.visual.setVisible( false );
		if ( a === this.ac ) {

			if ( ! a._credited && ( a.lastHitBy || this.online ) ) this._credit( a, water ? 'splash' : 'crash' );
			const aboard = this.mySeat >= 0;
			const W = a.W;
			this._park( 'lost', 'crash' );
			if ( aboard ) {

				const p = this.app.player;
				this.vehicle = null;
				this._emit( 'playerDied', { cause: 'dogfight', text: this._byText( a.lastHitBy, `Your ${ W.name } went into the ${ water ? 'sea' : 'ground' }` ), x: e.x, y: water ? sea : e.y, z: e.z, by: a.lastHitBy } );
				// (without the death feature: put the player down beside the wreck)
				if ( p && p.mode === 'plane' && p.exitVehicle && ! ( this.features && this.features.get && this.features.get( 'death' ) ) ) p.exitVehicle( e.x + 4, water ? sea - 0.2 : e.y, e.z, 0, water ? 'swim' : 'walk', water ? sea : null );

			}

		} else if ( a.ai && ! a._downed ) {

			a._downed = true;
			this._aiDown( a );

		}

	}

	_near( e ) {

		const c = this.app.camera && this.app.camera.position;
		return ! c || Math.hypot( c.x - e.x, c.y - e.y, c.z - e.z ) < 2500;

	}

	// ------------------------------------------------------------------ the practice AI (single player)

	startDrones() {

		if ( ! this.offline ) return { ok: false, text: 'Practice is for single player' };
		const p = this.app.player && this.app.player.position;
		const c = p ? { x: p.x, z: p.z } : { x: 0, z: 0 };
		this._clearAI();
		for ( let i = 0; i < 3; i ++ ) this._spawnAI( 'stormgull', 'drone', { x: c.x + Math.sin( i * 2.1 ) * 900, y: 420 + i * 60, z: c.z + Math.cos( i * 2.1 ) * 900, heading: i * 2.1 + Math.PI / 2, circuit: { x: c.x, z: c.z, alt: 420 + i * 60, r: 900, dir: 1 } } );
		this._practice = true;
		return { ok: true, text: 'Three target drones are circling the strip at 400 m: arm your guns (R) and go' };

	}

	startRaiders( n = 2 ) {

		if ( ! this.offline ) return { ok: false, text: 'Practice is for single player' };
		const bw = WORLD.blackwater && WORLD.blackwater.center;
		const p = this.app.player && this.app.player.position;
		if ( ! bw || ! p ) return { ok: false, text: '' };
		const h = Math.atan2( p.x - bw.x, p.z - bw.z );
		for ( let i = 0; i < n; i ++ ) this._spawnAI( i ? 'sabrewing' : 'bulwark', 'raider', { x: bw.x + ( i - 0.5 ) * 60, y: 380 + i * 40, z: bw.z, heading: h, skill: 0.45 + 0.2 * i } );
		this._practice = true;
		return { ok: true, text: `${ n } Blackwater raiders are up and coming for you` };

	}

	_spawnAI( id, kind, o ) {

		const owner = 'ai:' + ( ++ this._aiN );
		const a = new Aircraft( id, { env: this.env, owner, rng: this.rng } );
		a.ai = true;
		a.kind = kind;
		a.flight.place( o.x, o.y, o.z, o.heading, { grounded: false, speed: 110 } );
		a.flight.controls.throttle = 0.9;
		a.status = 'fly';
		a.arm.armed = a.arm.want = kind === 'raider';
		a.pilot = new AIPilot( a.flight, { mode: kind === 'drone' ? 'drone' : 'fight', skill: o.skill ?? 0.5, rng: this.rng } );
		a.circuit = o.circuit || null;
		a.visual = this.models ? this.models.create( id, { livery: kind, pilot: true } ) : null;
		a.name = kind === 'raider' ? 'Blackwater raider' : 'Target drone';
		this.ai.push( a );
		return a;

	}

	_clearAI() {

		for ( const a of this.ai ) if ( a.visual ) a.visual.dispose();
		this.ai.length = 0;

	}

	_stepAI( dt ) {

		if ( ! this.offline ) {

			if ( this.ai.length ) this._clearAI();
			return;

		}

		// Blackwater scrambles its raiders against an armed fighter that comes close
		this._raidT = Math.max( 0, this._raidT - dt );
		const a = this.ac;
		const bw = WORLD.blackwater && WORLD.blackwater.center;
		if ( a && bw && a.arm.armed && a.status === 'fly' && this._raidT <= 0 && ! this.ai.some( ( x ) => x.kind === 'raider' ) && Math.hypot( a.position.x - bw.x, a.position.z - bw.z ) < RAID.range ) {

			this._raidT = RAID.cooldown;
			this.startRaiders( 2 );
			this._toast( 'Blackwater scrambles its fighters!', 2600 );

		}

		const me = a && ( a.status === 'fly' || a.status === 'down' ) ? { position: a.position, velocity: a.velocity, alive: ! a.damage.down } : null;
		for ( const x of this.ai ) {

			if ( x.status === 'crash' ) {

				x.gone = ( x.gone || 0 ) + dt;
				continue;

			}

			const target = x.kind === 'raider' && me && ( a.arm.armed || this._practice ) ? me : null;
			const o = x.pilot.think( dt, { target, threat: me, groundAt: ( gx, gz ) => this.groundAt( gx, gz ), waterAt: ( gx, gz ) => this.waterAt( gx, gz ), circuit: x.circuit } );
			const ctl = x.damage.down ? { pitch: - 0.3, roll: 0.6, yaw: 0, throttle: o.throttle } : o;
			const ev = x.step( dt, { pitch: ctl.pitch, roll: ctl.roll, yaw: ctl.yaw, throttle: ctl.throttle } );
			for ( const e of ev ) if ( e.type === 'crash' ) this._crash( x, e );
			if ( x.kind === 'raider' && o.fire && ! x.damage.down ) {

				const n = x.firePilot( dt, true, this._rounds, x.owner );
				if ( n ) this._flash( x.flight, x.W.guns );

			} else x.firePilot( dt, false, null, x.owner );

		}

		for ( let i = this.ai.length - 1; i >= 0; i -- ) if ( this.ai[ i ].gone > 3 ) {

			const x = this.ai[ i ];
			if ( x.visual ) x.visual.dispose();
			this.ai.splice( i, 1 );
			if ( ! this.ai.length && this._practice ) {

				this._practice = false;
				this._toast( 'Practice over', 1800 );

			}

		}

	}

	// ------------------------------------------------------------------ rounds, hits, bombs

	// every aircraft a round may strike, with the rule for who may hurt it
	_targetsAll() {

		if ( this._tgT === this._t && this._tg ) return this._tg;
		const out = [];
		this._tgT = this._t;
		this._tg = out;
		const sess = this._session();
		const ctx = { online: !! sess, practice: !! this._practice };
		const a = this.ac;
		const meShooter = this._meShooter();
		for ( const x of this.ai ) {

			if ( x.status === 'crash' ) continue;
			out.push( {
				id: x.owner, ai: x, flight: x.flight, position: x.position, velocity: x.velocity, parts: x.W.parts, radius: x.W.flight.span * 0.6,
				can: ( owner ) => owner === this.me && canHit( meShooter, { id: x.owner, kind: x.kind === 'drone' ? 'drone' : 'ai', inFighter: true, armed: true, alive: true }, ctx ).ok,
			} );

		}

		if ( a && a.status !== 'crash' ) out.push( {
			id: this.me, mine: true, flight: a.flight, position: a.position, velocity: a.velocity, parts: a.W.parts, radius: a.W.flight.span * 0.6,
			can: ( owner ) => String( owner ).startsWith( 'ai:' ) && canHit( { id: owner, kind: 'ai', inFighter: true, armed: true }, { id: this.me, kind: 'player', inFighter: true, armed: a.arm.armed, alive: true, grounded: a.flight.grounded, speed: a.flight.airspeed }, ctx ).ok,
		} );
		if ( sess ) {

			const rp = this.app.remotePlayers;
			const t = rp && rp.renderTime ? rp.renderTime() : null;
			for ( const r of this.net.remotes( t ) ) {

				if ( this.ride && r.id === this.ride.owner ) continue; // (never my own crew's aircraft)
				const pose = this._remotePose( r.id, r.df );
				const W = WARBIRDS[ r.df.a ];
				const target = { id: r.id, kind: 'player', inFighter: true, armed: hot( r.df.ar ), alive: r.df.st !== 'crash', grounded: r.df.st === 'ground', speed: pose.velocity.length() };
				out.push( {
					id: r.id, remote: true, df: r.df, renderT: t, flight: pose, position: pose.position, velocity: pose.velocity, parts: W.parts, radius: W.flight.span * 0.6,
					can: ( owner ) => owner === sess.id && canHit( meShooter, target, ctx ).ok,
				} );

			}

		}

		return out;

	}

	// me as a shooter: armed by my aircraft's switch (or the one I crew)
	_meShooter() {

		const armed = this.ac && this.mySeat >= 0 ? this.ac.arm.armed : this.ride && this.ride.df ? hot( this.ride.df.ar ) : false;
		return { id: this.me, kind: 'player', inFighter: !! ( this.ac && this.mySeat >= 0 ) || !! this.ride, armed, alive: true };

	}

	_remotePose( id, df ) {

		let v = this.remoteVis.get( id );
		if ( ! v ) this.remoteVis.set( id, v = { pose: new Pose(), visual: null } );
		return v.pose.fromDf( df );

	}

	_shoot( dt ) {

		for ( const r of this._rounds ) this.bullets.add( r );
		this._rounds.length = 0;
		const targets = this._targetsAll();
		const hits = this._hits;
		hits.length = 0;
		const vfx = this._vfx();
		let splashes = 0;
		this.bullets.update( dt, targets, hits, {
			waterAt: ( x, z ) => this.waterAt( x, z ), groundAt: ( x, z ) => this.groundAt( x, z ),
			onImpact: ( kind, x, y, z ) => {

				if ( ! vfx || splashes > 3 || this.rng() > 0.35 ) return;
				splashes ++;
				if ( kind === 'water' ) vfx.splash( x, y, z, 0.12 );
				else vfx.dust && vfx.dust( x, y, z, 0.15 );

			},
		} );
		const claims = new Map();
		for ( const h of hits ) {

			const tg = targets.find( ( t ) => t.id === h.target );
			if ( ! tg ) continue;
			if ( h.owner === this.me && this._t - this._lastHitTick > 0.06 ) {

				this._lastHitTick = this._t;
				this.guns.hit( 'tick' );
				if ( this.hud ) this.hud.hit();

			}

			if ( vfx && this.rng() < 0.5 ) vfx.flash( h.x, h.y, h.z, h.shell ? 0.5 : 0.18 );
			if ( tg.ai ) this._applyHit( tg.ai, h.part, h.dmg * ( 0.85 + this.rng() * 0.3 ), { shell: h.shell, by: h.owner } );
			else if ( tg.mine ) this._applyHit( this.ac, h.part, h.dmg * ( 0.85 + this.rng() * 0.3 ), { shell: h.shell, by: h.owner } );
			else if ( tg.remote ) {

				let c = claims.get( tg.id );
				if ( ! c ) claims.set( tg.id, c = { at: tg.renderT, list: [] } );
				c.list.push( { part: h.part, dmg: h.dmg, local: h.local } );

			}

		}

		const airframe = this.ac ? this.ac.id : this.ride ? this.ride.id : 'sabrewing';
		for ( const [ id, c ] of claims ) this.net.claim( id, c.list, c.at ?? ( this._session() ? this._session().serverNow() : 0 ), airframe );

	}

	_stepBombs( dt ) {

		const vfx = this._vfx();
		for ( let i = this.bombs.length - 1; i >= 0; i -- ) {

			const b = this.bombs[ i ];
			b.vy -= 9.81 * dt;
			b.vx *= 1 - 0.02 * dt;
			b.vz *= 1 - 0.02 * dt;
			b.x += b.vx * dt;
			b.y += b.vy * dt;
			b.z += b.vz * dt;
			b.t += dt;
			const sea = this.waterAt( b.x, b.z ), g = this.groundAt( b.x, b.z, b.y + 2 );
			if ( b.y > Math.max( sea, g ) && b.t < 40 ) continue;
			this.bombs.splice( i, 1 );
			const water = g < sea;
			const y = water ? sea : g;
			if ( vfx ) {

				if ( water ) vfx.splash( b.x, sea, b.z, 4 );
				vfx.explosion( b.x, y, b.z, 2.2, water ? 'water' : 'dirt' );

			}

			if ( this._near( { x: b.x, y, z: b.z } ) ) this.audio.crunch( 2, b.x, y, b.z, water );
			// (single player: the world feels it; online a bomb is only seen and heard: no griefing boats or towns)
			if ( ! b.show && this.offline ) {

				this._emit( 'explosion', { x: b.x, y, z: b.z, radius: b.radius, energy: 4e5 } );
				for ( const x of this.ai ) if ( x.status !== 'crash' && x.position.distanceTo( _v.set( b.x, y, b.z ) ) < b.radius ) this._applyHit( x, 'fuselage', b.dmg, { shell: true, by: this.me } );

			}

		}

	}

	// ------------------------------------------------------------------ the visuals

	_visuals( dt, cam ) {

		const fp = this.app.player && this.app.player.view === 'first';
		// mine
		const a = this.ac;
		if ( a && a.visual ) {

			const v = a.visual;
			v.setPose( a.position, a.quaternion );
			v.interior = this.mySeat >= 0;
			v.pilot = a.seats.who[ 0 ] !== 'me';
			v.setCrew( a.W.seats.map( ( s, i ) => i > 0 && !! a.seats.who[ i ] && a.seats.who[ i ] !== 'me' ) );
			v.setBomb( a.bombs > 0 );
			const c = a.flight.controls;
			v.update( dt, { rpm: this._rpms( a ), gear: a.flight.gearDown, pitch: c.pitch, roll: c.roll, yaw: c.yaw, cameraPos: cam, cockpit: this.mySeat >= 0 && fp, lodScale: this.lodScale } );
			a.turrets.forEach( ( t, i ) => v.setTurret( i, t.yaw, t.pitch ) );
			this._aircraftFx( 'mine', a.flight, a.damage.effects(), dt, a.W, a.flight.g );

		}

		for ( const x of this.ai ) {

			if ( ! x.visual || x.status === 'crash' ) continue;
			x.visual.setPose( x.position, x.quaternion );
			const c = x.flight.controls;
			x.visual.update( dt, { rpm: x.flight.rpm, gear: x.flight.gearDown, pitch: c.pitch, roll: c.roll, yaw: c.yaw, cameraPos: cam, lodScale: this.lodScale } );
			this._aircraftFx( x.owner, x.flight, x.damage.effects(), dt, x.W, x.flight.g );

		}

		this._remoteVisuals( dt, cam );
		// the torn-off parts falling
		for ( let i = this.debris.length - 1; i >= 0; i -- ) {

			const d = this.debris[ i ];
			d.t += dt;
			d.vel.y -= 9.81 * dt;
			d.vel.multiplyScalar( 1 - 0.3 * dt );
			d.g.position.addScaledVector( d.vel, dt );
			d.g.rotation.x += d.spin.x * dt;
			d.g.rotation.y += d.spin.y * dt;
			d.g.rotation.z += d.spin.z * dt;
			const p = d.g.position;
			const sea = this.waterAt( p.x, p.z );
			if ( p.y < Math.max( sea, this.groundAt( p.x, p.z ) ) || d.t > 12 ) {

				const vfx = this._vfx();
				if ( vfx && d.t <= 12 ) {

					if ( p.y < sea + 0.5 ) vfx.splash( p.x, sea, p.z, 1.2 );
					else vfx.dust && vfx.dust( p.x, p.y, p.z, 0.8 );

				}

				d.g.removeFromParent();
				this.debris.splice( i, 1 );

			}

		}

		for ( let i = this.wrecks.length - 1; i >= 0; i -- ) {

			const w = this.wrecks[ i ];
			w.t += dt;
			if ( w.t > 25 ) {

				const vfx = this._vfx();
				if ( vfx ) vfx.stopFire( w.id );
				this.wrecks.splice( i, 1 );

			}

		}

		this.fx.tracers( this.bullets.list, this.app.camera );
		this.fx.update( dt, this.app.camera );

	}

	_rpms( a ) {

		const f = a.flight;
		if ( a.W.engines.length < 2 ) return f.rpm;
		const e = a.systems ? a.systems.effects( a.damage ).engines : [ 1, 1 ];
		return e.map( ( k ) => ( k > 0 ? f.rpm : Math.min( 0.2, f.airspeed / 500 ) ) );

	}

	// vapour at the wingtips, smoke and fire from a damaged airframe
	_aircraftFx( key, flight, fx, dt, W, g ) {

		const cam = this.app.camera && this.app.camera.position;
		if ( cam && flight.position.distanceTo( cam ) > 2500 ) return;
		this.fx.trail( key, flight, DogfightFx.vapour( flight.velocity.length(), g || 1 ), dt, W.flight.span );
		// the smoke: a ribbon from each engine (Effects.js), glowing near a fire
		const v = flight.velocity;
		if ( fx.smoke ) W.engines.forEach( ( e, i ) => {

			const burning = !! ( fx.fires && ( fx.fires[ e.part ] || ( i === 0 && fx.fires.fuselage ) ) );
			const p = flight.toWorld( [ e.at[ 0 ], e.at[ 1 ] + 0.2, e.at[ 2 ] - 1.4 ], _v );
			this.fx.smoke( key + ':' + i, p.x, p.y, p.z, fx.smoke > 1 ? 0.95 : 0.4, burning, dt );

		} );
		const vfx = this._vfx();
		if ( ! vfx ) return;

		const fid = 'dogfight-fire-' + key;
		const burning = fx.fire;
		if ( burning ) {

			const part = Object.keys( fx.fires || {} )[ 0 ];
			const e = W.engines.find( ( x ) => x.part === part ) || W.engines[ 0 ];
			const p = flight.toWorld( [ e.at[ 0 ], e.at[ 1 ], e.at[ 2 ] - 1.6 ], _v );
			vfx.fire( fid, p.x, p.y, p.z, 0.5, v.x, v.z );
			this._fires.add( fid );

		} else if ( this._fires.has( fid ) ) {

			vfx.stopFire( fid );
			this._fires.delete( fid );

		}

	}

	_stopFires( key ) {

		const fid = 'dogfight-fire-' + key;
		const vfx = this._vfx();
		if ( this._fires.has( fid ) && vfx ) vfx.stopFire( fid );
		this._fires.delete( fid );

	}

	// the other players' aircraft, drawn on the remote players' clock
	_remoteVisuals( dt, cam ) {

		const rp = this.app.remotePlayers;
		const t = rp && rp.renderTime ? rp.renderTime() : null;
		const seen = new Set();
		const sess = this._session();
		if ( sess ) for ( const r of this.net.remotes( t ) ) {

			seen.add( r.id );
			const df = r.df;
			let e = this.remoteVis.get( r.id );
			if ( ! e ) this.remoteVis.set( r.id, e = { pose: new Pose(), visual: null } );
			e.pose.fromDf( df );
			if ( df.st === 'crash' ) {

				if ( e.visual ) e.visual.setVisible( false );
				if ( ! e.crashed ) {

					e.crashed = true;
					const vfx = this._vfx();
					const sea = this.waterAt( df.p[ 0 ], df.p[ 2 ] );
					if ( vfx ) df.p[ 1 ] < sea + 3 ? vfx.splash( df.p[ 0 ], sea, df.p[ 2 ], 3 ) : vfx.explosion( df.p[ 0 ], df.p[ 1 ], df.p[ 2 ], 1.6, 'metal' );

				}

				continue;

			}

			e.crashed = false;
			if ( ! e.visual || e.visual.id !== df.a ) {

				if ( e.visual ) e.visual.dispose();
				e.visual = this.models ? this.models.create( df.a, { pilot: true } ) : null;
				e.guns = new Aircraft( df.a, { env: this.env, owner: 'show:' + r.id } );
				e.torn = new Set();

			}

			const v = e.visual;
			const W = WARBIRDS[ df.a ];
			const mineRide = this.ride && this.ride.owner === r.id;
			if ( v ) {

				v.setVisible( true );
				v.setPose( e.pose.position, e.pose.quaternion );
				v.interior = mineRide;
				v.pilot = df.cr ? !! df.cr[ 0 ] && df.cr[ 0 ] !== sess.id : df.st !== 'bail';
				v.setCrew( W.seats.map( ( s, i ) => i > 0 && !! df.cr && !! df.cr[ i ] && df.cr[ i ] !== sess.id ) );
				const fp = this.app.player && this.app.player.view === 'first';
				v.update( dt, { rpm: df.r, gear: df.g, pitch: df.c[ 0 ], roll: df.c[ 1 ], yaw: df.c[ 2 ], cameraPos: cam, cockpit: mineRide && fp, lodScale: this.lodScale } );
				if ( df.tu ) df.tu.forEach( ( a, i ) => v.setTurret( i, a[ 0 ], a[ 1 ] ) );
				if ( mineRide && this.ride.turret ) v.setTurret( W.turrets.indexOf( this.ride.turret.T ) >= 0 ? W.turrets.indexOf( this.ride.turret.T ) : this.ride.turret.index, this.ride.turret.yaw, this.ride.turret.pitch );

			}

			// the damage as the owner sends it: smoke, fire, a torn-off wing
			const dmg = Damage.parse( df.d );
			const fx = { smoke: dmg.fire ? 2 : Math.max( ...W.engines.map( ( x ) => dmg.stages[ x.part ] ) ) >= 2 ? 2 : Math.max( ...W.engines.map( ( x ) => dmg.stages[ x.part ] ) ) >= 1 ? 1 : 0, fire: dmg.fire, fires: Object.fromEntries( dmg.fires.map( ( p ) => [ p, 1 ] ) ) };
			for ( const [ part, grp ] of [ [ 'wingL', 'wingL' ], [ 'wingR', 'wingR' ], [ 'tail', 'tail' ] ] ) if ( dmg.stages[ part ] === 3 && ! e.torn.has( part ) && v ) {

				e.torn.add( part );
				const g = v.detach( grp );
				if ( g ) this.debris.push( { g, vel: e.pose.velocity.clone().add( _v.set( 0, 5, 0 ) ), spin: new Vector3( 2, 1, 3 ), t: 0 } );

			}

			this._aircraftFx( 'r:' + r.id, e.pose, fx, dt, W, 1 + Math.abs( df.c[ 0 ] ) * 3 );
			// their guns, for show (the hits are the shooter's to find and the host's to judge)
			const ga = e.guns;
			ga.flight.position.copy( e.pose.position );
			ga.flight.quaternion.copy( e.pose.quaternion );
			ga.flight.velocity.copy( e.pose.velocity );
			if ( df.f ) {

				if ( ga.guns.state().empty ) ga.rearm();
				if ( ga.firePilot( dt, true, this._rounds, 'show:' + r.id ) ) this._flash( ga.flight, ga.W.guns );

			} else ga.firePilot( dt, false, null );
			if ( df.tu ) ga.turrets.forEach( ( tu, i ) => {

				if ( ! df.tu[ i ] ) return;
				tu.yaw = df.tu[ i ][ 0 ];
				tu.pitch = df.tu[ i ][ 1 ];
				// (the crew member's own client shows his rounds; the owner relays only who fires)
				const firing = !! ( df.tf & ( 1 << i ) ) && ! ( mineRide && this.ride.turret && this.ride.turret.index === i );
				if ( firing && tu.guns.state().empty ) tu.guns.rearm();
				if ( ga.fireTurret( i, dt, firing, this._rounds, 'show:' + r.id ) ) this._flash( tu.frame( ga.flight ), tu.guns.mounts, true );

			} );

		}

		for ( const [ id, e ] of this.remoteVis ) if ( ! seen.has( id ) ) {

			if ( e.visual ) e.visual.dispose();
			this.remoteVis.delete( id );
			this._stopFires( 'r:' + id );

		}

	}

	// ------------------------------------------------------------------ the HUD

	_project( p, out = {} ) {

		const cam = this.app.camera;
		if ( ! cam || ! cam.matrixWorldInverse || ! cam.projectionMatrix ) return null;
		_v3.copy( p ).applyMatrix4( cam.matrixWorldInverse );
		if ( _v3.z >= - 0.1 ) return null;
		const dist = _v3.length();
		_v3.applyMatrix4( cam.projectionMatrix );
		if ( Math.abs( _v3.x ) > 1.3 || Math.abs( _v3.y ) > 1.3 ) return null;
		const w = ( typeof window !== 'undefined' && window.innerWidth ) || 1280, h = ( typeof window !== 'undefined' && window.innerHeight ) || 720;
		out.x = ( _v3.x * 0.5 + 0.5 ) * w;
		out.y = ( 0.5 - _v3.y * 0.5 ) * h;
		out.dist = dist;
		return out;

	}

	_hudUpdate( dt ) {

		if ( ! this.hud ) return;
		const p = this.app.player;
		const aboard = !! ( this.ac && this.mySeat >= 0 ) || !! this.ride;
		const fp = p && p.view === 'first';
		const v = { visible: true, dt, flying: aboard, cockpit: fp, tags: [], marks: [], board: null, station: null, touch: !! ( this.app.input && this.app.input.touchMode ) };
		// the tags of the other aircraft (players' names with the ARMED badge; the practice AI)
		const cam = this.app.camera && this.app.camera.position;
		for ( const t of this._targetsAll() ) {

			if ( t.mine || ( this.ride && t.id === this.ride.owner ) ) continue;
			const d = cam ? t.position.distanceTo( cam ) : 0;
			if ( d > 2500 ) continue;
			const pr = this._project( _v.copy( t.position ).add( _v2.set( 0, 3.5, 0 ) ) );
			if ( ! pr ) continue;
			const name = t.ai ? t.ai.name : ( this.net.buf.get( t.id ) || {} ).name || 'Pilot';
			const armed = ! t.ai && hot( t.df.ar );
			// (a far, safe aircraft carries no tag: the badge is what matters at range)
			if ( d > 600 && ! armed && ! t.ai ) continue;
			v.tags.push( { id: t.id, x: pr.x, y: pr.y, name, armed, fade: d < 1800 ? 1 : 1 - ( d - 1800 ) / 700 } );

		}

		if ( this.online || this.score[ 0 ] + this.score[ 1 ] > 0 ) v.board = this.online ? this.net.board( 'You', this.score ) : [ { name: 'You', kills: this.score[ 0 ], deaths: this.score[ 1 ], self: true } ];
		if ( aboard ) Object.assign( v, this._hudAboard( fp ) );
		this.hud.update( v );

	}

	_hudAboard( fp ) {

		const out = { marks: [] };
		let flight, W, seat, guns = null, armed = 0, damage = null, systems = null, turret = null, marks = [];
		if ( this.ride ) {

			const r = this.ride;
			flight = r.pose;
			W = WARBIRDS[ r.id ];
			seat = r.seat;
			turret = r.turret;
			systems = r.systems;
			const df = r.df || {};
			armed = df.ar | 0;
			const parsed = Damage.parse( df.d );
			out.stages = parsed.stages;
			out.fire = parsed.fire;
			out.speed = flight.velocity.length();
			out.alt = flight.position.y;
			out.throttle = df.r || 0;
			out.g = 1;
			marks = df.mk || [];
			if ( df.st === 'down' ) out.warn = 'SHE IS GOING DOWN · BAIL OUT (\' twice)';
			else if ( df.st === 'bail' ) out.warn = 'THE PILOT BAILED OUT · BAIL OUT (\' twice)';

		} else {

			const a = this.ac;
			flight = a.flight;
			W = a.W;
			seat = this.mySeat;
			turret = a.turretOf( seat );
			systems = a.systems;
			damage = a.damage;
			armed = a.arm.armed ? ( a.arm.want ? 1 : 3 ) : a.arm.want ? 2 : 0;
			out.stages = {};
			for ( const p of damage.parts ) out.stages[ p ] = damage.stage( p );
			out.fire = damage.fire > 0;
			out.speed = flight.airspeed;
			out.alt = flight.position.y;
			out.throttle = flight.controls.throttle;
			out.g = flight.g;
			marks = a.systems ? [ ...a.systems.marks.keys() ] : [];
			guns = seat === 0 ? a.guns.state() : null;
			const warn = [];
			if ( flight.stalled && seat === 0 ) warn.push( 'STALL' );
			const tti = flight.velocity.y < - 5 ? flight.agl / - flight.velocity.y : Infinity;
			if ( tti < 4 && ! flight.grounded ) warn.push( 'PULL UP' );
			if ( damage.fire > 0 ) warn.push( 'FIRE' );
			if ( a.status === 'down' ) warn.push( 'BAIL OUT (\' twice)' );
			if ( guns && guns.jammed ) warn.push( 'GUNS HOT' );
			if ( a.W.brakes && flight.controls.brakes ) warn.push( 'DIVE BRAKES' );
			out.warn = warn.join( ' · ' );

		}

		if ( turret ) {

			guns = turret.guns.state();
			if ( turret.blockedBy && ! out.warn ) out.warn = 'TAIL IN THE LINE OF FIRE';

		}

		out.guns = guns || { ammo: 0, ammoMax: 0, heat: 0 };
		out.armed = armed;
		// the sight: the pilot's along the guns' line (at infinity in the cockpit), a turret's along its barrels
		if ( seat === 0 && W.guns.length ) {

			const S = W.seats[ 0 ];
			const pt = flight.toWorld( [ S.eye[ 0 ], S.eye[ 1 ], S.eye[ 2 ] + ( fp ? 1500 : this.options.cv ) ], _v );
			const pr = this._project( pt );
			if ( pr ) {

				const h = ( typeof window !== 'undefined' && window.innerHeight ) || 720;
				out.sight = { x: pr.x, y: pr.y, r: fp ? 0.05 * h / 2 / Math.tan( ( ( this.app.camera && this.app.camera.fov ) || 62 ) * Math.PI / 360 ) : 0 };

			}

			if ( this.options.lead ) out.lead = this._lead( flight, W.guns[ 0 ].vel );

		} else if ( turret ) {

			const fr = turret.frame( flight );
			const pt = _v2.set( 0, 0, 600 ).applyQuaternion( fr.quaternion ).add( fr.position );
			const pr = this._project( pt );
			if ( pr ) out.sight = { x: pr.x, y: pr.y, r: 0 };
			if ( this.options.lead ) out.lead = this._lead( fr, turret.guns.mounts[ 0 ].vel );

		}

		// the spotted targets for the whole crew; the radio's bearings
		const all = this._targetsAll();
		for ( const id of marks ) {

			const t = all.find( ( x ) => x.id === id );
			const pr = t && this._project( t.position );
			if ( pr ) out.marks.push( { x: pr.x, y: pr.y } );

		}

		out.station = this._stationView( W, seat, systems, damage );
		out.cockpit = fp && seat === 0;
		return out;

	}

	_lead( frame, vel ) {

		const fwd = _v.set( 0, 0, 1 ).applyQuaternion( frame.quaternion );
		let best = null, bd = 900;
		for ( const t of this._targetsAll() ) {

			if ( t.mine || ! t.can || ! t.can( this.me ) ) continue;
			const d = _v2.copy( t.position ).sub( frame.position );
			const dist = d.length();
			if ( dist > bd || d.dot( fwd ) / dist < 0.82 ) continue;
			bd = dist;
			best = t;

		}

		if ( ! best ) return null;
		const lp = leadPoint( frame.position, frame.velocity || _v3.set( 0, 0, 0 ), best.position, best.velocity, vel );
		return this._project( _v.set( lp.x, lp.y, lp.z ) );

	}

	_stationView( W, seat, sys, damage ) {

		const role = W.seats[ seat ] && W.seats[ seat ].role;
		if ( ! sys || ( role !== 'engineer' && role !== 'radio' ) ) return null;
		const rows = [];
		if ( role === 'engineer' ) {

			sys.engines.forEach( ( e, i ) => {

				const part = W.engines[ i ].part;
				const st = damage ? damage.stage( part ) : 0;
				const fire = damage ? !! damage.fires[ part ] : false;
				const sel = i === Math.min( this._engineSel, sys.engines.length - 1 );
				rows.push( { text: `${ sel ? '>' : ' ' } ${ W.engines.length > 1 ? ( i ? 'Right' : 'Left' ) : 'Engine' }: ${ st === 3 ? 'WRECKED' : e.stalled ? 'STOPPED' : 'running' }${ e.feathered ? ', feathered' : '' }${ fire ? ', FIRE' : '' } · bottle ${ e.bottle ? 'full' : 'spent' }`, cls: fire || e.stalled ? 'is-bad' : sel ? 'is-sel' : '' } );

			} );
			sys.tanks.forEach( ( t, i ) => rows.push( { text: `Tank ${ sys.tanks.length > 1 ? ( i ? 'R' : 'L' ) : '' }: ${ Math.round( t.fuel * 100 ) }%${ t.leak ? ' LEAKING' : '' }`, cls: t.leak ? 'is-bad' : '' } ) );
			rows.push( { text: `Patch kits: ${ sys.kits.engineer }` } );

		} else {

			rows.push( { text: `Radio: ${ sys.radio ? 'ON' : 'off' } · spotted: ${ sys.marks.size }`, cls: sys.radio ? 'is-ok' : '' } );
			if ( sys.radio ) {

				const me = this.ride ? this.ride.pose : this.ac && this.ac.flight;
				for ( const t of this._targetsAll().slice( 0, 6 ) ) {

					if ( t.mine || ! me || ( this.ride && t.id === this.ride.owner ) ) continue;
					const d = _v.copy( t.position ).sub( me.position );
					const dist = d.length();
					if ( dist > SYS.radioRange ) continue;
					const brg = ( Math.round( ( Math.atan2( d.x, d.z ) * 180 / Math.PI + 360 ) % 360 ) + '' ).padStart( 3, '0' );
					rows.push( { text: `${ t.ai ? t.ai.name : ( this.net.buf.get( t.id ) || {} ).name || 'Pilot' }: bearing ${ brg }, ${ Math.round( dist ) } m`, cls: 'is-bad' } );

				}

			}

			rows.push( { text: `Patch kits: ${ sys.kits.radio } (small damage)` } );

		}

		return {
			title: role === 'engineer' ? 'Flight engineer' : 'Radio operator',
			rows,
			dial: role === 'engineer' && sys.engines.some( ( e ) => e.stalled ) ? { needle: this.needle(), band: SYS.restartWindow } : null,
			progress: Math.max( this._hold.ext || 0, this._hold.patch || 0 ) || null,
			keys: role === 'engineer' ? '[ ] engine · O extinguish (hold) · U restart (green) · N feather · Y pump (hold) · ; patch (hold)' : 'Left button: spot · Y radio · ; patch (hold)',
		};

	}

	// ------------------------------------------------------------------ the sound

	_audio( dt ) {

		const a = this.ac;
		const p = this.app.player;
		const inside = p && p.view === 'first' && this.mySeat >= 0;
		if ( a ) {

			const f = a.flight;
			this.audio.update( dt, { running: f.engineOn && ! f.dmg.engineDead && a.status !== 'crash', rpm: f.rpm, airspeed: f.airspeed, x: f.position.x, y: f.position.y, z: f.position.z, inside } );

		} else if ( this.audio.level > 0.001 ) this.audio.update( dt, { running: false } );

		const mineFiring = { light: 0, heavy: 0, cannon: 0 };
		if ( a && this._lastFire && this.mySeat >= 0 ) {

			if ( this._lastFire.pilot ) for ( const g of a.W.guns ) mineFiring[ g.kind ] ++;
			a.turrets.forEach( ( t, i ) => { if ( this._lastFire.turrets & ( 1 << i ) && a.seats.who[ t.T.seat ] === 'me' ) for ( const g of t.T.guns ) mineFiring[ g.kind ] ++; } );

		}

		if ( this.ride && this.ride.fire && this.ride.turret ) for ( const g of this.ride.turret.T.guns ) mineFiring[ g.kind ] ++;
		this.guns.update( dt, mineFiring );
		// the nearest other gun firing
		const cam = this.app.camera && this.app.camera.position;
		let near = null, nd = 1500;
		const firingOthers = { light: 0, heavy: 0, cannon: 0 };
		for ( const r of this.bullets.list ) {

			if ( r.t > 0.05 || r.owner === this.me ) continue;
			const d = cam ? Math.hypot( r.px - cam.x, r.py - cam.y, r.pz - cam.z ) : 0;
			if ( d < nd ) {

				nd = d;
				near = { x: r.px, y: r.py, z: r.pz };

			}

			firingOthers[ r.kind ] = 1;

		}

		this.othersGuns.update( dt, near ? firingOthers : {}, near );

	}

	// ------------------------------------------------------------------ the map

	_marker() {

		const m = this.features && this.features.get ? this.features.get( 'worldmap' ) : null;
		if ( ! m || ! m.addMarker ) return;
		for ( const id of WARBIRD_IDS ) {

			const r = this.fleet[ id ];
			if ( r.owned && ! r.lost && r.at === 'field' && r.pose ) m.addMarker( { id: 'dogfight-' + id, kind: 'pin', icon: 'flag', x: r.pose[ 0 ], z: r.pose[ 2 ], label: `Your ${ WARBIRDS[ id ].name }`, mine: true } );
			else m.removeMarker && m.removeMarker( 'dogfight-' + id );

		}

	}

	marker() {

		const a = this.ac;
		return a ? { x: a.position.x, z: a.position.z, heading: a.flight.heading(), label: a.W.name } : null;

	}

	// ------------------------------------------------------------------ panels, saves

	isOpen() {

		return !! this.panel.isOpen;

	}

	close() {

		this.panel.close();

	}

	// (the pointer stays captured: the mouse looks and aims, the left button fires)
	wantsMouse() {

		return false;

	}

	hidesDriver() {

		return false;

	}

	toJSON() {

		const fleet = {};
		for ( const id of WARBIRD_IDS ) {

			const r = this.fleet[ id ];
			if ( ! r.owned ) continue;
			// (an aircraft out flying is saved where it would be found: in the field at its last ground pose, or on its line)
			const out = this.ac && this.ac.id === id ? { ...r, at: r.at === 'out' ? this._nearestStripName() || 'tidemark' : r.at, rec: this.ac.toRecord() } : r;
			fleet[ id ] = { owned: true, lost: !! out.lost, at: out.at === 'out' ? 'tidemark' : out.at, pose: out.pose || null, rec: out.rec || null };

		}

		return { v: SAVE_V, fleet, options: { ...this.options }, score: this.score.slice(), stats: { ...this.stats } };

	}

	fromJSON( d ) {

		this.reset();
		if ( ! d || typeof d !== 'object' ) return;
		if ( d.fleet && typeof d.fleet === 'object' ) for ( const id of WARBIRD_IDS ) {

			const s = d.fleet[ id ];
			if ( ! s || ! s.owned ) continue;
			const r = this.fleet[ id ];
			r.owned = true;
			r.lost = !! s.lost;
			r.at = [ ...STRIPS, 'field' ].includes( s.at ) ? s.at : 'tidemark';
			r.pose = Array.isArray( s.pose ) && s.pose.length === 4 && s.pose.every( Number.isFinite ) ? s.pose.slice() : null;
			if ( r.at === 'field' && ! r.pose ) r.at = 'tidemark';
			r.rec = s.rec && typeof s.rec === 'object' ? s.rec : null;

		}

		if ( d.options ) {

			this.options.lead = !! d.options.lead;
			if ( CONVERGENCE.includes( d.options.cv ) ) this.options.cv = d.options.cv;
			this.options.aiGunners = d.options.aiGunners !== false;

		}

		if ( Array.isArray( d.score ) ) this.score = [ d.score[ 0 ] | 0, d.score[ 1 ] | 0 ];
		if ( d.stats ) for ( const k in this.stats ) if ( Number.isFinite( d.stats[ k ] ) ) this.stats[ k ] = d.stats[ k ];
		this._marker();

	}

	reset() {

		const p = this.app.player;
		if ( p && this.vehicle && p.vehicle === this.vehicle && p.exitVehicle ) {

			const at = p.position;
			p.exitVehicle( at.x, this.groundAt( at.x, at.z ), at.z, 0, 'walk' );

		}

		if ( this.ac && this.ac.visual ) this.ac.visual.dispose();
		this.ac = null;
		this.mySeat = - 1;
		this.ride = null;
		this.vehicle = null;
		if ( this.chute ) this.chute.dispose();
		this.chute = null;
		this._clearAI();
		this.bombs.length = 0;
		for ( const d of this.debris ) d.g.removeFromParent();
		this.debris.length = 0;
		this.bullets.clear();
		this.net.reset();
		for ( const id of WARBIRD_IDS ) this.fleet[ id ] = { owned: false, lost: false, at: 'tidemark', pose: null, rec: null };
		this.options = { lead: false, cv: 250, aiGunners: true };
		this.score = [ 0, 0 ];
		for ( const k in this.stats ) this.stats[ k ] = 0;
		this.panel.close();

	}

	dispose() {

		this.reset();
		for ( const off of this._offs ) try { off && off(); } catch ( e ) { /* ignore */ }
		this._offs.length = 0;
		for ( const L of this.lines.values() ) this._dropLine( L );
		for ( const e of this.remoteVis.values() ) if ( e.visual ) e.visual.dispose();
		this.remoteVis.clear();
		this.fx.dispose();
		if ( this.hud ) this.hud.dispose();
		this.panel.dispose();
		this.audio.dispose();
		this.guns.dispose();
		this.othersGuns.dispose();
		if ( this.models ) this.models.dispose();

	}

}
