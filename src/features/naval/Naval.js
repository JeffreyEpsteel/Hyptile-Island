// Naval: AI merchant and pirate ships, cannon combat, hull damage, sinking, loot and the naval HUD.
// The Features module wraps this (index.js); everything outside the app's scene / water / audio is optional, so
// the whole simulation runs headless in node (test/feature-naval.mjs).
//
//   naval.ships                 Ship[] (merchant trawlers, pirate sloops / brigantines; see Ship.js)
//   naval.playerHull            { hp, max, sunk, boat }      the player's boat; max from the boat class (Boats.js mass)
//   naval.playerGun             { owned, level, guns, builtIn }   owned: the swivel gun is bought (the integrator sets owned = true)
//                               or the ship carries its own battery; guns: guns per side (1 for a swivel, the ship class's
//                               broadside.z.length for the sloop / brigantine); builtIn: the boat is a ship with a battery.
//                               Read the class from Boats.js; `level` rises to the battery's level on a ship.
//   naval.speedFactor           1 .. 0.35 as the hull is shot up (0 when sunk): multiply boatCtl.maxThrust by it
//   naval.fire( 'port' | 'starboard' ) -> bool   the player's broadside (keys Z / X at the helm); false if not owned / reloading.
//                               A swivel gun fires one ball; a ship fires `playerGun.guns` balls along its side in a short ripple
//   naval.damagePlayer( amount, cause )          hull damage from outside (grounding...)
//   naval.repairCost() / naval.repair( { free } ) -> bool      restore the hull (coins via features.state.spend); false while
//                               she is sinking or a wreck (salvage instead)
//
// Losing the boat (wave 4): at 0 hull she lists, settles and goes down over SINK_TIME (8 s, Ship.js sinkPose) where she
// is; the player is thrown overboard (naval.sinking while it lasts; the boat controller is frozen, its model animated).
// Her cargo crates, and the fish if you were aboard, go down with her (campaign; the sandbox keeps everything). Then she
// is a wreck on the sea floor (Wrecks.js: naval.wrecks, the hold claimable by diving, marked on the maps) and the boat
// is gone (hidden, unboardable) until Captain Roid raises her:
//   naval.wreck                 the player's current boat's wreck record | null      naval.sinking  { t, boat, x, z, ... } | null
//   naval.salvageCost() / naval.salvage( { free } ) -> bool     raise her: afloat at the berth, hull sound, her hold back
//                               (features.state pays; free in the sandbox); emits wreckSalvaged { boat, cost, x, z }
//   playerBoatSunk { cause, boat, x, z, aboard, boarded }: aboard = the player was on her (now overboard), boarded = a
//                               hostile boarding party held the deck (the death feature ends the run then)
//   naval.spawn( kind, opts ) -> Ship            add a ship by hand ('trawler' | 'sloop' | 'brigantine')
//   naval.bounties              Map id -> contract: the notices feature's bountyAccepted { id, target, tier, region, captain, ship }
//                               spawns that captain's ship (tier 1 sloop, 2 tougher sloop, 3 brigantine) in deep water near the
//                               region; sinking him emits shipSunk { name: target, target, captain, bountyId, byPlayer ... };
//                               bountyCancelled releases him; a resumed contract (after a load) respawns a missing target
//   naval.active                 false when disabled, and in multiplayer unless the room's host (netsync/NavalLink.js)
//   naval.update( dt ) / toJSON() / fromJSON( d ) / reset() / dispose()
//
// Ship modules (Modules.js; slots per hull in Boats.js `slots`):
//   naval.fitting               the Fitting (tiers owned, the fit of every hull); naval.mods = fitting.stats() of this hull
//   naval.moduleRows( state? ) -> [ { id, label, desc, price, owned, fitted, canBuy, canFit, tier, maxTier, next, slot, kind,
//                               effect, reason } ]   for Captain Roid's yard
//   naval.moduleSlots() -> [ { index, kind, label, module, moduleLabel } ]
//   naval.buyModule( id ) -> { ok, tier, price, reason }   (features.state pays; sandbox free); fits it into a free slot
//   naval.fitModule( id, slot? ) / naval.removeModule( id ) -> bool
//   naval.holdBonus()           cargo crate multiplier (extra hold; the trade feature multiplies its capacity by it)
//   naval.fishHoldBonus()       fish hold (kg) multiplier (fish well)
//   naval.biteBonus()           bite-rate multiplier now: the lantern rig at night while aboard or beside the boat; else 1
//   naval.nightBiteBonus        the fitted lantern's multiplier (1 without one), whatever the hour
//   naval.sightRange()          how far pirates show on the HUD (the spyglass)
//   Effects run through playerHull.max (plating hpMul), damagePlayer (taken), speedFactor (x speed^2: thrust for top
//   speed), the player's guns (damage, reach, reload) and playerGun (the swivel gun's tier is the gun level).
//
// Pirates and spawning:
//   naval.spawn( classId, opts ) -> Ship    public: the pirates package spawns named captains through it. classId 'trawler' |
//                               'sloop' | 'brigantine'; opts { id, x, z, y, yaw, speed, hp, name, captain, state, route: [ [ x, z ] ],
//                               loop, index, dir }. Set ship.fleeAt / ship.dmgMul / ship.maxHp afterwards to tune a captain.
//   Pirates hunt the nearest legal player boat they can see: the local one (naval.target) or, on the room's host, another
//   player's (app.remotePlayers peers with a driven boat outside the harbour / cove). Their balls are broadcast by
//   NavalLink and hurt the boat they land on, on its owner's machine.
//   naval.remoteShot( from [ x, y, z ], dir [ x, y, z ], speed, info { owner, damage, faction, big } )   a ball from another machine
//
// Events emitted on the Features registry: shipSunk { id, name, faction, x, z, byPlayer, kind, loot },
// enemyDefeated { id, name, kind: 'pirate' } (pirate sunk by the player), playerBoatDamaged { hp, maxHp, cause },
// playerBoatSunk { cause }, lootCollected { value, x, z, source } (the last is naval's own),
// cannonFired { x, y, z, dir: { x, y, z }, side, by: 'player' | 'pirate' | 'remote', owner } (every gun, remote ones too),
// cannonballImpact { x, y, z, vx, vy, vz, energy (J), hit: 'water' | 'ship' | 'land' | 'prop', target, owner }
// (target: a ship id, 'player', a prop id or null), moduleBought { id, tier, price }, moduleFitted { id, slot },
// moduleRemoved { id }. With features.get( 'vfx' ) installed it draws the shots, impacts and sinkings from these events and
// naval's own Effects.js spawns are skipped (Effects.js is the fallback without it).
//
// Hooks the app provides (all optional): app.scene, app.camera, app.terrainData, app.query (WaterQuery), app.spray,
// app.audio (SoundScape), app.boatCtl (position, quaternion, velocity, driven, moored), app.player.mode ('boat' at the helm),
// app.game.state (boat id, earn, spend), app.game.toast, app.cameraFeel.kick, app.settings.timeOfDay, features.get( 'weather' ).

import { BOATS } from '../../game/Boats.js';
import { MUZZLE_REACH } from '../../world/boat/ShipDecks.js';
import { SHIP_CLASSES, PIRATE_CAPTAINS, PIRATE_SHIPS, MERCHANT_SHIPS, lootValue } from './ShipClasses.js';
import { Ship, SINK_TIME, sinkPose } from './Ship.js';
import { Wrecks, salvageCostFor } from './Wrecks.js';
import { strip, empty } from '../death/Belongings.js';
import { think } from './Brains.js';
import { MERCHANT_ROUTE, PATROLS, inSafeZone, makeCursor, nearestIndex } from './Routes.js';
import { leadAim, solveElevation, quatBox, rotateByQuat, MUZZLE_SPEED } from './Ballistics.js';
import { Projectiles } from './Projectiles.js';
import { Effects } from './Effects.js';
import { Loot } from './Loot.js';
import { NavalAudio } from './NavalAudio.js';
import { WaterPool } from './WaterPool.js';
import { ModelSet } from './Models.js';
import { NavalHud, hudModel, ARROW_RANGE } from './Hud.js';
import { Fitting, SLOT_LABELS, moduleLabel } from './Modules.js';
import { ModuleMeshes } from './ModuleModels.js';
import { clamp, makeRng, normaliseSide, sideSign, angleDiff, DEG } from './util.js';

// swivel gun by level: damage per ball, reload (s), one-sigma spread (rad), traverse half arc (rad)
export const GUN_LEVELS = [
	null,
	{ damage: 20, reload: 4.0, spread: 0.024, traverse: 24 * DEG },
	{ damage: 28, reload: 3.4, spread: 0.018, traverse: 24 * DEG },
	{ damage: 38, reload: 2.8, spread: 0.012, traverse: 26 * DEG },
];

export const REPAIR_PER_HP = 2; // coins
export const GUN_RANGE = 320; // m, auto-aim reach of the player's gun
export const BALL_MASS = 2.5; // kg (cannonballImpact energy = 0.5 m v^2)
const LANTERN_REACH = 12; // m: fishing this close to the boat counts as fishing under its lantern
const MAX_SHIPS = 8;
const PARK_Y = - 400; // where a wrecked boat's (hidden) model and controller wait, out of every query and view
const ABOARD = [ 'boat', 'deck', 'seat' ];

// quaternion product a * b ( [ x, y, z, w ] )
function qmul( a, b ) {

	return [
		a[ 3 ] * b[ 0 ] + a[ 0 ] * b[ 3 ] + a[ 1 ] * b[ 2 ] - a[ 2 ] * b[ 1 ],
		a[ 3 ] * b[ 1 ] - a[ 0 ] * b[ 2 ] + a[ 1 ] * b[ 3 ] + a[ 2 ] * b[ 0 ],
		a[ 3 ] * b[ 2 ] + a[ 0 ] * b[ 1 ] - a[ 1 ] * b[ 0 ] + a[ 2 ] * b[ 3 ],
		a[ 3 ] * b[ 3 ] - a[ 0 ] * b[ 0 ] - a[ 1 ] * b[ 1 ] - a[ 2 ] * b[ 2 ],
	];

}

