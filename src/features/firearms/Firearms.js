import { Matrix4, Vector3 } from '../../engine/index.js';
import { inPeace } from '../melee/Peace.js';
import { mulberry32 } from '../../util/Noise.js';
import { G } from '../../core/Globals.js';
import { WEAPONS, ORDER, POUCH, HEADSHOT, damageAt, spreadRad, spreadDir, forwardOf, maxRange, clamp } from './FirearmsData.js';
import { resolveShot } from './Hitscan.js';
import { GunAudio } from './GunAudio.js';
import { WeaponMesh } from './WeaponMesh.js';

// Firearms (wave 9B): a flintlock pistol and a musket bought from Ethena Prosper at the chandlery, fired at raiders, boarding
// crews, pirate decks and breakable props. One ball a load; powder and ball come in cartridge pouches (consumable).
//
//   const fa = features.get( 'firearms' );
//   fa.drawn            a gun is in hand (drawing, ready or reloading): the touch snapshot and Game read it
//   fa.weapon           'pistol' | 'musket' | null (the one in hand)        fa.owned   { pistol, musket }   fa.shots   cartridges
//   fa.loaded           { pistol, musket }: a ball is down the barrel       fa.aiming  RMB held      fa.phase   see below
//   fa.wantsMouse()     true while drawn: Game leaves the left button alone (the rod does not cast)
//   fa.playerAction     'hold' while drawn (the arms' pose: Avatar's upper-body hold over the locomotion), else null
//   fa.cycle()          G: draw the pistol -> the musket (when owned) -> holster.   fa.draw( id ) / fa.holster()
//   fa.fire()           LMB: one hitscan shot (see Hitscan.js) -> the hit or { refused }
//   fa.reload()         R: a cartridge from the pouch, WEAPONS[ id ].reload seconds (holstering stops it, nothing used)
//   fa.buy( 'pistol' | 'musket' | 'pouch' )   fa.shopRows()  HTML rows for Ethena's Gear tab (data-gun buttons)
//   fa.toJSON() / fromJSON( d ) / reset() / dispose()      saved as the feature's part of the save (Features.toJSON)
//
// Phases: 'holstered' -> 'drawing' (WEAPONS.draw s) -> 'ready' <-> 'reloading'. Peace: inside the home island's peaceful zone
// (melee/Peace.js) a shot is only fired when it would hit the training post; anything else: "Not here".
// Damage goes through the target's own takeHit (melee Raider / Dummy: hit reactions, flinch, defeat, loot and enemyDefeated stay
// melee's); a shot during a wind-up interrupts it like a parry (Raider.parried()). Headshots x1.6 (Raider.headPosition).
// Pirate ships: a ball into the deck box kills one of the crew when the ship exposes them (ship.boarding.crewLeft, ship.crew),
// else 2 hull damage (naval's own Ship.damage; a sinking goes through naval._onSunk). Props: destruction.damage / impulse.
// Feel: vfx flash + smoke at the muzzle, a synthesised report (GunAudio), cameraFeel 'recoil', the 'shoot' / 'reload' montages
// (fallback: the 'strike' / 'inspect' clips on the upper body), reload clacks.
// Events: gunFired { weapon, x, y, z, dir, by: 'player' }, gunHit { weapon, kind, x, y, z, target, damage, head, killed },
//   crewShot { id, name, left }, gunBought { id, price }; world event 'gunshot' to the other players (they see and hear it).
// Headless: install( app, features, { audio, mesh: false, rand, seed } ).

export const AIM = { ease: 10 }; // 1/s: the zoom eases in and out
const RELOAD_CUES = [ [ 0.06, 'half' ], [ 0.24, 'pour' ], [ 0.5, 'ram' ], [ 0.62, 'ram' ], [ 0.9, 'cock' ] ];
const CHEST = 1.35; // m above the feet: where the ball leaves (third person)
const RECOIL_T = 0.35; // s the recoil pose and the after-shot lockout last

export class Firearms {

