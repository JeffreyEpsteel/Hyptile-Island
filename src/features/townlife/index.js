import { Vector3, Color } from '../../engine/index.js';
import { Avatar } from '../../player/Avatar.js';
import { GESTURE_FALLBACK, yawToward } from '../../world/residents/ResidentData.js';
import { mulberry32 } from '../../util/Noise.js';
import { TownAnimals } from '../../world/wildlife/TownAnimals.js';
import { townPlans, POPULATION, externalSeats } from './Towns.js';
import { NavGrid, collidersSolids } from './NavGrid.js';
import { TownSim, townActivity, TOWN_SCHEDULES } from './Citizens.js';
import { TownMeshes } from './Render.js';
import { villageSeats } from '../../world/Village.js';
import { tidemarkSeats } from '../../world/islands/town/Waterfront.js';
import { blackwaterSeats } from '../../world/islands/Blackwater.js';
import { CROWD_LOOKS, POSE, FLAG } from './Crowd.js';
import { Gulls } from '../../world/Gulls.js';
import { SeaLife } from '../../world/wildlife/SeaLife.js';
import { Calendar, EVENT_KINDS } from './Events.js';

// Town life (wave 18B): the towns feel lived in, day and night. The home village, Tidemark and Blackwater's pirate town
// get their townsfolk (Towns.js POPULATION: 12 / 47 / 16 on a desktop, half on a phone; Tidemark's harbour residents
// bring it to ~55), each with a home, a job and a day plan (Citizens.js): vendors at the market stalls calling out (a
// toast when the player is near), fishermen mending nets on the quay, dockhands carrying crates, a carter with his
// barrow, the boatwright's hammer, sweepers, folk strolling, gathering in twos and threes, browsing the stalls, sitting
// on the benches (wave 18C's `seats` when the town exports them), eating at noon, the tavern busy and loud at night,
// drunks swaying home, the lamplighter at dusk, the watch with a lit lantern, children playing tag on the beach. They
// walk the streets on a NavGrid (NavGrid.js: dry land and the decks, clear of every wall and prop), keep their
// distance, step round the player, wave as the player passes, answer E with a line of their role, run indoors under
// cannon fire, a raid or an explosion, clap a big catch landed near them and queue at the fish hall when the skiffs
// come in. Dogs, cats, chickens and goats (src/world/wildlife/TownAnimals.js) and the local skiffs complete the place.
//
// Cost: the nearest citizens (24 on a desktop, 12 on a phone, fewer when the harbour residents are close) get a lite
// Avatar each (pooled by character) and animate at full rate within the residents' animate radius; everyone else is
// a cheap instanced figure out to the residents' hide radius (one draw per town), stepping at 2 Hz; a town far out of
// range only jumps between its places. The NavGrid of a town is built in slices once the player comes within ~600 m.
//
//   features.add( 'townlife', townlifeModule );     (after harbour, stronghold and life; app.residents may be null)
//   const tl = features.get( 'townlife' );
//   tl.crowd( port ) -> people at that port's tavern     tl.citizens( townId ) / tl.sims / tl.townAt( x, z )
//   tl.alarm( port, seconds ) / tl.cheer( x, z ) / tl.callQueue( port )
//   tl.lights (the watch's lanterns), update( dt ), reset(), dispose()
// Events emitted: townsfolkTalked { id, name, role, port }. Listens to: cannonFired, cannonballImpact, explosion,
// gunshot, retaliationRaid, strongholdAlarm, fishCaught, fishSold.

const LOD_TICK = 0.25; // s between body assignments
const BUILD_BUDGET = 3500; // grid cells a frame while a town's grid is built
const WAKE_R = 600; // m beyond a town's radius: start its grid
const ANIMAL_R = 220; // m beyond the radius: its animals live
const SKIFF_SPEED = 2.4; // m/s
const HOUR_S = 100; // real seconds per island hour at the default clock (a 40-minute day)

// what to play when a GLB lacks a wave-18E clip (the names are 18E's; each chain ends on a phase-1 clip)
export const CLIP_CHAIN = {
	Sit_Chair_Idle: [ 'Sit_Chair_Idle', 'Seated_Idle' ], Sit_Chair: [ 'Sit_Chair', 'Sit_Down', 'Seated_Idle' ],
	Drink: [ 'Drink', 'Chat_Gesture', 'Talk' ], Eat: [ 'Eat', 'Inspect_Catch', 'Idle_Breathe' ],
	Carry_Box: [ 'Carry_Box', 'Walk_InPlace' ], Kneel_Work: [ 'Kneel_Work', 'Crouch', 'Inspect_Catch' ], Crouch: [ 'Crouch', 'Inspect_Catch' ],
	Fish_Net: [ 'Fish_Net', 'Kneel_Work', 'Inspect_Catch' ], Hammer: [ 'Hammer', 'Kneel_Work', 'Inspect_Catch' ],
	Talk_Group: [ 'Talk_Group', 'Chat_Gesture', 'Talk' ], Clap: [ 'Clap', 'Cheer_Clap' ], Point_Out: [ 'Point_Out', 'Point', 'Wave' ],
	Sweep: [ 'Sweep', 'Sweep_Work', 'Idle_Breathe' ], Drunk_Walk: [ 'Drunk_Walk', 'Walk_InPlace' ], Lamp_Light: [ 'Lamp_Light', 'Point', 'Wave' ],
	Lean_Wall: [ 'Lean_Wall', 'Swagger_Idle', 'Idle_Breathe' ], Stand_From_Chair: [ 'Stand_From_Chair', 'Stand_Up', 'Idle_Breathe' ],
	// wave 24E: a stare at a drawn gun, the festival's dances, a pirate squaring up
	Stare: [ 'Stare', 'Idle_Breathe' ], Dance: [ 'Dance', 'Cheer_Clap' ], Dance_2: [ 'Dance_2', 'Dance', 'Cheer_Clap' ], Swagger_Idle: [ 'Swagger_Idle', 'Idle_Breathe' ],
};
// clips held as loops when they are a base pose
const SEAT_DROP = 0.45; // m: the seat height the seat clips are made for (18E Sit_Chair)
const CHAR_TINT = {
	hyptile: [ 0.55, 0.8, 0.6 ], pepe: [ 0.45, 0.7, 0.4 ], doge: [ 0.9, 0.75, 0.45 ], bonk: [ 0.95, 0.55, 0.25 ], pengu: [ 0.35, 0.45, 0.6 ],
	bravile: [ 0.9, 0.8, 0.4 ], heptyle: [ 0.6, 0.65, 0.75 ], clown: [ 0.75, 0.4, 0.7 ],
};

// (wave 24E) the umbrellas' canopies (a citizen keeps its own colour) and the festival's paper lanterns
const UMBRELLAS = [ [ 0.75, 0.12, 0.1 ], [ 0.12, 0.25, 0.55 ], [ 0.1, 0.1, 0.11 ], [ 0.85, 0.65, 0.12 ], [ 0.2, 0.45, 0.25 ], [ 0.6, 0.2, 0.45 ], [ 0.9, 0.88, 0.82 ] ];
const UMBRELLAS_L = UMBRELLAS.map( ( c ) => c.map( ( v ) => Math.pow( v, 2.2 ) ) );
const OILSKIN = [ 0.85, 0.62, 0.02 ].map( ( v ) => Math.pow( v, 2.2 ) );
const FESTOON = [ [ 1.0, 0.45, 0.2 ], [ 1.0, 0.8, 0.35 ], [ 0.95, 0.3, 0.35 ], [ 0.5, 0.85, 0.5 ], [ 0.45, 0.65, 1.0 ] ];
const umbrellaIndex = ( c ) => ( c._umb ?? ( c._umb = [ ...c.id ].reduce( ( h, ch ) => ( h * 31 + ch.charCodeAt( 0 ) ) >>> 0, 7 ) % UMBRELLAS.length ) );
const umbrellaTint = ( c ) => UMBRELLAS[ umbrellaIndex( c ) ];
const umbrellaLinear = ( c ) => UMBRELLAS_L[ umbrellaIndex( c ) ];

