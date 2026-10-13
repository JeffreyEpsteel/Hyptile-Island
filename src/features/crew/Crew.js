// The crew's headless logic (wave 10): hired roster characters posted aboard as gunners or anglers. No engine, no DOM:
// test/feature-crew.mjs drives it in node; index.js wires it to the game (naval's guns, the cooler, the deck figures).
//
//   BERTHS[ boatId ]            crew berths per hull when Boats.js has no `berths` (skiff 0, canoe 0, cutter 1, launch 1,
//                               lobster 2, trawler 3, sloop 3, brigantine 4); berthsOf( id ) reads Boats.js first
//   CREW_RULES                  the numbers (gunner reload x1.6 / spread x1.5, two gunners at most: one per broadside; anglers
//                               land a fish every 45-90 s, at half rate trolling under 4 m/s, never above it)
//   const crew = new Crew( { rng } )
//   ctx = { boat, unlocked: [ ids ], character }      the save's view (GameState: boat, unlocked, character)
//   crew.canPost( id, post, ctx ) -> { ok, reason }   reason: 'unknown' | 'playing' | 'not hired' | 'no berths' | 'full' | 'guns manned'
//   crew.setPost( id, 'off' | 'gunner' | 'angler', ctx ) -> { ok, reason }
//   crew.sync( ctx ) -> [ { id, post, why: 'playing' | 'berth' } ]   drops the played character's post and the posts past the
//                               hull's berths (the most recently posted go ashore first; without a boat the posts wait)
//   crew.rows( ctx ) -> [ { id, name, hired, playing, post, side, choices: [ { post, label, on, enabled, why } ] } ]  (posting UI)
//   crew.gunners( ctx? ) / anglers( ctx? ) -> [ ids ] in posting order (with ctx: on duty only);  crew.sides  Map id -> side
//   crew.assignSides( nearSide )   the first gunner takes the side facing the nearest hostile (else keeps his), the second the other
//   crew.tickGunners( dt, { aboard, naval } ) -> [ { id, side, target } ]   each gunner fires his side through
//                               naval.crewFire( side, { reloadMul, spreadMul, crew: id } ) while the skipper is aboard
//   crew.tickAnglers( dt, { rate, habitat, hour, fits, bait } ) -> [ { id, species, kg, habitat, text } | { id, full: true, text } ]
//                               rate: anglerRate(); habitat() the water by the rail (Bites.habitatAt weights); fits( kg ) room in
//                               the cooler; bait() the delay factor of the next cast (trade's operating.useBait: it takes one)
//   crew.hudLine( naval, ctx? ) -> 'Gunners: Pepe (port, ready) · Doge (stbd, 3.2 s)' | null
//   crew.toJSON() / fromJSON( d ) / reset()
//   deckPoint( boatId, post, slot, side, deckY ) -> { x, y, z, yaw }   where a posted member stands (boat frame), facing outboard
//   anglerRate( { atSea, speed, anchored } ) -> 1 | 0.5 | 0          catchInterval( habitat, rng, bait ) -> s

import { BOATS } from '../../game/Boats.js';
import { CHARACTERS } from '../../game/Characters.js';
import { FISH } from '../../game/FishTable.js';
import { pickSpecies, rollWeight } from '../../game/Bites.js';

export const BERTHS = { skiff: 0, canoe: 0, cutter: 1, launch: 1, lobster: 2, trawler: 3, sloop: 3, brigantine: 4 };
export const POSTS = [ 'off', 'gunner', 'angler' ];
export const POST_LABELS = { off: 'Off', gunner: 'Gunner', angler: 'Angler' };
export const CREW_RULES = {
	reloadMul: 1.6, // a gunner's reload against the skipper's
	spreadMul: 1.5, // and his spread
	maxGunners: 2, // one per broadside
	catchMin: 45, catchMax: 90, // s between an angler's fish (rich water .. thin open water)
	still: 2.5, // m/s: under this (or at anchor) the anglers fish at full rate
	troll: 4, // m/s: under this they troll at half rate
	trollRate: 0.5,
	portRadius: 70, // m from a port's dock: in port, nobody fishes
	fullRetry: 30, // s: the cooler was full, try again (a smaller fish may fit)
	emptyRetry: 20, // s: nothing bit here
	baitMax: 1.8, // a bare hook's slowest
	phoneAnimated: 2, // crew figures animated at once on a phone
};

