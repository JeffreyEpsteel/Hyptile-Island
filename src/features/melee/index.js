import { Vector3 } from '../../engine/index.js';
import { Avatar } from '../../player/Avatar.js';
import { WORLD } from '../../world/WorldLayout.js';
import { mulberry32 } from '../../util/Noise.js';
import {
	PLAYER, RAIDER, CLOCK, SLOTS, RAIDER_NAMES, CAPTAIN_NAMES, TOKENS, TRAINING_POST,
	clamp, facingDot, yawToward, crossed, hoursForward, isNight,
} from './MeleeData.js';
import { Raider } from './Raider.js';
import { Dummy } from './Dummy.js';
import { pickLock, assistYaw, LOCK } from './LockOn.js';
import { inPeace } from './Peace.js';
import { PlayerCombat } from './PlayerCombat.js';
import { CombatAudio } from './CombatAudio.js';
import { MeleeHud } from './MeleeHud.js';
import { Telegraph } from './Telegraph.js';

// On-foot melee: the player's blows, guard, parry and evade against every Raider (den guards, boarding crews, slot camps),
// a soft lock-on, the shared attack tokens and the training post.
//
//   features.add( 'melee', melee );     // module: { install } -> the instance below
//   const m = features.get( 'melee' );  // { update, dispose, toJSON, fromJSON, reset, raiders, playerHp, wantsMouse(), playerAction }
//
// Wave 4: the home island and its bay are peaceful (Peace.js: m.peaceful is true there, so no raider picks a fight; the old
// east-beach camp is abandoned, props only). Raiders live at the pirate dens (pirates/Dens.js puts its guards on m.raiders)
// and on boarded decks (boarding). The slot camp below still runs when options.slots gives it slots (tests, sandbox arenas).
//   m.lock          the soft lock-on target (nearest enemy in the facing cone, sticky); the camera eases onto it so A / D
//                   strafe round him (settings.lockAssist === false turns the pull off); a subtle reticle marks him
//   m.tokens        at most TOKENS.max (2) raiders swing at once; the rest circle and flank (Raider 'circle')
//   m.dummy         the training post on the harbour beach (Dummy.js): hit it, E to spar (it swings back, never hurts)
//   Controller: RT attack, LT guard / parry (Gamepad.js maps them to the mouse buttons), RB evade while in a fight.
//   Defeat: with the death feature installed, playerDied { cause: 'melee', x, y, z, by } and the death feature respawns the
//   player; without it the old pier wake-up. playerRespawned (death) ends the knockdown at once.
//
// The slot raiders (options.slots, e.g. MeleeData SLOTS): two camp by day, two more at night
// (19:00 - 05:30), and now and then a named captain moves in (35 % each dawn). A beaten raider is back one in-game
// day later. They notice the player inside 12 m, close in, wind up for 0.6 s (red ring on the ground, "!" over the
// head), strike, and stand open for 0.8 s. At 0 hp a raider is knocked down, then gets up and flees or stays down
// and is dragged off. They never leave a 30 m leash of their camp.
//
// The player (PlayerCombat.js):
//   Left mouse   attack (rod stowed, a raider within 6 m). wantsMouse() tells the game the click is melee's.
//   Right mouse  hold to guard (rod stowed): frontal blows are blocked, each chips 0.15 stamina; raised just before the
//                blow (the ring turns gold) it parries: nothing lost, the raider reels open for a punish.
//                Wave 5: only with an enemy or the training post in reach (GUARD.reach, or a raider closing in): outside a
//                fight RMB does nothing. Toggle mode (input.guardToggle / settings.guardMode 'toggle', the Access option):
//                a press raises it, the next lowers it. It drops on its own when the window loses focus or the pointer
//                lock goes (input.releases), a panel opens, the rod comes out, the fight ends, the player goes down, or
//                no enemy has been in reach for GUARD.idle s; a button still held through such a drop needs a fresh press.
//   Q            evade: 2 m dash, 0.25 s of i-frames, 0.2 stamina (claimed through features.claimKey)
//   Stamina is app.player.stamina (0..1, Player.js): swing 0.08, evade 0.2, block 0.15, guard 0.1 / s.
//   Health 100 here (melee.playerHp). At 0: knocked down for 3 s, 10 % of the cash carried is lost
//   (features.state.spend), the player wakes at the nearest pier.
//
// What the game must wire (everything else is self-contained):
//   1. features.update( dt ) each frame after player.update (this module moves the camera feel, the HUD and the telegraph).
//   2. Game.avatarAction(): `const ma = features.get( 'melee' ).playerAction; if ( ma ) return ma;` FIRST (before the
//      launched / tumble check): 'swing' | 'hit' | 'knockdown' | 'getUp' | null.
//   3. Game's rod input: skip `rod.startWindup()` / `strike()` while `melee.wantsMouse()` is true (it is only ever true
//      with the rod stowed, or mid-fight).
//   4. Optional: melee.guarding (bool) for a guard pose, melee.stateInfo() for debugging.
//
// Events (features.emit): enemyDefeated { id, name, kind: 'raider', captain, x, z }, playerKnockedDown { by, byId, kind, cashLost }.
// Headless: install( app, features, { avatarFactory, audio, hud: false, fx: false, rand, seed } ) takes stubs.

