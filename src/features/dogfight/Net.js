// Air combat between players (wave 26A): what rides the state, the shots, and the host's word on every hit.
//
//   state   the local fighter's `df` (decorate): { a airframe, p [ x, y, z ], q [ qx, qy, qz, qw ], v [ vx, vy, vz ], r rpm,
//           g gear, c [ pitch, roll, yaw ], f firing (1 machine guns, 2 cannon), ar armed (0 safe, 1 armed, 2 arming, 3 going
//           safe: still hot), d damage code (Damage.code), cv convergence, sc [ kills, deaths ], st 'fly' | 'down' | 'bail' |
//           'ground' }. The others buffer it with the server's time and draw it on the remote players' clock (renderTime);
//           while f is set they fire the same guns for show (tracers, flashes, the rattle), never for damage.
//   hits    the shooter's own client finds its rounds' hits on the others' fighters as it draws them (Guns.Bullets against
//           the interpolated poses), only on fighters whose pilot armed his guns as he did (Consent.canHit), and claims them
//           to the host as world event 'dfHit' { t target, at (the server time of the pose it hit), s airframe, h [ [ part,
//           dmg x10, lx, ly, lz ] ] } (batched, at most CLAIM_HZ). The host (or the shooter himself when he is the host)
//           rewinds both fighters to that time from its own history of their states (lag compensation: up to MAX_REWIND
//           ms) and checks consent, range, the shooter's aim and firing, and a damage budget (the airframe's gun dps);
//           what passes goes to everybody as 'dfDmg' { t, by, h [ [ part, dmg x10 ] ] }: the target applies it to its own
//           fighter (only from the room's host), the rest show the sparks.
//   kills   the pilot who went down sends 'dfKill' { v victim, by (the last to hit him in KILL_WINDOW ms, or ''), a, ba,
//           how }: everyone's kill feed and scoreboard; the killer counts it from that event (the state's sc carries the
//           counts for late joiners).
//
//   const dn = new DogfightNet( { net: () => ( { online, id, host, isHost, serverNow(), send( kind, data ) } ),
//                                 onDamage( hits, by ), onKill( e ), onSparks( target, hits ) } );
//   dn.ingest( id, at, df, name )  dn.sample( id, t )  dn.remotes( t )  dn.decorate( out, local )  dn.claim( target, hits, at, airframe )
//   dn.onEvent( { kind, data, from } )  dn.recordSelf( t, df )  dn.update( dt )  dn.validate( from, claim ) -> { ok, why, hits }

import { WARBIRDS, PARTS, gunDps } from './Warbirds.js';
import { canHit } from './Consent.js';
import { Quaternion, Vector3 } from '../../engine/index.js';

export const NET = {
	keep: 40, // snapshots kept per fighter (~2.6 s at 15 Hz)
	maxRewind: 1000, // ms the host rewinds a claim
	claimHz: 5, dmgHz: 5,
	range: 1150, // m: no gun reaches past this
	cone: 0.22, // rad between the shooter's nose and the hit (convergence, spread, drop and lead)
	near: 9, // m: a claimed hit point within this of the target's centre
	fireSlack: 450, // ms: the shooter's firing flag round the time of the shot
	budget: 1.5, // the damage bucket: this many seconds of the airframe's gun dps
	killWindow: 20000, // ms: the last hit this recent gets the kill
	maxHits: 14, // per claim
};

const r2 = ( v ) => Math.round( v * 100 ) / 100;
const r1 = ( v ) => Math.round( v * 10 ) / 10;
const r4 = ( v ) => Math.round( v * 1e4 ) / 1e4;
const finite = ( a, n ) => Array.isArray( a ) && a.length === n && a.every( Number.isFinite );
const _q = new Quaternion(), _q2 = new Quaternion(), _v = new Vector3(), _w = new Vector3(), _f = new Vector3();

