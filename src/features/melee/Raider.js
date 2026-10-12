import { Vector3 } from '../../engine/index.js';
import { CLIPS, CLIP_SPEED } from '../../game/Characters.js';
import { PLAYER, RAIDER, CAPTAIN, wrapAngle, clamp, yawToward, forwardX, forwardZ, tierCfg } from './MeleeData.js';

// One shore raider: a roster character (lite Avatar) driven by a small state machine. The avatar's own
// update() is never called: the raider picks its clips and plays them straight on avatar.model
// (play / update / hold / current / clips), the way src/world/Residents.js does.
//
//   idle -> (player inside 12 m) notice -> approach -> windup -> strike -> recover -> approach ...
//   idle <-> patrol (a few steps around the camp), return (leash / lost the player: walk home, heal)
//   hp 0: down (Knockdown) -> getup (GetUp_Front) -> flee -> gone      (or down -> gone: he stays down, then is dragged off)
//   taunt: Laugh over a knocked-down player, then return
//
// The telegraph: windup lasts RAIDER.windup (0.6 s). `alert` is true during it (the HUD shows "!" over the
// head, the ring on the ground flashes). The swing clip plays at 0.3 / windup speed so its contact (0.3 s into
// Melee_Paddle) lands exactly when the windup ends, which is when the owner resolves the hit (owner.raiderStrike).
// Then strike (0.12 s) and recover (0.8 s, `punish` = true): the window where the player hits back for 1.5x.
//
// The owner (Melee in index.js) provides: terrain, colliders, target() -> { x, y, z, yaw, valid }, tokenFree( r ) /
// takeToken( r ) / releaseToken( r ) (the attack tokens: at most two raiders swing at once), raiderStrike( r ), onDefeated( r ),
// onAggro( r ), onWindup( r ), far( r ), rand(), raiders (the others, for spacing).
//
// Wave 4: tiers (MeleeData TIERS: tier 1 slow and straight, tier 3 quick and flanking; the captain is tier 4), and the
// crowd: a raider without a token does not stack on the player but holds a ring round him ('circle': 4.2 m, sideways,
// spread from the others, pulled round behind the player by cfg.flank) until a token is free. He commits with the token
// (keeps it while closing in, cfg.commit s at most), winds up with an amber flash on the body (the tell) and the ring on
// the ground, and a parried blow (parried()) leaves him staggered and open for cfg.parryStagger s.

export const STATES = [ 'idle', 'patrol', 'notice', 'approach', 'circle', 'windup', 'strike', 'recover', 'stagger', 'down', 'getup', 'flee', 'gone', 'return', 'taunt' ];
const _yAxis = new Vector3( 0, 1, 0 );
const _p = new Vector3();
const MIN_GROUND = 0.15; // m above the sea: raiders keep their feet dry
const WANDER = 3.5; // m around the camp
const GESTURES = [ 'Look_Around', 'Laugh', 'Idle_Breathe' ]; // between them he swaggers (the base loop)
const LOOPING = new Set( [ 'Look_Around', 'Laugh', 'Swagger_Idle', 'Idle_Breathe' ] );
const STUCK_S = 1.5; // s of not getting closer (water in the way) before he gives up and walks home
const STUN_IN_RECOVER = 0.45; // s of recovery left after a punish hit

export class Raider {

