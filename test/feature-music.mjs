// Plain-node test of the music director (wave 26C, src/features/music): the tracks are web-ready files, the selection table,
// the hysteresis (night latch, tavern distance, combat debounce and hold, dwell, shore), the lazy loading (nothing fetched
// until wanted, nothing while muted), the crossfade, the voice ducking and the real signals the feature reads.
// usage: node test/feature-music.mjs
globalThis.location = globalThis.location || { search: '' };
const { readFileSync, existsSync, statSync, readdirSync } = await import( 'node:fs' );
const { fileURLToPath } = await import( 'node:url' );
const { join, dirname } = await import( 'node:path' );
const root = join( dirname( fileURLToPath( import.meta.url ) ), '..' );

const M = await import( '../src/features/music/index.js' );
const { Music, MusicPlayer, Selector, TRACKS, TRACK_NAMES, TUNE, pick, locate, DUCK_DEPTH, TRIM } = M;

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};

// ---------------------------------------------------------------------------------------------- the files

const dir = join( root, 'public/audio/music' );
ok( TRACK_NAMES.length === 6, 'six tracks' );
let total = 0, allThere = true;
for ( const n of TRACK_NAMES ) {

	const p = join( dir, TRACKS[ n ].file );
	if ( ! existsSync( p ) ) { allThere = false; console.log( 'missing', p ); continue; }
	const s = statSync( p ).size;
	total += s;
	const head = readFileSync( p ).subarray( 0, 4 ).toString( 'latin1' );
	if ( head !== 'OggS' ) { allThere = false; console.log( 'not an OGG', n ); }
	if ( s < 500000 || s > 2.5e6 ) { allThere = false; console.log( 'odd size', n, s ); }

}

ok( allThere, 'every track is an OGG between 0.5 and 2.5 MB' );
ok( total < 11e6, `all tracks ${ ( total / 1e6 ).toFixed( 1 ) } MB (under 11 MB)` );
ok( ! readdirSync( dir ).some( ( f ) => f.endsWith( '.mp3' ) ), 'no unused MP3 masters in public' );

// ---------------------------------------------------------------------------------------------- the table

ok( pick( { menu: true, combat: true, night: 1 } ).track === 'menu-theme', 'the menu beats everything' );
ok( pick( { island: 'home' } ).track === 'island-day', 'home island by day: island-day' );
ok( pick( { island: 'pons' } ).track === 'island-day', 'a small island by day: island-day' );
ok( pick( { island: 'sea' } ).track === 'sailing', 'at sea: sailing' );
ok( pick( { island: 'home', flying: true } ).track === 'sailing', 'flying: sailing' );
ok( pick( { island: 'home', boat: true } ).track === 'sailing', 'in a boat: sailing' );
ok( pick( { island: 'home', tavernInside: true } ).track === 'tavern', 'inside a tavern: tavern' );
ok( pick( { island: 'home', tavernInside: true } ).track === 'tavern' && pick( { island: 'tidemark', tavernNear: true } ).track === 'island-day', 'near a tavern by day: still the day track' );
ok( pick( { island: 'tidemark', tavernNear: true, night: true } ).track === 'tavern', 'near a tavern at night: tavern' );
ok( pick( { island: 'meridian', dusk: true } ).track === 'meridian-night', 'Meridian at dusk or night: meridian-night' );
ok( pick( { island: 'meridian' } ).track === 'island-day', 'Meridian by day: island-day' );
ok( pick( { island: 'meridian', dusk: true, flying: true } ).track === 'sailing', 'flying over Meridian at night: sailing' );
ok( pick( { island: 'home', night: true } ).track === null, 'the wild at night: silence' );
ok( pick( { island: 'sea', night: true } ).level < pick( { island: 'sea' } ).level, 'sailing is lower at night' );
ok( pick( { island: 'sea', combat: true } ).track === 'combat', 'combat: combat' );
ok( pick( { island: 'home', paused: true } ).level < 1, 'the pause menu lowers it' );

// ---------------------------------------------------------------------------------------------- hysteresis

const islands = [ { id: 'a', center: { x: 0, z: 0 }, radius: 100 }, { id: 'b', center: { x: 300, z: 0 }, radius: 50 } ];
ok( locate( 50, 0, islands, 'sea' ) === 'a' && locate( 150, 0, islands, 'sea' ) === 'sea', 'locate: inside / outside' );
ok( locate( 105, 0, islands, 'a' ) === 'a' && locate( 105, 0, islands, 'sea' ) === 'sea', 'locate: a 12% margin before leaving the shore' );