export function resolveClip( model, name ) {

	const has = ( n ) => model && model.clips && model.clips.has( n );
	if ( ! model || ! model.clips ) return name;
	const cache = model._townClips || ( model._townClips = new Map() );
	if ( cache.has( name ) ) return cache.get( name );
	let out = null;
	for ( const n of CLIP_CHAIN[ name ] || [ name ] ) if ( has( n ) ) { out = n; break; }
	if ( ! out ) for ( let n = GESTURE_FALLBACK[ name ], i = 0; n && i < 4; n = GESTURE_FALLBACK[ n ], i ++ ) if ( has( n ) ) { out = n; break; }
	if ( ! out ) out = 'Idle_Breathe';
	cache.set( name, out );
	return out;

}

const _yAxis = new Vector3( 0, 1, 0 );
// wave 20A: the roster faces' pupils, rims and lids sit on the eyeball (inside its silhouette): they cast no shadow of their own
// (6 of a body's 9 meshes, each drawn again in every shadow cascade); the eyes themselves still do
export const EYE_PART = /_(Pupil|Rim|Lid)_[lr]$/;

export class TownLife {

	constructor( app, features, opts = {} ) {

		this.app = app || {};
		this.features = features;
		this.opts = opts;
		this.phone = opts.phone ?? !! globalThis.__phoneBudget;
		this.scale = opts.scale ?? ( this.phone ? 0.5 : 1 );
		this.bodyCap = opts.bodies ?? ( this.phone ? 12 : 24 );
		this.factory = opts.avatarFactory || ( ( o ) => new Avatar( o ) );
		this.rand = opts.rand || mulberry32( 1818 );
		this.scene = this.app.scene || null;
		this.render = opts.render !== false && !! this.scene;
		this.time = 0;
		this.towns = townPlans().map( ( plan, i ) => ( {
			plan, grid: null, ready: false, linked: false, skiffPhase: [],
			sim: new TownSim( plan, { rand: mulberry32( 77 + i * 131 ), scale: this.scale, roster: POPULATION[ plan.id ] } ),
		} ) );
		this.sims = Object.fromEntries( this.towns.map( ( t ) => [ t.plan.id, t.sim ] ) );
		this.meshes = this.render ? new TownMeshes( this.scene, { crowd: Math.max( 24, Math.ceil( 76 * this.scale ) + 4 ), props: 16, skiffs: 6 } ) : null;
		this.animals = new TownAnimals( { scene: this.render ? this.scene : null, render: this.render } );
		this.bound = new Map(); // citizen -> body
		this.pool = [];
		this._lodT = 0;
		this._toastT = 0;
		this._clip = { name: '', loop: true, speed: 1 };
		this._talk = null;
		this._prev = null;
		this.viewer = { x: 0, z: 0, speed: 0, mode: 'walk' };
		// the watch's lanterns: a lamp each (LocalLights sources, on from dusk while the watchman is out)
		this.lights = [];
		for ( const t of this.towns ) for ( const c of t.sim.list ) {

			if ( ! c.lantern ) continue;
			// (scale 0 while the watchman is home: LocalLights skips a disabled source's update, so it stays enabled)
			const src = { position: new Vector3( c.x, 1, c.z ), color: new Color( 1.0, 0.72, 0.42 ), intensity: 6, range: 10, kind: 'lantern', flicker: 0.1, scale: 0 };
			src.update = () => this._lanternLight( src, c );
			c.light = src;
			this.lights.push( src );

		}

		// wave 24E: the calendar's occasions, the regatta's boats, the gulls after the catch, the life in the water, the
		// festival's lamps (LocalLights sources, off until a festival night)
		this.calendar = new Calendar();
		this.regattas = new Map(); // townId -> { boats: [ { x, z, yaw, lap, k, speed, heel } ], t }
		this._procDone = new Map(); // townId -> the day its procession went
		this._shipNear = new Set();
		this._shipT = 0;
		this._stareT = 0;
		this.flocks = this.render ? new Gulls( { scene: this.scene, count: 16, seed: 24, follow: { group: 8, radius: [ 7, 15 ], height: [ 5, 11 ] } } ) : null;
		this.sea = new SeaLife( { scene: this.render ? this.scene : null, render: this.render, terrain: this.app.terrainData || this.app.terrain || null, rand: mulberry32( 2424 ),
			splash: ( x, y, z, s ) => this.features?.get?.( 'vfx' )?.splash?.( x, y, z, s ) } );
		for ( const t of this.towns ) {

			const F = t.sim.places.fest;
			t.festLights = [];
			if ( ! F ) continue;
			for ( let i = 0; i < 3; i ++ ) {

				const a = i / 3 * Math.PI * 2;
				const src = { position: new Vector3( F.x + Math.cos( a ) * 4, 3.6, F.z + Math.sin( a ) * 4 ), color: new Color( 1.0, [ 0.55, 0.75, 0.62 ][ i ], [ 0.35, 0.5, 0.75 ][ i ] ), intensity: 9, range: 14, kind: 'festival', flicker: 0.05, scale: 0 };
				src.update = () => { src.scale = t.sim.festival && t.ready ? 1 : 0; };
				t.festLights.push( src );
				this.lights.push( src );

			}

		}

		this._off = [];
		const on = ( name, fn ) => {

			if ( features && features.on ) this._off.push( features.on( name, ( e ) => { try { fn( e || {} ); } catch ( err ) { console.warn( 'townlife', name, err ); } } ) );

		};
		const at = ( e ) => Number.isFinite( e.x ) && Number.isFinite( e.z );
		on( 'cannonFired', ( e ) => at( e ) && this._danger( e.x, e.z, 170, 70 ) );
		on( 'cannonballImpact', ( e ) => at( e ) && this._danger( e.x, e.z, 120, 70 ) );
		on( 'explosion', ( e ) => at( e ) && this._danger( e.x, e.z, 110, 60 ) );
		on( 'gunshot', ( e ) => at( e ) && this._danger( e.x, e.z, 45, 40 ) );
		on( 'retaliationRaid', ( e ) => { if ( e.at === 'harbour' ) this.alarm( 'home', 120 ); } );
		on( 'strongholdAlarm', ( e ) => { if ( e.state === 'alarm' ) this.alarm( 'blackwater', 90 ); } );
		on( 'fishCaught', ( e ) => this._caught( e ) );
		on( 'fishSold', ( e ) => this.callQueue( e.port || null ) );
		// (wave 24E) a ship coming in: the quay fills to watch; a fire in town: a bucket chain from the quay
		on( 'portVisited', ( e ) => {

			const p = this.app.player;
			if ( e.port && p && ( p.mode === 'boat' || p.mode === 'deck' || p.mode === 'seat' ) ) this.shipArrived( e.port );

		} );
		on( 'rivalArrived', ( e ) => e.port && this.shipArrived( e.port, 40 ) );
		on( 'firePool', ( e ) => at( e ) && this.fire( e.x, e.z ) );
		on( 'cityFire', ( e ) => at( e ) && e.on && this.fire( e.x, e.z ) );
		this._removers = [];
		if ( features && features.interactable ) {

			this._removers.push( features.interactable( {
				id: 'townlife:talk', radius: 2.6,
				position: () => this._talk ? { x: this._talk.x, y: this._talk.y, z: this._talk.z } : null,
				prompt: () => this._talk ? `Talk to ${ this._talk.name }` : null,
				onInteract: () => this.talkTo( this._talk ),
				when: () => ! this.app.player || this.app.player.mode === 'walk',
			} ) );

		}

	}

