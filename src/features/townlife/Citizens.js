import { SCHEDULES } from '../harbour/Roles.js';
import { hashId } from '../harbour/Schedules.js';
import { FOLK_NAMES, FOLK_CHARACTERS, ROLE_LINES, yawToward } from '../../world/residents/ResidentData.js';
import { townPlaces, onFreeGround } from './Places.js';

// The townsfolk of townlife: each citizen has a home (a door: indoors at night), a job and a day plan (Roles.js
// schedules plus the town roles below), and walks the town's NavGrid routes between the places of its plan (Towns.js).
// A TownSim runs one town: the activities by the island clock, the goals they give (a stall to keep, nets to mend,
// crates to carry, a seat to eat on, a patio slot at the tavern, a gathering of two or three facing each other, a
// beat to walk with a lantern, the lamps at dusk, tag on the beach), simple avoidance, and the town's reactions: run
// indoors under cannon fire or a raid, cheer a big catch, queue at the fish hall when the catch comes in.
//
// Plain logic (no engine): the feature (index.js) binds avatars to the citizens near the player and draws the rest.
//   const sim = new TownSim( plan, { grid, rand, count: scale, ground } );
//   sim.update( dt, hour, viewer )      viewer { x, z } | null; near citizens step every frame, the rest at 2 Hz
//   sim.alarm( x, z, seconds ) / sim.cheer( x, z ) / sim.callQueue() / sim.crowd() / sim.byId( id )
//   citizen: { id, name, role, act, x, z, y, yaw, moving, hidden, clip(): { name, loop, speed }, lines }

export const TOWN_SCHEDULES = {
	fisher: SCHEDULES.fisher,
	dockworker: SCHEDULES.dockworker,
	carter: SCHEDULES.dockworker,
	carpenter: SCHEDULES.dockworker,
	// (wave 24E) the children walk to school together in the morning and play after it; folk take a siesta in the heat and
	// an evening walk in pairs along the front before the tavern
	child: [ [ 0, 7.5, 'sleep' ], [ 7.5, 8.1, 'wake' ], [ 8.1, 12, 'school' ], [ 12, 13, 'eat' ], [ 13, 18.5, 'play' ], [ 18.5, 19.5, 'stroll' ], [ 19.5, 24, 'sleep' ] ],
	sweeper: [ [ 0, 6, 'sleep' ], [ 6, 11, 'work' ], [ 11, 12, 'eat' ], [ 12, 16, 'work' ], [ 16, 20, 'stroll' ], [ 20, 24, 'sleep' ] ],
	vendor: [ [ 0, 6, 'sleep' ], [ 6, 7, 'wake' ], [ 7, 12.5, 'work' ], [ 12.5, 13.5, 'eat' ], [ 13.5, 18.5, 'work' ], [ 18.5, 19.8, 'promenade' ], [ 19.8, 21, 'stroll' ], [ 21, 24, 'sleep' ] ],
	folk: [ [ 0, 7, 'sleep' ], [ 7, 8, 'wake' ], [ 8, 12, 'stroll' ], [ 12, 13, 'eat' ], [ 13, 14.6, 'siesta' ], [ 14.6, 17.5, 'stroll' ], [ 17.5, 19.2, 'promenade' ], [ 19.2, 21.5, 'tavern' ], [ 21.5, 24, 'sleep' ] ],
	regular: [ [ 0, 0.6, 'drunk' ], [ 0.6, 10, 'sleep' ], [ 10, 12, 'stroll' ], [ 12, 13, 'eat' ], [ 13, 15, 'siesta' ], [ 15, 17, 'stroll' ], [ 17, 23.4, 'tavern' ], [ 23.4, 24, 'drunk' ] ],
	watchman: [ [ 0, 6, 'watch' ], [ 6, 14, 'sleep' ], [ 14, 18, 'stroll' ], [ 18, 20, 'tavern' ], [ 20, 24, 'watch' ] ],
	lamplighter: [ [ 0, 7, 'sleep' ], [ 7, 12, 'stroll' ], [ 12, 13, 'eat' ], [ 13, 17.6, 'stroll' ], [ 17.6, 19.3, 'lamps' ], [ 19.3, 22, 'tavern' ], [ 22, 24, 'sleep' ] ],
	pirate: [ [ 0, 3.5, 'tavern' ], [ 3.5, 4.5, 'drunk' ], [ 4.5, 11, 'sleep' ], [ 11, 12, 'wake' ], [ 12, 17, 'stroll' ], [ 17, 24, 'tavern' ] ],
	pirateHand: [ [ 0, 2, 'tavern' ], [ 2, 10, 'sleep' ], [ 10, 12, 'eat' ], [ 12, 18, 'work' ], [ 18, 24, 'tavern' ] ],
	fence: [ [ 0, 3, 'work' ], [ 3, 11, 'sleep' ], [ 11, 12, 'wake' ], [ 12, 24, 'work' ] ],
	pirateWatch: [ [ 0, 8, 'watch' ], [ 8, 16, 'sleep' ], [ 16, 20, 'tavern' ], [ 20, 24, 'watch' ] ],
	// (wave 24E) the busker plays the square from mid-morning to the evening; the crowd that gathers round faces the music
	busker: [ [ 0, 9, 'sleep' ], [ 9, 10, 'wake' ], [ 10, 13, 'work' ], [ 13, 14, 'eat' ], [ 14, 20, 'work' ], [ 20, 22.5, 'tavern' ], [ 22.5, 24, 'sleep' ] ],
};
export const ACTIVITIES = new Set( [ 'sleep', 'wake', 'work', 'eat', 'tavern', 'play', 'stroll', 'watch', 'lamps', 'drunk', 'school', 'siesta', 'promenade', 'festival' ] );

export function validTownSchedule( s ) {

	if ( ! Array.isArray( s ) || ! s.length || s[ 0 ][ 0 ] !== 0 || s[ s.length - 1 ][ 1 ] !== 24 ) return false;
	for ( let i = 0; i < s.length; i ++ ) {

		const [ a, b, act ] = s[ i ];
		if ( ! ( b > a ) || ! ACTIVITIES.has( act ) || ( i > 0 && s[ i - 1 ][ 1 ] !== a ) ) return false;

	}

	return true;

}

export function townActivity( role, hour ) {

	const s = TOWN_SCHEDULES[ role ] || TOWN_SCHEDULES.folk;
	const h = ( ( hour % 24 ) + 24 ) % 24;
	for ( let i = 0; i < s.length; i ++ ) if ( h >= s[ i ][ 0 ] && h < s[ i ][ 1 ] ) return s[ i ][ 2 ];
	return s[ s.length - 1 ][ 2 ];

}

// which job a role works at, and the role a line comes from (ResidentData ROLE_LINES)
const JOB = { vendor: 'stall', fence: 'stall', fisher: 'nets', dockworker: 'carry', pirateHand: 'carry', carter: 'barrow', carpenter: 'hammer', sweeper: 'sweep', busker: 'busk' };
const LINE_ROLE = { busker: 'tavern', vendor: 'merchant', fence: 'smuggler', carter: 'dockworker', carpenter: 'dockworker', sweeper: 'dockworker', pirateHand: 'dockworker', regular: 'tavern', folk: 'tavern', lamplighter: 'guard', watchman: 'guard', pirateWatch: 'guard', pirate: 'smuggler' };
const EXTRA_LINES = {
	vendor: [ 'Best prices on the island. Today only. Every day.', 'Take a look, no charge for looking.' ],
	folk: [ 'Fine day for it.', 'Have you tried the stew at the tavern?', 'The boats came in heavy this morning.' ],
	regular: [ 'One more and then home. Probably.', 'You look like you could use a drink.' ],
	lamplighter: [ 'Every lamp in town, every dusk. Forty years.', 'Mind the oil, friend.' ],
	watchman: [ 'Late to be out. All is well, mind.', 'Keep to the lamps after dark.' ],
	pirate: [ 'Arr. What are you looking at?', 'Rum first. Questions never.', 'Mind your purse round here, mate.', 'The Rum Hole pours till the sun is up.' ],
	pirateHand: [ 'Plunder does not stack itself.', 'Heave, ho, and so on.' ],
	fence: [ 'No names, no trouble.' ],
	pirateWatch: [ 'The fort sees every sail.', 'Move along, landlubber.' ],
	child: [ 'Tag! You are it!', 'Catch me if you can!' ],
	busker: [ 'A coin for the song, friend?', 'Requests cost extra. Silence costs double.', 'I know three songs. This is the good one.' ],
};
const TIME_HELLO = ( hour ) => hour < 11 ? 'Morning!' : hour < 17 ? 'Afternoon!' : hour < 22 ? 'Evening!' : 'Late one, eh?';