function run( sel, ctxFn, secs, dt = 0.25 ) {

	const seen = [];
	for ( let t = 0; t < secs; t += dt ) {

		const r = sel.step( ctxFn( sel.t + dt ), dt );
		if ( ! seen.length || seen[ seen.length - 1 ] !== r.track ) seen.push( r.track );

	}

	return seen;

}

{ // a combat blip is ignored, a real fight is debounced in and held out
	const s = new Selector();
	run( s, () => ( { island: 'home' } ), 3 );
	ok( s.current.track === 'island-day', 'starts on island-day' );
	let first = true;
	const blip = run( s, () => { const c = first; first = false; return { island: 'home', combat: c }; }, 2 );
	ok( ! blip.includes( 'combat' ), 'a 0.25 s combat blip does not switch the track' );
	let hits = 0;
	const fight = run( s, () => ( { island: 'home', combat: true } ), 3 );
	ok( fight.includes( 'combat' ), 'a sustained fight switches to combat' );
	const t0 = s.t;
	const after = run( s, () => ( { island: 'home', combat: false } ), TUNE.combatHold - 2 );
	ok( s.current.track === 'combat' && ! after.includes( 'island-day' ), `combat is held ${ TUNE.combatHold - 2 } s after the last signal` );
	const later = run( s, () => ( { island: 'home', combat: false } ), 8 );
	ok( later.includes( 'island-day' ) && s.t - t0 > TUNE.combatHold, 'then the calm track returns' );
	const flick = run( s, ( t ) => ( { island: 'home', combat: Math.floor( t ) % 4 === 0 } ), 40 );
	ok( flick.filter( ( x ) => x === 'combat' ).length <= 2, 'an on-off combat signal does not flicker: ' + flick.join( ',' ) );
	void hits;
}

{ // night latch: dusk wobble around the threshold changes nothing
	const s = new Selector();
	run( s, () => ( { island: 'home', night: 0.2 } ), 10 );
	ok( s.current.track === 'island-day', 'day on a small island' );
	const wob = run( s, ( t ) => ( { island: 'home', night: 0.5 + 0.12 * Math.sin( t * 3 ) } ), 30 );
	ok( wob.length <= 2, 'night factor wobbling between 0.38 and 0.62 switches at most once: ' + wob.join( ',' ) );
	run( s, () => ( { island: 'home', night: 0.9 } ), 12 );
	ok( s.current.track === null, 'the wild goes quiet at night' );
	run( s, () => ( { island: 'home', night: 0.9, tavernDist: 10 } ), 12 );
	ok( s.current.track === 'tavern', 'close to a tavern at night: tavern' );
	run( s, () => ( { island: 'home', night: 0.9, tavernDist: 27 } ), 12 );
	ok( s.current.track === 'tavern', 'tavern holds out to 32 m' );
	run( s, () => ( { island: 'home', night: 0.9, tavernDist: 40 } ), 12 );
	ok( s.current.track === null, 'and ends beyond it' );
}

{ // Meridian at dusk, then a stay of at least `dwell`
	const s = new Selector();
	run( s, () => ( { island: 'meridian', night: 0.1 } ), 3 );
	const seq = run( s, () => ( { island: 'meridian', night: 0.35 } ), 12 );
	ok( s.current.track === 'meridian-night' && seq.includes( 'meridian-night' ), 'Meridian at dusk: meridian-night' );
	const s2 = new Selector();
	run( s2, () => ( { island: 'home' } ), 1 );
	const t0 = s2.t;
	let switchedAt = null;
	for ( let i = 0; i < 80; i ++ ) { const r = s2.step( { island: 'sea' }, 0.25 ); if ( r.track === 'sailing' && switchedAt === null ) switchedAt = s2.t - t0; }
	ok( switchedAt !== null && switchedAt >= TUNE.settle - 0.01, `a new calm choice must be stable ${ TUNE.settle } s (took ${ switchedAt } s)` );
}

{ // menu and combat cut in at once
	const s = new Selector();
	run( s, () => ( { island: 'home' } ), 2 );
	s.step( { menu: true, island: 'home' }, 0.25 );
	ok( s.current.track === 'menu-theme', 'the menu cuts in at once' );
	s.step( { island: 'home' }, 0.25 );
	run( s, () => ( { island: 'home' } ), 2 );
	ok( s.current.track === 'island-day', 'and gives way after the settle time' );
}