	// ------------------------------------------------------------------ public

	citizens( townId = null ) {

		const out = [];
		for ( const t of this.towns ) if ( ! townId || t.plan.id === townId ) out.push( ...t.sim.list );
		return out;

	}

	townAt( x, z ) {

		let best = null, bd = Infinity;
		for ( const t of this.towns ) {

			const d = Math.hypot( x - t.plan.center.x, z - t.plan.center.z );
			if ( d < t.plan.radius && d < bd ) { bd = d; best = t; }

		}

		return best;

	}

	crowd( port = 'home' ) {

		let n = 0;
		for ( const t of this.towns ) if ( t.plan.port === port ) n += t.sim.crowd();
		return n;

	}

	alarm( port, seconds = 90 ) {

		let n = 0;
		for ( const t of this.towns ) if ( t.plan.port === port ) n += t.sim.alarm( null, null, seconds );
		const hb = this.features && this.features.get ? this.features.get( 'harbour' ) : null;
		if ( hb && hb.alarm ) hb.alarm( port, seconds );
		return n;

	}

	cheer( x, z ) {

		let n = 0;
		for ( const t of this.towns ) n += t.sim.cheer( x, z );
		return n;

	}

	callQueue( port = null ) {

		let n = 0;
		for ( const t of this.towns ) {

			if ( port && t.plan.port !== port ) continue;
			if ( ! port ) {

				const p = this._viewerPos();
				if ( ! p || Math.hypot( p.x - t.plan.center.x, p.z - t.plan.center.z ) > t.plan.radius ) continue;

			}

			n += t.sim.callQueue();

		}

		return n;

	}

	// (wave 24E) a ship has come into this port: a crowd on the quay
	shipArrived( port, seconds = 60 ) {

		let n = 0;
		for ( const t of this.towns ) if ( t.plan.port === port && t.ready ) n += t.sim.gatherQuay( seconds );
		return n;

	}

	// (wave 24E) a fire at (x, z): the town it is in forms a bucket chain
	fire( x, z, seconds = 45 ) {

		const t = this.townAt( x, z );
		if ( ! t || ! t.ready ) return 0;
		const n = t.sim.bucketChain( x, z, seconds );
		if ( n ) this._toast( 'Fire! A bucket chain forms from the quay.', 2600, true );
		return n;

	}

	// (wave 24E) an occasion now, for a while (sandbox, tests, captures): 'market' | 'festival' | 'procession' | 'regatta'
	startEvent( kind, townId = 'tidemark', seconds = 300 ) {

		const t = this.towns.find( ( q ) => q.plan.id === townId );
		if ( ! t ) return false;
		if ( kind === 'procession' ) return this._procession( t, true ) > 0;
		return this.calendar.force( kind, townId, seconds );

	}

	// what is on in each town now: { townId: { market, festival, regatta, procession } }
	get occasions() {

		const out = {};
		for ( const t of this.towns ) out[ t.plan.id ] = { market: t.sim.marketDay, festival: t.sim.festival, regatta: this.regattas.has( t.plan.id ), procession: !! t.sim.event };
		return out;

	}

	talkTo( c ) {

		if ( ! c || c.hidden ) return null;
		const hour = this._hour();
		const line = c.line( hour );
		c.talkT = 4;
		c.gesture = null;
		this._toast( `${ c.name }: ${ line }`, 3600, true );
		if ( this.features && this.features.emit ) this.features.emit( 'townsfolkTalked', { id: c.id, name: c.name, role: c.role, port: c.port } );
		return line;

	}

	// ------------------------------------------------------------------ internals

	_hour() {

		const s = this.app.settings;
		return s && Number.isFinite( s.timeOfDay ) ? s.timeOfDay : 12;

	}

	_viewerPos() {

		const a = this.app;
		if ( a.freeCam && a.camera ) return a.camera.position;
		return a.player && a.player.position ? a.player.position : null;

	}

	_toast( text, ms = 2600, force = false ) {

		if ( this.opts.toasts === false ) return false;
		if ( ! force && this._toastT > 0 ) return false;
		const g = this.app.game;
		if ( ! g || ! g.toast ) return false;
		g.toast( text, ms );
		this._toastT = 9;
		return true;

	}

	_danger( x, z, reach, seconds ) {

		for ( const t of this.towns ) {

			if ( Math.hypot( x - t.plan.center.x, z - t.plan.center.z ) > t.plan.radius + reach ) continue;
			t.sim.alarm( x, z, seconds, reach + 30 );
			const hb = this.features && this.features.get ? this.features.get( 'harbour' ) : null;
			if ( hb && hb.alarm ) hb.alarm( t.plan.port, seconds, { x, z, radius: reach + 30 } );

		}

	}

	_caught( e ) {

		if ( e.crew ) return;
		const big = ( e.kg || 0 ) >= 8 || ( e.value || 0 ) >= 150;
		if ( ! big ) return;
		const p = Number.isFinite( e.x ) ? e : this._viewerPos();
		if ( ! p ) return;
		if ( this.cheer( p.x, p.z ) >= 2 ) this._toast( [ 'The quay cheers your catch!', 'Folk stop to clap: what a fish!', 'A cheer goes up along the waterfront.' ][ Math.floor( this.rand() * 3 ) ], 2400 );

	}

	_ground( t ) {

		const terrain = this.app.terrainData || this.app.terrain;
		const plan = t.plan;
		// the low walkable colliders (boardwalks, porches, the quay) near the town
		const G = plan.grid;
		const R = Math.hypot( G.u1 - G.u0, G.v1 - G.v0 ) / 2 + 10;
		const walk = ( this.app.colliders && this.app.colliders.boxes || [] ).filter( ( b ) => b.walkable && Math.abs( b.center.x - G.frame.x ) < R + b.radius && Math.abs( b.center.z - G.frame.z ) < R + b.radius );
		const decks = plan.decks.map( ( d ) => ( { ...d, c: Math.cos( d.yaw ), s: Math.sin( d.yaw ), top: d.foot && terrain ? Math.max( d.y, terrain.heightAt( d.foot.x, d.foot.z ) + 0.3 ) : d.y } ) );
		return townGround( terrain, decks, walk );

	}

	_startGrid( t ) {

		const plan = t.plan;
		const G = plan.grid;
		const R = Math.hypot( G.u1 - G.u0, G.v1 - G.v0 ) / 2 + 6;
		const solids = collidersSolids( this.app.colliders, G.frame.x, G.frame.z, R );
		const terrain = this.app.terrainData || this.app.terrain;
		t.ground = this._ground( t );
		t.grid = new NavGrid( G, {
			ground: t.ground, solids, obstacles: [ ...plan.buildings, ...plan.obstacles ], streets: plan.streets,
			pathDistance: terrain && terrain.pathDistance ? ( x, z ) => terrain.pathDistance( x, z ) : null,
		} );

	}

	_link( t ) {

		const plan = t.plan;
		t.ready = true;
		t.sim.grid = t.grid;
		t.sim.ground = ( x, z ) => {

			const g = t.ground( x, z );
			return g ? g.y : 0;

		};
		// the benches and logs wave 18C exports (the built object's list when it has one, else the module's)
		t.sim.setSeats( this._seats( plan.id ).filter( ( s ) => t.grid.nearestFree( s.x, s.z, 2 ) ) );
		// (wave 19E) the taverns' interiors (src/world/interiors): tavern-goers past a full patio sit inside
		t.sim.interiorSeats = () => ( this.features?.get?.( 'interiors' )?.seatsFor?.( plan.id, { tavern: true } ) || [] ).filter( ( s ) => this.features?.get?.( 'citywreck' )?.seatOpen?.( s ) ?? true );
		this.animals.addTown( plan.id, { pens: plan.pens, animals: scaleAnimals( plan.animals, this.scale ), free: ( x, z ) => t.grid.free( x, z ), ground: t.sim.ground } );

	}