	constructor( owner, slot, avatar ) {

		this.owner = owner;
		this.slot = slot;
		this.id = slot.id;
		this.avatar = avatar;
		this.model = null;
		this.kind = slot.when === 'captain' ? 'captain' : 'raider';
		this.tier = slot.tier || ( this.kind === 'captain' ? 4 : 2 );
		this.cfg = this.kind === 'captain' ? CAPTAIN : tierCfg( RAIDER, this.tier );
		this.name = this.kind === 'captain' ? 'Captain' : 'Raider';
		this.spawnId = this.id;
		this.homeX = slot.x;
		this.homeZ = slot.z;
		this.homeYaw = Math.PI; // faces the water (+Z)
		this.x = slot.x;
		this.z = slot.z;
		this.y = 0;
		this.yaw = this.homeYaw;
		this.hp = this.cfg.hp;
		this.maxHp = this.cfg.hp;
		this.state = 'idle';
		this.t = 0;
		this.active = false; // spawned (even when hidden by distance)
		this.visible = false;
		this.alert = false; // wind-up telegraph on
		this.punish = false; // in the recovery window
		this.aggro = false;
		this.flash = 0; // hit flash 0..1
		this.tell = 0; // wind-up flash 0..1 (amber)
		this.committed = false; // holds an attack token while closing in
		this.commitT = 0;
		this.parriedT = 0; // > 0: staggered by a parry (punishable)
		this.staggerFor = 0;
		this.circleDir = 1;
		this.ringJitter = 0;
		this.sinceAttack = 99;
		this.outcome = null; // result of the last strike: 'hit' | 'blocked' | 'dodged' | 'missed' | ...
		this.strikeCount = 0;
		this.loseT = 0;
		this.stuckT = 0;
		this.gestureT = 3;
		this.gesture = null;
		this.gestureLeft = 0;
		this.wander = null;
		this.flees = false;
		this._swing = null; // the swing clip's layer (its speed is changed at the contact)
		this._baseEmissive = null;
		this._flashing = false;
		this._ready = false;
		this.hitClipT = 0;
		this.attach( avatar );

	}

	// ---- avatar

	attach( avatar ) {

		this.avatar = avatar;
		this.model = null;
		if ( ! avatar ) return;
		const gen = avatar.ready;
		if ( gen && typeof gen.then === 'function' ) gen.then( ( m ) => { if ( this.avatar === avatar && m ) this._onModel( m ); } ).catch( () => {} );
		else if ( avatar.model ) this._onModel( avatar.model );

	}

	_onModel( model ) {

		this.model = model;
		this._ready = true;
		this._baseEmissive = null;
		this._place();
		this.owner.onModel && this.owner.onModel( this );

	}

	// ---- spawn / reset

	spawn( { name, kind = this.kind, scale = null, tier = null } = {} ) {

		this.kind = kind;
		if ( tier ) this.tier = tier;
		else if ( kind === 'captain' ) this.tier = 4;
		this.cfg = kind === 'captain' ? CAPTAIN : tierCfg( RAIDER, this.tier );
		this.name = name || this.name;
		this.maxHp = this.cfg.hp;
		this.hp = this.maxHp;
		this.x = this.homeX;
		this.z = this.homeZ;
		this.yaw = this.homeYaw;
		this.active = true;
		this.visible = true;
		this.alert = false;
		this.punish = false;
		this.aggro = false;
		this.flash = 0;
		this.sinceAttack = 99;
		this.outcome = null;
		this.loseT = 0;
		this.stuckT = 0;
		this.gesture = null;
		this.gestureLeft = 0;
		this.gestureT = 2 + this.owner.rand() * 5;
		this.wander = null;
		this.flees = false;
		this.tell = 0;
		this.committed = false;
		this.parriedT = 0;
		this.circleDir = this.owner.rand() < 0.5 ? - 1 : 1;
		this.ringJitter = ( this.owner.rand() - 0.5 ) * 1.2;
		this.spawnCount = ( this.spawnCount || 0 ) + 1;
		this.spawnId = this.id + '#' + this.spawnCount;
		this.scale = scale || this.cfg.scale;
		this.owner.releaseToken( this );
		this._enter( 'idle' );
		this._ground();
		this._place();
		this._setFlash( 0, true );

	}

	deactivate() {

		this.active = false;
		this.visible = false;
		this.alert = false;
		this.owner.releaseToken( this );
		this._place();

	}

	get targetable() {

		return this.active && this.visible && this.state !== 'down' && this.state !== 'getup' && this.state !== 'flee' && this.state !== 'gone';

	}

	get busy() {

		// in a fight or visibly doing something that must not be cut (despawn waits for this to end)
		return this.state !== 'idle' && this.state !== 'patrol';

	}

