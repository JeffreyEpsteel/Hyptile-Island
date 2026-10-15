// Plain-node tests of wave 24F (polish): the first-start guide waits for the title card and shows three pages (all on
// replay), the HUD steps back behind the guide and the pause sheet, the frame-rate overlay is opt-in, the loader's tips
// cross-fade, every scroller shares one scrollbar, the wordmark is one class on every screen, the journal speaks the HUD's
// tokens, the spring arm stops at a wall and reaches out at a sprint, CameraFeel opens the fov on a sprint, and the
// root patch of tools/polish applies to a copy.
//   node test/feature-ui-w24.mjs
import { readFileSync as readRaw, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// (the working copy may be CRLF under autocrlf; the checks are written against LF)
const readFileSync = ( p, enc ) => enc ? readRaw( p, enc ).split( String.fromCharCode( 13, 10 ) ).join( String.fromCharCode( 10 ) ) : readRaw( p );

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};
const store = () => {

	const m = new Map();
	return { getItem: ( k ) => m.has( k ) ? m.get( k ) : null, setItem: ( k, v ) => m.set( k, String( v ) ), removeItem: ( k ) => m.delete( k ) };

};
globalThis.localStorage = store();

// ---- a small DOM: enough for the guide's card and the HUD root
class El {

	constructor( tag ) { this.tag = tag; this.children = []; this.attrs = {}; this.hidden = false; this.textContent = ''; this._html = ''; this.dataset = {}; this.style = { setProperty() {} }; const set = new Set(); this.classList = { add: ( ...c ) => c.forEach( ( x ) => set.add( x ) ), remove: ( ...c ) => c.forEach( ( x ) => set.delete( x ) ), toggle: ( c, f ) => { if ( f === undefined ) f = ! set.has( c ); f ? set.add( c ) : set.delete( c ); return f; }, contains: ( c ) => set.has( c ) }; }
	get innerHTML() { return this._html; }
	set innerHTML( v ) { this._html = String( v ); }
	get firstChild() { return this.children[ 0 ] || null; }
	get lastChild() { return this.children[ this.children.length - 1 ] || null; }
	append( ...n ) { this.children.push( ...n ); }
	setAttribute( k, v ) { this.attrs[ k ] = v; }
	addEventListener() {}
	querySelector( sel ) {

		// the guide's card parts, by class or tag
		const want = sel.replace( /^\./, '' );
		const walk = ( e ) => {

			for ( const c of e.children ) {

				if ( c.tag === want || ( c.className || '' ).split( ' ' ).includes( want ) ) return c;
				const r = walk( c );
				if ( r ) return r;

			}

			return null;

		};
		return walk( this );

	}
	querySelectorAll( sel ) {

		const want = sel.replace( /^\.?gm-guide-dots /, '' ).replace( /^\./, '' );
		const out = [];
		const walk = ( e ) => { for ( const c of e.children ) { if ( c.tag === want || ( c.className || '' ).split( ' ' ).includes( want ) ) out.push( c ); walk( c ); } };
		walk( this );
		return out;

	}

}
// the card markup is parsed just far enough: h() builds elements from the guide's template by hand
const mk = ( tag, cls ) => { const e = new El( tag ); e.className = cls; return e; };
globalThis.document = {
	createElement: ( t ) => new El( t ), getElementById: () => null, head: new El( 'head' ), pointerLockElement: null,
	addEventListener() {},
};
globalThis.window = { addEventListener() {}, removeEventListener() {} };

const { PAGES, INTRO_PAGES, introPlaying } = await import( '../src/game/Guide.js' );

