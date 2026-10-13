// Decisions of the AI vessels: plain state machines, no framework. A brain reads the world and sets
// ship.want (heading), ship.wantSpeed (0..1) and asks `w.fire( ship, side )` for broadsides; Ship.integrate
// does the sailing.
//
//   Pirates   patrol -> chase (the player's boat is a legal target within sight) -> broadside (inside the
//             engage range: circle with the target abeam at 60-120 m and fire each side as it bears) -> flee
//             (hull below fleeAt, runs straight away; gone beyond 650 m). They lose interest beyond `lose`
//             metres or when the target leaves the sea lanes (harbour / cove safe zones), and go back to patrol.
//   Merchants sail the lane to its end, lie at the anchorage 18-32 s, and sail back; hit by the player they run.
//
// The world object (rebuilt by the manager each frame):
//   { time, night, storm, target: { x, z, vx, vz, ok } | null, rng, terrain, fire( ship, side ) -> bool, escape( ship ) }
//
// Wave 4:
//   - the peaceful home waters (melee/Peace.js): a boat in them is never a target, and no pirate sails in - one inside heads
//     straight out, one at the edge turns along it instead of in (keepOut, every pirate state but the boarding ones)
//   - the broadside keeps its bearing: the ship matches the target's speed to stay abeam, and wears round to the loaded
//     side when the other battery is still reloading (at most every BROADSIDE.wear s)
//   - outgunned, she runs: losing OUTGUNNED.share of her hull inside OUTGUNNED.window s while below OUTGUNNED.below of it
//     sends her to 'flee' before her class's fleeAt (s.mem.outgunned = true)
//
// Wave 9 (hull collisions, Collisions.js):
//   - ramming: in a broadside, a pirate heavier than her target (RAM.heavier x its mass, target.mass) whose engaged battery
//     has more than RAM.reload s to go and whose other one can't be brought round (reloading, or she just wore) drives her
//     bow into him at full speed (s.mem.ram); she breaks off when a battery is nearly ready, the target opens out, or
//     after the blow (Naval sets s.mem.ramCool = RAM.cool). Crippled pirates (below the boarding threshold) never ram.
//   - merchants turn away (AVOID.turn rad for AVOID.hold s) from a hull Naval predicts they would hit within AVOID.horizon
//     s (s.mem.avoidT / s.mem.avoidDir)

//
// Wave 11A (ammunition, sections):
//   - a pirate's powder and shot are finite (ship.ammo); dry - or both gun sections silenced - she has nothing to shoot with:
//     heavier than her target she rams (again after every RAM.cool), else she runs (s.mem.dry); a dry pirate that can't ram
//     does not start a chase
//   - a silenced side (sections.gunsOk) counts as never loaded: she wears round to the other one
//   - where she lays her guns (s.mem.aim, read by Naval): the target's sails while he opens the range (running away: cut his
//     canvas), the hull while he closes or holds it (AIM_PREF.opening m/s of range rate, smoothed)

import { angleDiff, clamp, sideSign } from './util.js';
import { advance, nearestIndex } from './Routes.js';
import { inPeace, peaceExit, PEACE } from '../melee/Peace.js';

export const BROADSIDE = { wear: 14, reloadLead: 1.5 };
export const OUTGUNNED = { window: 20, share: 0.35, below: 0.65, sample: 2.5 };
export const KEEP_OUT = { look: 140 };
export const RAM = { heavier: 1.2, reload: 1.5, ready: 0.6, cool: 12, cripple: 0.25 };
export const AVOID = { horizon: 3, hold: 1.2, turn: 0.6 };
export const AIM_PREF = { opening: 0.4, smooth: 1.5 };
const FIGHTING = new Set( [ 'patrol', 'chase', 'broadside' ] );
const NO_STEER = new Set( [ 'close', 'grapple', 'boarding', 'boarded', 'adrift', 'moored', 'sinking', 'gone' ] );

const bearingTo = ( s, x, z ) => Math.atan2( x - s.x, z - s.z );