	get inCombat() {

		return this.active && this.visible && ( this.state === 'notice' || this.state === 'approach' || this.state === 'circle' || this.state === 'windup' || this.state === 'strike' || this.state === 'recover' || this.state === 'stagger' );

	}

	// how far into the parry window the wind-up is: 0 outside, 1 at the instant of the blow (the HUD / telegraph cue)
	get parryCue() {

		if ( this.state !== 'windup' ) return 0;
		const left = this.cfg.windup - this.t, w = PLAYER.parryWindow + PLAYER.lateWindow;
		return left <= w ? 1 - left / w : 0;

	}

	// ---- state machine

	_enter( state ) {

		this.state = state;
		this.t = 0;
		this.alert = state === 'windup';
		this.punish = state === 'recover';
		if ( state !== 'stagger' ) this.parriedT = 0;
		// the swing (windup + strike) and the committed run-in hold the attack token: any other state gives it back
		if ( state !== 'windup' && state !== 'strike' && ! ( state === 'approach' && this.committed ) ) {

			this.committed = false;
			this.owner.releaseToken( this );

		}

		switch ( state ) {

			case 'windup':
				this.committed = false;
				this.tell = 1;
				this.owner.onWindup && this.owner.onWindup( this );
				this._swing = this._play( CLIPS.swing, { loop: false, fade: 0.12, speed: Math.min( 1, PLAYER.attackContact / this.cfg.windup ), restart: true } );
				break;
			case 'recover':
				this.sinceAttack = 0;
				break;
			case 'stagger':
				this.staggerFor = this.cfg.stagger;
				this._play( CLIPS.hit, { loop: false, fade: 0.06, restart: true } );
				this.hitClipT = 0.6;
				break;
			case 'circle':
				this._swing = null;
				break;
			case 'down':
				this._swing = null;
				this._play( CLIPS.knockdown, { loop: false, fade: 0.08, restart: true } );
				break;
			case 'getup':
				this._play( CLIPS.getUp, { loop: false, fade: 0.2, restart: true } );
				break;
			case 'gone':
				this.visible = false;
				this._place();
				break;
			case 'idle':
			case 'return':
			case 'notice':
				this._swing = null;
				break;

		}

	}