// ---- the guide: three pages at the first start, all on replay, waits for the title card
{

	ok( INTRO_PAGES === 3 && PAGES.length > INTRO_PAGES, `the first-start intro is ${ INTRO_PAGES } pages of ${ PAGES.length }` );
	ok( [ 'welcome', 'fishing', 'where' ].every( ( id, i ) => PAGES[ i ].id === id ), 'they are the goal, fishing and where to go' );
	const app = ( intro ) => ( { features: { get: ( n ) => n === 'start' ? { intro } : null } } );
	ok( introPlaying( app( { active: true, pending: false } ) ) && introPlaying( app( { active: false, pending: true } ) ), 'the title card counts while it plays or is armed' );
	ok( ! introPlaying( app( { active: false, pending: false } ) ) && ! introPlaying( app( null ) ) && ! introPlaying( {} ) && ! introPlaying( null ), 'and not after it, nor without the start feature' );
	const src = readFileSync( 'src/game/Guide.js', 'utf8' );
	ok( src.includes( "const intro = introPlaying( app );" ) && src.includes( "! ui._start && ! intro )" ) && src.includes( "classList.toggle( 'is-intro', intro )" ), 'the intro countdown holds while the title card is up, and the HUD is away for it' );
	ok( src.includes( "this.count = INTRO_PAGES;" ) && src.includes( "this.count = PAGES.length;" ), 'the first start shows INTRO_PAGES, a replay every page' );
	ok( src.includes( "classList.add( 'is-modal' )" ) && src.includes( "classList.remove( 'is-modal' )" ), 'the guide marks the HUD root is-modal while it is up' );
	ok( src.includes( "d.hidden = j >= this.count" ), 'the dots beyond the run are hidden' );

}

