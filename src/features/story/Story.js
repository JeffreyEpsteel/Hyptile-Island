import { WORLD } from '../../world/WorldLayout.js';
import { CHAINS, NPCS, ITEMS, VENDOR_NPC, KEEPERS, BUYERS, errandChains, speciesLabel, portAt, nearestPort, portName } from './StoryData.js';
import { DISPOSITION, blankMemory, cleanMemory, clampDisposition } from './Memory.js';
import { gate, matches, amount, pickFish, isNight, isDawnDusk } from './Rules.js';
import { buildModel, applyChoice, chainsOf } from './Dialogue.js';
import { DialogueUI, journalHTML } from './DialogueUI.js';
import { RESIDENTS } from '../../world/residents/ResidentData.js';

// The story: quest chains (StoryData.CHAINS + one errand per extra port), conversations (Dialogue.js), what each
// person remembers of the player (Memory.js) and the consequences of what the player does (per-port grudges).
//
//   const story = features.get( 'story' );
//   story.talkTo( npc, { force } ) -> bool     open a conversation (residents only open one when there is quest business;
//                                              otherwise they say their own line: Game falls back to Residents.interact)
//   story.dialogue( npc, node ) / story.choose( npc, choiceId )    the conversation model (Dialogue.js) without the panel
//   story.accept( id ), story.abandon( id ), story.turnIn( id, npc ), story.isDone( id ), story.isActive( id )
//   story.offers( npc ), story.pendingAt( npc ), story.runningFrom( npc ), story.stepText( id ), story.journal()
//   story.rep( port )        GameState reputation minus the port's grudge (can go negative)
//   story.hostile( port )    rep <= HOSTILE: the port's people refuse work and talk; priceMod rises
//   story.priceMod( port )   multiplier on what the port charges the player (0.9 beloved .. 1.25 hostile; trade reads it)
//   story.perk( name )       summed perks of the items the story gave (lineWindow, biteSpeed, weatherCalm, nightBite)
//   story.roidTopics() / story.roidAsk( id )    Captain Roid's Talk tab rows (HudPanels)
//   story.vendorQuests()     rows for PoorGoat's / Pons' Quests tab (Contracts.active appends them)
//   story.isOpen / close()   the conversation panel (the registry's contract)
//
// Events listened to: fishCaught, fishSold, cargoSold, cargoBought, portVisited, shipSunk, bountyClaimed, propDestroyed,
//   planeTookOff, planeLanded, enemyDefeated, noticeCompleted, lootCollected, playerBoatSunk, residentPrank,
//   prisonerRansomed, denRaided, customsInspected (and anything a chain step names)
// Events emitted: questAccepted { id, title, giver, port }   questStep { id, step }   questCompleted { id, title, giver,
//   port, reward }   questAbandoned { id }   reputationChanged { port, delta, reason, rep }   rewardUnlock { character, id,
//   source: 'story' }   storyItem { item }

export const HOSTILE = - 15; // story.rep at or below this: the port is hostile
export const GRUDGE_DECAY = 2; // grudge forgiven per in-game day
export const GRUDGE = { merchant: 20, navy: 12, prop: 2, customs: 4 };
export const OFFERS_PER_NPC = 2; // a person pitches at most this many chains at once
const SAVE_VERSION = 1;
const POLL = 0.5;
const LISTEN = [ 'fishCaught', 'fishSold', 'cargoSold', 'cargoBought', 'portVisited', 'shipSunk', 'bountyClaimed', 'propDestroyed',
	'planeTookOff', 'planeLanded', 'enemyDefeated', 'noticeCompleted', 'lootCollected', 'playerBoatSunk', 'residentPrank',
	'prisonerRansomed', 'denRaided', 'customsInspected' ];
const num = ( v, d = 0 ) => ( typeof v === 'number' && Number.isFinite( v ) ? v : d );
const clamp = ( v, a, b ) => Math.max( a, Math.min( b, v ) );
const RES_BY_ID = new Map( RESIDENTS.map( ( r ) => [ r.id, r ] ) );

export class Story {

	constructor( app, features ) {

		this.app = app;
		this.features = features;
		this.lastError = '';
		this.ui = null;
		this._uiFailed = false;
		this.current = null; // { npc, node, model } the open conversation (also headless)
		this._roidNode = 'root';
		this._offs = [];
		this._pollT = 0;
		this._portCount = - 1;
		this._spots = false;
		this._initState();
		this._refreshChains();
		const names = new Set( LISTEN );
		for ( const c of Object.values( this.chains ) ) for ( const s of c.steps ) for ( const n of [].concat( s.on || [] ) ) names.add( n );
		for ( const name of names ) this._offs.push( features.on( name, ( e ) => this._onEvent( name, e ) ) );

	}

	_initState() {

		this.progress = {}; // chain id -> { s: 'active' | 'done', step, n, at, end }
		this.memory = {}; // npc id -> Memory record
		this.grudge = {}; // port id -> 0..100
		this.flags = [];
		this.items = []; // ITEMS ids owned
		this.unlocks = []; // ITEMS ids the player may buy
		this.log = []; // recent outcomes { id, title, outcome, day }
		this.stats = { done: 0, dropped: 0 };
		this._ownDay = 0;
		this._lastTod = null;
		this._rolledDay = null;

	}