const _o = new Vector3(), _d = new Vector3(), _h = new Vector3();
const CREATE_D2 = 150 * 150; // m^2: raiders are created (their GLB loads) once the player is this close to a camp
const UPDATE_D2 = 170 * 170;
const FAR_D2 = 80 * 80; // beyond this a raider out of combat holds its pose
const FIXED = 1 / 30;
// the guard's reach (wave 5): a target this close (m), or a raider closing in this close, lets RMB raise it; it drops
// after `idle` s with neither
export const GUARD = { reach: 8, aggroReach: 12, idle: 3 };
const PIERS = () => {

	const P = WORLD.pier, out = [ { x: P.x, z: P.zStart + 5, yaw: Math.PI } ];
	const dk = WORLD.pons && WORLD.pons.dock;
	if ( dk ) {

		const dx = dk.end.x - dk.start.x, dz = dk.end.z - dk.start.z, l = Math.hypot( dx, dz ) || 1;
		out.push( { x: dk.start.x + dx / l * 3, z: dk.start.z + dz / l * 3, yaw: yawToward( 0, 0, dx, dz ) } );

	}

	return out;

};

export class Melee {

	constructor( app, features, options = {} ) {

		this.app = app;
		this.features = features;
		this.options = options;
		this.enabled = options.enabled !== false;
		this.peacefulOpt = !! options.peaceful; // raiders ignore the player (sandbox option)
		this.zoneOn = options.peaceZone !== false; // the peaceful home waters (Peace.js)
		this.inPeace = false;
		this.lockOn = options.lockOn !== false;
		this.lock = null;
		this.lockPlayerOnDown = options.lockPlayer !== false;
		this.autoStow = options.autoStow !== false;
		this.terrain = options.terrain || app.terrainData || ( app.terrain && app.terrain.heightAt ? app.terrain : null );
		this.colliders = options.colliders !== undefined ? options.colliders : ( app.colliders || null );
		this.player = app.player;
		this.rand = options.rand || mulberry32( options.seed !== undefined ? options.seed : ( Date.now() & 0xffffff ) );
		this.avatarFactory = options.avatarFactory || ( ( o ) => new Avatar( o ) );
		this.audio = options.audio || new CombatAudio( app.audio );
		this._audioReady = false;
		this.time = 0;
		this.hours = 0; // in-game hours since the module started
		this.hour = null; // the island clock now (null: unknown)
		this._lastHour = null;
		this.tokens = new Set(); // raiders holding an attack token (TOKENS.max at most)
		this.tokenGap = 0;
		this.sched = [];
		this._target = { x: 0, y: 0, z: 0, valid: false };
		this._lmb = false;
		this._rmb = false;
		this._guardUp = false; // the guard as the buttons and the rules want it (combat.guardHeld)
		this._guardBlock = false; // hold mode: RMB was held through a forced drop, a fresh press is needed
		this._guardFar = 0; // s with no enemy in the guard's reach
		this._guardRel = undefined; // input.releases last seen
		this._wasEngaged = false;
		this._nearest = null;
		this.hintT = 0;
		this.hintText = '';
		this.hintShown = false;
		this.kills = 0;
		this.captain = { active: false };
		// no camp on the home island any more: slots only when asked for (MeleeData SLOTS is the old layout)
		this.slots = ( Array.isArray( options.slots ) ? options.slots : [] ).map( ( s ) => ( { ...s, raider: null, respawnLeft: 0 } ) );
		this.list = []; // every Raider created
		this.combat = new PlayerCombat( this );
		this._offs = [];
		this._rb = false;

		// the captain may already be camped when the game starts
		if ( options.captain !== undefined ) this.captain.active = !! options.captain;
		else this.captain.active = this.rand() < CLOCK.captainChance;

		// Q is ours (features.claimKey keeps two features from sharing it)
		this.keyOk = features && features.claimKey ? features.claimKey( 'KeyQ', 'melee' ) : true;

		const hudEl = app.ui && app.ui.ui ? ( app.ui.ui.hud || app.ui.ui.root ) : ( options.hudElement || null );
		this.hud = options.hud === false ? null : new MeleeHud( { hud: hudEl, camera: app.camera, doc: options.doc } );
		this.fx = options.fx === false ? null : this._makeFx();
		this._pBase = new WeakMap(); // the player avatar's materials -> base emissive
		this._pFlashing = false;

		// the training post (the melee tutorial in the peaceful harbour)
		this.dummy = options.dummy === false ? null : new Dummy( this, { scene: options.fx === false ? null : app.scene, terrain: this.terrain, mesh: options.fx !== false } );
		if ( this.dummy && features && features.interactable ) {

			const d = this.dummy;
			this._offs.push( features.interactable( {
				id: 'melee:training-post', position: () => ( { x: d.x, y: d.y, z: d.z } ), radius: 3,
				when: () => this.enabled && this.player && this.player.mode === 'walk',
				prompt: () => ( d.sparring ? 'Stop sparring' : 'Spar at the training post' ),
				onInteract: () => this.spar( ! d.sparring ),
			} ) );

		}

		// the death feature respawned the player: the knockdown is over
		if ( features && features.on ) this._offs.push( features.on( 'playerRespawned', () => this._respawned() ) );

	}

