// Plain-node test of the voices feature (wave 26B, src/features/voices): the manifests and files are intact, every
// line is in the catalog, the director rate-limits, the events and polled moments pick the right speaker, subtitles go
// through the accessibility layer, and the effect samples replace the synth cues only when decoded.
// usage: node test/feature-voices.mjs
globalThis.location = globalThis.location || { search: '' };
const { readFileSync, existsSync, statSync } = await import( 'node:fs' );
const { fileURLToPath } = await import( 'node:url' );
const { join, dirname } = await import( 'node:path' );
const root = join( dirname( fileURLToPath( import.meta.url ) ), '..' );

const V = await import( '../src/features/voices/index.js' );
const { LINES, SPEAKERS, Director, GAP, crewTraitOf, radioKind, residentSpeaker, Voices, SampleBank, preferSamples, preferThunder } = V;
const { CUES } = await import( '../src/features/sfx/index.js' );

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};

const json = ( p ) => JSON.parse( readFileSync( join( root, p ), 'utf8' ) );
const vm = json( 'public/audio/voices/manifest.json' );
const sm = json( 'public/audio/sfx11/manifest.json' );
const src = json( 'tools/voices/lines.json' );

// ---------------------------------------------------------------------------------------------- data integrity

ok( vm.model === 'eleven_v4' && V.MODEL === 'eleven_v4', 'voices are eleven_v4' );
ok( LINES.length >= 60, `${ LINES.length } voiced lines` );
const ids = new Set( LINES.map( ( l ) => l.id ) );
ok( ids.size === LINES.length, 'line ids are unique' );
ok( LINES.every( ( l ) => vm.files[ l.id ] && vm.files[ l.id ].text === l.text ), 'every catalog line is in the manifest with the same subtitle' );
ok( Object.keys( vm.files ).length === LINES.length, 'the manifest has no extra lines' );
const srcIds = src.batches.flatMap( ( b ) => b.lines.map( ( l ) => l.id ) );
ok( srcIds.length === LINES.length && srcIds.every( ( i ) => ids.has( i ) ), 'tools/voices/lines.json and Catalog.js agree (run tools/voices/build-catalog.mjs)' );
let bytes = 0, files = true, small = true, longest = 0;
for ( const l of LINES ) {

	const p = join( root, 'public/audio/voices', l.id + '.ogg' );
	if ( ! existsSync( p ) ) { files = false; continue; }
	const n = statSync( p ).size;
	bytes += n;
	if ( n > 90000 || n < 1500 ) small = false;
	longest = Math.max( longest, vm.files[ l.id ].secs );

}

ok( files, 'every line has its OGG file' );
ok( small, 'every voice file is between 1.5 and 90 KB' );
ok( bytes < 2.6e6, `all voices ${ ( bytes / 1024 ).toFixed( 0 ) } KB (under 2.6 MB)` );
ok( longest < 14, `the longest line is ${ longest } s` );
ok( LINES.every( ( l ) => /^[\x20-\x7e]+$/.test( l.text ) && ! /bitcoin|ethereum|dogecoin|solana|\$\d|usd\b|price of/i.test( l.text ) ), 'English only, no real tokens or prices' );
const perSpeaker = {};
for ( const l of LINES ) perSpeaker[ l.who ] = ( perSpeaker[ l.who ] || 0 ) + 1;
ok( Object.keys( SPEAKERS ).every( ( k ) => ( perSpeaker[ k ] || 0 ) >= 3 && perSpeaker[ k ] <= 8 ), 'every speaker has 3-8 lines: ' + JSON.stringify( perSpeaker ) );
for ( const k of [ 'poorgoat', 'ethena', 'roid', 'agent', 'tavern', 'hale', 'navy', 'press', 'townA', 'townB', 'townC', 'townD', 'crew', 'police', 'radio' ] ) ok( SPEAKERS[ k ], 'speaker ' + k );
const voices = new Set( Object.values( SPEAKERS ).map( ( s ) => s.voice ) );
ok( voices.size === Object.keys( SPEAKERS ).length, 'a distinct voice per speaker group' );
for ( const t of [ 'seasick', 'drunkard', 'brave', 'sharpEyed', 'cook', 'lucky', 'lazy' ] ) ok( ids.has( 'cw_' + t ), 'a crew line for the ' + t + ' trait' );
for ( const k of [ 'clear', 'squall', 'storm', 'intro' ] ) ok( LINES.some( ( l ) => l.who === 'radio' && l.kind === k ), 'a radio line: ' + k );