// hull points of the player's boat by class: the catalog's `hp` (the ships: trawler 520, sloop 420, brigantine 760), else from
// the mass: skiff 69 ... lobster boat 264
export function hullMaxFor( boatId ) {

	const b = BOATS[ boatId ];
	if ( b && Number.isFinite( b.hp ) ) return Math.round( b.hp );
	return Math.round( 40 + 0.07 * ( b ? b.mass : 640 ) );

}

// extra reload per additional gun of a broadside: a battery of n guns reloads in base * ( 1 + SALVO_RELOAD * ( n - 1 ) )
export const SALVO_RELOAD = 0.12;
// seconds between the guns of a ripple
const RIPPLE = [ 0.08, 0.17 ];

// The player's gun record. `owned` is the swivel gun bought at the yard (and fitted in an arms slot) OR the battery a ship
// comes with (builtIn); writing owned = true / false sets the purchase only (and fits / unships the swivel), so selling
// the ship leaves the bought gun as it was. `level` is the swivel gun's tier (`swivel`), or on a ship the battery's level
// when that is higher; writing it sets the swivel's tier.
function makeGun( mounted = () => true, onBuy = null ) {

	const g = { swivel: 1, battery: 0, guns: 1, builtIn: false, bought: false };
	Object.defineProperty( g, 'owned', {
		get() { return this.builtIn || ( this.bought && mounted() ); },
		set( v ) {

			this.bought = !! v;
			if ( onBuy ) onBuy( this.bought );

		},
		enumerable: true,
	} );
	Object.defineProperty( g, 'level', {
		get() { return this.builtIn ? Math.max( this.battery, this.swivel ) : this.swivel; },
		set( v ) { this.swivel = clamp( Math.round( v ) || 1, 1, 3 ); },
		enumerable: true,
	} );
	return g;

}

export class Naval {

	constructor( app, features, opts = {} ) {

		this.app = app || {};
		this.features = features || null;
		this.opts = opts;
		this.rng = makeRng( opts.seed ?? ( ( Date.now() ^ 0x5eed ) & 0x7fffffff ) );
		this.enabled = opts.enabled ?? true;
		this.settings = Object.assign( { autoSpawn: true, merchants: 2, maxPirates: 3, drawRange: 600, queryRange: 250, shadowRange: 220 }, opts.settings );
		this.time = 0;
		this.ships = [];
		this.shots = []; // volleys waiting for their turn: { t, ship, st }
		this.playerHull = { hp: 0, max: 0, sunk: false, boat: null };
		// ship modules: the swivel gun's tier lives in the gun record (hook), everything else in the fitting
		this.fitting = new Fitting( { hooks: { swivel: {
			get: () => ( this.playerGun.bought ? this.playerGun.swivel : 0 ),
			set: ( t ) => {

				if ( t > 0 ) {

					this.playerGun.bought = true;
					this.playerGun.swivel = clamp( t, 1, 3 );

				} else this.playerGun.bought = false;

			},
		} } } );
		this._mods = null;
		this._modsKey = '';
		this.playerGun = makeGun(
			() => ! this.fitting.boat || this.fitting.isFitted( 'swivel' ),
			( bought ) => {

				if ( bought ) this.fitting.fit( 'swivel' );
				else this.fitting.remove( 'swivel' );

			},
		);
		this.playerShots = []; // the rest of a ripple: { t, side, index, plan, target }
		this.reloadLeft = { port: 0, starboard: 0 };
		this.stats = { shipsSunk: 0, piratesSunk: 0, shots: 0, hits: 0, looted: 0 };
		this.target = { x: 0, y: 0, z: 0, vx: 0, vz: 0, ok: false, safe: false };
		this.world = { time: 0, night: false, storm: false, target: this.target, rng: this.rng, terrain: null, fire: ( s, side ) => this._shipFire( s, side ), escape: ( s ) => this._escape( s ) };
		this.keys = { port: false, starboard: false };
		this._nextId = 1;
		this._spawnT = 0.5;
		this._pirateAt = 6;
		this._merchantRespawn = [];
		this._initialMerchants = true;
		this._wasActive = false;
		this._hintT = 0;
		this._frame = 0;
		this._pbox = null;
		this._pboxFrame = - 1;
		this._fp = {};
		this._m = { x: 0, y: 0, z: 0 };
		this._ctx = null;
		this._targets = []; // legal player boats this frame: naval.target and the remote ones
		this._remote = new Map(); // peer id -> target record (with a velocity estimate)

		const app2 = this.app;
		this.terrain = app2.terrainData || null;
		this.world.terrain = this.terrain;
		this.scene = app2.scene || null;
		this.models = opts.models === false ? null : ( opts.models || ( this.scene ? new ModelSet( { scene: this.scene } ) : null ) );
		this.pool = new WaterPool( app2.query || null, { ships: opts.poolShips ?? 3 } );
		this.balls = new Projectiles( { scene: this.scene } );
		this.fx = new Effects( { scene: this.scene, spray: app2.spray || null } );
		this.loot = new Loot( { scene: this.scene } );
		this.audio = new NavalAudio( app2 );
		this.hud = opts.hud === false ? null : new NavalHud( { doc: opts.doc || ( typeof document !== 'undefined' ? document : null ) } );
		this.modMeshes = opts.moduleMeshes === false || ! this.scene ? null : ( opts.moduleMeshes || new ModuleMeshes() );
		this.wrecks = new Wrecks( { app: app2, features, scene: this.scene, makeModel: opts.wreckModel || null } );
		this.sinking = null;
		if ( this.hud && ! this.hud.root ) this.hud = null;

		if ( this.features && this.features.claimKey ) {

			this.keys.port = this.features.claimKey( 'KeyZ', 'naval' );
			this.keys.starboard = this.features.claimKey( 'KeyX', 'naval' );

		}

		// bounty contracts: the notices feature announces them, the named captain's ship is spawned in the region
		this.bounties = new Map(); // id -> { id, target, captain, ship, tier, region, state: 'open' }
		this._offs = [];
		if ( this.features && this.features.on ) {

			this._offs.push( this.features.on( 'bountyAccepted', ( e ) => this._onBounty( e ) ) );
			this._offs.push( this.features.on( 'bountyCancelled', ( e ) => this._onBountyCancelled( e ) ) );

		}

		this._syncBoat( true );

	}

	// ------------------------------------------------------------------ state

	get active() {

		return this.enabled && ! ( this.features && this.features.mode === 'multiplayer' );

	}

	// thrust multiplier: a holed hull is slower; the drive module's speed x needs speed^2 of thrust (quadratic drag)
	get speedFactor() {

		const h = this.playerHull;
		if ( h.sunk ) return 0;
		const f = h.max > 0 ? h.hp / h.max : 1;
		const sp = this.mods.speed;
		return ( f >= 0.5 ? 1 : 0.35 + 0.65 * ( f / 0.5 ) ) * sp * sp;

	}

	// the effects of the modules fitted on the current hull (Fitting.stats, cached per change)
	get mods() {

		const f = this.fitting, key = `${ f.boat }|${ f.version }|${ this.playerGun.bought ? this.playerGun.swivel : 0 }`;
		if ( key !== this._modsKey || ! this._mods ) {

			this._mods = f.stats();
			this._modsKey = key;

		}

		return this._mods;

	}

	get pirates() {

		return this.ships.filter( ( s ) => s.faction === 'pirate' );

	}

	get merchants() {

		return this.ships.filter( ( s ) => s.faction === 'merchant' );

	}

	// seconds to reload the player's broadside: the gun level's reload, longer with every extra gun of the battery
	reloadTime( level = this.playerGun.level ) {

		return GUN_LEVELS[ clamp( Math.round( level ) || 1, 1, 3 ) ].reload * ( 1 + SALVO_RELOAD * ( Math.max( 1, this.playerGun.guns ) - 1 ) ) * this.mods.reload;

	}

	get night() {

		const h = this.app.settings ? this.app.settings.timeOfDay : null;
		return typeof h === 'number' && ( h >= 20 || h < 5.5 );

	}

	get storm() {

		const w = this.features && this.features.get ? this.features.get( 'weather' ) : null;
		const kind = w && ( ( w.current && w.current.kind ) || w.kind );
		return kind === 'storm';

	}

	// pirates the sea holds right now: one by day, one more at night, one more in a storm
	wantedPirates() {

		return Math.min( this.settings.maxPirates, 1 + ( this.night ? 1 : 0 ) + ( this.storm ? 1 : 0 ) );

	}

	_boatId() {

		const g = this.app.game;
		return ( g && g.state && g.state.boat ) || this.app.boatId || 'lobster';

	}

	// the gun record follows the boat class: a ship carries its own battery, a small boat the (bought) swivel gun
	_syncGun( id ) {

		const g = this.playerGun, spec = BOATS[ id ];
		const bat = spec && spec.broadside ? spec.broadside : null;
		g.builtIn = !! bat;
		g.guns = bat ? bat.z.length : 1;
		g.battery = bat ? bat.level || 1 : 0;

	}

	// hull points of a class with the fitted plating
	_hullMax( id ) {

		return Math.round( hullMaxFor( id ) * ( this.fitting.boat === id ? this.mods.hpMul : 1 ) );

	}