	// E at the training post: start / stop sparring (the rod goes away; tips the first time)
	spar( on = true ) {

		const d = this.dummy;
		if ( ! d ) return false;
		d.spar( on );
		if ( on ) {

			this.rodAway( false );
			if ( ! this._sparTip ) {

				this._sparTip = true;
				this.hintT = 7;
				this.hintText = 'Sparring · raise the guard (<kbd>RMB</kbd>) as the ring turns <b>gold</b> to parry · <kbd>Q</kbd> to dodge · <kbd>E</kbd> to stop';

			}

		}

		return d.sparring;

	}

	_respawned() {

		const c = this.combat;
		if ( c.state === 'down' ) {

			c.state = 'free';
			c.t = 0;
			c.fade = 0;
			c.respawned = true;
			c.hurtInv = 1.5;

		}

		c.hp = c.maxHp;
		this.lock = null;

	}

	get peaceful() {

		return this.peacefulOpt || this.inPeace;

	}

	set peaceful( v ) {

		this.peacefulOpt = !! v;

	}

	get token() {

		for ( const r of this.tokens ) return r;
		return null;

	}

	// raiders and the training post: everything the player's swing and the lock can find
	targets() {

		if ( ! this.dummy ) return this.list;
		const out = this.list.slice();
		out.push( this.dummy );
		return out;

	}

	_makeFx() {

		try {

			return new Telegraph( { scene: this.app.scene } );

		} catch ( e ) {

			console.warn( 'melee: telegraph unavailable', e );
			return null;

		}

	}

	// ---- public surface

	get raiders() {

		return this.list;

	}

	get playerHp() {

		return this.combat.hp;

	}

	get playerAction() {

		return this.enabled ? this.combat.action : null;

	}

	get guarding() {

		return this.combat.guarding;

	}

	get playerDown() {

		return this.combat.state === 'down';

	}

	// is the left mouse button melee's right now (so the fishing input should stay out of it)?
	wantsMouse() {

		if ( ! this.enabled ) return false;
		if ( this.combat.state !== 'free' ) return true; // mid-swing, hurt, evading, knocked down: the click is the fight's
		return this.canSwing();

	}

	// may a left click start a swing now: on foot, the rod away, a raider within engage range
	canSwing() {

		// a swing is always allowed with the rod away (the peaceful home island only stops NPCs attacking you): it lands on
		// a raider, the training post or a breakable prop when one is in reach, else it is a swing at the air
		return !! ( this.enabled && this._canAct() && this.rodStowed() );

	}

	setEnabled( on ) {

		this.enabled = !! on;
		if ( ! on ) for ( const r of this.list ) if ( r.active ) r.deactivate();

	}

	// the sandbox option (the home waters are peaceful whatever this says)
	setPeaceful( on ) {

		this.peacefulOpt = !! on;

	}

	stateInfo() {

		return {
			hp: this.combat.hp, state: this.combat.state, guarding: this.combat.guarding, stamina: this.combat.stamina,
			hour: this.hour, captain: this.captain.active, kills: this.kills, peaceful: this.peaceful, tokens: this.tokens.size,
			lock: this.lock ? this.lock.name : null, sparring: !! ( this.dummy && this.dummy.sparring ),
			raiders: this.list.filter( ( r ) => r.active ).map( ( r ) => ( { id: r.id, name: r.name, state: r.state, hp: r.hp, x: +r.x.toFixed( 1 ), z: +r.z.toFixed( 1 ) } ) ),
		};

	}

	// ---- player / world queries (also the PlayerCombat host surface)

	rodStowed() {

		const g = this.app.game, rod = g && g.rod;
		return ! rod || ! rod.equipped;

	}

	_panelOpen() {

		const hud = this.app.game && this.app.game.hud;
		return !! ( hud && ( hud.invOpen || hud.standOpen || hud.rosterOpen || hud.catchOpen ) );

	}

	_canAct() {

		const a = this.app, p = this.player, inp = a.input;
		if ( ! p || p.mode !== 'walk' ) return false;
		if ( a.paused || a.menuOpen || a.freeCam ) return false;
		if ( inp && inp.enabled === false ) return false;
		return ! this._panelOpen();

	}

	target() {

		return this._target;

	}

	_updateTarget() {

		const p = this.player, t = this._target;
		if ( ! p ) { t.valid = false; return; }
		t.x = p.position.x;
		t.y = p.position.y;
		t.z = p.position.z;
		t.yaw = p.yaw; // flankers work round behind him
		// raiders only go for a player on foot and standing
		t.valid = this.enabled && p.mode === 'walk' && this.combat.state !== 'down' && ! this.app.paused;

	}

	_raiderWithin( range ) {

		const p = this.player.position;
		let best = null, bd = range * range;
		for ( const r of this.targets() ) {

			if ( ! r.targetable ) continue;
			const d2 = ( r.x - p.x ) ** 2 + ( r.z - p.z ) ** 2;
			if ( d2 <= bd ) { bd = d2; best = r; }

		}

		return best;

	}

	engaged() {

		const p = this.player.position;
		for ( const r of this.list ) if ( r.inCombat && ( r.x - p.x ) ** 2 + ( r.z - p.z ) ** 2 < 25 * 25 ) return true;
		return false;

	}

	lineOfSight( ax, ay, az, bx, by, bz ) {

		const c = this.colliders;
		if ( ! c || ! c.raycast ) return true;
		_o.set( ax, ay, az );
		_d.set( bx - ax, by - ay, bz - az );
		const len = _d.length();
		if ( len < 1e-3 ) return true;
		_d.multiplyScalar( 1 / len );
		return c.raycast( _o, _d, len ) >= len - 0.25;

	}