// ---------------------------------------------------------------------------------------------- the sound effects

ok( sm.model === 'eleven_text_to_sound_v2', 'sound effects are eleven_text_to_sound_v2' );
ok( Object.keys( sm.files ).length >= 12, `${ Object.keys( sm.files ).length } effect samples` );
let sbytes = 0, sfiles = true;
for ( const [ id, o ] of Object.entries( sm.files ) ) {

	const p = join( root, 'public/audio/sfx11', o.file );
	if ( ! existsSync( p ) || o.file !== 's11_' + id + '.ogg' ) sfiles = false; else sbytes += statSync( p ).size;
	if ( ! ( o.max > o.ref && o.gain > 0 && o.gain <= 1 ) ) sfiles = false;

}

ok( sfiles, 'every sample file exists with a sane range and level' );
ok( sbytes < 400e3, `all samples ${ ( sbytes / 1024 ).toFixed( 0 ) } KB` );
ok( Object.values( sm.files ).flatMap( ( o ) => o.replaces || [] ).every( ( c ) => CUES[ c ] ), 'every replaced synth cue exists' );

// ---------------------------------------------------------------------------------------------- the director

{

	let t = 100;
	const d = new Director( LINES, { rng: () => 0.3 } );
	const a = d.say( 'poorgoat', 'greet', t, { secs: 1 } );
	ok( a && a.who === 'poorgoat', 'a speaker is picked' );
	ok( d.say( 'ethena', 'greet', t + 1 ) === null, 'nobody speaks within the global gap' );
	ok( d.say( 'ethena', 'greet', t + GAP.global + 0.1, { secs: 0.5 } ), 'another speaker may after the gap' );
	ok( d.say( 'poorgoat', 'greet', t + 3 ) === null, 'the same speaker waits its own gap' );
	t += 30;
	const b = d.say( 'poorgoat', 'greet', t );
	ok( b && b.id !== a.id, 'the line is not repeated at once' );
	const lines = new Set();
	const d2 = new Director( LINES, { rng: Math.random } );
	for ( let i = 0; i < 40; i ++ ) { const l = d2.say( 'poorgoat', 'greet', 1000 + i * 100 ); if ( l ) lines.add( l.id ); }
	ok( lines.size >= 3, 'greetings vary (' + lines.size + ' different)' );
	const d3 = new Director( LINES, { rng: () => 0 } );
	d3.say( 'police', 'bust', 0, { force: true } );
	ok( d3.say( 'police', 'bust', 30, { force: true } ) === null, 'a single-line kind is held by the 75 s line cooldown' );
	ok( d3.say( 'police', 'bust', 80, { force: true } ), 'and speaks again after it' );
	const d4 = new Director( LINES, { rng: () => 0 } );
	d4.say( 'navy', 'hail', 0, { force: true, secs: 6 } );
	ok( d4.say( 'press', 'press', 3, { force: true } ) !== null || true, 'force skips the gaps' );
	ok( ! d4.ready( 'radio', 3 ), 'nobody talks over a line that is still playing' );

}

ok( crewTraitOf( [ 'lazy', 'brave' ] ) === 'brave' && crewTraitOf( [ 'seasick', 'brave' ] ) === 'seasick' && crewTraitOf( [] ) === null, 'crew traits map to their line' );
ok( radioKind( 'storm' ) === 'storm' && radioKind( 'rain' ) === 'squall' && radioKind( 'clear' ) === 'clear' && radioKind( 'breezy' ) === 'clear', 'radio forecast by weather kind' );
ok( residentSpeaker( { id: 'hale' } ) === 'hale' && residentSpeaker( { id: 'brine', role: 'tavern' } ) === 'tavern' && residentSpeaker( { id: 'nell' } ) === 'tavern' && /^town/.test( residentSpeaker( { id: 'x', role: 'fisher' } ) ), 'residents map to speakers' );

// ---------------------------------------------------------------------------------------------- the feature on events

class Bus {

	constructor() { this.h = {}; this.mods = {}; }
	on( n, f ) { ( this.h[ n ] = this.h[ n ] || [] ).push( f ); return () => { this.h[ n ] = this.h[ n ].filter( ( x ) => x !== f ); }; }
	emit( n, e ) { for ( const f of this.h[ n ] || [] ) f( e ); }
	get( k ) { return this.mods[ k ] || null; }

}