// a df state from the wire, checked and clamped (null when it is not a fighter's)
export function cleanDf( d ) {

	if ( ! d || typeof d !== 'object' || ! WARBIRDS[ d.a ] ) return null;
	if ( ! finite( d.p, 3 ) || ! finite( d.q, 4 ) ) return null;
	if ( d.p.some( ( v ) => Math.abs( v ) > 20000 ) ) return null;
	const ql = Math.hypot( ...d.q );
	if ( ! ( ql > 0.5 && ql < 1.5 ) ) return null;
	return {
		a: d.a, p: d.p.slice(), q: d.q.map( ( v ) => v / ql ), v: finite( d.v, 3 ) ? d.v.map( ( v ) => Math.max( - 400, Math.min( 400, v ) ) ) : [ 0, 0, 0 ],
		r: Number.isFinite( d.r ) ? Math.max( 0, Math.min( 1, d.r ) ) : 0, g: Number.isFinite( d.g ) ? Math.max( 0, Math.min( 1, d.g ) ) : 0,
		c: finite( d.c, 3 ) ? d.c.map( ( v ) => Math.max( - 1, Math.min( 1, v ) ) ) : [ 0, 0, 0 ],
		f: d.f | 0, ar: [ 0, 1, 2, 3 ].includes( d.ar ) ? d.ar : 0, d: typeof d.d === 'string' ? d.d.slice( 0, 12 ) : '00000000',
		cv: Number.isFinite( d.cv ) ? d.cv : 250, sc: finite( d.sc, 2 ) ? d.sc.map( ( v ) => Math.max( 0, Math.min( 9999, v | 0 ) ) ) : [ 0, 0 ],
		st: [ 'fly', 'down', 'bail', 'ground', 'crash', 'ditched' ].includes( d.st ) ? d.st : 'fly',
		// a crewed aircraft: who sits where, the engineer's systems, the turrets' angles and firing, the spotted targets
		cr: Array.isArray( d.cr ) ? d.cr.slice( 0, 4 ).map( ( x ) => ( typeof x === 'string' ? x.slice( 0, 16 ) : '' ) ) : null,
		sy: typeof d.sy === 'string' ? d.sy.slice( 0, 48 ) : null,
		tu: Array.isArray( d.tu ) ? d.tu.slice( 0, 4 ).map( ( t ) => ( finite( t, 2 ) ? t.map( ( v ) => Math.max( - 3.2, Math.min( 3.2, v ) ) ) : [ 0, 0 ] ) ) : null,
		tf: d.tf | 0,
		mk: Array.isArray( d.mk ) ? d.mk.slice( 0, 6 ).filter( ( x ) => typeof x === 'string' ).map( ( x ) => x.slice( 0, 16 ) ) : null,
	};

}

// a crew member's state ( dc ): aboard owner o's aircraft a in seat s; his turret's angles y / p, firing f, the guns' world
// position g and aim d; the aircraft's arming ar; a pilot's controls c [ pitch, roll, yaw, throttle, trigger, brakes ]
export function cleanDc( d ) {

	if ( ! d || typeof d !== 'object' || typeof d.o !== 'string' || ! WARBIRDS[ d.a ] ) return null;
	const seat = d.s | 0;
	if ( seat < 0 || seat >= WARBIRDS[ d.a ].seats.length ) return null;
	return {
		o: d.o.slice( 0, 16 ), a: d.a, s: seat,
		y: Number.isFinite( d.y ) ? Math.max( - 3.2, Math.min( 3.2, d.y ) ) : 0, p: Number.isFinite( d.p ) ? Math.max( - 1.6, Math.min( 1.6, d.p ) ) : 0,
		f: d.f | 0, ar: [ 0, 1, 2, 3 ].includes( d.ar ) ? d.ar : 0,
		g: finite( d.g, 3 ) && d.g.every( ( v ) => Math.abs( v ) < 20000 ) ? d.g.slice() : null,
		d: finite( d.d, 3 ) ? d.d.slice() : null,
		c: Array.isArray( d.c ) && d.c.length === 6 && d.c.every( Number.isFinite ) ? d.c.map( ( v ) => Math.max( - 1, Math.min( 1, v ) ) ) : null,
	};

}

