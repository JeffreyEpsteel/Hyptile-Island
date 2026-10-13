// Crew feature (wave 10): hired roster characters posted aboard as gunners or anglers.
//
//   features.add( 'crew', crew );        // import * as crew from './features/crew/index.js' (after naval)
//   const c = features.get( 'crew' );
//   c.posts                     { id: 'gunner' | 'angler' }   (the hired characters posted aboard, in posting order)
//   c.berths()                  crew berths of the current hull (Boats.js `berths`, else Crew.BERTHS)
//   c.setPost( id, 'off' | 'gunner' | 'angler' ) -> { ok, reason, text }   a toast says what happened; emits crewPosted { id, post }
//   c.rows() -> Crew.rows (per character: hired, playing, post, side, choices [ { post, label, on, enabled, why } ])
//   c.postHtml( id ) -> HTML of the Off / Gunner / Angler control for a crew card ('' for the played or an unhired one)
//   c.berthNote() -> 'Crew berths on the lobster boat: 1 of 2 taken' (the Crew tab's note)
//   c.bindPosts( root, rerender )   wires the controls inside `root` (rerender() after a change)
//   c.hudLine()                 the gunners' line ('Gunners: Pepe (port, ready) · Doge (stbd, 3.2 s)') or null
//   c.update( dt ) / toJSON() / fromJSON( d ) / reset() / dispose()
//
// Gunners: while the skipper is aboard (helm, deck or a seat), each gunner works one broadside - the first the side facing the
// nearest hostile pirate, the second the other - and fires it through naval.crewFire (the player's own fire path) with a
// reload x1.6 and a spread x1.5: only at a hostile pirate in the gun's reach and swing, never at a merchant, never in or into
// the peaceful home waters, never at a crippled / struck pirate (the boarding prize), never the side the skipper aims by hand.
// A small line under the naval HUD names them and their reload while a pirate is in sight.
// Anglers: while the boat is at sea (not moored, not within 70 m of a port's dock, afloat) and slow (under 2.5 m/s, or at
// anchor; trolling under 4 m/s at half rate), each lands a fish every 45-90 s (richer water sooner) with the species and the
// weight rolls of the player's own catch (Bites.pickSpecies / rollWeight at the water off the rail: a reef angler catches reef
// fish), into the cooler if it fits, through the game's catch entry point (game.landCatch when Game.js has it, else the same
// steps: state.addFish, contracts.onCatch, fishCaught { ..., crew: id, x, z }) so it counts for quests and the career; a cast
// takes a bait like the skipper's (trade's operating.useBait; a bare hook is slower; free in the sandbox) and the crafting
// feature's bait goes with the catch (its fishCaught listener). A toast: "Pengu landed a 1.3 kg Jade snapper".
// On deck: CrewDeck (Deck.js) stands each one at a deck point of the hull, riding the boat's pose.

import { BOATS } from '../../game/Boats.js';
import { CHARACTERS } from '../../game/Characters.js';
import { habitatAt } from '../../game/Bites.js';
import { WORLD } from '../../world/WorldLayout.js';
import { rotateByQuat } from '../naval/Ballistics.js';
import { Crew, CREW_RULES, berthsOf, anglerRate } from './Crew.js';
import { CrewDeck } from './Deck.js';

export { Crew, CREW_RULES, BERTHS, POSTS, POST_LABELS, berthsOf, deckPoint, anglerRate, catchInterval } from './Crew.js';
export { CrewDeck } from './Deck.js';

const ABOARD = [ 'boat', 'deck', 'seat' ];
const LINE_OUT = 6; // m off the rail: where an angler's line is (the habitat, the splash)

const CSS = `
.cw-post { display: flex; gap: 2px; padding: 2px; border-radius: 999px; background: var(--tw-fill, rgba(255, 255, 255, 0.06)); align-self: stretch; }
.cw-post button { flex: 1; font: 600 var(--tw-fs-xs, 11px) var(--tw-font, system-ui, sans-serif); color: var(--tw-ink-2, #c8d3db); background: none; border: 0; border-radius: 999px; padding: 3px 6px; cursor: pointer; }
.cw-post button:hover:not(:disabled) { color: var(--tw-ink, #fff); }
.cw-post button.is-on { background: var(--tw-fill-2, rgba(255, 255, 255, 0.16)); color: var(--tw-ink, #fff); box-shadow: inset 0 0 0 1px var(--tw-line-2, rgba(255, 255, 255, 0.25)); }
.cw-post button:disabled { opacity: 0.38; cursor: default; }
.cw-post-label { font-size: var(--tw-fs-xs, 11px); color: var(--tw-ink-3, #9fb0bd); letter-spacing: 0.08em; text-transform: uppercase; }
.cw-gunners { position: fixed; left: var(--nv-left, 18px); bottom: calc(var(--nv-bottom, 96px) - 24px); z-index: 20; pointer-events: none; display: none;
	font: 600 11.5px var(--tw-mono, ui-monospace, monospace); color: var(--tw-ink, #e9eef2); text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7); white-space: nowrap; }
.cw-gunners.is-on { display: block; }
`;