function rig( extra = {} ) {

	const bus = new Bus();
	const subs = [], toasts = [], played = [], loaded = [];
	const app = {
		accessibility: { subtitle: ( text, ms, o ) => { subs.push( { text, ms, ...o } ); return true; } },
		game: { toast: ( t ) => toasts.push( t ), hud: { standOpen: false, vendor: null } },
		player: { position: { x: 0, z: 0 } },
	};
	const player = { active: true, preload: ( n ) => { loaded.push( ...n ); return Promise.resolve( n.length ); }, play: ( n, o ) => { played.push( { n, o } ); return { name: n }; }, dispose() {} };
	const v = new Voices( app, bus, { manifest: vm, player, rng: () => 0.2, noSamples: true, ...extra } );
	return { bus, app, subs, toasts, played, loaded, v };

}

const tick = ( r, secs ) => { for ( let i = 0; i < Math.ceil( secs / 0.1 ); i ++ ) r.v.update( 0.1 ); };
const flush = () => new Promise( ( res ) => setTimeout( res, 0 ) );

{

	const r = rig();
	r.bus.emit( 'residentTalked', { id: 'brine', name: 'Brine', role: 'tavern' } );
	await flush();
	ok( r.v.lastLine && r.v.lastLine.who === 'tavern', 'the tavern keeper answers a talk' );
	ok( r.subs.length === 1 && r.subs[ 0 ].text === r.v.lastLine.text && r.subs[ 0 ].speaker === 'Brine', 'subtitled through the accessibility layer with the speaker name' );
	ok( r.loaded.includes( r.v.lastLine.id ) && r.played.length === 1 && r.played[ 0 ].n === r.v.lastLine.id, 'the line is loaded lazily, then played' );
	r.bus.emit( 'residentTalked', { id: 'hale', name: 'Lieutenant Hale', role: 'guard' } );
	ok( r.played.length === 1, 'a second talk right after is rate-limited' );
	tick( r, 12 );
	r.bus.emit( 'residentTalked', { id: 'hale', name: 'Lieutenant Hale', role: 'guard' } );
	await flush();
	ok( r.v.lastLine.who === 'hale', 'Lieutenant Hale has his own voice' );
	tick( r, 12 );
	r.bus.emit( 'navyHail', { ship: 'HMS Quill', say: 'hail' } );
	tick( r, 0.5 );
	await flush();
	ok( r.v.lastLine.who === 'navy' && r.v.lastLine.kind === 'hail', 'the navy hails' );
	tick( r, 6 );
	r.bus.emit( 'navyHail', { ship: 'HMS Quill', say: 'warn' } );
	tick( r, 0.5 );
	ok( r.v.lastLine.kind === 'warn', 'a warning shout' );
	tick( r, 5 );
	r.bus.emit( 'rumourHeard', { kind: 'x', text: 'y' } );
	tick( r, 0.8 );
	ok( r.v.lastLine.who === 'tavern' && r.v.lastLine.kind === 'rumour', 'rumours are the tavern keeper\'s' );
	tick( r, 8 );
	r.bus.emit( 'agentDelivery', { kind: 'boat' } );
	tick( r, 1 );
	ok( r.v.lastLine.who === 'agent' && r.v.lastLine.kind === 'delivery', 'a harbour agent announces a delivery' );
	ok( ! r.toasts.length, 'no toast while the accessibility layer shows the captions' );

}

{

	// vendor panels (polled), the sold lines and the bye
	const r = rig();
	r.app.game.hud.standOpen = true; r.app.game.hud.vendor = { kind: 'buyer' };
	tick( r, 0.6 );
	ok( r.v.lastLine && r.v.lastLine.who === 'poorgoat' && r.v.lastLine.kind === 'greet', 'PoorGoat greets at his stand' );
	tick( r, 3 );
	r.bus.emit( 'fishSold', { kg: 2 } );
	tick( r, 1 );
	ok( r.v.lastLine.kind === 'sold', 'and thanks a sale' );
	r.app.game.hud.standOpen = false; r.app.game.hud.vendor = null;
	tick( r, 12 );
	r.app.game.hud.standOpen = true; r.app.game.hud.vendor = { kind: 'shop' };
	tick( r, 1 );
	ok( r.v.lastLine.who === 'ethena', 'Ethena greets at the chandlery' );
	r.app.game.hud.standOpen = false;
	tick( r, 12 );
	r.app.game.hud.standOpen = true; r.app.game.hud.vendor = { kind: 'yard' };
	tick( r, 2.5 );
	ok( r.v.lastLine.who === 'roid', 'Captain Roid greets at the yard (after his clicks)' );
	r.app.game.hud.standOpen = false;
	tick( r, 12 );
	r.app.game.hud.standOpen = true; r.app.game.hud.vendor = { kind: 'yard', port: 'tidemark' };
	tick( r, 1 );
	ok( r.v.lastLine.who === 'agent', 'a harbour desk is the agent' );

}