// a crew member's snapshots as a shooter's (the guns' position and aim as the "nose"; the aircraft's arming)
function crewAsShooter( snaps ) {

	return snaps.filter( ( x ) => x.dc.g && x.dc.d ).map( ( x ) => {

		const dir = _v.fromArray( x.dc.d ).normalize();
		_q.setFromUnitVectors( _w.set( 0, 0, 1 ), dir );
		return { t: x.t, df: { a: x.dc.a, p: x.dc.g, q: [ _q.x, _q.y, _q.z, _q.w ], v: [ 0, 0, 0 ], r: 0, g: 0, c: [ 0, 0, 0 ], f: x.dc.f, ar: x.dc.ar, d: '', cv: 250, sc: [ 0, 0 ], st: 'fly', crewOf: x.dc.o } };

	} );

}

// armed for the rules: armed, or going safe (still hot)
export const hot = ( ar ) => ar === 1 || ar === 3;

// a snapshot between two of the buffer at time t (the newest past it, the oldest before it)
export function sampleSnaps( snaps, t ) {

	const n = snaps.length;
	if ( ! n ) return null;
	if ( t === null || t === undefined || t >= snaps[ n - 1 ].t || n < 2 ) return snaps[ n - 1 ].df;
	if ( t <= snaps[ 0 ].t ) return snaps[ 0 ].df;
	let i = n - 2;
	while ( i > 0 && snaps[ i ].t > t ) i --;
	const A = snaps[ i ], B = snaps[ i + 1 ];
	const k = ( t - A.t ) / Math.max( 1, B.t - A.t ), a = A.df, b = B.df;
	_q.fromArray( a.q );
	_q2.fromArray( b.q );
	if ( _q.dot( _q2 ) < 0 ) _q2.set( - _q2.x, - _q2.y, - _q2.z, - _q2.w );
	_q.slerp( _q2, k );
	const L = ( x, y ) => x + ( y - x ) * k;
	return {
		...( k < 0.5 ? a : b ),
		p: [ L( a.p[ 0 ], b.p[ 0 ] ), L( a.p[ 1 ], b.p[ 1 ] ), L( a.p[ 2 ], b.p[ 2 ] ) ],
		q: [ _q.x, _q.y, _q.z, _q.w ],
		v: [ L( a.v[ 0 ], b.v[ 0 ] ), L( a.v[ 1 ], b.v[ 1 ] ), L( a.v[ 2 ], b.v[ 2 ] ) ],
		r: L( a.r, b.r ), g: L( a.g, b.g ), c: [ L( a.c[ 0 ], b.c[ 0 ] ), L( a.c[ 1 ], b.c[ 1 ] ), L( a.c[ 2 ], b.c[ 2 ] ) ],
		// firing: either side of the interval counts (a burst never falls between two snapshots)
		f: a.f | b.f,
	};

}

// was the fighter firing round time t (the flag in any snapshot within slack ms)
function firedNear( snaps, t, slack ) {

	for ( const s of snaps ) if ( Math.abs( s.t - t ) <= slack && s.df.f ) return true;
	return false;

}

export class DogfightNet {

	constructor( { net = () => null, onDamage = null, onKill = null, onSparks = null, onFeed = null, onSeat = null, onCrew = null } = {} ) {

		this.net = net;
		this.onSeat = onSeat; // ( from, seat ) a player asks the owner for a seat (-1: he left it)
		this.onCrew = onCrew; // ( from, data ) a crew member's action for the owner's aircraft
		this.crewBuf = new Map(); // id -> { snaps: [ { t, dc } ], at }
		this.selfCrew = [];
		this.onDamage = onDamage;
		this.onKill = onKill;
		this.onSparks = onSparks;
		this.onFeed = onFeed;
		this.buf = new Map(); // id -> { snaps: [ { t, df } ], name, at }
		this.self = []; // the local fighter's own history (the host checks claims against it)
		this.claims = new Map(); // target -> { at, s, h: [] }
		this.outDmg = []; // the host's verdicts waiting for the next 'dfDmg'
		this.buckets = new Map(); // shooter -> { level, t }
		this.lastHit = { by: null, at: 0 }; // who last hurt the local fighter (for the kill)
		this.score = new Map(); // id -> { name, kills, deaths }
		this.stats = { claimsSent: 0, claimsIn: 0, accepted: 0, rejected: 0, rejectWhy: {}, dmgIn: 0, kills: 0 };
		this._claimT = 0;
		this._dmgT = 0;

	}