	_seats( id ) {

		const a = this.app, terrain = a.terrainData || a.terrain;
		const g = terrain && terrain.heightAt ? ( x, z ) => terrain.heightAt( x, z ) : null;
		const sh = this.features && this.features.get ? this.features.get( 'stronghold' ) : null;
		const built = id === 'meridian' ? ( a.meridian && a.meridian.seats ) || [] : id === 'home' ? a.village && a.village.seats : id === 'tidemark' ? a.ports && a.ports.tidemark && a.ports.tidemark.seats : sh && sh.island && sh.island.seats;
		let list = Array.isArray( built ) ? built : null;
		if ( ! list && terrain ) {

			try { list = id === 'home' ? villageSeats( terrain ) : id === 'tidemark' ? tidemarkSeats( terrain ) : blackwaterSeats( terrain ); } catch ( e ) { list = []; }

		}

		return externalSeats( list || [], g );

	}

	_lanternLight( src, c ) {

		const out = c.body && ! c.hidden && c.act === 'watch';
		src.scale = out ? 1 : 0;
		if ( ! out ) return;
		const yaw = c.yaw;
		src.position.set( c.x + Math.cos( yaw ) * 0.32 - Math.sin( yaw ) * 0.25, c.y + 0.95, c.z - Math.sin( yaw ) * 0.32 - Math.cos( yaw ) * 0.25 );

	}

	update( dt ) {

		dt = Math.min( Math.max( Number.isFinite( dt ) ? dt : 0, 0 ), 0.25 );
		this.time += dt;
		if ( this._toastT > 0 ) this._toastT -= dt;
		const vp = this._viewerPos();
		const V = this.viewer;
		if ( vp ) {

			if ( this._prev ) V.speed += ( Math.min( 20, Math.hypot( vp.x - this._prev.x, vp.z - this._prev.z ) / Math.max( dt, 1e-3 ) ) - V.speed ) * Math.min( 1, dt * 4 );
			this._prev = this._prev || { x: 0, z: 0 };
			this._prev.x = vp.x; this._prev.z = vp.z;
			V.x = vp.x; V.z = vp.z; V.y = vp.y;
			V.mode = this.app.freeCam ? 'fly' : this.app.player ? this.app.player.mode : 'walk';

		}

		const viewer = vp ? V : null;
		const hour = this._hour();
		let built = false;
		const active = this._active || ( this._active = new Set() );
		active.clear();
		// (wave 24E) the weather and the island day: rain, the calendar's occasions
		const w = this.features && this.features.get ? this.features.get( 'weather' ) : null;
		const rain = w && Number.isFinite( w.rain ) ? w.rain : 0;
		const day = w && Number.isFinite( w.day ) ? w.day : 0;
		this.calendar.tick( dt );
		for ( const t of this.towns ) {

			const d = viewer ? Math.hypot( viewer.x - t.plan.center.x, viewer.z - t.plan.center.z ) : Infinity;
			if ( ! t.grid && d < t.plan.radius + WAKE_R ) this._startGrid( t );
			if ( t.grid && ! t.ready && ! built ) {

				built = true;
				if ( t.grid.buildStep( BUILD_BUDGET ) ) this._link( t );

			}

			this._occasions( t, day, hour, rain, d );
			t.sim.update( dt, hour, viewer );
			if ( t.ready && d < t.plan.radius + ANIMAL_R ) active.add( t.plan.id );
			this._skiffs( t, hour, d );

		}

		this.animals.update( dt, viewer, active );
		this._lodT -= dt;
		if ( this._lodT <= 0 ) {

			this._lodT = LOD_TICK;
			this._assign( viewer );
			this._social( viewer, hour );
			this._react( viewer );

		}

		this._regattas( dt );
		// the fish jump round the viewer, and round the skiffs out at their nets
		const extra = this._seaExtra || ( this._seaExtra = [] );
		extra.length = 0;
		for ( const t of this.towns ) for ( const s of t.skiffs || [] ) if ( s.phase === 'fishing' ) extra.push( s );
		this.sea.update( dt, viewer, { hour, extra } );
		this._draw( dt, viewer );

	}

	// (wave 24E) a town's conditions and occasions: the rain, the market day, the festival night (not in the rain), the
	// afternoon's procession (once a day, when someone is there to see it), the regatta
	_occasions( t, day, hour, rain, d ) {

		const id = t.plan.id;
		const o = this.calendar.at( id, day, hour );
		const wet = rain > 0.3;
		t.sim.setConditions( { rain, day, marketDay: o.market, festival: o.festival && ! wet && t.ready } );
		if ( ! t.ready || d > t.plan.radius + 300 ) return;
		if ( o.procession !== false && ! wet && hour >= o.procession && hour < o.procession + 0.75 && this._procDone.get( id ) !== day ) {

			if ( this._procession( t ) ) this._procDone.set( id, day );

		}

		if ( o.regatta && ! wet && ! this.regattas.has( id ) ) this._startRegatta( t );
		if ( ( ! o.regatta || wet ) && this.regattas.has( id ) && ! this.regattas.get( id ).forced ) this.regattas.delete( id );

	}

	// a procession along the town's watch beat (its streets in order), from the nearer end
	_procession( t, force = false ) {

		const route = ( t.plan.patrol || [] ).slice( 0, 6 );
		if ( route.length < 2 ) return 0;
		if ( force ) this._procDone.set( t.plan.id, - 1 );
		const n = t.sim.procession( route, { followers: this.phone ? 6 : 9 } );
		if ( n ) this._toast( t.plan.id === 'blackwater' ? 'A raucous procession staggers round the cove.' : `A wedding procession winds through ${ t.plan.name }!`, 3200, true );
		return n;

	}

	// the regatta: dinghies racing a triangle laid off the town's skiff berths; the quay crowd watching
	_startRegatta( t, forced = false ) {

		const sk = ( t.plan.skiffs || [] )[ 0 ];
		if ( ! sk ) return false;
		const d = sk.dock, o = sk.out[ 1 ] || sk.out[ 0 ];
		const sx = o.x - d.x, sz = o.z - d.z, L = Math.hypot( sx, sz ) || 1;
		const ux = sx / L, uz = sz / L, px = uz, pz = - ux;
		const c = { x: d.x + ux * 70, z: d.z + uz * 70 };
		const marks = [ { x: c.x - ux * 35 + px * 40, z: c.z - uz * 35 + pz * 40 }, { x: c.x + ux * 40, z: c.z + uz * 40 }, { x: c.x - ux * 35 - px * 40, z: c.z - uz * 35 - pz * 40 } ];
		const R = this.rand;
		const boats = [];
		for ( let i = 0; i < 5; i ++ ) boats.push( { x: marks[ 0 ].x + px * ( i - 2 ) * 6, z: marks[ 0 ].z + pz * ( i - 2 ) * 6, yaw: 0, k: 1, speed: 3.2 + R() * 0.9, heel: 0 } );
		this.regattas.set( t.plan.id, { marks, boats, forced, t: 0, crowd: false, sim: t.sim } );
		this._toast( `Regatta day at ${ t.plan.name }: the dinghies are racing round the bay!`, 3200, true );
		return true;

	}