	// ---- attack tokens: at most TOKENS.max raiders swing at once, wind-ups start TOKENS.gap s apart

	tokenFree( r ) {

		if ( this.tokens.has( r ) ) return true;
		// a raider that is no longer fighting gives his token back (a host forgot, he was put away)
		for ( const q of this.tokens ) if ( ! q.active || ! ( q.inCombat || q.state === 'windup' || q.state === 'strike' ) ) this.tokens.delete( q );
		return this.tokens.size < TOKENS.max && this.tokenGap <= 0;

	}

	takeToken( r ) {

		if ( this.tokens.has( r ) ) return;
		this.tokens.add( r );
		if ( this.tokens.size > 1 ) this.tokenGap = TOKENS.gap; // the next wind-up waits a beat
		else this.tokenGap = Math.max( this.tokenGap, 0 );

	}

	releaseToken( r ) {

		if ( this.tokens.delete( r ) ) this.tokenGap = Math.max( this.tokenGap, TOKENS.after );

	}

	far( r ) {

		if ( r.inCombat ) return false;
		const p = this.player.position;
		return ( r.x - p.x ) ** 2 + ( r.z - p.z ) ** 2 > FAR_D2;

	}

	// ---- effects

	sfx( bank, opts = {} ) {

		try { return this.audio && this.audio.play ? this.audio.play( bank, opts ) : false; } catch ( e ) { return false; }

	}

	pop( text, at, kind ) {

		if ( this.hud ) this.hud.pop( text, at, kind );

	}

	// a CameraFeel kick; `fallback` when this CameraFeel does not know `type` (kick returns false)
	kick( type, fallback = null ) {

		const f = this.app.cameraFeel;
		if ( ! f || ! f.kick ) return;
		if ( f.kick( type ) === false && fallback ) f.kick( fallback );

	}

	// a one-shot on the player's avatar through the animation graph (Avatar.playMontage); the old action API
	// (playerAction -> Game.avatarAction) keeps working without it
	montage( name, opts = {} ) {

		const av = this.app.avatar;
		try { return av && typeof av.playMontage === 'function' ? av.playMontage( name, opts ) || true : false; } catch ( e ) { return false; }

	}

	stopMontage( slot = null, blendOut = 0.2 ) {

		const av = this.app.avatar;
		try { if ( av && typeof av.stopMontage === 'function' ) av.stopMontage( slot, blendOut ); } catch ( e ) { /* the graph is optional */ }

	}

	hasDeath() {

		return !! ( this.features && this.features.get && this.features.get( 'death' ) );

	}

	toast( text, ms = 2600 ) {

		const g = this.app.game;
		if ( g && g.toast ) g.toast( text, ms );

	}

	emit( name, payload ) {

		if ( this.features && this.features.emit ) this.features.emit( name, payload );

	}

	// put the rod away (a fight, a knockdown); not while a fish is on
	rodAway( force = false ) {

		const g = this.app.game, rod = g && g.rod;
		if ( ! rod || ! rod.equipped ) return false;
		if ( g.fight && ! force ) return false;
		if ( g.cancelLine ) g.cancelLine( true );
		if ( rod.equip ) rod.equip( false );
		return true;

	}

	// move the player along the ground by ( dx, dz ): the evade dash. Stays out of deep water and solid geometry
	movePlayer( dx, dz ) {

		const p = this.player.position, t = this.terrain;
		let nx = p.x + dx, nz = p.z + dz;
		if ( t ) {

			const ok = ( x, z ) => t.heightAt( x, z ) > - 0.6;
			if ( ! ok( nx, nz ) ) {

				if ( ok( nx, p.z ) ) nz = p.z;
				else if ( ok( p.x, nz ) ) nx = p.x;
				else return false;

			}

		}

		const c = this.colliders;
		if ( c && c.resolveCapsule ) {

			_h.set( nx, p.y, nz );
			c.resolveCapsule( _h, 0.4, 1.7, 0.4 );
			nx = _h.x;
			nz = _h.z;

		}

		p.x = nx;
		p.z = nz;
		if ( t ) {

			const g = t.heightAt( nx, nz );
			if ( g > p.y ) p.y = g;

		}

		return true;

	}

	// keep the player's controls still while knocked down (Player.launched = no control, velocity held at 0)
	lockPlayer() {

		const p = this.player;
		if ( ! this.lockPlayerOnDown || ! p ) return;
		if ( typeof p.launched === 'number' ) p.launched = Math.max( p.launched, 0.08 );
		if ( p.velocity ) { p.velocity.x = 0; p.velocity.z = 0; }

	}

	respawnPoint() {

		const p = this.player.position;
		let best = null, bd = Infinity;
		for ( const c of PIERS() ) {

			const d = Math.hypot( c.x - p.x, c.z - p.z );
			if ( d < bd ) { bd = d; best = c; }

		}

		return best;

	}