// the clip names a body plays (the feature resolves each through its fallback chain)
const LOOK = {
	stall: { base: 'Idle_Breathe', gestures: [ 'Point_Out', 'Talk', 'Wave', 'Shrug' ] },
	nets: { base: 'Fish_Net', gestures: [ 'Inspect_Catch', 'Look_Around' ] },
	fish: { base: 'Fishing_Hold', gestures: [ 'Fishing_Reel', 'Inspect_Catch' ] },
	hammer: { base: 'Hammer', gestures: [ 'Inspect_Catch', 'Kneel_Work' ] },
	carryEnd: { base: 'Kneel_Work', gestures: [] },
	sweep: { base: 'Sweep', gestures: [ 'Look_Around' ] },
	wake: { base: 'Idle_Breathe', gestures: [ 'Look_Around', 'Shrug', 'Friendly_Wave' ] },
	gather: { base: 'Talk_Group', gestures: [ 'Laugh', 'Point', 'Shrug', 'Chat_Gesture' ] },
	alone: { base: 'Idle_Breathe', gestures: [ 'Look_Around', 'Lean_Wall' ] },
	browse: { base: 'Idle_Breathe', gestures: [ 'Point', 'Inspect_Catch', 'Shrug' ] },
	// (seated: no standing gestures; Sit_Chair on the way down, Stand_From_Chair on the way up: wave 18E's clips)
	seatEat: { base: 'Sit_Chair_Idle', gestures: [], sit: true },
	seat: { base: 'Sit_Chair_Idle', gestures: [], sit: true },
	standEat: { base: 'Eat', gestures: [ 'Chat_Gesture', 'Laugh' ] },
	patio: { base: 'Drink', gestures: [ 'Talk_Group', 'Laugh', 'Cheer_Clap', 'Point' ] },
	patrol: { base: 'Idle_Breathe', gestures: [ 'Look_Around' ] },
	lamp: { base: 'Lamp_Light', gestures: [] },
	queue: { base: 'Idle_Breathe', gestures: [ 'Look_Around', 'Shrug' ] },
	play: { base: 'Idle_Breathe', gestures: [ 'Cheer_Clap', 'Dance' ] },
	cheer: { base: 'Clap', gestures: [] },
	// wave 24E
	stallSetup: { base: 'Kneel_Work', gestures: [ 'Inspect_Catch' ] }, // the morning: crates out, the awning up
	haggle: { base: 'Idle_Breathe', gestures: [ 'Shrug', 'Point', 'Chat_Gesture', 'Inspect_Catch', 'Talk' ] },
	siesta: { base: 'Sit_Chair_Idle', gestures: [], sit: true },
	walkTalk: { base: 'Chat_Gesture', gestures: [ 'Laugh', 'Point', 'Talk' ] }, // the evening walk's pauses
	quay: { base: 'Idle_Breathe', gestures: [ 'Point_Out', 'Friendly_Wave', 'Wave', 'Talk', 'Cheer_Clap' ] }, // a ship coming in
	chain: { base: 'Inspect_Catch', gestures: [] }, // the bucket passed on
	dance: { base: 'Dance', gestures: [ 'Dance_2', 'Cheer_Clap', 'Clap' ] },
	watchFest: { base: 'Clap', gestures: [ 'Cheer_Clap', 'Laugh', 'Talk_Group' ] },
	stare: { base: 'Idle_Breathe', gestures: [] },
	busk: { base: 'Dance_2', gestures: [ 'Cheer_Clap', 'Laugh', 'Friendly_Wave', 'Dance' ] },
};

const SPEED = { walk: 1.05, run: 3.1, drunk: 0.6, sweep: 0.4, barrow: 0.85, carry: 0.9, patrol: 0.85, chase: 2.6, flee: 2.2, promenade: 0.8, procession: 0.7, back: 1.3 };
const WET = 0.3, DRY = 0.12; // weather.rain: in out of it above, out again below
// outdoor activities the rain sends people in from (unless they hold an umbrella)
const OUTDOOR = new Set( [ 'stroll', 'wake', 'eat', 'play', 'siesta', 'promenade', 'festival' ] );
const FAR_TICK = 0.5; // s: citizens away from the player step at 2 Hz
const NEAR_R = 75; // m: within this they step every frame
const DORMANT_R = 450; // m beyond the town's radius: activities jump (no walking)
const SEP = 0.85; // m: personal space

const wrap = ( a ) => Math.atan2( Math.sin( a ), Math.cos( a ) );

class Slots {

	constructor() { this.held = new Map(); }

	claim( key, n, id, pick = null ) {

		if ( ! n ) return - 1;
		let m = this.held.get( key );
		if ( ! m ) this.held.set( key, m = new Map() );
		for ( const i of m.keys() ) if ( m.get( i ) === id ) return i; // (keys: no [ i, who ] pair a step; wave 20A)
		const start = pick !== null ? pick : hashId( id ) % n;
		for ( let k = 0; k < n; k ++ ) {

			const i = ( start + k ) % n;
			if ( ! m.has( i ) ) { m.set( i, id ); return i; }

		}

		return - 1;

	}

	count( key ) {

		const m = this.held.get( key );
		return m ? m.size : 0;

	}

	release( id ) {

		for ( const m of this.held.values() ) for ( const i of m.keys() ) if ( m.get( i ) === id ) m.delete( i );

	}

}

export class Citizen {

	constructor( sim, d ) {

		this.sim = sim;
		// every field declared here, in one order: one hidden class for all (a megamorphic load of a double boxes it)
		this.id = d.id; this.role = d.role; this.town = d.town; this.port = d.port; this.name = d.name;
		this.character = d.character; this.scale = d.scale; this.home = d.home;
		this.stall = null; this.loop = null; this.gather = null; this.leaveVia = null; this.light = null;
		this.greetAt = - 1e9; this.callAt = - 1e9; this.fleeT = 0.5; this.speedNow = 0.5; this._tagT = 0.5;
		this.fleeT = 0; this.speedNow = 0; this._tagT = 0;
		this.standT = 0; // s left of getting up from a seat
		this.seatH = 0.45; // the seat last sat on (m over the ground)
		this.job = JOB[ this.role ] || null;
		const h = hashId( this.id );
		this.hourOff = ( ( h >>> 3 ) % 70 ) / 100 - 0.35; // not everyone leaves on the stroke of the hour
		this.walkSpeed = SPEED.walk * ( 0.9 + ( ( h >>> 11 ) % 20 ) / 100 );
		this.drunkard = this.role === 'pirate' ? ( h % 3 ) === 0 : this.role === 'regular' ? ( h % 2 ) === 0 : false;
		const pool = [ ...( ROLE_LINES[ LINE_ROLE[ this.role ] || this.role ] || ROLE_LINES.tavern ), ...( EXTRA_LINES[ this.role ] || [] ) ];
		this.lines = pool;
		this.lineIdx = h % pool.length;
		this.x = this.home.x; this.z = this.home.z; this.y = 0;
		this.yaw = this.home.yaw || 0;
		this.act = null;
		this.goal = null; // { x, z, yaw, look, indoors, sit, h, dwell, kind }
		this.path = null;
		this.moving = false;
		this.mode = 'walk'; // walk | run | drunk | sweep | barrow | carry | patrol | chase | flee
		this.hidden = false;
		this.indoorFloor = null; // (wave 19E) seated in an interior (src/world/interiors): its floor's height
		this.indoorDoor = null;
		this.waitT = 0; // s at the goal
		this.gesture = null;
		this.gestureT = 4 + ( h % 7 );
		this.gestureLeft = 0;
		this.react = null; // { clip, t, yaw }
		this.fleeing = false;
		this.loaded = false; // carrying a crate
		this.stage = 0; // index in a loop (carry ends, barrow points, patrol nodes, lamps)
		this.acc = 0;
		this.near = false;
		this.body = null;
		this.greetT = 0;
		this.talkT = 0;
		this.sway = 0;
		this.queueSlot = - 1;
		this.tagIt = false;
		this.tagFreeze = 0;
		this.pending = null; // a route request waiting its turn
		this.lantern = this.role === 'watchman' || this.role === 'pirateWatch';
		// wave 24E: the weather, the player's gun, the town's events
		this.hasUmbrella = this.role !== 'child' && ! this.role.startsWith( 'pirate' ) && ( ( h >>> 5 ) % 5 ) < 2; // two in five carry one
		this.umbrella = false; // holding it up now
		this.sheltering = false; // gone in out of the rain
		this.oilskin = false; // the fishers and dockhands work on in the rain
		this.bucket = false; // in a bucket chain
		this.pair = null; // the evening walk's partner
		this.eventRole = null; // a procession, the festival's dance, a quay crowd: the event owns the goals
		this.stareAt = - 1e9;
		this.eventUntil = 0;
		this.setupAt = - 1e9; // the vendor set the stall out
		this.unloadN = 0; // crates left to carry up from a skiff
		this.cross = null; // the crossing waited at: { cr, a, b }
		this.stepPh = ( h % 628 ) / 100; // the far figure's walk cycle

	}

	line( hour = 12 ) {

		const l = this.lines[ this.lineIdx % this.lines.length ];
		this.lineIdx ++;
		return this.lineIdx % 3 === 1 ? `${ TIME_HELLO( hour ) } ${ l }` : l;

	}

	// the clip the body should play now: { name, loop, speed }
	clip( out = { name: 'Idle_Breathe', loop: true, speed: 1 } ) {

		out.loop = true; out.speed = 1;
		if ( this.react ) { out.name = this.react.clip; out.loop = true; return out; }
		if ( this.standT > 0 ) { out.name = 'Stand_From_Chair'; out.loop = false; return out; }
		if ( this.talkT > 0 ) { out.name = 'Talk'; return out; }
		if ( this.moving ) {

			const m = this.mode;
			if ( m === 'run' || m === 'chase' || m === 'flee' ) { out.name = 'Run_InPlace'; out.speed = Math.max( 0.7, Math.min( 1.6, this.speedNow / 2.0 ) ); return out; }
			out.name = m === 'drunk' ? 'Drunk_Walk' : m === 'carry' && this.loaded ? 'Carry_Box' : m === 'sweep' ? 'Sweep' : 'Walk_InPlace';
			out.speed = Math.max( 0.5, Math.min( 2, this.speedNow / 1.1 ) );
			return out;

		}

		if ( this.gesture ) { out.name = this.gesture; out.loop = false; return out; }
		out.name = ( this.goal && this.goal.look && this.goal.look.base ) || 'Idle_Breathe';
		return out;

	}

	get sitting() {

		return ! this.moving && ! this.react && !! ( this.goal && this.goal.look && this.goal.look.sit && this.arrived );

	}

	get arrived() {

		return ! this.moving && ! this.path && ! this.pending;

	}

}

export class TownSim {