	update( dt ) {

		if ( ! this.active || this.state === 'gone' ) return;
		const o = this.owner, cfg = this.cfg;
		this.t += dt;
		if ( this.hitClipT > 0 ) this.hitClipT -= dt;
		this.sinceAttack += dt;
		if ( this.parriedT > 0 ) this.parriedT = Math.max( 0, this.parriedT - dt );
		if ( this.flash > 0 || this.tell > 0 ) {

			this.flash = Math.max( 0, this.flash - dt * 3.5 );
			this.tell = Math.max( 0, this.tell - dt * 4 );
			this._setFlash( this.flash );

		}

		const tg = o.target();
		const dx = tg.x - this.x, dz = tg.z - this.z;
		const dist = Math.hypot( dx, dz );
		const hostile = tg.valid && ! o.peaceful;

		switch ( this.state ) {

			case 'idle':
			case 'patrol': {

				if ( hostile && dist <= cfg.notice && this.hp > 0 ) {

					this.aggro = true;
					this.gesture = null;
					o.onAggro && o.onAggro( this );
					this._enter( 'notice' );
					break;

				}

				if ( this.state === 'patrol' ) {

					if ( ! this.wander || ! this._step( this.wander.x, this.wander.z, cfg.walkSpeed, dt, 0.15 ) ) {

						this.wander = null;
						this._enter( 'idle' );
						this.gestureT = 2 + o.rand() * 5;

					}

					break;

				}

				this.yaw += wrapAngle( this.homeYaw - this.yaw ) * ( 1 - Math.exp( - dt * 3 ) );
				if ( this.gesture ) {

					this.gestureLeft -= dt;
					if ( this.gestureLeft <= 0 ) this.gesture = null;

				}

				this.gestureT -= dt;
				if ( this.gestureT <= 0 ) {

					this.gestureT = 4 + o.rand() * 6;
					if ( o.rand() < 0.4 ) this._startWander();
					else {

						this.gesture = GESTURES[ Math.floor( o.rand() * GESTURES.length ) % GESTURES.length ];
						this.gestureLeft = this.gesture === 'Laugh' ? 3 : this.gesture === 'Look_Around' ? 4.6 : 2.7;

					}

				}

				break;

			}

			case 'notice':
				if ( ! hostile ) { this._enter( 'return' ); break; }
				this._turnToward( dx, dz, dt, 8 );
				if ( this.t >= cfg.noticeTime ) this._enter( 'approach' );
				break;

			case 'approach': {

				if ( ! hostile ) { this._enter( 'return' ); break; }
				const home = Math.hypot( this.x - this.homeX, this.z - this.homeZ );
				this.loseT = dist > cfg.lose ? this.loseT + dt : 0;
				if ( home > cfg.leash || this.loseT > cfg.loseTime ) { this._enter( 'return' ); break; }
				this._turnToward( dx, dz, dt, 10 );
				// the token: taken when he is close enough to mean it, kept while he closes in (commit s at most)
				const ready = this.sinceAttack >= cfg.gap;
				if ( this.committed ) {

					this.commitT += dt;
					if ( this.commitT > cfg.commit ) { this.committed = false; o.releaseToken( this ); }

				} else if ( ready && dist <= this._ring() + 3 && o.tokenFree( this ) ) {

					o.takeToken( this );
					this.committed = true;
					this.commitT = 0;

				}

				// no token (two others are swinging): hold the ring round the player instead of stacking on him
				if ( ! this.committed && dist <= this._ring() + 1.2 ) { this._enter( 'circle' ); break; }
				if ( dist <= cfg.startRange ) {

					this.stuckT = 0;
					if ( ready && this.committed ) this._enter( 'windup' );

				} else {

					const px = this.x, pz = this.z;
					this._step( tg.x, tg.z, cfg.speed, dt, cfg.startRange * 0.8, false );
					// the player wades where he cannot follow (or a wall is in the way): he does not stand there forever
					if ( Math.hypot( this.x - px, this.z - pz ) < cfg.speed * dt * 0.25 ) this.stuckT += dt;
					else this.stuckT = 0;
					if ( this.stuckT > STUCK_S ) { this.stuckT = 0; this._enter( 'return' ); }

				}

				break;

			}

			case 'circle': {

				if ( ! hostile ) { this._enter( 'return' ); break; }
				const home = Math.hypot( this.x - this.homeX, this.z - this.homeZ );
				if ( home > cfg.leash + 4 ) { this._enter( 'return' ); break; }
				if ( dist > this._ring() + 2.5 ) { this._enter( 'approach' ); break; } // he got away: run after him
				if ( this.sinceAttack >= cfg.gap && o.tokenFree( this ) ) {

					o.takeToken( this );
					this.committed = true;
					this.commitT = 0;
					this._enter( 'approach' );
					break;

				}

				this._circle( tg, dist, dt );
				this._turnToward( dx, dz, dt, 8 );
				break;

			}

			case 'windup':
				if ( ! hostile ) { this.alert = false; this._enter( 'return' ); break; }
				if ( this.t < cfg.windup - cfg.lockTime ) this._turnToward( dx, dz, dt, cfg.turnRate );
				if ( this.t >= cfg.windup ) {

					this.outcome = o.raiderStrike( this );
					this.strikeCount ++;
					if ( this.state !== 'windup' ) break; // parried: parried() already put him in a stagger
					if ( this._swing && typeof this._swing === 'object' ) this._swing.speed = 1;
					this._enter( 'strike' );

				}

				break;

			case 'strike':
				if ( this.t >= cfg.strike ) this._enter( 'recover' );
				break;

			case 'recover':
				if ( this.t >= cfg.recover ) {

					if ( hostile && dist <= cfg.lose ) this._enter( 'approach' );
					else this._enter( 'return' );

				} else if ( dist > 0.3 ) this._turnToward( dx, dz, dt, 2 );
				break;

			case 'stagger':
				if ( this.t >= ( this.staggerFor || cfg.stagger ) ) this._enter( hostile ? 'approach' : 'return' );
				break;

			case 'down':
				if ( this.t >= cfg.downTime ) {

					if ( this.flees ) this._enter( 'getup' );
					else this._enter( 'gone' );

				}

				break;

			case 'getup':
				if ( this.t >= cfg.getUpTime ) this._enter( 'flee' );
				break;

			case 'flee': {

				// away from the player; the camp's far end if the player is not around
				const ax = dist > 0.5 ? - dx / dist : 1, az = dist > 0.5 ? - dz / dist : 0;
				this._turnToward( ax, az, dt, 8 );
				this._move( ax, az, cfg.fleeSpeed, dt );
				if ( this.t >= cfg.fleeTime || ( dist > 40 && this.t > 2 ) ) this._enter( 'gone' );
				break;

			}

			case 'return': {

				this.hp = Math.min( this.maxHp, this.hp + cfg.healRate * dt );
				const arrived = ! this._step( this.homeX, this.homeZ, cfg.returnSpeed, dt, 0.4 );
				if ( arrived ) {

					this.hp = this.maxHp;
					this.aggro = false;
					this.sinceAttack = 99;
					this._enter( 'idle' );
					this.gestureT = 2 + o.rand() * 3;

				}

				break;

			}

			case 'taunt':
				this._turnToward( dx, dz, dt, 4 );
				if ( this.t >= cfg.tauntTime ) this._enter( 'return' );
				break;

			default:
				break;

		}

		this._ground();
		this._place();
		this._animate( dt );

	}