	// the fit changed (plating bought or unshipped): the maximum follows, the damage taken stays
	_syncMods() {

		const h = this.playerHull;
		if ( ! h.boat ) return;
		const max = this._hullMax( h.boat );
		if ( max === h.max ) return;
		const d = max - h.max;
		h.max = max;
		h.hp = h.sunk ? Math.min( h.hp, max ) : clamp( h.hp + Math.max( 0, d ), 0.1, max );

	}

	// the hull of the current boat class (a new boat arrives undamaged; a restored save keeps its damage)
	_syncBoat( force = false ) {

		const id = this._boatId();
		const h = this.playerHull;
		if ( id !== this._gunBoat || force ) {

			this._gunBoat = id;
			this._syncGun( id );

		}

		this.fitting.setBoat( id );
		if ( id === h.boat && ! force ) return;
		const first = h.boat === null;
		// traded away while she lay on the bottom: no salvage any more (her hold stays for a diver)
		const w = this.wrecks && this.wrecks.own;
		if ( ! first && w && w.boat !== id ) this.wrecks.abandon();
		h.boat = id;
		h.max = this._hullMax( id );
		if ( first ) {

			if ( ! ( h.hp > 0 ) && ! h.sunk ) h.hp = h.max;
			h.hp = Math.min( h.hp, h.max );

		} else {

			h.hp = h.max;
			h.sunk = false;

		}

	}

	// size of the player's boat for hit tests and muzzle positions
	_dims() {

		const id = this.playerHull.boat;
		const b = BOATS[ id ] || BOATS.lobster;
		const m = this.app.boat && this.app.boat.dimensions;
		const length = ( m && m.length ) || b.length, beam = ( m && m.beam ) || b.beam, draft = ( m && m.draft ) || b.draft;
		const free = ( m && m.freeboard ) || b.freeboard;
		const top = b.kind === 'ship' ? b.deckY + 2.5 : free + ( b.drive === 'wheel' ? 1.6 : 0.5 );
		return { length, beam, draft, free, top, deck: b.deckY ?? 0.3 };

	}

	_playerBox() {

		if ( this._pboxFrame === this._frame ) return this._pbox;
		this._pboxFrame = this._frame;
		const b = this.app.boatCtl;
		if ( this.playerHull.sunk || ! b || ! b.position || ! b.quaternion ) return ( this._pbox = null );
		const d = this._dims();
		const cy = ( d.top - d.draft ) / 2;
		const off = rotateByQuat( b.quaternion, { x: 0, y: cy, z: 0 } );
		this._pbox = quatBox( { x: b.position.x + off.x, y: b.position.y + off.y, z: b.position.z + off.z }, b.quaternion, [ d.beam / 2 + 0.15, ( d.top + d.draft ) / 2, d.length / 2 + 0.1 ] );
		return this._pbox;

	}

	_refreshTarget() {

		const b = this.app.boatCtl, t = this.target;
		if ( ! b || ! b.position ) {

			t.ok = false;
			return;

		}

		t.x = b.position.x;
		t.y = b.position.y;
		t.z = b.position.z;
		t.vx = b.velocity ? b.velocity.x : 0;
		t.vz = b.velocity ? b.velocity.z : 0;
		t.safe = !! inSafeZone( t.x, t.z );
		// a legal target: afloat, under way (or at least not tied up), and outside the harbour / cove
		t.ok = ! this.playerHull.sunk && ( !! b.driven || ! b.moored ) && ! t.safe;

	}

	_camPos() {

		const c = this.app.camera;
		return c && c.position ? c.position : ( this.app.boatCtl && this.app.boatCtl.position ) || null;

	}

	_say( text, ms = 2600 ) {

		const g = this.app.game;
		if ( g && g.toast ) g.toast( text, ms );

	}

	// ------------------------------------------------------------------ ships

	spawn( kind, o = {} ) {

		const cls = SHIP_CLASSES[ kind ];
		if ( ! cls ) throw new Error( 'naval.spawn: unknown class ' + kind );
		const rng = this.rng;
		const id = o.id || `${ kind }-${ this._nextId ++ }`;
		const pirate = cls.faction === 'pirate';
		const ship = new Ship( kind, {
			id, x: o.x ?? 0, z: o.z ?? 0, yaw: o.yaw ?? 0, speed: o.speed, hp: o.hp,
			name: o.name || ( pirate ? rng.pick( PIRATE_SHIPS ) : rng.pick( MERCHANT_SHIPS ) ),
			captain: o.captain || ( pirate ? rng.pick( PIRATE_CAPTAINS ) : null ),
			state: o.state,
		} );
		if ( o.route ) ship.cursor = makeCursor( o.route, { loop: !! o.loop, index: o.index ?? 0, dir: o.dir ?? 1 } );
		ship.want = ship.yaw;
		ship.pose.y = ship.pose.ty = o.y ?? 0;
		this.ships.push( ship );
		return ship;

	}

