import { WORLD } from '../../world/WorldLayout.js';
import { CHAINS, NPCS, ITEMS, VENDOR_NPC, KEEPERS, BUYERS, W13_CHAINS, RAID_ID, errandChains, speciesLabel, portAt, nearestPort, portName } from './StoryData.js';
import { DISPOSITION, blankMemory, cleanMemory, clampDisposition } from './Memory.js';
import { gate, sandboxGate, matches, amount, pickFish, isNight, isDawnDusk } from './Rules.js';
import { leadAim } from '../naval/Ballistics.js';
import { POUCH } from '../firearms/FirearmsData.js';
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
//
// Wave 13 (the seven quest lines of StoryData.W13_CHAINS: Tidemark, the hangars, Blackwater, the practice fight):
//   story.opens( key ) -> bool       a door a quest opened ('haul:tidemark', 'engine:strip'); always true in the sandbox
//   story.discount( key ) -> 0..0.9  a quest reward's discount ('chandler:tidemark' 0.1, 'kestrel' 0.2, 'powder:blackwater' 0.25)
//   story.perk( 'gunnerFee' ) -> 1   Hold the line's waiver: the crew gunners' post fee / wage is not charged
//   story.acceptPosting( 'story:<chain>' ) -> bool   a quest notice taken from a board (NoticeData.storyPostings)
//   story.entries                    the journal's notes [ { id, title, text, day } ] (a line per finished quest, the parry tip)
// Emitted too: questPin { id: 'quest:<chain>', x, z, label, chain, step } while a step names a place (the world map pins it),
//   questPinClear { id }, questFailed { id, why }. The sandbox keeps only the { feature } gates (it plays everything).
// Hold the line arms a raid: naval.spawn( 'sloop', { id: StoryData.RAID_ID, ... } ) off Tidemark's bay on a loop route,
//   and while she is afloat and within 330 m of the pier Story fires her guns at the town's intact props through
//   naval.launchFrom (leadAim); 6 props broken in Tidemark (propDestroyed port 'tidemark') loses it, sinking or crippling
//   her (shipSunk / shipCrippled id RAID_ID) wins it. A Brains.js 'raid' state could take that aiming over later.
//
// Hooks other owners add (optional chaining: nothing breaks without them):
//   pirates/Stronghold.js marketAction, after `M.sell( ... )` succeeds:
//       if ( r.ok ) this._emit( 'contrabandSold', { good: id.slice( 5 ), qty: r.qty, total: r.total, port: 'blackwater' } );
//     (until then Story notices the sale from the fence's `market.sold` and the hold: one sale late by a poll)
//   pirates/BlackMarket.js buyPowder: total = want * Math.round( price * ( 1 - ( story?.discount( 'powder:blackwater' ) || 0 ) ) )
//   seaplane/Seaplane.js buy( af ): price = A.price * ( 1 - ( af === 'kestrel' ? story?.discount( 'kestrel' ) || 0 : 0 ) );
//     Panel.js at the strip hangar lists the engine row only when story?.opens( 'engine:strip' ) !== false
//   trade/HaulContracts.js offers( port ): [] for 'tidemark' while story?.opens( 'haul:tidemark' ) === false
//   trade/Operating.js wagesPerDay(): minus OPERATING.wage per posted gunner while story?.perk( 'gunnerFee' ) > 0
//   game/Game.js _salePort(): `this.ports?.near?.( p ) || ( pons near ? 'pons' : 'home' )` (Tidemark's sales say 'tidemark';
//     the quest also counts sales by the player's position) and the chandler's gear price x ( 1 - story.discount(
//     `chandler:${ port }` ) ) where Game / HudPanels price a shop row
//   notices/Notices.js board( port ): push NoticeData.storyPostings( port, story, this.hours ) before the sort; accept( id ):
//     an id starting 'story:' goes to story.acceptPosting( id ) (NoticeData's header has the exact lines)