	get session() {

		const n = this.net();
		return n && n.online ? n : null;

	}

	// ------------------------------------------------------------------ the others' fighters

	ingest( id, at, df, name = null ) {

		const d = cleanDf( df );
		let b = this.buf.get( id );
		if ( ! d ) {

			if ( b ) b.snaps.length = 0;
			return false;

		}

		if ( ! b ) this.buf.set( id, b = { snaps: [], name: name || '?', at: - Infinity } );
		if ( name ) b.name = name;
		if ( at <= b.at ) return false;
		b.at = at;
		b.snaps.push( { t: at, df: d } );
		if ( b.snaps.length > NET.keep ) b.snaps.shift();
		const s = this.score.get( id ) || { name: b.name, kills: 0, deaths: 0 };
		s.name = b.name;
		// (a late joiner learns the counts from the state; events only ever raise them)
		s.kills = Math.max( s.kills, d.sc[ 0 ] );
		s.deaths = Math.max( s.deaths, d.sc[ 1 ] );
		this.score.set( id, s );
		return true;

	}

	// a crew member's state (aboard somebody's aircraft)
	ingestCrew( id, at, dc ) {

		const d = cleanDc( dc );
		let b = this.crewBuf.get( id );
		if ( ! d ) {

			if ( b ) b.snaps.length = 0;
			return false;

		}

		if ( ! b ) this.crewBuf.set( id, b = { snaps: [], at: - Infinity } );
		if ( at <= b.at ) return false;
		b.at = at;
		b.snaps.push( { t: at, dc: d } );
		if ( b.snaps.length > NET.keep ) b.snaps.shift();
		return true;

	}

	// the newest crew state of a peer (null when he is not crewing)
	crewOf( id ) {

		const b = this.crewBuf.get( id );
		return b && b.snaps.length ? b.snaps[ b.snaps.length - 1 ].dc : null;

	}

	recordSelfCrew( t, dc ) {

		const d = cleanDc( dc );
		if ( ! d ) return;
		const last = this.selfCrew[ this.selfCrew.length - 1 ];
		if ( last && t - last.t < 30 ) return;
		this.selfCrew.push( { t, dc: d } );
		if ( this.selfCrew.length > NET.keep * 2 ) this.selfCrew.shift();

	}

	// everyone aboard the aircraft a shooter flies or crews (the owner and his crew's ids)
	crewIds( id ) {

		const dc = this.crewOf( id );
		const owner = dc ? dc.o : id;
		const n = this.session;
		const df = n && owner === n.id ? ( this.self[ this.self.length - 1 ] || {} ).df : this.sample( owner, null );
		const out = new Set( [ owner ] );
		if ( df && df.cr ) for ( const w of df.cr ) if ( w && w !== 'ai' ) out.add( w );
		out.add( id );
		return [ ...out ];

	}

	requestSeat( owner, seat ) {

		const n = this.session;
		return !! n && n.send( 'dfSeat', { o: owner, s: seat | 0 } );

	}

	crewAction( owner, data ) {

		const n = this.session;
		return !! n && n.send( 'dfCrew', { ...data, o: owner } );

	}

	drop( id ) {

		this.buf.delete( id );
		this.crewBuf.delete( id );
		this.claims.delete( id );

	}

	sample( id, t ) {

		const b = this.buf.get( id );
		return b ? sampleSnaps( b.snaps, t ) : null;

	}