	constructor( app, features, options = {} ) {

		this.app = app || {};
		this.features = features || null;
		this.options = options;
		this.enabled = options.enabled !== false;
		this.rand = options.rand || mulberry32( options.seed !== undefined ? options.seed : ( Date.now() & 0xffffff ) );
		this.audio = options.audio || new GunAudio( this.app.audio );
		this.mesh = options.mesh === false ? null : this._makeMesh();
		this.owned = { pistol: false, musket: false };
		this.loaded = { pistol: false, musket: false };
		this.shots = 0;
		this.sel = null; // the weapon drawn last (G draws it again)
		this.phase = 'holstered';
		this.t = 0;
		this.aiming = false;
		this.aimK = 0;
		this.recoil = 0;
		this.after = 0; // s left of the after-shot lockout
		this.sched = [];
		this.stats = { fired: 0, hits: 0, heads: 0, kills: 0, refused: 0 };
		this.last = null; // the last shot's result (tests, debugging)
		this._lmb = false;
		this._fovBase = null;
		this._prev = null; // the player's position last frame (the musket's walking pace)
		this._tips = {};
		this._offs = [];
		this.keyOk = features && features.claimKey ? features.claimKey( 'KeyG', 'firearms' ) : true;
		if ( features && features.on ) this._offs.push( features.on( 'remoteWorldEvent', ( e ) => this._remote( e ) ) );

	}

	_makeMesh() {

		try {

			return this.app.scene ? new WeaponMesh( { scene: this.app.scene } ) : null;

		} catch ( e ) {

			console.warn( 'firearms: no weapon mesh', e );
			return null;

		}

	}

	// ---- public surface

	get drawn() {

		return this.phase === 'drawing' || this.phase === 'ready' || this.phase === 'reloading';

	}

	get weapon() {

		return this.drawn ? this.sel : null;

	}

	get ready() {

		return this.phase === 'ready' && this.after <= 0;

	}

	get playerAction() {

		const p = this.app.player;
		return this.drawn && p && p.mode !== 'swim' && p.mode !== 'boat' ? 'hold' : null;

	}

	wantsMouse() {

		return !! ( this.enabled && this.drawn );

	}

	has( id ) {

		return !! this.owned[ id ];

	}

	anyOwned() {

		return ORDER.some( ( id ) => this.owned[ id ] );

	}

	status() {

		return { phase: this.phase, weapon: this.weapon, owned: { ...this.owned }, loaded: { ...this.loaded }, shots: this.shots, aiming: this.aiming, stats: { ...this.stats } };

	}

	// ---- helpers

	get state() {

		return this.features ? this.features.state : null;

	}

	get sandbox() {

		return !! ( this.features && this.features.sandbox );

	}

	_get( name ) {

		try { return this.features && this.features.get ? this.features.get( name ) : null; } catch ( e ) { return null; }

	}

	toast( text, ms = 2200 ) {

		const g = this.app.game;
		if ( g && g.toast ) g.toast( text, ms );

	}

	_tip( key, text, ms = 3600 ) {

		if ( this._tips[ key ] ) return;
		this._tips[ key ] = true;
		this.toast( text, ms );

	}

	emit( name, payload ) {

		if ( this.features && this.features.emit ) this.features.emit( name, payload );

	}

	_montage( name, fallback, opts ) {

		const av = this.app.avatar;
		if ( ! av || typeof av.playMontage !== 'function' ) return null;
		try {

			let h = av.playMontage( name, opts );
			if ( ( ! h || h.playing === false ) && fallback ) h = av.playMontage( fallback, opts );
			return h && h.playing !== false ? ( h.name || name ) : null;

		} catch ( e ) {

			return null;

		}

	}

	_panelOpen() {

		const hud = this.app.game && this.app.game.hud;
		if ( hud && ( hud.invOpen || hud.standOpen || hud.rosterOpen || hud.catchOpen ) ) return true;
		try { return !! ( this.features && this.features.panelOpen && this.features.panelOpen() ); } catch ( e ) { return false; }

	}

	// on foot (land or a deck), nothing modal up, not knocked down
	_canAct() {

		const a = this.app, p = a.player, inp = a.input;
		if ( ! this.enabled || ! p || ( p.mode !== 'walk' && p.mode !== 'deck' ) ) return false;
		if ( a.paused || a.menuOpen || a.freeCam ) return false;
		if ( inp && inp.enabled === false ) return false;
		if ( a.avatar && a.avatar.ragdolling ) return false;
		const m = this._get( 'melee' );
		if ( m && m.playerDown ) return false;
		return ! this._panelOpen();

	}

