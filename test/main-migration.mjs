// Main-release compatibility using synthetic storage only. No sockets, fetch,
// browser profile, real captain data, or persistent storage are accessed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function memoryStorage() {
	const values = new Map(), calls = [];
	return { values, calls, getItem( key ) { calls.push( [ 'get', key ] ); return values.get( key ) ?? null; }, setItem( key, value ) { calls.push( [ 'set', key ] ); values.set( key, String( value ) ); }, removeItem( key ) { calls.push( [ 'remove', key ] ); values.delete( key ); } };
}
const store = memoryStorage(), oldStorage = globalThis.localStorage, oldLocation = globalThis.location;
Object.defineProperty( globalThis, 'localStorage', { value: store, configurable: true, writable: true } );
let checks = 0;
function check( condition, text ) { assert.ok( condition, text ); console.log( 'ok', text ); checks ++; }

try {
	const { GameState, SAVE_KEY } = await import( '../src/game/GameState.js' );
	const { backupKey, corruptKey } = await import( '../src/game/SaveVault.js' );
	const { DEFAULT_UNIVERSE, SHARED_UNIVERSE, DEFAULT_UNIVERSE_PORT, SERVER_KEY, NAME_KEY, universeToken, defaultUniverseAddress, serverKey, UniverseSession } = await import( '../src/net/Universe.js' );
	const { DEFAULT_PORT, defaultServerUrl, normalizeServerUrl } = await import( '../src/net/NetClient.js' );
	const { STORAGE_KEY: QUALITY_KEY } = await import( '../src/core/Quality.js' );
	const { STORAGE_KEY: ACCESSIBILITY_KEY } = await import( '../src/ui/Accessibility.js' );
	const { STORAGE_KEY: LANG_KEY } = await import( '../src/i18n/index.js' );
	const { TOUCH_KEY } = await import( '../src/ui/TouchControls.js' );
	const { AUDIO_SETTINGS_KEY } = await import( '../src/audio/SoundScape.js' );
	const { INTRO_KEY } = await import( '../src/world/start/Intro.js' );
	check( SAVE_KEY === 'hyptile-island.save.v2', 'campaign retains the original main-game save namespace' );
	for ( const mode of [ 'campaign', 'sandbox', 'multiplayer' ] ) for ( let slot = 0; slot < 4; slot ++ ) {
		const key = ( mode === 'campaign' ? '' : mode + '.' ) + 'hyptile-island.save.v2' + ( slot ? '.slot' + slot : '' );
		const money = 320 + slot, data = { v: 2, mode, money, xp: 123, quests: { oldMission: { stage: 2 } }, features: { legacy: { progress: 7 }, cars: { v: 1, owned: [] } } };
		store.values.set( key, JSON.stringify( data ) );
		const game = new GameState( store );
		check( GameState.slotKey( slot, mode ) === key && game.useSlot( slot, mode ) && game.money === money && game.xp === 123 && game.quests.oldMission.stage === 2 && game.featuresData.legacy.progress === 7, `existing ${ mode } slot ${ slot } loads progression and feature data from its exact original key` );
	}
	check( backupKey( SAVE_KEY, 2 ) === 'hyptile-island.save.v2.bak2' && corruptKey( SAVE_KEY ) === 'hyptile-island.save.v2.corrupt', 'existing rolling backups and corrupt-save recovery keys remain discoverable' );
	const legacy = memoryStorage(); legacy.values.set( 'tidewater.save.v1', JSON.stringify( { v: 1, money: 88, inventory: [], log: {}, upgrades: {}, nextId: 1 } ) );
	const oldGame = new GameState( legacy );
	check( oldGame.load() && oldGame.money === 88, 'original Tidewater v1 campaign fallback loads without importing or renaming user data' );
	oldGame.save();
	check( legacy.values.has( 'tidewater.save.v1' ) && legacy.values.has( 'hyptile-island.save.v2' ) && ! [ ...legacy.values.keys() ].some( key => key.startsWith( 'alpha-astra.' ) ), 'legacy load saves forward to original v2 key while preserving the v1 source' );

	// Explicitly synthetic identity; never obtain or print a real token.
	const syntheticCaptainToken = '0123456789abcdef'.repeat( 2 ), syntheticOtherToken = 'f'.repeat( 32 );
	store.values.set( 'hyptile-island.universe.tokens', JSON.stringify( { 'hyptile-universe.fly.dev': syntheticCaptainToken, 'friend.test:8765': syntheticOtherToken } ) );
	const tokenWrites = store.calls.filter( ( [ kind ] ) => kind !== 'get' ).length;
	check( universeToken( 'wss://hyptile-universe.fly.dev/universe', store ) === syntheticCaptainToken && universeToken( 'wss://HYPTILE-UNIVERSE.FLY.DEV:443/universe', store ) === syntheticCaptainToken, 'the exact existing captain token is reused for the existing Fly host, including normalized host casing and TLS port' );
	check( store.calls.filter( ( [ kind ] ) => kind !== 'get' ).length === tokenWrites && ! store.values.has( 'alpha-astra.universe.tokens' ), 'returning Fly captains generate no replacement identity or token storage write' );
	check( universeToken( 'ws://friend.test:8765/universe', store ) === syntheticOtherToken && serverKey( 'wss://hyptile-universe.fly.dev/universe' ) === 'hyptile-universe.fly.dev', 'custom-host captain identities keep their original independent host keys' );
	check( SERVER_KEY === 'hyptile-island.universe.server' && NAME_KEY === 'hyptile-island.universe.name', 'last universe address and captain name keep the main-game preference keys' );
	check( SHARED_UNIVERSE === 'wss://hyptile-universe.fly.dev/universe' && DEFAULT_UNIVERSE === SHARED_UNIVERSE && DEFAULT_UNIVERSE_PORT === 8765 && DEFAULT_PORT === 8765, 'main release restores the existing Fly universe and both original local ports' );
	globalThis.location = { hostname: 'jeffreyepsteel.github.io', protocol: 'https:', pathname: '/Hyptile-Island/', search: '' };
	check( defaultUniverseAddress( location ) === SHARED_UNIVERSE && defaultServerUrl() === 'wss://hyptile-universe.fly.dev/island', 'static main Pages offers the existing Fly universe and connects room play to its real server' );
	globalThis.location.search = '?crew=abcdef';
	check( defaultServerUrl() === 'wss://hyptile-universe.fly.dev/abcdef', 'HTTPS crew links retain their room while using the existing Fly server' );
	globalThis.location.search = '?server=wss://friend.test/net/crew';
	check( defaultServerUrl() === 'wss://friend.test/net/crew', 'explicit custom server URL still takes precedence over defaults' );
	globalThis.location = { hostname: '192.168.1.20', protocol: 'http:', pathname: '/', search: '' };
	check( defaultUniverseAddress( location ) === '192.168.1.20:8765' && defaultServerUrl() === 'ws://192.168.1.20:8765/island' && normalizeServerUrl( 'ws://friend/island' ) === 'ws://friend:8765/island', 'HTTP/LAN defaults retain the original port without redirecting local play to Fly' );

	const profile = { v: 2, money: 456, xp: 234, features: { legacy: { progress: 9 }, helicopter: { v: 1, hp: 41, homeSlot: 0, pose: [ 18, 1, - 68, 0 ], systems: { master: true, nav: true } } } };
	const session = new UniverseSession( { url: SHARED_UNIVERSE, captain: 'Synthetic Captain', profile } );
	const hosted = new GameState( session.storage );
	check( hosted.load() && hosted.money === 456 && hosted.featuresData.legacy.progress === 9 && hosted.featuresData.helicopter.hp === 41, 'existing server profile adapter loads both prior features and new helicopter data with unchanged v2 shape' );
	check( [ QUALITY_KEY, ACCESSIBILITY_KEY, LANG_KEY, TOUCH_KEY, AUDIO_SETTINGS_KEY, INTRO_KEY ].join( '|' ) === [ 'hyptile-island.quality', 'hyptile-island.a11y', 'hyptile-island.lang', 'hyptile-island.touch', 'hyptile-island.audio', 'hyptile-island.intro.' ].join( '|' ), 'quality, access, language, touch, audio and intro preferences retain exact original keys' );
	const source = file => readFileSync( new URL( '../' + file, import.meta.url ), 'utf8' );
	check( source( 'src/game/Guide.js' ).includes( "const KEY = 'tidewater.guide'" ) && source( 'src/ui/UI.js' ).includes( "getItem( 'tidewater.ui.tab' )" ) && source( 'src/ui/UI.js' ).includes( "setItem( 'tidewater.ui.tab', tab.id )" ), 'the two original Tidewater-named preference exceptions remain intact' );
	check( source( 'src/player/Player.js' ).includes( "'hyptile-island.view'" ) && source( 'src/game/GameHUD.js' ).includes( "'hyptile-island.hold.v1'" ) && source( 'src/game/GameHUD.js' ).includes( "'hyptile-island.inventory-view'" ) && source( 'src/ui/MainMenu.js' ).includes( "'hyptile-island.mode'" ) && source( 'src/ui/MainMenu.js' ).includes( "'hyptile-island.netway'" ), 'view, hold arrangement, inventory and menu preferences use existing main keys' );
	check( source( 'src/main.js' ).includes( "'hyptile-island.boot'" ) && source( 'src/ui/UI.js' ).includes( "getItem( 'hyptile-island.boot' )" ) && source( 'src/ui/UI.js' ).includes( "'hyptile-island.tip.fullscreen'" ) && source( 'src/ui/PauseMenu.js' ).includes( "'hyptile-island.menu'" ), 'boot diagnostics, fullscreen tip and menu session flag remain internally consistent with main' );
	check( source( 'src/ui/UI.js' ).includes( 'HYPTILE ISLAND' ) && source( 'src/ui/MainMenu.js' ).includes( 'HYPTILE ISLAND' ) && source( 'src/ui/UI.js' ).includes( 'https://github.com/JeffreyEpsteel/Hyptile-Island/releases' ), 'main product branding and desktop download point to Hyptile Island' );
} finally {
	if ( oldStorage === undefined ) delete globalThis.localStorage; else globalThis.localStorage = oldStorage;
	if ( oldLocation === undefined ) delete globalThis.location; else globalThis.location = oldLocation;
}
console.log( `${ checks } main migration checks passed. Synthetic memory only; no real storage or network accessed.` );