	constructor( plan, { grid = null, rand = Math.random, scale = 1, ground = null, roster = null } = {} ) {

		this.plan = plan;
		this.grid = grid;
		this.rand = rand;
		this.ground = ground; // ( x, z ) -> y (exact; the grid's is per cell)
		this.slots = new Slots();
		this.list = [];
		this.time = 0;
		this.hour = 12;
		this.alarmT = 0;
		this.queueT = 0;
		this.queueServeT = 0;
		this.routesPerFrame = 2;
		this._routeQ = [];
		this.dormant = true;
		this.seats = plan.seats.slice();
		this._clipScratch = { name: '', loop: true, speed: 1 };
		// wave 24E: the weather, the island day (market days, the festival), the events running, the places they use
		this.rain = 0;
		this.wet = false;
		this.day = 0;
		this.marketDay = false;
		this.festival = false;
		this.event = null; // { kind: 'procession', ... } (one at a time)
		this.chain = null; // a bucket chain: { pts, members, fire: { x, z }, t }
		this.places = townPlaces( plan );
		this._quay = null; // the quay spots on free ground (resolved once the grid is ready)
		this.crossings = []; // signalled crossings: { node, edge, a, b } (the city's; setStreets)
		this.busStops = []; // { node, x, z, yaw }
		this.crossOK = null; // ( crossing ) -> true while its traffic has a red light
		this._populate( roster || plan, scale );
		// the evening walk goes in pairs: folk (and the vendors) two by two
		const walkers = this.list.filter( ( c ) => c.role === 'folk' || c.role === 'vendor' );
		for ( let i = 0; i + 1 < walkers.length; i += 2 ) { walkers[ i ].pair = walkers[ i + 1 ]; walkers[ i + 1 ].pair = walkers[ i ]; walkers[ i ].pairLead = true; }

	}

	// ------------------------------------------------------------------ wave 24E: conditions and events

	// the weather and the day, from the feature each frame: rain sends people in (or up go the umbrellas), the day picks the
	// market days and the festival nights
	setConditions( { rain = 0, day = 0, marketDay = false, festival = false } = {} ) {

		this.rain = rain;
		const wet = this.wet ? rain > DRY : rain > WET;
		this.wet = wet;
		this.day = day;
		this.marketDay = marketDay;
		if ( festival !== this.festival ) {

			this.festival = festival;
			// everyone thinks again: the festival takes the evening over (and gives it back)
			for ( const c of this.list ) if ( ! c.eventRole && ! c.fleeing && ! c.bucket ) c.act = null;

		}

	}

	// the city's streets (the cars feature): crossings at the lights and the bus stops; crossOK( crossing ) -> may walk now
	setStreets( { crossings = [], busStops = [], crossOK = null } = {} ) {

		this.crossings = crossings;
		this.busStops = busStops;
		this.crossOK = crossOK;

	}

	// a bus stopped at a stop: those waiting there get on (walk to its door, gone); a few others get off and walk away
	busArrived( node, door, { off = 2 } = {} ) {

		let on = 0;
		for ( const c of this.list ) {

			if ( c.hidden || ! c.goal || c.goal.kind !== 'busWait' || c.goal.stop !== node ) continue;
			this._goal( c, { x: door.x, z: door.z, yaw: door.yaw, indoors: true, kind: 'board' }, 'walk' );
			on ++;

		}

		// alighting: strollers out of sight (far from the stop) step off the bus instead
		let k = 0;
		for ( const c of this.list ) {

			if ( k >= off ) break;
			if ( c.hidden || c.eventRole || c.near || c.act !== 'stroll' || ! c.arrived || Math.hypot( c.x - door.x, c.z - door.z ) < 60 ) continue;
			this.slots.release( c.id );
			c.x = door.x; c.z = door.z; c.path = null; c.pending = null; c.goal = null;
			this._stroll( c );
			k ++;

		}

		return on;

	}

	// the quay spots (on free ground once the grid is up)
	quaySpots() {

		this._places();
		return this.places.quay;

	}

	// the derived places moved onto the grid's free ground, once it is ready
	_places() {

		if ( this._placesOk || ! this.grid || ! this.grid.ready ) return;
		this._placesOk = true;
		const P = this.places, G = this.grid;
		P.quay = onFreeGround( G, P.quay );
		P.walk = onFreeGround( G, P.walk, 4 );
		P.wells = onFreeGround( G, P.wells, 2 );
		if ( P.fest ) { P.fest.dance = onFreeGround( G, P.fest.dance, 2 ); P.fest.watch = onFreeGround( G, P.fest.watch, 2 ); P.fest.posts = onFreeGround( G, P.fest.posts, 3 ); }
		for ( const k in P.fronts ) P.fronts[ k ] = onFreeGround( G, P.fronts[ k ], 1.2 );

	}

	// someone draws a gun near (x, z): people turn and stare; the near ones (children first) back away from it
	stare( x, z, radius = 14 ) {

		let n = 0;
		for ( const c of this.list ) {

			if ( c.hidden || c.fleeing || c.eventRole || c.bucket || c.sitting || this.time - c.stareAt < 8 ) continue;
			const d = Math.hypot( c.x - x, c.z - z );
			if ( d > radius ) continue;
			c.stareAt = this.time;
			const yaw = yawToward( c.x, c.z, x, z );
			if ( d < 5 && ( c.role === 'child' || hashId( c.id ) % 3 === 0 ) && ! c.role.startsWith( 'pirate' ) ) {

				// back off a few metres, then go on with the day
				this.slots.release( c.id );
				const ax = ( c.x - x ) / ( d || 1 ), az = ( c.z - z ) / ( d || 1 );
				let tx = c.x + ax * 6, tz = c.z + az * 6;
				if ( this.grid && this.grid.ready ) { const q = this.grid.nearestFree( tx, tz, 3 ); if ( q ) { tx = q.x; tz = q.z; } }
				this._goal( c, { x: tx, z: tz, yaw, look: LOOK.stare, kind: 'backoff', dwell: 5 }, 'back' );

			} else {

				// pirates square up instead of staring
				c.react = { clip: c.role.startsWith( 'pirate' ) ? 'Swagger_Idle' : 'Stare', t: 2.5 + ( hashId( c.id ) % 10 ) / 10, yaw };

			}

			n ++;

		}

		return n;

	}

	// a ship comes in: a crowd gathers on the quay to watch, point and wave
	gatherQuay( seconds = 60, max = 10 ) {

		const spots = this.quaySpots();
		if ( ! spots.length || this.dormant ) return 0;
		const q0 = spots[ 0 ];
		const cand = this.list.filter( ( c ) => ! c.hidden && ! c.fleeing && ! c.eventRole && ! c.bucket && ! c.sheltering && c.queueSlot < 0 && ( c.act === 'stroll' || c.act === 'wake' || c.act === 'promenade' || c.act === 'play' || c.act === 'eat' || c.act === 'siesta' ) )
			.sort( ( a, b ) => Math.hypot( a.x - q0.x, a.z - q0.z ) - Math.hypot( b.x - q0.x, b.z - q0.z ) );
		let n = 0;
		for ( const c of cand.slice( 0, Math.min( max, spots.length ) ) ) {

			this.slots.release( c.id );
			const q = spots[ n ];
			c.eventRole = 'quay';
			c.eventUntil = this.time + seconds + 60; // (whoever cannot get there in time gives up)
			this._goal( c, { x: q.x, z: q.z, yaw: q.yaw, look: LOOK.quay, kind: 'quay', dwell: seconds * ( 0.8 + ( hashId( c.id ) % 40 ) / 100 ) }, c.role === 'child' ? 'run' : 'walk' );
			n ++;

		}

		return n;

	}

	// a fire in town: a line of people from the quay to it passing buckets (seconds: how long they keep at it)
	bucketChain( x, z, seconds = 45 ) {

		if ( this.chain || this.dormant ) return 0;
		// the water: the nearest of the town's fountains and wells, else the quay
		const sources = [ ...this.places.wells, ...this.quaySpots() ];
		if ( ! sources.length ) return 0;
		let src = sources[ 0 ], bd = Infinity;
		for ( const s of sources ) { const d = Math.hypot( s.x - x, s.z - z ); if ( d < bd ) { bd = d; src = s; } }
		if ( bd > 140 ) return 0;
		// the line: a person every ~1.6 m back from 2.5 m short of the fire (3 to 9 of them); when the water is further off
		// than the line reaches, two runners carry the buckets from it to the line's head
		const L = Math.max( 0, bd - 2.5 ), n = Math.max( 3, Math.min( 9, Math.round( L / 1.6 ) + 1 ) );
		const span = Math.min( L, ( n - 1 ) * 1.6 );
		const ux = ( x - src.x ) / Math.max( bd, 1e-3 ), uz = ( z - src.z ) / Math.max( bd, 1e-3 );
		const end = { x: x - ux * 2.5, z: z - uz * 2.5 };
		const pts = [];
		for ( let i = 0; i < n; i ++ ) {

			const back = span * ( 1 - ( n > 1 ? i / ( n - 1 ) : 0 ) );
			let px = end.x - ux * back, pz = end.z - uz * back;
			if ( this.grid && this.grid.ready ) { const q = this.grid.nearestFree( px, pz, 3 ); if ( q ) { px = q.x; pz = q.z; } }
			pts.push( { x: px, z: pz } );

		}

		const runners = L - span > 4 ? 2 : 0;
		const cand = this.list.filter( ( c ) => c.role !== 'child' && ! c.eventRole && ! c.bucket && c.queueSlot < 0 && Math.hypot( c.x - x, c.z - z ) < 120 )
			.sort( ( a, b ) => Math.hypot( a.x - x, a.z - z ) - Math.hypot( b.x - x, b.z - z ) ).slice( 0, n + runners );
		if ( cand.length < 3 ) return 0;
		const members = [], carriers = [];
		cand.forEach( ( c, i ) => {

			c.fleeing = false; c.fleeT = 0; c.react = null;
			this.slots.release( c.id );
			c.bucket = true;
			c.eventRole = 'chain';
			c.queueSlot = - 1;
			if ( i >= n ) {

				// a runner: back and forth between the water and the line's head with a bucket
				const head = pts[ 0 ];
				c.loop = [ { x: src.x, z: src.z, yaw: yawToward( src.x, src.z, head.x, head.z ) }, { x: head.x, z: head.z, yaw: yawToward( head.x, head.z, src.x, src.z ) } ];
				c.loaded = false; c.stage = 0; c.unloadN = 1e6;
				this._goal( c, { ...c.loop[ 0 ], look: LOOK.carryEnd, kind: 'carry', dwell: 1.5 }, 'run' );
				carriers.push( c );
				return;

			}

			const k = members.length;
			const p = pts[ k ], q = pts[ Math.min( k + 1, pts.length - 1 ) ], back = pts[ Math.max( 0, k - 1 ) ];
			// each faces along the line, toward the fire (the last one faces it)
			const yaw = k < pts.length - 1 ? yawToward( p.x, p.z, q.x, q.z ) : yawToward( p.x, p.z, x, z );
			this._goal( c, { x: p.x, z: p.z, yaw: Number.isFinite( yaw ) ? yaw : yawToward( back.x, back.z, p.x, p.z ), look: LOOK.chain, kind: 'chain', dwell: Infinity }, 'run' );
			members.push( c );

		} );
		this.chain = { pts: pts.slice( 0, members.length ), members, runners: carriers, source: { x: src.x, z: src.z }, fire: { x, z }, t: seconds, splashT: 0 };
		return members.length + carriers.length;

	}