	// ---- draw / holster

	cycle() {

		if ( ! this.anyOwned() ) {

			this.toast( 'No firearm · Ethena Prosper sells pistols and muskets at the chandlery', 2800 );
			return null;

		}

		if ( ! this.drawn ) return this.draw( this.sel && this.owned[ this.sel ] ? this.sel : ORDER.find( ( id ) => this.owned[ id ] ) );
		const i = ORDER.indexOf( this.sel );
		const next = ORDER.slice( i + 1 ).find( ( id ) => this.owned[ id ] );
		if ( next ) return this.draw( next );
		this.holster();
		return null;

	}

	draw( id ) {

		const w = WEAPONS[ id ];
		if ( ! w || ! this.owned[ id ] ) return null;
		if ( ! this._canAct() ) return null;
		const g = this.app.game, rod = g && g.rod;
		if ( rod && rod.equipped ) {

			if ( g.fight ) {

				this.toast( 'Not with a fish on the line', 1800 );
				return null;

			}

			if ( g.cancelLine ) g.cancelLine( true );
			if ( rod.equip ) rod.equip( false );

		}

		this._stopReload();
		this.sel = id;
		this.phase = 'drawing';
		this.t = 0;
		this.after = 0;
		this.audio.click( 'half', { gain: 0.6 } );
		const load = this.loaded[ id ] ? 'loaded' : 'empty · R to load';
		this.toast( `${ w.name } · ${ load } · ${ this.shots } cartridge${ this.shots === 1 ? '' : 's' }`, 2000 );
		this._tip( 'controls', 'LMB fire · RMB aim · R reload · G next gun / holster', 4200 );
		return id;

	}

	holster( silent = false ) {

		if ( ! this.drawn ) return false;
		this._stopReload();
		this.phase = 'holstered';
		this.t = 0;
		this.aiming = false;
		if ( ! silent ) this.audio.click( 'half', { gain: 0.4 } );
		return true;

	}

	// ---- reload

	reload() {

		if ( ! this.drawn || ! this.sel ) return false;
		const w = WEAPONS[ this.sel ];
		if ( this.phase !== 'ready' ) return false;
		if ( this.loaded[ this.sel ] ) {

			this._tip( 'loaded', `The ${ w.name.toLowerCase() } is already loaded`, 1600 );
			return false;

		}

		if ( this.shots <= 0 && ! this.sandbox ) {

			this.toast( 'No cartridges · Ethena Prosper sells pouches at the chandlery', 2600 );
			return false;

		}

		this.phase = 'reloading';
		this.t = 0;
		this.aiming = false;
		this.sched.length = 0;
		for ( const [ f, kind ] of RELOAD_CUES ) this.sched.push( { t: f * w.reload, fn: () => this.audio.click( kind, { gain: 0.7 } ) } );
		this.lastMontage = this._montage( 'reload', 'inspect', { slot: 'upper', blendIn: 0.12, blendOut: 0.2 } );
		return true;

	}

	_stopReload() {

		if ( this.phase === 'reloading' ) {

			this.phase = 'ready';
			const av = this.app.avatar;
			try { if ( av && av.stopMontage ) av.stopMontage( 'upper', 0.15 ); } catch ( e ) { /* optional */ }

		}

		this.sched.length = 0;

	}

	_finishReload() {

		const id = this.sel;
		if ( ! this.sandbox ) this.shots = Math.max( 0, this.shots - 1 );
		this.loaded[ id ] = true;
		this.phase = 'ready';
		this.t = 0;
		this.sched.length = 0;
		if ( this.shots === 0 && ! this.sandbox ) this._tip( 'lastShot', 'That was your last cartridge', 2000 );

	}

	// ---- the shot

	// the aim ray: from the camera along its forward, starting level with the player (nothing between the camera and him counts)
	aimRay() {

		const a = this.app, cam = a.camera, p = a.player;
		if ( ! cam || ! cam.position || ! cam.quaternion || ! p ) return null;
		const o = { x: cam.position.x, y: cam.position.y, z: cam.position.z };
		const d = forwardOf( cam.quaternion );
		const cx = p.position.x - o.x, cy = p.position.y + CHEST - o.y, cz = p.position.z - o.z;
		const tMin = Math.max( 0, cx * d.x + cy * d.y + cz * d.z );
		return { o, d, tMin };

	}

