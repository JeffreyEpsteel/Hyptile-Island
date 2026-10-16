// Plain-node tests of wave 25B (one UI language): the shared .gm-panel shell, one gear on the rail, the cast ring, one pill
// family, one marker icon set for both maps (and its root patch), the notification queue, the interface sounds and the
// level-up / toast / coach motion.
//   node test/feature-ui-w25.mjs
import { readFileSync as readRaw, mkdtempSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const CR = String.fromCharCode( 13, 10 );
const read = ( p ) => readRaw( p, 'utf8' ).split( CR ).join( String.fromCharCode( 10 ) );

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};

const css = read( 'src/ui/ui.css' );
const ui = read( 'src/ui/UI.js' ), hud = read( 'src/game/GameHUD.js' ), kit = read( 'src/features/harbour/PanelKit.js' ), navy = read( 'src/features/navy/NavyPanel.js' );
const wm = read( 'src/ui/WorldMap.js' ), guide = read( 'src/game/Guide.js' ), menu = read( 'src/ui/MainMenu.js' ), cues = read( 'src/features/sfx/Cues.js' );

// ---- 2.1 one panel language
ok( /\.gm-panel,\n\.hb-panel,\n\.nv-panel \{\n\tposition: absolute;/.test( css ), 'ui.css: one shell for .gm-panel, .hb-panel and .nv-panel' );
ok( /\.gm-panel\.is-open,\n\.hb-panel\.is-open,\n\.nv-panel\.is-open \{/.test( css ), 'one open state for all three' );
ok( ! /^\.gm-panel \{/m.test( hud ), 'GameHUD no longer carries its own panel shell' );
ok( ! /^\.hb-panel \{/m.test( kit ) && ! /^\.nv-panel \{/m.test( navy ), 'PanelKit and NavyPanel carry no shell of their own' );
ok( kit.includes( "'gm-panel hb-panel tw-glass tw-interactive'" ), 'the tavern / bench window is a .gm-panel' );
ok( navy.includes( "'gm-panel nv-panel tw-glass tw-interactive'" ), 'the navy office is a .gm-panel' );
ok( ( navy.match( /class="gm-act"/g ) || [] ).length >= 4 && ! navy.includes( 'nv-acts' ), 'the navy answers are the shared .gm-act rows' );
ok( /^\.gm-btn \{/m.test( css ) && /\.gm-btn\.is-ghost,\n\.hb-btn \{/.test( css ), 'one button language (.gm-btn aqua, ghost, .hb-btn shares the ghost)' );
ok( ! /^\.gm-btn \{/m.test( hud ), 'GameHUD no longer redefines .gm-btn' );
ok( /\.gm-tab,\n\.hb-tab \{/.test( css ) && ! /^\.gm-tab \{/m.test( read( 'src/game/HudPanels.js' ) ), 'one tab language' );
ok( /var\(--tw-glass\)/.test( wm.split( '.wm-controls button' )[ 1 ].slice( 0, 400 ) ) && /\.wm-target \{[^}]*var\(--tw-glass\)/.test( wm ), 'the world map chrome (controls, tracked card) speaks the panel tokens' );
ok( ! wm.includes( '#102933ed' ) && ! wm.includes( 'background:#0a202eea' ), 'the chart chrome keeps no private colours' );

// ---- 2.2 one gear
ok( ui.includes( "rail.append( open, h( 'span', 'tw-rail-sep' ), help );" ), 'the rail is the gear and the controls button only' );
ok( ui.includes( "icon( 'gear' )" ), 'the gear icon opens the settings' );
const icons = await import( '../src/ui/icons.js' );
ok( icons.hasIcon( 'gear' ) && /M12 8\.8a3\.2/.test( read( 'src/ui/icons.js' ) ), 'icons.js has a gear' );

// ---- 2.3 the cast ring
ok( /\.gm-cast \{[^}]*border-radius|\.gm-cast > span/.test( hud ) === false, 'the old hairline bar is gone' );
ok( hud.includes( 'class="gm-cast-arc"' ) && hud.includes( 'strokeDashoffset' ) && hud.includes( 'pathLength="100"' ), 'the cast meter is an SVG ring filled by the dash offset' );
ok( /\.gm-cast \{[^}]*top: 50%/.test( hud ) && /\.gm-cast \{[^}]*left: 50%/.test( hud ), 'the ring sits on the reticle (screen centre)' );

// ---- 2.4 one pill family
ok( /\.tw-root \.tw-mode,\n\.tw-root \.wx-chip,\n\.tw-root \.gm-purse \{[^}]*min-height: calc\(30/.test( css ), 'mode pill, weather pill and purse share one shape' );

// ---- 2.5 one marker set
const MI = icons.MARKER_ICONS;
const need = [ 'fish', 'anchor', 'boat', 'flag', 'plane', 'skull', 'target', 'swords', 'board', 'crate', 'helm', 'arrow', 'quest', 'chest', 'wreck' ];
ok( need.every( ( k ) => typeof MI[ k ] === 'string' && MI[ k ].startsWith( '<svg' ) ), 'MARKER_ICONS has every glyph the minimap and the chart use' );
ok( need.filter( ( k ) => k !== 'arrow' ).every( ( k ) => MI[ k ].includes( 'stroke-width="2.2"' ) && MI[ k ].includes( 'stroke-linecap="round"' ) ), 'one stroke family: 2.2, round caps and joins' );
ok( /\.tw-root \.gm-mk\.gm-mk > i \{[^}]*var\(--mk\)/.test( css ) && css.includes( '.wm-lg > i { --mk: var(--tw-ink); }' ), 'the minimap and the chart draw the same disc and ring in the kind colour' );
{

	// the root patch applies to a copy and leaves Minimap.js importing the shared set once
	const tmp = mkdtempSync( join( tmpdir(), 'ui25b-' ) );
	mkdirSync( join( tmp, 'src', 'game' ), { recursive: true } );
	copyFileSync( 'src/game/Minimap.js', join( tmp, 'src', 'game', 'Minimap.js' ) );
	copyFileSync( 'package.json', join( tmp, 'package.json' ) );
	const { apply, PATCHES } = await import( '../tools/ui25b/apply-patches.mjs' );
	const r1 = apply( tmp ), r2 = apply( tmp );
	const mini = read( join( tmp, 'src', 'game', 'Minimap.js' ) );
	ok( r1.every( ( [ , m ] ) => m === 'ok' || m === 'already applied' ) && r2.every( ( [ , m ] ) => m === 'already applied' ), `every anchor of tools/ui25b/apply-patches.mjs is found once and the patch is idempotent (${ PATCHES.length } patches)` );
	ok( mini.includes( "import { MARKER_ICONS } from '../ui/icons.js';" ) && mini.includes( 'export const ICON = { ...MARKER_ICONS };' ) && ! mini.includes( 'skull: ' ), 'the patched Minimap.js takes its icons from ui/icons.js' );
	try { execFileSync( process.execPath, [ '--check', join( tmp, 'src', 'game', 'Minimap.js' ) ] ); ok( true, 'the patched file still parses' ); } catch ( e ) { ok( false, 'the patched file parses: ' + e.message ); }
	rmSync( tmp, { recursive: true, force: true } );

}

// ---- 2.6 one notification channel
{

	const { UI } = await import( '../src/ui/UI.js' );
	let held = false, now = 1000;
	const shown = [];
	const fake = {
		_toasts: [], _toastQ: [], _toastT: 0,
		root: { querySelector: () => held ? {} : null },
		sound() {},
		_showToast( text, ms ) {

			const t = { text, ms, leaving: false };
			t.dismiss = () => { const i = this._toasts.indexOf( t ); if ( i >= 0 ) this._toasts.splice( i, 1 ); if ( this._toastQ.length ) this._pumpToasts(); };
			this._toasts.push( t );
			shown.push( text );
			return t.dismiss;

		},
	};
	for ( const k of [ 'toast', '_pumpToasts', '_dropQueued', 'notifyBusy', '_toastHeld' ] ) fake[ k ] = UI.prototype[ k ];
	const realNow = performance.now.bind( performance );
	performance.now = () => now;
	const realSet = globalThis.setTimeout;
	globalThis.setTimeout = ( fn ) => { fake._timerFn = fn; return 1; };
	try {

		fake.toast( 'one' ); fake.toast( 'two' ); fake.toast( 'three' );
		ok( shown.join() === 'one,two' && fake._toastQ.length === 1, 'two toasts show at once; the third waits in the queue' );
		ok( fake.notifyBusy(), 'notifyBusy() is true while anything shows or waits (the coach tip waits for silence)' );
		fake.toast( 'three' );
		ok( fake._toastQ.length === 1, 'the same words queued twice are kept once' );
		fake._toasts[ 0 ].dismiss();
		ok( shown.join() === 'one,two,three' && fake._toastQ.length === 0, 'a free slot takes the next queued toast' );
		fake._toasts.length = 0;
		held = true;
		fake.toast( 'held' );
		ok( shown.length === 3 && fake._toastQ.length === 1, 'while a window is open the toast waits' );
		held = false; now += 500;
		fake._pumpToasts();
		ok( shown[ 3 ] === 'held' && fake._toastQ.length === 0, 'and shows when the window closes' );
		fake._toasts.length = 0;
		held = true;
		fake.toast( 'stale' );
		now += 20000; held = false;
		fake._pumpToasts();
		ok( ! shown.includes( 'stale' ), 'a toast that waited longer than 14 s is dropped as no longer news' );
		for ( let i = 0; i < 20; i ++ ) { held = true; fake.toast( 'n' + i ); }
		ok( fake._toastQ.length <= 8, 'the queue is capped (the oldest go first)' );
		const drop = fake.toast( 'x-drop' );
		drop();
		ok( ! fake._toastQ.some( ( q ) => q.text === 'x-drop' ), 'the dismiss function of a queued toast removes it' );

	} finally {

		performance.now = realNow;
		globalThis.setTimeout = realSet;

	}

	ok( /\.gm-coach\.is-on/.test( guide ) && guide.includes( 'ui.notifyBusy' ) && guide.includes( 'this._queue.unshift( this._curQ )' ), 'the coach tip gives way to a toast and comes back after it' );
	ok( css.includes( 'cubic-bezier(0.34, 1.56, 0.64, 1)' ) && guide.includes( 'translateX(calc(28 * var(--tw-u)))' ) && hud.includes( '@keyframes gm-level-card' ), 'toast, coach tip and level-up each move their own way (a pop from the top, a slide from the side, a ring and a number)' );

}

// ---- 4.4 interface sounds
{

	const { soundFor } = await import( '../src/ui/UI.js' );
	// a minimal element: matches() understands the simple selectors soundFor uses (.a, .a:not(.b), [role="x"], [aria-label="X"])
	const matchOne = ( sel, e ) => {

		let m;
		if ( ( m = /^\.([\w-]+):not\(\.([\w-]+)\)$/.exec( sel ) ) ) return e.cls.includes( m[ 1 ] ) && ! e.cls.includes( m[ 2 ] );
		if ( ( m = /^\.([\w-]+)$/.exec( sel ) ) ) return e.cls.includes( m[ 1 ] );
		if ( ( m = /^\[role="(\w+)"\]$/.exec( sel ) ) ) return e.role === m[ 1 ];
		if ( ( m = /^\[aria-label="(\w+)"\]$/.exec( sel ) ) ) return e.label === m[ 1 ];
		return false;

	};
	const el = ( cls, extra = {} ) => {

		const e = { cls: cls.split( ' ' ), role: extra.role, label: extra.label, dataset: extra.dataset || {} };
		e.matches = ( sel ) => sel.split( ',' ).some( ( x ) => matchOne( x.trim(), e ) );
		return e;

	};
	ok( soundFor( el( 'gm-btn' ) ) === 'confirm', 'a primary button confirms' );
	ok( soundFor( el( 'gm-btn is-ghost' ) ) === 'click', 'a ghost button clicks' );
	ok( soundFor( el( 'gm-tab' ) ) === 'tab' && soundFor( el( 'x', { role: 'tab' } ) ) === 'tab', 'tabs tick' );
	ok( soundFor( el( 'wm-close' ) ) === 'back' && soundFor( el( 'x', { label: 'Close' } ) ) === 'back', 'close buttons go back' );
	ok( soundFor( el( 'x', { role: 'switch' } ) ) === 'toggle', 'switches toggle' );
	ok( soundFor( el( 'x', { dataset: { sound: 'confirm' } } ) ) === 'confirm', 'data-sound wins' );
	ok( ui.includes( 'this.sound( open ? \'open\' : \'close\' )' ) && ui.includes( "document.addEventListener( 'click'" ), 'panels open / close and every button click sound through ui.sound()' );

	const { UI_CUES, Cues } = await import( '../src/features/sfx/Cues.js' );
	const { CUES } = await import( '../src/features/sfx/Synth.js' );
	const names = [ 'click', 'tab', 'toggle', 'confirm', 'back', 'open', 'close', 'notify', 'levelup' ];
	ok( names.every( ( n ) => UI_CUES[ 'ui_' + n ] && CUES[ 'ui_' + n ] ), 'the nine interface cues exist and are registered with the synth' );
	// a recording context: every builder runs without throwing and ends its nodes
	let nodes = 0, longest = 0;
	const param = () => ( { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} } );
	const node = () => { nodes ++; return { connect() {}, disconnect() {}, start() {}, stop() {}, gain: param(), frequency: param(), Q: param(), type: '', buffer: null, loop: false }; };
	const ctx = { sampleRate: 8000, currentTime: 0, createOscillator: node, createGain: node, createBiquadFilter: node, createBufferSource: node, createBuffer: ( c, n ) => ( { getChannelData: () => new Float32Array( n ) } ) };
	for ( const n of names ) {

		let len = 0;
		try { len = UI_CUES[ 'ui_' + n ].build( ctx, node(), 0, {} ); ok( len > 0 && len < 3, `ui_${ n } builds (${ len.toFixed( 2 ) } s)` ); } catch ( e ) { ok( false, `ui_${ n } builds: ${ e.message }` ); }
		longest = Math.max( longest, len );

	}

	ok( nodes > 30, 'and wires oscillators and noise' );
	ok( names.every( ( n ) => UI_CUES[ 'ui_' + n ].cat === 'sfx' && UI_CUES[ 'ui_' + n ].gain <= 0.5 ), 'quiet: gain at most 0.5 each, in the sfx category (master and mute apply)' );
	const played = [];
	const sfx = { features: null, time: 0, synth: { play: ( c ) => { played.push( c ); return {}; } }, player: { ctx: null } };
	const c = new Cues( sfx );
	c.ui( 'click' ); sfx.time = 0.01; c.ui( 'click' ); sfx.time = 1; c.ui( 'click' );
	ok( played.join() === 'ui_click,ui_click', 'cues.ui( name ) plays ui_<name> inside its rate limit' );
	ok( ! /[^a-z]at:/.test( cues.slice( cues.indexOf( 'export const UI_CUES' ), cues.indexOf( 'const BATTERY_REACH' ) ) ), 'the interface cues stay in the head (no position)' );

}

// ---- 1.2 / 1.4 the first screens
ok( /multiplayer: \{ name: 'Play online'/.test( menu ) && ! /Multiplayer<\/span>/.test( menu ), 'the Multiplayer card reads "Play online"' );
ok( menu.includes( '<details class="mm-adv"' ) && menu.includes( 'Use another server' ), 'the server address, the crew code and the Universe / Island switch live behind "Use another server"' );
{

	const universe = menu.slice( menu.indexOf( '_renderUniverseStep() {' ), menu.indexOf( '// the address box changed' ) );
	const before = universe.slice( 0, universe.indexOf( '<details class="mm-adv"' ) );
	ok( ! /wss|ws:\/\/|Updating|banned|Universe/.test( before.replace( /data-[a-z]+/g, '' ).replace( /_renderUniverseStep|probe|universe\)|\.universe/g, '' ).split( '`' ).filter( ( _, i ) => i % 2 === 1 ).join( ' ' ) ), 'nothing above the fold of the online step says wss, Universe, Updating or banned' );
	ok( ( before.match( /data-health/g ) || [] ).length === 1, 'one state line: the server health ("Online · 3 captains aboard")' );

}

ok( ! ui.includes( 'class="tw-start-keys"' ) && ui.includes( 'class="tw-start-cta" data-sound="confirm"' ), 'the start overlay is the wordmark and one button (the keys are the guide\'s)' );

// ---- 4.5 the level-up
ok( hud.includes( 'showLevelUp( level )' ) && hud.includes( 's.lastLevelUp' ) && hud.includes( '! this.catchOpen' ), 'the HUD shows the level reached once the catch card is gone' );
ok( hud.includes( "this.ui.sound( 'levelup' )" ) || hud.includes( "this.ui.sound( 'levelup' )" ) || hud.includes( "ui.sound( 'levelup' )" ), 'with its own sound' );

// wave 27: the HUD at 561-900 px (A-CLASS 2.1)
ok( /@media \(min-width: 561px\) and \(max-width: 900px\) \{[^@]*\.tw-root \.tw-toasts \{ top: calc\(var\(--tw-edge\) \+ var\(--tw-safe-t\) \+ 64/.test( css ), 'ui.css: under 900 px the toasts sit under the top row' );
ok( /\.tw-mode-text \{ min-width: 0; overflow: hidden; text-overflow: ellipsis/.test( css ), 'ui.css: the mode pill ends in an ellipsis before the purse' );
ok( /min-width: 561px\) and \(max-width: 900px\) \{[^@]*\.gm-fight \{ left: calc\(\(100vw - 270/.test( hud ) && /\.gm-purse \{ max-width: calc\(330/.test( hud ), 'GameHUD: the purse wraps and the fight panel centres left of the minimap under 900 px' );

console.log( fails ? `\n${ fails } failed` : '\nall ok' );
process.exit( fails ? 1 : 0 );
