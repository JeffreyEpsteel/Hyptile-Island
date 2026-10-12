import './core/BenchSeed.js';
import { installErrorLog } from './core/ErrorLog.js';
installErrorLog(); // the in-game error log (F8) catches everything from here on
import { crewCodeFromLocation } from './net/NetClient.js';
import { App } from './App.js';
import { UI } from './ui/UI.js';
import { AppUI } from './ui/AppUI.js';
import { MainMenu } from './ui/MainMenu.js';
import { PauseMenu, MENU_FLAG } from './ui/PauseMenu.js';
import { isMode } from './game/GameMode.js';

// ?bench (and ?bg) run in background tabs too (automation, hidden panes): rAF does not fire in a hidden page
if ( /[?&](bench|bg)\b/.test( location.search ) ) {

	const raf = window.requestAnimationFrame.bind( window ), caf = window.cancelAnimationFrame.bind( window );
	window.requestAnimationFrame = ( cb ) => {

		if ( document.visibilityState === 'hidden' ) return setTimeout( () => cb( performance.now() ), 16 );
		// an occluded window reports 'visible' but Chrome never fires rAF: a timer takes over after 120 ms
		let done = false, tm = 0;
		const id = raf( ( t ) => { if ( done ) return; done = true; clearTimeout( tm ); cb( t ); } );
		tm = setTimeout( () => { if ( done ) return; done = true; caf( id ); cb( performance.now() ); }, 120 );
		return id;

	};
	window.cancelAnimationFrame = ( id ) => ( clearTimeout( id ), caf( id ) );

}

const ui = new UI();
const app = new App();
window.__ui = ui;

app.init( ( p, text, until ) => ui.setLoading( p, text, until ) ).then( async () => {

	app.ui = new AppUI( app, ui );
	ui.setLoading( 1, 'Ready' );
	await ui.hideLoader();
	// the main menu (the mode, then the slot) before the start overlay; Esc in game opens the pause menu
	app.menu = new MainMenu( { ui, app } );
	app.pauseMenu = new PauseMenu( { ui, app } );
	// ?nomenu, ?bench and ?bg skip the menu so automation works (Pause > Main menu still brings it back)
	let forceMenu = false;
	try {

		forceMenu = sessionStorage.getItem( MENU_FLAG ) === '1';
		sessionStorage.removeItem( MENU_FLAG );

	} catch ( e ) { /* no session storage */ }

	if ( app.qs.has( 'bench' ) || ( /[?&](nomenu|bg)(?![A-Za-z0-9_])/.test( location.search ) && ! forceMenu ) ) {

		// no menu: the slot that is loaded is played, nothing is snapshotted or autosaved (automation must not touch the player's
		// saves). ?mode=sandbox|campaign|multiplayer picks the mode: the sandbox for ?bench and ?fly (the free camera), the
		// multiplayer for ?mp / ?server, else the campaign
		const q = app.qs.get( 'mode' );
		const mode = isMode( q ) ? q : app.qs.has( 'bench' ) || app.qs.has( 'fly' ) ? 'sandbox' : app.pendingServer ? 'multiplayer' : 'campaign';
		app.startSession( null, { mode, restore: false, session: false } );

	} else {

		// a crew link (?crew=abcdef or the code in the path) goes straight to the multiplayer slots
		const crew = crewCodeFromLocation();
		app.startSession( await app.menu.show( crew ? { mode: 'multiplayer', step: 'slots' } : undefined ) );

	}

	// frame-time benchmark and reference shots (see core/Bench.js): it drives the frames itself
	if ( app.qs.has( 'bench' ) ) {

		window.__bench = new ( await import( './core/Bench.js' ) ).Bench( app );
		// ?bench&perf=all|naval|storm|night|crowd: the all-features scenario runner (tools/perf)
		if ( app.qs.has( 'perf' ) ) window.__job = ( await import( '../tools/perf/runner.js' ) ).runPerf( app, { scenarios: app.qs.get( 'perf' ), bench: window.__bench, tag: app.qs.get( 'tag' ) || 'perf', url: 'http://127.0.0.1:5190/' } );
		if ( app.qs.has( 'auto' ) ) window.__job = window.__bench.auto( app.qs.get( 'auto' ), { runs: Number( app.qs.get( 'runs' ) ) || 1 } );
		// ?bench&shots=view1,view2[&tag=name][&dt=seconds][&seq=n&every=frames]: reference shots of the named views only (core/DebugViews.js; dt > 0: the clock runs, e.g. for the eased lens flare)
		// &wdbg=N: the water shader's debug view (WaterMaterial debugMode) in the shots
		if ( app.qs.has( 'wdbg' ) && app.waterMaterial ) app.waterMaterial.debugMode.value = Number( app.qs.get( 'wdbg' ) );
		if ( app.qs.has( 'shots' ) ) window.__job = window.__bench.shots( app.qs.get( 'shots' ).split( ',' ), { tag: app.qs.get( 'tag' ) || 'shot', dt: Number( app.qs.get( 'dt' ) ) || 0, seq: Number( app.qs.get( 'seq' ) ) || 1, every: Number( app.qs.get( 'every' ) ) || 1 } );

	} else app.start();
	ui.showStartOverlay( () => {

		app.input.requestLock();
		if ( app.audio ) app.audio.resume();

	} );

} ).catch( ( e ) => {

	console.error( e );
	ui.setLoadingError( 'Something went wrong: ' + e.message );

} );