	_regattas( dt ) {

		for ( const [ id, r ] of this.regattas ) {

			r.t += dt;
			// the quay fills to watch once the town is awake
			if ( ! r.crowd && ! r.sim.dormant ) r.crowd = r.sim.gatherQuay( 120 ) > 0 || r.t > 30;
			if ( r.forced && this.calendar && ! this.calendar.forcedOn( 'regatta', id ) ) { this.regattas.delete( id ); continue; }
			for ( const b of r.boats ) {

				const m = r.marks[ b.k ];
				const dx = m.x - b.x, dz = m.z - b.z, d = Math.hypot( dx, dz );
				if ( d < 6 ) { b.k = ( b.k + 1 ) % r.marks.length; continue; }
				const want = Math.atan2( dx, dz );
				const turn = Math.atan2( Math.sin( want - b.yaw ), Math.cos( want - b.yaw ) );
				b.yaw += turn * Math.min( 1, dt * 0.8 );
				// a gust now and then: the boat heels and picks up speed
				const gust = 0.75 + 0.25 * Math.sin( r.t * 0.37 + b.speed * 7 );
				b.x += Math.sin( b.yaw ) * b.speed * gust * dt;
				b.z += Math.cos( b.yaw ) * b.speed * gust * dt;
				b.heel += ( ( 0.12 + 0.18 * gust ) * Math.sign( turn || 1 ) - b.heel ) * Math.min( 1, dt * 1.5 );

			}

		}

	}

	// (wave 24E) the city's streets (the cars feature, when there is one): crossings at the traffic lights inside a town's grid
	// (people wait at the kerb while their road has green), the bus stops (they wait, a stopped bus takes them on, a few get off)
	_streets( viewer ) {

		const cars = this.features && this.features.get ? this.features.get( 'cars' ) : null;
		const g = cars && cars.graph, tr = cars && cars.traffic;
		if ( ! g || ! g.nodes ) return;
		for ( const t of this.towns ) {

			if ( ! t.ready || t.streets ) continue;
			t.streets = true;
			const G = t.plan.grid, F = G.frame, cs = Math.cos( F.yaw ), sn = Math.sin( F.yaw );
			const inside = ( x, z ) => { const dx = x - F.x, dz = z - F.z, u = dx * cs - dz * sn, v = dx * sn + dz * cs; return u > G.u0 + 2 && u < G.u1 - 2 && v > G.v0 + 2 && v < G.v1 - 2; };
			const crossings = [], busStops = [];
			let loop = [];
			try { loop = cars.busLoop ? cars.busLoop() : []; } catch ( e ) { loop = []; }
			for ( const n of g.nodes.values() ) {

				if ( ! n.signal || ! inside( n.x, n.z ) ) continue;
				for ( const e of n.out ) {

					const sg = e.a === n.id ? 1 : - 1, ex = e.dx * sg, ez = e.dz * sg, L = Math.hypot( ex, ez ) || 1, dx = ex / L, dz = ez / L; // (away from the node)
					const w = ( e.width || 8 ) / 2 + 1.0, off = ( n.r || 8 ) + 2.0;
					const cx = n.x + dx * off, cz = n.z + dz * off;
					const a = t.grid.nearestFree( cx + dz * w, cz - dx * w, 1.5 ), b = t.grid.nearestFree( cx - dz * w, cz + dx * w, 1.5 );
					if ( a && b && Math.hypot( a.x - b.x, a.z - b.z ) > w ) crossings.push( { node: n.id, edge: e.id, a: { x: a.x, z: a.z }, b: { x: b.x, z: b.z } } );

				}

				if ( loop.includes( n.id ) && crossings.length ) {

					const c = crossings[ crossings.length - 1 ];
					busStops.push( { node: n.id, x: c.a.x, z: c.a.z, yaw: yawToward( c.a.x, c.a.z, n.x, n.z ) } );

				}

			}

			t.sim.setStreets( { crossings, busStops, crossOK: ( cr ) => g.light( cr.node, cr.edge, tr ? tr.time : 0 ) === 'red' } );

		}

		// the buses at their stops
		if ( ! tr || ! tr.cars ) return;
		const served = this._busServed || ( this._busServed = new Set() );
		for ( const car of tr.cars ) {

			const a = car.ai;
			if ( car.kind !== 'bus' || ! a || ! a.bus || ! ( a.bus.stopT > 0 ) || a.v > 0.3 || ! a.L ) continue;
			const key = car.id + ':' + a.bus.i;
			if ( served.has( key ) ) continue;
			for ( const t of this.towns ) {

				if ( ! t.ready || ! t.sim.busStops.some( ( s ) => s.node === a.L.to ) ) continue;
				served.add( key );
				if ( served.size > 64 ) served.delete( served.values().next().value );
				// the front door on the kerb side (the right: the traffic keeps right)
				const fx = Math.sin( car.yaw ), fz = Math.cos( car.yaw ), rx = - fz, rz = fx;
				let dx = car.x + fx * 3.5 + rx * 1.9, dz = car.z + fz * 3.5 + rz * 1.9;
				const q = t.grid.nearestFree( dx, dz, 2.5 );
				if ( q ) { dx = q.x; dz = q.z; }
				t.sim.busArrived( a.L.to, { x: dx, z: dz, yaw: yawToward( dx, dz, car.x, car.z ) } );

			}

		}

	}

	// (wave 24E) the player's drawn gun: people near stare at it, the closest back away; a ship standing in: the quay fills
	_react( viewer ) {

		if ( ! viewer ) return;
		const fa = this.features && this.features.get ? this.features.get( 'firearms' ) : null;
		if ( fa && fa.drawn && viewer.mode === 'walk' ) {

			for ( const t of this.towns ) if ( t.ready && ! t.sim.dormant && Math.hypot( viewer.x - t.plan.center.x, viewer.z - t.plan.center.z ) < t.plan.radius + 20 ) {

				if ( t.sim.stare( viewer.x, viewer.z ) >= 3 && this.time - this._stareT > 40 ) {

					this._stareT = this.time;
					this._toast( [ 'Folk stop and stare at the gun in your hand.', 'People edge away from your drawn pistol.', 'A hush falls: everyone is watching your gun.' ][ Math.floor( this.rand() * 3 ) ], 2200, true );

				}

			}

		}

		this._streets( viewer );
		// ships: a merchant or a navy ship coming within the harbour gathers the quay (once each time it comes in)
		this._shipT -= LOD_TICK;
		if ( this._shipT > 0 ) return;
		this._shipT = 3;
		const naval = this.features && this.features.get ? this.features.get( 'naval' ) : null;
		const ships = naval && Array.isArray( naval.ships ) ? naval.ships : [];
		const now = new Set();
		for ( const s of ships ) {

			if ( ! s || s.state === 'sinking' || s.state === 'gone' || s.faction === 'pirate' || ! Number.isFinite( s.x ) ) continue;
			for ( const t of this.towns ) {

				if ( ! t.ready || t.sim.dormant ) continue;
				if ( Math.hypot( s.x - t.plan.center.x, s.z - t.plan.center.z ) > t.plan.radius + 120 ) continue;
				const key = ( s.id ?? s.name ) + '@' + t.plan.id;
				now.add( key );
				if ( ! this._shipNear.has( key ) ) t.sim.gatherQuay( 50 );

			}

		}

		this._shipNear = now;

	}

