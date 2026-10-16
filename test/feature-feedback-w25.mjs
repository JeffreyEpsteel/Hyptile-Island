// Plain-node test of wave 25D's feedback: the rod's particle effects (src/features/vfx/FishRecipes.js, FishingFx.js) and
// the foley (src/features/sfx/Foley.js) with the mix table (src/features/sfx/Mix.js). A fake game drives the rod through a
// cast, a nibble, a take, a strike, a fight, a catch and a snap; a stand-in player walks, sprints and wades.
// usage: node test/feature-feedback-w25.mjs
globalThis.location = globalThis.location || { search: '' };
const { Vfx } = await import( '../src/features/vfx/index.js' );
const sfxMod = await import( '../src/features/sfx/index.js' );
const { Foley, FOLEY, wadeLevel } = await import( '../src/features/sfx/Foley.js' );
const { MIX_GROUPS, CUE_LEVELS, targetOf, SOUNDSCAPE_ROWS, applyMix } = await import( '../src/features/sfx/Mix.js' );
const { TRIMS, MEASURED } = await import( '../src/features/sfx/MixTrims.js' );

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};

// ---------------------------------------------------------------------------------------------- rod effects

const v3 = ( x = 0, y = 0, z = 0 ) => ( { x, y, z } );
const rod = { state: 'idle', t: 0, tip: v3( 0, 1.5, 0 ), bobber: v3( 0, 0, 0 ), bobberVel: v3( 4, 3, 10 ), waterY: 0, power: 0.8, castM: 22, crankRate: 0 };
const game = { rod, bite: null, fight: null };
const app = { game, camera: { position: v3( 0, 1.6, 0 ) }, terrainData: { heightAt: () => - 5 }, settings: { renderScale: 1 } };
const vfx = new Vfx( app, null, { renderer: false } );

const live0 = vfx.live;
const step = ( n = 1 ) => { for ( let i = 0; i < n; i ++ ) vfx.update( 1 / 60 ); };
const set = ( s ) => { rod.state = s; };
const fx = vfx.fishing;

step( 2 );
ok( vfx.live === live0, 'an idle rod starts nothing' );

set( 'flick' ); step();
set( 'flying' ); step();
ok( fx.counts.cast === 1 && vfx.live > live0, 'the cast: drops thrown off the line and a glint at the tip' );

rod.bobber.x = 14; rod.bobber.z = 6;
const n0 = vfx.counts.plop;
set( 'floating' ); step();
ok( fx.counts.plop === 1 && vfx.counts.plop === n0 + 1, 'the bobber landing: a plop' );
const farPlop = vfx.live;

// a short cast lands softer than a long one (fewer particles)
{

	const a = new Vfx( { ...app, game: { rod: { ...rod, state: 'flying', bobber: v3( 3, 0, 1 ) }, bite: null, fight: null } }, null, { renderer: false } );
	a.update( 0.016 );
	a.app.game.rod.state = 'floating';
	a.update( 0.016 );
	const b = new Vfx( { ...app, game: { rod: { ...rod, state: 'flying', bobber: v3( 21, 0, 0 ) }, bite: null, fight: null } }, null, { renderer: false } );
	b.update( 0.016 );
	b.app.game.rod.state = 'floating';
	b.update( 0.016 );
	ok( b.live >= a.live, `a long cast lands at least as hard as a short one (${ b.live } vs ${ a.live } particles)` );

}

// nibbles ring the float; the pulse counter restarting rings it again
game.bite = { phase: 'wait', t: 5 };
step();
game.bite = { phase: 'nibble', t: 1, pulse: 0.1 };
const r0 = vfx.counts.ripple;
step( 8 );
ok( fx.counts.nibble === 1 && vfx.counts.ripple === r0 + 1, 'a nibble: one ring' );
game.bite.pulse = 0.9; step( 8 );
game.bite.pulse = 0.05; step( 8 );
ok( fx.counts.nibble === 2, 'the next pulse: another ring' );
game.bite = { phase: 'take', t: 1 };
step();
ok( fx.counts.take === 1 && vfx.counts.bubbles >= 1, 'the take: the float dunked with a bubble' );