	// the knocked-down player wakes at the nearest pier
	respawnPlayer() {

		// the death feature respawns the player (PlayerCombat already sent playerDied at the blow when it saw it; a direct
		// call lands here): no pier wake-up then
		if ( this.features?.get?.( 'death' ) ) {

			if ( ! this.combat.deathMode ) {

				const q = this.player.position;
				this.features.emit( 'playerDied', { cause: 'melee', by: this.combat.downBy?.name, x: q.x, y: q.y, z: q.z } );

			}

			return null;

		}

		const p = this.player, pt = this.respawnPoint();
		if ( ! p || ! pt ) return null;
		let y = this.terrain ? this.terrain.heightAt( pt.x, pt.z ) : 0;
		const c = this.colliders;
		if ( c && c.groundHeightAt ) {

			const g = c.groundHeightAt( pt.x, pt.z, y + 4 );
			if ( Number.isFinite( g ) ) y = Math.max( y, g );

		}

		p.position.set( pt.x, y, pt.z );
		if ( p.velocity ) p.velocity.set( 0, 0, 0 );
		p.yaw = pt.yaw;
		if ( typeof p.grounded === 'boolean' ) p.grounded = true;
		// the spring-arm camera starts from the new place instead of sweeping across the island
		if ( 'armInit' in p ) p.armInit = false;
		if ( 'camInit' in p ) p.camInit = false;
		if ( '_camY' in p ) p._camY = null;
		const lost = this.combat.lostCash;
		this.toast( lost > 0 ? `Knocked out · you wake at the pier · lost $${ lost }` : 'Knocked out · you wake at the pier', 3600 );
		return pt;

	}

	loseCash() {

		const f = this.features, st = f && f.state;
		if ( f?.get?.( 'death' ) ) return 0; // the sea chest (death feature) takes the purse
		if ( ! st || ( f.sandbox ) || ! Number.isFinite( st.money ) ) return 0;
		const loss = Math.floor( st.money * PLAYER.cashLoss );
		if ( loss > 0 && st.spend && st.spend( loss ) ) return loss;
		return 0;

	}

	tauntNearby( by ) {

		const p = this.player.position;
		for ( const r of this.list ) if ( r.active && r.visible && ( r.x - p.x ) ** 2 + ( r.z - p.z ) ** 2 < 14 * 14 ) r.taunt();

	}

	// ---- the raiders' hooks

	onAggro( r ) {

		if ( ! this.hintShown ) {

			this.hintShown = true;
			this.hintT = 8;
			this.hintText = '<kbd>LMB</kbd> attack &nbsp;·&nbsp; <kbd>RMB</kbd> guard, raise it as the ring turns gold to parry &nbsp;·&nbsp; <kbd>Q</kbd> evade';

		}

	}

	onWindup( r ) {

		// the tell: a short bright tick the moment the wind-up starts (the amber flash and the ring go with it)
		this.sfx( 'tell', { at: { x: r.x, y: r.y + 1.5, z: r.z }, gain: r.practice ? 0.5 : 0.8 } );
		// the whoosh starts early enough that its peak lands on the contact
		const bank = r.kind === 'captain' ? 'hookSwing' : 'paddleSwing';
		const lead = this.audio && this.audio.lead ? this.audio.lead( bank ) : 0.1;
		const sid = r.strikeCount;
		this.sched.push( {
			t: Math.max( 0, r.cfg.windup - lead ),
			fn: () => {

				if ( r.state === 'windup' && r.strikeCount === sid ) this.sfx( bank, { at: { x: r.x, y: r.y + 1.2, z: r.z }, rate: r.kind === 'captain' ? 0.95 : 0.88, gain: 0.85 } );

			},
		} );
		// a blow is coming at a player who has the rod out: it goes away (unless a fish is on)
		if ( this.autoStow && this.target().valid && ! r.practice ) {

			const p = this.player.position;
			if ( Math.hypot( p.x - r.x, p.z - r.z ) < 6 && ! this.rodStowed() && this.rodAway( false ) ) this.toast( 'Rod away · fight!', 1600 );

		}

	}

	// the raider's blow arrives (end of his wind-up): did it reach the player, and was it blocked / dodged?
	raiderStrike( r ) {

		const c = this.combat, p = this.player.position;
		if ( ! this._target.valid || c.state === 'down' ) return 'missed';
		const d = Math.hypot( p.x - r.x, p.z - r.z );
		if ( d > r.cfg.hitRange ) return 'missed';
		if ( facingDot( r.yaw, r.x, r.z, p.x, p.z ) < r.cfg.cone ) return 'missed';
		if ( ! this.lineOfSight( r.x, r.y + 1.1, r.z, p.x, p.y + 1.1, p.z ) ) return 'missed';
		return c.takeStrike( r );

	}

	onDefeated( r ) {

		const slot = this.slots.find( ( s ) => s.raider === r );
		if ( slot ) slot.respawnLeft = CLOCK.respawnHours;
		if ( r.kind === 'captain' ) this.captain.active = false;
		this.kills ++;
		this.combat.lastKill = r;
		let loot = 0;
		const f = this.features, st = f && f.state;
		if ( st && st.earn && ! f.sandbox ) {

			loot = r.cfg.loot;
			st.earn( loot );

		}

		this.toast( loot > 0 ? `${ r.name } is down · +$${ loot }` : `${ r.name } is down`, 2400 );
		this.emit( 'enemyDefeated', { id: r.spawnId, name: r.name, kind: 'raider', captain: r.kind === 'captain', x: r.x, z: r.z } );
		this.sfx( 'paddleHit', { at: { x: r.x, y: r.y + 0.5, z: r.z }, gain: 1, rate: 0.75 } );

	}

	// ---- slots: who camps, who is back

	_wantSlot( s ) {

		if ( s.when === 'day' ) return true;
		if ( s.when === 'night' ) return this.hour !== null ? isNight( this.hour ) : false;
		return this.captain.active;

	}

