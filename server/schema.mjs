// The synchronized state of a Hyptile Island room (@colyseus/schema 5, patched to the clients at SEND_HZ). The browser
// decodes it by reflection (@colyseus/sdk), so these classes live on the server only. src/net/ColyseusLink.js
// reads a Player back into the state object of src/net/Protocol.js (sanitizeState): p = [ x, y, z ], boat = { id, p, q, ... }.
//
//   HyptileState { room, crew, universe, host, at, players: { id: Player }, ships: [ Ship ], shipsAt, shipsHost,
//                  moored: { captainKey: Moored }, clock: Clock, wrecks: { '<owner>:<id>': Wreck } }
//   Player       profile fields (bumped `profile` on a hello) + the newest accepted state (bumped `seq`)

import { schema, t } from '@colyseus/schema';

export const Boat = schema( {
	id: t.string().default( '' ), // '' while the player is not aboard
	x: t.float32().default( 0 ), y: t.float32().default( 0 ), z: t.float32().default( 0 ),
	qx: t.float32().default( 0 ), qy: t.float32().default( 0 ), qz: t.float32().default( 0 ), qw: t.float32().default( 1 ),
	throttle: t.float32().default( 0 ), steer: t.float32().default( 0 ), rpm: t.float32().default( 0 ),
	driven: t.boolean().default( false ),
}, 'Boat' );

export const Player = schema( {
	id: t.string().default( '' ),
	name: t.string().default( '' ),
	character: t.string().default( '' ),
	owned: t.string().default( '' ), // the boat they own ('' none); `boat` below is the one they are aboard
	captain: t.string().default( '' ), // the universe captain key
	open: t.boolean().default( true ), // takes guests
	profile: t.uint16().default( 0 ), // bumped by a hello (a profile update reads as a 'join')
	seq: t.uint32().default( 0 ), // bumped by every accepted state
	has: t.boolean().default( false ), // a state arrived
	mode: t.string().default( 'walk' ),
	x: t.float32().default( 0 ), y: t.float32().default( 0 ), z: t.float32().default( 0 ),
	yaw: t.float32().default( 0 ), speed: t.float32().default( 0 ), vy: t.float32().default( 0 ),
	grounded: t.boolean().default( true ), diving: t.boolean().default( false ),
	action: t.string().default( '' ),
	ride: t.string().default( '' ), seat: t.uint8().default( 0 ),
	boat: t.ref( Boat ),
	extra: t.string().default( '' ), // the other features' fields of the state (cleanData), as JSON
}, 'Player' );

export const Ship = schema( {
	id: t.string().default( '' ), k: t.string().default( '' ), n: t.string().default( '' ), st: t.string().default( '' ),
	x: t.float32().default( 0 ), z: t.float32().default( 0 ), y: t.float32().default( 0 ), s: t.float32().default( 0 ),
	hp: t.float32().default( 0 ), mx: t.float32().default( 1 ), r: t.float32().default( 1 ),
}, 'Ship' );

export const Moored = schema( {
	captain: t.string().default( '' ), name: t.string().default( '' ), boat: t.string().default( '' ),
	x: t.float32().default( 0 ), y: t.float32().default( 0 ), z: t.float32().default( 0 ),
	qx: t.float32().default( 0 ), qy: t.float32().default( 0 ), qz: t.float32().default( 0 ), qw: t.float32().default( 1 ),
	at: t.float64().default( 0 ),
}, 'Moored' );

export const Clock = schema( {
	timeOfDay: t.float64().default( 0 ), timeSpeed: t.float64().default( 0 ), at: t.float64().default( 0 ),
	day: t.int32().default( - 1 ), // -1 outside a universe
	seed: t.float64().default( 0 ),
}, 'Clock' );

// a player's wreck (wave 11): a boat going down ('sinking'), on the sea floor ('boat') or a seaplane's ('plane', parts: the bits of
// the pieces torn off, src/features/netsync/WreckLink.js). Created and removed by its owner; gone when the owner leaves.
export const Wreck = schema( {
	owner: t.string().default( '' ), kind: t.string().default( '' ), model: t.string().default( '' ),
	x: t.float32().default( 0 ), y: t.float32().default( 0 ), z: t.float32().default( 0 ),
	yaw: t.float32().default( 0 ), pitch: t.float32().default( 0 ), roll: t.float32().default( 0 ),
	t: t.float64().default( 0 ), parts: t.uint16().default( 0 ),
}, 'Wreck' );

export const HyptileState = schema( {
	room: t.string().default( '' ),
	crew: t.boolean().default( false ),
	universe: t.string().default( '' ), // the universe's name ('' for a plain / crew room)
	host: t.string().default( '' ), // the world host's id
	at: t.float64().default( 0 ), // server Date.now() of the newest state change (the 'states' at)
	players: t.map( Player ),
	ships: t.array( Ship ),
	shipsAt: t.float64().default( 0 ),
	shipsHost: t.string().default( '' ),
	moored: t.map( Moored ),
	clock: t.ref( Clock ),
	wrecks: t.map( Wreck ),
}, 'HyptileState' );

