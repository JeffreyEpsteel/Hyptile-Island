// The persistent universe on the browser side (server/index.mjs --universe <name>): the captain's token, the menu's
// probe, and the session that keeps the captain's game on the server instead of in a local save slot.
//
//   normalizeUniverseUrl( 'my.host' )   'ws://my.host:8765/universe' ('wss://my.host/universe' from an https page: a TLS proxy;
//                                       'my.host/net' -> 'wss://my.host/net/universe' for a proxy that serves the server under /net)
//   universeToken( url )                32 hex chars (128 random bits), made once per server (host:port), kept in localStorage;
//                                       the server stores the captain name -> sha256( token ): no passwords, but clearing the
//                                       site data (or another browser) loses the name, see docs/HOSTING.md
//   await probeUniverse( url, name )    { captain, exists, isNew, profile, universe, players, cap } (a Colyseus join with
//                                       probe: true; nobody appears); rejects with an Error whose message is readable (server
//                                       down, name taken, banned, full...) and .code the refusal's name
//   universeError( code, text, url )    that readable text
//
//   const s = new UniverseSession( { url, captain, profile, info } );
//   s.attach( app )    app.universe = s and app.game.state.storage = s.storage: GameState.useSlot() reads the captain's game
//                      from it and every GameState.save() lands in it (the local slots are untouched); the menu calls this
//   s.detach()         the local storage comes back (the menu calls it when another mode / room is chosen)
//   s.bind( net )      NetSync hands it each NetClient: a welcome sends the newest save, 'saved' acks and fixes come back
//   s.save( urgent )   snapshot now (GameState.save(): the world position too); s.flush( force ) sends what waits
//   s.online, s.captain, s.info ({ name, day, seed, bountySeed }), s.stats { stored, sent, acked, fixes, refused }
//
// When a save goes: at most every SAVE_GAP ms when money, boat, gear, unlocks, sales or discoveries changed since the
// last one sent (a sale, a purchase, a quest reward), else with the SNAPSHOT_MS snapshot; offline, the newest waits for
// the reconnect. A server `fix` (the anti-cheat clamped money / xp) is adopted into the state.

import { helloMessage, sanitizeToken, sanitizeCaptainName, isUniverseUrl, MAX_SAVE, UNIVERSE_PATH, TOKEN_HEX } from './Protocol.js';
import { ColyseusLink } from './ColyseusLink.js';

export const DEFAULT_UNIVERSE_PORT = 8765;
export const SERVER_KEY = 'hyptile-island.universe.server'; // the address typed last
export const NAME_KEY = 'hyptile-island.universe.name'; // the captain name used last
const TOKENS_KEY = 'hyptile-island.universe.tokens'; // { 'host:port': token }
export const SAVE_GAP = 2500;
export const SNAPSHOT_MS = 30000;

const memTokens = new Map(); // when localStorage is blocked: the token lives as long as the page

function ls() {

	try {

		return typeof localStorage !== 'undefined' ? localStorage : null;

	} catch ( e ) {

		return null;

	}

}

export function remember( key, value ) {

	try {

		const s = ls();
		if ( s ) s.setItem( key, String( value ) );

	} catch ( e ) { /* blocked */ }

}

export function recall( key, fallback = '' ) {

	try {

		const s = ls();
		const v = s ? s.getItem( key ) : null;
		return v == null ? fallback : v;

	} catch ( e ) {

		return fallback;

	}

}

// "host", "host:port", "ws://host:port", "wss://host/path" -> a ws(s) URL whose path is /universe (unless a path was given)
export function normalizeUniverseUrl( s, loc = typeof location !== 'undefined' ? location : null ) {

	s = String( s || '' ).trim();
	if ( ! s ) return null;
	const secure = !! ( loc && loc.protocol === 'https:' );
	let typedPort = false;
	if ( /^https?:\/\//i.test( s ) ) s = s.replace( /^http/i, 'ws' );
	if ( ! /^wss?:\/\//i.test( s ) ) {

		typedPort = /^[^/]+:\d+/.test( s ) || /^\[[^\]]+\]:\d+/.test( s );
		s = `${ secure ? 'wss' : 'ws' }://${ s }`;

	} else typedPort = /^wss?:\/\/(\[[^\]]+\]|[^/:]+):\d+/i.test( s );

	try {

		const u = new URL( s );
		if ( ! u.hostname ) return null;
		// plain ws gets the relay's port; wss without a port is a TLS proxy on 443 (docs/HOSTING.md)
		if ( ! typedPort && u.protocol === 'ws:' ) u.port = String( DEFAULT_UNIVERSE_PORT );
		// a typed path is a TLS proxy's prefix for the server: the universe is its last segment
		if ( ! u.pathname || u.pathname === '/' ) u.pathname = '/' + UNIVERSE_PATH;
		else if ( ! /\/universe\/?$/i.test( u.pathname ) ) u.pathname = u.pathname.replace( /\/+$/, '' ) + '/' + UNIVERSE_PATH;
		u.search = '';
		u.hash = '';
		return u.toString();

	} catch ( e ) {

		return null;

	}

}

