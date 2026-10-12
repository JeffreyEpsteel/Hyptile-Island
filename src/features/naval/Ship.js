// One AI vessel: identity, kinematic sailing, hull damage and the sinking animation. No rendering here
// (Models.js dresses a Ship with a GLB) and no decisions (Brains.js sets `want` / `wantSpeed`).
//
//   const ship = new Ship( 'sloop', { id, name, captain, x, z, yaw, rng } );
//   ship.want = heading (rad; forward = ( sin yaw, cos yaw ) in x / z), ship.wantSpeed = 0..1 of the class speed
//   ship.integrate( dt, terrain )     turn rate and way limited, steers round shoals ( terrain.heightAt( x, z ) )
//   ship.damage( amount, { part: 'hull' | 'rigging', by } ) -> true when this hit sank her
//   ship.finalPose( out )             y (water + heave), pitch (bow up +), roll (port up +), with turn heel,
//                                     list and the sinking roll / sink folded in
//
// Frame: the boat frame (+Z forward, +X port, yaw about +Y: positive yaw turns to port).
// States: merchants 'sail' | 'dock' | 'flee'; pirates 'patrol' | 'chase' | 'broadside' | 'flee';
// all: 'sinking' (SINK_TIME seconds) then 'gone' (the manager despawns her).

import { SHIP_CLASSES } from './ShipClasses.js';
import { clamp, wrap, angleDiff, smooth, DEG } from './util.js';
import { yawBox } from './Ballistics.js';

export const SINK_TIME = 8;

// The going-down pose at u = 0..1 of SINK_TIME: roll toward listSign (+1 port up... the side she lists to), the bow
// dipping, and the drop below the water line for a hull `depth` metres deep (draft + sheer + a margin). Shared by the
// AI ships (finalPose) and the player's own boat (Naval's sinking sequence).
export function sinkPose( u, listSign, depth, out = {} ) {

	u = clamp( u, 0, 1 );
	out.roll = listSign * ( 0.12 + 1.0 * smooth( 0, 0.85, u ) );
	out.pitch = - 0.14 * smooth( 0.15, 1, u );
	out.dy = - depth * Math.pow( u, 1.8 );
	return out;

}

export class Ship {

	constructor( kind, o = {} ) {

		const cls = SHIP_CLASSES[ kind ];
		if ( ! cls ) throw new Error( 'unknown ship class ' + kind );
		this.cls = cls;
		this.kind = kind;
		this.faction = o.faction || cls.faction;
		this.id = o.id || kind + '-' + Math.floor( Math.random() * 1e6 );
		this.name = o.name || cls.label;
		this.captain = o.captain || null;

		this.x = o.x ?? 0;
		this.z = o.z ?? 0;
		this.yaw = o.yaw ?? 0;
		this.speed = o.speed ?? 0;
		this.yawRate = 0;
		this.want = this.yaw;
		this.wantSpeed = 0;

		this.maxHp = cls.hp;
		this.hp = o.hp ?? cls.hp;
		this.rigging = 1; // 1 intact .. 0.2 shot to rags (speed)
		this.state = o.state || ( this.faction === 'pirate' ? 'patrol' : 'sail' );
		this.stateTime = 0;
		this.sinkT = 0;
		this.listSign = 1;
		this.reload = { port: 0, starboard: 0 };
		this.lastHitBy = null;
		this.hitT = 99; // s since she was last hit
		this.alertT = 0; // >0: hit by the player lately (a pirate then hunts from farther)
		this.grounded = 0;
		this.cursor = null; // route cursor (Routes.makeCursor)
		this.mem = {}; // brain scratch

		// steering round shoals
		this.avoidMargin = 1.2; // m of water kept under the keel
		this.avoidLook = 90; // m
		this.avoidOffset = 0;
		this._avoidT = 0;

		// visual pose: smoothed water pose + extras (set by the water pool, read by the visual)
		this.pose = { y: 0, pitch: 0, roll: 0, ty: 0, tpitch: 0, troll: 0, heel: 0 };
		this.poolGroup = - 1; // WaterPool slot group
		this.near = false; // the manager sets this: close enough to be drawn in detail
		this.visual = null;
		this.escaped = false;

	}

	get alive() {

		return this.state !== 'sinking' && this.state !== 'gone';

	}

	get hpFraction() {

		return this.hp / this.maxHp;

	}