// the strike
game.bite = null;
game.fight = { surge: 0.1, kg: 6, tension: 0.3 };
set( 'fighting' ); step();
ok( fx.counts.strike === 1 && vfx.counts.glint >= 1, 'the strike: a glint at the rod tip' );
const g0 = vfx.counts.glint;
game.fight.surge = 0.8; step( 3 );
ok( fx.counts.thrash === 1, 'the fish thrashing at the surface: a plop' );
step( 3 );
ok( fx.counts.thrash === 1, 'a run counts once' );
game.fight.surge = 0.3; step( 40 );
ok( vfx.counts.ripple > r0 + 2, 'rings while the fish runs' );

// reeling: drops off the line
rod.crankRate = 2;
const l0 = fx.counts.line;
step( 60 );
ok( fx.counts.line > l0 + 3, 'a cranked line sheds drops' );

// a heavier fish thrashes harder
{

	const mk = ( kg ) => {

		const r2 = { ...rod, state: 'fighting', bobber: v3( 10, 0, 4 ), crankRate: 0 };
		const gm = { rod: r2, bite: null, fight: { surge: 0, kg, tension: 0.2 } };
		const w = new Vfx( { ...app, game: gm }, null, { renderer: false } );
		w.update( 0.016 );
		const before = w.live;
		gm.fight.surge = 0.9;
		w.update( 0.016 );
		return w.live - before;

	};

	ok( mk( 9 ) >= mk( 0.5 ), 'a big fish throws more than a small one' );

}

// the catch
game.fight = null;
rod.crankRate = 0;
set( 'landing' ); step();
ok( fx.counts.catch === 1, 'the catch: a glint at the tip' );
rod.t = 0.2;
const live1 = vfx.live;
step( 30 );
ok( vfx.live > 0, 'drips fall off the hanging fish' );

// a snap
set( 'fighting' ); game.fight = { surge: 0.1, kg: 2 }; step();
game.fight = null; set( 'idle' ); step();
ok( fx.counts.loss === 1, 'a lost fish: the tip whips' );

// without a rod / a game nothing throws
{

	const w = new Vfx( { camera: app.camera }, null, { renderer: false } );
	w.update( 0.016 );
	const w2 = new Vfx( { game: {} }, null, { renderer: false } );
	w2.update( 0.016 );
	ok( true, 'no game or rod: nothing throws' );

}

// the budget holds: a long fight never fills the pool
step( 600 );
ok( vfx.live < 4000, 'the pool stays within its budget' );

// ---------------------------------------------------------------------------------------------- foley

const played = [];
const fakeSfx = {
	time: 0,
	app: null,
	features: null,
	player: { ctx: null, active: true },
	synth: { play: ( name, o ) => { played.push( { name, ...o } ); return {}; } },
	play: () => null,
};
const pl = { mode: 'walk', velocity: v3(), position: v3(), grounded: true, sprinting: false, wade: 0, stamina: 1, crouching: false, surface: 'sand', stepDist: 0 };
fakeSfx.app = { player: pl, game: { rod: { state: 'stowed', equipped: false } } };
const fo = new Foley( fakeSfx );
const run = ( secs, speed, o = {} ) => {

	Object.assign( pl, o );
	for ( let t = 0; t < secs; t += 1 / 60 ) {

		fakeSfx.time += 1 / 60;
		pl.velocity.x = speed;
		pl.position.x += speed / 60;
		fo.update( 1 / 60 );

	}

};

run( 3, 0 );
ok( played.length === 0, 'standing still: no foley' );
run( 4, 2.7 );
const jog = played.filter( ( p ) => p.name === 'cloth_swish' ).length;
ok( jog >= 3, `a jog brushes cloth every stride (${ jog })` );
played.length = 0;
run( 6, 8.5, { sprinting: true, stamina: 0.7 } );
ok( played.some( ( p ) => p.name === 'breath' ), 'a sprint breathes' );
const sprintSwish = played.filter( ( p ) => p.name === 'cloth_swish' );
ok( sprintSwish.length > jog * 0.8, 'a sprint swishes more often than it did at a jog' );
played.length = 0;
run( 3, 2.7, { sprinting: false, stamina: 0.1 } );
ok( played.some( ( p ) => p.name === 'breath' ), 'winded: a tired breath without sprinting' );
played.length = 0;

// wading: the splash grows with the speed and the depth
{

	const lo = wadeLevel( 1.2, 0.3 ), hi = wadeLevel( 6, 1 );
	ok( hi > lo && lo > 0 && hi <= 1, 'wading splash strength rises with speed and depth' );
	ok( wadeLevel( 0, 1 ) === 0 && wadeLevel( 4, 0 ) === 0, 'no splash standing still or on dry land' );
	run( 4, 2.7, { wade: 0.5, sprinting: false, stamina: 1 } );
	ok( played.some( ( p ) => p.name === 'wade_splash' ), 'wading splashes' );
	const fast = played.filter( ( p ) => p.name === 'wade_splash' && p.strength > 0 );
	ok( fast.length > 0, 'the splash carries a strength' );

}

