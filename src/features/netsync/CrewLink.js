// The crew on other players' boats (wave 11). The skipper's posted crew rides in the decorated state as
// crew: [ [ characterId, 'gunner' | 'angler', 'p' | 's', slot ] ] (NetSync.decorateState, only while the state carries a boat);
// every other client stands them on that boat with the crew feature's own CrewDeck (Deck.js) in a passive mode: the figures
// follow the remote boat's interpolated pose (RemotePlayers boatPos / boatQuat) and play idle / hold; a remote crew gunner's
// shot (fx 'shot' with c: the gunner's id) plays the point gesture. Nothing is simulated for them here (no fire, no fish).
//
//   const cl = new CrewLink( sync );  cl.decorate( state );  cl.update( dt );  cl.fired( peerId, crewId );  cl.clear()
//   cl.members() -> the local crew as sent;  cl.decks Map peer id -> { deck, key };  cl.stats { synced }
// sync.opts.crewDeck: () => a CrewDeck-like { sync, update, fired, dispose } (tests; default new CrewDeck on app.scene).

import { CrewDeck } from '../crew/Deck.js';
import { CHARACTERS } from '../../game/Characters.js';

export const MAX_CREW = 8;
const POSTS = [ 'gunner', 'angler' ];

// a sent crew list back into CrewDeck members ([] when malformed)
export function crewMembers( list ) {

	const out = [], seen = new Set();
	if ( ! Array.isArray( list ) ) return out;
	for ( const e of list ) {

		if ( out.length >= MAX_CREW ) break;
		if ( ! Array.isArray( e ) || typeof e[ 0 ] !== 'string' || ! CHARACTERS[ e[ 0 ] ] || seen.has( e[ 0 ] ) || ! POSTS.includes( e[ 1 ] ) ) continue;
		seen.add( e[ 0 ] );
		out.push( { id: e[ 0 ], post: e[ 1 ], side: e[ 2 ] === 's' ? 'starboard' : 'port', slot: Math.max( 0, Math.min( 7, e[ 3 ] | 0 ) ) } );

	}

	return out;

}

export class CrewLink {

	constructor( sync ) {

		this.sync = sync;
		this.decks = new Map();
		this.stats = { synced: 0 };

	}

	_crew() {

		const f = this.sync.features;
		return f && f.get ? f.get( 'crew' ) : null;

	}

	// the local crew on deck as the crew feature places it (crew.members() when it offers one, else its own _members( ctx ))
	members() {

		const c = this._crew();
		if ( ! c ) return [];
		let list = null;
		try {

			if ( typeof c.members === 'function' ) list = c.members();
			else if ( typeof c._members === 'function' && typeof c.ctx === 'function' ) list = c._members( c.ctx() );

		} catch ( e ) {

			return [];

		}

		const out = [];
		for ( const m of Array.isArray( list ) ? list : [] ) {

			if ( out.length >= MAX_CREW ) break;
			if ( ! m || typeof m.id !== 'string' || ! CHARACTERS[ m.id ] || ! POSTS.includes( m.post ) ) continue;
			out.push( [ m.id, m.post, m.side === 'starboard' ? 's' : 'p', m.slot | 0 ] );

		}

		return out;

	}

	// NetSync.decorateState: the crew rides with the boat
	decorate( s ) {

		if ( ! s || ! s.boat ) return s;
		const m = this.members();
		if ( m.length ) s.crew = m;
		return s;

	}

	_makeDeck() {

		const make = this.sync.opts && this.sync.opts.crewDeck;
		if ( make ) return make();
		const app = this.sync.app;
		if ( ! app.scene ) return null;
		return new CrewDeck( { scene: app.scene, avatarFactory: ( app.residents && app.residents.avatarFactory ) || null } );

	}

	update( dt ) {

		const app = this.sync.app, rp = app.remotePlayers, net = this.sync.net;
		const seen = new Set();
		if ( rp && rp.peers && net && net.online ) {

			const eye = app.camera && app.camera.position ? app.camera.position : null;
			for ( const [ id, p ] of rp.peers ) {

				const list = p.extra && Array.isArray( p.extra.crew ) ? p.extra.crew : null;
				if ( ! list || ! list.length || ! p.boatState || ! p.hasPose || ! p.boatPos ) continue;
				const members = crewMembers( list );
				if ( ! members.length ) continue;
				let d = this.decks.get( id );
				if ( ! d ) {

					let deck = null;
					try { deck = this._makeDeck(); } catch ( e ) { deck = null; }
					if ( ! deck ) continue;
					this.decks.set( id, d = { deck, key: '' } );

				}

				seen.add( id );
				const key = members.map( ( m ) => `${ m.id }:${ m.post }:${ m.side }:${ m.slot }` ).join( '|' );
				if ( key !== d.key ) {

					d.key = key;
					d.deck.sync( members );
					this.stats.synced ++;

				}

				const model = p.boat || null, lines = model && ( model.lines || ( model.model && model.model.lines ) );
				d.deck.update( dt, {
					boat: { position: p.boatPos, quaternion: p.boatQuat }, boatId: p.boatState.id,
					deckY: lines && Number.isFinite( lines.deckY ) ? lines.deckY : null, visible: p.boatPos.y > - 50, eye,
				} );

			}

		}

		for ( const [ id, d ] of this.decks ) {

			if ( seen.has( id ) ) continue;
			d.deck.dispose();
			this.decks.delete( id );

		}

	}

	// a remote crew gunner fired: the point gesture on that boat
	fired( peer, crewId ) {

		const d = this.decks.get( peer );
		if ( d && typeof crewId === 'string' && d.deck.fired ) d.deck.fired( crewId );

	}

	clear() {

		for ( const d of this.decks.values() ) d.deck.dispose();
		this.decks.clear();

	}

	dispose() {

		this.clear();

	}

}