// per-hull deck spots where the generic layout would put someone inside a wheelhouse (boat frame, port side; mirrored)
const DECK = {
	lobster: { gunner: { x: 1.15, z: - 1.35 }, angler: { x: 1.0, z: - 2.3 }, row: 1.0 },
};

const clamp = ( v, a, b ) => ( v < a ? a : v > b ? b : v );
const sideName = ( s ) => ( s === 'starboard' ? 'stbd' : 'port' );

export function berthsOf( id ) {

	const b = BOATS[ id ];
	if ( ! b ) return 0;
	if ( Number.isFinite( b.berths ) ) return Math.max( 0, Math.floor( b.berths ) );
	return BERTHS[ id ] ?? 0;

}

export function deckPoint( boatId, post, slot = 0, side = 'port', deckY = null ) {

	const b = BOATS[ boatId ] || BOATS.lobster;
	const o = DECK[ boatId ] || null;
	const y = Number.isFinite( deckY ) ? deckY : b.deckY;
	const ship = b.kind === 'ship';
	if ( post === 'gunner' ) {

		const sg = side === 'starboard' ? - 1 : 1;
		if ( o && o.gunner ) return { x: sg * o.gunner.x, y, z: o.gunner.z, yaw: sg * Math.PI / 2 };
		if ( b.broadside ) {

			// between the side's guns, just inboard of the rail
			const zs = b.broadside.z;
			const mid = zs.reduce( ( a, c ) => a + c, 0 ) / zs.length;
			return { x: sg * Math.max( 0.4, b.broadside.x - 0.75 ), y, z: mid, yaw: sg * Math.PI / 2 };

		}

		// beside the swivel gun (12 % of the length forward of amidships, Naval._gunPlan), a step aft of it
		return { x: sg * Math.max( 0.3, b.beam / 2 - 0.45 ), y, z: b.length * 0.12 - 0.55, yaw: sg * Math.PI / 2 };

	}

	// anglers at the rail toward the stern, alternating port / starboard, a row further aft every two
	const sg = slot % 2 ? - 1 : 1;
	const row = Math.floor( slot / 2 );
	if ( o && o.angler ) return { x: sg * o.angler.x, y, z: o.angler.z - row * ( o.row || 1.2 ), yaw: sg * Math.PI / 2 };
	return {
		x: sg * Math.max( 0.3, b.beam / 2 - ( ship ? 0.7 : 0.4 ) ), y,
		z: - b.length * ( ship ? 0.12 : 0.18 ) - row * 1.3, yaw: sg * Math.PI / 2,
	};

}

export function anglerRate( { atSea = false, speed = 0, anchored = false } = {} ) {

	if ( ! atSea ) return 0;
	if ( anchored || speed < CREW_RULES.still ) return 1;
	if ( speed < CREW_RULES.troll ) return CREW_RULES.trollRate;
	return 0;

}

export function richness( h ) {

	let r = 0;
	for ( const k in h ) r += h[ k ] || 0;
	return r;

}

// the habitat with the most weight ('bay' when there is none): the catch's `habitat` for the career / quests
export function mainHabitat( h ) {

	let best = 0, name = 'bay';
	for ( const k in h ) if ( h[ k ] > best ) { best = h[ k ]; name = k; }
	return name;

}

// seconds to the angler's next fish: 90 s in thin open water down to 45 s over rich water, a little jitter, and a bare hook
// (bait factor > 1) slower like the skipper's casts
export function catchInterval( h, rng = Math.random, bait = 1 ) {

	const R = CREW_RULES;
	const t = clamp( ( richness( h ) - 0.35 ) / 1.0, 0, 1 );
	const base = R.catchMax - ( R.catchMax - R.catchMin ) * t;
	const s = clamp( base * ( 0.85 + 0.3 * rng() ), R.catchMin, R.catchMax );
	return s * clamp( Number.isFinite( bait ) ? bait : 1, 1, R.baitMax );

}

export class Crew {

	constructor( { rng = Math.random } = {} ) {

		this.rng = rng;
		this.posts = new Map(); // id -> 'gunner' | 'angler' (insertion order = posting order)
		this.sides = new Map(); // gunner id -> 'port' | 'starboard'
		this.wait = new Map(); // angler id -> { t, full }
		this.stats = new Map(); // id -> { shots, catches }
		this._lastSide = 'port';

	}

	postOf( id ) {

		return this.posts.get( id ) || 'off';

	}