	// 'sound' | 'damaged' | 'critical' | 'sinking'
	get condition() {

		if ( ! this.alive ) return 'sinking';
		const f = this.hpFraction;
		return f > 0.66 ? 'sound' : f > 0.33 ? 'damaged' : 'critical';

	}

	setState( s ) {

		if ( this.state === s ) return;
		this.state = s;
		this.stateTime = 0;

	}

	forward( out = {} ) {

		out.x = Math.sin( this.yaw );
		out.z = Math.cos( this.yaw );
		return out;

	}

	// ship-frame point (x port, y up from the waterline, z forward) to world (yaw only: the muzzle / sample
	// points do not need the pitch and roll of the hull)
	toWorld( lx, ly, lz, out = {} ) {

		const s = Math.sin( this.yaw ), c = Math.cos( this.yaw );
		out.x = this.x + lx * c + lz * s;
		out.z = this.z - lx * s + lz * c;
		out.y = this.pose.y + ly;
		return out;

	}

	// world velocity of the hull
	velocity( out = {} ) {

		out.x = Math.sin( this.yaw ) * this.speed;
		out.y = 0;
		out.z = Math.cos( this.yaw ) * this.speed;
		return out;

	}

	// the guns of one broadside ( side 'port' | 'starboard' ) in world space, with the deck-relative station
	gunStations( side ) {

		return this.cls.stations.filter( ( s ) => s.side === side );

	}

	// the points whose water heights give heave, pitch and roll: bow, stern, port, starboard
	samplePoints( out ) {

		const L = this.cls.length * 0.36, B = this.cls.beam * 0.42;
		this.toWorld( 0, 0, L, out[ 0 ] );
		this.toWorld( 0, 0, - L, out[ 1 ] );
		this.toWorld( B, 0, 0, out[ 2 ] );
		this.toWorld( - B, 0, 0, out[ 3 ] );
		return out;

	}

	// hit volumes (yaw-only boxes in world space): the hull from keel to the bulwark, and the rigging above it
	hullBox() {

		const c = this.cls;
		const top = c.sheer + 0.5, bottom = - c.draft;
		return yawBox( this.x, this.pose.y + ( top + bottom ) / 2, this.z, this.yaw, c.beam / 2, ( top - bottom ) / 2, c.length / 2 * 0.97 );

	}

	riggingBox() {

		const c = this.cls;
		const bottom = c.sheer + 0.5, top = c.mast;
		return yawBox( this.x, this.pose.y + ( top + bottom ) / 2, this.z, this.yaw, c.beam * 0.28, ( top - bottom ) / 2, c.length * 0.4 );

	}

	// Apply damage. part 'rigging' mostly cuts her speed. Returns true when this hit sank her.
	damage( amount, { part = 'hull', by = null } = {} ) {

		if ( ! this.alive || ! ( amount > 0 ) ) return false;
		if ( part === 'rigging' ) {

			this.rigging = Math.max( 0.2, this.rigging - 0.12 );
			amount *= 0.3;

		}

		this.hp = Math.max( 0, this.hp - amount );
		this.lastHitBy = by;
		this.hitT = 0;
		if ( by === 'player' ) this.alertT = 45;
		if ( this.hp <= 0 ) {

			this.startSinking();
			return true;

		}

		return false;

	}

	startSinking() {

		this.hp = 0;
		this.state = 'sinking';
		this.stateTime = 0;
		this.sinkT = 0;
		this.wantSpeed = 0;
		this.listSign = this.yawRate > 0 ? - 1 : 1; // she rolls away from her turn, else to port
		if ( Math.abs( this.yawRate ) < 0.02 ) this.listSign = ( Math.round( this.x + this.z ) & 1 ) ? 1 : - 1;

	}