	_spawnMerchant( end ) {

		const n = MERCHANT_ROUTE.length;
		const first = end ? n - 1 : 0, next = end ? n - 2 : 1;
		const a = MERCHANT_ROUTE[ first ], b = MERCHANT_ROUTE[ next ];
		return this.spawn( 'trawler', {
			x: a[ 0 ], z: a[ 1 ], yaw: Math.atan2( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] ),
			route: MERCHANT_ROUTE, index: next, dir: end ? - 1 : 1, speed: 0,
		} );

	}

	// a pirate at the patrol waypoint farthest from the player (and at least 300 m away: no pop-in)
	spawnPirate( kind = null ) {

		const cam = this._camPos();
		let best = null, bd = - 1;
		for ( let r = 0; r < PATROLS.length; r ++ ) {

			PATROLS[ r ].forEach( ( p, i ) => {

				const d = cam ? Math.hypot( p[ 0 ] - cam.x, p[ 1 ] - cam.z ) : 1e6;
				const taken = this.ships.some( ( s ) => s.alive && s.faction === 'pirate' && Math.hypot( s.x - p[ 0 ], s.z - p[ 1 ] ) < 120 );
				if ( d > bd && ! taken ) { bd = d; best = { r, i, p }; }

			} );

		}

		if ( ! best || bd < 300 ) return null;
		if ( ! kind ) {

			const bri = this.ships.some( ( s ) => s.kind === 'brigantine' && s.alive );
			kind = ! bri && ( this.wantedPirates() >= 3 ? this.rng() < 0.75 : this.night && this.rng() < 0.25 ) ? 'brigantine' : 'sloop';

		}

		const pts = PATROLS[ best.r ];
		const nxt = ( best.i + 1 ) % pts.length;
		return this.spawn( kind, {
			x: best.p[ 0 ], z: best.p[ 1 ], yaw: Math.atan2( pts[ nxt ][ 0 ] - best.p[ 0 ], pts[ nxt ][ 1 ] - best.p[ 1 ] ),
			route: pts, loop: true, index: nxt, speed: SHIP_CLASSES[ kind ].speed * 0.6,
		} );

	}

	// ------------------------------------------------------------------ bounties

	_onBounty( e ) {

		if ( ! e || typeof e !== 'object' || e.id === undefined || ! e.region ) return;
		const id = String( e.id );
		const old = this.bounties.get( id );
		const b = {
			id, target: String( e.target || e.captain || id ), captain: String( e.captain || e.target || id ),
			ship: String( e.ship || 'Black Gull' ), tier: clamp( Math.round( e.tier ) || 1, 1, 3 ),
			region: { x: +e.region.x || 0, z: +e.region.z || 0 },
		};
		this.bounties.set( id, b );
		// a resumed contract (after a load) whose target is still afloat is left alone
		if ( old && this._bountyShip( id ) ) return;
		if ( this.active ) this._spawnBounty( b );

	}

	_onBountyCancelled( e ) {

		if ( ! e || e.id === undefined ) return;
		const id = String( e.id );
		this.bounties.delete( id );
		const s = this._bountyShip( id );
		if ( s ) s.state = 'gone'; // the target is released: he sails off

	}

	_bountyShip( id ) {

		return this.ships.find( ( s ) => s.bounty && s.bounty.id === id && s.alive ) || null;

	}

	// deep open water near (x, z): the contract's region is only a "last known" spot and may sit on a shoal
	_deepWaterNear( x, z ) {

		const T = this.terrain;
		if ( ! T ) return { x, z };
		const deep = ( px, pz ) => T.heightAt( px, pz ) < - 6 && ! inSafeZone( px, pz )
			&& [ [ 25, 0 ], [ - 25, 0 ], [ 0, 25 ], [ 0, - 25 ] ].every( ( o ) => T.heightAt( px + o[ 0 ], pz + o[ 1 ] ) < - 4 );
		for ( let r = 0; r <= 600; r += 30 ) {

			const n = r === 0 ? 1 : Math.max( 8, Math.round( r / 12 ) );
			for ( let i = 0; i < n; i ++ ) {

				const a = ( i / n ) * Math.PI * 2;
				const px = x + Math.sin( a ) * r, pz = z + Math.cos( a ) * r;
				if ( deep( px, pz ) ) return { x: px, z: pz };

			}

		}

		// nothing close: the nearest patrol waypoint
		let best = PATROLS[ 0 ][ 0 ], bd = Infinity;
		for ( const r of PATROLS ) for ( const p of r ) {

			const d = Math.hypot( p[ 0 ] - x, p[ 1 ] - z );
			if ( d < bd ) { bd = d; best = p; }

		}

		return { x: best[ 0 ], z: best[ 1 ] };

	}

	// the named pirate: tier 1 a sloop, tier 2 a tougher sloop, tier 3 a brigantine; he patrols a loop round the region,
	// never flees, and is not part of the ambient pirate count
	_spawnBounty( b ) {

		if ( this._bountyShip( b.id ) ) return null;
		const p = this._deepWaterNear( b.region.x, b.region.z );
		const kind = b.tier >= 3 ? 'brigantine' : 'sloop';
		// a loop of waypoints 80 m round the spot (those that are deep water); with fewer than two, the nearest patrol lane
		const T = this.terrain;
		let pts = [ 0, 1, 2, 3 ].map( ( i ) => [ p.x + Math.sin( i * Math.PI / 2 ) * 80, p.z + Math.cos( i * Math.PI / 2 ) * 80 ] )
			.filter( ( q ) => ! T || ( T.heightAt( q[ 0 ], q[ 1 ] ) < - 5 && ! inSafeZone( q[ 0 ], q[ 1 ] ) ) );
		let idx = 0;
		if ( pts.length < 2 ) {

			let bd = Infinity;
			for ( const r of PATROLS ) {

				const q = r[ nearestIndex( r, p.x, p.z ) ];
				const d = Math.hypot( q[ 0 ] - p.x, q[ 1 ] - p.z );
				if ( d < bd ) { bd = d; pts = r; }

			}

			idx = nearestIndex( pts, p.x, p.z );

		}

		const nxt = ( idx + 1 ) % pts.length;
		const s = this.spawn( kind, {
			x: p.x, z: p.z, yaw: Math.atan2( pts[ nxt ][ 0 ] - p.x, pts[ nxt ][ 1 ] - p.z ),
			name: b.ship, captain: b.captain, route: pts, loop: true, index: nxt, speed: SHIP_CLASSES[ kind ].speed * 0.5,
		} );
		s.bounty = b;
		s.fleeAt = 0; // a named captain fights to the end
		s.dmgMul = b.tier === 2 ? 1.2 : 1;
		s.maxHp = Math.round( s.maxHp * ( b.tier === 2 ? 1.5 : b.tier === 1 ? 1.1 : 1.15 ) );
		s.hp = s.maxHp;
		return s;

	}

	// a contract whose ship is not afloat (not spawned yet, or the world was cleared) gets one
	_manageBounties() {

		for ( const b of this.bounties.values() ) if ( ! this._bountyShip( b.id ) ) this._spawnBounty( b );

	}

	_manage( dt ) {

		this._spawnT -= dt;
		if ( this._spawnT > 0 ) return;
		const step = 2;
		this._spawnT = step;
		const cfg = this.settings;
		this._manageBounties();
		if ( this.ships.length >= MAX_SHIPS ) return;

		// merchants: the first pair sail at once, a sunk one is replaced after four minutes
		const merchants = this.ships.filter( ( s ) => s.faction === 'merchant' && s.alive ).length;
		if ( this._initialMerchants ) {

			this._initialMerchants = false;
			for ( let i = merchants; i < cfg.merchants; i ++ ) this._spawnMerchant( i % 2 === 1 );

		} else {

			for ( let i = this._merchantRespawn.length - 1; i >= 0; i -- ) {

				this._merchantRespawn[ i ] -= step;
				if ( this._merchantRespawn[ i ] <= 0 && merchants + 1 <= cfg.merchants ) {

					this._merchantRespawn.splice( i, 1 );
					this._spawnMerchant( this.rng() < 0.5 );

				}

			}

		}

		// pirates
		const wanted = this.wantedPirates();
		const pirates = this.ships.filter( ( s ) => s.faction === 'pirate' && s.alive && ! s.bounty );
		if ( pirates.length < wanted && this.time >= this._pirateAt ) {

			if ( this.spawnPirate() ) this._pirateAt = this.time + 20;

		} else if ( pirates.length > wanted ) {

			// the surplus (day broke, the storm passed) slips away once nobody can see it
			const cam = this._camPos();
			const s = pirates.find( ( p ) => p.state === 'patrol' && ( ! cam || Math.hypot( p.x - cam.x, p.z - cam.z ) > 800 ) );
			if ( s ) s.state = 'gone';

		}

	}

	_escape( s ) {

		if ( s.bounty ) {

			s.setState( 'patrol' ); // a contract target never leaves the sea
			return;

		}

		s.escaped = true;
		s.state = 'gone';
		this._pirateAt = Math.max( this._pirateAt, this.time + 45 );

	}

	// think + sail every ship, then dress them
	_sail( dt ) {

		const w = this.world;
		w.time = this.time;
		w.night = this.night;
		w.storm = this.storm;
		const cam = this._camPos();
		const amp = w.storm ? 2.2 : 1;
		const near = [];
		for ( const s of this.ships ) {

			w.target = s.puppet ? this.target : this._targetFor( s );
			think( s, w, dt );
			s.integrate( dt, this.terrain );
			s.dist = cam ? Math.hypot( s.x - cam.x, s.z - cam.z ) : 0;
			if ( s.state !== 'gone' && s.dist < this.settings.queryRange ) near.push( s );

		}

		near.sort( ( a, b ) => a.dist - b.dist );
		this.pool.assign( near );

		const night = this.night ? 1 : 0;
		if ( this.models ) this.models.setNight( night );
		for ( let i = this.ships.length - 1; i >= 0; i -- ) {

			const s = this.ships[ i ];
			if ( s.state === 'gone' ) {

				this._removeShip( i );
				continue;

			}

			if ( s.dist > this.settings.drawRange ) {

				s._far = true;
				if ( s.visual ) s.visual.setVisible( false );
				continue;

			}

			const have = this.pool.ready && s.poolGroup >= 0 && this.pool.read( s );
			if ( ! have ) this.pool.procedural( s, this.time, amp );
			if ( s._far ) {

				s.pose.y = s.pose.ty;
				s.pose.pitch = s.pose.tpitch;
				s.pose.roll = s.pose.troll;
				s._far = false;

			}

			if ( this.pool.ready && s.poolGroup >= 0 ) this.pool.queue( s );
			s.updatePose( dt );
			s.near = s.dist < this.settings.shadowRange;

			if ( ! s.visual && this.models ) s.visual = this.models.create( s.kind );
			if ( s.visual ) {

				s.visual.apply( s, s.finalPose( this._fp ) );
				s.visual.setNear( s.near );
				s.visual.setVisible( true );

			}

			// a shot-up hull smokes
			if ( s.alive && s.condition === 'critical' ) {

				s._smokeT = ( s._smokeT ?? 0 ) - dt;
				if ( s._smokeT <= 0 ) {

					s._smokeT = 0.7;
					const p = s.toWorld( 0, s.cls.deck + 1.5, - s.cls.length * 0.15, this._m );
					if ( ! this._vfx() ) this.fx.smoke( p.x, p.y, p.z, 1 ); // (the vfx feature burns ships under 35 % itself)

				}

			}

		}

	}

	_removeShip( i ) {

		const s = this.ships[ i ];
		this.pool.release( s );
		if ( s.visual ) {

			s.visual.dispose();
			s.visual = null;

		}

		this.ships.splice( i, 1 );

	}

	// ------------------------------------------------------------------ targets

	// the legal player boats: ours (naval.target) and, unless we only mirror the host's ships, the other players'
	_gatherTargets( dt ) {

		const list = this._targets;
		list.length = 0;
		if ( this.target.ok ) list.push( this.target );
		const rp = this.app.remotePlayers, seen = new Set();
		if ( rp && rp.peers && typeof rp.peers.forEach === 'function' && this.netRole !== 'puppet' ) {

			rp.peers.forEach( ( p, id ) => {

				if ( ! p || ! p.boat || ! p.boatPos || ! p.hasPose ) return;
				seen.add( id );
				let t = this._remote.get( id );
				if ( ! t ) {

					t = { x: p.boatPos.x, y: p.boatPos.y, z: p.boatPos.z, vx: 0, vz: 0, ok: false, safe: false, remote: id };
					this._remote.set( id, t );

				}

				const jx = p.boatPos.x - t.x, jz = p.boatPos.z - t.z;
				if ( dt > 0 && Math.hypot( jx, jz ) < 40 * dt + 2 ) {

					// a smoothed velocity from the interpolated pose (the snapshots carry none); a jump (a respawn, a
					// teleport) resets it instead of aiming the guns a mile ahead
					const k = 1 - Math.exp( - dt * 3 );
					t.vx = clamp( t.vx + ( jx / dt - t.vx ) * k, - 30, 30 );
					t.vz = clamp( t.vz + ( jz / dt - t.vz ) * k, - 30, 30 );

				} else t.vx = t.vz = 0;

				t.x = p.boatPos.x;
				t.y = p.boatPos.y;
				t.z = p.boatPos.z;
				t.safe = !! inSafeZone( t.x, t.z );
				const st = p.boatState || null;
				t.ok = ! t.safe && !! ( st ? st.driven || Math.hypot( t.vx, t.vz ) > 0.8 : false );
				if ( t.ok ) list.push( t );

			} );

		}

		for ( const id of this._remote.keys() ) if ( ! seen.has( id ) ) this._remote.delete( id );

	}

	// the boat ship `s` goes for: the nearest legal one in reach (her current quarry while it is not much farther than the
	// nearest), else the local target (not ok: the brains then patrol / sail on)
	_targetFor( s ) {

		const list = this._targets;
		if ( ! list.length ) return ( s.tgt = this.target );
		const c = s.cls;
		const reach = Math.max( c.lose || 0, c.sight || 0, 300 );
		let best = null, bd = Infinity, cur = Infinity;
		for ( const t of list ) {

			const d = Math.hypot( t.x - s.x, t.z - s.z );
			if ( d > reach ) continue;
			if ( d < bd ) { bd = d; best = t; }
			if ( t === s.tgt ) cur = d;

		}

		if ( s.tgt && s.tgt.ok && cur < Infinity && cur < bd * 1.3 + 20 ) best = s.tgt;
		return ( s.tgt = best || this.target );

	}

	// ------------------------------------------------------------------ cannons

	// a pirate asks to fire one broadside ( called from the brain when the side is loaded )
	_shipFire( ship, side ) {

		const t = ship.tgt || this.target, c = ship.cls;
		if ( ! t.ok || ! c.guns || ship.reload[ side ] > 0 || ! ship.alive ) return false;
		const range = Math.hypot( t.x - ship.x, t.z - ship.z );
		if ( range > c.engage * 1.35 || range < 20 ) return false;
		// the target must lie within the traverse of this side's guns
		const rel = angleDiff( Math.atan2( t.x - ship.x, t.z - ship.z ), ship.yaw );
		const az = Math.abs( angleDiff( rel, sideSign( side ) * Math.PI / 2 ) );
		if ( az > c.traverse ) return false;
		ship.reload[ side ] = c.reload * this.rng.range( 0.9, 1.2 );
		let delay = this.rng.range( 0, 0.25 );
		for ( const st of ship.gunStations( side ) ) {

			this.shots.push( { t: delay, ship, st } );
			delay += this.rng.range( 0.12, 0.35 );

		}

		return true;

	}

	_updateShots( dt ) {

		for ( let i = this.shots.length - 1; i >= 0; i -- ) {

			const sh = this.shots[ i ];
			sh.t -= dt;
			if ( sh.t > 0 ) continue;
			this.shots.splice( i, 1 );
			this._fireShipGun( sh.ship, sh.st );

		}

	}

	_fireShipGun( s, st ) {

		const t = s.tgt || this.target;
		if ( ! s.alive || ! t.ok ) return;
		const m = s.toWorld( st.x, st.y, st.z, { x: 0, y: 0, z: 0 } );
		const aim = leadAim( m, s.velocity( {} ), { x: t.x, y: t.y + 0.9, z: t.z }, { x: t.vx, y: 0, z: t.vz }, MUZZLE_SPEED );
		if ( ! aim ) return;
		// the traverse limit of the carriage
		const sg = sideSign( st.side ), nx = Math.cos( s.yaw ) * sg, nz = - Math.sin( s.yaw ) * sg;
		const hz = Math.hypot( aim.dir.x, aim.dir.z ) || 1;
		const az = Math.acos( clamp( ( aim.dir.x * nx + aim.dir.z * nz ) / hz, - 1, 1 ) );
		if ( az > s.cls.traverse * 1.2 ) return;
		const range = Math.hypot( t.x - m.x, t.z - m.z );
		const sigma = s.cls.shot * ( 0.7 + range / 120 ) * ( 1 + Math.abs( s.yawRate ) * 3 );
		this._launch( m, aim.dir, sigma, { damage: s.cls.damage * ( s.dmgMul || 1 ), owner: s.id, faction: s.faction, vel: s.velocity( {} ), big: s.kind === 'brigantine', side: st.side } );

	}

	// spawn a ball from `m` along `dir` with gaussian spread (sigma, rad); returns the ball
	_launch( m, dir, sigma, { damage, owner, faction, vel, big = false, level = 1, side = null } ) {

		const r = this.rng;
		// two perpendiculars: horizontal and the other one up-ish
		let ux = - dir.z, uz = dir.x;
		const ul = Math.hypot( ux, uz ) || 1;
		ux /= ul; uz /= ul;
		const vx = dir.y * - dir.x, vy = dir.x * dir.x + dir.z * dir.z, vz = dir.y * - dir.z;
		const vl = Math.hypot( vx, vy, vz ) || 1;
		const g1 = r.gauss() * sigma, g2 = r.gauss() * sigma * 0.6;
		let dx = dir.x + ux * g1 + ( vx / vl ) * g2, dy = dir.y + ( vy / vl ) * g2, dz = dir.z + uz * g1 + ( vz / vl ) * g2;
		const l = Math.hypot( dx, dy, dz );
		dx /= l; dy /= l; dz /= l;
		const speed = MUZZLE_SPEED * ( 1 + r.gauss() * 0.012 );
		this.stats.shots += owner === 'player' ? 1 : 0;
		this._muzzle( m.x, m.y, m.z, dx, dy, dz, big );
		this.audio.cannon( m.x, m.y, m.z, owner === 'player' ? 0.9 : 0.8 );
		this._emit( 'cannonFired', { x: m.x, y: m.y, z: m.z, dir: { x: dx, y: dy, z: dz }, side, by: owner === 'player' ? 'player' : 'pirate', owner } );
		return this.balls.spawn( {
			x: m.x, y: m.y, z: m.z,
			vx: dx * speed + ( vel ? vel.x : 0 ), vy: dy * speed + ( vel ? vel.y : 0 ), vz: dz * speed + ( vel ? vel.z : 0 ),
			damage, owner, faction, level,
		} );

	}

	// the vfx feature when it is installed: it draws from cannonFired / cannonballImpact / shipSunk, so naval's own
	// Effects.js spawns are only the fallback without it (else every shot draws twice). With `name`: only if it has it.
	_vfx( name = null ) {

		const f = this.features, v = f && f.get ? f.get( 'vfx' ) : null;
		return v && ( ! name || typeof v[ name ] === 'function' ) ? v : null;

	}

	_emit( name, e ) {

		const f = this.features;
		if ( f && f.emit ) f.emit( name, e );

	}

	_muzzle( x, y, z, dx, dy, dz, big ) {

		if ( ! this._vfx() ) this.fx.muzzle( x, y, z, dx, dy, dz, big ); // (vfx: from the cannonFired event)

	}

	// A ball fired on another machine (NavalLink): drawn and flown here, never re-broadcast. info.damage > 0 (a ship's
	// gun) lets it hurt this boat; a player's ball (damage 0) only splashes and splinters.
	remoteShot( from, dir, speed, info = {} ) {

		if ( ! Array.isArray( from ) || ! Array.isArray( dir ) ) return null;
		const [ x, y, z ] = from.map( Number ), [ dx, dy, dz ] = dir.map( Number );
		if ( ! [ x, y, z, dx, dy, dz ].every( Number.isFinite ) ) return null;
		const v = Number.isFinite( speed ) && speed > 1 ? speed : MUZZLE_SPEED;
		const owner = info.owner || 'remote';
		this._muzzle( x, y, z, dx, dy, dz, !! info.big );
		this.audio.cannon( x, y, z, 0.8 );
		this._emit( 'cannonFired', { x, y, z, dir: { x: dx, y: dy, z: dz }, side: null, by: 'remote', owner } );
		return this.balls.spawn( {
			x, y, z, vx: dx * v, vy: dy * v, vz: dz * v,
			damage: Math.max( 0, Math.min( 60, + info.damage || 0 ) ), owner, faction: info.faction || 'pirate', level: 1,
		} );

	}

	// The player's broadside: 'port' (Z) or 'starboard' (X). Aims at the best ship inside the gun's arc (auto-aim),
	// else fires level with a little elevation. A swivel gun fires one ball at once; a ship's battery fires one ball
	// per gun along its side, the first now and the rest in a short ripple (bow to stern). Returns true when the
	// broadside is on its way (a ball left the first muzzle).
	fire( side ) {

		const sd = normaliseSide( side );
		if ( ! sd ) return false;
		const b = this.app.boatCtl;
		if ( ! this.active || ! b || ! b.position || ! b.quaternion ) return false;
		const gun = this.playerGun;
		if ( ! gun.owned ) {

			if ( this.time > this._hintT ) {

				this._hintT = this.time + 10;
				this._say( 'You have no swivel gun yet' );

			}

			return false;

		}

		if ( this.playerHull.sunk || this.reloadLeft[ sd ] > 0 ) return false;
		const plan = this._gunPlan( sd );
		const L = plan.L;

		// target selection: a pirate (else any ship within 150 m) inside the arc, nearest first, from the middle of the battery
		const m = this._muzzleWorld( plan.mounts[ Math.floor( ( plan.mounts.length - 1 ) / 2 ) ], b, this._m );
		const normal = rotateByQuat( b.quaternion, { x: plan.sg, y: 0, z: 0 } );
		let best = null, bs = Infinity;
		for ( const s of this.ships ) {

			if ( ! s.alive ) continue;
			const dx = s.x - m.x, dz = s.z - m.z, range = Math.hypot( dx, dz );
			if ( range < 15 || range > GUN_RANGE * this.mods.range || ( s.faction !== 'pirate' && range > 150 ) ) continue;
			const nl = Math.hypot( normal.x, normal.z ) || 1;
			const az = Math.acos( clamp( ( dx * normal.x + dz * normal.z ) / ( range * nl ), - 1, 1 ) );
			if ( az > L.traverse ) continue;
			const score = range + ( s.faction === 'pirate' ? 0 : 200 );
			if ( score < bs ) { bs = score; best = s; }

		}

		this.reloadLeft[ sd ] = this.reloadTime( gun.level );
		this._fireMount( sd, plan, 0, best );
		if ( plan.mounts.length > 1 ) {

			// the ripple: later guns go off a moment apart, bow first
			let t = 0;
			for ( let i = 1; i < plan.mounts.length; i ++ ) {

				t += this.rng.range( RIPPLE[ 0 ], RIPPLE[ 1 ] );
				this.playerShots.push( { t, side: sd, index: i, plan, target: best } );

			}

		}

		// (the recoil kick comes from CameraFeel's own cannonFired listener)
		return true;

	}

	// The guns of the player's boat on one side: { sg, L (gun level record), mounts [ { x, y, z } muzzle in the boat frame ],
	// big }. A ship uses the catalog's battery (Boats.js broadside, ordered bow to stern); every other boat one swivel gun
	// 12 % of the length forward of amidships, just outside the beam.
	_gunPlan( sd ) {

		const sg = sideSign( sd );
		const L = GUN_LEVELS[ clamp( Math.round( this.playerGun.level ) || 1, 1, 3 ) ];
		const spec = BOATS[ this.playerHull.boat ] || BOATS.lobster;
		if ( spec.broadside ) {

			const bat = spec.broadside;
			const zs = [ ...bat.z ].sort( ( a, c ) => c - a );
			return { sg, L, big: spec.shipClass === 'brigantine', mounts: zs.map( ( z ) => ( { x: sg * ( bat.x + MUZZLE_REACH ), y: spec.deckY + ( bat.y ?? 1.2 ), z } ) ) };

		}

		const d = this._dims();
		return { sg, L, big: false, mounts: [ { x: sg * ( d.beam / 2 + 0.05 ), y: d.deck + 0.55, z: d.length * 0.12 } ] };

	}

	_muzzleWorld( mount, b, out ) {

		const off = rotateByQuat( b.quaternion, mount );
		out.x = b.position.x + off.x;
		out.y = b.position.y + off.y;
		out.z = b.position.z + off.z;
		return out;

	}

	// one gun of a broadside: aim at `target` if it is still in the arc, else level for ~90 m; recoil along the beam
	_fireMount( sd, plan, index, target ) {

		const b = this.app.boatCtl;
		if ( ! b || ! b.position || ! b.quaternion ) return;
		const m = this._muzzleWorld( plan.mounts[ index ], b, { x: 0, y: 0, z: 0 } );
		const normal = rotateByQuat( b.quaternion, { x: plan.sg, y: 0, z: 0 } );
		const bvel = b.velocity ? { x: b.velocity.x, y: b.velocity.y, z: b.velocity.z } : { x: 0, y: 0, z: 0 };
		const nl = Math.hypot( normal.x, normal.z ) || 1;

		let dir = null;
		if ( target && target.alive ) {

			const aim = leadAim( m, bvel, { x: target.x, y: target.pose.y + target.cls.sheer * 0.4, z: target.z }, target.velocity( {} ), MUZZLE_SPEED );
			if ( aim ) {

				const hz = Math.hypot( aim.dir.x, aim.dir.z ) || 1;
				const az = Math.acos( clamp( ( aim.dir.x * normal.x + aim.dir.z * normal.z ) / ( hz * nl ), - 1, 1 ) );
				if ( az <= plan.L.traverse * 1.5 ) dir = aim.dir;

			}

		}

		if ( ! dir ) {

			const el = solveElevation( MUZZLE_SPEED, 90 * this.mods.range, - m.y ) ?? 0.03;
			dir = { x: normal.x / nl * Math.cos( el ), y: Math.sin( el ), z: normal.z / nl * Math.cos( el ) };

		}

		this._launch( m, dir, plan.L.spread, { damage: plan.L.damage * this.mods.dmg, owner: 'player', faction: 'player', vel: bvel, level: this.playerGun.level, big: plan.big, side: sd } );
		// recoil along the beam: a 2.5 kg ball at 120 m/s, shared by the boat's mass
		const mass = ( BOATS[ this.playerHull.boat ] || BOATS.lobster ).mass;
		const dv = clamp( 300 / mass, 0, 0.9 );
		if ( b.velocity && b.velocity.x !== undefined ) {

			b.velocity.x -= normal.x * dv;
			b.velocity.z -= normal.z * dv;

		}

	}

	_updatePlayerShots( dt ) {

		for ( let i = this.playerShots.length - 1; i >= 0; i -- ) {

			const sh = this.playerShots[ i ];
			sh.t -= dt;
			if ( sh.t > 0 ) continue;
			this.playerShots.splice( i, 1 );
			if ( ! this.playerHull.sunk ) this._fireMount( sh.side, sh.plan, sh.index, sh.target );

		}

	}

	_readKeys() {

		const inp = this.app.input, p = this.app.player;
		if ( ! inp || ! inp.hit || ! p || p.mode !== 'boat' ) return;
		if ( this.keys.port && inp.hit( 'KeyZ' ) ) this.fire( 'port' );
		if ( this.keys.starboard && inp.hit( 'KeyX' ) ) this.fire( 'starboard' );

	}

	// ------------------------------------------------------------------ hits

	_updateBalls( dt ) {

		if ( ! this.balls.count ) return;
		if ( ! this._ctx ) {

			this._ctx = {
				ships: this.ships,
				playerBox: () => this._playerBox(),
				waterHeight: () => 0,
				terrain: this.terrain,
				raycastProps: null,
				onShipHit: ( ball, ship, part, pt ) => {

					this._impact( ball, pt, 'ship', ship.id );
					this._shipHit( ball, ship, part, pt );

				},
				onPlayerHit: ( ball, pt ) => {

					this._impact( ball, pt, 'ship', 'player' );
					this._playerHit( ball, pt );

				},
				onWater: ( ball, pt ) => {

					this._impact( ball, pt, 'water', null );
					this._waterHit( ball, pt );

				},
				onLand: ( ball, pt ) => {

					this._impact( ball, pt, 'land', null );
					if ( ! this._vfx() ) this.fx.smoke( pt.x, pt.y + 0.3, pt.z, 0.9 );

				},
				onProp: ( ball, pt, hit ) => {

					this._impact( ball, pt, 'prop', hit.id ?? null );
					if ( ! this._vfx() ) this.fx.hit( pt.x, pt.y, pt.z );
					this.audio.impact( pt.x, pt.y, pt.z, 0.8 );

				},
			};

		}

		this._ctx.ships = this.ships;
		this._ctx.terrain = this.terrain;
		// destructible props (the destruction feature) stop balls too
		const de = this.features && this.features.get ? this.features.get( 'destruction' ) : null;
		this._ctx.raycastProps = de && typeof de.raycastSegment === 'function'
			? ( a, b ) => {

				try {

					return de.raycastSegment( a.x, a.y, a.z, b.x, b.y, b.z );

				} catch ( e ) {

					return null;

				}

			}
			: null;
		this.balls.update( dt, this._ctx );

	}

	// every ball's end: the cannonballImpact event (destruction and vfx listen)
	_impact( ball, pt, hit, target ) {

		const v2 = ball.vx * ball.vx + ball.vy * ball.vy + ball.vz * ball.vz;
		this._emit( 'cannonballImpact', {
			x: pt.x, y: pt.y, z: pt.z, vx: ball.vx, vy: ball.vy, vz: ball.vz, energy: Math.round( 0.5 * BALL_MASS * v2 ),
			hit, target, owner: ball.owner,
		} );
	}

	_falloff( ball ) {

		const reach = 400 * ( ball.owner === 'player' ? this.mods.range : 1 ); // long guns keep their punch farther
		return 1 - 0.4 * clamp( ball.travelled / reach, 0, 1 );

	}

	_shipHit( ball, ship, part, pt ) {

		const byPlayer = ball.owner === 'player';
		const dmg = ball.damage * this._falloff( ball );
		const sunk = ship.damage( dmg, { part, by: byPlayer ? 'player' : ball.owner } );
		if ( ! this._vfx() ) this.fx.hit( pt.x, pt.y, pt.z );
		this.audio.impact( pt.x, pt.y, pt.z, 0.9 );
		if ( byPlayer ) {

			this.stats.hits ++;
			if ( this.hud ) this.hud.hitMarker( sunk ? 'sunk' : 'hit' );

		}

		if ( sunk ) this._onSunk( ship, byPlayer );

	}

	_onSunk( ship, byPlayer ) {

		const f = this.features, cls = ship.cls;
		this.stats.shipsSunk ++;
		if ( ship.faction === 'pirate' && byPlayer ) this.stats.piratesSunk ++;
		let total = 0;
		for ( let i = 0; i < cls.loot.crates; i ++ ) {

			const v = lootValue( cls, this.rng );
			total += v;
			this.loot.drop( ship.x + this.rng.range( - 5, 5 ), ship.z + this.rng.range( - 5, 5 ), v, ship.id );

		}

		// she lists, settles and goes down over SINK_TIME (Ship.finalPose); the vfx feature adds bubbles and foam from shipSunk
		if ( ! this._vfx() ) this.fx.splash( ship.x, 0, ship.z, 3.2 );
		this.audio.impact( ship.x, 2, ship.z, 1 );
		if ( f && f.emit ) {

			const bt = ship.bounty;
			const ev = { id: ship.id, name: bt ? bt.target : ship.name, faction: ship.faction, x: ship.x, z: ship.z, byPlayer, kind: ship.kind, loot: total };
			if ( bt ) Object.assign( ev, { target: bt.target, captain: bt.captain, bountyId: bt.id, shipName: ship.name } );
			f.emit( 'shipSunk', ev );
			if ( ship.faction === 'pirate' && byPlayer ) f.emit( 'enemyDefeated', { id: ship.id, name: ship.captain || ship.name, kind: 'pirate' } );

		}

		if ( ship.bounty ) this.bounties.delete( ship.bounty.id );
		else if ( ship.faction === 'merchant' ) this._merchantRespawn.push( 240 );
		else this._pirateAt = Math.max( this._pirateAt, this.time + 75 );
		if ( byPlayer ) this._say( ship.faction === 'pirate' ? `The ${ ship.name } is going down!` : `You sank the ${ ship.name }` );

	}

	_playerHit( ball, pt ) {

		const owner = this.ships.find( ( s ) => s.id === ball.owner );
		if ( ! this._vfx() ) this.fx.hit( pt.x, pt.y, pt.z );
		this.audio.impact( pt.x, pt.y, pt.z, 1 );
		this.damagePlayer( ball.damage * this._falloff( ball ), owner ? `cannon:${ owner.name }` : 'cannon', owner ? { x: owner.x, z: owner.z } : { x: ball.x0, z: ball.z0 } );

	}

	_waterHit( ball, pt ) {

		if ( ! this._vfx() ) this.fx.splash( pt.x, pt.y, pt.z, 1 );
		// a miss that lands close shakes the camera a little
		const b = this.app.boatCtl;
		if ( ball.owner !== 'player' && b && b.position && Math.hypot( b.position.x - pt.x, b.position.z - pt.z ) < 14 ) {

			const cf = this.app.cameraFeel;
			if ( cf && cf.kick ) cf.kick( 'snap' );

		}

	}

	// hull damage to the player's boat; from = { x, z } of the attacker for the HUD wedge
	damagePlayer( amount, cause = 'cannon', from = null ) {

		const h = this.playerHull;
		if ( h.sunk || ! ( amount > 0 ) ) return;
		amount *= this.mods.taken; // armour plating
		h.hp = Math.max( 0, h.hp - amount );
		const f = this.features;
		if ( f && f.emit ) f.emit( 'playerBoatDamaged', { hp: Math.round( h.hp * 10 ) / 10, maxHp: h.max, cause } );
		const cf = this.app.cameraFeel;
		if ( cf && cf.kick ) cf.kick( 'snap' );
		if ( from && this.hud ) this.hud.damageFrom( this._screenAngle( from.x, from.z ) );
		if ( h.hp <= 0 ) {

			h.sunk = true;
			const b = this.app.boatCtl;
			const v = this._vfx( 'splash' ); // (no event covers our own hull going down)
			if ( b && b.position ) {

				if ( v ) v.splash( b.position.x, 0, b.position.z, 2.5 );
				else this.fx.splash( b.position.x, 0, b.position.z, 2.5 );

			}
			const info = this._beginSinking( cause );
			if ( f && f.emit ) f.emit( 'playerBoatSunk', { cause, ...info } );
			this._say( 'Your boat is sinking!', 3600 );

		}

	}

	// angle of a world point on the screen, clockwise from straight up the view (for the damage wedge)
	_screenAngle( x, z ) {

		const cam = this.app.camera;
		if ( ! cam || ! cam.position || ! cam.quaternion ) return 0;
		const f = rotateByQuat( cam.quaternion, { x: 0, y: 0, z: - 1 } );
		const yaw = Math.atan2( f.x, f.z );
		return yaw - Math.atan2( x - cam.position.x, z - cam.position.z );

	}

	repairCost() {

		const h = this.playerHull;
		return Math.ceil( ( h.max - h.hp ) * REPAIR_PER_HP );

	}

	// restore the hull; with { free: true } nothing is charged. false when it can't be afforded, and while she is going
	// down or lies on the bottom (salvage() raises a wreck)
	repair( { free = false } = {} ) {

		if ( this.sinking || this.wreck ) return false;
		const h = this.playerHull;
		const cost = this.repairCost();
		const st = this.features ? this.features.state : null;
		if ( ! free && cost > 0 && st && st.spend && ! st.spend( cost ) ) return false;
		h.hp = h.max;
		h.sunk = false;
		return true;

	}

	// towed home after sinking: afloat again with a patched hull (a quarter of its points); repair() does the rest
	rescue() {

		if ( this.sinking || this.wreck ) return false; // (a wreck is raised by salvage())
		const h = this.playerHull;
		h.hp = Math.max( h.hp, Math.ceil( h.max * 0.25 ) );
		h.sunk = false;
		return true;

	}

	// ------------------------------------------------------------------ losing the boat: sinking, wreck, salvage

	// the wreck of the boat the player owns now (an abandoned one, after a trade, does not count)
	get wreck() {

		const w = this.wrecks && this.wrecks.own;
		return w && ! w.abandoned && w.boat === this._boatId() ? w : null;

	}

	salvageCost() {

		const w = this.wreck;
		if ( ! w ) return 0;
		return this.features && this.features.sandbox ? 0 : salvageCostFor( w.boat );

	}

	// Captain Roid raises her: afloat at her berth with a sound hull and her hold back. false when there is nothing to
	// raise or it can't be afforded (features.state.spend; the sandbox and { free } pay nothing).
	salvage( { free = false } = {} ) {

		const w = this.wreck;
		if ( ! w ) return false;
		const cost = free ? 0 : this.salvageCost();
		const st = this.features ? this.features.state : null;
		if ( cost > 0 && st && st.spend && ! st.spend( cost ) ) return false;
		this.wrecks.salvaged();
		const h = this.playerHull;
		h.hp = h.max;
		h.sunk = false;
		const app = this.app, b = app.boatCtl;
		if ( typeof app.setBoat === 'function' ) app.setBoat( w.boat ); // (same id: visible, controller on, boardable again)
		else {

			if ( b ) b.enabled = true;
			if ( app.boat && app.boat.group ) app.boat.group.visible = true;
			if ( app.player && app.player.setBoat ) app.player.setBoat( b || null );

		}

		if ( b && b.reset ) b.reset(); // at her berth
		if ( b && b.apply && b.model ) try { b.apply(); } catch ( e ) { /* the next frame places her */ }
		this._emit( 'wreckSalvaged', { boat: w.boat, cost, x: w.x, z: w.z } );
		this._say( `The ${ w.name } is raised and moored at her berth`, 3600 );
		return true;

	}

	// the hull just went to 0: freeze the controller (her model is animated from here), the hold goes down with her, the
	// player goes over the side. Returns the playerBoatSunk extras.
	_beginSinking( cause ) {

		const app = this.app, b = app.boatCtl, p = app.player, h = this.playerHull;
		const pos = b && b.position ? b.position : { x: 0, y: 0, z: 0 };
		const aboard = !! ( p && ABOARD.includes( p.mode ) );
		const bo = this.features && this.features.get ? this.features.get( 'boarding' ) : null;
		const phase = bo && bo.hostile ? bo.hostile.phase : null;
		const boarded = aboard && !! phase && phase !== 'idle';
		// the crates are in her hold; the fish too if you were aboard (the sandbox keeps everything)
		const loot = this.features && ! this.features.sandbox ? strip( this.features, { fish: aboard, cargo: true } ) : empty();
		const q = b && b.quaternion ? [ b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w ] : [ 0, 0, 0, 1 ];
		const yaw = b && typeof b.getYaw === 'function' ? b.getYaw() : 2 * Math.atan2( q[ 1 ], q[ 3 ] );
		const list = b && b.angular && b.angular.z < 0 ? - 1 : ( Math.round( pos.x + pos.z ) & 1 ) ? 1 : - 1;
		const d = this._dims();
		this.sinking = { t: 0, boat: h.boat, cause, x: pos.x, y: pos.y, z: pos.z, q, yaw, list, depth: d.draft + d.free + 2.5, loot };
		if ( aboard ) this._overboard( p, list );
		if ( b ) {

			b.driven = false;
			b.throttle = 0;
			if ( b.velocity && b.velocity.set ) b.velocity.set( 0, 0, 0 );
			if ( b.angular && b.angular.set ) b.angular.set( 0, 0, 0 );
			b.enabled = false; // (App skips the controller: her pose is ours until she is gone)

		}

		// nobody climbs back aboard a sinking boat
		if ( p && p.setBoat && p.boat && p.boat === b ) p.setBoat( null );
		const v = this._vfx( 'sinking' );
		if ( v ) v.sinking( 'player-boat', pos.x, pos.z, Math.max( 1, d.length / 8 ) );
		return { boat: h.boat, x: pos.x, z: pos.z, aboard, boarded };

	}

	// over the high side into the water (or onto the pier when she went down alongside it)
	_overboard( p, list ) {

		try {

			if ( p.mode === 'boat' && p.leaveHelm ) p.leaveHelm();
			if ( ( p.mode === 'deck' || p.mode === 'seat' ) && p.exitBoat ) p.exitBoat( null, list > 0 ? - 1 : 1 );
			if ( ABOARD.includes( p.mode ) ) p.mode = 'swim';
			const cf = this.app.cameraFeel;
			if ( cf && cf.kick ) cf.kick( 'snap' );

		} catch ( e ) { console.warn( 'naval: overboard failed', e ); }

	}

	_updateSinking( dt ) {

		const s = this.sinking, app = this.app;
		s.t += dt;
		const k = sinkPose( s.t / SINK_TIME, s.list, s.depth, this._sk || ( this._sk = {} ) );
		const g = app.boat && app.boat.group, b = app.boatCtl;
		// (only her own model: a boat bought meanwhile is left alone)
		if ( s.boat === this._boatId() ) {

			const y = s.y + k.dy;
			if ( b && b.position && b.position.set ) b.position.set( s.x, y, s.z );
			if ( g && g.position && g.quaternion && g.quaternion.set ) {

				// her heading and wave pose when the hull gave out, then the pitch and the list (boat frame)
				const ax = - k.pitch / 2, az = k.roll / 2;
				const r = qmul( qmul( s.q, [ Math.sin( ax ), 0, 0, Math.cos( ax ) ] ), [ 0, 0, Math.sin( az ), Math.cos( az ) ] );
				g.position.set( s.x, y, s.z );
				g.quaternion.set( r[ 0 ], r[ 1 ], r[ 2 ], r[ 3 ] );
				if ( g.updateMatrixWorld ) g.updateMatrixWorld( true );

			}

		}

		if ( s.t < SINK_TIME ) return;
		this.sinking = null;
		const w = this.wrecks.create( { boat: s.boat, x: s.x, z: s.z, yaw: s.yaw, list: s.list, loot: s.loot, abandoned: s.boat !== this._boatId() } );
		this._holdWreck();
		if ( w && ! w.abandoned ) this._say( `The ${ w.name } is on the bottom. Captain Roid's yard can raise her (Salvage)`, 5200 );

	}

	// while the owned boat is a wreck: her model and controller stay hidden and parked, nobody can board her
	_holdWreck() {

		const w = this.wreck;
		if ( ! w ) return;
		const app = this.app, b = app.boatCtl, g = app.boat && app.boat.group, p = app.player;
		const h = this.playerHull;
		h.sunk = true;
		h.hp = 0;
		if ( b ) {

			b.enabled = false;
			b.driven = false;
			if ( b.position && b.position.set ) b.position.set( w.x, PARK_Y, w.z );

		}

		if ( g ) {

			g.visible = false;
			if ( g.position && g.position.set && g.position.y !== PARK_Y ) {

				g.position.set( w.x, PARK_Y, w.z );
				if ( g.updateMatrixWorld ) g.updateMatrixWorld( true );

			}

		}

		if ( p && p.setBoat && p.boat && p.boat === b ) p.setBoat( null );

	}

	// ------------------------------------------------------------------ loot

	_updateLoot() {

		const b = this.app.boatCtl, p = this.app.player;
		const reach = Math.max( 3.2, this._dims().length * 0.5 );
		const st = this.features ? this.features.state : null;
		this.loot.update( this._dt, this.time, ( c ) => {

			let near = false;
			if ( b && b.position && ! this.playerHull.sunk ) near = this.loot.near( c, b.position.x, b.position.z, reach );
			if ( ! near && p && p.mode === 'swim' && p.position ) near = this.loot.near( c, p.position.x, p.position.z, 2.2 );
			if ( ! near ) return false;
			if ( st && st.earn ) st.earn( c.value );
			this.stats.looted += c.value;
			if ( this.features && this.features.emit ) this.features.emit( 'lootCollected', { value: c.value, x: c.x, z: c.z, source: c.source } );
			if ( this.app.audio && this.app.audio.coin ) this.app.audio.coin();
			this._say( `+$${ c.value } salvage` );
			return true;

		} );

	}

	// ------------------------------------------------------------------ ship modules (Captain Roid's yard)

	moduleRows( state = this.features ? this.features.state : null ) {

		this._syncBoat();
		return this.fitting.rows( state );

	}

	moduleSlots() {

		this._syncBoat();
		const boat = this.fitting.boat;
		return this.fitting.slots().map( ( s ) => ( {
			...s, label: SLOT_LABELS[ s.kind ] || s.kind,
			moduleLabel: s.module ? moduleLabel( s.module, boat, this.fitting.tierOf( s.module ) ) : null,
		} ) );

	}

	// buy the next tier of module `id` (features.state pays; free in sandbox); a new module is fitted into a free slot
	buyModule( id ) {

		this._syncBoat();
		const st = this.features ? this.features.state : null;
		const r = this.fitting.buy( id, st );
		if ( r.ok ) {

			this._syncMods();
			this._emit( 'moduleBought', { id, tier: r.tier, price: r.price } );
			this._say( `${ moduleLabel( id, this.fitting.boat, r.tier ) } ${ r.fitted ? 'fitted' : 'bought: fit it when a slot is free' }` );

		}

		return r;

	}

	fitModule( id, slot = null ) {

		this._syncBoat();
		const ok = this.fitting.fit( id, slot );
		if ( ok ) {

			this._syncMods();
			this._emit( 'moduleFitted', { id, slot: this.fitting.fitted( id ) } );

		}

		return ok;

	}

	removeModule( id ) {

		this._syncBoat();
		const ok = this.fitting.remove( id );
		if ( ok ) {

			this._syncMods();
			this._emit( 'moduleRemoved', { id } );

		}

		return ok;

	}

	// cargo crate multiplier of the extra hold (the trade feature's capacity x this)
	holdBonus() {

		return this.mods.cargo || 1;

	}

	// fish hold (kg) multiplier of the fish well
	fishHoldBonus() {

		return this.mods.holdKg || 1;

	}

	get nightBiteBonus() {

		return this.mods.nightBite || 1;

	}

	// the lantern rig: bites come faster at night while fishing aboard or beside the boat
	biteBonus() {

		const k = this.nightBiteBonus;
		if ( ! ( k > 1 ) || ! this.night || this.playerHull.sunk ) return 1;
		const p = this.app.player, b = this.app.boatCtl;
		if ( ! p ) return 1;
		if ( p.mode === 'boat' || p.mode === 'deck' || p.mode === 'seat' ) return k;
		if ( b && b.position && p.position && Math.hypot( p.position.x - b.position.x, p.position.z - b.position.z ) < LANTERN_REACH ) return k;
		return 1;

	}

	// how far pirates show on the HUD (Hud.js arrows): farther with the spyglass
	sightRange() {

		return this.mods.sight || ARROW_RANGE;

	}

	// ------------------------------------------------------------------ frame

	update( dt ) {

		if ( ! ( dt > 0 ) ) return;
		dt = Math.min( dt, 0.1 );
		this._dt = dt;
		this._frame ++;
		this.time += dt;
		const act = this.active;
		if ( this._wasActive && ! act ) this._clearWorld();
		this._wasActive = act;

		if ( act ) {

			this._syncBoat();
			this._syncMods();
			this._refreshTarget();
			this._gatherTargets( dt );
			this._readKeys();
			this.reloadLeft.port = Math.max( 0, this.reloadLeft.port - dt );
			this.reloadLeft.starboard = Math.max( 0, this.reloadLeft.starboard - dt );
			if ( this.settings.autoSpawn ) this._manage( dt );
			this._sail( dt );
			this._updateShots( dt );
			this._updatePlayerShots( dt );
			this._updateBalls( dt );
			this._updateLoot();

		}

		// her own hull: sinking, then a wreck (runs for every role: the hits on our boat land on our machine)
		if ( this.sinking ) this._updateSinking( dt );
		else this._holdWreck();
		this.wrecks.update( dt );

		this.fx.update( dt );
		if ( this.modMeshes ) {

			try {

				this.modMeshes.sync( this.fitting, this.app.boat, this.night );

			} catch ( e ) { /* the meshes are decoration */ }

		}

		if ( this.hud ) this.hud.update( hudModel( this ), dt );

	}

	_clearWorld() {

		for ( let i = this.ships.length - 1; i >= 0; i -- ) this._removeShip( i );
		this.shots.length = 0;
		this.balls.clear();
		this.loot.clear();

	}

	// ------------------------------------------------------------------ save / lifecycle

	toJSON() {

		const h = this.playerHull;
		return {
			v: 1,
			boat: h.boat, hp: Math.round( h.hp * 10 ) / 10, sunk: h.sunk,
			gun: { owned: !! this.playerGun.bought, level: this.playerGun.level, swivel: this.playerGun.swivel }, // bought: a ship's own battery is not saved; swivel: the bought gun's own tier
			modules: this.fitting.toJSON(),
			stats: { ...this.stats },
			wreck: this.wrecks.toJSON() || this._sinkingRecord(), // (saved mid-sinking: she is on the bottom when loaded)
		};

	}

	// a save taken while she goes down records her as the wreck she is about to be
	_sinkingRecord() {

		const s = this.sinking;
		if ( ! s ) return null;
		return { boat: s.boat, x: Math.round( s.x * 100 ) / 100, z: Math.round( s.z * 100 ) / 100, yaw: Math.round( s.yaw * 100 ) / 100, loot: s.loot, abandoned: false };

	}

	fromJSON( d ) {

		if ( ! d || typeof d !== 'object' ) return;
		const h = this.playerHull;
		const id = typeof d.boat === 'string' && BOATS[ d.boat ] ? d.boat : h.boat;
		const g = d.gun && typeof d.gun === 'object' ? d.gun : {};
		this.playerGun.bought = !! g.owned; // (not the setter: the fit comes from the save)
		const lv = Number.isFinite( g.swivel ) ? g.swivel : g.level; // (older saves: level, raised to a ship's battery)
		this.playerGun.level = Number.isFinite( lv ) ? clamp( Math.round( lv ), 1, 3 ) : 1;
		this.fitting.fromJSON( d.modules );
		this.fitting.setBoat( id );
		// a save from before the modules: the bought swivel gun goes into an arms slot
		if ( ! d.modules && this.playerGun.bought ) this.fitting.fit( 'swivel' );
		h.boat = id;
		h.max = this._hullMax( id );
		h.hp = Number.isFinite( d.hp ) ? clamp( d.hp, 0, h.max ) : h.max;
		h.sunk = h.hp <= 0;
		this.sinking = null;
		this.wrecks.fromJSON( d.wreck );
		if ( this.wrecks.own && ! this.wrecks.own.abandoned && this.wrecks.own.boat === id ) {

			h.hp = 0;
			h.sunk = true;

		}
		this._gunBoat = null; // re-read the class's battery on the next update
		this._syncGun( id );
		if ( d.stats && typeof d.stats === 'object' ) {

			for ( const k of Object.keys( this.stats ) ) if ( Number.isFinite( d.stats[ k ] ) ) this.stats[ k ] = Math.max( 0, d.stats[ k ] );

		}

	}

	reset() {

		this._clearWorld();
		this.sinking = null;
		this.wrecks.reset();
		this.fitting.reset();
		this.playerGun.owned = false;
		this.playerGun.level = 1;
		this.reloadLeft.port = this.reloadLeft.starboard = 0;
		this.stats = { shipsSunk: 0, piratesSunk: 0, shots: 0, hits: 0, looted: 0 };
		this._merchantRespawn.length = 0;
		this.bounties.clear();
		this._initialMerchants = true;
		this._pirateAt = this.time + 6;
		this._spawnT = 0.5;
		this.playerHull.boat = null;
		this.playerHull.sunk = false;
		this.playerHull.hp = 0;
		this._syncBoat( true );

	}

	dispose() {

		for ( const off of this._offs ) off();
		this._offs.length = 0;
		this._clearWorld();
		this.balls.dispose();
		this.fx.dispose();
		this.loot.dispose();
		this.wrecks.dispose();
		this.audio.dispose();
		if ( this.models ) this.models.dispose();
		if ( this.modMeshes ) this.modMeshes.dispose();
		if ( this.hud ) this.hud.dispose();

	}

}