	// a skiff tied up with the catch: fishers and dockhands carry its crates up to the fish hall (a few trips each)
	unloadCatch( dock, trips = 3 ) {

		const H = this.plan.hall;
		if ( ! H || this.dormant ) return 0;
		const spots = this.quaySpots();
		let from = null, bd = Infinity;
		for ( const s of spots ) { const d = Math.hypot( s.x - dock.x, s.z - dock.z ); if ( d < bd ) { bd = d; from = s; } }
		if ( ! from || bd > 60 ) return 0;
		const q0 = H.queue[ 0 ];
		let to = { x: q0.x + Math.cos( H.yaw ) * 1.4, z: q0.z - Math.sin( H.yaw ) * 1.4 };
		if ( this.grid && this.grid.ready ) to = this.grid.nearestFree( to.x, to.z, 3 ) || to;
		const cand = this.list.filter( ( c ) => ( c.role === 'fisher' || c.role === 'dockworker' || c.role === 'pirateHand' || c.role === 'carter' ) && ! c.hidden && ! c.eventRole && ! c.bucket && ! c.fleeing && c.act === 'work' )
			.sort( ( a, b ) => Math.hypot( a.x - from.x, a.z - from.z ) - Math.hypot( b.x - from.x, b.z - from.z ) ).slice( 0, 2 );
		for ( const c of cand ) {

			this.slots.release( c.id );
			c.loop = [ { x: from.x, z: from.z, yaw: from.yaw }, { x: to.x, z: to.z, yaw: H.yaw } ];
			c.loaded = false;
			c.stage = 0;
			c.unloadN = trips;
			this._goal( c, { ...c.loop[ 0 ], look: LOOK.carryEnd, kind: 'carry', dwell: 2.5 }, 'carry' );

		}

		return cand.length;

	}

	// a delivery: a dockhand or carter carries crates from a parked van (its back doors) to a shop door, a few trips
	delivery( from, to, trips = 3 ) {

		if ( this.dormant ) return 0;
		const G = this.grid && this.grid.ready ? this.grid : null;
		const a = G ? G.nearestFree( from.x, from.z, 3 ) : from, b = G ? G.nearestFree( to.x, to.z, 3 ) : to;
		if ( ! a || ! b ) return 0;
		const c = this.list.filter( ( q ) => ( q.role === 'dockworker' || q.role === 'carter' || q.role === 'pirateHand' ) && ! q.hidden && ! q.eventRole && ! q.bucket && ! q.fleeing && q.act === 'work' && ! ( q.unloadN > 0 ) )
			.sort( ( p, q ) => Math.hypot( p.x - a.x, p.z - a.z ) - Math.hypot( q.x - a.x, q.z - a.z ) )[ 0 ];
		if ( ! c ) return 0;
		this.slots.release( c.id );
		c.loop = [ { x: a.x, z: a.z, yaw: yawToward( a.x, a.z, b.x, b.z ) }, { x: b.x, z: b.z, yaw: yawToward( b.x, b.z, a.x, a.z ) } ];
		c.loaded = false; c.stage = 0; c.unloadN = trips;
		this._goal( c, { ...c.loop[ 0 ], look: LOOK.carryEnd, kind: 'carry', dwell: 2.5 }, 'carry' );
		return 1;

	}

	// a procession through the town (a wedding): a couple ahead, friends two by two behind, along the route; a cheer at the end
	procession( route, { followers = 8, name = 'wedding' } = {} ) {

		if ( this.event || this.dormant || ! route || route.length < 2 ) return 0;
		const r0 = route[ 0 ];
		const cand = this.list.filter( ( c ) => ! c.hidden && ! c.fleeing && ! c.eventRole && ! c.bucket && c.queueSlot < 0 && ( c.role === 'folk' || c.role === 'regular' || c.role === 'child' || c.role === 'vendor' ) )
			.sort( ( a, b ) => Math.hypot( a.x - r0.x, a.z - r0.z ) - Math.hypot( b.x - r0.x, b.z - r0.z ) ).slice( 0, followers + 2 );
		if ( cand.length < 4 ) return 0;
		for ( const c of cand ) { this.slots.release( c.id ); c.eventRole = 'procession'; }
		this.event = { kind: 'procession', name, route, k: 0, members: cand, waitT: 0, endT: 0 };
		this._eventLeg();
		return cand.length;

	}

	// the procession's next waypoint: rows of two behind the couple, 1.4 m apart, along the way they came
	_eventLeg() {

		const E = this.event, R = E.route;
		const p = R[ E.k ], prev = R[ Math.max( 0, E.k - 1 ) ], next = R[ Math.min( R.length - 1, E.k + 1 ) ];
		let dx = p.x - prev.x, dz = p.z - prev.z;
		if ( E.k === 0 ) { dx = next.x - p.x; dz = next.z - p.z; }
		const L = Math.hypot( dx, dz ) || 1;
		const fx = dx / L, fz = dz / L, sx = fz, sz = - fx;
		const yaw = yawToward( 0, 0, fx, fz );
		E.members.forEach( ( c, i ) => {

			const row = Math.floor( i / 2 ), side = i % 2 ? 0.45 : - 0.45;
			let x = p.x - fx * row * 1.4 + sx * side, z = p.z - fz * row * 1.4 + sz * side;
			if ( this.grid && this.grid.ready ) { const q = this.grid.nearestFree( x, z, 3 ); if ( q ) { x = q.x; z = q.z; } }
			this._goal( c, { x, z, yaw, look: i < 2 ? LOOK.walkTalk : LOOK.watchFest, kind: 'procession', dwell: Infinity }, 'procession' );

		} );
		E.waitT = 0;

	}

	_eventStep( dt ) {

		const E = this.event;
		if ( ! E ) return;
		if ( E.endT > 0 ) {

			E.endT -= dt;
			if ( E.endT <= 0 ) { for ( const c of E.members ) { c.eventRole = null; c.act = null; c.react = null; } this.event = null; }
			return;

		}

		E.waitT += dt;
		// the next leg once the couple and most of the rest are there (or after a while: nobody is left behind for long)
		const there = E.members.filter( ( c ) => c.arrived ).length;
		if ( ( E.members[ 0 ].arrived && there >= E.members.length - 1 ) || E.waitT > 40 ) {

			if ( E.k >= E.route.length - 1 ) {

				// the end: everyone turns to the couple and cheers
				const a = E.members[ 0 ];
				E.members.forEach( ( c, i ) => { c.react = { clip: i < 2 ? 'Friendly_Wave' : i % 2 ? 'Cheer_Clap' : 'Clap', t: 6, yaw: i < 2 ? c.yaw + Math.PI : yawToward( c.x, c.z, a.x, a.z ) }; } );
				E.endT = 6.5;
				return;

			}

			E.k ++;
			this._eventLeg();

		}

	}

	// the chain: a while at it, then everyone goes back to their day
	_chainStep( dt ) {

		const C = this.chain;
		if ( ! C ) return;
		C.t -= dt;
		C.splashT -= dt;
		if ( C.t > 0 ) return;
		for ( const c of [ ...C.members, ...C.runners ] ) { c.bucket = false; c.eventRole = null; c.act = null; c.unloadN = 0; c.loop = null; c.loaded = false; }
		this.chain = null;

	}

	setSeats( extra ) {

		// another worker's benches (18C) come first: they are real seats
		if ( extra && extra.length ) this.seats = [ ...extra, ...this.plan.seats ];

	}

	_populate( roster, scale ) {

		const plan = this.plan;
		const pop = ( roster.population || roster ).roles || {};
		const homes = [ ...plan.homes, ...plan.outskirts ];
		let n = 0;
		for ( const [ role, count ] of Object.entries( pop ) ) {

			const want = Math.max( role === 'watchman' || role === 'vendor' || role === 'lamplighter' || role === 'fence' ? Math.min( 1, count ) : 0, Math.round( count * scale ) );
			for ( let k = 0; k < want; k ++, n ++ ) {

				const id = `${ plan.id }.${ role }${ k }`;
				const h = hashId( id );
				const pirate = role.startsWith( 'pirate' ) || role === 'fence';
				const child = role === 'child';
				const home = homes[ ( h >>> 4 ) % homes.length ];
				this.list.push( new Citizen( this, {
					id, role, town: plan.id, port: plan.port,
					name: FOLK_NAMES[ ( h >>> 7 ) % FOLK_NAMES.length ] + ( pirate ? [ ' the Red', ' One-Eye', ' Saltjaw', ' the Rat', ' Longshanks', '' ][ h % 6 ] : '' ),
					character: pirate ? [ 'bonk', 'clown', 'doge', 'pepe', 'bravile', 'heptyle' ][ ( h >>> 9 ) % 6 ] : FOLK_CHARACTERS[ ( h >>> 9 ) % FOLK_CHARACTERS.length ],
					scale: child ? 0.6 + ( ( h >>> 13 ) % 12 ) / 100 : 0.92 + ( ( h >>> 13 ) % 14 ) / 100,
					home,
				} ) );

			}

		}

	}