const r2 = ( v ) => Math.round( v * 100 ) / 100;

// a sanitized state (Protocol.sanitizeState) into a Player
export function writePlayerState( pl, s ) {

	pl.has = true;
	pl.mode = s.mode;
	pl.x = s.p[ 0 ]; pl.y = s.p[ 1 ]; pl.z = s.p[ 2 ];
	pl.yaw = s.yaw; pl.speed = s.speed; pl.vy = s.vy;
	pl.grounded = s.grounded; pl.diving = s.diving;
	pl.action = s.action || '';
	pl.ride = s.ride || '';
	pl.seat = s.seat | 0;
	if ( s.character ) pl.character = s.character;
	const b = pl.boat;
	if ( s.boat ) {

		const sb = s.boat;
		b.id = sb.id;
		b.x = sb.p[ 0 ]; b.y = sb.p[ 1 ]; b.z = sb.p[ 2 ];
		b.qx = sb.q[ 0 ]; b.qy = sb.q[ 1 ]; b.qz = sb.q[ 2 ]; b.qw = sb.q[ 3 ];
		b.throttle = sb.throttle; b.steer = sb.steer; b.rpm = sb.rpm; b.driven = sb.driven;

	} else if ( b.id ) b.id = '';

	pl.extra = extrasJSON( s );
	pl.seq = ( pl.seq + 1 ) >>> 0;

}

const KNOWN = new Set( [ 't', 'id', 'at', 'p', 'yaw', 'mode', 'speed', 'vy', 'grounded', 'diving', 'action', 'character', 'name', 'boat', 'ride', 'seat' ] );

function extrasJSON( s ) {

	let out = null;
	for ( const k of Object.keys( s ) ) {

		if ( KNOWN.has( k ) ) continue;
		( out || ( out = {} ) )[ k ] = s[ k ];

	}

	return out ? JSON.stringify( out ) : '';

}

// the ship list of Protocol.sanitizeWorld into the ArraySchema (in place: unchanged ships cost nothing in the patch)
export function writeShips( arr, ships ) {

	for ( let i = 0; i < ships.length; i ++ ) {

		let sh = arr[ i ];
		if ( ! sh ) arr.push( sh = new Ship() );
		const s = ships[ i ];
		sh.id = s.id; sh.k = s.k; sh.n = s.n || ''; sh.st = s.st;
		sh.x = s.x; sh.z = s.z; sh.y = s.y; sh.s = s.s; sh.hp = s.hp; sh.mx = s.mx; sh.r = s.r ?? 1;

	}

	while ( arr.length > ships.length ) arr.pop();

}

// back out (the same rounding the protocol uses)
export function readShips( arr ) {

	const out = [];
	for ( const sh of arr ) {

		out.push( {
			id: sh.id, k: sh.k, n: sh.n, x: Math.round( sh.x * 10 ) / 10, z: Math.round( sh.z * 10 ) / 10, y: r2( sh.y ), s: r2( sh.s ),
			hp: Math.round( sh.hp * 10 ) / 10, mx: Math.round( sh.mx * 10 ) / 10, st: sh.st, r: r2( sh.r ),
		} );

	}

	return out;

}

export function writeMoored( map, m ) {

	let e = map.get( m.captain );
	if ( ! e ) e = new Moored();
	e.captain = m.captain; e.name = m.name || ''; e.boat = m.boat || '';
	e.x = m.p[ 0 ] || 0; e.y = m.p[ 1 ] || 0; e.z = m.p[ 2 ] || 0;
	const q = Array.isArray( m.q ) ? m.q : [ 0, 0, 0, 1 ];
	e.qx = q[ 0 ] || 0; e.qy = q[ 1 ] || 0; e.qz = q[ 2 ] || 0; e.qw = q[ 3 ] ?? 1;
	e.at = m.at || 0;
	map.set( m.captain, e );

}

// a sanitized wreck (Protocol.sanitizeWreck, op 'add') into the map under '<owner>:<id>'; t is kept from the first add
export function writeWreck( map, owner, w, now = Date.now() ) {

	const key = owner + ':' + w.id;
	let e = map.get( key );
	const fresh = ! e;
	if ( fresh ) e = new Wreck();
	const changed = fresh || e.kind !== w.kind; // (a boat that went down: the wreck's clock starts again)
	e.owner = owner; e.kind = w.kind; e.model = w.model;
	e.x = w.x; e.y = w.y; e.z = w.z; e.yaw = w.yaw; e.pitch = w.pitch; e.roll = w.roll; e.parts = w.parts;
	if ( changed ) e.t = now;
	if ( fresh ) map.set( key, e );
	return key;

}
