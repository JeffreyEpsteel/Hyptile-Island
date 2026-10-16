// A multiplayer session must not freeze on alt-tab (user, 2026-10-16): Engine.start keeps the loop running on a timer while
// the tab is hidden when keepAlive() says so (App: an online session), the clock advances, and a throttled timer is caught
// up in steps of at most 0.1 s. Single player (keepAlive false) still holds still while hidden.
// node test/keepalive.mjs

let failed = 0;
const ok = ( c, msg ) => { console.log( `${ c ? 'ok  ' : 'FAIL' } ${ msg }` ); if ( ! c ) failed ++; };

// a minimal browser: a document whose visibility we set, rAF that never fires while hidden
const doc = { hidden: false, visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
globalThis.document = doc;
let rafs = [];
globalThis.requestAnimationFrame = ( cb ) => { rafs.push( cb ); return rafs.length; };
globalThis.cancelAnimationFrame = () => {};
const hide = ( h ) => { doc.hidden = h; doc.visibilityState = h ? 'hidden' : 'visible'; };

const { Engine } = await import( '../src/engine/Engine.js' );
const { Timer } = await import( '../src/engine/math/Timer.js' );
const sleep = ( ms ) => new Promise( ( r ) => setTimeout( r, ms ) );

const run = async ( keep ) => {

	rafs = [];
	hide( true );
	const clock = new Timer(); clock.connect( doc );
	const fake = { clock, frame: 0, keepAlive: () => keep };
	let calls = 0, sum = 0;
	Engine.prototype.start.call( fake, ( dt ) => { calls ++; sum += dt; } );
	await sleep( 400 );
	Engine.prototype.stop.call( fake );
	hide( false );
	return { calls, sum };

};

const online = await run( true );
ok( online.calls >= 4 && online.sum > 0.15, `online, hidden: the world keeps running (${ online.calls } updates, ${ online.sum.toFixed( 2 ) } s simulated in 0.4 s)` );
const solo = await run( false );
ok( solo.calls === 0, `single player, hidden: nothing runs while rAF is withheld (${ solo.calls } updates)` );

if ( failed ) { console.log( `${ failed } keepalive check(s) failed` ); process.exit( 1 ); }
console.log( 'all keepalive checks passed' );