	// the local skiffs: out at dawn, back with the catch (the fish hall queue), by the island clock
	_skiffs( t, hour, d ) {

		const list = t.plan.skiffs || [];
		t.skiffs = t.skiffs || list.map( ( s ) => {

			const pts = [ s.dock, ...s.out ];
			let L = 0;
			for ( let i = 1; i < pts.length; i ++ ) L += Math.hypot( pts[ i ].x - pts[ i - 1 ].x, pts[ i ].z - pts[ i - 1 ].z );
			return { ...s, pts, L, tr: L / SKIFF_SPEED / HOUR_S, phase: null, x: s.dock.x, z: s.dock.z, yaw: s.dock.yaw + Math.PI };

		} );
		for ( const s of t.skiffs ) {

			const h = ( ( hour % 24 ) + 24 ) % 24;
			let f = 0, phase = 'dock';
			if ( h >= s.leave && h < s.leave + s.tr ) { phase = 'out'; f = ( h - s.leave ) / s.tr; }
			else if ( h >= s.leave + s.tr && h < s.back ) { phase = 'fishing'; f = 1; }
			else if ( h >= s.back && h < s.back + s.tr ) { phase = 'in'; f = 1 - ( h - s.back ) / s.tr; }
			if ( s.phase === 'in' && phase === 'dock' && d < t.plan.radius + 100 ) {

				t.sim.callQueue();
				t.sim.unloadCatch( s.dock ); // (wave 24E) the crates carried up to the hall

			}
			s.phase = phase;
			if ( phase === 'dock' ) { s.x = s.dock.x; s.z = s.dock.z; s.yaw = s.dock.yaw + Math.PI; continue; }
			// along the polyline at fraction f; fishing: a slow drift round the end
			let want = f * s.L, i = 1;
			for ( ; i < s.pts.length; i ++ ) {

				const seg = Math.hypot( s.pts[ i ].x - s.pts[ i - 1 ].x, s.pts[ i ].z - s.pts[ i - 1 ].z );
				if ( want <= seg || i === s.pts.length - 1 ) {

					const a = s.pts[ i - 1 ], b = s.pts[ i ], k = seg > 0 ? Math.min( 1, want / seg ) : 1;
					s.x = a.x + ( b.x - a.x ) * k; s.z = a.z + ( b.z - a.z ) * k;
					const dir = phase === 'in' ? - 1 : 1;
					s.yaw = Math.atan2( ( b.x - a.x ) * dir, ( b.z - a.z ) * dir );
					break;

				}

				want -= seg;

			}

			if ( phase === 'fishing' ) {

				const a = this.time * 0.05 + s.leave;
				s.x += Math.cos( a ) * 6; s.z += Math.sin( a ) * 6;
				s.yaw = a + Math.PI;

			}

		}

	}

	// who gets a body: the nearest visible citizens within the body radius, up to the cap (less the harbour residents
	// standing near the player: they are avatars too)
	_assign( viewer ) {

		const radii = this.app.residents && this.app.residents.radii;
		const bodyR = Math.max( 20, Math.min( this.phone ? 40 : 55, radii ? radii.animate : 55 ) );
		let cap = this.bodyCap;
		if ( viewer && this.app.residents && this.app.residents.list ) {

			let near = 0;
			for ( const r of this.app.residents.list ) if ( ! r.hidden && r.avatar && ( r.x - viewer.x ) ** 2 + ( r.z - viewer.z ) ** 2 < bodyR * bodyR ) near ++;
			cap = Math.max( Math.ceil( this.bodyCap / 2 ), this.bodyCap - near );

		}

		const want = [];
		if ( viewer ) for ( const t of this.towns ) {

			if ( ! t.ready || t.sim.dormant ) continue;
			for ( const c of t.sim.list ) {

				if ( c.hidden ) continue;
				const d2 = ( c.x - viewer.x ) ** 2 + ( c.z - viewer.z ) ** 2;
				const keep = c.body ? 1.2 : 1; // hysteresis
				if ( d2 < bodyR * bodyR * keep * keep ) want.push( [ d2, c ] );

			}

		}

		want.sort( ( a, b ) => a[ 0 ] - b[ 0 ] );
		const chosen = new Set( want.slice( 0, cap ).map( ( w ) => w[ 1 ] ) );
		for ( const [ c ] of this.bound ) if ( ! chosen.has( c ) ) this._release( c );
		let made = 0;
		for ( const c of chosen ) {

			if ( c.body ) continue;
			if ( made >= 2 ) break; // a couple a tick: no hitch when a crowd comes into view
			if ( this._bind( c ) ) made ++;

		}

		this.bodyRadius = bodyR;

	}

	_bind( c ) {

		let body = null;
		const i = this.pool.findIndex( ( b ) => b.character === c.character );
		if ( i >= 0 ) body = this.pool.splice( i, 1 )[ 0 ];
		else {

			let avatar;
			try { avatar = this.factory( { scene: this.scene || { add() {}, remove() {} }, character: c.character, lite: true } ); } catch ( e ) { console.warn( 'townlife: avatar', e ); return false; }
			body = { avatar, character: c.character, model: null, playing: null, casts: null };
			const gen = avatar.ready;
			if ( gen && gen.then ) gen.then( ( m ) => {

				if ( ! m || body.dead ) return;
				body.model = m;
				m.onClipEnd = ( name ) => {

					const who = body.citizen;
					if ( who && who.gesture && body.playing === name ) who.gesture = null;

				};

			} ).catch( () => {} );

		}

		body.citizen = c;
		body.playing = null;
		c.body = body;
		this.bound.set( c, body );
		const g = body.avatar.group;
		if ( g ) {

			g.visible = true;
			if ( g.userData ) g.userData.townlife = true; // (tools/perf --draw-list counts the townsfolk's draws by this)

		}

		return true;

	}

	_release( c ) {

		const body = c.body;
		this.bound.delete( c );
		c.body = null;
		if ( ! body ) return;
		body.citizen = null;
		const g = body.avatar.group;
		if ( g ) g.visible = false;
		if ( this.pool.length < 8 ) this.pool.push( body );
		else { body.dead = true; body.avatar.dispose(); }

	}

	// greetings, vendors calling out, who answers E
	_social( viewer, hour ) {

		this._talk = null;
		if ( ! viewer || viewer.mode !== 'walk' ) return;
		let best = null, bd = 2.6 * 2.6;
		for ( const [ c ] of this.bound ) {

			if ( c.hidden ) continue;
			const d2 = ( c.x - viewer.x ) ** 2 + ( c.z - viewer.z ) ** 2;
			if ( d2 < bd ) { bd = d2; best = c; }
			// a wave as the player passes (once in a while each)
			if ( d2 < 3.4 * 3.4 && ! c.react && ! c.fleeing && c.talkT <= 0 && ( c.greetAt || - 1e9 ) < this.time - 150 && ! c.sitting ) {

				c.greetAt = this.time;
				c.react = { clip: 'Friendly_Wave', t: 1.8, yaw: yawToward( c.x, c.z, viewer.x, viewer.z ) };
				if ( this.rand() < 0.35 ) this._toast( `${ c.name }: ${ hour < 11 ? 'Morning!' : hour < 18 ? 'Good day!' : 'Evening!' }`, 1800 );

			}

			// a vendor at the stall calls out to someone close
			if ( c.goal && c.goal.kind === 'stall' && c.arrived && c.stall && d2 < 7.5 * 7.5 && ( c.callAt || - 1e9 ) < this.time - 30 ) {

				c.callAt = this.time;
				const calls = c.stall.calls;
				if ( calls && calls.length && this._toast( `${ c.name }: ${ calls[ Math.floor( this.rand() * calls.length ) ] }`, 2400 ) ) {

					c.gesture = 'Point_Out';
					c.gestureLeft = 2.5;

				}

			}

		}

		this._talk = best;

	}