	// the fighters to draw and to shoot at, at render time t: [ { id, name, df } ]
	remotes( t ) {

		const out = [];
		for ( const [ id, b ] of this.buf ) {

			if ( ! b.snaps.length ) continue;
			const df = sampleSnaps( b.snaps, t );
			if ( df ) out.push( { id, name: b.name, df } );

		}

		return out;

	}

	// the local fighter's own history (server time), for the host's checks when it is a shooter or a target
	recordSelf( t, df ) {

		const d = cleanDf( df );
		if ( ! d ) return;
		const last = this.self[ this.self.length - 1 ];
		if ( last && t - last.t < 30 ) return;
		this.self.push( { t, df: d } );
		if ( this.self.length > NET.keep * 2 ) this.self.shift();

	}

	// ------------------------------------------------------------------ the state

	decorate( out, local ) {

		if ( ! out || ! local ) return out;
		out.df = local;
		return out;

	}

	// the wire form of a local fighter
	static pack( { id, flight, rpm, gear, controls, firing, armed, damage, convergence, score, status, crew = null, systems = null, turrets = null, turretFire = 0, marks = null } ) {

		const p = flight.position, q = flight.quaternion, v = flight.velocity;
		const extra = {};
		if ( crew ) extra.cr = crew;
		if ( systems ) extra.sy = systems;
		if ( turrets && turrets.length ) {

			extra.tu = turrets.map( ( t ) => [ r2( t.yaw ), r2( t.pitch ) ] );
			extra.tf = turretFire | 0;

		}

		if ( marks && marks.length ) extra.mk = marks;
		return {
			...extra,
			a: id, p: [ r2( p.x ), r2( p.y ), r2( p.z ) ], q: [ r4( q.x ), r4( q.y ), r4( q.z ), r4( q.w ) ], v: [ r1( v.x ), r1( v.y ), r1( v.z ) ],
			r: r2( rpm ), g: gear > 0.5 ? 1 : 0, c: [ r1( controls.pitch || 0 ), r1( controls.roll || 0 ), r1( controls.yaw || 0 ) ],
			f: firing | 0, ar: armed | 0, d: damage || '000000', cv: convergence || 250, sc: score || [ 0, 0 ], st: status || 'fly',
		};

	}

	// ------------------------------------------------------------------ the shooter

	// hits: [ { part, dmg, local: [ x, y, z ] } ] found on target's fighter as drawn at server time `at`
	claim( target, hits, at, airframe ) {

		if ( ! this.session || ! hits.length ) return;
		let c = this.claims.get( target );
		if ( ! c ) this.claims.set( target, c = { at, s: airframe, h: [] } );
		c.at = at;
		c.s = airframe;
		for ( const h of hits ) if ( c.h.length < NET.maxHits ) c.h.push( [ PARTS.indexOf( h.part ), Math.round( h.dmg * 10 ), r2( h.local[ 0 ] ), r2( h.local[ 1 ] ), r2( h.local[ 2 ] ) ] );

	}

	_flushClaims() {

		const n = this.session;
		if ( ! n ) {

			this.claims.clear();
			return;

		}

		for ( const [ t, c ] of this.claims ) {

			const data = { t, at: Math.round( c.at ), s: c.s, h: c.h };
			if ( n.isHost ) this._judge( n.id, data );
			else if ( n.send( 'dfHit', data ) ) this.stats.claimsSent ++;

		}

		this.claims.clear();

	}

	// ------------------------------------------------------------------ the host

	_snapsOf( id ) {

		const n = this.session;
		if ( n && id === n.id ) return this.self.length ? this.self : crewAsShooter( this.selfCrew );
		const b = this.buf.get( id );
		if ( b && b.snaps.length ) return b.snaps;
		const c = this.crewBuf.get( id );
		return c && c.snaps.length ? crewAsShooter( c.snaps ) : null;

	}

	// was this crew member aboard (the owner's roster names him) round time t
	_aboard( id, owner, t ) {

		const n = this.session;
		const snaps = n && owner === n.id ? this.self : ( this.buf.get( owner ) || {} ).snaps;
		if ( ! snaps || ! snaps.length ) return false;
		const df = sampleSnaps( snaps, t );
		return !! ( df && df.cr && df.cr.includes( id ) );

	}