	// the owner tells a nearby raider the player is down: laugh, then walk home
	taunt() {

		if ( this.active && ( this.state === 'approach' || this.state === 'circle' || this.state === 'recover' || this.state === 'notice' || this.state === 'windup' ) ) {

			this.alert = false;
			this._enter( 'taunt' );
			return true;

		}

		return false;

	}

	// his blow was parried: staggered, open (a punish) for cfg.parryStagger s. Returns true when it took
	parried() {

		if ( ! this.targetable ) return false;
		this.alert = false;
		this._enter( 'stagger' );
		this.staggerFor = this.cfg.parryStagger || 1;
		this.parriedT = this.staggerFor;
		this.punish = true;
		this.sinceAttack = 0;
		return true;

	}

	// the waiting ring's radius: the owner may shrink it (a ship's deck is narrow)
	_ring() {

		const o = this.owner;
		return o.circleRadius ? o.circleRadius( this ) : this.cfg.circle;

	}

	// the ring round the player while he waits for a token: sideways along it, spread from the others, round behind him
	_circle( tg, dist, dt ) {

		const cfg = this.cfg, o = this.owner;
		const ang = Math.atan2( this.x - tg.x, this.z - tg.z ); // my bearing from the player (x = sin, z = cos)
		const ring = this._ring();
		let want = ang + this.circleDir * ( cfg.circleSpeed / Math.max( 1, ring ) ) * dt;
		const list = o.raiders || [];
		for ( const r of list ) {

			if ( r === this || ! r.active || ! r.visible || ! r.inCombat ) continue;
			const d = wrapAngle( Math.atan2( r.x - tg.x, r.z - tg.z ) - ang );
			if ( Math.abs( d ) < cfg.spread ) want -= Math.sign( d || this.circleDir ) * ( cfg.spread - Math.abs( d ) ) * 2.2 * dt;

		}

		// flankers work round to the player's back (behind him is at bearing = his yaw: forward is ( -sin, -cos ))
		if ( cfg.flank > 0 && Number.isFinite( tg.yaw ) ) want += wrapAngle( tg.yaw - ang ) * cfg.flank * 0.6 * dt;
		const r = ring + this.ringJitter * Math.min( 1, ring / 4 );
		const px = this.x, pz = this.z;
		this._step( tg.x + Math.sin( want ) * r, tg.z + Math.cos( want ) * r, cfg.walkSpeed * 1.8, dt, 0.05, false );
		// walked into water or a wall: go round the other way
		if ( Math.hypot( this.x - px, this.z - pz ) < cfg.walkSpeed * dt * 0.2 ) {

			this.stuckT += dt;
			if ( this.stuckT > 0.6 ) { this.stuckT = 0; this.circleDir = - this.circleDir; }

		} else this.stuckT = 0;

	}