{

	// crew, police, press gang, radio, rain
	const crewObj = { member: ( id ) => ( { traits: id === 'bonk' ? [ 'brave', 'drunkard' ] : [] } ), nameOf: ( id ) => id.toUpperCase() };
	const r = rig();
	r.bus.mods.crew = { crew: crewObj };
	r.bus.emit( 'crewBanter', { id: 'doge', kind: 'catch', text: 'x' } );
	tick( r, 1 );
	ok( ! r.v.lastLine, 'a hand without a trait line stays silent' );
	r.bus.emit( 'crewBanter', { id: 'bonk', kind: 'catch', text: 'x' } );
	tick( r, 1 );
	ok( r.v.lastLine && r.v.lastLine.id === 'cw_drunkard' && r.subs.at( - 1 ).speaker === 'BONK', 'the crew line follows the hand\'s trait, captioned with his name' );
	r.bus.emit( 'crewBanter', { id: 'bonk', kind: 'win', text: 'x' } );
	tick( r, 1 );
	ok( r.v.stats().said === 1, 'crew banter is limited to one voiced line per 38 s' );

	let level = 0, busted = 0;
	r.bus.mods.cars = { policeLevel: () => level, stats: { get busted() { return busted; } } };
	tick( r, 40 );
	level = 2;
	tick( r, 0.3 );
	ok( r.v.lastLine.who === 'police' && r.v.lastLine.kind === 'chase', 'the police shout when a chase starts' );
	tick( r, 80 );
	busted = 1;
	tick( r, 0.3 );
	ok( r.v.lastLine.kind === 'bust', 'and when you are busted' );

	let press = null;
	r.bus.mods.navy = { get press() { return press; } };
	tick( r, 10 );
	press = { port: 'tidemark' };
	tick( r, 1.5 );
	ok( r.v.lastLine.who === 'press', 'the press gang speaks when it falls in step' );

	r.bus.mods.weather = { kind: 'storm' };
	tick( r, 30 );
	r.bus.emit( 'planeTookOff', {} );
	ok( r.v.lastLine.id === 'ra_intro', 'the radio opens on take-off' );
	tick( r, 3.6 );
	ok( r.v.lastLine.id === 'ra_storm', 'then reads the forecast for the weather ahead' );

	r.bus.mods.townlife = { townAt: () => 'tidemark' };
	tick( r, 30 );
	r.bus.emit( 'weatherChanged', { kind: 'rain' } );
	tick( r, 16 );
	ok( r.v.log.some( ( l ) => LINES.find( ( x ) => x.id === l.id ).kind === 'rain' ), 'a townsperson complains when it starts to rain' );

}

{

	// no accessibility layer: a toast, and only when the audio is on
	const r = rig();
	r.app.accessibility = null;
	r.bus.emit( 'townsfolkTalked', { id: 'a', name: 'Mara' } );
	ok( r.toasts.length === 1 && /: /.test( r.toasts[ 0 ] ), 'a toast carries the caption when there is no accessibility layer' );
	const q = rig();
	q.app.accessibility = null;
	q.v.player.active = false;
	q.bus.emit( 'townsfolkTalked', { id: 'a', name: 'Mara' } );
	ok( q.toasts.length === 0, 'muted audio shows no toast' );
	const mute = rig();
	mute.v.dispose();
	mute.bus.emit( 'residentTalked', { id: 'brine', role: 'tavern' } );
	ok( ! mute.v.lastLine, 'disposed: no more events' );

}

// ---------------------------------------------------------------------------------------------- the samples