	_refreshChains() {

		const n = WORLD.ports.length;
		if ( n === this._portCount ) return;
		this._portCount = n;
		this.chains = { ...CHAINS, ...errandChains( WORLD.ports ) };

	}

	// ---------------------------------------------------------------- lookups

	get state() {

		return this.features.state;

	}

	get day() {

		const n = this.features.get && this.features.get( 'notices' );
		return n && Number.isFinite( n.day ) ? n.day : this._ownDay;

	}

	get tod() {

		const s = this.app && this.app.settings;
		return s && Number.isFinite( s.timeOfDay ) ? s.timeOfDay : 12;

	}

	get player() {

		const p = this.app && this.app.player;
		return p && p.position ? p : null;

	}

	chain( id ) {

		return this.chains[ id ] || null;

	}

	isDone( id ) {

		return !! ( this.progress[ id ] && this.progress[ id ].s === 'done' );

	}

	isActive( id ) {

		return !! ( this.progress[ id ] && this.progress[ id ].s === 'active' );

	}

	npc( id ) {

		return NPCS[ id ] || null;

	}

	// a resident id (or name) to a story person: the id itself, or a harbour-folk entry matched by first name
	resolveNpc( id, resident = null ) {

		if ( NPCS[ id ] ) return id;
		const name = String( ( resident && resident.name ) || id || '' ).toLowerCase().split( /[\s']/ )[ 0 ];
		for ( const [ k, v ] of Object.entries( NPCS ) ) if ( v.match && ( v.match === name || v.match === String( id ).toLowerCase() ) ) return k;
		return null;

	}

	// who keeps a port's word (the board keeper the notice board offers a conversation with)
	keeperOf( port ) {

		const id = KEEPERS[ port ];
		return id && NPCS[ id ] ? { id, name: NPCS[ id ].name } : null;

	}

	memoryOf( npc ) {

		return this.memory[ npc ] || blankMemory();

	}

	_mem( npc ) {

		return this.memory[ npc ] || ( this.memory[ npc ] = blankMemory() );

	}

	_dispose( npc, delta ) {

		if ( ! npc || ! NPCS[ npc ] ) return;
		const m = this._mem( npc );
		m.disposition = clampDisposition( m.disposition + delta );

	}

	_note( npc, key, add = 1 ) {

		if ( ! npc || ! NPCS[ npc ] ) return;
		const m = this._mem( npc );
		m.notes[ key ] = num( m.notes[ key ] ) + add;

	}

	ctx( npc ) {

		const spec = NPCS[ npc ];
		return { story: this, state: this.state, npc, mem: this.memoryOf( npc ), night: isNight( this.tod ), features: this.features, port: spec ? spec.port : 'home' };

	}

	// ---------------------------------------------------------------- reputation and consequences

	rep( port ) {

		const st = this.state;
		const base = st && st.rep && Number.isFinite( st.rep[ port ] ) ? st.rep[ port ] : 0;
		return base - num( this.grudge[ port ] );

	}

	hostile( port ) {

		return this.rep( port ) <= HOSTILE;

	}

	hostileTo( npc ) {

		const spec = NPCS[ npc ];
		if ( ! spec ) return false;
		return this.hostile( spec.port ) || this.memoryOf( npc ).disposition <= - 40;

	}

	priceMod( port ) {

		const r = this.rep( port );
		if ( r >= 0 ) return Math.round( ( 1 - Math.min( 0.1, r / 400 ) ) * 1000 ) / 1000;
		return Math.round( ( 1 + Math.min( 0.25, - r / 200 ) ) * 1000 ) / 1000;

	}

	_grudge( port, delta, reason ) {

		if ( ! port ) return;
		const before = num( this.grudge[ port ] ), wasHostile = this.hostile( port );
		const v = clamp( before + delta, 0, 100 );
		if ( v === before ) return;
		if ( v > 0 ) this.grudge[ port ] = Math.round( v * 100 ) / 100;
		else delete this.grudge[ port ];
		this.features.emit( 'reputationChanged', { port, delta: - ( v - before ), reason, rep: this.rep( port ) } );
		if ( ! wasHostile && this.hostile( port ) ) this._toast( `${ portName( port ) } will not deal with you after that. Make amends with its people.`, 4200 );
		else if ( wasHostile && ! this.hostile( port ) ) this._toast( `${ portName( port ) } is willing to talk to you again.`, 3200 );

	}

	_addRep( port, n, reason ) {

		const st = this.state;
		if ( ! st || ! n ) return;
		if ( typeof st.addRep === 'function' ) st.addRep( port, n );
		this.features.emit( 'reputationChanged', { port, delta: n, reason, rep: this.rep( port ) } );

	}

	amendsCost( npc ) {

		const spec = NPCS[ npc ];
		const g = spec ? num( this.grudge[ spec.port ] ) : 0;
		return Math.max( 30, Math.ceil( g ) * 6 );

	}

	// ---------------------------------------------------------------- chains

	canAccept( id ) {

		const c = this.chains[ id ];
		if ( ! c || this.progress[ id ] ) return false;
		if ( this.hostileTo( c.giver ) ) return false;
		return gate( c.requires, this.ctx( c.giver ) );

	}

	offers( npc ) {

		const out = [];
		for ( const [ id, c ] of Object.entries( this.chains ) ) {

			if ( c.giver !== npc || ! this.canAccept( id ) ) continue;
			out.push( id );
			if ( out.length >= OFFERS_PER_NPC ) break;

		}

		return out;

	}

	runningFrom( npc ) {

		return Object.keys( this.progress ).filter( ( id ) => this.isActive( id ) && this.chains[ id ] && this.chains[ id ].giver === npc );

	}

	_step( id ) {

		const c = this.chains[ id ], p = this.progress[ id ];
		return c && p && p.s === 'active' ? c.steps[ p.step ] || null : null;

	}

	// running chains waiting on `npc`: a talk step with them, or a hand-in to them ({ id, step, kind, ready })
	pendingAt( npc ) {

		const out = [];
		const inv = this.state ? this.state.inventory : [];
		for ( const id of Object.keys( this.progress ) ) {

			const s = this._step( id );
			if ( ! s ) continue;
			if ( s.talk === npc ) out.push( { id, step: s, kind: 'talk', ready: true } );
			else if ( s.deliver && s.at === npc ) out.push( { id, step: s, kind: 'deliver', ready: pickFish( s.deliver, inv, s.goal || 1 ).length >= ( s.goal || 1 ) } );

		}

		return out;

	}

	// the journal line of a chain's current step ('Catch three Silver Minnows (1 / 3)')
	stepText( id ) {

		const s = this._step( id ), p = this.progress[ id ];
		if ( ! s ) return this.isDone( id ) ? 'Done' : '';
		const goal = s.goal || 1;
		let text = String( s.text || '' ).replace( '{species}', speciesLabel( s.match || s.deliver, goal ) ).replace( '{n}', goal );
		if ( s.on && goal > 1 ) text += s.count === 'total' || s.count === 'value' ? ` ($${ Math.floor( p.n ) } / $${ goal })` : ` (${ Math.floor( p.n ) } / ${ goal })`;
		if ( s.deliver ) {

			const have = pickFish( s.deliver, this.state ? this.state.inventory : [], goal ).length;
			text += ` (${ have } / ${ goal } in the hold)`;

		}

		return text;

	}

	accept( id, npc = null ) {

		this.lastError = '';
		const c = this.chains[ id ];
		if ( ! c ) return this._fail( 'Unknown work' );
		if ( this.progress[ id ] ) return this._fail( this.isDone( id ) ? 'Already done' : 'Already running' );
		if ( npc && c.giver !== npc ) return this._fail( 'Ask the right person' );
		if ( ! this.canAccept( id ) ) return this._fail( this.hostileTo( c.giver ) ? 'They will not give you work' : 'Not yet' );
		this.progress[ id ] = { s: 'active', step: 0, n: 0, at: this.day, end: - 1 };
		this._touch( c.giver );
		this.features.emit( 'questAccepted', { id, title: c.title, giver: c.giver, port: c.port } );
		this._toast( `Quest: ${ c.title } · ${ this.stepText( id ) }`, 3200 );
		this._poll(); // a step that already holds (own a boat, be somewhere) completes now
		this._changed();
		return true;

	}

	abandon( id ) {

		const c = this.chains[ id ];
		if ( ! this.isActive( id ) ) return false;
		delete this.progress[ id ];
		this._dispose( c.giver, - 2 );
		this.stats.dropped ++;
		this._log( id, 'dropped' );
		this.features.emit( 'questAbandoned', { id } );
		this._changed();
		return true;

	}

	// a talk / hand-in step with `npc`: { said, done, reward } or null (lastError says why)
	turnIn( id, npc ) {

		this.lastError = '';
		const s = this._step( id ), c = this.chains[ id ];
		if ( ! s ) return this._fail( 'Nothing to hand in' );
		if ( s.talk !== npc && ! ( s.deliver && s.at === npc ) ) return this._fail( 'That is for someone else' );
		if ( s.deliver ) {

			const goal = s.goal || 1, st = this.state;
			const ids = pickFish( s.deliver, st ? st.inventory : [], goal );
			if ( ids.length < goal ) return this._fail( s.missing || 'Not in your hold' );
			const taken = st.takeFish( ids );
			if ( taken.length < goal ) return this._fail( s.missing || 'Not in your hold' );

		}

		const done = this._advance( id );
		const next = done ? '' : this.stepText( id );
		const r = { said: done ? c.thanks : `${ s.deliver ? 'Good. ' : '' }${ next ? `Next: ${ next }.` : '' }`.trim(), done, reward: done ? c.reward : null };
		this._changed();
		return r;

	}

	// the step is done: the next one, or the chain completes (true)
	_advance( id ) {

		const p = this.progress[ id ], c = this.chains[ id ];
		this.features.emit( 'questStep', { id, step: c.steps[ p.step ] ? c.steps[ p.step ].id : '' } );
		p.step ++;
		p.n = 0;
		if ( p.step < c.steps.length ) {

			this._toast( `${ c.title } · ${ this.stepText( id ) }`, 2800 );
			return false;

		}

		this._complete( id );
		return true;

	}

	_complete( id ) {

		const c = this.chains[ id ], p = this.progress[ id ], r = c.reward || {}, st = this.state;
		p.s = 'done';
		p.end = this.day;
		delete p.step;
		delete p.n;
		if ( st && r.money > 0 && typeof st.earn === 'function' ) st.earn( r.money );
		if ( st && r.xp > 0 && typeof st.addXp === 'function' ) st.addXp( r.xp );
		for ( const [ port, n ] of Object.entries( r.rep || {} ) ) this._addRep( port, n, 'quest' );
		if ( r.item && ITEMS[ r.item ] && ! this.items.includes( r.item ) ) {

			this.items.push( r.item );
			this.features.emit( 'storyItem', { item: r.item } );

		}

		if ( r.unlockItem && ITEMS[ r.unlockItem ] && ! this.unlocks.includes( r.unlockItem ) ) this.unlocks.push( r.unlockItem );
		if ( r.flag && ! this.flags.includes( r.flag ) ) this.flags.push( r.flag );
		if ( r.disposition ) this._dispose( c.giver, r.disposition );
		if ( r.rescue && NPCS[ r.rescue ] ) {

			const m = this._mem( r.rescue );
			m.rescues ++;
			m.disposition = clampDisposition( m.disposition + DISPOSITION.rescue );
			this._note( r.rescue, 'rescues' );

		}

		if ( r.unlock ) this.features.emit( 'rewardUnlock', { character: r.unlock, id, source: 'story' } );
		this.stats.done ++;
		this._log( id, 'done' );
		this.features.emit( 'questCompleted', { id, title: c.title, giver: c.giver, port: c.port, reward: { ...r } } );
		this._toast( `${ c.title } · done${ r.money ? ` · +$${ r.money }` : '' }${ r.xp ? ` · +${ r.xp } XP` : '' }`, 3600 );

	}

	_log( id, outcome ) {

		const c = this.chains[ id ];
		this.log.unshift( { id, title: c ? c.title : id, outcome, day: this.day } );
		if ( this.log.length > 8 ) this.log.length = 8;

	}

	_fail( msg ) {

		this.lastError = msg;
		return null;

	}

	// ---------------------------------------------------------------- events

	_evCtx() {

		const p = this.player, w = this.features.get && this.features.get( 'weather' );
		let weather = null;
		try { weather = w ? w.kind : null; } catch ( e ) { weather = null; }
		return { night: isNight( this.tod ), dawnDusk: isDawnDusk( this.tod ), weather, player: p ? { x: p.position.x, z: p.position.z } : null };

	}

	_onEvent( name, e ) {

		e = e && typeof e === 'object' ? e : {};
		try { this._consequence( name, e ); } catch ( err ) { console.warn( 'story: consequence failed', err ); }
		const ctx = this._evCtx();
		let changed = false;
		for ( const id of Object.keys( this.progress ) ) {

			const s = this._step( id );
			if ( ! s || ! s.on || ! [].concat( s.on ).includes( name ) ) continue;
			if ( s.match && ! matches( s.match, e, ctx ) ) continue;
			const p = this.progress[ id ];
			p.n += amount( s, e );
			changed = true;
			if ( p.n >= ( s.goal || 1 ) ) this._advance( id );

		}

		if ( changed ) this._changed();

	}

	// what the world remembers of an event (grudges, memory, notes)
	_consequence( name, e ) {

		const day = this.day;
		switch ( name ) {

			case 'shipSunk': {

				if ( e.byPlayer !== true ) break;
				const port = nearestPort( e.x, e.z );
				if ( e.faction === 'merchant' ) {

					this._grudge( port, GRUDGE.merchant, 'merchant sunk' );
					const k = KEEPERS[ port ];
					if ( k ) { const m = this._mem( k ); m.attacks ++; m.disposition = clampDisposition( m.disposition + DISPOSITION.attack ); }

				} else if ( e.faction === 'navy' ) this._grudge( 'home', GRUDGE.navy, 'navy sunk' );
				else if ( e.faction === 'pirate' ) {

					this._addRep( port, 1, 'pirate sunk' );
					this._note( KEEPERS[ port ], 'pirates' );

				}

				break;

			}

			case 'propDestroyed': {

				if ( e.by !== undefined && e.by !== 'player' ) break;
				const port = portAt( e.x, e.z );
				if ( ! port ) break;
				this._grudge( port, GRUDGE.prop, 'harbour damage' );
				const k = KEEPERS[ port ];
				if ( k ) { const m = this._mem( k ); m.pranks ++; m.disposition = clampDisposition( m.disposition + DISPOSITION.prank ); }
				break;

			}

			case 'fishSold': {

				const npc = BUYERS[ e.port || 'home' ];
				if ( ! npc || ! ( num( e.total ) > 0 ) ) break;
				const m = this._mem( npc );
				m.trades ++;
				m.lastDay = day;
				m.disposition = clampDisposition( m.disposition + DISPOSITION.trade );
				break;

			}

			case 'cargoSold': case 'cargoBought': {

				const npc = KEEPERS[ e.port ];
				if ( ! npc ) break;
				const m = this._mem( npc );
				if ( name === 'cargoBought' ) m.purchases ++;
				else m.trades ++;
				m.disposition = clampDisposition( m.disposition + DISPOSITION.trade / 2 );
				break;

			}

			case 'portVisited': {

				const k = KEEPERS[ e.port ];
				if ( k && this.memory[ k ] ) this.memory[ k ].lastDay = day;
				break;

			}

			case 'bountyClaimed': this._note( 'roid', 'bounties' ); this._note( 'orla', 'bounties' ); break;
			case 'enemyDefeated': if ( e.kind === 'raider' ) this._note( 'orla', 'raiders' ); break;
			case 'playerBoatSunk': this._note( 'roid', 'sinks' ); break;
			case 'residentPrank': {

				const npc = this.resolveNpc( e.id );
				if ( npc ) this._mem( npc ).pranks ++;
				break;

			}

			case 'prisonerRansomed': this._addRep( e.port || 'home', 2, 'ransom' ); break;
			case 'denRaided': {

				const port = e.port || nearestPort( e.x, e.z );
				this._addRep( port, 3, 'den raided' );
				this._grudge( port, - 5, 'den raided' );
				break;

			}

			case 'customsInspected': {

				if ( e.contraband || e.fined ) this._grudge( e.port || 'home', GRUDGE.customs, 'customs' );
				break;

			}

			case 'noticeCompleted': this._dispose( KEEPERS[ e.port ], 1 ); break;
			default: break;

		}

	}

	// steps that are states, not events: be somewhere, own something
	_poll() {

		const p = this.player, st = this.state;
		let changed = false;
		for ( const id of Object.keys( this.progress ) ) {

			const s = this._step( id );
			if ( ! s ) continue;
			let done = false;
			if ( s.check ) {

				try { done = !! s.check( { state: st, story: this, rep: ( port ) => this.rep( port ) } ); } catch ( e ) { done = false; }

			} else if ( s.reach && p ) {

				const r = s.reach, x = p.position.x, z = p.position.z;
				done = Math.hypot( x - r.x, z - r.z ) <= r.r;
				if ( done && r.aboard ) done = [ 'boat', 'deck', 'seat' ].includes( p.mode );
				if ( done && r.night ) done = isNight( this.tod );
				if ( done && r.port ) done = portAt( x, z ) === r.port;

			}

			if ( done ) {

				this._advance( id );
				changed = true;

			}

		}

		if ( st && st.boat && ! this.memoryOf( 'roid' ).notes.firstBoat ) this._mem( 'roid' ).notes.firstBoat = st.boat;
		if ( changed ) this._changed();

	}

	// once per in-game day: grudges fade, late debts sour
	_dayRoll() {

		const day = this.day;
		if ( this._rolledDay === null ) { this._rolledDay = day; return; }
		if ( day <= this._rolledDay ) return;
		const days = Math.min( 30, day - this._rolledDay );
		this._rolledDay = day;
		for ( const port of Object.keys( this.grudge ) ) this._grudge( port, - GRUDGE_DECAY * days, 'time' );
		for ( const [ npc, m ] of Object.entries( this.memory ) ) {

			if ( m.debt > 0 && Number.isFinite( m.notes.debtDay ) && day - m.notes.debtDay > 3 && ! m.notes.debtLate ) {

				m.notes.debtLate = 1;
				m.disposition = clampDisposition( m.disposition + DISPOSITION.debtLate );
				const spec = NPCS[ npc ];
				if ( spec ) this._toast( `${ spec.name } is still waiting for the $${ m.debt } you owe.`, 3200 );

			}

		}

	}

	_syncClock() {

		const t = this.tod;
		if ( this._lastTod !== null && t < this._lastTod - 12 ) this._ownDay ++;
		this._lastTod = t;

	}

	// ---------------------------------------------------------------- conversations

	// someone was spoken to: memory (met, talks, first / last day; a talk a day warms them a little)
	_touch( npc ) {

		if ( ! NPCS[ npc ] ) return;
		const m = this._mem( npc ), day = this.day;
		if ( ! m.met ) { m.met = true; m.firstDay = day; }
		if ( m.lastDay !== day ) m.disposition = clampDisposition( m.disposition + DISPOSITION.talk );
		m.lastDay = day;

	}

	// is there anything story-related to say to `npc` (residents only open the panel then)
	hasBusiness( npc ) {

		return this.hostileTo( npc ) || this.pendingAt( npc ).length > 0 || this.runningFrom( npc ).length > 0 || this.offers( npc ).length > 0;

	}

	talkTo( raw, { force = false, resident = null } = {} ) {

		const npc = this.resolveNpc( raw, resident );
		if ( ! npc ) return false;
		const business = this.hasBusiness( npc );
		this._touch( npc );
		this._mem( npc ).talks ++;
		if ( ! force && ! business ) return false;
		const g = this.app && this.app.game;
		try { if ( g && g.hud && g.hud.standOpen && g.hud.closeStand ) g.hud.closeStand(); } catch ( e ) { /* no HUD */ }
		const nb = this.features.get && this.features.get( 'notices' );
		try { if ( nb && nb.isOpen ) nb.close(); } catch ( e ) { /* ignore */ }
		this.current = { npc, node: 'root', said: null };
		this.current.model = buildModel( this, npc, 'root' );
		const ui = this._getUI();
		if ( ui ) ui.open( this.current.model );
		return true;

	}

	dialogue( npc, node = 'root', said = null ) {

		return buildModel( this, npc, node, said );

	}

	// a choice in the open conversation (or any, by npc): the next model, or null when it closed
	choose( npc, id ) {

		const r = applyChoice( this, npc, id );
		if ( r.close ) {

			this.current = null;
			if ( this.ui && this.ui.isOpen ) this.ui.close();
			if ( r.said ) this._toast( `${ NPCS[ npc ].name }: ${ r.said }`, 3000 );
			this._changed();
			return null;

		}

		const model = buildModel( this, npc, r.node, r.said );
		this.current = { npc, node: r.node, said: r.said, model };
		if ( this.ui && this.ui.isOpen ) this.ui.show( model );
		this._changed();
		return model;

	}

	// effects of authored topics: null, or what went wrong
	applyEffect( fx, npc ) {

		const st = this.state, m = this._mem( npc );
		if ( fx.buy ) {

			const it = ITEMS[ fx.buy ];
			if ( ! it || this.items.includes( fx.buy ) ) return 'You have that already.';
			if ( ! st || ! st.spend( it.price || 0 ) ) return 'Not enough coin. Come back after a good catch.';
			this.items.push( fx.buy );
			m.purchases ++;
			this.features.emit( 'storyItem', { item: fx.buy } );

		}

		if ( fx.lend ) {

			if ( m.debt > 0 ) return 'Pay back the last one first.';
			if ( st && st.earn ) st.earn( fx.lend );
			m.debt = Math.round( fx.lend * 1.2 );
			m.notes.debtDay = this.day;
			delete m.notes.debtLate;

		}

		if ( fx.repay ) {

			if ( ! ( m.debt > 0 ) ) return 'You owe nothing.';
			if ( ! st || ! st.spend( m.debt ) ) return 'You do not have it yet. Soon, yes?';
			m.debt = 0;
			m.disposition = clampDisposition( m.disposition + ( m.notes.debtLate ? 0 : DISPOSITION.debtPaid ) );
			delete m.notes.debtDay;
			delete m.notes.debtLate;

		}

		if ( fx.amends ) {

			const spec = NPCS[ npc ], cost = this.amendsCost( npc );
			if ( ! st || ! st.spend( cost ) ) return 'You do not have the coin for that.';
			this._grudge( spec.port, - 100, 'amends' );
			const base = st.rep && Number.isFinite( st.rep[ spec.port ] ) ? st.rep[ spec.port ] : 0;
			if ( base <= HOSTILE ) this._addRep( spec.port, HOSTILE - base + 1, 'amends' );
			if ( m.disposition < - 30 ) m.disposition = - 30;

		}

		if ( fx.note ) m.notes[ fx.note[ 0 ] ] = fx.note[ 1 ];
		if ( fx.disposition ) m.disposition = clampDisposition( m.disposition + fx.disposition );
		if ( fx.flag && ! this.flags.includes( fx.flag ) ) this.flags.push( fx.flag );
		return null;

	}

	canGift( npc ) {

		const st = this.state;
		return !! ( st && st.inventory && st.inventory.length && this.memoryOf( npc ).notes.giftDay !== this.day );

	}

	// hand the cheapest fish over as a gift (once a day per person)
	gift( npc ) {

		this.lastError = '';
		if ( ! this.canGift( npc ) ) return this._fail( this.memoryOf( npc ).notes.giftDay === this.day ? 'You gave them something today already.' : 'Your hold is empty.' );
		const st = this.state;
		const f = [ ...st.inventory ].sort( ( a, b ) => num( a.value ) - num( b.value ) )[ 0 ];
		st.takeFish( [ f.id ] );
		const m = this._mem( npc );
		m.gifts ++;
		m.notes.giftDay = this.day;
		m.disposition = clampDisposition( m.disposition + DISPOSITION.gift );
		return f;

	}

	// the harbour worker's services (tavern, crafting...) a person can open: harbour.services() entries naming them
	servicesFor( npc ) {

		const h = this.features.get && this.features.get( 'harbour' ), spec = NPCS[ npc ];
		if ( ! h || typeof h.services !== 'function' || ! spec ) return [];
		let list = [];
		try { list = h.services() || []; } catch ( e ) { list = []; }
		return list.filter( ( s ) => s && s.id && ( s.npc === npc || ( spec.match && s.npc === spec.match ) || ( Array.isArray( s.npcs ) && s.npcs.includes( npc ) ) ) )
			.map( ( s ) => ( { id: String( s.id ), label: s.label || s.name || String( s.id ) } ) );

	}

	openService( id ) {

		const h = this.features.get && this.features.get( 'harbour' );
		if ( ! h || typeof h.openService !== 'function' ) return false;
		try { return h.openService( id ) !== false; } catch ( e ) { return false; }

	}

	// what a resident says on their own (ResidentData lines), for greetings
	residentLines( npc ) {

		const r = RES_BY_ID.get( npc );
		return r && Array.isArray( r.lines ) ? r.lines.filter( ( l ) => l && l !== 'HAH!' ) : [];

	}

	perk( name ) {

		let v = 0;
		for ( const id of this.items ) v += num( ITEMS[ id ] && ITEMS[ id ].perk && ITEMS[ id ].perk[ name ] );
		return v;

	}

	// ---------------------------------------------------------------- Roid's Talk tab, the vendors' Quests tab

	roidTopics() {

		const m = buildModel( this, 'roid', this._roidNode );
		if ( ! m ) return [];
		return m.choices.filter( ( c ) => c.kind !== 'bye' && ! ( c.kind === 'back' && this._roidNode === 'root' ) ).map( ( c ) => ( { id: `story:${ c.id }`, label: c.label } ) );

	}

	// a story topic from Roid's tab: { lines: [ text ], close }
	roidAsk( id ) {

		const choice = String( id ).replace( /^story:/, '' );
		this._touch( 'roid' );
		const r = applyChoice( this, 'roid', choice );
		this._roidNode = r.close ? 'root' : r.node;
		const m = buildModel( this, 'roid', this._roidNode );
		const lines = r.said ? [ r.said ] : choice === 'back' || ! m ? [] : [ m.line ];
		this._changed();
		return { lines, close: !! r.close };

	}

	// rows for PoorGoat's / Pons' Quests tab (HudPanels questRow shape): the vendor whose port the player is at
	vendorQuests() {

		const p = this.player;
		const here = p ? nearestPort( p.position.x, p.position.z ) : null;
		const rows = [];
		for ( const npc of Object.values( VENDOR_NPC ) ) {

			if ( here && NPCS[ npc ].port !== here ) continue;
			const seen = new Set();
			const row = ( id, text, progress, goal ) => {

				if ( seen.has( id ) ) return;
				seen.add( id );
				const c = this.chains[ id ], r = c.reward || {};
				rows.push( { id: `story:${ npc }:${ id }`, kind: 'chain', title: c.title, text, progress, goal, done: true, reward: { money: r.money || 0, unlock: r.unlock || null }, deliverable: null } );

			};

			for ( const q of this.pendingAt( npc ) ) row( q.id, `${ NPCS[ npc ].name }: ${ q.ready ? 'ready to hand in' : this.stepText( q.id ) }`, q.ready ? 1 : 0, 1 );
			for ( const id of this.runningFrom( npc ) ) {

				const s = this._step( id ), pr = this.progress[ id ];
				row( id, this.stepText( id ), s && s.on ? Math.min( pr.n, s.goal || 1 ) : 0, s && s.on ? s.goal || 1 : 1 );

			}

			for ( const id of this.offers( npc ) ) row( id, this.chains[ id ].offer, 0, 1 );

		}

		return rows;

	}

	// ---------------------------------------------------------------- the journal (J, drawn by the notices journal)

	journal() {

		const active = [], offers = [], regions = {};
		for ( const [ id, c ] of Object.entries( this.chains ) ) {

			const g = regions[ c.region ] || ( regions[ c.region ] = { done: 0, total: 0 } );
			g.total ++;
			if ( this.isDone( id ) ) g.done ++;
			if ( this.isActive( id ) ) {

				const s = this._step( id ), p = this.progress[ id ];
				const who = s && ( s.talk || s.at );
				active.push( {
					id, title: c.title, region: c.region, giver: NPCS[ c.giver ] ? NPCS[ c.giver ].name : c.giver, port: portName( c.port ),
					step: this.stepText( id ), frac: s && s.on ? clamp( p.n / ( s.goal || 1 ), 0, 1 ) : 0,
					where: who && NPCS[ who ] ? `${ NPCS[ who ].name }, ${ portName( NPCS[ who ].port ) }` : '',
				} );

			} else if ( offers.length < 6 && this.canAccept( id ) && ! offers.some( ( o ) => o.giverId === c.giver ) ) {

				offers.push( { id, title: c.title, giverId: c.giver, giver: NPCS[ c.giver ] ? NPCS[ c.giver ].name : c.giver, port: portName( c.port ) } );

			}

		}

		return { active, offers, regions, done: this.stats.done, total: Object.keys( this.chains ).length, log: this.log.slice( 0, 4 ) };

	}

	journalHTML() {

		return journalHTML( this.journal() );

	}

	chainsOf( npc ) {

		return chainsOf( npc ).filter( ( id ) => this.chains[ id ] );

	}

	// ---------------------------------------------------------------- world spots (the island keepers' doors)

	_buildSpots() {

		if ( this._spots ) return;
		this._spots = true;
		for ( const [ id, spec ] of Object.entries( NPCS ) ) {

			if ( spec.at !== 'lighthouse' && spec.at !== 'hut' ) continue;
			const port = () => WORLD.ports.find( ( p ) => p.id === spec.port ) || null;
			const pos = () => {

				const p = port();
				if ( ! p || ! p.stand ) return null;
				// beside the port's stand, a few metres to its left (the stall keeps the front)
				const yaw = num( p.stand.yaw ), x = p.stand.x + Math.cos( yaw ) * 5, z = p.stand.z - Math.sin( yaw ) * 5;
				const t = this.app && this.app.terrainData;
				return { x, y: t && t.heightAt ? t.heightAt( x, z ) : undefined, z };

			};

			this._offs.push( this.features.interactable( {
				id: `story:${ id }`, position: pos, radius: 3,
				when: () => ! this.isOpen && !! port(),
				prompt: () => `Talk to ${ spec.name }${ this.pendingAt( id ).some( ( q ) => q.ready ) || this.offers( id ).length ? ' · work' : '' }`,
				onInteract: () => { this.talkTo( id, { force: true } ); },
			} ) );

		}

	}

	// ---------------------------------------------------------------- UI

	_toast( text, ms ) {

		const g = this.app && this.app.game;
		try { if ( g && typeof g.toast === 'function' ) g.toast( text, ms ); } catch ( e ) { /* no HUD yet */ }

	}

	_changed() {

		const g = this.app && this.app.game;
		try { if ( g && g.contracts && typeof g.contracts.emit === 'function' ) g.contracts.emit(); } catch ( e ) { /* ignore */ }

	}

	_getUI() {

		if ( this.ui || this._uiFailed ) return this.ui;
		try {

			this.ui = DialogueUI.create( this );

		} catch ( e ) {

			this._uiFailed = true;
			console.warn( 'story: the dialogue panel failed', e );

		}

		return this.ui;

	}

	get isOpen() {

		return !! ( this.ui && this.ui.isOpen );

	}

	close() {

		if ( this.ui && this.ui.isOpen ) this.ui.close();
		this.current = null;

	}

	// ---------------------------------------------------------------- frame

	update( dt ) {

		this._syncClock();
		this._buildSpots();
		const g = this.app && this.app.game;
		if ( g && g.contracts && g.contracts.story !== this ) g.contracts.story = this; // PoorGoat's / Pons' Quests tab
		this._pollT += dt;
		if ( this._pollT >= POLL ) {

			this._pollT = 0;
			this._refreshChains();
			this._dayRoll();
			this._poll();
			// a conversation left behind closes (8 m)
			const p = this.player, cur = this.current;
			if ( cur && this.ui && this.ui.isOpen && p && this._from ) {

				if ( Math.hypot( p.position.x - this._from.x, p.position.z - this._from.z ) > 8 ) this.close();

			}

		}

		if ( this.ui && this.ui.isOpen && ! this._from && this.player ) this._from = { x: this.player.position.x, z: this.player.position.z };
		if ( ! ( this.ui && this.ui.isOpen ) ) this._from = null;

	}

	// ---------------------------------------------------------------- save

	toJSON() {

		const progress = {};
		for ( const [ id, p ] of Object.entries( this.progress ) ) progress[ id ] = p.s === 'done' ? { s: 'done', at: p.at, end: p.end } : { s: 'active', step: p.step, n: Math.round( p.n * 100 ) / 100, at: p.at };
		return {
			v: SAVE_VERSION, progress, memory: JSON.parse( JSON.stringify( this.memory ) ), grudge: { ...this.grudge }, flags: [ ...this.flags ],
			items: [ ...this.items ], unlocks: [ ...this.unlocks ], log: this.log.map( ( l ) => ( { ...l } ) ), stats: { ...this.stats }, day: this._ownDay, rolled: this._rolledDay,
		};

	}

	fromJSON( d ) {

		if ( ! d || typeof d !== 'object' ) return;
		this._initState();
		this._refreshChains();
		for ( const [ id, p ] of Object.entries( d.progress && typeof d.progress === 'object' ? d.progress : {} ) ) {

			if ( typeof id !== 'string' || id.length > 40 || ! p || typeof p !== 'object' ) continue;
			// errands of ports that are not built yet are kept: the port may come with a later module
			const c = this.chains[ id ];
			if ( ! c && ! /^errand_[\w-]+$/.test( id ) ) continue;
			if ( p.s === 'done' ) this.progress[ id ] = { s: 'done', at: num( p.at ) | 0, end: num( p.end, - 1 ) | 0 };
			else if ( p.s === 'active' ) {

				const step = Math.max( 0, num( p.step ) | 0 );
				if ( c && step >= c.steps.length ) continue;
				this.progress[ id ] = { s: 'active', step, n: Math.max( 0, num( p.n ) ), at: num( p.at ) | 0, end: - 1 };

			}

		}

		for ( const [ npc, raw ] of Object.entries( d.memory && typeof d.memory === 'object' ? d.memory : {} ) ) {

			if ( ! NPCS[ npc ] ) continue;
			const m = cleanMemory( raw );
			if ( m ) this.memory[ npc ] = m;

		}

		for ( const [ port, v ] of Object.entries( d.grudge && typeof d.grudge === 'object' ? d.grudge : {} ) ) if ( typeof port === 'string' && port.length < 24 && num( v ) > 0 ) this.grudge[ port ] = clamp( num( v ), 0, 100 );
		const ids = ( a, ok ) => ( Array.isArray( a ) ? [ ...new Set( a.filter( ( x ) => typeof x === 'string' && ok( x ) ) ) ] : [] );
		this.flags = ids( d.flags, ( x ) => x.length < 24 ).slice( 0, 32 );
		this.items = ids( d.items, ( x ) => !! ITEMS[ x ] );
		this.unlocks = ids( d.unlocks, ( x ) => !! ITEMS[ x ] );
		this.log = ( Array.isArray( d.log ) ? d.log : [] ).filter( ( l ) => l && typeof l.id === 'string' ).slice( 0, 8 ).map( ( l ) => ( { id: l.id.slice( 0, 40 ), title: String( l.title || '' ).slice( 0, 60 ), outcome: String( l.outcome || '' ).slice( 0, 12 ), day: num( l.day ) | 0 } ) );
		const s = d.stats || {};
		this.stats = { done: Math.max( 0, num( s.done ) | 0 ), dropped: Math.max( 0, num( s.dropped ) | 0 ) };
		this._ownDay = Math.max( 0, num( d.day ) | 0 );
		this._rolledDay = Number.isFinite( d.rolled ) ? d.rolled : null;
		this._roidNode = 'root';
		this.close();
		this._changed();

	}

	reset() {

		this._initState();
		this._roidNode = 'root';
		this.close();
		this._changed();

	}

	dispose() {

		for ( const off of this._offs ) try { off(); } catch ( e ) { /* gone */ }
		this._offs = [];
		if ( this.ui ) this.ui.dispose();
		this.ui = null;

	}

}