	_ctx() {

		const a = this.app, m = this._get( 'melee' ), nv = this._get( 'naval' ), bd = this._get( 'boarding' );
		const p = a.player && a.player.position;
		let targets = [];
		try { targets = m ? ( m.targets ? m.targets() : m.raiders || [] ) : []; } catch ( e ) { targets = []; }
		const td = a.terrainData || ( a.terrain && a.terrain.heightAt ? a.terrain : null );
		const col = a.colliders;
		return {
			targets,
			ships: nv && Array.isArray( nv.ships ) ? nv.ships : [],
			// the ship under the player's feet (a boarded deck) never stops his own shots
			skipShip: ( s ) => !! ( ( bd && bd.ship === s ) || ( p && s.cls && Math.hypot( s.x - p.x, s.z - p.z ) < ( s.cls.length || 12 ) * 0.5 && Math.abs( p.y - ( ( s.pose && s.pose.y ) || 0 ) - ( s.cls.sheer || 1 ) ) < 2.5 ) ),
			props: this._get( 'destruction' ),
			world: col && col.raycast ? ( o, d, len ) => col.raycast( o, d, len ) : null,
			groundAt: td ? ( x, z ) => td.heightAt( x, z ) : null,
			seaLevel: G.seaLevel && Number.isFinite( G.seaLevel.value ) ? G.seaLevel.value : 0,
		};

	}

	fire() {

		if ( ! this.drawn || ! this.sel ) return { refused: 'holstered' };
		const w = WEAPONS[ this.sel ];
		if ( ! this.ready ) return { refused: this.phase };
		if ( ! this.loaded[ this.sel ] ) {

			this.audio.click( 'dry', { gain: 0.8 } );
			this.toast( this.shots > 0 || this.sandbox ? 'Empty · R to reload' : 'Empty · no cartridges left: Ethena Prosper sells pouches', 1800 );
			this.after = 0.25;
			return { refused: 'empty' };

		}

		const ray = this.aimRay();
		if ( ! ray ) return { refused: 'noCamera' };
		const { o, d, tMin } = ray;
		const tMax = tMin + maxRange( w );
		const ctx = this._ctx();
		const p = this.app.player.position;
		if ( inPeace( p.x, p.z ) ) {

			// the peaceful home island: only the training post may be shot at (aimed dead centre, no spread)
			const h = resolveShot( ctx, o, d, tMin, tMax );
			if ( ! h || h.kind !== 'raider' || ! h.target || h.target.kind !== 'dummy' ) {

				this.stats.refused ++;
				this.toast( this._tips.peace ? 'Not here' : 'Not here · the home island is peaceful (the training post is fair game)', 2200 );
				this._tips.peace = true;
				this.after = 0.3;
				return { refused: 'peace' };

			}

		}

		const dir = spreadDir( d, spreadRad( w, this.aiming ), this.rand(), this.rand() );
		const hit = resolveShot( ctx, o, dir, tMin, tMax );
		this.loaded[ this.sel ] = false;
		this.after = RECOIL_T;
		this.recoil = 1;
		this.stats.fired ++;
		const res = { weapon: this.sel, dir, hit: null, damage: 0, head: false, killed: false };
		if ( hit ) {

			res.hit = hit.kind;
			Object.assign( res, this._apply( w, hit, hit.t - tMin, ctx ) );
			res.x = hit.x; res.y = hit.y; res.z = hit.z;

		}

		this._shotFx( w, dir, hit );
		this.last = res;
		return res;

	}