	_alive( r ) {

		return !! ( r && r.active && r.state !== 'gone' );

	}

	_character( s ) {

		const mine = this.app.avatar && this.app.avatar.character;
		const other = s.characters.filter( ( c ) => c !== mine ), from = other.length ? other : s.characters;
		return from[ Math.floor( this.rand() * from.length ) % from.length ];

	}

	_name( s ) {

		const pool = s.when === 'captain' ? CAPTAIN_NAMES : RAIDER_NAMES;
		const taken = new Set( this.list.filter( ( r ) => r.active ).map( ( r ) => r.name ) );
		const free = pool.filter( ( n ) => ! taken.has( n ) );
		const from = free.length ? free : pool;
		return from[ Math.floor( this.rand() * from.length ) % from.length ];

	}

	_spawnSlot( s ) {

		let r = s.raider;
		if ( ! r ) {

			const avatar = this.avatarFactory( { scene: this.app.scene, character: this._character( s ), lite: true } );
			r = new Raider( this, s, avatar );
			s.raider = r;
			this.list.push( r );

		}

		r.spawn( { name: this._name( s ) } );
		return r;

	}

	_syncSlots() {

		const p = this.player.position;
		for ( const s of this.slots ) {

			if ( s.respawnLeft > 0 ) continue;
			const r = s.raider, alive = this._alive( r );
			const d2 = ( s.x - p.x ) ** 2 + ( s.z - p.z ) ** 2;
			if ( this._wantSlot( s ) ) {

				// appear only out of sight of the player: never inside the clear radius, never before the camp is near enough to load
				if ( ! alive && d2 > CLOCK.spawnClear ** 2 && d2 < CREATE_D2 && this.enabled ) this._spawnSlot( s );

			} else if ( alive && ! r.busy && d2 > CLOCK.spawnClear ** 2 ) r.deactivate(); // night is over (the captain was beaten elsewhere)

		}

	}

	// ---- the island clock

	_tickClock( dt ) {

		const st = this.app.settings, h = st && typeof st.timeOfDay === 'number' && Number.isFinite( st.timeOfDay ) ? ( ( st.timeOfDay % 24 ) + 24 ) % 24 : null;
		let adv = 0;
		if ( h !== null ) {

			if ( this._lastHour !== null ) {

				adv = hoursForward( this._lastHour, h );
				if ( adv > 0.5 + dt * 0.1 ) adv = 0; // the player set the clock: a jump is not time passing
				const cs = this._captainSlot();
				if ( cs && adv > 0 && crossed( this._lastHour, h, CLOCK.captainRollHour ) && ! this.captain.active && cs.respawnLeft <= 0 && this.rand() < CLOCK.captainChance ) this.captain.active = true;

			}

			if ( adv === 0 && st.timeSpeed === 0 ) adv = dt * CLOCK.realFallback; // a stopped clock: respawns still tick at the 40-minute day's pace
			this._lastHour = h;
			this.hour = h;

		} else adv = dt * CLOCK.realFallback;

		this.hours += adv;
		if ( adv > 0 ) for ( const s of this.slots ) if ( s.respawnLeft > 0 ) s.respawnLeft = Math.max( 0, s.respawnLeft - adv );

	}

	_captainSlot() {

		return this.slots.find( ( s ) => s.when === 'captain' );

	}

	// ---- input: the mouse and Q

	_input( dt = 0 ) {

		const a = this.app, inp = a.input, c = this.combat;
		const can = !! inp && this._canAct();
		const gun = !! ( this.features && this.features.get && this.features.get( 'firearms' ) && this.features.get( 'firearms' ).drawn ); // (a drawn gun owns the mouse)
		const lmb = can && ! gun && !! inp.mouseDown, rmb = can && ! gun && !! inp.rightDown;
		const lDown = lmb && ! this._lmb, rDown = rmb && ! this._rmb;
		this._lmb = lmb;
		this._rmb = rmb;
		c.guardHeld = this._guardInput( dt, can, rmb, rDown );
		if ( ! can || ! this.enabled ) return;
		// the left button: a swing when the rod is away and a raider is close (or a swing is already going)
		if ( lDown && this.canSwing() ) c.attackPress();
		const padDodge = this._padDodge() && ( !! this.lock || this.engaged() );
		if ( ( this.keyOk && inp.hit && inp.hit( 'KeyQ' ) ) || padDodge ) {

			const p = this.player, fx = - Math.sin( p.yaw ), fz = - Math.cos( p.yaw ), rx = Math.cos( p.yaw ), rz = - Math.sin( p.yaw );
			let wx = 0, wz = 0;
			if ( inp.down( 'KeyW' ) ) { wx += fx; wz += fz; }
			if ( inp.down( 'KeyS' ) ) { wx -= fx; wz -= fz; }
			if ( inp.down( 'KeyD' ) ) { wx += rx; wz += rz; }
			if ( inp.down( 'KeyA' ) ) { wx -= rx; wz -= rz; }
			c.evadePress( wx, wz, p.yaw );

		}

	}