// what the menu offers first: the address typed last, else the page's own host
export function defaultUniverseAddress( loc = typeof location !== 'undefined' ? location : null ) {

	const r = recall( SERVER_KEY, '' );
	if ( r ) return r;
	const h = loc && loc.hostname ? loc.hostname : 'localhost';
	if ( isStaticHost( h ) ) return ''; // GitHub Pages serves the game only: a universe is a server somebody hosts
	return loc && loc.protocol === 'https:' ? h : `${ h }:${ DEFAULT_UNIVERSE_PORT }`;

}

// host:port of a server URL (the token's key and the readable "where")
// hosts that only serve files (no game server lives there)
export function isStaticHost( h ) {

	return /(^|\.)(github\.io|pages\.dev|netlify\.app|vercel\.app)$/i.test( String( h || '' ) );

}

export function serverKey( url ) {

	try {

		return new URL( url ).host.toLowerCase();

	} catch ( e ) {

		return String( url || '' ).toLowerCase();

	}

}

function newToken() {

	const b = new Uint8Array( TOKEN_HEX / 2 );
	const c = globalThis.crypto;
	if ( c && c.getRandomValues ) c.getRandomValues( b );
	else for ( let i = 0; i < b.length; i ++ ) b[ i ] = Math.floor( Math.random() * 256 ); // (no crypto: still unguessable enough for a friends' server)
	return Array.from( b, ( x ) => x.toString( 16 ).padStart( 2, '0' ) ).join( '' );

}

// this browser's token for a server: created on first use and kept (localStorage, else for the page's life)
export function universeToken( url, storage = ls() ) {

	const k = serverKey( url );
	let all = {};
	try {

		all = JSON.parse( ( storage && storage.getItem( TOKENS_KEY ) ) || '{}' ) || {};

	} catch ( e ) { /* unreadable: start over */ }

	if ( sanitizeToken( all[ k ] ) ) return all[ k ];
	if ( memTokens.has( k ) ) return memTokens.get( k );
	const t = newToken();
	memTokens.set( k, t );
	all[ k ] = t;
	try {

		if ( storage ) storage.setItem( TOKENS_KEY, JSON.stringify( all ) );

	} catch ( e ) { /* blocked: this page only */ }

	return t;

}

// the readable sentence for a refusal or a failure
export function universeError( code, text = '', url = '' ) {

	const where = url ? serverKey( url ) : 'that address';
	switch ( code ) {

		case 'down': return isStaticHost( where ) ? `${ where } only serves the game: a universe is a server someone hosts. Run HOST_UNIVERSE_TUNNEL.cmd from the download (it prints an https address) or ask the host for theirs.`
			: `No universe server answers at ${ where }. Is it running, and is its port open? (HOSTING.md)`;
		case 'timeout': return `${ where } did not answer in time. Check the address and the firewall.`;
		case 'address': return 'Type the server address: the https://....trycloudflare.com line HOST_UNIVERSE_TUNNEL.cmd prints, or 192.168.1.20 on your network';
		case 'badname': return text || 'Pick a captain name of 2 to 24 letters or numbers.';
		case 'name': return text || 'That captain name belongs to someone else on this server. Pick another one.';
		case 'banned': return text || 'This captain is banned from that universe.';
		case 'full': return text || 'The universe is full right now. Try again later.';
		case 'version': return 'That server runs another version of the game. Update the game or the server.';
		case 'nouniverse': return `${ where } hosts islands and crews but no universe (the host starts it with --universe).`;
		case 'replaced': return 'You joined the universe from another window.';
		case 'kicked': return text || 'The server admin disconnected you.';
		case 'rate': return text || 'Too many new captains from your address. Try again later.';
		case 'token': return text || 'The server did not accept this browser\'s captain token.';
		default: return text || `The server refused (${ code || 'unknown' }).`;

	}

}