	_draw( dt, viewer ) {

		const M = this.meshes;
		if ( M ) M.begin();
		const radii = this.app.residents && this.app.residents.radii;
		const hide = radii ? radii.hide : 260;
		const animate = radii ? radii.animate : 60;
		const shadow = radii ? radii.shadow : 40;
		for ( const t of this.towns ) {

			const sim = t.sim;
			const ground = sim.ground;
			if ( ! t.ready ) continue; // no ground yet: nobody is drawn
			for ( const c of sim.list ) {

				if ( c.hidden ) {

					if ( c.body && c.body.avatar.group ) c.body.avatar.group.visible = false;
					continue;

				}

				const d2 = viewer ? ( c.x - viewer.x ) ** 2 + ( c.z - viewer.z ) ** 2 : Infinity;
				const sit = c.sitting || c.standT > 0 ? Math.max( 0, c.seatH - SEAT_DROP ) : 0;
				// drunks wander off the line of their route
				let ox = 0, oz = 0, wob = 0;
				if ( c.moving && c.mode === 'drunk' ) {

					const s = Math.sin( c.sway ) * 0.35;
					ox = Math.cos( c.yaw ) * s; oz = - Math.sin( c.yaw ) * s;
					wob = Math.sin( c.sway * 1.3 ) * 0.3;

				}

				if ( c.body || d2 < hide * hide ) {

					// (wave 20A: the ground under a citizen who has not moved is the ground it had: most stand, sit or work)
					const gx = c.x + ox, gz = c.z + oz;
					if ( c._gx !== gx || c._gz !== gz || c._gt !== ground ) {

						c._gx = gx; c._gz = gz; c._gt = ground;
						c._gy = ground ? ground( gx, gz ) : 0;

					}

					c.y = ( c.indoorFloor !== null ? c.indoorFloor : c._gy ) + sit; // (wave 19E: an interior's floor)

				}
				const body = c.body;
				if ( body && body.model ) {

					this._pose( body, c, ox, oz, wob, d2, dt, animate, shadow );
					continue;

				}

				if ( M && d2 < hide * hide ) this._figure( M, c, ox, oz, dt );

			}

		}

		if ( M ) {

			this._dressing( M, viewer );
			for ( const t of this.towns ) for ( const s of t.skiffs || [] ) {

				if ( viewer && ( s.x - viewer.x ) ** 2 + ( s.z - viewer.z ) ** 2 > 900 * 900 ) continue;
				const bob = Math.sin( this.time * 1.3 + s.leave ) * 0.04;
				M.skiffs.push( s.x, bob - 0.05, s.z, s.yaw, 1, null, Math.sin( this.time * 0.9 + s.back ) * 0.03, Math.sin( this.time * 1.1 ) * 0.04 );

			}

			M.end();

		}

	}

	// a near citizen's avatar: transform, clip, and what it carries
	_pose( body, c, ox, oz, wob, d2, dt, animate, shadow ) {

		const g = body.avatar.group;
		const m = body.model;
		if ( g ) {

			g.visible = true;
			g.position.set( c.x + ox, c.y, c.z + oz );
			if ( g.quaternion ) g.quaternion.setFromAxisAngle( _yAxis, c.yaw + wob + Math.PI );
			if ( g.scale ) g.scale.set( c.scale, c.scale, c.scale );
			if ( typeof g.updateMatrixWorld === 'function' ) g.updateMatrixWorld( true );
			const casts = d2 < shadow * shadow;
			if ( casts !== body.casts && g.traverse ) {

				body.casts = casts;
				g.traverse( ( o ) => { if ( o.isMesh ) o.castShadow = casts && ! EYE_PART.test( o.name ); } );

			}

		}

		// (wave 24E) an umbrella up in the rain: over the head, a little forward and to the right hand's side
		const M0 = this.meshes;
		if ( M0 && c.umbrella && ! c.sitting ) {

			const s0 = c.scale, fx0 = - Math.sin( c.yaw ), fz0 = - Math.cos( c.yaw ), rx = - Math.cos( c.yaw ), rz = Math.sin( c.yaw );
			M0.umbrellas.push( c.x + fx0 * 0.12 * s0 + rx * 0.1 * s0, c.y + 1.95 * s0, c.z + fz0 * 0.12 * s0 + rz * 0.1 * s0, c.yaw, s0, umbrellaTint( c ), 0.08, 0 );

		}

		if ( d2 > animate * animate ) { m.hold(); return; }
		const want = c.clip( this._clip );
		const name = resolveClip( m, want.name );
		if ( m.current !== name ) {

			m.play( name, { fade: c.moving ? 0.25 : 0.35, loop: want.loop, speed: want.speed } );
			body.playing = name;

		}

		m.update( dt );
		// what the hands hold (the meshes' records)
		const M = this.meshes;
		if ( ! M ) return;
		const fx = - Math.sin( c.yaw ), fz = - Math.cos( c.yaw ); // facing
		const s = c.scale;
		if ( c.moving && c.mode === 'carry' && c.loaded ) M.crates.push( c.x + fx * 0.32 * s, c.y + 1.0 * s, c.z + fz * 0.32 * s, c.yaw, s );
		if ( c.goal && c.goal.kind === 'barrow' && ! c.hidden ) M.barrows.push( c.x + fx * 1.05 * s, c.y, c.z + fz * 1.05 * s, c.yaw + Math.PI, 1 );
		if ( c.lantern && c.act === 'watch' ) {

			const x = c.x + Math.cos( c.yaw ) * 0.32 * s + fx * 0.25 * s, z = c.z - Math.sin( c.yaw ) * 0.32 * s + fz * 0.25 * s;
			M.lanterns.push( x, c.y + 0.95 * s, z, c.yaw, 1 );
			M.glow.push( x, c.y + 0.95 * s, z, c.yaw, 1 );

		}

	}

	// (wave 24E) a far citizen as an animated crowd figure: its walk cycle, pose and what it holds; moving ones are drawn
	// where they are between their 2 Hz steps (on along their way), so the far crowd walks smoothly
	_figure( M, c, ox, oz, dt ) {

		let x = c.x + ox, z = c.z + oz;
		let pose = POSE.stand, stride = 0;
		const moving = c.moving || ( c.mode === 'chase' && c._tagT > 0 );
		if ( moving ) {

			const sp = c.speedNow || c.walkSpeed;
			pose = POSE.walk;
			stride = Math.max( 0.55, Math.min( 1.6, sp / 1.1 ) );
			c.stepPh += dt * sp / 0.68 * Math.PI;
			const n = c.path && c.path[ 0 ];
			if ( n && ! c.near && c.acc > 0 ) {

				const dx = n.x - c.x, dz = n.z - c.z, d = Math.hypot( dx, dz );
				const k = Math.min( d, sp * c.acc );
				if ( d > 1e-3 ) { x += dx / d * k; z += dz / d * k; }

			}

		} else if ( c.react ) {

			const r = c.react.clip;
			pose = r === 'Friendly_Wave' || r === 'Wave' ? POSE.wave : r === 'Clap' || r === 'Cheer_Clap' ? POSE.cheer : POSE.stand;

		} else if ( c.sitting ) pose = POSE.sit;
		else if ( c.goal && c.goal.look ) {

			const b = c.goal.look.base;
			pose = b === 'Dance' ? POSE.dance : b === 'Clap' ? POSE.cheer : b === 'Talk_Group' || b === 'Chat_Gesture' || b === 'Drink' || c.goal.look.gestures.includes( 'Talk' ) ? POSE.talk : POSE.stand;

		}

		let flags = 0;
		if ( c.umbrella ) flags |= FLAG.umbrella;
		if ( c.mode === 'carry' && c.loaded && moving ) flags |= FLAG.crate;
		if ( c.bucket ) flags |= FLAG.bucket;
		const look = CROWD_LOOKS[ c.character ] || CROWD_LOOKS.hyptile;
		// oilskins: a sou'wester on the workers out in the rain
		if ( c.oilskin ) flags |= FLAG.cap;
		const bob = 0;
		M.pegs.push( x, c.y + bob, z, c.yaw + Math.PI, c.scale, look, { phase: c.stepPh, stride, pose, flags, seed: ( c._seed ?? ( c._seed = ( c.x * 0.37 + c.z * 0.11 ) % 1 ) ), hat: c.oilskin ? OILSKIN : umbrellaLinear( c ) } );

	}