export const HOSTILE = - 15; // story.rep at or below this: the port is hostile
export const GRUDGE_DECAY = 2; // grudge forgiven per in-game day
export const GRUDGE = { merchant: 20, navy: 12, prop: 2, customs: 4 };
export const OFFERS_PER_NPC = 2; // a person pitches at most this many chains at once
const SAVE_VERSION = 1;
const POLL = 0.5;
const LISTEN = [ 'fishCaught', 'fishSold', 'cargoSold', 'cargoBought', 'portVisited', 'shipSunk', 'bountyClaimed', 'propDestroyed',
	'planeTookOff', 'planeLanded', 'enemyDefeated', 'noticeCompleted', 'lootCollected', 'playerBoatSunk', 'residentPrank',
	'prisonerRansomed', 'denRaided', 'customsInspected', 'rumourHeard', 'contrabandSold' ];
const LEAD = new Set( Object.keys( W13_CHAINS ) ); // offered first: a giver pitches at most OFFERS_PER_NPC at once
const RAID = { fire: 7, reach: 330, muzzleY: 3, out: 420, loop: 110 }; // the raiding sloop's guns (s, m) and her route (m)
const MAX_ENTRIES = 24;
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
		this._raid = null; // { chain, fireT } while Hold the line's sloop is out
		this._fence = null; // the fence's till and the hold, for a sale without contrabandSold
		this._fenceEvent = false;
		this._pins = new Set();
		this._resume = true; // a step's pin / raid is (re)started on the first update
		const names = new Set( LISTEN );
		for ( const c of Object.values( this.chains ) ) {

			for ( const s of c.steps ) for ( const n of [].concat( s.on || [], s.clean ? s.clean.on : [] ) ) names.add( n );
			if ( c.fail ) for ( const n of [].concat( c.fail.on ) ) names.add( n );

		}

		for ( const name of names ) this._offs.push( features.on( name, ( e ) => this._onEvent( name, e ) ) );

		// wave 13D: in a room only the host runs the raid; a guest asks (netsync.askHost 'raid') and the host arms it here
		this._offs.push( features.on( 'hostRequest', ( e ) => { if ( e && e.kind === 'raid' && ! e.local ) this._armRaid( ( e.data && e.data.chain ) || 'holdTheLine', true ); } ) );

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
		this.entries = []; // the journal's notes { id, title, text, day }
		this.grants = []; // seaplane upgrades won but not yet fitted (the airframe is not owned yet) { airframe, key, tier }
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
		if ( ! c ) return false;
		if ( this.progress[ id ] && ! this._again( id ) ) return false;
		if ( this.hostileTo( c.giver ) ) return false;
		// the sandbox plays everything: only the gates that need a feature to exist stay
		return gate( this.features.sandbox ? sandboxGate( c.requires ) : c.requires, this.ctx( c.giver ) );

	}

	// a repeatable chain done long enough ago (the board posts it again)
	_again( id ) {

		const c = this.chains[ id ], p = this.progress[ id ];
		if ( ! c || ! c.repeat || ! p || p.s !== 'done' ) return false;
		return this.features.sandbox === true || this.day - num( p.end ) >= num( c.repeat.days, 1 );

	}

	// what other features ask: a door a quest opened, a reward's discount
	opens( key ) {

		return this.features.sandbox === true || this.flags.includes( 'open:' + key );

	}

	discount( key ) {

		return clamp( this.perk( 'off:' + key ), 0, 0.9 );

	}

	// a quest notice taken from a board (NoticeData.storyPostings ids 'story:<chain>')
	acceptPosting( postId ) {

		const id = String( postId || '' ).replace( /^story:/, '' );
		return !! this.accept( id );

	}

	offers( npc ) {

		const out = [];
		const ids = Object.keys( this.chains ).sort( ( a, b ) => ( LEAD.has( b ) ? 1 : 0 ) - ( LEAD.has( a ) ? 1 : 0 ) );
		for ( const id of ids ) {

			const c = this.chains[ id ];

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
		if ( this.progress[ id ] && ! this._again( id ) ) return this._fail( this.isDone( id ) ? 'Already done' : 'Already running' );
		if ( npc && c.giver !== npc ) return this._fail( 'Ask the right person' );
		if ( ! this.canAccept( id ) ) return this._fail( this.hostileTo( c.giver ) ? 'They will not give you work' : 'Not yet' );
		this.progress[ id ] = { s: 'active', step: 0, n: 0, at: this.day, end: - 1 };
		this._touch( c.giver );
		this.features.emit( 'questAccepted', { id, title: c.title, giver: c.giver, port: c.port } );
		this._toast( `Quest: ${ c.title } · ${ this.stepText( id ) }`, 3200 );
		this._startStep( id );
		this._poll(); // a step that already holds (own a boat, be somewhere) completes now
		this._changed();
		return true;

	}

	abandon( id ) {

		const c = this.chains[ id ];
		if ( ! this.isActive( id ) ) return false;
		if ( this._raid && this._raid.chain === id ) this._endRaid();
		this._unpin( id );
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

		this._turning = true; // the giver's thanks are said in the conversation, not toasted
		let done = false;
		try { done = this._advance( id ); } finally { this._turning = false; }
		const next = done ? '' : this.stepText( id );
		const r = { said: done ? c.thanks : `${ s.deliver ? 'Good. ' : '' }${ next ? `Next: ${ next }.` : '' }`.trim(), done, reward: done ? c.reward : null };
		this._changed();
		return r;

	}

	// the step is done: the next one, or the chain completes (true)
	_advance( id ) {

		const p = this.progress[ id ], c = this.chains[ id ];
		const s = c.steps[ p.step ] || null;
		this.features.emit( 'questStep', { id, step: s ? s.id : '' } );
		// a step's own payout: now, or (clean) after its window when nothing spoiled it
		if ( s && s.payout ) {

			if ( s.clean ) {

				let spoiled = false;
				try { spoiled = !! ( s.clean.already && s.clean.already( this._checkCtx() ) ); } catch ( e ) { spoiled = false; }
				if ( spoiled ) this._toast( `${ c.title } · ${ s.clean.text || 'no fee for that one' }`, 3200 );
				else p.watch = { step: s.id, left: num( s.clean.within, 60 ) };

			} else this._payout( s.payout, `${ c.title } · ${ s.text }` );

		}

		p.step ++;
		p.n = 0;
		p.f = 0;
		p.t = 0;
		if ( p.step < c.steps.length ) {

			this._toast( `${ c.title } · ${ this.stepText( id ) }`, 2800 );
			if ( this._raid && this._raid.chain === id && c.steps[ p.step ].start !== 'raid' ) this._endRaid( false );
			this._startStep( id );
			return false;

		}

		this._complete( id );
		return true;

	}

	// money / XP / reputation (a chain's reward, a step's payout)
	_payout( r, label = '' ) {

		const st = this.state;
		if ( ! r ) return;
		if ( st && r.money > 0 && typeof st.earn === 'function' ) st.earn( r.money );
		if ( st && r.xp > 0 && typeof st.addXp === 'function' ) st.addXp( r.xp );
		for ( const [ port, n ] of Object.entries( r.rep || {} ) ) this._addRep( port, n, 'quest' );
		if ( label && ( r.money || r.xp ) ) this._toast( `${ label }${ r.money ? ` · +$${ r.money }` : '' }${ r.xp ? ` · +${ r.xp } XP` : '' }`, 3000 );

	}

	_complete( id ) {

		const c = this.chains[ id ], p = this.progress[ id ], r = c.reward || {}, st = this.state;
		p.s = 'done';
		p.end = this.day;
		delete p.step;
		delete p.n;
		delete p.f;
		delete p.t;
		if ( this._raid && this._raid.chain === id ) this._endRaid( false );
		this._unpin( id );
		this._payout( r );
		for ( const f of r.flags || [] ) if ( ! this.flags.includes( f ) ) this.flags.push( f );
		this._grantMore( id, c, r );
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
		// finished out in the world, away from the giver: their word comes as a note (in a conversation they say it)
		if ( ! this._turning && c.thanks && NPCS[ c.giver ] ) this._toast( `${ NPCS[ c.giver ].name }: ${ c.thanks }`, 4600 );

	}

	// the wave 13 reward kinds: the journal's line, seaplane upgrades, merchant standing, the town mended, cartridges
	_grantMore( id, c, r ) {

		const text = r.journal || c.journal;
		if ( text && ! this.entries.some( ( e ) => e.id === id ) ) {

			this.entries.unshift( { id, title: c.title, text, day: this.day } );
			if ( this.entries.length > MAX_ENTRIES ) this.entries.length = MAX_ENTRIES;

		}

		for ( const g of r.seaplane || [] ) this.grants.push( { airframe: g.airframe, key: g.key, tier: g.tier } );
		this._fitGrants();
		if ( r.merchant ) {

			const t = this._feature( 'trade' );
			try { if ( t && t.credit && t.credit.adjust ) t.credit.adjust( r.merchant, 'story' ); } catch ( e ) { /* trade is optional */ }

		}

		if ( r.repairTown ) this._repairTown( r.repairTown );
		if ( r.cartridges > 0 ) {

			const fa = this._feature( 'firearms' );
			if ( fa && Number.isFinite( fa.shots ) ) fa.shots = Math.min( POUCH.max, fa.shots + POUCH.count * r.cartridges );

		}

	}

	_feature( name ) {

		try { return this.features.get ? this.features.get( name ) : null; } catch ( e ) { return null; }

	}

	// seaplane upgrades won: fitted free on that airframe (out on the pad, or in the hangar's fleet records); kept until
	// the player owns it
	_fitGrants() {

		const sp = this._feature( 'seaplane' );
		if ( ! sp || ! this.grants.length ) return;
		const left = [];
		for ( const g of this.grants ) {

			let done = false;
			try {

				if ( sp.af === g.airframe && sp.owned && sp.upgrades ) {

					sp.upgrades[ g.key ] = g.key === 'livery' ? g.tier : Math.max( num( sp.upgrades[ g.key ] ), g.tier );
					if ( typeof sp._respec === 'function' ) sp._respec();
					if ( typeof sp._save === 'function' ) sp._save();
					done = true;

				} else if ( sp.fleet && sp.fleet[ g.airframe ] && sp.fleet[ g.airframe ].owned ) {

					const rec = sp.fleet[ g.airframe ];
					rec.upgrades = { ...( rec.upgrades || {} ), [ g.key ]: g.key === 'livery' ? g.tier : Math.max( num( rec.upgrades && rec.upgrades[ g.key ] ), g.tier ) };
					done = true;

				}

			} catch ( e ) { done = false; }

			if ( done ) this.features.emit( 'seaplaneUpgraded', { airframe: g.airframe, upgrade: g.key, tier: g.tier, price: 0, source: 'story' } );
			else left.push( g );

		}

		this.grants = left;

	}

	// the town mends itself: its broken props stand again, its buildings lose their scars
	_repairTown( port ) {

		const d = this._feature( 'destruction' );
		try {

			if ( d && Array.isArray( d.props ) && typeof d.respawn === 'function' ) for ( const prop of d.props ) if ( prop.port === port && prop.state !== 'intact' ) d.respawn( prop.id, true );

		} catch ( e ) { /* destruction is optional */ }

		const ports = ( this.app && ( this.app.ports || ( this.app.game && this.app.game.ports ) ) ) || null;
		const town = ports && ports[ port ];
		try { if ( town && town.damage && typeof town.damage.reset === 'function' ) town.damage.reset(); } catch ( e ) { /* no town mesh headless */ }

	}

	// ---------------------------------------------------------------- steps that begin: map pins, the raid

	_checkCtx( name = null ) {

		const p = this.player;
		return { state: this.state, story: this, rep: ( port ) => this.rep( port ), features: this.features, player: p ? { x: p.position.x, z: p.position.z, mode: p.mode } : null, event: name };

	}

	// where a step happens (its pin, the place it must reach, the payload's `near`, the person to see) or null
	pinOf( id ) {

		const s = this._step( id ), c = this.chains[ id ];
		if ( ! s || ! c ) return null;
		const label = ( q ) => ( q && q.label ) || c.title;
		const P = ( q ) => ( q && Number.isFinite( q.x ) && Number.isFinite( q.z ) ? { x: q.x, z: q.z, label: label( q ) } : null );
		if ( s.pin ) return P( typeof s.pin === 'function' ? s.pin() : s.pin );
		if ( s.reach ) return P( s.reach );
		if ( s.match && s.match.near ) return P( s.match.near );
		const who = NPCS[ s.talk || s.at ];
		if ( who && who.pin ) { const q = who.pin(); return q ? { x: q.x, z: q.z, label: who.name } : null; }
		return null;

	}

	_pin( id ) {

		const q = this.pinOf( id ), key = 'quest:' + id;
		if ( q ) {

			this._pins.add( key );
			this.features.emit( 'questPin', { id: key, x: Math.round( q.x * 10 ) / 10, z: Math.round( q.z * 10 ) / 10, label: q.label, chain: id, step: this._step( id ).id } );

		} else this._unpin( id );

	}

	_unpin( id ) {

		const key = 'quest:' + id;
		if ( ! this._pins.has( key ) ) return;
		this._pins.delete( key );
		this.features.emit( 'questPinClear', { id: key } );

	}

	// a step becomes current (accepted, advanced, or a save loaded mid-quest: resume keeps its timers)
	_startStep( id, resume = false ) {

		const s = this._step( id ), p = this.progress[ id ];
		if ( ! s || ! p ) return;
		if ( ! resume ) { p.f = 0; p.t = 0; }
		this._pin( id );
		if ( s.start === 'raid' ) this._armRaid( id );

	}

	// the chain fails (or, 'restart', starts over from its first step)
	_failChain( id, why ) {

		const c = this.chains[ id ], p = this.progress[ id ];
		if ( ! c || ! p || p.s !== 'active' ) return;
		const f = c.fail || {};
		if ( f.then === 'restart' ) {

			p.step = 0;
			p.n = 0;
			this._toast( `${ c.title } · ${ why || f.text || 'start again' }`, 3600 );
			this._startStep( id );
			this._changed();
			return;

		}

		if ( this._raid && this._raid.chain === id ) this._endRaid( true );
		this._unpin( id );
		delete this.progress[ id ];
		this.stats.dropped ++;
		this._log( id, 'failed' );
		this.features.emit( 'questFailed', { id, why: why || f.text || 'failed' } );
		this._toast( `${ c.title } · failed: ${ why || f.text || 'too late' }`, 4200 );
		this._changed();

	}

	// Hold the line: the raiding sloop comes in on Tidemark's bay (naval.spawn), unless she is already afloat
	_armRaid( id, fromHost = false ) {

		const nv = this._feature( 'naval' );
		this._raid = { chain: id, fireT: RAID.fire };
		if ( ! nv || typeof nv.spawn !== 'function' ) return;
		const sync = this._feature( 'netsync' );
		if ( ! fromHost && sync && sync.hostOnly && ! sync.hostOnly() ) { sync.askHost( 'raid', { port: 'tidemark', chain: id } ); return; } // the host spawns her
		if ( Array.isArray( nv.ships ) && nv.ships.some( ( s ) => s.id === RAID_ID && s.alive ) ) return;
		const tm = WORLD.tidemark;
		if ( ! tm ) return;
		const bay = tm.bay, c = tm.center;
		const dx = bay.x - c.x, dz = bay.z - c.z, l = Math.hypot( dx, dz ) || 1, ux = dx / l, uz = dz / l; // out to sea
		const hub = { x: bay.x + ux * 130, z: bay.z + uz * 130 };
		const route = [ 0, 1, 2, 3 ].map( ( k ) => { const a = k * Math.PI / 2; return [ Math.round( hub.x + Math.cos( a ) * RAID.loop ), Math.round( hub.z + Math.sin( a ) * RAID.loop ) ]; } );
		const x = bay.x + ux * RAID.out, z = bay.z + uz * RAID.out;
		try {

			const ship = nv.spawn( 'sloop', { id: RAID_ID, x, z, yaw: Math.atan2( hub.x - x, hub.z - z ), name: 'Red Gull', captain: 'Skerry Wrack', route, loop: true, index: 0 } );
			if ( ship ) { ship.raid = 'tidemark'; ship.fleeAt = 0.12; }
			this._toast( 'A pirate sloop is running in on Tidemark\'s bay · stop her before she wrecks the waterfront', 4200 );

		} catch ( e ) { console.warn( 'story: the raid could not spawn', e ); }

	}

	_endRaid( sailOff = false ) {

		const nv = this._feature( 'naval' );
		const ship = nv && Array.isArray( nv.ships ) ? nv.ships.find( ( s ) => s.id === RAID_ID ) : null;
		// she got what she came for (or lost her nerve): off she goes
		if ( sailOff && ship && ship.alive && typeof ship.setState === 'function' ) try { ship.setState( 'flee' ); } catch ( e ) { /* ignore */ }
		this._raid = null;

	}

	// while she is afloat and near the pier, her guns work the town's intact props
	_tickRaid( dt ) {

		const r = this._raid;
		if ( ! r ) return;
		r.fireT -= dt;
		if ( r.fireT > 0 ) return;
		r.fireT = RAID.fire;
		const nv = this._feature( 'naval' ), d = this._feature( 'destruction' ), tm = WORLD.tidemark;
		if ( ! nv || typeof nv.launchFrom !== 'function' || ! d || ! Array.isArray( d.props ) || ! tm ) return;
		const ship = Array.isArray( nv.ships ) ? nv.ships.find( ( s ) => s.id === RAID_ID ) : null;
		if ( ! ship || ! ship.alive || ship.state === 'flee' || ship.state === 'sinking' ) return;
		const pier = tm.dock.position;
		if ( Math.hypot( ship.x - pier.x, ship.z - pier.z ) > RAID.reach ) return;
		let best = null, bd = Infinity;
		for ( const prop of d.props ) {

			if ( prop.port !== 'tidemark' || prop.state !== 'intact' || ! prop.center ) continue;
			const dd = Math.hypot( prop.center.x - ship.x, prop.center.z - ship.z );
			if ( dd < bd ) { bd = dd; best = prop; }

		}

		if ( ! best ) return;
		const S = { x: ship.x, y: RAID.muzzleY, z: ship.z }, T = { x: best.center.x, y: best.center.y, z: best.center.z };
		const aim = leadAim( S, { x: 0, y: 0, z: 0 }, T, { x: 0, y: 0, z: 0 } );
		if ( aim && aim.dir ) try { nv.launchFrom( S.x, S.y, S.z, aim.dir, { owner: RAID_ID, faction: 'pirate', damage: 4, sigma: 0.004 } ); } catch ( e ) { /* naval is optional */ }

	}

	// the fence buys without an event of his own: his till (market.sold) went up and the hold's contraband went down
	_watchFence() {

		if ( this._fenceEvent ) return;
		const want = Object.keys( this.progress ).some( ( id ) => { const s = this._step( id ); return s && [].concat( s.on || [] ).includes( 'contrabandSold' ); } );
		const sh = this._feature( 'stronghold' ), t = this._feature( 'trade' );
		if ( ! want || ! sh || ! sh.market || ! t || typeof t.contraband !== 'function' ) { this._fence = null; return; }
		let qty = 0;
		try { qty = t.contraband( 'home' ).reduce( ( a, h ) => a + h.qty, 0 ); } catch ( e ) { return; }
		const sold = num( sh.market.sold );
		const f = this._fence;
		this._fence = { sold, qty };
		if ( f && sold > f.sold && qty < f.qty ) this._onEvent( 'contrabandSold', { qty: f.qty - qty, total: sold - f.sold, port: 'blackwater', polled: true } );

	}

	// per frame: a clean step's payout window, a step's time limit, the raid's guns
	_tick( dt ) {

		if ( ! ( dt > 0 ) ) return;
		for ( const id of Object.keys( this.progress ) ) {

			const p = this.progress[ id ], c = this.chains[ id ];
			if ( ! c ) continue;
			if ( p.watch ) {

				p.watch.left -= dt;
				if ( p.watch.left <= 0 ) {

					const s = c.steps.find( ( x ) => x.id === p.watch.step );
					delete p.watch;
					if ( s && s.payout ) this._payout( s.payout, `${ c.title } · ${ s.text }` );
					this._changed();

				}

			}

			if ( p.s !== 'active' ) continue;
			const s = this._step( id );
			if ( s && s.limit ) {

				p.t = num( p.t ) + dt;
				if ( p.t >= s.limit ) this._failChain( id, 'out of time' );

			}

		}

		this._tickRaid( dt );

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

	_evCtx( name = null ) {

		const p = this.player, w = this.features.get && this.features.get( 'weather' );
		let weather = null;
		try { weather = w ? w.kind : null; } catch ( e ) { weather = null; }
		return { night: isNight( this.tod ), dawnDusk: isDawnDusk( this.tod ), weather, player: p ? { x: p.position.x, z: p.position.z } : null, event: name, features: this.features, story: this, state: this.state };

	}

	_onEvent( name, e ) {

		e = e && typeof e === 'object' ? e : {};
		try { this._consequence( name, e ); } catch ( err ) { console.warn( 'story: consequence failed', err ); }
		const ctx = this._evCtx( name );
		let changed = false;
		for ( const id of Object.keys( this.progress ) ) {

			const p0 = this.progress[ id ], c = this.chains[ id ];
			if ( ! p0 || ! c ) continue;
			// a clean step's window: this event spoils its payout (the chain goes on)
			if ( p0.watch ) {

				const ws = c.steps.find( ( x ) => x.id === p0.watch.step );
				const cl = ws && ws.clean;
				if ( cl && [].concat( cl.on ).includes( name ) && ( ! cl.match || matches( cl.match, e, ctx ) ) ) {

					delete p0.watch;
					this._toast( `${ c.title } · ${ cl.text || 'no fee for that one' }`, 3200 );
					changed = true;

				}

			}

			const s = this._step( id );
			if ( ! s ) continue;
			// what loses the chain (or starts it over): counted while one of its steps is current
			const f = c.fail;
			if ( f && [].concat( f.on ).includes( name ) && ( ! f.steps || f.steps.includes( s.id ) ) && ( ! f.match || matches( f.match, e, ctx ) ) ) {

				p0.f = num( p0.f ) + 1;
				changed = true;
				if ( p0.f >= ( f.goal || 1 ) ) { this._failChain( id, f.text ); continue; }

			}

			if ( ! s.on || ! [].concat( s.on ).includes( name ) ) continue;
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
			// tavern talk turns to Blackwater: the board posts its rumour (Rumours from Blackwater)
			case 'rumourHeard': if ( ! this.flags.includes( 'blackwaterRumour' ) ) this.flags.push( 'blackwaterRumour' ); break;
			case 'contrabandSold': if ( ! e.polled ) { this._fenceEvent = true; this._fence = null; } break;
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

				try { done = !! s.check( this._checkCtx() ); } catch ( e ) { done = false; }

			} else if ( s.reach && p ) {

				const r = s.reach, x = p.position.x, z = p.position.z;
				done = Math.hypot( x - r.x, z - r.z ) <= r.r;
				if ( done && r.aboard ) done = [ 'boat', 'deck', 'seat' ].includes( p.mode );
				if ( done && r.night ) done = isNight( this.tod );
				if ( done && r.port ) done = portAt( x, z ) === r.port;
				if ( done && r.mode ) done = [].concat( r.mode ).includes( p.mode );

			}

			if ( done ) {

				this._advance( id );
				changed = true;

			}

		}

		if ( st && st.boat && ! this.memoryOf( 'roid' ).notes.firstBoat ) this._mem( 'roid' ).notes.firstBoat = st.boat;
		this._watchFence();
		this._fitGrants();
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

		return { active, offers, regions, done: this.stats.done, total: Object.keys( this.chains ).length, log: this.log.slice( 0, 4 ), entries: this.entries.slice( 0, 6 ) };

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

			if ( spec.at !== 'lighthouse' && spec.at !== 'hut' && ! ( spec.at === 'spot' && typeof spec.spot === 'function' ) ) continue;
			const port = () => WORLD.ports.find( ( p ) => p.id === spec.port ) || ( spec.at === 'spot' ? spec : null );
			const pos = () => {

				if ( spec.at === 'spot' ) {

					// a spot of their own (the fence beside his counter, Ethena beside her stall)
					const q = spec.spot(), t = this.app && this.app.terrainData;
					return q ? { x: q.x, y: t && t.heightAt ? Math.max( 0, t.heightAt( q.x, q.z ) ) : undefined, z: q.z } : null;

				}

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
		if ( this._resume ) {

			// after a load (or the first frame): the current steps' pins, a raid that was under way
			this._resume = false;
			for ( const id of Object.keys( this.progress ) ) if ( this.isActive( id ) ) this._startStep( id, true );

		}

		this._tick( dt );
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
		for ( const [ id, p ] of Object.entries( this.progress ) ) {

			const o = p.s === 'done' ? { s: 'done', at: p.at, end: p.end } : { s: 'active', step: p.step, n: Math.round( p.n * 100 ) / 100, at: p.at };
			// wave 13: a fail count, the time on a timed step, a clean step's payout window
			if ( p.s === 'active' && num( p.f ) > 0 ) o.f = p.f;
			if ( p.s === 'active' && num( p.t ) > 0 ) o.t = Math.round( p.t * 10 ) / 10;
			if ( p.watch ) o.watch = { step: p.watch.step, left: Math.round( p.watch.left * 10 ) / 10 };
			progress[ id ] = o;

		}

		return {
			v: SAVE_VERSION, progress, memory: JSON.parse( JSON.stringify( this.memory ) ), grudge: { ...this.grudge }, flags: [ ...this.flags ],
			items: [ ...this.items ], unlocks: [ ...this.unlocks ], log: this.log.map( ( l ) => ( { ...l } ) ), stats: { ...this.stats }, day: this._ownDay, rolled: this._rolledDay,
			entries: this.entries.map( ( e ) => ( { ...e } ) ), grants: this.grants.map( ( g ) => ( { ...g } ) ),
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
				const q = this.progress[ id ] = { s: 'active', step, n: Math.max( 0, num( p.n ) ), at: num( p.at ) | 0, end: - 1 };
				if ( num( p.f ) > 0 ) q.f = Math.floor( num( p.f ) );
				if ( num( p.t ) > 0 ) q.t = num( p.t );

			}

			const w = p.watch, pr = this.progress[ id ];
			if ( pr && w && typeof w.step === 'string' && num( w.left ) > 0 && c && c.steps.some( ( x ) => x.id === w.step ) ) pr.watch = { step: w.step, left: num( w.left ) };

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
		this.entries = ( Array.isArray( d.entries ) ? d.entries : [] ).filter( ( e ) => e && typeof e.id === 'string' && typeof e.text === 'string' ).slice( 0, MAX_ENTRIES )
			.map( ( e ) => ( { id: e.id.slice( 0, 40 ), title: String( e.title || '' ).slice( 0, 60 ), text: e.text.slice( 0, 300 ), day: num( e.day ) | 0 } ) );
		this.grants = ( Array.isArray( d.grants ) ? d.grants : [] ).filter( ( g ) => g && typeof g.airframe === 'string' && typeof g.key === 'string' && Number.isFinite( g.tier ) ).slice( 0, 8 )
			.map( ( g ) => ( { airframe: g.airframe.slice( 0, 20 ), key: g.key.slice( 0, 20 ), tier: Math.max( 0, Math.min( 5, Math.round( g.tier ) ) ) } ) );
		for ( const id of [ ...this._pins ] ) this.features.emit( 'questPinClear', { id } );
		this._pins.clear();
		this._raid = null;
		this._fence = null;
		this._resume = true;
		this._roidNode = 'root';
		this.close();
		this._changed();

	}

	reset() {

		for ( const id of [ ...this._pins ] ) this.features.emit( 'questPinClear', { id } );
		this._pins.clear();
		if ( this._raid ) this._endRaid( true );
		this._fence = null;
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