	// what the ball does where it lands; dist from the player (m)
	_apply( w, hit, dist, ctx ) {

		const vfx = this._get( 'vfx' ), out = { damage: 0, head: false, killed: false };
		const k = damageAt( w, dist ) / w.damage; // 0..1 of the ball's punch left
		const at = { x: hit.x, y: hit.y, z: hit.z };
		switch ( hit.kind ) {

			case 'raider': {

				const r = hit.target;
				const dmg = Math.round( w.damage * k * ( hit.head ? HEADSHOT : 1 ) );
				if ( dmg <= 0 ) break;
				const windup = r.state === 'windup';
				let rr = null;
				try { rr = r.takeHit( dmg ); } catch ( e ) { rr = null; }
				if ( ! rr ) break;
				// a ball in the middle of his wind-up stops it like a parry would (open for a punish)
				if ( windup && ! rr.killed && r.targetable && typeof r.parried === 'function' ) r.parried();
				out.damage = rr.dealt;
				out.head = !! hit.head;
				out.killed = !! rr.killed;
				this.stats.hits ++;
				if ( out.head ) this.stats.heads ++;
				if ( out.killed ) this.stats.kills ++;
				const m = this._get( 'melee' );
				if ( m && m.pop ) {

					let hp = null;
					try { hp = r.headPosition ? r.headPosition( new Vector3() ) : null; } catch ( e ) { hp = null; }
					if ( ! hp ) hp = new Vector3( r.x, r.y + 1.8, r.z );
					try { m.pop( out.head ? `HEADSHOT ${ rr.dealt }` : String( rr.dealt ), hp, out.head || rr.punish ? 'punish' : 'dmg' ); } catch ( e ) { /* the HUD is optional */ }

				}

				if ( vfx && vfx.dust ) vfx.dust( at.x, at.y, at.z, 0.08 );
				this.emit( 'gunHit', { weapon: w.id, kind: 'raider', ...at, target: r.spawnId || r.id, damage: rr.dealt, head: out.head, killed: out.killed } );
				break;

			}

			case 'ship': {

				const s = hit.target;
				if ( vfx && vfx.splinters ) vfx.splinters( at.x, at.y, at.z, 0.15 + 0.15 * k );
				if ( hit.part === 'deck' && s.faction === 'pirate' && k > 0 ) {

					const b = s.boarding;
					let left = null;
					if ( b && b.crewLeft > 0 ) left = b.crewLeft = b.crewLeft - 1;
					else if ( Number.isFinite( s.crew ) && s.crew > 0 ) left = s.crew = s.crew - 1;
					if ( left !== null ) {

						out.killed = true;
						this.stats.kills ++;
						this.toast( left > 0 ? `A pirate on the ${ s.name } goes down · ${ left } left aboard` : `The last of the ${ s.name }'s crew goes down`, 2200 );
						this.emit( 'crewShot', { id: s.id, name: s.name, left } );

					} else {

						out.damage = 2;
						let sunk = false;
						try { sunk = s.damage( 2, { part: 'hull', by: 'player' } ); } catch ( e ) { sunk = false; }
						const nv = this._get( 'naval' );
						if ( sunk && nv && typeof nv._onSunk === 'function' ) nv._onSunk( s, true );

					}

					this.stats.hits ++;

				}

				this.emit( 'gunHit', { weapon: w.id, kind: 'ship', part: hit.part, ...at, target: s.id, damage: out.damage, killed: out.killed } );
				break;

			}

			case 'prop': {

				const d = ctx.props, e = w.energy * k;
				if ( d && e > 0 ) {

					try {

						if ( typeof d.damage === 'function' && hit.target ) d.damage( hit.target, e, at, 'player' );
						else if ( d.impulse ) d.impulse( at.x, at.y, at.z, 0.4, e );

					} catch ( err ) { /* the props are optional */ }

				}

				this.emit( 'gunHit', { weapon: w.id, kind: 'prop', ...at, target: hit.target, damage: 0 } );
				break;

			}

			case 'water':
				if ( vfx && vfx.splash ) vfx.splash( at.x, at.y, at.z, 0.1 );
				this.emit( 'gunHit', { weapon: w.id, kind: 'water', ...at } );
				break;

			default: // the ground, a wall, a rock
				if ( vfx ) {

					if ( vfx.dust ) vfx.dust( at.x, at.y, at.z, 0.12 );
					else if ( vfx.debris ) vfx.debris( at.x, at.y, at.z, 0.15, 'dirt' );

				}

				this.emit( 'gunHit', { weapon: w.id, kind: hit.kind, ...at } );

		}

		return out;

	}

	// the muzzle: from the gun in the hand, else in front of the chest
	muzzle( dir ) {

		const m = this.mesh && this.mesh.muzzle ? this.mesh.muzzle( {} ) : null;
		if ( m ) return m;
		const p = this.app.player.position;
		return { x: p.x + dir.x * 0.6, y: p.y + CHEST + dir.y * 0.6, z: p.z + dir.z * 0.6 };

	}