const fail = ( code, text, url ) => {

	const e = new Error( universeError( code, text, url ) );
	e.code = code;
	return e;

};

// asks the server whether this name may come in and for the captain's stored game, without joining: a join with
// { probe: true } that the server answers with 'profile' (no player appears) and the client leaves at once.
// (WebSocketImpl is accepted for older callers and unused: @colyseus/sdk picks the socket.)
export function probeUniverse( url, name, { timeout = 7000, token = null, character = null, boat = null } = {} ) {

	return new Promise( ( resolve, reject ) => {

		if ( ! url || ! isUniverseUrl( url ) ) return reject( fail( 'address', '', url ) );
		const captain = sanitizeCaptainName( name );
		if ( ! captain ) return reject( fail( 'badname', '', url ) );
		let settled = false, lastError = null;
		const done = ( err, value ) => {

			if ( settled ) return;
			settled = true;
			clearTimeout( timer );
			link.leave();
			if ( err ) reject( err );
			else resolve( value );

		};

		const timer = setTimeout( () => done( fail( 'timeout', '', url ) ), timeout );
		const link = new ColyseusLink( {
			url,
			onMessage: ( m ) => {

				if ( m.t === 'profile' ) done( null, { captain: m.captain || captain, exists: !! m.exists, isNew: !! m.isNew, profile: m.profile || null, universe: m.universe || null, players: m.players | 0, cap: m.cap | 0 } );
				else if ( m.t === 'error' ) {

					lastError = m;
					done( fail( m.code, m.text, url ) );

				}

			},
			onClose: ( { kick } ) => {

				if ( ! lastError ) done( fail( kick || 'down', '', url ) );

			},
		} );
		const h = helloMessage( { name: captain, character, boat } );
		h.token = token || universeToken( url );
		h.probe = true;
		link.join( h ).catch( ( e ) => done( fail( e.code === 'refused' ? 'down' : e.code, e.text, url ) ) );

	} );

}

// ---- the session: the captain's game kept by the server

export class UniverseSession {

	constructor( { url, captain, profile = null, info = null } = {} ) {

		this.url = url;
		this.captain = captain;
		this.info = info;
		this.app = null;
		this.net = null;
		this.local = null; // the state's own storage while attached
		this.json = profile ? JSON.stringify( profile ) : null; // the newest game as GameState wrote it
		this.pending = null; // { json, sig } waiting to go out
		this.inflight = null; // { json, sig } sent, not acknowledged yet
		this.sentSig = profile ? null : '';
		this.lastSent = 0;
		this.stats = { stored: 0, sent: 0, acked: 0, fixes: 0, refused: 0 };
		this._timer = 0;
		this._snapTimer = 0;
		this._offs = [];
		this._warnedSize = false;
		const self = this;
		// GameState talks to this as if it were localStorage: one slot, the captain's
		this.storage = {
			universe: this,
			getItem() { return self.json; },
			setItem( key, value ) { self._stored( String( value ) ); },
			removeItem() {},
		};
		this._onHide = () => this.save( true );

	}

	get online() {

		return !! ( this.net && this.net.online && this.net.universe );

	}

	get state() {

		return this.app && this.app.game ? this.app.game.state : null;

	}

	attach( app ) {

		if ( this.app === app ) return this;
		if ( app.universe && app.universe !== this ) app.universe.detach();
		this.app = app;
		app.universe = this;
		const st = this.state;
		if ( st ) {

			this.local = st.storage && st.storage.universe ? st.storage.universe.local : st.storage;
			st.storage = this.storage;

		}

		clearInterval( this._snapTimer );
		this._snapTimer = setInterval( () => this.save( false ), SNAPSHOT_MS );
		if ( typeof window !== 'undefined' && window.addEventListener ) {

			window.addEventListener( 'pagehide', this._onHide );
			if ( typeof document !== 'undefined' ) document.addEventListener( 'visibilitychange', this._onVisibility = () => { if ( document.visibilityState === 'hidden' ) this.save( true ); } );

		}

		return this;

	}