// ---------------------------------------------------------------------------------------------- the player (fake audio)

class Param {

	constructor( v ) { this.value = v; this.ramps = []; }
	setValueAtTime( v ) { this.value = v; }
	cancelScheduledValues() {}
	linearRampToValueAtTime( v, t ) { this.ramps.push( { v, t } ); this.target = v; }

}

class Node {

	constructor( kind ) { this.kind = kind; this.to = null; this.stopped = false; }
	connect( d ) { this.to = d; return d; }
	disconnect() {}

}

class FakeCtx {

	constructor() { this.currentTime = 0; this.state = 'running'; this.destination = new Node( 'dest' ); this.sources = []; }
	createGain() { const n = new Node( 'gain' ); n.gain = new Param( 1 ); return n; }
	createBufferSource() { const n = new Node( 'source' ); n.start = ( t ) => { n.startedAt = t; this.sources.push( n ); }; n.stop = () => { n.stopped = true; }; return n; }
	decodeAudioData( ab, res ) { const b = { duration: 100, name: ab.name }; res( b ); return Promise.resolve( b ); }

}

function makeAudio( o = {} ) {

	const ctx = new FakeCtx();
	return { ctx, muted: false, enabled: true, vols: { master: 0.8, music: 1, sfx: 1, ambience: 1 }, music: new Node( 'music' ), master: new Node( 'master' ), getVolume( k ) { return this.vols[ k ]; }, ...o };

}

const fetched = [];
const fetchStub = ( url ) => {

	const name = url.split( '/' ).pop().replace( '.ogg', '' );
	fetched.push( name );
	return Promise.resolve( { ok: true, arrayBuffer: () => Promise.resolve( { name } ) } );

};

const tick = () => new Promise( ( r ) => setTimeout( r, 0 ) );

{
	const audio = makeAudio();
	const app = { audio };
	const p = new MusicPlayer( app, { fetchImpl: fetchStub, url: '/m/' } );
	p.update( 0.1 );
	await tick();
	ok( fetched.length === 0 && p.stats().loaded.length === 0, 'lazy: nothing is fetched until a track is wanted' );
	p.request( 'island-day', 1 );
	p.update( 0.1 );
	await tick();
	p.update( 0.1 );
	ok( fetched.length === 1 && fetched[ 0 ] === 'island-day', 'lazy: only the wanted track is fetched' );
	ok( p.stats().playing === 'island-day' && audio.ctx.sources.length === 1, 'it starts once decoded' );
	const first = p.cur;
	ok( first.src.loop === true && first.gain.to.to === audio.music, 'looped, into the music bus (audio.music), through the duck node' );
	const r = first.gain.gain.ramps.at( - 1 );
	ok( r && Math.abs( r.v - TRIM ) < 1e-9 && r.t >= 3 && r.t <= 4.1, `fades in over ${ r && r.t.toFixed( 2 ) } s` );

	// crossfade
	p.request( 'sailing', 1 );
	p.update( 0.1 );
	await tick();
	p.update( 0.1 );
	const out = first.gain.gain.ramps.at( - 1 );
	ok( out.v === 0 && out.t >= 3 && out.t <= 4.1, `the old track fades out over ${ out.t.toFixed( 2 ) } s` );
	ok( p.stats().playing === 'sailing' && p.stats().fading.includes( 'island-day' ), 'the new one fades in while the old one fades out (crossfade)' );
	ok( ! first.src.stopped, 'the old one still plays during the fade' );
	for ( let i = 0; i < 20; i ++ ) p.update( 0.25 );
	ok( first.src.stopped && p.stats().fading.length === 0, 'and is stopped after the fade' );
	ok( p.stats().loaded.length === 1 && p.stats().loaded[ 0 ] === 'sailing', 'only the playing buffer stays in memory' );

	// ducking
	const bus = p.duckNode.gain;
	p.update( 0.1, { duck: 1 } );
	ok( bus.target !== undefined && Math.abs( bus.target - DUCK_DEPTH ) < 1e-6, 'a voice line pulls the music down to ' + DUCK_DEPTH );
	const down = bus.ramps.at( - 1 );
	p.update( 0.1, { duck: 0 } );
	const up = bus.ramps.at( - 1 );
	ok( up.v === 1 && ( up.t - audio.ctx.currentTime ) > ( down.t - audio.ctx.currentTime ), 'it ducks fast and returns slowly' );

	// silence
	p.request( null );
	p.update( 0.1 );
	ok( p.stats().playing === null && p.stats().fading.includes( 'sailing' ), 'silence fades the track out' );
}