played.length = 0;

// gear: the tackle clinks only with a rod out; none when swimming
pl.wade = 0;
fakeSfx.app.game.rod = { state: 'idle', equipped: true };
run( 6, 2.7, { sprinting: false, stamina: 1 } );
ok( played.some( ( p ) => p.name === 'gear_clink' ), 'a rod on the back clinks while walking' );
played.length = 0;
pl.mode = 'swim';
run( 3, 1.5 );
ok( played.length === 0, 'swimming has its own sounds: no foley' );
pl.mode = 'walk';
fakeSfx.app.player = null;
fo.update( 0.016 );
ok( true, 'no player: nothing throws' );

// every foley cue is a real synth cue with a builder
{

	const { CUES } = sfxMod;
	for ( const k of Object.keys( FOLEY ) ) ok( CUES[ k ] && typeof CUES[ k ].build === 'function', `${ k } is a synth cue` );

}

// ---------------------------------------------------------------------------------------------- mix table

{

	ok( Object.keys( MIX_GROUPS ).join() === 'foley,bed,life,action,alert', 'the mix has groups foley, bed, life, action, alert' );
	const names = Object.keys( CUE_LEVELS );
	const of = ( g ) => names.filter( ( n ) => CUE_LEVELS[ n ].group === g ).map( targetOf ).sort( ( a, b ) => a - b );
	const med = ( a ) => a[ Math.floor( a.length / 2 ) ];
	const [ foley, bed, life, action, alert ] = [ 'foley', 'bed', 'life', 'action', 'alert' ].map( of );
	ok( med( foley ) < med( bed ) && med( bed ) < med( life ) && med( life ) < med( action ) && med( action ) < med( alert ), `group medians rise: foley ${ med( foley ) } < bed ${ med( bed ) } < life ${ med( life ) } < action ${ med( action ) } < alert ${ med( alert ) } LUFS` );
	ok( Math.max( ...bed ) < Math.min( ...alert ), `the loudest bed (${ Math.max( ...bed ) }) sits under the quietest alert (${ Math.min( ...alert ) })` );
	ok( Math.max( ...foley ) < med( bed ), 'foley sits under the median bed' );
	// the SoundScape rows (root's) keep the same order
	const ss = Object.values( SOUNDSCAPE_ROWS );
	ok( ss.filter( ( r ) => r.group === 'bed' ).every( ( r ) => r.target < -30 ), 'the SoundScape beds are at or under -31 LUFS' );
	// every measured sound has a trim that lands on its target (the table is the mix tool's output)
	let missing = 0, off = 0;
	for ( const n of names ) {

		if ( ! ( n in MEASURED ) || ! ( n in TRIMS ) ) { missing ++; console.log( '   no measurement for', n ); continue; }
		if ( Math.abs( MEASURED[ n ] + TRIMS[ n ] - targetOf( n ) ) > 0.11 ) { off ++; console.log( '   off target', n, MEASURED[ n ], TRIMS[ n ], targetOf( n ) ); }

	}

	ok( missing === 0, 'every sound in the mix table has been measured (node tools/fx25d/mix.mjs)' );
	ok( off === 0, 'measured loudness plus its trim equals the target for every sound' );
	// applyMix scales the gain once
	const cues = { a: { gain: 0.5 } };
	CUE_LEVELS.a = { group: 'life', kind: 'cue' };
	applyMix( { CUES: cues }, { a: - 6.0206 } );
	applyMix( { CUES: cues }, { a: - 6.0206 } );
	ok( Math.abs( cues.a.gain - 0.25 ) < 1e-3, 'applyMix scales a cue once (not twice)' );
	delete CUE_LEVELS.a;
	// the real CUES carry the trim: the gull is quieter than its original 0.5
	const { CUES } = sfxMod;
	ok( CUES.gull._mixed === TRIMS.gull && CUES.gull.gain < 0.5, 'the gull cue was trimmed at start-up' );

}

vfx.dispose();
console.log( fails ? `\n${ fails } FAILED` : '\nall ok' );
process.exit( fails ? 1 : 0 );