	byId( id ) {

		return this.list.find( ( c ) => c.id === id ) || null;

	}

	// ------------------------------------------------------------------ reactions

	// cannon fire, a raid, an explosion: everyone within `radius` of (x, z) (everyone: x null) runs home and stays in
	alarm( x = null, z = null, seconds = 75, radius = 150 ) {

		let n = 0;
		for ( const c of this.list ) {

			if ( c.hidden && c.fleeing ) { c.fleeT = Math.max( c.fleeT, seconds ); continue; }
			if ( x !== null && Math.hypot( c.x - x, c.z - z ) > radius ) continue;
			if ( c.role === 'pirateWatch' ) continue; // the fort's men stand to
			if ( c.bucket ) continue; // (wave 24E) the bucket chain holds its line
			c.eventRole = null;
			c.fleeing = true;
			c.fleeT = seconds;
			c.react = null;
			this.slots.release( c.id );
			const home = c.home;
			this._goal( c, { x: home.x, z: home.z, yaw: home.yaw, indoors: true, kind: 'flee' }, 'run' );
			n ++;

		}

		if ( n ) this.alarmT = Math.max( this.alarmT, seconds );
		return n;

	}

	// a big catch landed near (x, z): those around turn and clap
	cheer( x, z, radius = 24 ) {

		let n = 0;
		for ( const c of this.list ) {

			if ( c.hidden || c.fleeing || c.moving && c.mode !== 'walk' ) continue;
			if ( Math.hypot( c.x - x, c.z - z ) > radius ) continue;
			c.react = { clip: n % 2 ? 'Cheer_Clap' : 'Clap', t: 3.2 + ( n % 3 ) * 0.4, yaw: yawToward( c.x, c.z, x, z ) };
			n ++;

		}

		return n;

	}

	// the catch comes in: a few go and queue at the fish hall
	callQueue( seconds = 90 ) {

		const H = this.plan.hall;
		if ( ! H || this.queueT > 0 ) return 0;
		this.queueT = seconds;
		this.queueServeT = 14;
		const cand = this.list.filter( ( c ) => ! c.hidden && ! c.fleeing && ( c.act === 'stroll' || c.act === 'wake' || c.act === 'eat' ) && c.role !== 'child' )
			.sort( ( a, b ) => Math.hypot( a.x - H.x, a.z - H.z ) - Math.hypot( b.x - H.x, b.z - H.z ) );
		let n = 0;
		for ( const c of cand.slice( 0, H.queue.length ) ) {

			this.slots.release( c.id );
			c.queueSlot = n;
			const q = H.queue[ n ];
			this._goal( c, { x: q.x, z: q.z, yaw: q.yaw, look: LOOK.queue, kind: 'queue', dwell: Infinity } );
			n ++;

		}

		return n;

	}

	_serveQueue() {

		const H = this.plan.hall;
		const inQ = this.list.filter( ( c ) => c.queueSlot >= 0 ).sort( ( a, b ) => a.queueSlot - b.queueSlot );
		if ( ! inQ.length ) return;
		const first = inQ[ 0 ];
		first.queueSlot = - 1;
		first.act = null; // back to the day plan
		for ( const c of inQ.slice( 1 ) ) {

			c.queueSlot --;
			const q = H.queue[ c.queueSlot ];
			this._goal( c, { x: q.x, z: q.z, yaw: q.yaw, look: LOOK.queue, kind: 'queue', dwell: Infinity } );

		}

	}

	// how many are at the tavern (on the patio, or inside)
	crowd() {

		let n = 0;
		for ( const c of this.list ) if ( c.act === 'tavern' && ( c.arrived || c.hidden ) ) n ++;
		return n;

	}

	// ------------------------------------------------------------------ goals

	_goal( c, goal, mode = 'walk' ) {

		// (wave 19E) out of an interior: back at its door first
		if ( c.indoorFloor !== null ) { c.x = c.indoorDoor.x; c.z = c.indoorDoor.z; c.indoorFloor = null; c.indoorDoor = null; }
		// up from a seat first (the near ones play it; out of sight they just go)
		if ( c.sitting && ! this.dormant && c.near ) c.standT = 1.1;
		c.goal = goal;
		c.mode = mode;
		c.waitT = 0;
		c.gesture = null;
		c.path = null;
		c.moving = false;
		if ( c.hidden && ! goal.indoors ) c.hidden = false;
		if ( this.dormant || ! this.grid || ! this.grid.ready ) {

			this._teleport( c, goal );
			return;

		}

		if ( Math.hypot( goal.x - c.x, goal.z - c.z ) < 0.3 ) { this._arrive( c ); return; }
		c.pending = goal;
		if ( ! this._routeQ.includes( c ) ) this._routeQ.push( c );

	}

	_teleport( c, goal ) {

		c.pending = null;
		c.path = null;
		c.x = goal.x; c.z = goal.z;
		this._arrive( c );

	}

	_arrive( c ) {

		const g = c.goal;
		c.moving = false;
		c.path = null;
		c.pending = null;
		c.waitT = 0;
		if ( ! g ) return;
		if ( Number.isFinite( g.yaw ) ) c.yaw = g.yaw;
		if ( g.indoors && g.seat ) {

			// (wave 19E) through the tavern's door to a seat in its interior: seated there, drawn on its floor
			c.indoorDoor = { x: g.x, z: g.z };
			c.x = g.seat.x; c.z = g.seat.z; c.yaw = g.seat.yaw + Math.PI;
			c.indoorFloor = g.seat.floor;
			c.hidden = false;

		} else if ( g.indoors ) c.hidden = true;
		if ( g.look && g.look.sit ) {

			c.seatH = Number.isFinite( g.h ) ? g.h : 0.45;
			c.gesture = 'Sit_Chair'; // down onto the seat, then the seated loop
			c.gestureLeft = 1.5;

		}
		c.leaveVia = g.look && g.look.sit && Number.isFinite( g.yaw ) ? { x: g.x - Math.sin( g.yaw ) * 0.75, z: g.z - Math.cos( g.yaw ) * 0.75 } : null;
		if ( g.kind === 'carry' ) c.loaded = ! c.loaded;

	}

	_routeNext() {

		for ( let k = 0; k < this.routesPerFrame && this._routeQ.length; k ++ ) {

			const c = this._routeQ.shift();
			const g = c.pending;
			if ( ! g ) continue;
			c.pending = null;
			// a seat is reached from in front of it (not over the bench)
			const via = g.look && g.look.sit && Number.isFinite( g.yaw ) ? { x: g.x - Math.sin( g.yaw ) * 0.75, z: g.z - Math.cos( g.yaw ) * 0.75 } : null;
			// getting up from a seat: out to its front first
			const out = c.leaveVia;
			c.leaveVia = null;
			const sx = out ? out.x : c.x, sz = out ? out.z : c.z;
			const path = via ? this.grid.route( sx, sz, via.x, via.z ) : this.grid.route( sx, sz, g.x, g.z );
			if ( path && via ) path.push( { x: g.x, z: g.z } );
			if ( path && out ) path.unshift( out );
			if ( ! path || ! path.length ) {

				// unreachable: out of sight it simply gets there; in sight it gives up and thinks again
				if ( ! c.near ) this._teleport( c, g );
				else { c.goal = null; c.act = null; }
				continue;

			}

			c.path = path;
			c.moving = true;

		}

	}