{ // no fetch while muted, suspended, the slider at zero or without audio
	fetched.length = 0;
	for ( const [ label, audio ] of [ [ 'muted', makeAudio( { muted: true } ) ], [ 'music slider 0', makeAudio( { vols: { master: 0.8, music: 0, sfx: 1, ambience: 1 } } ) ], [ 'master 0', makeAudio( { vols: { master: 0, music: 1, sfx: 1, ambience: 1 } } ) ], [ 'suspended', ( () => { const a = makeAudio(); a.ctx.state = 'suspended'; return a; } )() ] ] ) {

		const p = new MusicPlayer( { audio }, { fetchImpl: fetchStub } );
		p.request( 'tavern', 1 );
		p.update( 0.1 );
		await tick();
		ok( fetched.length === 0 && ! p.cur, `nothing fetched or played while ${ label }` );

	}

	const none = new MusicPlayer( { audio: null }, { fetchImpl: fetchStub } );
	none.request( 'tavern', 1 );
	none.update( 0.1 );
	ok( fetched.length === 0, 'no audio (?noAudio): a no-op' );

	// muting during play fades it out quickly; a failed fetch is retried only after 30 s
	const audio = makeAudio();
	const p = new MusicPlayer( { audio }, { fetchImpl: fetchStub } );
	p.request( 'combat', 1 );
	p.update( 0.1 ); await tick(); p.update( 0.1 );
	audio.muted = true;
	p.update( 0.1 );
	ok( ! p.cur && p.stats().fading.includes( 'combat' ), 'muting fades the track out' );
	let calls = 0;
	const bad = new MusicPlayer( { audio: makeAudio() }, { fetchImpl: () => { calls ++; return Promise.resolve( { ok: false, status: 404 } ); } } );
	bad.request( 'tavern', 1 );
	bad.update( 0.1 ); await tick();
	for ( let i = 0; i < 20; i ++ ) { bad.update( 0.2 ); await tick(); }
	ok( calls === 1 && bad.stats().failed.includes( 'tavern' ), 'a missing file is tried once, then left alone for 30 s' );
}

// ---------------------------------------------------------------------------------------------- the feature on the real signals

class Features {

	constructor() { this.map = new Map(); this.handlers = {}; }
	get( n ) { return this.map.get( n ) || null; }
	on( n, f ) { ( this.handlers[ n ] ||= [] ).push( f ); return () => {}; }
	emit( n, e ) { for ( const f of this.handlers[ n ] || [] ) f( e ); }

}

function world( over = {} ) {

	const audio = makeAudio();
	const features = new Features();
	const app = { audio, menuOpen: false, session: true, player: { position: { x: 0, y: 0, z: - 300 }, mode: 'walk' }, settings: { timeOfDay: 12 }, qs: new URLSearchParams( '' ), ...over };
	const music = new Music( app, features, { player: new MusicPlayer( app, { fetchImpl: fetchStub } ) } );
	return { app, features, music, audio };
}

const go = async ( w, secs ) => { for ( let t = 0; t < secs; t += 0.25 ) { w.music.update( 0.25 ); if ( t % 1 === 0 ) await tick(); } await tick(); w.music.update( 0.05 ); };

{
	const w = world( { menuOpen: true, session: false } );
	await go( w, 2 );
	ok( w.music.track === 'menu-theme', 'main menu (menuOpen, no session): menu-theme' );
	w.app.menuOpen = false; w.app.session = true;
	await go( w, 6 );
	ok( w.music.state().want === 'island-day', 'in the game on the home island by day: island-day' );
}

{
	const w = world();
	w.app.player.position = { x: - 2700, y: 0, z: - 300 }; // Meridian
	w.app.settings.timeOfDay = 22;
	w.features.map.set( 'night', { nightFactor: 1 } );
	await go( w, 10 );
	ok( w.music.state().ctx.island === 'meridian' && w.music.state().want === 'meridian-night', 'Meridian at night: meridian-night' );
	w.app.player.mode = 'plane';
	await go( w, 10 );
	ok( w.music.state().want === 'sailing', 'taking off from Meridian: sailing' );
}