	// a claim checked against the host's own record of both fighters at the claimed time
	validate( from, claim ) {

		const n = this.session;
		const now = n && n.serverNow ? n.serverNow() : Date.now();
		const no = ( why ) => ( { ok: false, why, hits: [] } );
		if ( ! claim || typeof claim.t !== 'string' || ! Number.isFinite( claim.at ) || ! Array.isArray( claim.h ) ) return no( 'malformed' );
		if ( claim.t === from ) return no( 'self' );
		if ( now - claim.at > NET.maxRewind || claim.at - now > 150 ) return no( 'stale' );
		const TS = this._snapsOf( claim.t ), SS = this._snapsOf( from );
		if ( ! TS || ! TS.length || ! SS || ! SS.length ) return no( 'unknown' );
		const T = sampleSnaps( TS, claim.at );
		if ( ! T ) return no( 'unknown' );
		// the rounds took a while to arrive: the shooter fired from where he was a time of flight earlier
		const W = WARBIRDS[ ( sampleSnaps( SS, claim.at ) || {} ).a ];
		if ( ! W ) return no( 'unknown' );
		const S0 = sampleSnaps( SS, claim.at );
		const dist0 = Math.hypot( T.p[ 0 ] - S0.p[ 0 ], T.p[ 1 ] - S0.p[ 1 ], T.p[ 2 ] - S0.p[ 2 ] );
		if ( S0.crewOf && ! this._aboard( from, S0.crewOf, claim.at ) ) return no( 'notAboard' );
		const vel = ( W.guns[ 0 ] || ( W.turrets[ 0 ] && W.turrets[ 0 ].guns[ 0 ] ) || { vel: 850 } ).vel;
		const tof = Math.min( 1500, dist0 / vel * 1000 );
		const S = sampleSnaps( SS, claim.at - tof );
		const shooter = { id: from, kind: 'player', inFighter: true, armed: hot( S.ar ), alive: S.st === 'fly' };
		const target = { id: claim.t, kind: 'player', inFighter: true, armed: hot( T.ar ), alive: T.st !== 'crash', grounded: T.st === 'ground', speed: Math.hypot( ...T.v ) };
		const consent = canHit( shooter, target, { online: true } );
		if ( ! consent.ok ) return no( consent.why );
		if ( ! firedNear( SS, claim.at - tof, NET.fireSlack + tof * 0.25 ) ) return no( 'notFiring' );
		const dist = Math.hypot( T.p[ 0 ] - S.p[ 0 ], T.p[ 1 ] - S.p[ 1 ], T.p[ 2 ] - S.p[ 2 ] );
		if ( dist > NET.range ) return no( 'range' );
		// the shooter's nose at the shot
		_q.fromArray( S.q );
		_f.set( 0, 0, 1 ).applyQuaternion( _q );
		_q2.fromArray( T.q );
		const maxDmg = Math.max( 1, ...W.guns.map( ( g ) => g.dmg ), ...W.turrets.flatMap( ( t ) => t.guns.map( ( g ) => g.dmg ) ) ) * 1.25;
		// the damage bucket: refills at the airframe's dps
		let bk = this.buckets.get( from );
		const cap = gunDps( W.id ) * NET.budget;
		if ( ! bk ) this.buckets.set( from, bk = { level: cap, t: now } );
		bk.level = Math.min( cap, bk.level + ( now - bk.t ) / 1000 * gunDps( W.id ) * 1.2 );
		bk.t = now;
		const hits = [];
		let why = 'ok';
		for ( const h of claim.h ) {

			if ( ! Array.isArray( h ) || h.length < 5 || ! h.every( Number.isFinite ) ) { why = 'malformed'; continue; }
			const part = PARTS[ h[ 0 ] ];
			const dmg = h[ 1 ] / 10;
			if ( ! part || ! ( dmg > 0 ) || dmg > maxDmg ) { why = 'damage'; continue; }
			// the hit point in the world, from the target's pose at the claimed time
			_v.set( h[ 2 ], h[ 3 ], h[ 4 ] );
			if ( _v.length() > NET.near ) { why = 'far'; continue; }
			_v.applyQuaternion( _q2 ).add( _w.fromArray( T.p ) );
			const to = _w.set( _v.x - S.p[ 0 ], _v.y - S.p[ 1 ], _v.z - S.p[ 2 ] );
			const len = to.length();
			if ( len < 1 || Math.acos( Math.max( - 1, Math.min( 1, to.dot( _f ) / len ) ) ) > NET.cone ) { why = 'aim'; continue; }
			if ( bk.level < dmg ) { why = 'budget'; continue; }
			bk.level -= dmg;
			hits.push( { part, dmg } );

		}

		return hits.length ? { ok: true, why, hits } : no( why );

	}