	// (wave 24E) the events' dressing: the bucket chains' buckets going hand to hand, the festival's lantern strings,
	// the regatta's dinghies; the gulls over the skiffs coming in with the catch
	_dressing( M, viewer ) {

		const T = this.time;
		for ( const t of this.towns ) {

			const C = t.sim.chain;
			if ( C && C.pts.length > 1 ) {

				// buckets along the line from the quay to the fire, a hand's height up; a throw at the fire end
				const n = C.pts.length, nb = Math.min( 10, n + 1 );
				for ( let i = 0; i < nb; i ++ ) {

					const u = ( ( T * 0.55 + i / nb ) % 1 ) * ( n - 1 );
					const k = Math.min( n - 2, Math.floor( u ) ), f = u - k;
					const a = C.pts[ k ], b = C.pts[ k + 1 ];
					const x = a.x + ( b.x - a.x ) * f, z = a.z + ( b.z - a.z ) * f;
					const y = ( t.sim.ground ? t.sim.ground( x, z ) : 0 ) + 0.95 + Math.sin( f * Math.PI ) * 0.25;
					M.buckets.push( x, y, z, Math.atan2( b.x - a.x, b.z - a.z ), 1 );

				}

				if ( C.splashT <= 0 && C.members.filter( ( m ) => m.arrived ).length >= 2 ) {

					C.splashT = 1.6;
					const vfx = this.features && this.features.get ? this.features.get( 'vfx' ) : null;
					const y = t.sim.ground ? t.sim.ground( C.fire.x, C.fire.z ) : 0;
					if ( vfx && vfx.splash ) vfx.splash( C.fire.x, y + 0.5, C.fire.z, 0.25 );

				}

			}

			// the festival: strings of paper lanterns from four posts over the square, a few swaying in the breeze
			const F = t.sim.places.fest;
			if ( F && t.sim.festival && t.ready && ( ! viewer || Math.hypot( viewer.x - F.x, viewer.z - F.z ) < 400 ) ) {

				const P = F.posts;
				for ( const p of P ) M.posts.push( p.x, t.sim.ground ? t.sim.ground( p.x, p.z ) : 0, p.z, 0, 1 );
				for ( let i = 0; i < P.length; i ++ ) {

					// each post to the next, and each post to the middle
					for ( const [ a, b ] of [ [ P[ i ], P[ ( i + 1 ) % P.length ] ], [ P[ i ], { x: F.x, z: F.z, top: 5.4 } ] ] ) {

						const ya = ( t.sim.ground ? t.sim.ground( a.x, a.z ) : 0 ) + 4.1, yb = b.top ? ( t.sim.ground ? t.sim.ground( b.x, b.z ) : 0 ) + b.top : ( t.sim.ground ? t.sim.ground( b.x, b.z ) : 0 ) + 4.1;
						const L = Math.hypot( b.x - a.x, b.z - a.z ), nb = Math.max( 3, Math.round( L / 1.3 ) );
						for ( let k = 1; k < nb; k ++ ) {

							const f = k / nb, sag = Math.sin( f * Math.PI ) * Math.min( 1.1, L * 0.06 );
							const sway = Math.sin( T * 1.7 + k * 0.9 + i ) * 0.05;
							M.bulbs.push( a.x + ( b.x - a.x ) * f + sway, ya + ( yb - ya ) * f - sag, a.z + ( b.z - a.z ) * f, 0, 1, FESTOON[ ( k + i ) % FESTOON.length ] );

						}

					}

				}

			}

			const R = this.regattas.get( t.plan.id );
			if ( R ) for ( const b of R.boats ) M.dinghies.push( b.x, Math.sin( T * 1.4 + b.speed * 3 ) * 0.05 - 0.05, b.z, b.yaw, 1, null, 0, b.heel );

		}

		// the gulls: a flock over each of the two nearest skiffs coming in (or at their nets)
		if ( this.flocks ) {

			const near = [];
			for ( const t of this.towns ) for ( const s of t.skiffs || [] ) {

				if ( s.phase !== 'in' && s.phase !== 'fishing' ) continue;
				const d = viewer ? Math.hypot( s.x - viewer.x, s.z - viewer.z ) : 0;
				if ( d < 700 ) near.push( [ d, s ] );

			}

			near.sort( ( a, b ) => a[ 0 ] - b[ 0 ] );
			for ( let g = 0; g < 2; g ++ ) if ( near[ g ] ) this.flocks.moveFlock( g, near[ g ][ 1 ].x, near[ g ][ 1 ].z ); else this.flocks.hideFlock( g );

		}

	}

	reset() {

		for ( const t of this.towns ) {

			for ( const c of t.sim.list ) { c.act = null; c.fleeing = false; c.react = null; c.eventRole = null; c.bucket = false; c.sheltering = false; c.umbrella = false; }
			t.sim.event = null; t.sim.chain = null;

		}

		this.regattas.clear();

	}

	dispose() {

		for ( const o of this._off ) if ( typeof o === 'function' ) o();
		for ( const r of this._removers ) r();
		for ( const [ c ] of this.bound ) this._release( c );
		for ( const b of this.pool ) { b.dead = true; b.avatar.dispose(); }
		this.pool.length = 0;
		if ( this.meshes ) this.meshes.dispose();
		this.animals.dispose();
		if ( this.flocks ) this.flocks.dispose();
		this.sea.dispose();
		const L = this.app.localLights;
		if ( L && L.remove ) for ( const l of this.lights ) L.remove( l );

	}

}

// a town's ground: the terrain, its decks (piers, the quay, jetties) and the low walkable colliders (boardwalks, porches)
export function townGround( terrain, decks = [], walk = [] ) {

	const out = { y: 0, deck: false }; // (reused: read it before the next call)
	return ( x, z ) => {

		if ( ! terrain ) return null;
		const t = terrain.heightAt( x, z );
		let y = t, deck = false;
		for ( const d of decks ) {

			const dx = x - d.x, dz = z - d.z;
			const lx = dx * d.c - dz * d.s, lz = dx * d.s + dz * d.c;
			if ( Math.abs( lx ) <= d.hx && Math.abs( lz ) <= d.hz && d.top > y - 0.05 ) { y = d.top; deck = true; }

		}

		for ( const b of walk ) {

			if ( b.top <= t - 0.3 || b.top > t + 1.2 || b.top <= y ) continue;
			if ( Math.abs( x - b.center.x ) > b.radius + 0.01 || Math.abs( z - b.center.z ) > b.radius + 0.01 ) continue;
			const dx = x - b.center.x, dz = z - b.center.z;
			const lx = dx * b.cos - dz * b.sin, lz = dx * b.sin + dz * b.cos;
			if ( Math.abs( lx ) <= b.half.x && Math.abs( lz ) <= b.half.z ) { y = b.top; deck = y > t + 0.05; }

		}

		out.y = y; out.deck = deck;
		return out;

	}

}

function scaleAnimals( a, k ) {

	const out = {};
	for ( const [ kind, n ] of Object.entries( a || {} ) ) out[ kind ] = Math.max( 1, Math.round( n * Math.max( 0.5, k ) ) );
	return out;

}

export function install( app, features, opts = {} ) {

	return new TownLife( app, features, opts );

}

export { townPlans, POPULATION, TownSim, townActivity, TOWN_SCHEDULES, NavGrid };
