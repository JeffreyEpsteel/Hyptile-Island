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

import { angleDiff, clamp, sideSign } from './util.js';
import { advance, nearestIndex } from './Routes.js';
import { inPeace, peaceExit, PEACE } from '../melee/Peace.js';

export const BROADSIDE = { wear: 14, reloadLead: 1.5 };
export const OUTGUNNED = { window: 20, share: 0.35, below: 0.65, sample: 2.5 };
export const KEEP_OUT = { look: 140 };
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

	return m.hpLog.length ? Math.max( 0, Math.max( ...m.hpLog ) - s.hp ) : 0;

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
	// outgunned: shot to pieces fast and already hurt, she runs before her nerve would normally break
	const lost = hullLost( s, dt );
	if ( FIGHTING.has( s.state ) && s.hpFraction < OUTGUNNED.below && lost >= s.maxHp * OUTGUNNED.share ) {

		s.mem.outgunned = true;
		s.setState( 'flee' );

	}

	switch ( s.state ) {

		case 'patrol': {

			follow( s, 55, 0.6 );
			if ( aggro && d < sight ) {

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
			// the engaged battery is still reloading and the other is ready: wear round to bring it to bear
			s.mem.wearT = ( s.mem.wearT || 0 ) - dt;
			const engaged = s.mem.side > 0 ? 'port' : 'starboard', other = engaged === 'port' ? 'starboard' : 'port';
			if ( s.mem.wearT <= 0 && s.reload[ engaged ] > BROADSIDE.reloadLead && s.reload[ other ] <= 0 ) {

				s.mem.side = - s.mem.side;
				s.mem.wearT = BROADSIDE.wear;

			}

			// keep the target abeam: heading = bearing -+ 90 deg, closed in / opened out to hold 60-120 m, at the target's
			// own speed so the bearing holds instead of her overrunning him
			const bias = clamp( ( d - 90 ) / 70, - 1, 1 );
			s.want = bearing - s.mem.side * ( Math.PI / 2 - bias * 0.75 );
			const tv = Math.hypot( t.vx || 0, t.vz || 0 );
			s.wantSpeed = clamp( 0.35 + ( tv / Math.max( 1, c.speed ) ) * 0.75 + Math.abs( bias ) * 0.2, d < 70 ? 0.4 : 0.5, 1 );

			if ( aggro ) {

				for ( const side of [ 'port', 'starboard' ] ) {

					if ( s.reload[ side ] > 0 || sideSign( side ) !== ( rel >= 0 ? 1 : - 1 ) ) continue;
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

}

export function think( s, w, dt ) {

	if ( ! s.alive ) return;
	if ( s.faction === 'pirate' ) {

		thinkPirate( s, w, dt );
		keepOut( s );

	} else thinkMerchant( s, w, dt );

}