	// what an activity asks of a citizen now (sets the goal)
	_plan( c, act ) {

		const P = this.plan, S = this.slots, R = this.rand;
		this.slots.release( c.id );
		c.react = null;
		c.queueSlot = - 1;
		c.stage = 0;
		const home = c.home;
		c.umbrella = false;
		// (wave 24E) out in the rain: up goes the umbrella, or in out of it (the workers work on in oilskins)
		if ( this.wet && OUTDOOR.has( act ) && ! c.hasUmbrella ) {

			c.sheltering = true;
			const T = P.tavern;
			// the nearer of home and the tavern
			const tav = T && act !== 'play' && Math.hypot( T.door.x - c.x, T.door.z - c.z ) < Math.hypot( home.x - c.x, home.z - c.z );
			const d = tav ? T.door : home;
			return this._goal( c, { x: d.x, z: d.z, yaw: d.yaw, indoors: true, kind: 'shelter' }, Math.hypot( d.x - c.x, d.z - c.z ) < 45 ? 'run' : 'walk' );

		}

		c.umbrella = this.wet && OUTDOOR.has( act );
		c.oilskin = this.wet && act === 'work';
		if ( this.festival && ( act === 'tavern' || act === 'promenade' || act === 'stroll' || ( act === 'play' && this.hour >= 18 ) ) ) act = 'festival';
		switch ( act ) {

			case 'school': {

				const S = this.places.school;
				return this._goal( c, { x: S.x, z: S.z, yaw: S.yaw, indoors: true, kind: 'school' } );

			}

			case 'siesta': {

				// a seat in the shade, else a nap at home
				if ( ! this.wet ) {

					const k = S.claim( 'seat', this.seats.length, c.id, Math.floor( R() * Math.max( 1, this.seats.length ) ) );
					if ( k >= 0 ) { const s = this.seats[ k ]; return this._goal( c, { x: s.x, z: s.z, yaw: s.yaw, h: s.h, look: LOOK.siesta, kind: 'seat', dwell: Infinity } ); }

				}

				return this._goal( c, { x: home.x, z: home.z, yaw: home.yaw, indoors: true, kind: 'home' } );

			}

			case 'promenade':
				return this._promenade( c );
			case 'festival':
				return this._dance( c );
			case 'sleep':
				return this._goal( c, { x: home.x, z: home.z, yaw: home.yaw, indoors: true, kind: 'home' } );
			case 'drunk':
				return this._goal( c, { x: home.x, z: home.z, yaw: home.yaw, indoors: true, kind: 'home' }, c.drunkard ? 'drunk' : 'walk' );
			case 'wake': {

				const yaw = home.yaw; // (a door's yaw faces out of the house)
				const x = home.x - Math.sin( yaw ) * 1.6, z = home.z - Math.cos( yaw ) * 1.6;
				return this._goal( c, { x, z, yaw, look: LOOK.wake, kind: 'wake' } );

			}

			case 'work':
				return this._work( c );
			case 'watch':
				return this._patrol( c );
			case 'lamps':
				return this._lamp( c );
			case 'eat': {

				const k = this.wet ? - 1 : S.claim( 'seat', this.seats.length, c.id );
				if ( k >= 0 ) { const s = this.seats[ k ]; return this._goal( c, { x: s.x, z: s.z, yaw: s.yaw, h: s.h, look: LOOK.seatEat, kind: 'seat', dwell: Infinity } ); }
				const pk = S.claim( 'patio', P.tavern ? P.tavern.patio.length : 0, c.id );
				if ( pk >= 0 ) { const s = P.tavern.patio[ pk ]; return this._goal( c, { ...s, look: LOOK.standEat, kind: 'patio', dwell: Infinity } ); }
				return this._stroll( c );

			}

			case 'tavern': {

				const T = P.tavern;
				if ( ! T ) return this._stroll( c );
				const k = S.claim( 'patio', T.patio.length, c.id );
				if ( k >= 0 ) { const s = T.patio[ k ]; return this._goal( c, { ...s, look: LOOK.patio, kind: 'patio', dwell: Infinity } ); }
				const sk = S.claim( 'seat', this.seats.length, c.id );
				if ( sk >= 0 && Math.hypot( this.seats[ sk ].x - T.door.x, this.seats[ sk ].z - T.door.z ) < 25 ) { const s = this.seats[ sk ]; return this._goal( c, { x: s.x, z: s.z, yaw: s.yaw, h: s.h, look: LOOK.seat, kind: 'seat', dwell: Infinity } ); }
				S.release( c.id );
				// the patio is full: inside, where it is loud (wave 19E: on a free seat of the tavern's interior when it has one)
				const In = this.interiorSeats ? this.interiorSeats() : null;
				const ik = In && In.length ? S.claim( 'inside', In.length, c.id ) : - 1;
				if ( ik >= 0 ) { const s = In[ ik ]; return this._goal( c, { x: T.door.x, z: T.door.z, yaw: T.door.yaw, indoors: true, kind: 'tavernIn', look: LOOK.seat, h: s.h, seat: s, dwell: Infinity } ); }
				return this._goal( c, { x: T.door.x, z: T.door.z, yaw: T.door.yaw, indoors: true, kind: 'tavernIn' } );

			}

			case 'play':
				if ( P.play ) {

					const a = R() * Math.PI * 2, r = R() * P.play.r * 0.8;
					c.stage = 0;
					return this._goal( c, { x: P.play.x + Math.cos( a ) * r, z: P.play.z + Math.sin( a ) * r, look: LOOK.play, kind: 'play', dwell: 2 + R() * 4 } );

				}

				return this._stroll( c );
			default:
				return this._stroll( c );

		}

	}

	_work( c ) {

		const W = this.plan.work, S = this.slots;
		const at = ( list, key, look ) => {

			const k = S.claim( key, list ? list.length : 0, c.id );
			if ( k < 0 ) return false;
			const s = list[ k ];
			this._goal( c, { x: s.x, z: s.z, yaw: s.yaw, look, kind: key, dwell: Infinity } );
			return true;

		};

		switch ( c.job ) {

			case 'stall': {

				const k = S.claim( 'stall', this.plan.stalls.length, c.id );
				if ( k >= 0 ) {

					const s = this.plan.stalls[ k ]; c.stall = s;
					// (wave 24E) first thing in the morning the stall is set out: crates down, goods up (once a morning)
					if ( this.hour < 9 && this.time - c.setupAt > 3000 ) {

						c.setupAt = this.time;
						return this._goal( c, { ...s.vendor, look: LOOK.stallSetup, kind: 'stallSetup', dwell: 35 } );

					}

					return this._goal( c, { ...s.vendor, look: LOOK.stall, kind: 'stall', dwell: Infinity } );

				}
				break;

			}

			case 'nets':
				if ( at( W.nets, 'nets', LOOK.nets ) || at( W.fish, 'fish', LOOK.fish ) ) return;
				break;
			case 'hammer':
				if ( at( W.hammer, 'hammer', LOOK.hammer ) ) return;
				break;
			case 'carry': {

				const k = S.claim( 'carry', W.carry.length * 2, c.id );
				if ( k >= 0 ) { c.loop = W.carry[ k % W.carry.length ]; c.loaded = false; c.stage = 0; return this._goal( c, { ...c.loop[ 0 ], look: LOOK.carryEnd, kind: 'carry', dwell: 2.5 }, 'carry' ); }
				break;

			}

			case 'barrow': {

				const k = S.claim( 'barrow', W.barrow.length, c.id );
				if ( k >= 0 ) { c.loop = W.barrow[ k ]; c.stage = 0; return this._goal( c, { ...c.loop[ 0 ], look: LOOK.wake, kind: 'barrow', dwell: 4 }, 'barrow' ); }
				break;

			}

			case 'busk': {

				// the middle of the first gathering spot: its ring of three faces the busker
				const g = this.plan.gathers[ 0 ];
				if ( g && S.claim( 'busk', 1, c.id ) >= 0 ) return this._goal( c, { x: g.x, z: g.z, yaw: c.home.yaw, look: LOOK.busk, kind: 'busk', dwell: Infinity } );
				break;

			}

			case 'sweep': {

				const k = S.claim( 'sweep', W.sweep.length, c.id );
				if ( k >= 0 ) { c.loop = W.sweep[ k ]; c.stage = 0; return this._goal( c, { ...c.loop[ 0 ], look: LOOK.sweep, kind: 'sweepAt', dwell: 12 }, 'sweep' ); }
				break;

			}

			default:
				break;

		}

		// nothing free at the job: the fish on the pier, else a stroll
		if ( c.job === 'nets' || c.job === 'carry' ) if ( at( W.fish, 'fish', LOOK.fish ) ) return;
		return this._stroll( c );

	}

	_patrol( c ) {

		const P = this.plan.patrol;
		if ( ! P || ! P.length ) return this._stroll( c );
		c.loop = P;
		c.stage = hashId( c.id ) % P.length;
		const q = P[ c.stage ];
		this._goal( c, { x: q.x, z: q.z, look: LOOK.patrol, kind: 'patrol', dwell: 4 }, 'patrol' );

	}

	_lamp( c ) {

		const L = this.plan.lamps;
		if ( ! L || ! L.length ) return this._stroll( c );
		c.loop = L;
		const q = L[ c.stage % L.length ];
		this._goal( c, { x: q.x, z: q.z, yaw: q.yaw, look: LOOK.lamp, kind: 'lamp', dwell: 3.5 } );

	}

	// (wave 24E) the evening walk: two by two along the front, a pause now and then to talk; the pair keep together
	_promenade( c ) {

		const W = this.places.walk;
		if ( ! W || W.length < 2 ) return this._stroll( c );
		// the partner follows the lead's way; the lead (or one walking alone) starts at the nearest point of the walk
		const p = this._walkMate( c );
		if ( p && ! c.pairLead && p.goal && p.goal.kind === 'promenade' ) { c.stage = p.stage; c.walkDir = p.walkDir; }
		else {

			let best = 0, bd = Infinity;
			for ( let i = 0; i < W.length; i ++ ) { const d = Math.hypot( W[ i ].x - c.x, W[ i ].z - c.z ); if ( d < bd ) { bd = d; best = i; } }
			c.stage = best;
			c.walkDir = c.walkDir || ( hashId( c.id ) % 2 ? 1 : - 1 );

		}

		return this._walkLeg( c );

	}

	// the evening walk's partner when it is out walking too
	_walkMate( c ) {

		const p = c.pair;
		return p && p.act === 'promenade' && ! p.hidden && ! p.eventRole && ! p.sheltering ? p : null;

	}

	_walkLeg( c ) {

		const W = this.places.walk, q = W[ c.stage ];
		const nx = W[ Math.min( W.length - 1, Math.max( 0, c.stage + c.walkDir ) ) ];
		// side by side: the lead on the left of the way, the partner on its right
		const dx = nx.x - q.x, dz = nx.z - q.z, L = Math.hypot( dx, dz ) || 1;
		const side = c.pair ? ( c.pairLead ? - 0.42 : 0.42 ) : 0;
		let x = q.x + dz / L * side, z = q.z - dx / L * side;
		if ( this.grid && this.grid.ready ) { const f = this.grid.nearestFree( x, z, 2 ); if ( f ) { x = f.x; z = f.z; } }
		const pause = hashId( ( c.pair && ! c.pairLead ? c.pair.id : c.id ) + ':' + c.stage ) % 4 === 0; // a stop to talk at one point in four (the pair's)
		// a partner left behind catches up at a brisk walk
		const p = this._walkMate( c );
		const behind = p && ! c.pairLead && Math.hypot( p.x - c.x, p.z - c.z ) > 4;
		this._goal( c, { x, z, yaw: yawToward( q.x, q.z, nx.x, nx.z ), look: pause ? LOOK.walkTalk : LOOK.alone, kind: 'promenade', dwell: pause ? 8 : 0.3 }, behind ? 'walk' : 'promenade' );

	}

	// (wave 24E) the festival: a ring of dancers round the square, the rest clapping along the edge
	_dance( c ) {

		const F = this.places.fest;
		if ( ! F ) return this._stroll( c );
		const k = this.slots.claim( 'dance', F.dance.length, c.id );
		if ( k >= 0 ) { const s = F.dance[ k ]; return this._goal( c, { ...s, look: LOOK.dance, kind: 'festival', dwell: Infinity } ); }
		const w = this.slots.claim( 'festWatch', F.watch.length, c.id );
		if ( w >= 0 ) { const s = F.watch[ w ]; return this._goal( c, { ...s, look: LOOK.watchFest, kind: 'festival', dwell: Infinity } ); }
		return this._stroll( c );

	}

