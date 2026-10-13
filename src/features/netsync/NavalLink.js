// Naval combat for everybody: the room's host simulates the AI ships and sends them at 5 Hz, the others render them as
// puppets; cannon shots are broadcast as effects, damage dealt to a ship is reported to the host which applies it.
//
//   const link = new NavalLink( sync );  link.update( dt );   // NetSync calls it every frame
//   link.role              'solo' (offline) | 'host' | 'puppet'
//   link.stats             { worldsOut, worldsIn, shotsOut, shotsIn, hitsOut, hitsIn }
//
// The naval feature (src/features/naval, another owner) can offer this API, and NavalLink uses whatever of it exists:
//
//   naval.setNetRole( 'solo' | 'host' | 'puppet' )  host: simulates and is `active` even in multiplayer mode; puppet: no
//                                                   spawning, brains or AI fire, ships only follow applyRemoteShips; leaving
//                                                   puppet clears the puppet ships
//   naval.netHooks = { onShot( from, vel, info ), onShipHit( ship, damage, part ) -> bool }   assigned by NavalLink;
//                                                   onShot after every ball leaves a muzzle ( info: { owner, damage, big } );
//                                                   onShipHit before a hit is applied: true = consumed (puppet: reported instead)
//   naval.snapshotShips() -> [ { id, k, n, x, z, y, s, hp, mx, st, r } ]        optional
//   naval.applyRemoteShips( list, at )                                         puppet
//   naval.remoteShot( from, dir, speed, info )                                 a visual ball ( info.damage > 0: it may hurt the local boat )
//   naval.applyRemoteHit( shipId, damage, part, fromId ) -> { found, sunk }    host
//   naval.adoptShips( list )                                                   host of a universe: take over the stored ships
//                                                                              (the last simulator left, or the server restarted)
//
// In a universe (net.universe) the host also sends while alone (1 Hz) so the server can keep the pirates across restarts;
// a 'world' with adopt: true hands the new host the stored ships (adoptShips, else the missing ones are spawned).
//
// Without those functions NavalLink falls back on the naval feature's current internals (_launch, _shipHit, _manage,
// _spawnBounty, world.fire, `active`, spawn, balls, fx, audio) with instance-level overrides that it removes again when the
// role goes back to 'solo'. If the internals are not there the link simply does nothing.
//
// Wave 11: naval.netRole mirrors the role. A shot carries its side and crew gunner (fx sd / c: the server's FireGate keys a
// volley per side; a remote crew gunner gestures on the shooter's deck, CrewLink). On a puppet the hull collisions against the
// host's ships are prediction only (pushed clear, no local impulse or damage): the host resolves them (HullLink 'bump').

import { WORLD_HZ } from '../../net/Protocol.js';

const SEND_EVERY = 1 / WORLD_HZ;
const HIT_REACH = 480; // m between the reporting guest's boat and the ship it claims to have hit
const PUPPET_STATES = new Set( [ 'sail', 'dock', 'flee', 'patrol', 'chase', 'broadside' ] );

const wrapPi = ( a ) => ( ( a + Math.PI ) % ( 2 * Math.PI ) + 2 * Math.PI ) % ( 2 * Math.PI ) - Math.PI;

export class NavalLink {

	constructor( sync ) {

		this.sync = sync;
		this.role = 'solo';
		this.stats = { worldsOut: 0, worldsIn: 0, shotsOut: 0, shotsIn: 0, hitsOut: 0, hitsIn: 0 };
		this._acc = 0;
		this._orig = null;
		this._naval = null;
		this._offs = [];
		this._adopt = null; // a universe's stored ships waiting for the host role

	}

	get naval() {

		const f = this.sync.features;
		return f && f.get ? f.get( 'naval' ) : null;

	}

	get net() {

		return this.sync.net;

	}

	// the net client changed (a new connection): listen on it
	bind( net ) {

		for ( const off of this._offs ) off();
		this._offs.length = 0;
		this._acc = 0;
		this._adopt = null;
		if ( ! net ) return;
		this._offs.push( net.on( 'world', ( m ) => this.onWorld( m ) ) );
		this._offs.push( net.on( 'fx', ( m ) => this.onFx( m ) ) );
		this._offs.push( net.on( 'hit', ( m ) => this.onHit( m ) ) );

	}