	// the host's verdict on a claim: accepted hits to everybody (and to itself when it is the target)
	_judge( from, claim ) {

		this.stats.claimsIn ++;
		const r = this.validate( from, claim );
		if ( ! r.ok ) {

			this.stats.rejected ++;
			this.stats.rejectWhy[ r.why ] = ( this.stats.rejectWhy[ r.why ] || 0 ) + 1;
			return r;

		}

		this.stats.accepted ++;
		this.outDmg.push( { t: claim.t, by: from, h: r.hits.map( ( h ) => [ PARTS.indexOf( h.part ), Math.round( h.dmg * 10 ) ] ) } );
		return r;

	}

	_flushDmg() {

		const n = this.session;
		if ( ! n || ! this.outDmg.length ) return;
		// one message per target and shooter
		const merged = new Map();
		for ( const d of this.outDmg ) {

			const k = d.t + '|' + d.by;
			const m = merged.get( k );
			if ( m ) m.h.push( ...d.h );
			else merged.set( k, { t: d.t, by: d.by, h: d.h.slice() } );

		}

		this.outDmg.length = 0;
		for ( const d of merged.values() ) {

			n.send( 'dfDmg', d );
			// (the host hears nobody's echo: its own fighter, and its sparks, from here)
			this._applyDmg( d, n.id );

		}

	}

	_applyDmg( d, from ) {

		const n = this.session;
		if ( ! n || from !== n.host || ! d || ! Array.isArray( d.h ) ) return;
		const hits = [];
		for ( const h of d.h ) if ( Array.isArray( h ) && PARTS[ h[ 0 ] ] && Number.isFinite( h[ 1 ] ) && h[ 1 ] > 0 ) hits.push( { part: PARTS[ h[ 0 ] ], dmg: Math.min( 100, h[ 1 ] / 10 ) } );
		if ( ! hits.length ) return;
		if ( d.t === n.id ) {

			this.stats.dmgIn ++;
			this.lastHit = { by: typeof d.by === 'string' ? d.by : null, at: n.serverNow ? n.serverNow() : Date.now() };
			if ( this.onDamage ) this.onDamage( hits, d.by );

		} else if ( this.onSparks ) this.onSparks( d.t, hits, d.by );

	}

	// ------------------------------------------------------------------ kills and the scoreboard

	// the local fighter is gone: who gets it
	reportKill( airframe, how ) {

		const n = this.session;
		if ( ! n ) return null;
		const now = n.serverNow ? n.serverNow() : Date.now();
		const by = this.lastHit.by && now - this.lastHit.at < NET.killWindow ? this.lastHit.by : '';
		const ba = by ? ( this.sample( by, null ) || this.crewOf( by ) || {} ).a || '' : '';
		const crew = by ? this.crewIds( by ).filter( ( id ) => id !== n.id ).slice( 0, 4 ) : [];
		const e = { v: n.id, by, a: airframe, ba, how: String( how || 'down' ).slice( 0, 12 ), crew };
		n.send( 'dfKill', e );
		this._kill( e, n.id );
		this.lastHit = { by: null, at: 0 };
		return e;

	}