// follow the route cursor; returns 'end' when a ping-pong lane turned around
function follow( s, reach, speed ) {

	const cur = s.cursor;
	if ( ! cur ) return null;
	const p = cur.points[ cur.index ];
	const d = Math.hypot( p[ 0 ] - s.x, p[ 1 ] - s.z );
	if ( d < reach ) return advance( cur );
	s.want = bearingTo( s, p[ 0 ], p[ 1 ] );
	s.wantSpeed = typeof speed === 'function' ? speed( d ) : speed;
	return null;

}

function backToPatrol( s ) {

	s.setState( 'patrol' );
	if ( s.cursor ) s.cursor.index = nearestIndex( s.cursor.points, s.x, s.z );

}

// hull lost over the last OUTGUNNED.window s (sampled every OUTGUNNED.sample s into s.mem.hpLog)
export function hullLost( s, dt ) {

	const m = s.mem;
	m.hpT = ( m.hpT || 0 ) - dt;
	if ( ! m.hpLog ) m.hpLog = [];
	if ( m.hpT <= 0 ) {

		m.hpT = OUTGUNNED.sample;
		m.hpLog.push( s.hp );
		const keep = Math.ceil( OUTGUNNED.window / OUTGUNNED.sample ) + 1;
		if ( m.hpLog.length > keep ) m.hpLog.shift();

	}

	if ( ! m.hpLog.length ) return 0;
	let top = - Infinity; // (Math.max over the log without spreading it into arguments every frame)
	for ( let i = 0; i < m.hpLog.length; i ++ ) top = Math.max( top, m.hpLog[ i ] );
	return Math.max( 0, top - s.hp );

}

// no pirate sails into the home waters: inside, straight out; at the edge, along it rather than in
export function keepOut( s ) {

	if ( NO_STEER.has( s.state ) ) return false;
	if ( inPeace( s.x, s.z ) ) {

		s.want = peaceExit( s.x, s.z );
		s.wantSpeed = Math.max( s.wantSpeed || 0, 0.8 );
		return true;

	}

	const ax = s.x + Math.sin( s.want ) * KEEP_OUT.look, az = s.z + Math.cos( s.want ) * KEEP_OUT.look;
	if ( ! inPeace( ax, az ) && ! inPeace( s.x, s.z, PEACE.pad ) ) return false;
	const out = peaceExit( s.x, s.z ), rel = angleDiff( s.want, out );
	if ( Math.abs( rel ) > Math.PI / 2 - 0.15 ) {

		s.want = out + Math.sign( rel || 1 ) * ( Math.PI / 2 - 0.15 );
		return true;

	}

	return false;

}

// out of shot (her magazine dry) or both batteries silenced: nothing left to fire
export function gunless( s ) {

	if ( ! ( s.cls.guns > 0 ) ) return false;
	const dry = !! s.ammo && s.ammo.max > 0 && s.ammo.rounds <= 0;
	const silent = !! s.sections && ! s.sections.gunsOk( 'port' ) && ! s.sections.gunsOk( 'starboard' );
	return dry || silent;

}

const sideOk = ( s, side ) => ! s.sections || s.sections.gunsOk( side );

// sails while the target opens the range (running away), the hull otherwise
function aimPref( s, d, dt ) {

	const m = s.mem;
	if ( Number.isFinite( m.lastD ) && dt > 0 && Number.isFinite( d ) ) {

		const rr = ( d - m.lastD ) / dt, k = 1 - Math.exp( - dt / AIM_PREF.smooth );
		m.rangeRate = ( m.rangeRate || 0 ) + ( rr - ( m.rangeRate || 0 ) ) * k;

	}

	m.lastD = d;
	m.aim = ( m.rangeRate || 0 ) > AIM_PREF.opening ? 'sails' : 'hull';

}