	update( dt ) {

		const n = this.naval, net = this.net;
		if ( n !== this._naval ) {

			this._unpatch( this._naval );
			this._naval = n;
			this.role = 'solo';

		}

		if ( ! n ) return;
		const role = net && net.online ? ( net.isHost ? 'host' : 'puppet' ) : 'solo';
		if ( role !== this.role ) this.setRole( role );
		if ( role === 'host' && this._adopt ) {

			const list = this._adopt;
			this._adopt = null;
			this._adoptShips( n, list );

		}

		if ( role !== 'host' ) return;
		const alone = ! net.peers.size;
		if ( alone && ! net.universe ) return;
		this._acc += dt;
		if ( this._acc >= ( alone ? 1 : SEND_EVERY ) ) {

			this._acc = 0;
			this.sendWorld();

		}

	}

	setRole( role ) {

		const n = this.naval, prev = this.role;
		this.role = role;
		if ( ! n ) return;
		n.netHooks = role === 'solo' ? null : this._hooks();
		n.netRole = role;
		if ( typeof n.setNetRole === 'function' ) {

			n.setNetRole( role );
			return;

		}

		// fallback on the internals
		this._unpatch( n );
		if ( role === 'solo' ) {

			if ( prev === 'puppet' ) this._clearShips( n );
			return;

		}

		this._patchCommon( n );
		if ( role === 'puppet' ) {

			this._clearShips( n ); // the local AI ships make way for the host's
			this._patchPuppet( n );

		} else if ( prev === 'puppet' ) this._clearShips( n ); // promoted: the host's own sim starts afresh

	}

	_hooks() {

		return {
			onShot: ( from, vel, info ) => this.onLocalShot( from, vel, info ),
			onShipHit: ( ship, damage, part ) => this.onLocalShipHit( ship, damage, part ),
		};

	}

	// ------------------------------------------------------------------ host: out

	snapshot() {

		const n = this.naval;
		if ( ! n ) return [];
		if ( typeof n.snapshotShips === 'function' ) return n.snapshotShips();
		const out = [];
		for ( const s of n.ships || [] ) {

			if ( s.state === 'gone' || out.length >= 12 ) continue;
			out.push( { id: s.id, k: s.kind, n: s.name, x: s.x, z: s.z, y: s.yaw, s: s.speed, hp: s.hp, mx: s.maxHp, st: s.state, r: s.rigging } );

		}

		return out;

	}

	sendWorld() {

		const net = this.net;
		if ( ! net || ! net.isHost ) return false;
		if ( net.sendWorld( this.snapshot() ) ) {

			this.stats.worldsOut ++;
			return true;

		}

		return false;

	}

	// a ball left a muzzle on this machine (hooked _launch or naval.netHooks.onShot)
	onLocalShot( from, vel, info = {} ) {

		const net = this.net;
		if ( ! net || ! net.online || this.role === 'solo' ) return;
		const v = Math.hypot( vel.x, vel.y, vel.z );
		if ( ! ( v > 1 ) ) return;
		const owner = info.owner === 'player' || ! info.owner ? 'player' : String( info.owner );
		const crew = typeof info.crew === 'string' ? info.crew : info.crew && typeof info.crew.id === 'string' ? info.crew.id : null;
		const fx = {
			kind: 'shot', from: [ from.x, from.y, from.z ], dir: [ vel.x / v, vel.y / v, vel.z / v ], v,
			d: owner === 'player' ? 0 : Math.min( info.damage || 0, 60 ), o: owner, big: !! info.big,
			sd: info.side === 'port' || info.side === 'starboard' ? info.side : '',
		};
		if ( crew ) fx.c = crew;
		net.sendFx( fx );
		this.stats.shotsOut ++;

	}

	// ------------------------------------------------------------------ guest: out

	// a ball of this player hit a puppet ship: report it instead of applying it. true when handled here.
	onLocalShipHit( ship, damage, part ) {

		const net = this.net;
		if ( this.role !== 'puppet' || ! net || ! net.online || ! ship ) return false;
		if ( ! ( damage > 0 ) ) return true; // a visual ball
		net.sendHit( { ship: ship.id, dmg: damage, part } );
		this.stats.hitsOut ++;
		return true;

	}