	_kill( e, from ) {

		const n = this.session;
		if ( ! e || typeof e.v !== 'string' || e.v !== from ) return; // (only the victim reports his own end)
		const name = ( id ) => ( n && id === n.id ? 'You' : ( this.buf.get( id ) || {} ).name || ( this.score.get( id ) || {} ).name || 'A pilot' );
		const sc = ( id ) => {

			let s = this.score.get( id );
			if ( ! s ) this.score.set( id, s = { name: name( id ), kills: 0, deaths: 0 } );
			return s;

		};

		sc( e.v ).deaths ++;
		// a kill credits the crew: every one aboard the killer's aircraft (the killer himself included)
		const crew = new Set( Array.isArray( e.crew ) ? e.crew.filter( ( x ) => typeof x === 'string' && x !== e.v ).slice( 0, 4 ) : [] );
		if ( e.by && e.by !== e.v ) crew.add( e.by );
		for ( const id of crew ) sc( id ).kills ++;
		if ( n && crew.has( n.id ) ) this.stats.kills ++;
		const names = [ ...crew ].map( name );
		const feed = { killer: e.by ? ( names.length > 1 ? names.join( ', ' ) : name( e.by ) ) : null, crew: [ ...crew ], victim: name( e.v ), airframe: e.a, by: e.by, v: e.v, how: e.how, mine: !! n && ( crew.has( n.id ) || e.v === n.id ) };
		if ( this.onKill ) this.onKill( feed );
		return feed;

	}

	// remote world events (netsync's remoteWorldEvent)
	onEvent( ev ) {

		if ( ! ev || ev.replay ) return;
		const n = this.session;
		if ( ! n ) return;
		const d = ev.data;
		if ( ev.kind === 'dfHit' ) {

			if ( n.isHost && d ) this._judge( ev.from, d );

		} else if ( ev.kind === 'dfDmg' ) this._applyDmg( d, ev.from );
		else if ( ev.kind === 'dfKill' ) this._kill( d, ev.from );
		else if ( ev.kind === 'dfSeat' && d && d.o === n.id && this.onSeat ) this.onSeat( ev.from, Number.isInteger( d.s ) ? d.s : - 1 );
		else if ( ev.kind === 'dfCrew' && d && d.o === n.id && this.onCrew ) this.onCrew( ev.from, d );

	}

	// the board: [ { id, name, kills, deaths, self } ] best first
	board( selfName = 'You', selfScore = null ) {

		const n = this.session;
		const out = [];
		for ( const [ id, s ] of this.score ) if ( ! n || id !== n.id ) out.push( { id, name: s.name, kills: s.kills, deaths: s.deaths, self: false } );
		if ( n ) {

			const s = this.score.get( n.id ) || { kills: 0, deaths: 0 };
			out.push( { id: n.id, name: selfName, kills: Math.max( s.kills, selfScore ? selfScore[ 0 ] : 0 ), deaths: Math.max( s.deaths, selfScore ? selfScore[ 1 ] : 0 ), self: true } );

		}

		return out.sort( ( a, b ) => b.kills - a.kills || a.deaths - b.deaths );

	}

	myScore() {

		const n = this.session;
		const s = n ? this.score.get( n.id ) : null;
		return s ? [ s.kills, s.deaths ] : [ 0, 0 ];

	}

	update( dt ) {

		this._claimT += dt;
		this._dmgT += dt;
		if ( this._claimT >= 1 / NET.claimHz ) {

			this._claimT = 0;
			this._flushClaims();

		}

		if ( this._dmgT >= 1 / NET.dmgHz ) {

			this._dmgT = 0;
			this._flushDmg();

		}

	}

	reset() {

		this.buf.clear();
		this.crewBuf.clear();
		this.selfCrew.length = 0;
		this.self.length = 0;
		this.claims.clear();
		this.outDmg.length = 0;
		this.buckets.clear();
		this.lastHit = { by: null, at: 0 };

	}

}