export function thinkPirate( s, w, dt ) {

	const c = s.cls, t = w.target;
	let d = Infinity, bearing = 0;
	if ( t ) {

		d = Math.hypot( t.x - s.x, t.z - s.z );
		bearing = bearingTo( s, t.x, t.z );

	}

	// a boat in the home waters is not a target (whatever the harbour safe zone says)
	const aggro = !! ( t && t.ok ) && ! inPeace( t.x, t.z );
	let sight = c.sight * ( w.night ? 0.75 : 1 ) * ( w.storm ? 0.7 : 1 );
	if ( s.alertT > 0 ) sight = Math.max( sight, c.lose * 0.9 );
	s.avoidMargin = 1.2;
	s.avoidLook = 110;

	if ( s.state !== 'flee' && s.hpFraction <= ( s.fleeAt ?? c.fleeAt ) ) s.setState( 'flee' );
	// out of shot: she rams if she outweighs him, else she runs
	const dry = gunless( s );
	const canRam = !! t && ( c.mass || 0 ) > ( t.mass || Infinity ) * RAM.heavier && s.hpFraction >= RAM.cripple;
	s.mem.dry = dry;
	if ( dry && ! canRam && FIGHTING.has( s.state ) && s.state !== 'patrol' ) s.setState( 'flee' );
	if ( t ) aimPref( s, d, dt );
	// outgunned: shot to pieces fast and already hurt, she runs before her nerve would normally break
	const lost = hullLost( s, dt );
	if ( FIGHTING.has( s.state ) && s.hpFraction < OUTGUNNED.below && lost >= s.maxHp * OUTGUNNED.share ) {

		s.mem.outgunned = true;
		s.setState( 'flee' );

	}

	switch ( s.state ) {

		case 'patrol': {

			follow( s, 55, 0.6 );
			if ( aggro && d < sight && ( ! dry || canRam ) ) {

				s.setState( 'chase' );
				s.mem.lost = 0;

			}

			break;

		}

		case 'chase': {

			if ( ! aggro || d > c.lose ) {

				s.mem.lost = ( s.mem.lost || 0 ) + dt;
				if ( s.mem.lost > 4 ) {

					backToPatrol( s );
					break;

				}

			} else s.mem.lost = 0;

			if ( t ) {

				// head for where the target will be
				const lead = clamp( d / Math.max( s.speed, 3 ), 0, 6 ) * 0.7;
				s.want = Math.atan2( t.x + t.vx * lead - s.x, t.z + t.vz * lead - s.z );
				s.wantSpeed = 1;

			}

			if ( aggro && d < c.engage ) {

				s.setState( 'broadside' );
				s.mem.side = 0;

			}

			break;

		}

		case 'broadside': {

			if ( ! aggro || d > c.lose ) {

				s.mem.lost = ( s.mem.lost || 0 ) + dt;
				if ( s.mem.lost > 4 ) {

					backToPatrol( s );
					break;

				}

			} else s.mem.lost = 0;

			if ( d > c.engage * 1.3 ) {

				s.setState( 'chase' );
				break;

			}

			if ( ! t ) break;
			const rel = angleDiff( bearing, s.yaw ); // + : the target is on the port side
			if ( ! s.mem.side ) s.mem.side = rel >= 0 ? 1 : - 1;
			// the engaged battery is still reloading (or silenced) and the other is ready: wear round to bring it to bear
			s.mem.wearT = ( s.mem.wearT || 0 ) - dt;
			const engaged = s.mem.side > 0 ? 'port' : 'starboard', other = engaged === 'port' ? 'starboard' : 'port';
			if ( s.mem.wearT <= 0 && ( s.reload[ engaged ] > BROADSIDE.reloadLead || ! sideOk( s, engaged ) ) && s.reload[ other ] <= 0 && sideOk( s, other ) ) {

				s.mem.side = - s.mem.side;
				s.mem.wearT = BROADSIDE.wear;

			}

			// ramming: her guns are reloading and she outweighs him - put the bow into him instead of waiting
			s.mem.ramCool = Math.max( 0, ( s.mem.ramCool || 0 ) - dt );
			const eng = s.mem.side > 0 ? 'port' : 'starboard', oth = eng === 'port' ? 'starboard' : 'port';
			const reloading = s.reload[ eng ] > RAM.reload && ( s.reload[ oth ] > 0 || s.mem.wearT > 0 );
			if ( dry ) {

				// nothing to fire: the bow is her only weapon (between blows she keeps her distance abeam)
				if ( ! s.mem.ram && aggro && canRam && s.mem.ramCool <= 0 && d < c.engage * 1.2 ) s.mem.ram = true;
				else if ( s.mem.ram && ( ! aggro || d > c.engage * 1.3 ) ) s.mem.ram = false;

			} else if ( ! s.mem.ram && aggro && reloading && s.mem.ramCool <= 0 && ( c.mass || 0 ) > ( t.mass || Infinity ) * RAM.heavier
				&& d < c.engage && s.hpFraction >= RAM.cripple ) s.mem.ram = true;
			else if ( s.mem.ram && ( ! aggro || s.reload.port <= RAM.ready || s.reload.starboard <= RAM.ready || d > c.engage * 1.2 ) ) s.mem.ram = false;
			if ( s.mem.ram ) {

				const lead = clamp( d / Math.max( s.speed, 3 ), 0, 4 ) * 0.8;
				s.want = Math.atan2( t.x + ( t.vx || 0 ) * lead - s.x, t.z + ( t.vz || 0 ) * lead - s.z );
				s.wantSpeed = 1;
				break;

			}

			// keep the target abeam: heading = bearing -+ 90 deg, closed in / opened out to hold 60-120 m, at the target's
			// own speed so the bearing holds instead of her overrunning him
			const bias = clamp( ( d - 90 ) / 70, - 1, 1 );
			s.want = bearing - s.mem.side * ( Math.PI / 2 - bias * 0.75 );
			const tv = Math.hypot( t.vx || 0, t.vz || 0 );
			s.wantSpeed = clamp( 0.35 + ( tv / Math.max( 1, c.speed ) ) * 0.75 + Math.abs( bias ) * 0.2, d < 70 ? 0.4 : 0.5, 1 );

			if ( aggro ) {

				for ( const side of [ 'port', 'starboard' ] ) {

					if ( dry || s.reload[ side ] > 0 || ! sideOk( s, side ) || sideSign( side ) !== ( rel >= 0 ? 1 : - 1 ) ) continue;
					w.fire( s, side );

				}

			}

			break;

		}

		case 'flee': {

			s.wantSpeed = 1;
			if ( t ) {

				s.want = bearing + Math.PI;
				if ( d > 650 ) w.escape( s );

			} else follow( s, 55, 1 );
			if ( ! aggro && s.stateTime > 30 ) backToPatrol( s );
			break;

		}

		default:
			break;

	}

}