	// ---- being hit. Returns { dealt, killed, punish, staggered }

	takeHit( damage ) {

		if ( ! this.targetable ) return { dealt: 0, killed: false, punish: false, staggered: false };
		const cfg = this.cfg;
		const punish = this.state === 'recover' || ( this.state === 'stagger' && this.parriedT > 0 );
		const dealt = Math.round( damage * ( punish ? PLAYER.punishBonus : 1 ) );
		this.hp = Math.max( 0, this.hp - dealt );
		this.flash = 1;
		this._setFlash( 1 );
		this.aggro = true;
		let staggered = false;
		if ( this.hp <= 0 ) {

			this.flees = this.owner.rand() < cfg.flees;
			this.alert = false;
			this.punish = false;
			this._enter( 'down' );
			this.owner.onDefeated && this.owner.onDefeated( this );
			return { dealt, killed: true, punish, staggered: false };

		}

		switch ( this.state ) {

			case 'recover':
				// a punish hit: he flinches and stays open a little longer
				this.t = Math.min( this.t, cfg.recover - STUN_IN_RECOVER );
				this._play( CLIPS.hit, { loop: false, fade: 0.06, restart: true } );
				this.hitClipT = 0.6;
				staggered = true;
				break;
			case 'windup':
				if ( ! cfg.armored ) {

					this._enter( 'stagger' );
					staggered = true;

				}

				break;
			case 'strike':
				break;
			case 'stagger':
				this.t = Math.min( this.t, cfg.stagger * 0.5 );
				this._play( CLIPS.hit, { loop: false, fade: 0.06, restart: true } );
				this.hitClipT = 0.6;
				staggered = true;
				break;
			case 'idle':
			case 'patrol':
			case 'notice':
			case 'approach':
			case 'circle':
			case 'return':
			case 'taunt':
				if ( this.state === 'idle' || this.state === 'patrol' || this.state === 'return' || this.state === 'taunt' ) this.owner.onAggro && this.owner.onAggro( this );
				this._enter( 'stagger' );
				staggered = true;
				break;
			default:
				break;

		}

		return { dealt, killed: false, punish, staggered };

	}

	// ---- movement

	_walkable( x, z ) {

		const t = this.owner.terrain;
		return ! t || t.heightAt( x, z ) > MIN_GROUND;

	}

	// walk toward ( tx, tz ) up to `stop` m of it; false when already there
	_step( tx, tz, speed, dt, stop = 0.1, face = true ) {

		const dx = tx - this.x, dz = tz - this.z, d = Math.hypot( dx, dz );
		if ( d <= stop + 1e-4 ) return false;
		if ( face ) this._turnToward( dx, dz, dt, 8 );
		this._move( dx / d, dz / d, Math.min( speed, ( d - stop ) / Math.max( dt, 1e-4 ) ), dt );
		return true;

	}

	// move along a unit direction; stays on dry sand, out of the other raiders and any solid geometry
	_move( ux, uz, speed, dt ) {

		let nx = this.x + ux * speed * dt, nz = this.z + uz * speed * dt;
		for ( const r of this.owner.raiders ) {

			if ( r === this || ! r.active || ! r.visible || r.state === 'gone' ) continue;
			const sx = nx - r.x, sz = nz - r.z, d = Math.hypot( sx, sz ), min = this.cfg.radius + r.cfg.radius + 0.1;
			if ( d < min && d > 1e-4 ) { nx = r.x + sx / d * min; nz = r.z + sz / d * min; }

		}

		if ( ! this._walkable( nx, nz ) ) {

			if ( this._walkable( nx, this.z ) ) nz = this.z;
			else if ( this._walkable( this.x, nz ) ) nx = this.x;
			else { nx = this.x; nz = this.z; }

		}

		const c = this.owner.colliders;
		if ( c && c.resolveCapsule ) {

			_p.set( nx, this.y, nz );
			c.resolveCapsule( _p, this.cfg.radius, 1.7, 0.4 );
			if ( this._walkable( _p.x, _p.z ) ) { nx = _p.x; nz = _p.z; }

		}

		this.x = nx;
		this.z = nz;

	}