	// a stroll: a gathering, a stall to browse, a seat, or somewhere along the streets
	_stroll( c ) {

		const P = this.plan, S = this.slots, R = this.rand;
		S.release( c.id );
		c.gather = null;
		// (wave 24E) the city: over the road at the lights, or to wait for the bus
		if ( this.crossings.length && R() < 0.25 ) {

			let best = null, bd = 140;
			for ( const cr of this.crossings ) for ( const [ a, b ] of [ [ cr.a, cr.b ], [ cr.b, cr.a ] ] ) {

				const d = Math.hypot( a.x - c.x, a.z - c.z );
				if ( d < bd ) { bd = d; best = { cr, a, b }; }

			}

			if ( best ) { c.cross = best; return this._goal( c, { x: best.a.x, z: best.a.z, yaw: yawToward( best.a.x, best.a.z, best.b.x, best.b.z ), look: LOOK.queue, kind: 'crossWait', dwell: 75 } ); }

		}

		if ( this.busStops.length && R() < 0.12 ) {

			const s = this.busStops[ Math.floor( R() * this.busStops.length ) ];
			const a = R() * Math.PI * 2, r = 0.6 + R() * 1.4;
			let x = s.x + Math.cos( a ) * r, z = s.z + Math.sin( a ) * r;
			if ( this.grid && this.grid.ready ) { const q = this.grid.nearestFree( x, z, 2 ); if ( q ) { x = q.x; z = q.z; } }
			return this._goal( c, { x, z, yaw: s.yaw, look: LOOK.queue, kind: 'busWait', stop: s.node, dwell: 240 } );

		}

		let roll = R();
		// (wave 24E) a market day: most of a stroll is spent at the stalls; no one sits about in the rain
		if ( this.marketDay && this.hour >= 7.5 && this.hour < 13.5 && P.stalls.length && R() < 0.65 ) roll = 0.5;
		if ( roll < 0.45 && P.gathers.length ) {

			// prefer a gathering someone already waits at
			const order = P.gathers.map( ( g, i ) => [ S.count( g.id ) % 3 ? 0 : 1, R(), i ] ).sort( ( a, b ) => a[ 0 ] - b[ 0 ] || a[ 1 ] - b[ 1 ] );
			for ( const [ , , i ] of order ) {

				const g = P.gathers[ i ];
				const k = S.claim( g.id, g.slots.length, c.id );
				if ( k < 0 ) continue;
				c.gather = g;
				const s = g.slots[ k ];
				return this._goal( c, { ...s, look: LOOK.gather, kind: 'gather', dwell: 30 + R() * 50 } );

			}

		}

		if ( roll < 0.7 && P.stalls.length ) {

			// a stall: at its counter (haggling with the vendor), else waiting a step behind
			const s = P.stalls[ Math.floor( R() * P.stalls.length ) ];
			const fronts = this.places.fronts[ s.id ] || s.front;
			const k = S.claim( 'front:' + s.id, fronts.length, c.id, 0 );
			if ( k >= 0 ) return this._goal( c, { ...fronts[ k ], look: k < s.front.length ? LOOK.haggle : LOOK.browse, kind: 'browse', stall: s, dwell: 15 + R() * 25 } );

		}

		if ( roll < 0.82 && this.seats.length && ! this.wet ) {

			const k = S.claim( 'seat', this.seats.length, c.id, Math.floor( R() * this.seats.length ) );
			if ( k >= 0 ) { const s = this.seats[ k ]; return this._goal( c, { x: s.x, z: s.z, yaw: s.yaw, h: s.h, look: LOOK.seat, kind: 'seat', dwell: 40 + R() * 60 } ); }

		}

		// along a street
		const st = P.streets[ Math.floor( R() * P.streets.length ) ];
		if ( st && st.pts.length >= 2 ) {

			const i = Math.floor( R() * ( st.pts.length - 1 ) ), t = R();
			const a = st.pts[ i ], b = st.pts[ i + 1 ];
			let x = a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * t, z = a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * t;
			let q = { x, z };
			if ( this.grid && this.grid.ready ) q = this.grid.nearestFree( x, z, 4 );
			if ( q ) return this._goal( c, { x: q.x, z: q.z, look: LOOK.alone, kind: 'wander', dwell: 6 + R() * 14 } );

		}

		return this._goal( c, { x: c.home.x, z: c.home.z, yaw: c.home.yaw, look: LOOK.wake, kind: 'wake', dwell: 30 } );

	}

	// the next leg of a loop (carry, barrow, sweep, patrol, lamps) or the next stroll
	_next( c ) {

		const g = c.goal;
		if ( ! g ) return;
		const R = this.rand;
		switch ( g.kind ) {

			case 'carry': {

				// (wave 24E) the catch carried up from a skiff: back to the day once the last crate is in
				if ( c.unloadN > 0 && c.stage === 1 && ! c.loaded ) {

					c.unloadN --;
					if ( c.unloadN <= 0 ) { c.loop = null; c.act = null; c.goal = null; return; }

				}

				c.stage = 1 - c.stage;
				const q = c.loop[ c.stage ];
				// (the bucket chain's runners run)
				return this._goal( c, { ...q, look: LOOK.carryEnd, kind: 'carry', dwell: c.bucket ? 1.5 : 2.5 }, c.bucket ? 'run' : 'carry' );

			}

			case 'stallSetup':
				return this._goal( c, { ...c.stall.vendor, look: LOOK.stall, kind: 'stall', dwell: Infinity } );
			case 'promenade': {

				// the lead waits at each point until the partner is beside it; the partner goes where the lead goes
				const p = this._walkMate( c );
				const W = this.places.walk;
				if ( p && c.pairLead ) {

					if ( Math.hypot( p.x - c.x, p.z - c.z ) > 2.5 && c.waitT < 30 ) return;

				} else if ( p && p.goal && p.goal.kind === 'promenade' ) {

					if ( p.stage === c.stage && c.waitT < 30 ) return; // the lead has not gone on yet
					c.stage = p.stage; c.walkDir = p.walkDir;
					return this._walkLeg( c );

				}

				let s = c.stage + c.walkDir;
				if ( s < 0 || s >= W.length ) { c.walkDir = - c.walkDir; s = c.stage + c.walkDir; }
				c.stage = Math.max( 0, Math.min( W.length - 1, s ) );
				return this._walkLeg( c );

			}

			case 'quay':
			case 'backoff':
				c.eventRole = null;
				c.act = null;
				c.goal = null;
				return;

			case 'barrow':
			case 'sweepAt':
			case 'patrol': {

				c.stage = ( c.stage + 1 ) % c.loop.length;
				const q = c.loop[ c.stage ];
				const mode = g.kind === 'barrow' ? 'barrow' : g.kind === 'patrol' ? 'patrol' : 'sweep';
				return this._goal( c, { x: q.x, z: q.z, yaw: q.yaw, look: g.look, kind: g.kind, dwell: g.kind === 'sweepAt' ? 12 : g.kind === 'barrow' ? 4 : 4 + R() * 3 }, mode );

			}

			case 'lamp':
				c.stage ++;
				if ( c.stage >= c.loop.length ) { c.stage = 0; return this._goal( c, { x: c.home.x, z: c.home.z, yaw: c.home.yaw, look: LOOK.wake, kind: 'wake', dwell: Infinity } ); }
				return this._lamp( c );
			case 'play': {

				const P = this.plan.play;
				const a = R() * Math.PI * 2, r = R() * P.r * 0.85;
				return this._goal( c, { x: P.x + Math.cos( a ) * r, z: P.z + Math.sin( a ) * r, look: LOOK.play, kind: 'play', dwell: 2 + R() * 4 }, 'chase' );

			}

			default:
				if ( c.act === 'stroll' || g.kind === 'wander' || g.kind === 'gather' || g.kind === 'browse' || g.kind === 'seat' || g.kind === 'crossing' || g.kind === 'crossWait' || g.kind === 'busWait' ) return this._stroll( c );

		}

	}

	// ------------------------------------------------------------------ frame

	update( dt, hour, viewer = null ) {

		dt = Math.min( Math.max( dt || 0, 0 ), 0.25 );
		this.time += dt;
		this.hour = hour;
		const P = this.plan;
		const vd = viewer ? Math.hypot( viewer.x - P.center.x, viewer.z - P.center.z ) : Infinity;
		this.dormant = vd > P.radius + DORMANT_R || ! this.grid || ! this.grid.ready;
		if ( this.alarmT > 0 ) this.alarmT -= dt;
		if ( this.queueT > 0 ) {

			this.queueT -= dt;
			this.queueServeT -= dt;
			if ( this.queueServeT <= 0 ) { this.queueServeT = 14; this._serveQueue(); }
			if ( this.queueT <= 0 ) for ( const c of this.list ) if ( c.queueSlot >= 0 ) { c.queueSlot = - 1; c.act = null; }

		}

		if ( ! this.dormant ) { this._places(); this._routeNext(); }
		const list = this.list;
		for ( let i = 0; i < list.length; i ++ ) {

			const c = list[ i ];
			const d2 = viewer ? ( c.x - viewer.x ) ** 2 + ( c.z - viewer.z ) ** 2 : Infinity;
			c.near = d2 < NEAR_R * NEAR_R && ! this.dormant;
			c.acc += dt;
			// (wave 24E: one with no plan yet thinks at once: a town woken with the player already in it, after a load or a
			// start there, has everyone at their places, not the whole town walking out of its doors together)
			if ( ! c.near && c.act !== null ) {

				if ( c.acc < ( this.dormant ? FAR_TICK * 4 : FAR_TICK ) ) continue;

			}

			const step = c.acc;
			c.acc = 0;
			this._think( c, step );
			this._move( c, step, viewer );

		}

		if ( ! this.dormant ) this._tag( dt );
		this._eventStep( dt );
		this._chainStep( dt );

	}