	hired( ctx = {} ) {

		return ( ctx.unlocked || [] ).filter( ( id ) => CHARACTERS[ id ] && id !== ctx.character );

	}

	// the posted members of a post, in posting order; with ctx only the ones on duty (hired, not the one being played)
	_of( post, ctx ) {

		// (a plain walk in posting order: this runs several times a frame; no entry arrays, no spread copies)
		const out = [], un = ctx ? ( ctx.unlocked || [] ) : null;
		for ( const id of this.posts.keys() ) {

			if ( this.posts.get( id ) !== post ) continue;
			if ( ctx && ( id === ctx.character || ! un.includes( id ) ) ) continue;
			out.push( id );

		}

		return out;

	}

	gunners( ctx = null ) {

		return this._of( 'gunner', ctx );

	}

	anglers( ctx = null ) {

		return this._of( 'angler', ctx );

	}

	canPost( id, post, ctx = {} ) {

		if ( ! POSTS.includes( post ) ) return { ok: false, reason: 'unknown' };
		if ( post === 'off' ) return { ok: true };
		if ( ! CHARACTERS[ id ] ) return { ok: false, reason: 'unknown' };
		if ( id === ctx.character ) return { ok: false, reason: 'playing' };
		if ( ! ( ctx.unlocked || [] ).includes( id ) ) return { ok: false, reason: 'not hired' };
		const berths = berthsOf( ctx.boat );
		if ( berths <= 0 ) return { ok: false, reason: 'no berths' };
		const cur = this.postOf( id );
		if ( cur === post ) return { ok: true };
		const used = this.posts.size - ( cur !== 'off' ? 1 : 0 );
		if ( used >= berths ) return { ok: false, reason: 'full' };
		if ( post === 'gunner' && this.gunners().length - ( cur === 'gunner' ? 1 : 0 ) >= CREW_RULES.maxGunners ) return { ok: false, reason: 'guns manned' };
		return { ok: true };

	}

	setPost( id, post, ctx = {} ) {

		const r = this.canPost( id, post, ctx );
		if ( ! r.ok ) return r;
		const cur = this.postOf( id );
		if ( cur === post ) return { ok: true, same: true };
		this._clear( id );
		if ( post !== 'off' ) this.posts.set( id, post );
		return { ok: true };

	}

	_clear( id ) {

		this.posts.delete( id );
		this.sides.delete( id );
		this.wait.delete( id );

	}

	sync( ctx = {} ) {

		const out = [];
		// (the played character holds at most one post: no copy of the posts every frame)
		if ( this.posts.has( ctx.character ) ) {

			const post = this.posts.get( ctx.character );
			this._clear( ctx.character );
			out.push( { id: ctx.character, post, why: 'playing' } );

		}

		// (no boat known: keep the posts; they are ashore with the skipper)
		if ( ! BOATS[ ctx.boat ] ) return out;
		const berths = berthsOf( ctx.boat );
		if ( this.posts.size <= berths ) return out; // everyone has a berth (the usual frame)
		const list = [ ...this.posts ];
		for ( let i = list.length - 1; i >= berths; i -- ) {

			this._clear( list[ i ][ 0 ] );
			out.push( { id: list[ i ][ 0 ], post: list[ i ][ 1 ], why: 'berth' } );

		}

		return out;

	}

	rows( ctx = {} ) {

		const berths = berthsOf( ctx.boat );
		return Object.keys( CHARACTERS ).map( ( id ) => {

			const playing = id === ctx.character, hired = ( ctx.unlocked || [] ).includes( id );
			const post = this.postOf( id );
			const choices = POSTS.map( ( p ) => {

				const r = this.canPost( id, p, ctx );
				return { post: p, label: POST_LABELS[ p ], on: post === p, enabled: r.ok, why: r.ok ? null : WHY[ r.reason ] ? WHY[ r.reason ]( ctx, berths ) : r.reason };

			} );
			return { id, name: CHARACTERS[ id ].name, hired, playing, post, side: this.sides.get( id ) || null, choices };

		} );

	}

	assignSides( nearSide = null, ctx = null ) {

		const g = this.gunners( ctx );
		if ( ! g.length ) return this.sides;
		const first = nearSide || this.sides.get( g[ 0 ] ) || this._lastSide;
		this._lastSide = first;
		this.sides.set( g[ 0 ], first );
		if ( g[ 1 ] ) this.sides.set( g[ 1 ], first === 'port' ? 'starboard' : 'port' );
		return this.sides;

	}