	_shotFx( w, dir, hit ) {

		const mz = this.muzzle( dir ), vfx = this._get( 'vfx' );
		if ( vfx ) {

			if ( vfx.flash ) vfx.flash( mz.x, mz.y, mz.z, w.flash, dir.x, dir.y, dir.z );
			if ( vfx.smoke ) vfx.smoke( mz.x, mz.y, mz.z, w.smoke, dir.x, dir.y, dir.z );

		}

		this.audio.report( w.report, { gain: 1 } );
		const cf = this.app.cameraFeel;
		if ( cf && cf.kick ) try { cf.kick( 'recoil', { scale: w.kick } ); } catch ( e ) { /* optional */ }
		this.lastMontage = this._montage( 'shoot', 'strike', { slot: 'upper', rate: 1.6, blendIn: 0.03, blendOut: 0.2 } );
		this.emit( 'gunFired', { weapon: w.id, x: mz.x, y: mz.y, z: mz.z, dir: { x: dir.x, y: dir.y, z: dir.z }, by: 'player' } );
		const ns = this.app.netsync;
		const r2 = ( v ) => Math.round( v * 100 ) / 100;
		try {

			if ( ns && ns.sendWorldEvent ) ns.sendWorldEvent( 'gunshot', { weapon: w.id, x: r2( mz.x ), y: r2( mz.y ), z: r2( mz.z ), dx: r2( dir.x ), dy: r2( dir.y ), dz: r2( dir.z ), hit: hit ? { kind: hit.kind, x: r2( hit.x ), y: r2( hit.y ), z: r2( hit.z ) } : null } );

		} catch ( e ) { /* single player */ }

	}

	// another player's shot: the flash, the smoke, the report where it was fired, the splash or dust where it landed
	_remote( e ) {

		if ( ! e || e.kind !== 'gunshot' || e.replay || ! e.data ) return;
		const d = e.data, w = WEAPONS[ d.weapon ] || WEAPONS.pistol, vfx = this._get( 'vfx' );
		if ( ! [ d.x, d.y, d.z ].every( Number.isFinite ) ) return;
		if ( vfx ) {

			if ( vfx.flash ) vfx.flash( d.x, d.y, d.z, w.flash, d.dx || 0, d.dy || 0, d.dz || 0 );
			if ( vfx.smoke ) vfx.smoke( d.x, d.y, d.z, w.smoke, d.dx || 0, d.dy || 0, d.dz || 0 );
			const h = d.hit;
			if ( h && [ h.x, h.y, h.z ].every( Number.isFinite ) ) {

				if ( h.kind === 'water' && vfx.splash ) vfx.splash( h.x, h.y, h.z, 0.1 );
				else if ( h.kind === 'ship' && vfx.splinters ) vfx.splinters( h.x, h.y, h.z, 0.2 );
				else if ( vfx.dust ) vfx.dust( h.x, h.y, h.z, 0.1 );

			}

		}

		this.audio.report( w.report, { at: { x: d.x, y: d.y, z: d.z } } );

	}

	// ---- the shop (Ethena Prosper's Gear tab)

	price( id ) {

		return id === 'pouch' ? POUCH.price : WEAPONS[ id ] ? WEAPONS[ id ].price : null;

	}

	buy( id ) {

		const st = this.state, free = !! ( st && st.free );
		const price = this.price( id );
		if ( price === null ) return { ok: false, why: 'unknown' };
		if ( id !== 'pouch' && this.owned[ id ] ) return { ok: false, why: 'owned' };
		if ( id === 'pouch' && this.shots >= POUCH.max ) {

			this.toast( 'Your pouch is full', 1600 );
			return { ok: false, why: 'full' };

		}

		if ( ! free ) {

			if ( ! st || ! st.spend || ! st.spend( price ) ) {

				this.toast( 'Not enough money', 1600 );
				return { ok: false, why: 'money' };

			}

		}

		if ( id === 'pouch' ) {

			this.shots = Math.min( POUCH.max, this.shots + POUCH.count );
			this.toast( `${ POUCH.count } cartridges · ${ this.shots } in the pouch`, 1800 );

		} else {

			this.owned[ id ] = true;
			this.loaded[ id ] = true; // sold loaded
			if ( ! this.sel ) this.sel = id;
			this.toast( `Bought the ${ WEAPONS[ id ].name.toLowerCase() } · G to draw it${ this.shots || this.sandbox ? '' : ' · it needs cartridges too' }`, 3200 );

		}

		this.emit( 'gunBought', { id, price: free ? 0 : price } );
		try { if ( st && st.save ) st.save(); } catch ( e ) { /* saved later */ }
		return { ok: true };

	}