	// ------------------------------------------------------------------ in

	onWorld( m ) {

		if ( m && m.adopt && Array.isArray( m.ships ) && this.net && m.host === this.net.id ) {

			// the universe's stored ships for the new simulator (applied once the role is 'host', in update)
			this._adopt = m.ships;
			return;

		}

		if ( this.role !== 'puppet' || ! m || ! Array.isArray( m.ships ) ) return;
		const n = this.naval;
		if ( ! n ) return;
		this.stats.worldsIn ++;
		if ( typeof n.applyRemoteShips === 'function' ) n.applyRemoteShips( m.ships, m.at );
		else this._applyShips( n, m.ships );

	}

	onFx( m ) {

		const n = this.naval, net = this.net;
		if ( ! n || ! m || m.id === ( net && net.id ) || this.role === 'solo' ) return;
		if ( m.kind === 'shot' && Array.isArray( m.from ) && Array.isArray( m.dir ) ) {

			this.stats.shotsIn ++;
			const info = { owner: 'remote:' + m.id, shooter: m.o, damage: m.d || 0, big: !! m.big, faction: m.o === 'player' ? 'player' : 'pirate' };
			if ( typeof n.remoteShot === 'function' ) n.remoteShot( m.from, m.dir, m.v, info );
			else this._remoteShot( n, m, info );
			if ( m.c && this.sync.crew ) this.sync.crew.fired( m.id, m.c );

		} else if ( m.kind === 'sink' && net && m.by === net.id ) {

			// the host says our guns sank it: the credit is ours (quests, bounties, the pirate count)
			const s = ( n.ships || [] ).find( ( x ) => x.id === m.ship );
			const f = this.sync.features;
			if ( s && f && f.emit ) {

				f.emit( 'shipSunk', { id: s.id, name: s.name, faction: s.faction, x: s.x, z: s.z, byPlayer: true, kind: s.kind, loot: 0 } );
				if ( s.faction === 'pirate' ) f.emit( 'enemyDefeated', { id: s.id, name: s.captain || s.name, kind: 'pirate' } );

			}

		}

	}

	// host: a guest reports damage to one of the ships
	onHit( m ) {

		const n = this.naval, net = this.net;
		if ( this.role !== 'host' || ! n || ! net || ! m || typeof m.ship !== 'string' ) return;
		const dmg = Math.min( Math.max( +m.dmg || 0, 0 ), 60 );
		if ( ! ( dmg > 0 ) ) return;
		// the claim must be plausible: the guest's boat is somewhere near the ship
		const rp = this.sync.app.remotePlayers, peer = rp && rp.peers ? rp.peers.get( m.from ) : null;
		const ship = ( n.ships || [] ).find( ( s ) => s.id === m.ship );
		if ( ! ship ) return;
		if ( peer && peer.boat && Math.hypot( peer.boatPos.x - ship.x, peer.boatPos.z - ship.z ) > HIT_REACH ) return;
		this.stats.hitsIn ++;
		let r = null;
		if ( typeof n.applyRemoteHit === 'function' ) r = n.applyRemoteHit( m.ship, dmg, m.part === 'rigging' ? 'rigging' : 'hull', m.from );
		else if ( ship.alive ) {

			const sunk = ship.damage( dmg, { part: m.part === 'rigging' ? 'rigging' : 'hull', by: 'player' } );
			if ( n.fx ) n.fx.hit( ship.x, ( ship.pose ? ship.pose.y : 0 ) + 1, ship.z );
			if ( n.audio ) n.audio.impact( ship.x, 2, ship.z, 0.9 );
			if ( sunk && n._onSunk ) n._onSunk( ship, false );
			r = { found: true, sunk };

		}

		if ( r && r.sunk ) net.sendFx( { kind: 'sink', ship: ship.id, by: m.from, x: ship.x, z: ship.z } );

	}

	// ------------------------------------------------------------------ fallback on the naval internals