	_stat( id ) {

		let s = this.stats.get( id );
		if ( ! s ) this.stats.set( id, s = { shots: 0, catches: 0 } );
		return s;

	}

	tickGunners( dt, { aboard = false, naval = null, ctx = null } = {} ) {

		const out = [];
		if ( ! aboard || ! naval || typeof naval.crewFire !== 'function' ) return out;
		for ( const id of this.gunners( ctx ) ) {

			const side = this.sides.get( id );
			if ( ! side ) continue;
			const t = naval.crewFire( side, { reloadMul: CREW_RULES.reloadMul, spreadMul: CREW_RULES.spreadMul, crew: id } );
			if ( ! t ) continue;
			this._stat( id ).shots ++;
			out.push( { id, side, target: t.id ?? null } );

		}

		return out;

	}

	tickAnglers( dt, { rate = 0, habitat = () => ( {} ), hour = 12, fits = () => true, bait = () => 1, ctx = null } = {} ) {

		const out = [];
		for ( const id of this.anglers( ctx ) ) {

			let w = this.wait.get( id );
			if ( ! w ) {

				// a fresh line goes over the side: the first fish takes a full wait
				w = { t: catchInterval( habitat(), this.rng, bait() ), full: false };
				this.wait.set( id, w );

			}

			if ( ! ( rate > 0 ) ) continue;
			w.t -= dt * rate;
			if ( w.t > 0 ) continue;
			const h = habitat();
			const species = pickSpecies( h, hour, this.rng );
			if ( ! species ) {

				w.t = CREW_RULES.emptyRetry;
				continue;

			}

			const kg = Math.round( rollWeight( species, this.rng ) * 100 ) / 100;
			const name = CHARACTERS[ id ] ? CHARACTERS[ id ].name : id;
			if ( ! fits( kg ) ) {

				// no room: it goes back; say so once until a fish fits again
				w.t = CREW_RULES.fullRetry;
				if ( ! w.full ) out.push( { id, full: true, text: `${ name } lets a fish go: the cooler is full` } );
				w.full = true;
				continue;

			}

			w.full = false;
			w.t = catchInterval( h, this.rng, bait() );
			this._stat( id ).catches ++;
			out.push( { id, species, kg, habitat: mainHabitat( h ), text: `${ name } landed a ${ kg.toFixed( 1 ) } kg ${ FISH[ species ] ? FISH[ species ].name : species }` } );

		}

		return out;

	}

	hudLine( naval = null, ctx = null ) {

		const g = this.gunners( ctx );
		if ( ! g.length ) return null;
		const parts = g.map( ( id ) => {

			const side = this.sides.get( id );
			const name = CHARACTERS[ id ] ? CHARACTERS[ id ].name : id;
			if ( ! side ) return `${ name } (standing by)`;
			const left = naval && naval.reloadLeft ? Math.max( 0, naval.reloadLeft[ side ] || 0 ) : 0;
			return `${ name } (${ sideName( side ) }, ${ left > 0 ? left.toFixed( 1 ) + ' s' : 'ready' })`;

		} );
		return 'Gunners: ' + parts.join( ' · ' );

	}

	toJSON() {

		return { v: 1, posts: [ ...this.posts ].map( ( [ id, post ] ) => [ id, post ] ) };

	}

	fromJSON( d ) {

		this.reset();
		if ( ! d || typeof d !== 'object' || ! Array.isArray( d.posts ) ) return;
		for ( const e of d.posts ) {

			if ( ! Array.isArray( e ) ) continue;
			const [ id, post ] = e;
			if ( CHARACTERS[ id ] && ( post === 'gunner' || post === 'angler' ) && ! this.posts.has( id ) ) this.posts.set( id, post );

		}

	}

	reset() {

		this.posts.clear();
		this.sides.clear();
		this.wait.clear();
		this.stats.clear();
		this._lastSide = 'port';

	}

}

// why a post is greyed out (the posting UI's title text)
const WHY = {
	'unknown': () => 'Not a crew member',
	'playing': () => 'You are playing this one',
	'not hired': () => 'Not hired yet',
	'no berths': ( ctx ) => ( BOATS[ ctx.boat ] ? `The ${ BOATS[ ctx.boat ].name.toLowerCase() } has no crew berths` : 'No boat to crew' ),
	'full': ( ctx, n ) => `Every berth is taken (${ n })`,
	'guns manned': () => 'Both broadsides are manned',
};