// ---- the pause sheet and the HUD
{

	const pm = readFileSync( 'src/ui/PauseMenu.js', 'utf8' ), css = readFileSync( 'src/ui/ui.css', 'utf8' );
	ok( pm.includes( "classList.add( 'is-paused' )" ) && pm.includes( "classList.remove( 'is-paused' )" ), 'the pause menu marks the root is-paused while open' );
	ok( /\.tw-root\.is-paused \.tw-hud,\s*\.tw-root\.is-modal \.tw-hud/.test( css ) && /\.tw-root\.is-modal \.gm-map \{\s*opacity: 0\.16/.test( css ), 'ui.css dims the HUD, the rail and the minimap behind a sheet' );
	ok( pm.includes( 'pm-title tw-wordmark' ) && pm.includes( 'class="pm-rule"' ), 'the pause title carries the wordmark and its rule' );

}

// ---- the frame-rate overlay is opt-in
{

	const css = readFileSync( 'src/ui/ui.css', 'utf8' ), ui = readFileSync( 'src/ui/UI.js', 'utf8' ), appui = readFileSync( 'src/ui/AppUI.js', 'utf8' );
	ok( /\.tw-stats \{\s*display: none;/.test( css ) && css.includes( '.tw-root.is-stats .tw-stats { display: grid; }' ), 'the stats block is hidden unless the root is-stats' );
	ok( ui.includes( 'showStats( on, remember = true )' ) && ui.includes( "'tidewater.ui.stats'" ), 'UI.showStats sets the class and remembers it' );
	ok( appui.includes( "app.qs.has( 'stats' )" ) && appui.includes( "'Frame rate overlay'" ), 'AppUI reads ?stats and offers the switch under Performance > Live' );
	ok( appui.includes( "ui.selectTab( 'game', false )" ) && appui.includes( '! app.rules.worldControls' ), 'the first Settings visit outside the sandbox opens on the Game tab' );

}

// ---- loader tips cross-fade, one scrollbar, one wordmark
{

	const css = readFileSync( 'src/ui/ui.css', 'utf8' );
	const kf = css.match( /@keyframes tw-tip \{([^}]*\}\s*)+?\}/ )?.[ 0 ] || '';
	const stops = [ ...kf.matchAll( /([\d.]+)% \{ opacity: (\d)/g ) ].map( ( m ) => [ parseFloat( m[ 1 ] ), parseInt( m[ 2 ] ) ] );
	const fullAt = stops.find( ( s ) => s[ 1 ] === 1 )?.[ 0 ], outAt = stops.filter( ( s ) => s[ 1 ] === 0 ).map( ( s ) => s[ 0 ] ).find( ( p ) => p > 5 );
	// 8 tips over 48 s: one slot is 12.5 %; the fade-out must end after the slot so the next tip's fade-in overlaps it
	ok( fullAt <= 1.5 && outAt > 12.5 && outAt < 15, `a tip is in by ${ fullAt }% and out by ${ outAt }% of the cycle (the slot ends at 12.5%: a cross-fade)` );
	ok( css.includes( '.tw-root * {\n\tscrollbar-width: thin;' ) && css.includes( '.tw-root *::-webkit-scrollbar-thumb {' ), 'every scroller under the HUD root shares the slim scrollbar' );
	ok( css.includes( '.tw-wordmark {' ) && css.includes( 'class="tw-start-rule"' ) === false, 'the wordmark class is in ui.css' );
	const ui = readFileSync( 'src/ui/UI.js', 'utf8' ), mm = readFileSync( 'src/ui/MainMenu.js', 'utf8' );
	ok( ui.includes( 'tw-start-title tw-wordmark' ) && ui.includes( 'class="tw-start-rule"' ) && mm.includes( 'mm-title tw-wordmark' ) && mm.includes( 'class="mm-rule"' ), 'the start overlay and the main menu use it, with the coral / cream / jade rule' );

}

// ---- the journal speaks the HUD's tokens; the crew faces sit on a pale disc
{

	const qj = readFileSync( 'src/ui/QuestJournal.js', 'utf8' );
	const css = qj.slice( qj.indexOf( 'const CSS = `' ), qj.indexOf( '`;', qj.indexOf( 'const CSS = `' ) ) );
	ok( css.includes( 'var(--tw-glass)' ) && css.includes( 'var(--tw-line)' ) && css.includes( 'var(--tw-aqua-rgb)' ) && css.includes( 'var(--tw-sun)' ), 'the journal panel uses the glass, line, aqua and sun tokens' );
	ok( ! /#[0-9a-f]{6}\b/i.test( css.replace( /var\([^)]*\)/g, '' ) ), 'no hand-picked hex colours remain in the journal CSS' );
	const hp = readFileSync( 'src/game/HudPanels.js', 'utf8' );
	ok( /\.gm-crew-face \{[^}]*rgba\(170, 225, 235, 0\.42\)/.test( hp ), 'the crew portraits sit on a pale sky disc' );

}

// ---- the spring arm: a wall between the pivot and the camera shortens it; a sprint reaches out; the air rides level
{

	const E = await import( '../src/engine/index.js' );
	const { TerrainData } = await import( '../src/world/TerrainData.js' );
	const { Colliders } = await import( '../src/world/Colliders.js' );
	const { Player } = await import( '../src/player/Player.js' );
	const terrain = new TerrainData();
	const colliders = new Colliders();
	const query = { n: 0, allocate( name, n ) { const s = this.n; this.n += n; return s; }, setPoint() {}, cpu: new Float32Array( 64 ), cpuValid: false, resultInputs: new Float32Array( 64 ), points: new Float32Array( 64 ), version: 0, resultTime: 0, latency: 0 };
	const keys = new Set();
	const input = { down: ( k ) => keys.has( k ), hit: () => false, look: { x: 0, y: 0 }, wheel: 0, locked: false };
	const camera = new E.PerspectiveCamera( 62, 1.5, 0.1, 100 );
	const mk = () => new Player( { camera, input, terrain, colliders, query, boat: null } );
	const p = mk();
	p.position.set( 0, 10, 0 ); p.yaw = 0; p.pitch = 0; p.grounded = true;
	const feet = p.position.clone();
	// no wall: the arm is the full length
	for ( let i = 0; i < 60; i ++ ) p.springArm( 1 / 60, feet, null );
	const free = camera.position.distanceTo( p.armPivot );
	ok( Math.abs( free - 4.2 ) < 0.2, `with nothing behind, the arm is ${ free.toFixed( 2 ) } m (4.2)` );
	// a solid wall 2 m behind the pivot (the camera looks along -z, so it hangs at +z)
	colliders.addBox( new E.Vector3( 0, 11, 2.2 ), new E.Vector3( 3, 2, 0.1 ), 0, { solid: true } );
	for ( let i = 0; i < 60; i ++ ) p.springArm( 1 / 60, feet, null );
	const walled = camera.position.distanceTo( p.armPivot );
	ok( walled < 2.2 && walled > 1.2, `a wall 2.2 m behind stops the arm at ${ walled.toFixed( 2 ) } m` );
	colliders.boxes.length = 0;
	// a sprint reaches out ~0.7 m and eases back
	p.sprinting = true;
	for ( let i = 0; i < 180; i ++ ) p.springArm( 1 / 60, feet, null );
	const sprint = camera.position.distanceTo( p.armPivot );
	ok( sprint > 4.6 && sprint < 5.1, `at a sprint the arm reaches ${ sprint.toFixed( 2 ) } m` );
	p.sprinting = false;
	for ( let i = 0; i < 180; i ++ ) p.springArm( 1 / 60, feet, null );
	ok( Math.abs( camera.position.distanceTo( p.armPivot ) - 4.2 ) < 0.1, 'and comes back when it ends' );
	// in the air the pivot's height follows more slowly than on the ground
	const rise = ( grounded ) => {

		p.grounded = grounded;
		p.mode = 'walk';
		for ( let i = 0; i < 60; i ++ ) p.springArm( 1 / 60, feet, null );
		const y0 = p.armPivot.y;
		feet.y += 1;
		p.springArm( 1 / 10, feet, null );
		const d = p.armPivot.y - y0;
		feet.y -= 1;
		return d;

	};
	const gnd = rise( true ), air = rise( false );
	ok( air < gnd * 0.75 && air > 0, `a jump moves the pivot ${ air.toFixed( 2 ) } m where a ground step moved it ${ gnd.toFixed( 2 ) } m` );

}

// ---- CameraFeel: the fov opens on a sprint
{

	const { CameraFeel } = await import( '../src/game/CameraFeel.js' );
	const E = await import( '../src/engine/index.js' );
	const camera = new E.PerspectiveCamera( 62, 1.5, 0.1, 100 );
	const app = { camera, settings: {}, player: { mode: 'walk', sprinting: true, velocity: { x: 0, z: 8.5 } }, ui: { s: { fov: 62 } } };
	const f = new CameraFeel( app );
	for ( let i = 0; i < 240; i ++ ) f.update( 1 / 60 );
	ok( camera.fov > 66 && camera.fov <= 68.01, `a full sprint opens the fov to ${ camera.fov.toFixed( 1 ) } (62 + 6)` );
	app.player.sprinting = false;
	for ( let i = 0; i < 300; i ++ ) f.update( 1 / 60 );
	ok( camera.fov === 62, 'and hands it back to the slider when it ends' );
	app.settings.reduceMotion = true;
	app.player.sprinting = true;
	for ( let i = 0; i < 240; i ++ ) f.update( 1 / 60 );
	ok( camera.fov === 62, 'reduce motion keeps the fov still' );

}

// ---- movement weight: a start takes longer than a stop
{

	const src = readFileSync( 'src/player/Player.js', 'utf8' );
	ok( src.includes( "const accel = ! this.grounded ? 2.5 : ! moving ? 18 : this.velocity.lengthSq() < 0.05 ? 9 : 12;" ), 'on foot: 9 from rest, 12 in motion, 18 to stop, 2.5 in the air' );

}

// ---- the root patch applies to a copy of the repo file
{

	const { apply } = await import( '../tools/polish/apply-patches.mjs' );
	const dir = mkdtempSync( join( tmpdir(), 'w24f-' ) );
	mkdirSync( join( dir, 'src', 'game' ), { recursive: true } );
	writeFileSync( join( dir, 'src', 'game', 'Game.js' ), readFileSync( 'src/game/Game.js' ) );
	writeFileSync( join( dir, 'package.json' ), readFileSync( 'package.json' ) );
	const r = apply( dir );
	ok( r.every( ( x ) => x[ 1 ] === 'ok' || x[ 1 ] === 'already applied' ), 'every anchor of tools/polish/apply-patches.mjs is found once: ' + r.map( ( x ) => x[ 1 ] ).join( ', ' ) );
	const out = readFileSync( join( dir, 'src', 'game', 'Game.js' ), 'utf8' );
	ok( out.includes( "Nothing bites this close in" ), 'the surf cast says nothing will bite' );

}

console.log( fails ? `${ fails } FAILED` : 'all ok' );
process.exit( fails ? 1 : 0 );