	// RMB -> the guard wanted this frame (hold or toggle, only near an enemy, the forced drops: see the header)
	_guardInput( dt, can, rmb, rDown ) {

		const inp = this.app.input, c = this.combat;
		const rel = inp && typeof inp.releases === 'number' ? inp.releases : 0;
		const lost = this._guardRel !== undefined && rel !== this._guardRel; // blur / the pointer lock went
		this._guardRel = rel;
		const engaged = this.engaged();
		const ended = this._wasEngaged && ! engaged; // the fight is over
		this._wasEngaged = engaged;
		const reach = can && this.enabled && this._guardReach();
		this._guardFar = reach ? 0 : this._guardFar + dt;
		const forced = lost || ended || ! can || ! this.enabled || ! this.rodStowed() || c.state === 'down' || ( this._guardUp && this._guardFar > GUARD.idle );
		if ( forced ) {

			if ( this._guardUp || lost || ended ) this._guardBlock = rmb;
			this._guardUp = false;

		}

		if ( this._guardToggle() ) {

			// a press raises it (only in reach), the next lowers it
			if ( rDown && ! forced ) this._guardUp = ! this._guardUp && reach;

		} else {

			if ( ! rmb ) this._guardBlock = false;
			// once up it stays while the button is held (the idle rule drops it); it only comes up in reach
			this._guardUp = ! forced && rmb && ! this._guardBlock && ( this._guardUp || reach );

		}

		return this._guardUp;

	}

	_guardToggle() {

		const inp = this.app.input, st = this.app.settings;
		return !! ( ( inp && inp.guardToggle ) || ( st && st.guardMode === 'toggle' ) );

	}

	// an enemy or the training post within GUARD.reach, or a raider closing in within GUARD.aggroReach
	_guardReach() {

		if ( ! this.player ) return false;
		return this._raiderWithin( GUARD.reach ) !== null || this._raiderAggro( GUARD.aggroReach );

	}

	// the right bumper (RB) is the evade on a pad while fighting (it is sprint otherwise: a dodge while sprinting is fine)
	_padDodge() {

		const gp = this.app.gamepad;
		let pad = null;
		try { pad = gp && gp._pad ? gp._pad() : null; } catch ( e ) { pad = null; }
		const b = pad && pad.buttons ? pad.buttons[ 5 ] : null;
		const down = !! ( b && ( b.pressed || b.value > 0.5 ) );
		const edge = down && ! this._rb;
		this._rb = down;
		return edge;

	}

	// the soft lock-on: only in a fight (or sparring), on foot with the rod away; the camera eases onto the target
	_updateLock( dt ) {

		const p = this.player;
		const d = this.dummy, sparring = !! ( d && d.sparring && Math.hypot( d.x - p.position.x, d.z - p.position.z ) < LOCK.keepRange );
		if ( ! this.lockOn || ! this.enabled || ! this._canAct() || ! this.rodStowed() || this.combat.state === 'down' || ! ( sparring || this.engaged() ) ) {

			this.lock = null;
			return;

		}

		this.lock = pickLock( { x: p.position.x, z: p.position.z, yaw: p.yaw }, this.targets(), this.lock );
		const st = this.app.settings;
		if ( this.lock && ! ( st && st.lockAssist === false ) && this.combat.state !== 'evade' ) p.yaw = assistYaw( p.yaw, p.position, this.lock, dt );
		// the strafe blend space of the animation graph (wave 4 Avatar.setLocomotion), while locked
		const av = this.app.avatar;
		if ( this.lock && av && typeof av.setLocomotion === 'function' && p.velocity ) {

			const fx = - Math.sin( p.yaw ), fz = - Math.cos( p.yaw ), rx = - fz, rz = fx;
			try { av.setLocomotion( { speed: p.velocity.x * fx + p.velocity.z * fz, strafe: p.velocity.x * rx + p.velocity.z * rz, turn: 0, grounded: p.grounded !== false, combat: true } ); } catch ( e ) { /* the graph is optional */ }

		}

	}

	// ---- per frame

	update( dt ) {

		if ( ! ( dt > 0 ) || ! this.player ) return;
		dt = Math.min( dt, 0.1 );
		const a = this.app;
		this.time += dt;
		if ( ! this._audioReady && a.audio && a.audio.ctx && this.audio.preload ) {

			this._audioReady = true;
			this.audio.preload();

		}

		if ( a.paused ) return;
		this._tickClock( dt );
		const pp = this.player.position;
		this.inPeace = this.zoneOn && inPeace( pp.x, pp.z );
		this._updateTarget();
		if ( this.enabled ) this._syncSlots();
		this._input( dt );
		this._updateLock( dt );
		if ( this.tokenGap > 0 ) this.tokenGap -= dt;

		const n = Math.max( 1, Math.ceil( dt / FIXED ) ), h = dt / n;
		const p = this.player.position;
		for ( let i = 0; i < n; i ++ ) {

			if ( this.enabled ) this.combat.update( h );
			for ( const r of this.list ) {

				if ( ! r.active ) continue;
				if ( ! r.busy && ( r.x - p.x ) ** 2 + ( r.z - p.z ) ** 2 > UPDATE_D2 ) continue;
				r.update( h );

			}

			if ( this.dummy && this.enabled ) this.dummy.update( h );

			for ( let k = this.sched.length - 1; k >= 0; k -- ) {

				const s = this.sched[ k ];
				s.t -= h;
				if ( s.t <= 0 ) {

					this.sched.splice( k, 1 );
					s.fn();

				}

			}

		}

		this._frameFx( dt );

	}