	// the chandlery rows (HudPanels renderShop, Gear tab): data-gun="pistol" | "musket" | "pouch" buttons call buy( id )
	shopRows() {

		const st = this.state || {}, free = !! st.free, money = Number.isFinite( st.money ) ? st.money : 0;
		const btn = ( id, label ) => `<button class="gm-btn" data-gun="${ id }" ${ ! free && this.price( id ) > money ? 'disabled' : '' }>${ free ? 'Free' : label }</button>`;
		let html = '';
		for ( const id of ORDER ) {

			const w = WEAPONS[ id ];
			const act = this.owned[ id ] ? '<span class="gm-have">Owned</span>' : btn( id, `$${ w.price }` );
			html += `<div class="gm-shop-row"><span>${ w.name }<small>${ w.desc }</small></span>${ act }</div>`;

		}

		const full = this.shots >= POUCH.max;
		html += `<div class="gm-shop-row"><span>${ POUCH.name } · ${ POUCH.count }<small>Powder and ball, one per load · you carry ${ this.shots }</small></span>${ full ? '<span class="gm-have">Full</span>' : btn( 'pouch', `$${ POUCH.price }` ) }</div>`;
		return html;

	}

	// ---- per frame (after the player, the camera feel and the game)

	update( dt ) {

		if ( ! ( dt > 0 ) ) return;
		dt = Math.min( dt, 0.1 );
		const a = this.app;
		if ( a.paused ) return;
		this._autoHolster();
		this._input( dt );
		if ( this.after > 0 ) this.after = Math.max( 0, this.after - dt );
		this.recoil = Math.max( 0, this.recoil - dt / RECOIL_T );
		this.t += dt;
		const w = this.sel ? WEAPONS[ this.sel ] : null;
		if ( this.phase === 'drawing' && w && this.t >= w.draw ) {

			this.phase = 'ready';
			this.t = 0;

		}

		if ( this.phase === 'reloading' && w ) {

			for ( let k = this.sched.length - 1; k >= 0; k -- ) {

				const s = this.sched[ k ];
				if ( this.t >= s.t ) {

					this.sched.splice( k, 1 );
					s.fn();

				}

			}

			if ( this.t >= w.reload ) this._finishReload();

		}

		this._pace( w );
		this._zoom( dt, w );
		this._placeMesh();

	}

	// leave the gun in its holster when the player can no longer hold it (swimming, at the helm, the rod out, knocked down)
	_autoHolster() {

		if ( ! this.drawn ) return;
		const a = this.app, p = a.player, rod = a.game && a.game.rod;
		const m = this._get( 'melee' );
		if ( ! p || ( p.mode !== 'walk' && p.mode !== 'deck' ) || ( rod && rod.equipped ) || a.freeCam || ( m && m.playerDown ) || ( a.avatar && a.avatar.ragdolling ) ) this.holster( true );

	}

	_input() {

		const inp = this.app.input;
		const can = !! inp && this._canAct();
		const lmb = can && !! inp.mouseDown;
		const lDown = lmb && ! this._lmb;
		this._lmb = lmb;
		this.aiming = !! ( can && this.drawn && this.phase !== 'reloading' && inp.rightDown );
		if ( ! can ) return;
		if ( this.keyOk && inp.hit && inp.hit( 'KeyG' ) ) this.cycle();
		if ( ! this.drawn ) return;
		if ( inp.hit && inp.hit( 'KeyR' ) ) this.reload();
		if ( lDown ) this.fire();

	}