	_patchCommon( n ) {

		if ( n.__netPatched ) return;
		n.__netPatched = true;
		const link = this;
		Object.defineProperty( n, 'active', { get: () => n.enabled, configurable: true } );
		const orig = n._launch;
		if ( typeof orig === 'function' ) {

			n._launch = function ( m, dir, sigma, o ) {

				const ball = orig.call( this, m, dir, sigma, o );
				try {

					if ( ball ) link.onLocalShot( m, { x: ball.vx, y: ball.vy, z: ball.vz }, { owner: o.owner, damage: o.damage, big: o.big, side: o.side, crew: o.crew } );

				} catch ( e ) { /* never break the shot */ }

				return ball;

			};

		}

	}

	_patchPuppet( n ) {

		const link = this;
		this._orig = { fire: n.world ? n.world.fire : null, escape: n.world ? n.world.escape : null };
		n._manage = () => {};
		n._spawnBounty = () => null;
		if ( n.world ) {

			n.world.fire = () => false;
			n.world.escape = () => {};

		}

		// the host's ships are the host's to shove: our hull is only pushed clear of a puppet (prediction), and the impulse and
		// the damage of the blow come back from the host (HullLink 'bump'), so they are not applied twice
		if ( typeof n._collide === 'function' && n.collisions && typeof n._bodies === 'function' && typeof n._onContact === 'function' ) {

			n._collide = function () {

				const pb = typeof this._playerBody === 'function' ? this._playerBody() : null;
				const imp = pb ? pb.impulse : null;
				if ( pb ) pb.impulse = () => {};
				try {

					this.contacts = this.collisions.step( this.time, this._bodies() );

				} finally {

					if ( pb ) pb.impulse = imp;

				}

				for ( const c of this.contacts ) {

					if ( ( c.a.ship && c.a.ship.puppet ) || ( c.b.ship && c.b.ship.puppet ) ) c.damage = null;
					this._onContact( c );

				}

			};

		}

		const origHit = n._shipHit;
		n._shipHit = function ( ball, ship, part, pt ) {

			// our own ball on a puppet: tell the host, show the hit; a visual ball (damage 0) only shows it
			if ( ball.owner === 'player' && link.onLocalShipHit( ship, ball.damage * ( this._falloff ? this._falloff( ball ) : 1 ), part ) ) {

				this.fx.hit( pt.x, pt.y, pt.z );
				this.audio.impact( pt.x, pt.y, pt.z, 0.9 );
				this.stats.hits ++;
				if ( this.hud ) this.hud.hitMarker( 'hit' );
				return;

			}

			if ( ball.damage > 0 || ! ship.puppet ) return origHit.call( this, ball, ship, part, pt );
			this.fx.hit( pt.x, pt.y, pt.z );
			this.audio.impact( pt.x, pt.y, pt.z, 0.6 );

		};

	}

	_unpatch( n ) {

		if ( ! n || ! n.__netPatched ) return;
		delete n.__netPatched;
		delete n.active;
		delete n._launch;
		delete n._manage;
		delete n._spawnBounty;
		delete n._shipHit;
		delete n._collide;
		if ( n.world && this._orig ) {

			if ( this._orig.fire ) n.world.fire = this._orig.fire;
			if ( this._orig.escape ) n.world.escape = this._orig.escape;

		}

		this._orig = null;

	}

	// every ship goes: entering the host's world drops the local ones, leaving it drops the puppets (the new sim restarts)
	_clearShips( n ) {

		if ( typeof n._removeShip !== 'function' ) return;
		for ( let i = n.ships.length - 1; i >= 0; i -- ) n._removeShip( i );
		if ( n.shots ) n.shots.length = 0;
		if ( n.balls && n.balls.clear ) n.balls.clear();

	}

	// puppet ships follow the host's list (create the new, dead-reckon the known, let the absent go)
	// host: the stored ships join the local simulation (only the ones it does not run already)
	_adoptShips( n, list ) {

		if ( typeof n.adoptShips === 'function' ) {

			try { n.adoptShips( list ); } catch ( e ) { console.warn( 'NavalLink: adoptShips threw', e ); }
			return;

		}

		if ( ! n.ships || typeof n.spawn !== 'function' ) return;
		for ( const w of list ) {

			if ( ! w || w.st === 'sinking' || w.st === 'gone' || n.ships.some( ( x ) => x.id === w.id ) ) continue;
			try {

				const s = n.spawn( w.k, { id: w.id, name: w.n || undefined, x: w.x, z: w.z, yaw: w.y, speed: w.s, hp: w.hp } );
				if ( s ) {

					if ( Number.isFinite( w.mx ) ) s.maxHp = w.mx;
					if ( Number.isFinite( w.hp ) ) s.hp = w.hp;
					if ( Number.isFinite( w.r ) ) s.rigging = w.r;

				}

			} catch ( e ) { /* a class this build does not have */ }

		}

	}