	_think( c, dt ) {

		// running indoors under fire: stay in until the alarm is over
		if ( c.fleeing ) {

			c.fleeT -= dt;
			if ( c.fleeT > 0 ) return;
			c.fleeing = false;
			c.act = null;

		}

		if ( c.react ) {

			c.react.t -= dt;
			if ( c.react.t <= 0 ) c.react = null;
			return;

		}

		if ( c.talkT > 0 ) { c.talkT -= dt; return; }
		if ( c.queueSlot >= 0 ) return;
		// (wave 24E) the weather: in out of the rain until it stops; up with the umbrella when it starts
		if ( c.sheltering ) {

			if ( this.wet && ! c.eventRole ) return;
			c.sheltering = false;
			c.act = null;

		}

		const act = townActivity( c.role, this.hour + c.hourOff );
		if ( ! c.eventRole && ! c.hidden && c.act === act ) {

			const out = OUTDOOR.has( act );
			if ( this.wet && out && ( ! c.hasUmbrella || ( c.goal && c.goal.look && c.goal.look.sit ) ) && ! c.umbrella ) { this._plan( c, act ); return; }
			if ( this.wet && out && c.hasUmbrella && ! c.umbrella ) c.umbrella = true;
			if ( ! this.wet && ( c.umbrella || c.oilskin ) ) { c.umbrella = false; c.oilskin = false; }
			if ( this.wet && act === 'work' ) c.oilskin = true;

		}

		// an event owns the goals while it lasts (the procession, the quay crowd, the bucket chain)
		if ( c.eventRole ) {

			if ( c.eventRole === 'quay' && this.time > c.eventUntil && c.goal ) return this._next( c );
			if ( ! c.arrived || ! c.goal ) return;
			c.waitT += dt;
			if ( c.waitT >= ( c.goal.dwell ?? Infinity ) ) return this._next( c );
			this._gesture( c, dt );
			return;

		}

		if ( act !== c.act ) {

			c.act = act;
			this._plan( c, act );
			return;

		}

		if ( ! c.arrived || ! c.goal ) {

			if ( ! c.goal && ! c.pending && ! c.moving ) this._plan( c, act );
			return;

		}

		c.waitT += dt;
		// a gathering of one does not last
		const g = c.goal;
		// (wave 24E) at the lights: over when the traffic it crosses has a red
		if ( g.kind === 'crossWait' && c.cross && this.crossOK && this.crossOK( c.cross.cr ) ) {

			const b = c.cross.b;
			c.cross = null;
			return this._goal( c, { x: b.x, z: b.z, look: LOOK.alone, kind: 'crossing', dwell: 0.5 }, 'back' );

		}
		if ( g.kind === 'gather' && c.gather ) {

			const company = this.slots.count( c.gather.id ) > 1;
			g.look = company ? LOOK.gather : LOOK.alone;
			if ( ! company && c.waitT > 25 ) return this._stroll( c );

		}

		if ( c.waitT >= ( g.dwell ?? Infinity ) ) return this._next( c );
		// (wave 24E) a vendor with someone at the counter haggles: talks, shrugs and points far more often
		if ( g.kind === 'stall' && c.stall && this.slots.count( 'front:' + c.stall.id ) > 0 ) c.gestureT -= dt * 2;
		this._gesture( c, dt );

	}

	// idle gestures (bodies only care; the far ones skip them)
	_gesture( c, dt ) {

		const g = c.goal;
		if ( c.gesture ) {

			c.gestureLeft -= dt;
			if ( c.gestureLeft <= 0 ) c.gesture = null;

		} else if ( c.near && g && g.look && g.look.gestures && g.look.gestures.length ) {

			c.gestureT -= dt;
			if ( c.gestureT <= 0 ) {

				c.gestureT = 6 + this.rand() * 9;
				c.gesture = g.look.gestures[ Math.floor( this.rand() * g.look.gestures.length ) ];
				c.gestureLeft = 3.2;

			}

		}

	}

	_move( c, dt, viewer ) {

		c.speedNow = 0;
		if ( c.standT > 0 ) { c.standT -= dt; return; }
		if ( c.react ) {

			c.yaw += wrap( c.react.yaw - c.yaw ) * Math.min( 1, dt * 6 );
			return;

		}

		if ( c.talkT > 0 && viewer ) {

			c.yaw += wrap( yawToward( c.x, c.z, viewer.x, viewer.z ) - c.yaw ) * Math.min( 1, dt * 5 );
			return;

		}

		if ( ! c.moving || ! c.path ) return;
		const sp = c.mode === 'run' ? SPEED.run : c.mode === 'drunk' ? SPEED.drunk : c.mode === 'walk' ? c.walkSpeed : SPEED[ c.mode ] || c.walkSpeed;
		let left = sp * dt;
		c.speedNow = sp;
		let guard = 0;
		while ( left > 1e-4 && c.path.length && guard ++ < 32 ) {

			const n = c.path[ 0 ];
			const dx = n.x - c.x, dz = n.z - c.z, d = Math.hypot( dx, dz );
			if ( d <= left ) {

				c.x = n.x; c.z = n.z;
				left -= d;
				c.path.shift();
				continue;

			}

			c.x += dx / d * left;
			c.z += dz / d * left;
			const want = yawToward( 0, 0, dx, dz );
			c.yaw += wrap( want - c.yaw ) * Math.min( 1, dt * 7 );
			left = 0;

		}

		if ( ! c.path.length ) {

			this._arrive( c );
			return;

		}

		// personal space and the player: a small sidestep that stays on free ground (near citizens only)
		if ( c.near ) this._avoid( c, dt, viewer );
		if ( c.mode === 'drunk' ) c.sway += dt * 1.7;

	}

	_avoid( c, dt, viewer ) {

		let px = 0, pz = 0;
		const all = this.list;
		for ( let i = 0; i < all.length; i ++ ) {

			const o = all[ i ];
			if ( o === c || o.hidden || ! o.near ) continue;
			const dx = c.x - o.x, dz = c.z - o.z;
			if ( Math.abs( dx ) > SEP || Math.abs( dz ) > SEP ) continue;
			const d = Math.hypot( dx, dz );
			if ( d < 1e-3 || d > SEP ) continue;
			const k = ( SEP - d ) / SEP;
			px += dx / d * k; pz += dz / d * k;

		}

		if ( viewer ) {

			const dx = c.x - viewer.x, dz = c.z - viewer.z, d = Math.hypot( dx, dz );
			if ( d > 1e-3 && d < 1.3 ) { const k = ( 1.3 - d ) / 1.3 * 1.5; px += dx / d * k; pz += dz / d * k; }

		}

		if ( ! px && ! pz ) return;
		const m = Math.min( 1, dt * 2.2 );
		const nx = c.x + px * m, nz = c.z + pz * m;
		// half a metre on in the push's direction must be free too (the cells are 1 m: a post sits inside a free one's edge)
		const L = Math.hypot( px, pz ) || 1;
		if ( ! this.grid || this.grid.clear( c.x, c.z, nx + px / L * 0.5, nz + pz / L * 0.5 ) ) { c.x = nx; c.z = nz; }

	}

	// the children's tag: the one who is "it" chases the nearest, the rest keep away inside the play area
	_tag( dt ) {

		const P = this.plan.play;
		if ( ! P ) return;
		const kids = this._kids || ( this._kids = [] );
		kids.length = 0;
		for ( const c of this.list ) if ( c.act === 'play' && c.near && ! c.hidden && c.goal && c.goal.kind === 'play' ) kids.push( c );
		if ( kids.length < 2 ) return;
		let it = kids.find( ( k ) => k.tagIt );
		if ( ! it ) { it = kids[ 0 ]; it.tagIt = true; it.tagFreeze = 1.5; }
		for ( const k of kids ) {

			if ( k.tagFreeze > 0 ) { k.tagFreeze -= dt; k.moving = false; k.path = null; continue; }
			let tx, tz, sp;
			if ( k === it ) {

				let best = null, bd = Infinity;
				for ( const o of kids ) if ( o !== k ) { const d = Math.hypot( o.x - k.x, o.z - k.z ); if ( d < bd ) { bd = d; best = o; } }
				if ( ! best ) continue;
				if ( bd < 0.7 ) {

					// tagged: the other one is it now and counts to three
					k.tagIt = false; best.tagIt = true; best.tagFreeze = 1.8; k.tagFreeze = 0.4;
					best.react = { clip: 'Cheer_Clap', t: 1.2, yaw: best.yaw };
					continue;

				}

				tx = best.x; tz = best.z; sp = SPEED.chase;

			} else {

				const d = Math.hypot( k.x - it.x, k.z - it.z );
				if ( d > 6 ) continue; // the wander goal moves it
				tx = k.x + ( k.x - it.x ) / ( d || 1 ) * 3; tz = k.z + ( k.z - it.z ) / ( d || 1 ) * 3; sp = SPEED.flee;

			}

			// stay inside the play area
			const ox = tx - P.x, oz = tz - P.z, od = Math.hypot( ox, oz );
			if ( od > P.r ) { tx = P.x + ox / od * P.r; tz = P.z + oz / od * P.r; }
			const dx = tx - k.x, dz = tz - k.z, d = Math.hypot( dx, dz );
			if ( d < 0.05 ) continue;
			const s = Math.min( d, sp * dt );
			const nx = k.x + dx / d * s, nz = k.z + dz / d * s;
			if ( this.grid && ! this.grid.free( nx, nz ) ) continue;
			k.x = nx; k.z = nz;
			k.path = null;
			k.moving = true;
			k.mode = 'chase';
			k.speedNow = sp;
			k.yaw = yawToward( 0, 0, dx, dz );
			k.waitT = 0;
			k._tagT = 0.25; // seen moving this frame

		}

		for ( const k of kids ) {

			if ( k._tagT > 0 ) { k._tagT -= dt; if ( k._tagT <= 0 ) k.moving = false; }

		}

	}

}