	// the musket shouldered: the walk is a little slower (the part of this frame's step past the factor is taken back)
	_pace( w ) {

		const p = this.app.player;
		if ( ! p || ! p.position ) return;
		const q = p.position;
		const prev = this._prev;
		if ( prev && this.drawn && w && w.walk < 1 && p.mode === 'walk' && p.grounded !== false && ! ( p.launched > 0 ) ) {

			const dx = q.x - prev.x, dz = q.z - prev.z;
			if ( dx * dx + dz * dz < 1 ) {

				q.x -= dx * ( 1 - w.walk );
				q.z -= dz * ( 1 - w.walk );

			}

		}

		this._prev = { x: q.x, y: q.y, z: q.z };

	}

	// RMB: a 1.3x zoom through the camera's fov, eased; the camera feel's own kicks stay on top; restored on release
	_zoom( dt, w ) {

		const cam = this.app.camera;
		const want = this.aiming && w ? 1 : 0;
		this.aimK += ( want - this.aimK ) * ( 1 - Math.exp( - dt * AIM.ease ) );
		if ( Math.abs( this.aimK - want ) < 0.002 ) this.aimK = want;
		if ( ! cam || ! Number.isFinite( cam.fov ) || typeof cam.updateProjectionMatrix !== 'function' ) return;
		const cf = this.app.cameraFeel, ui = this.app.ui;
		const kick = cf && Number.isFinite( cf.fovKick ) ? cf.fovKick : 0;
		const slider = ui && ui.s && Number.isFinite( ui.s.fov ) ? ui.s.fov : null;
		if ( this.aimK > 0 ) {

			if ( this._fovBase === null ) this._fovBase = slider ?? ( cf && cf.baseFov ? cf.baseFov() : cam.fov - kick );
			const base = slider ?? this._fovBase;
			const zoom = 1 + ( ( w ? w.zoom : 1.3 ) - 1 ) * this.aimK;
			cam.fov = base / zoom + kick;
			cam.updateProjectionMatrix();

		} else if ( this._fovBase !== null ) {

			cam.fov = ( slider ?? this._fovBase ) + kick;
			cam.updateProjectionMatrix();
			this._fovBase = null;

		}

	}

	_placeMesh() {

		if ( ! this.mesh ) return;
		const av = this.app.avatar;
		let anchor = null;
		if ( av && av.visible !== false && av.handMatrix ) {

			if ( ! this._handM ) this._handM = new Matrix4();
			try { anchor = av.handMatrix( this._handM ); } catch ( e ) { anchor = null; }

		}

		this.mesh.update( { kind: this.sel, visible: this.drawn, anchor, camera: this.app.camera, recoil: this.recoil } );

	}

	// ---- save

	toJSON() {

		return { v: 1, owned: ORDER.filter( ( id ) => this.owned[ id ] ), loaded: ORDER.filter( ( id ) => this.loaded[ id ] ), shots: this.shots, sel: this.sel };

	}

	fromJSON( d ) {

		if ( ! d || typeof d !== 'object' ) return;
		const ids = ( list ) => new Set( Array.isArray( list ) ? list.filter( ( id ) => WEAPONS[ id ] ) : [] );
		const own = ids( d.owned ), ld = ids( d.loaded );
		for ( const id of ORDER ) {

			this.owned[ id ] = own.has( id );
			this.loaded[ id ] = own.has( id ) && ld.has( id );

		}

		this.shots = Number.isFinite( d.shots ) ? clamp( Math.floor( d.shots ), 0, POUCH.max ) : 0;
		this.sel = WEAPONS[ d.sel ] && this.owned[ d.sel ] ? d.sel : ORDER.find( ( id ) => this.owned[ id ] ) || null;
		this.holster( true );

	}

	reset() {

		this.holster( true );
		for ( const id of ORDER ) { this.owned[ id ] = false; this.loaded[ id ] = false; }
		this.shots = 0;
		this.sel = null;
		this.aimK = 0;
		this.recoil = 0;
		this.after = 0;
		this._tips = {};
		this.stats = { fired: 0, hits: 0, heads: 0, kills: 0, refused: 0 };

	}

	dispose() {

		this.holster( true );
		this.aimK = 0;
		this._zoom( 1, null );
		if ( this.mesh ) this.mesh.dispose();
		this.mesh = null;
		for ( const off of this._offs ) if ( typeof off === 'function' ) off();
		this._offs.length = 0;

	}

}