	// advance the kinematics: turn toward `want`, speed toward `wantSpeed`, move (and stay off the ground)
	integrate( dt, terrain ) {

		const c = this.cls;
		this.stateTime += dt;
		this.hitT += dt;
		if ( this.alertT > 0 ) this.alertT -= dt;
		if ( this.reload.port > 0 ) this.reload.port -= dt;
		if ( this.reload.starboard > 0 ) this.reload.starboard -= dt;

		if ( this.state === 'sinking' ) {

			this.sinkT += dt;
			this.speed *= Math.exp( - dt * 0.6 );
			this.yawRate *= Math.exp( - dt * 1.0 );
			this._move( dt, terrain, true );
			if ( this.sinkT >= SINK_TIME ) this.state = 'gone';
			return;

		}

		if ( this.state === 'gone' ) return;

		const want = this.steerClear( dt, terrain, this.want );
		const err = angleDiff( want, this.yaw );
		const way = clamp( this.speed / c.speed, 0, 1 );
		const maxRate = c.turn * ( 0.4 + 0.6 * way );
		const cmd = clamp( err * 1.2, - maxRate, maxRate );
		this.yawRate += ( cmd - this.yawRate ) * ( 1 - Math.exp( - dt * 1.8 ) );
		this.yaw = wrap( this.yaw + this.yawRate * dt );

		// way: a hard turn costs speed, torn rigging and a shot-up hull slow her
		const turnLoss = 1 - 0.3 * clamp( Math.abs( this.yawRate ) / c.turn, 0, 1 );
		const rig = 0.45 + 0.55 * this.rigging;
		const hull = 0.8 + 0.2 * smooth( 0, 0.4, this.hpFraction );
		const target = clamp( this.wantSpeed, 0, 1 ) * c.speed * turnLoss * rig * hull;
		const a = target > this.speed ? c.accel : c.decel;
		this.speed += clamp( target - this.speed, - a * dt, a * dt );

		this._move( dt, terrain, false );

	}

	_move( dt, terrain, sinking ) {

		const nx = this.x + Math.sin( this.yaw ) * this.speed * dt;
		const nz = this.z + Math.cos( this.yaw ) * this.speed * dt;
		if ( terrain && ! sinking && terrain.heightAt( nx, nz ) > - ( this.cls.draft + 0.3 ) ) {

			// aground (a hard stop; the steering normally keeps her off the shoals long before)
			this.speed *= Math.exp( - dt * 4 );
			this.grounded += dt;
			return;

		}

		this.grounded = 0;
		this.x = nx;
		this.z = nz;

	}

	// Pick a heading near `want` whose water ahead is deep enough (a coarse look-ahead every 0.25 s).
	steerClear( dt, terrain, want ) {

		if ( ! terrain ) return want;
		this._avoidT -= dt;
		if ( this._avoidT <= 0 ) {

			this._avoidT = 0.25;
			this.avoidOffset = this._pickClear( terrain, want );

		}

		return wrap( want + this.avoidOffset );

	}

	_pickClear( terrain, want ) {

		const margin = this.cls.draft + this.avoidMargin;
		const look = clamp( 28 + this.speed * 7, 35, this.avoidLook );
		const clear = ( ang ) => {

			const sx = Math.sin( ang ), cz = Math.cos( ang );
			for ( const f of [ 0.34, 0.67, 1 ] ) if ( terrain.heightAt( this.x + sx * look * f, this.z + cz * look * f ) > - margin ) return false;
			return true;

		};

		if ( clear( want ) ) return 0;
		const pref = this.avoidOffset < 0 ? - 1 : 1;
		for ( let k = 1; k <= 8; k ++ ) {

			const off = k * 22.5 * DEG;
			if ( clear( want + pref * off ) ) return pref * off;
			if ( clear( want - pref * off ) ) return - pref * off;

		}

		return Math.PI;

	}

	// Smooth the water pose toward its targets and fold in the heel / list / sinking extras.
	// target heave / pitch / roll come from the water pool (or a procedural wave); tau seconds of smoothing.
	updatePose( dt, tau = 0.35 ) {

		const p = this.pose, k = 1 - Math.exp( - dt / tau );
		p.y += ( p.ty - p.y ) * k;
		p.pitch += ( p.tpitch - p.pitch ) * k;
		p.roll += ( p.troll - p.roll ) * k;
		// heel outward in a turn (port turn -> port side up)
		p.heel += ( clamp( this.yawRate * this.speed * 0.04, - 0.12, 0.12 ) - p.heel ) * ( 1 - Math.exp( - dt / 0.8 ) );

	}

	finalPose( out = {} ) {

		const p = this.pose, c = this.cls;
		out.y = p.y;
		out.pitch = p.pitch;
		out.roll = p.roll + p.heel;
		// a shot-up hull lists
		const f = this.hpFraction;
		if ( this.alive && f < 0.4 ) out.roll += this.listSign * 0.1 * ( 1 - f / 0.4 );
		if ( this.state === 'sinking' || this.state === 'gone' ) {

			const k = sinkPose( this.sinkT / SINK_TIME, this.listSign, c.draft + c.sheer + 2.5, this._sink || ( this._sink = {} ) );
			out.roll += k.roll;
			out.pitch += k.pitch;
			out.y += k.dy;

		}

		return out;

	}

}