	_frameFx( dt ) {

		const c = this.combat;
		const d = this.dummy, shown = d && ( d.sparring || d.state !== 'idle' ) ? this.targets() : this.list;
		if ( this.fx ) this.fx.update( shown, this.time );
		this._playerFlash( c.hurtFlash );
		if ( this.hintT > 0 ) this.hintT -= dt;
		let hint = this.hintT > 0 ? this.hintText : '';
		if ( ! hint && this.enabled && this.target().valid && ! this.rodStowed() && this._raiderAggro( 12 ) ) hint = 'Press <kbd>R</kbd> to put the rod away and fight';
		if ( this.hud ) {

			const p = this.player.position;
			// the health bar only in a fight: engaged, down, or a few seconds after the last blow traded
			this.hud.update( dt, {
				raiders: shown, player: { x: p.x, z: p.z }, hp: c.hp, maxHp: c.maxHp, guarding: c.guarding, hint, lock: this.lock,
				showPlayer: this.engaged() || c.state === 'down' || ( c.sinceCombat < PLAYER.combatLinger && ! ( d && d.sparring && ! this.engaged() && c.hp >= c.maxHp ) ),
				fade: c.fade, hurt: c.hurtFlash * ( this.app.settings && this.app.settings.reduceMotion ? 0.4 : 0.85 ) + ( c.hp > 0 && c.hp < 30 ? 0.12 : 0 ),
			} );

		}

	}

	_raiderAggro( range ) {

		const p = this.player.position;
		for ( const r of this.list ) if ( r.inCombat && r.aggro && ( r.x - p.x ) ** 2 + ( r.z - p.z ) ** 2 <= range * range ) return true;
		return false;

	}

	// a red glow on the player's avatar while the hurt flash lasts (the emissive of each material, on top of its own)
	_playerFlash( k ) {

		const av = this.app.avatar, m = av && av.model;
		if ( ! m || ! m.materials ) return;
		if ( k <= 0.003 && ! this._pFlashing ) return;
		this._pFlashing = k > 0.003;
		const a = this._pFlashing ? k : 0;
		for ( const mat of m.materials ) {

			if ( ! mat || ! mat.emissive || typeof mat.emissive.r !== 'number' ) continue;
			let b = this._pBase.get( mat );
			if ( ! b ) { b = [ mat.emissive.r, mat.emissive.g, mat.emissive.b ]; this._pBase.set( mat, b ); }
			try { mat.emissive = [ b[ 0 ] + 0.9 * a, b[ 1 ] + 0.16 * a, b[ 2 ] + 0.1 * a ]; } catch ( e ) { /* keep going */ }

		}

	}

	// ---- save

	toJSON() {

		const slots = {};
		for ( const s of this.slots ) if ( s.respawnLeft > 0 ) slots[ s.id ] = Math.round( s.respawnLeft * 100 ) / 100;
		return { v: 1, hp: Math.round( this.combat.hp ), kills: this.kills, captain: this.captain.active, slots };

	}

	fromJSON( d ) {

		if ( ! d || typeof d !== 'object' ) return;
		if ( Number.isFinite( d.hp ) ) this.combat.hp = clamp( Math.round( d.hp ), 1, this.combat.maxHp );
		if ( Number.isFinite( d.kills ) ) this.kills = Math.max( 0, Math.floor( d.kills ) );
		if ( typeof d.captain === 'boolean' ) this.captain.active = d.captain;
		const saved = d.slots && typeof d.slots === 'object' ? d.slots : {};
		for ( const s of this.slots ) {

			const v = saved[ s.id ];
			s.respawnLeft = Number.isFinite( v ) ? clamp( v, 0, CLOCK.respawnHours ) : 0;
			if ( s.respawnLeft > 0 && s.raider && s.raider.active ) s.raider.deactivate();

		}

	}

	// a new game: everyone is back, the player is whole
	reset() {

		this.kills = 0;
		this.tokens.clear();
		this.lock = null;
		if ( this.dummy ) this.dummy.spar( false );
		this.sched.length = 0;
		this.hours = 0;
		this._lastHour = null;
		this.combat.reset();
		this.captain.active = this.options.captain !== undefined ? !! this.options.captain : this.rand() < CLOCK.captainChance;
		for ( const s of this.slots ) {

			s.respawnLeft = 0;
			if ( s.raider && s.raider.active ) s.raider.deactivate();

		}

		this._lmb = this._rmb = false;
		this._guardUp = this._guardBlock = false;
		this._guardFar = 0;

	}

	dispose() {

		for ( const r of this.list ) r.dispose();
		this.list.length = 0;
		if ( this.hud ) this.hud.dispose();
		if ( this.fx ) this.fx.dispose();
		if ( this.dummy ) this.dummy.dispose();
		for ( const off of this._offs ) if ( typeof off === 'function' ) off();
		this._offs.length = 0;
		this.sched.length = 0;

	}

}

// options (all optional; Features.add passes none, so app.meleeOptions can carry them): enabled, peaceful, autoStow,
// lockPlayer, captain (force the captain roll), seed, slots (a slot camp, e.g. SLOTS), peaceZone (false: no home peace),
// lockOn (false: no soft lock), dummy (false: no training post), plus the test stubs avatarFactory / audio / hud / fx / terrain / colliders
export function install( app, features, options = {} ) {

	return new Melee( app, features, { ...( app && app.meleeOptions ), ...options } );

}

export { PLAYER, RAIDER, CLOCK, SLOTS, TOKENS, TRAINING_POST };