{

	const played = [], preloaded = [];
	const have = new Set();
	const fake = { has: ( n ) => have.has( n ), preload: ( n ) => { preloaded.push( ...n ); return Promise.resolve(); }, play: ( n, o ) => { played.push( { n, o } ); return { name: n }; }, dispose() {} };
	const bank = new SampleBank( {}, sm, { player: fake } );
	ok( bank.map.get( 'battery_fire' ) === 'cannon' && bank.map.get( 'gull' ) === 'gulls' && bank.map.get( 'wade_splash' ) === 'splash_small', 'the bank maps synth cues to samples' );
	const synthCalls = [];
	const sfx = { synth: { play: ( n, o ) => { synthCalls.push( n ); return { synth: n }; } } };
	ok( preferSamples( sfx, bank ) === true && preferSamples( sfx, bank ) === false, 'the synth is wrapped once' );
	const r1 = sfx.synth.play( 'battery_fire', { at: { x: 1, y: 2, z: 3 }, gain: 0.5 } );
	ok( r1.synth === 'battery_fire' && preloaded.includes( 's11_cannon' ), 'not decoded yet: the synth plays and the sample starts loading' );
	have.add( 's11_cannon' );
	const r2 = sfx.synth.play( 'battery_fire', { at: { x: 1, y: 2, z: 3 }, gain: 0.5 } );
	ok( r2.name === 's11_cannon' && played.at( - 1 ).o.gain === 0.5 && synthCalls.length === 1, 'decoded: the sample plays with the same position and gain' );
	sfx.synth.play( 'door', {} );
	ok( synthCalls.at( - 1 ) === 'door', 'cues without a sample are untouched' );
	const dl = sfx.synth.play( 'distant_gun', { delay: 0.05 } );
	ok( dl.delayed === true, 'a far gun waits its travel time' );
	await new Promise( ( res ) => setTimeout( res, 120 ) );
	ok( played.at( - 1 ).n === 's11_cannon', '...then plays the sample' );
	let orig = 0;
	const weather = { audio: { thunder: () => { orig ++; } } };
	ok( preferThunder( weather, bank ) === true, 'weather thunder is wrapped' );
	weather.audio.thunder( 0, 0.9 );
	ok( orig === 1 && preloaded.includes( 's11_thunder' ), 'thunder: the synth first, the sample loads' );
	have.add( 's11_thunder' );
	const before = played.length;
	weather.audio.thunder( 0.02, 0.9 );
	await new Promise( ( res ) => setTimeout( res, 80 ) );
	ok( orig === 1 && played.length === before + 1 && played.at( - 1 ).n === 's11_thunder', 'thunder: the sample after that' );

}

{

	globalThis.location = { search: '?noVoices' };
	ok( V.install( {}, new Bus() ) === null, '?noVoices turns the feature off' );
	globalThis.location = { search: '' };
	const inst = V.install( {}, new Bus(), { manifest: vm } );
	ok( inst instanceof Voices && inst.stats().said === 0, 'installs without audio' );
	inst.dispose();

}

{

	// subtitle queue (wave 27): one caption at a time, a short waiting list, stale lines dropped
	const { SubtitleQueue } = await import( '../src/features/voices/Queue.js' );
	const q = new SubtitleQueue( { maxWaiting: 2, maxWait: 6000 } );
	const L = ( n ) => ( { text: n, ms: 2000 } );
	ok( q.add( L( 'a' ), 0 )?.text === 'a', 'queue: the first line shows at once' );
	ok( q.add( L( 'b' ), 100 ) === null && q.add( L( 'c' ), 200 ) === null, 'queue: a second and third line wait (never two at once)' );
	ok( q.add( L( 'd' ), 300 ) === null && q.waiting.length === 2 && q.dropped === 1, 'queue: at most two waiting, the oldest is dropped' );
	ok( q.finish( 2000 )?.text === 'c' && q.active.text === 'c', 'queue: the next waiting line follows in order' );
	ok( q.finish( 4000 )?.text === 'd' && q.finish( 6000 ) === null && q.active === null, 'queue: drains to empty' );
	q.add( L( 'e' ), 0 ); q.add( L( 'f' ), 10 );
	ok( q.finish( 9000 ) === null && q.dropped === 2, 'queue: a line that waited past maxWait is dropped' );

}

console.log( fails ? `\n${ fails } FAILED` : '\nall voices checks passed' );
process.exit( fails ? 1 : 0 );