export function thinkMerchant( s, w, dt ) {

	const t = w.target;
	s.avoidMargin = 0.8;
	s.avoidLook = 45;
	if ( s.alertT > 0 && s.state !== 'flee' && s.alive ) s.setState( 'flee' );

	switch ( s.state ) {

		case 'sail': {

			const cur = s.cursor;
			if ( ! cur ) break;
			const n = cur.points.length;
			const terminal = ( cur.index === n - 1 && cur.dir === 1 ) || ( cur.index === 0 && cur.dir === - 1 );
			const ev = follow( s, terminal ? 16 : 45, ( d ) => ( terminal ? clamp( d / 70, 0.18, 1 ) : 1 ) );
			if ( ev === 'end' ) {

				s.setState( 'dock' );
				s.mem.dockFor = w.rng.range( 18, 32 );

			}

			break;

		}

		case 'dock': {

			s.wantSpeed = 0;
			if ( s.stateTime > ( s.mem.dockFor || 20 ) ) s.setState( 'sail' );
			break;

		}

		case 'flee': {

			s.wantSpeed = 1;
			if ( t && Math.hypot( t.x - s.x, t.z - s.z ) < 700 ) s.want = bearingTo( s, t.x, t.z ) + Math.PI;
			else follow( s, 45, 1 );
			if ( s.alertT <= 0 && s.stateTime > 20 ) s.setState( 'sail' );
			break;

		}

		default:
			break;

	}

	// a hull ahead on a collision course (Naval._avoidance): a short turn away
	if ( s.mem.avoidT > 0 ) {

		s.mem.avoidT -= dt;
		if ( s.state === 'sail' || s.state === 'flee' ) s.want += ( s.mem.avoidDir || 1 ) * AVOID.turn;

	}

}

export function think( s, w, dt ) {

	if ( ! s.alive ) return;
	if ( s.faction === 'pirate' ) {

		thinkPirate( s, w, dt );
		keepOut( s );

	} else thinkMerchant( s, w, dt );

}