	_turnToward( dx, dz, dt, rate ) {

		if ( Math.abs( dx ) + Math.abs( dz ) < 1e-6 ) return;
		const want = yawToward( 0, 0, dx, dz );
		const d = wrapAngle( want - this.yaw );
		this.yaw = wrapAngle( this.yaw + clamp( d, - rate * dt, rate * dt ) );

	}

	_startWander() {

		const o = this.owner;
		for ( let i = 0; i < 6; i ++ ) {

			const a = o.rand() * Math.PI * 2, r = 1.2 + o.rand() * ( WANDER - 1.2 );
			const x = this.homeX + Math.cos( a ) * r, z = this.homeZ + Math.sin( a ) * r;
			if ( this._walkable( x, z ) ) {

				this.wander = { x, z };
				this.gesture = null;
				this._enter( 'patrol' );
				return true;

			}

		}

		return false;

	}

	_ground() {

		const t = this.owner.terrain;
		this.y = t ? t.heightAt( this.x, this.z ) : 0;

	}

	// ---- avatar

	_place() {

		const a = this.avatar;
		if ( ! a || ! a.group ) return;
		const g = a.group;
		g.visible = this.active && this.visible;
		g.position.set( this.x, this.y, this.z );
		if ( g.quaternion ) g.quaternion.setFromAxisAngle( _yAxis, this.yaw + Math.PI ); // the rig faces +Z
		if ( g.scale && this.scale && this.scale !== 1 ) g.scale.set( this.scale, this.scale, this.scale );
		else if ( g.scale ) g.scale.set( 1, 1, 1 );
		if ( typeof g.updateMatrixWorld === 'function' ) g.updateMatrixWorld( true );

	}

	// a clip this GLB has (or the idle)
	_clip( name ) {

		const m = this.model;
		if ( ! m || ! m.clips ) return name;
		if ( m.clips.has( name ) ) return name;
		const FALL = { 'Swagger_Idle': 'Idle_Breathe', 'Look_Around': 'Idle_Breathe', 'Laugh': 'Idle_Breathe', 'Hit_Reaction': 'Stumble', 'Stumble': 'Idle_Breathe', 'Melee_Paddle': 'Idle_Breathe', 'GetUp_Front': 'Idle_Breathe', 'Knockdown': 'Stumble' };
		let n = name;
		for ( let i = 0; i < 4 && n; i ++ ) { n = FALL[ n ]; if ( n && m.clips.has( n ) ) return n; }
		return CLIPS.idle;

	}

	// play a clip on the model; restart a one-shot that is still the current layer. Returns the layer (or null)
	_play( name, { loop = true, fade = 0.2, speed = 1, restart = false } = {} ) {

		const m = this.model;
		if ( ! m ) return null;
		const clip = this._clip( name );
		this.lastClip = clip;
		try {

			const layer = m.play( clip, { fade, loop, speed } );
			if ( restart && layer && typeof layer === 'object' && 'time' in layer && layer.time > 0.02 ) {

				layer.time = 0;
				layer.ended = false;
				layer.speed = speed;

			}

			return layer || null;

		} catch ( e ) {

			return null;

		}

	}