	detach() {

		const app = this.app;
		if ( ! app ) return;
		this.save( true );
		clearInterval( this._snapTimer );
		clearTimeout( this._timer );
		this._timer = 0;
		if ( typeof window !== 'undefined' && window.removeEventListener ) {

			window.removeEventListener( 'pagehide', this._onHide );
			if ( this._onVisibility && typeof document !== 'undefined' ) document.removeEventListener( 'visibilitychange', this._onVisibility );

		}

		const st = this.state;
		if ( st && st.storage === this.storage ) st.storage = this.local;
		if ( app.universe === this ) app.universe = null;
		this.bind( null );
		this.app = null;

	}

	// NetSync passes the current NetClient (null when offline)
	bind( net ) {

		if ( net === this.net ) return;
		for ( const off of this._offs ) off();
		this._offs.length = 0;
		this.net = net;
		if ( ! net || ! net.on ) return;
		this._offs.push( net.on( 'welcome', ( m ) => {

			if ( m.universe ) this.info = m.universe;
			// whatever was sent before the drop may be lost: send the newest again
			if ( this.inflight && ! this.pending ) this.pending = this.inflight;
			this.inflight = null;
			this.flush( true );

		} ) );
		this._offs.push( net.on( 'saved', ( m ) => this._onSaved( m ) ) );
		if ( net.online && net.universe ) this.flush( true );

	}

	// a snapshot now: GameState.save() (with where you are) lands in storage.setItem below
	save( urgent = false ) {

		const st = this.state;
		if ( st && st.storage === this.storage ) st.save();
		this.flush( urgent );

	}

	// money, boat, gear, unlocks, sales, boats bought, ports found: a change in any is worth sending soon
	_signature() {

		const st = this.state;
		if ( ! st ) return '';
		const c = st.career || {};
		return [ st.money, st.boat, st.character, JSON.stringify( st.upgrades || {} ), ( st.unlocked || [] ).length, c.sold, c.boats, ( st.discovered || [] ).length ].join( '|' );

	}

	_stored( json ) {

		this.json = json;
		this.stats.stored ++;
		const sig = this._signature();
		this.pending = { json, sig };
		if ( sig !== this.sentSig ) this._schedule();

	}

	_schedule() {

		if ( this._timer ) return;
		const wait = Math.max( 0, SAVE_GAP - ( Date.now() - this.lastSent ) );
		this._timer = setTimeout( () => {

			this._timer = 0;
			this.flush( true );

		}, wait );

	}

	// sends the waiting save (urgent / forced: as soon as the gap allows; else only the snapshot tick calls it)
	flush( urgent = true ) {

		if ( ! this.pending || ! this.online ) return false;
		if ( Date.now() - this.lastSent < SAVE_GAP ) {

			if ( urgent ) this._schedule();
			return false;

		}

		const p = this.pending;
		if ( p.json.length > MAX_SAVE ) {

			if ( ! this._warnedSize ) console.warn( `Universe: the game is ${ Math.round( p.json.length / 1024 ) } KB, more than the server keeps` );
			this._warnedSize = true;
			this.pending = null;
			return false;

		}

		if ( ! this.net.sendSave( p.json ) ) return false;
		this.pending = null;
		this.inflight = p;
		this.sentSig = p.sig;
		this.lastSent = Date.now();
		this.stats.sent ++;
		return true;

	}

	_onSaved( m ) {

		const p = this.inflight;
		this.inflight = null;
		if ( ! m.ok ) {

			this.stats.refused ++;
			if ( m.reason === 'rate' && p && ! this.pending ) {

				// too soon: the same save goes again after the gap
				this.pending = p;
				this._schedule();

			} else if ( m.reason === 'size' && ! this._warnedSize ) {

				this._warnedSize = true;
				console.warn( 'Universe:', m.text || 'the save is too large for the server' );

			}

			return;

		}

		this.stats.acked ++;
		const st = this.state;
		if ( m.fix && st ) {

			// the server clamped what it could not explain: play on with its numbers
			this.stats.fixes ++;
			if ( Number.isFinite( m.fix.money ) ) st.money = m.fix.money;
			if ( Number.isFinite( m.fix.xp ) ) st.xp = m.fix.xp;
			this.sentSig = this._signature();
			if ( st.emit ) st.emit();

		}

	}

}