let cssDone = false;

export function install( app, features, opts = {} ) {

	return new CrewFeature( app, features, opts );

}

export class CrewFeature {

	constructor( app, features, opts = {} ) {

		this.app = app || {};
		this.features = features || null;
		this.crew = new Crew( { rng: opts.rng || Math.random } );
		const scene = opts.scene !== undefined ? opts.scene : this.app.scene || null;
		this.deck = opts.deck === false || ! scene ? null : ( opts.deck || new CrewDeck( {
			scene, avatarFactory: opts.avatarFactory || ( this.app.residents && this.app.residents.avatarFactory ) || null,
			rodFactory: opts.rodFactory || null,
		} ) );
		this.doc = opts.doc !== undefined ? opts.doc : ( typeof document !== 'undefined' ? document : null );
		this.line = null;
		this._lineText = '';
		this._membersKey = '';
		this._spot = { x: 0, z: 0 };
		this.landed = []; // this session's crew catches (tests, the debug panel): { id, species, kg }
		this._build();

	}

	_build() {

		const doc = this.doc;
		if ( ! doc || ! doc.createElement || ! doc.body ) return;
		if ( ! cssDone ) {

			const st = doc.createElement( 'style' );
			st.textContent = CSS;
			( doc.head || doc.body ).append( st );
			cssDone = true;

		}

		this.line = doc.createElement( 'div' );
		this.line.className = 'cw-gunners';
		doc.body.append( this.line );

	}

	// ---------------------------------------------------------------- the save's view

	get state() {

		return ( this.features && this.features.state ) || ( this.app.game && this.app.game.state ) || null;

	}

	ctx() {

		const st = this.state;
		return { boat: st ? st.boat || null : null, unlocked: st && Array.isArray( st.unlocked ) ? st.unlocked : [], character: st ? st.character : null };

	}

	get posts() {

		return Object.fromEntries( this.crew.posts );

	}

	berths() {

		return berthsOf( this.ctx().boat );

	}

	rows() {

		return this.crew.rows( this.ctx() );

	}

	setPost( id, post ) {

		const ctx = this.ctx();
		const was = this.crew.postOf( id );
		const r = this.crew.setPost( id, post, ctx );
		const name = CHARACTERS[ id ] ? CHARACTERS[ id ].name : id;
		const row = this.crew.rows( ctx ).find( ( x ) => x.id === id );
		const why = row && row.choices.find( ( c ) => c.post === post );
		r.text = r.ok
			? ( post === 'off' ? `${ name } is off duty` : `${ name } is posted as ${ post === 'gunner' ? 'a gunner' : 'an angler' }` )
			: ( why && why.why ) || 'Not possible';
		if ( r.ok && ! r.same && was !== post ) {

			this._toast( r.text, 1800 );
			if ( this.features && this.features.emit ) this.features.emit( 'crewPosted', { id, post } );

		} else if ( ! r.ok ) this._toast( r.text, 2200 );
		return r;

	}

	berthNote() {

		const ctx = this.ctx(), n = berthsOf( ctx.boat ), b = BOATS[ ctx.boat ];
		if ( ! b ) return 'No boat: buy one at Captain Roid\'s yard to take a crew out';
		if ( n <= 0 ) return `The ${ b.name.toLowerCase() } has no crew berths`;
		return `Crew berths on the ${ b.name.toLowerCase() }: ${ this.crew.posts.size } of ${ n } taken`;

	}