	// the clip a state wants, played only when it changes (one-shots are started in _enter)
	_animate( dt ) {

		const m = this.model;
		if ( ! m ) return;
		if ( this.owner.far( this ) ) {

			if ( m.hold ) m.hold();
			return;

		}

		const cfg = this.cfg;
		const cur = m.current;
		const want = ( name, o ) => { if ( cur !== this._clip( name ) ) this._play( name, o ); };
		switch ( this.state ) {

			case 'idle':
				if ( this.gesture ) want( this.gesture, { loop: LOOPING.has( this.gesture ), fade: 0.25 } );
				else want( CLIPS.swagger, { fade: 0.35 } );
				break;
			case 'patrol':
				want( CLIPS.walk, { fade: 0.25, speed: Math.max( 0.6, Math.min( 2, cfg.walkSpeed / CLIP_SPEED.walk ) ) } );
				break;
			case 'notice':
				want( CLIPS.swagger, { fade: 0.15 } );
				break;
			case 'circle':
				want( CLIPS.walk, { fade: 0.25, speed: Math.max( 0.7, Math.min( 2, cfg.walkSpeed * 1.8 / CLIP_SPEED.walk ) ) } );
				break;
			case 'approach':
				{

					const tg = this.owner.target();
					const near = Math.hypot( tg.x - this.x, tg.z - this.z ) <= cfg.startRange + 0.2;
					if ( near ) want( CLIPS.swagger, { fade: 0.2 } );
					else want( CLIPS.run, { fade: 0.2, speed: Math.max( 0.8, Math.min( 2.2, cfg.speed / CLIP_SPEED.run ) ) } );

				}

				break;
			case 'windup':
			case 'strike':
				break; // the swing clip was started in _enter and runs by itself
			case 'recover':
				// the follow-through (or the flinch of a punish hit) plays out, then he stands panting
				if ( ( this.t > 0.38 && cur === this._clip( CLIPS.swing ) && this._clip( CLIPS.swing ) !== CLIPS.idle ) || ( this.hitClipT <= 0 && cur === this._clip( CLIPS.hit ) ) ) this._play( CLIPS.idle, { fade: 0.25 } );
				break;
			case 'stagger':
			case 'down':
			case 'getup':
				break;
			case 'flee':
				want( CLIPS.run, { fade: 0.2, speed: Math.max( 0.8, Math.min( 2.2, cfg.fleeSpeed / CLIP_SPEED.run ) ) } );
				break;
			case 'return':
				want( CLIPS.run, { fade: 0.2, speed: Math.max( 0.6, Math.min( 2, cfg.returnSpeed / CLIP_SPEED.run ) ) } );
				break;
			case 'taunt':
				want( CLIPS.laugh, { fade: 0.2 } );
				break;
			default:
				break;

		}

		m.update( dt );

	}

	// hit flash: the avatar's materials glow red for a moment (emissive on top of what they had); the wind-up tell adds amber
	_setFlash( k, force = false ) {

		const m = this.model;
		if ( ! m || ! m.materials ) return;
		const tl = this.tell || 0;
		if ( k <= 0.003 && tl <= 0.003 && ! this._flashing && ! force ) return;
		if ( ! this._baseEmissive ) {

			this._baseEmissive = m.materials.map( ( mat ) => {

				const e = mat && mat.emissive;
				return e && typeof e.r === 'number' ? [ e.r, e.g, e.b ] : null;

			} );

		}

		this._flashing = k > 0.003 || tl > 0.003;
		const a = k > 0.003 ? k : 0, w = tl > 0.003 ? tl : 0;
		m.materials.forEach( ( mat, i ) => {

			const b = this._baseEmissive[ i ];
			if ( ! mat || ! b ) return;
			try { mat.emissive = [ b[ 0 ] + 0.9 * a + 0.75 * w, b[ 1 ] + 0.16 * a + 0.45 * w, b[ 2 ] + 0.1 * a + 0.05 * w ]; } catch ( e ) { /* keep going */ }

		} );

	}

	headPosition( out ) {

		const a = this.avatar;
		if ( a && a.headPosition && this.model ) return a.headPosition( out );
		return out.set( this.x, this.y + 1.7 * ( this.scale || 1 ), this.z );

	}

	dispose() {

		this.owner.releaseToken( this );
		if ( this.avatar && this.avatar.dispose ) this.avatar.dispose();
		this.avatar = null;
		this.model = null;
		this.active = false;

	}

	// facing helpers for the owner's hit tests
	get fx() { return forwardX( this.yaw ); }
	get fz() { return forwardZ( this.yaw ); }

}