	_applyShips( n, list ) {

		if ( ! n.ships || typeof n.spawn !== 'function' ) return;
		const seen = new Set();
		const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
		for ( const w of list ) {

			seen.add( w.id );
			let s = n.ships.find( ( x ) => x.id === w.id );
			if ( ! s ) {

				if ( w.st === 'sinking' || w.st === 'gone' ) continue; // do not raise the dead
				try {

					s = n.spawn( w.k, { id: w.id, name: w.n || undefined, x: w.x, z: w.z, yaw: w.y, speed: w.s, hp: w.hp } );

				} catch ( e ) {

					continue; // a class this build does not have

				}

				this._makePuppet( s );

			}

			if ( ! s.puppet ) continue;
			s.maxHp = w.mx;
			s.hp = w.hp;
			s.rigging = w.r === undefined ? 1 : w.r;
			s.net = { x: w.x, z: w.z, yaw: w.y, speed: w.s, at: now };
			if ( w.st === 'sinking' ) {

				if ( s.state !== 'sinking' && s.state !== 'gone' ) s.startSinking();

			} else if ( PUPPET_STATES.has( w.st ) && s.state !== 'sinking' && s.state !== 'gone' && s.state !== w.st ) s.setState( w.st );

		}

		// ships the host no longer lists are over: sinking ones finish on their own, the rest are removed
		for ( const s of n.ships ) if ( s.puppet && ! seen.has( s.id ) && s.state !== 'sinking' ) s.state = 'gone';

	}

	_makePuppet( s ) {

		s.puppet = true;
		s.fleeAt = - 1;
		const proto = Object.getPrototypeOf( s );
		s.integrate = function ( dt, terrain ) {

			if ( this.state === 'sinking' ) return proto.integrate.call( this, dt, null );
			if ( this.state === 'gone' ) return;
			this.stateTime += dt;
			this.hitT += dt;
			const t = this.net;
			if ( ! t ) return;
			const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
			const age = Math.min( 0.8, Math.max( 0, ( now - t.at ) / 1000 ) );
			const px = t.x + Math.sin( t.yaw ) * t.speed * age, pz = t.z + Math.cos( t.yaw ) * t.speed * age;
			const k = 1 - Math.exp( - dt * 8 );
			this.x += ( px - this.x ) * k;
			this.z += ( pz - this.z ) * k;
			const dy = wrapPi( t.yaw - this.yaw );
			this.yaw = wrapPi( this.yaw + dy * k );
			this.yawRate = Math.max( - 0.4, Math.min( 0.4, dy * 3 ) );
			this.speed = t.speed;
			this.want = t.yaw;

		};

	}

	// a ball from somebody else's cannon, drawn here (and only able to hurt this boat when the shooter was a ship)
	_remoteShot( n, m, info ) {

		if ( ! n.balls || typeof n.balls.spawn !== 'function' ) return;
		const [ x, y, z ] = m.from, [ dx, dy, dz ] = m.dir, v = m.v || 120;
		n.balls.spawn( { x, y, z, vx: dx * v, vy: dy * v, vz: dz * v, damage: info.damage, owner: info.owner, faction: info.faction, level: 1 } );
		if ( n.fx && n.fx.muzzle ) n.fx.muzzle( x, y, z, dx, dy, dz, info.big );
		if ( n.audio && n.audio.cannon ) n.audio.cannon( x, y, z, 0.8 );

	}

	dispose() {

		for ( const off of this._offs ) off();
		this._offs.length = 0;
		this._unpatch( this._naval );
		if ( this._naval ) this._naval.netHooks = null;
		this._naval = null;

	}

}