{
	const w = world();
	w.app.player.position = { x: 1500, y: 0, z: 1500 };
	w.app.player.mode = 'boat';
	await go( w, 6 );
	ok( w.music.state().ctx.island === 'sea' && w.music.state().want === 'sailing', 'a boat at sea: sailing' );
	const pirate = { alive: true, faction: 'pirate', state: 'chase', x: 1600, z: 1500 };
	w.features.map.set( 'naval', { ships: [ pirate ] } );
	await go( w, 3 );
	ok( w.music.state().want === 'combat', 'a pirate in chase within 300 m: combat' );
	pirate.alive = false;
	await go( w, 8 );
	ok( w.music.state().want === 'combat', 'combat holds after the pirate is gone' );
	await go( w, 14 );
	ok( w.music.state().want === 'sailing', 'and sailing returns' );
	w.features.emit( 'cannonFired', { by: 'player' } );
	await go( w, 2 );
	ok( w.music.state().want === 'combat', 'the player firing the cannon: combat' );
}

{
	const w = world();
	let lvl = 0;
	w.features.map.set( 'cars', { policeLevel: () => lvl } );
	await go( w, 3 );
	ok( w.music.state().want === 'island-day', 'no wanted level: island-day' );
	lvl = 2;
	await go( w, 3 );
	ok( w.music.state().want === 'combat', 'a police chase: combat' );
}

{
	const w = world();
	const ships = new Map( [ [ 1, { alive: true, state: 'hunt', x: 100, z: - 300 } ] ] );
	let wanted = false;
	w.features.map.set( 'navy', { ships, isWanted: () => wanted } );
	await go( w, 3 );
	ok( w.music.state().want === 'island-day', 'a navy ship hunting while you are not wanted: no combat' );
	wanted = true;
	await go( w, 3 );
	ok( w.music.state().want === 'combat', 'a navy chase while wanted: combat' );
}

{
	const w = world();
	const df = { engaged: false };
	w.features.map.set( 'dogfight', df );
	await go( w, 3 );
	df.engaged = true;
	await go( w, 3 );
	ok( w.music.state().want === 'combat', 'a dogfight: combat' );
}

{
	const w = world();
	w.features.map.set( 'interiors', { inside: { def: { id: 'tidemark.tavern', service: 'tavern', style: 'tavern' } } } );
	await go( w, 4 );
	ok( w.music.state().want === 'tavern', 'inside a tavern interior: tavern' );
	const w2 = world();
	w2.app.player.position = { x: 0, y: 0, z: - 300 };
	w2.features.map.set( 'harbour', { sites: { tavern: [ { x: 10, z: - 300 } ] } } );
	w2.features.map.set( 'night', { nightFactor: 0.9 } );
	await go( w2, 14 );
	ok( w2.music.state().want === 'tavern', 'near a tavern at night: tavern' );
	w2.app.player.position = { x: 200, y: 0, z: - 300 };
	await go( w2, 14 );
	ok( w2.music.state().want === null, 'the wild at night: quiet' );
}

{ // voices duck the music
	const w = world();
	const voicesPlayer = { voices: new Map() };
	w.features.map.set( 'voices', { player: voicesPlayer, pending: [], time: 0 } );
	await go( w, 4 );
	const bus = w.music.player.duckNode.gain;
	ok( w.music.voiceDuck() === 0, 'no voice: no duck' );
	voicesPlayer.voices.set( 'x', [ { end: w.audio.ctx.currentTime + 3 } ] );
	w.music.update( 0.25 );
	ok( w.music.voiceDuck() === 1 && Math.abs( bus.target - DUCK_DEPTH ) < 1e-6, 'a speaking voice ducks the bus' );
	voicesPlayer.voices.clear();
	w.music.update( 0.25 );
	ok( bus.target === 1, 'and releases it after' );
}

{ // ?noMusic and a context that throws
	const w = world( { qs: new URLSearchParams( 'noMusic' ) } );
	await go( w, 4 );
	ok( w.music.off && w.music.track === null && fetched.length > 0 && w.music.player.stats().started === 0, '?noMusic: nothing plays' );
	const b = world();
	b.app.player = null;
	let threw = false;
	try { await go( b, 3 ); } catch ( e ) { threw = true; }
	ok( ! threw, 'a missing player does not throw' );
}

console.log( fails ? `\n${ fails } FAILED` : '\nmusic: all ok' );
process.exit( fails ? 1 : 0 );