	postHtml( id ) {

		const row = this.rows().find( ( r ) => r.id === id );
		if ( ! row || ! row.hired || row.playing ) return '';
		const btns = row.choices.map( ( c ) => `<button type="button" class="${ c.on ? 'is-on' : '' }" data-crew-post="${ c.post }" data-crew-id="${ id }"${ c.enabled || c.on ? '' : ' disabled' }${ c.why ? ` title="${ c.why.replace( /"/g, '&quot;' ) }"` : '' }>${ c.label }</button>` ).join( '' );
		return `<span class="cw-post-label">Post</span><div class="cw-post" role="group" aria-label="Post ${ row.name }">${ btns }</div>`;

	}

	bindPosts( root, rerender = null ) {

		if ( ! root || ! root.querySelectorAll ) return;
		for ( const b of root.querySelectorAll( '[data-crew-post]' ) ) {

			b.onclick = () => {

				this.setPost( b.dataset.crewId, b.dataset.crewPost );
				if ( rerender ) rerender();

			};

		}

	}

	hudLine() {

		return this.crew.hudLine( this._naval(), this.ctx() );

	}

	// ---------------------------------------------------------------- frame

	_naval() {

		const f = this.features;
		return f && f.get ? f.get( 'naval' ) : null;

	}

	_toast( text, ms = 2400 ) {

		const g = this.app.game;
		if ( g && typeof g.toast === 'function' ) g.toast( text, ms );

	}

	_aboard() {

		const p = this.app.player;
		return !! p && ABOARD.includes( p.mode );

	}

	// at sea: the boat afloat and loose (not moored), clear of every port's dock
	_atSea( b, nv ) {

		if ( ! b || ! b.position || b.enabled === false || b.moored ) return false;
		if ( ! this.ctx().boat ) return false;
		if ( nv && ( nv.playerHull && nv.playerHull.sunk || nv.sinking ) ) return false;
		if ( b.position.y < - 50 ) return false; // (a wrecked boat waits far below)
		for ( const p of WORLD.ports || [] ) {

			const d = p.dock && p.dock.position;
			if ( d && Math.hypot( b.position.x - d.x, b.position.z - d.z ) < CREW_RULES.portRadius ) return false;

		}

		return true;

	}

	// the side of the boat facing the nearest hostile pirate in sight (null: none)
	_nearSide( b, nv ) {

		if ( ! nv || ! nv.ships || ! b || ! b.position || ! b.quaternion ) return null;
		const reach = typeof nv.sightRange === 'function' ? nv.sightRange() : 400;
		let best = null, bd = Infinity;
		for ( const s of nv.ships ) {

			if ( ! s.alive || s.faction !== 'pirate' ) continue;
			const d = Math.hypot( s.x - b.position.x, s.z - b.position.z );
			if ( d < bd && d <= reach ) { bd = d; best = s; }

		}

		if ( ! best ) return null;
		const n = rotateByQuat( b.quaternion, { x: 1, y: 0, z: 0 } );
		return ( best.x - b.position.x ) * n.x + ( best.z - b.position.z ) * n.z >= 0 ? 'port' : 'starboard';

	}

	// the water off the rail where the anglers' lines are: Game.habitatAtPoint (the player's own weights), else Bites.habitatAt
	_habitat( b ) {

		const n = rotateByQuat( b.quaternion, { x: 1, y: 0, z: 0 } );
		const x = b.position.x + n.x * LINE_OUT, z = b.position.z + n.z * LINE_OUT;
		this._spot.x = x;
		this._spot.z = z;
		const T = this.app.terrainData;
		const depth = T && T.heightAt ? Math.max( 0, - T.heightAt( x, z ) ) : 20;
		const g = this.app.game;
		if ( g && typeof g.habitatAtPoint === 'function' ) {

			try { return g.habitatAtPoint( x, z, depth ); } catch ( e ) { /* the plain weights below */ }

		}

		const reef = WORLD.reef;
		const reefDist = reef ? Math.hypot( x - reef.center.x, z - reef.center.z ) - reef.radius : 999;
		return habitatAt( { depth, reefDist, pierDist: 999 } );

	}

	// a bait for the next cast: trade's operating (one per cast; a bare hook's slower factor when out; 1 in the sandbox)
	_bait() {

		const f = this.features, tr = f && f.get ? f.get( 'trade' ) : null;
		try {

			const k = tr && tr.operating && typeof tr.operating.useBait === 'function' ? tr.operating.useBait() : 1;
			return Number.isFinite( k ) && k > 0 ? k : 1;

		} catch ( e ) {

			return 1;

		}

	}

	// the game's catch entry point: Game.landCatch when it exists, else the same steps as Game.updateFight's catch
	_land( c ) {

		const g = this.app.game, st = g && g.state;
		if ( ! st || typeof st.addFish !== 'function' ) return false;
		const where = { habitat: c.habitat, aboard: true, by: c.id, x: this._spot.x, z: this._spot.z };
		if ( typeof g.landCatch === 'function' ) g.landCatch( c.species, c.kg, where );
		else {

			const hour = this._hour();
			st.addFish( c.species, c.kg, hour, { habitat: c.habitat, aboard: true } );
			const info = st.lastCatch;
			try { if ( g.contracts && g.contracts.onCatch ) g.contracts.onCatch( info ); } catch ( e ) { /* the quests are the game's */ }
			if ( this.features && this.features.emit ) this.features.emit( 'fishCaught', { species: c.species, kg: c.kg, value: info ? info.value : 0, habitat: c.habitat, aboard: true, crew: c.id, x: this._spot.x, z: this._spot.z } );

		}

		this.landed.push( { id: c.id, species: c.species, kg: c.kg } );
		if ( this.landed.length > 50 ) this.landed.shift();
		return true;

	}

	_hour() {

		const g = this.app.game;
		const h = g && Number.isFinite( g.hour ) ? g.hour : this.app.settings ? this.app.settings.timeOfDay : 12;
		return Number.isFinite( h ) ? h : 12;

	}

	update( dt ) {

		if ( ! ( dt > 0 ) ) return;
		dt = Math.min( dt, 0.25 );
		const ctx = this.ctx();
		// the played character leaves the post; a smaller hull sends the last posted ashore
		for ( const d of this.crew.sync( ctx ) ) {

			const name = CHARACTERS[ d.id ] ? CHARACTERS[ d.id ].name : d.id;
			const boat = BOATS[ ctx.boat ];
			this._toast( d.why === 'playing' ? `${ name } leaves the ${ d.post }'s post: you are playing them now` : `${ name } went ashore: no berth on the ${ boat ? boat.name.toLowerCase() : 'boat' }`, 2600 );

		}

		const b = this.app.boatCtl, nv = this._naval();
		const atSea = this._atSea( b, nv );
		const aboard = this._aboard();

		// gunners: sides by the nearest hostile, then each tries his broadside
		const gunners = this.crew.gunners( ctx );
		if ( gunners.length ) {

			this.crew.assignSides( this._nearSide( b, nv ), ctx );
			for ( const f of this.crew.tickGunners( dt, { aboard: aboard && atSea, naval: nv, ctx } ) ) if ( this.deck ) this.deck.fired( f.id );

		}

		// anglers
		if ( this.crew.anglers( ctx ).length && b && b.position && b.quaternion ) {

			const speed = Number.isFinite( b.speed ) ? b.speed : b.velocity ? Math.hypot( b.velocity.x, b.velocity.z ) : 0;
			const rate = anglerRate( { atSea, speed, anchored: !! b.anchored } );
			let h = null;
			const st = this.state;
			const out = this.crew.tickAnglers( dt, {
				rate, hour: this._hour(), ctx,
				habitat: () => h || ( h = this._habitat( b ) ),
				fits: ( kg ) => ! st || typeof st.fits !== 'function' || st.fits( kg ),
				bait: () => this._bait(),
			} );
			for ( const c of out ) {

				if ( c.full ) {

					this._toast( c.text, 2600 );
					continue;

				}

				if ( this._land( c ) ) {

					this._toast( c.text, 3000 );
					if ( this.deck ) this.deck.caught( c.id );

				}

			}

		}

		this._updateDeck( dt, ctx, b, nv );
		this._updateLine( aboard, b, nv, ctx );

	}

	_members( ctx ) {

		const out = [];
		this.crew.gunners( ctx ).forEach( ( id, i ) => out.push( { id, post: 'gunner', side: this.crew.sides.get( id ) || ( i ? 'starboard' : 'port' ), slot: i } ) );
		this.crew.anglers( ctx ).forEach( ( id, i ) => out.push( { id, post: 'angler', side: i % 2 ? 'starboard' : 'port', slot: i } ) );
		return out;

	}

	_updateDeck( dt, ctx, b, nv ) {

		if ( ! this.deck ) return;
		const members = this._members( ctx );
		const key = members.map( ( m ) => `${ m.id }:${ m.post }:${ m.side }:${ m.slot }` ).join( '|' );
		if ( key !== this._membersKey ) {

			this._membersKey = key;
			this.deck.sync( members );

		}

		const visible = !! ( ctx.boat && b && b.position && b.enabled !== false && b.position.y > - 50 && ! ( nv && nv.playerHull && nv.playerHull.sunk ) );
		const lines = b && b.model && b.model.lines;
		const deckY = lines && Number.isFinite( lines.deckY ) ? lines.deckY : null;
		const cam = this.app.camera;
		this.deck.update( dt, {
			boat: b, boatId: ctx.boat, deckY, visible, eye: cam && cam.position ? cam.position : null,
			reloading: ( side ) => !! ( nv && nv.reloadLeft && nv.reloadLeft[ side ] > 0 ),
		} );

	}

	// "Gunners: ..." under the naval HUD while aboard with a pirate in sight
	_updateLine( aboard, b, nv, ctx ) {

		let text = '';
		if ( aboard && nv && this.crew.gunners( ctx ).length && this._nearSide( b, nv ) ) text = this.crew.hudLine( nv, ctx ) || '';
		this._lineText = text;
		if ( ! this.line ) return;
		this.line.classList.toggle( 'is-on', !! text );
		if ( text && this.line.textContent !== text ) this.line.textContent = text;

	}

	toJSON() {

		return this.crew.toJSON();

	}

	fromJSON( d ) {

		this.crew.fromJSON( d );
		this._membersKey = '';

	}

	reset() {

		this.crew.reset();
		this._membersKey = '';
		this.landed.length = 0;
		if ( this.deck ) this.deck.sync( [] );

	}

	dispose() {

		if ( this.deck ) this.deck.dispose();
		if ( this.line ) this.line.remove();
		this.line = null;

	}

}

export default { install };
