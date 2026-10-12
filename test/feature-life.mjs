// Plain-node test of the life cues (src/features/life): the reactive gulls (cast / strike / miss / catch / stow, read
// from the game's rod, fight and bite edges and the events), puddles that fill in the rain and dry after it on real
// heightmap sites, footprints on the sand only, chimney smoke through the VFX API with its glow lights, the Pons
// laundry, the registry integration. No GPU.
// usage: node test/feature-life.mjs
globalThis.location = globalThis.location || { search: '' };
const { Features } = await import( '../src/features/Features.js' );
const life = await import( '../src/features/life/index.js' );
const { GullFlock } = await import( '../src/features/life/GullCues.js' );
const { Puddles, Footprints, puddleSites, onSand, FILL_SECONDS, DRY_SECONDS } = await import( '../src/features/life/Decals.js' );
const { Chimneys, chimneySites, smokeRate } = await import( '../src/features/life/Chimneys.js' );
const { laundrySites, Laundry } = await import( '../src/features/life/Laundry.js' );
const { TerrainData } = await import( '../src/world/TerrainData.js' );
const { Colliders } = await import( '../src/world/Colliders.js' );
const { WORLD } = await import( '../src/world/WorldLayout.js' );
const { Vector3 } = await import( '../src/engine/index.js' );

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};
let seed = 99;
const rng = () => ( seed = ( Math.imul( seed, 1664525 ) + 1013904223 ) >>> 0 ) / 4294967296;
const T = new TerrainData();

// ---- the flock
{

	const f = new GullFlock( { count: 8, rng } );
	f.anchor( 50, 0 );
	for ( let i = 0; i < 300; i ++ ) f.step( 0.05 );
	ok( f.birds.every( ( b ) => b.y > 5 && Math.hypot( b.x - 50, b.z ) < 120 ), 'idle: soaring over the player' );
	const bob = { x: 60, y: 0, z: 30 };
	f.cue( 'cast', bob );
	const fol = f.birds.filter( ( b ) => b.state === 'follow' );
	ok( fol.length >= 2 && fol.length <= 3, `cast: ${ fol.length } birds come to the bobber` );
	for ( let i = 0; i < 400; i ++ ) f.step( 0.05 );
	const dists = fol.map( ( b ) => Math.hypot( b.x - bob.x, b.z - bob.z ) );
	ok( dists.every( ( d ) => d < 16 ) && fol.every( ( b ) => b.y < 14 ), `followers circle low over it (${ dists.map( ( d ) => d.toFixed( 0 ) ).join( ', ' ) } m)` );
	f.cue( 'strike', bob );
	ok( fol.every( ( b ) => b.state === 'scatter' ), 'strike: the splash scatters them' );
	for ( let i = 0; i < 30; i ++ ) f.step( 0.05 );
	ok( fol.every( ( b ) => Math.hypot( b.x - bob.x, b.z - bob.z ) > dists[ 0 ] - 2 || b.y > 10 ) && fol.every( ( b ) => b.flap > 0.5 ), 'they burst away, wings beating' );
	for ( let i = 0; i < 160; i ++ ) f.step( 0.05 );
	ok( fol.some( ( b ) => b.state === 'follow' ), 'with the line still out they drift back' );
	f.cue( 'miss' );
	ok( f.birds.every( ( b ) => b.state !== 'follow' ), 'miss: the followers give up' );
	for ( let i = 0; i < 100; i ++ ) f.step( 0.05 );
	ok( f.birds.every( ( b ) => b.state === 'idle' ), 'and go back to soaring' );
	f.cue( 'catch', { x: 52, y: 2, z: 2 } );
	ok( f.birds.some( ( b ) => b.state === 'swoop' ), 'catch: one swoops for scraps' );
	let low = 99;
	for ( let i = 0; i < 120; i ++ ) { f.step( 0.05 ); for ( const b of f.birds ) if ( Math.hypot( b.x - 52, b.z - 2 ) < 6 ) low = Math.min( low, b.y ); }
	ok( low < 7, `it comes down low past the catch (${ low.toFixed( 1 ) } m)` );
	f.anchor( 2000, 2000 );
	ok( f.birds.every( ( b ) => Math.hypot( b.x - 2000, b.z - 2000 ) < 200 ), 'sailing far away: the flock rejoins over the new spot' );
	ok( f.birds.every( ( b ) => Number.isFinite( b.x + b.y + b.z + b.bank + b.flap ) ), 'all finite' );

}

// ---- cues from the game state (registry)
{

	const rod = { state: 'idle', bobber: new Vector3( 60, 0, 30 ), get lineInWater() { return [ 'floating', 'fighting', 'retrieving', 'flying', 'landing' ].includes( this.state ); } };
	const game = { rod, fight: null, bite: null, toast() {} };
	const app = {
		mode: 'campaign', settings: { timeOfDay: 10 },
		scene: { children: [], add( o ) { this.children.push( o ); }, remove() {} },
		camera: { position: new Vector3( 55, 3, 20 ) }, cameraWaterHeight: 0,
		player: { position: new Vector3( 55, 2.3, 20 ), mode: 'walk' },
		terrainData: T, colliders: new Colliders(), game,
	};
	const features = new Features( app );
	const smoke = [];
	features.add( 'vfx', { install: () => ( { smoke: ( ...a ) => smoke.push( a ) } ) } );
	const L = features.add( 'life', { install: ( a, f ) => new life.Life( a, f, { rng } ) } );
	ok( L.lights.length === 2 && L.lights.every( ( l ) => l.position && l.color && l.enabled === false ), 'the chimney glows exist at install (for LocalLights), off' );
	const run = ( s, dt = 0.05 ) => { for ( let k = 0; k < s / dt; k ++ ) features.update( dt ); };
	run( 0.5 );
	ok( L.built && L.gulls.mesh && app.scene.children.includes( L.gulls.mesh ), 'built on the third frame: the gull mesh is in the scene' );
	const c = L.gulls.flock.cues;
	rod.state = 'flying'; run( 0.2 ); rod.state = 'floating'; run( 0.2 );
	ok( c.cast === 1, 'rod floating: a cast cue' );
	game.bite = { phase: 'take' }; run( 0.1 ); game.bite = { phase: 'wait' }; run( 0.1 );
	ok( c.miss === 1, 'bite take -> wait (it ran): a miss' );
	features.emit( 'strikeMissed' );
	ok( c.miss === 2, 'strikeMissed: a miss' );
	game.bite = null; game.fight = { state: 'fighting' }; rod.state = 'fighting'; run( 0.1 );
	ok( c.strike === 1, 'a fight starts: a strike' );
	features.emit( 'fishCaught', { species: 'cod', kg: 2 } );
	game.fight = null; rod.state = 'idle'; run( 0.1 );
	ok( c.catch === 1 && c.stow === 1, 'caught, then the line in: catch and stow' );
	ok( L.gulls.mesh.visible && L.gulls.gA.array.every( Number.isFinite ), 'drawn by day with finite instance data' );
	app.settings.timeOfDay = 23; run( 0.1 );
	ok( ! L.gulls.mesh.visible, 'they roost at night' );
	ok( L.laundry && L.laundry.triangles > 50, `Pons laundry built (${ L.laundry ? L.laundry.triangles : 0 } triangles)` );
	ok( L.puddles && L.puddles.sites.length >= 10, `puddle sites found (${ L.puddles ? L.puddles.sites.length : 0 })` );
	const st = L.stats();
	ok( st.gulls && st.puddles && st.footprints && st.chimneys, 'stats for every part' );
	L.dispose();

}

// ---- puddles
{

	const centres = [ { x: WORLD.village.center.x, z: WORLD.village.center.z, r: 70 } ];
	const sites = puddleSites( T, new Colliders(), { centres, rng } );
	ok( sites.length >= 15, `${ sites.length } puddle sites near the village` );
	ok( sites.every( ( s ) => s.y > 2 && Math.hypot( s.nx, s.nz ) <= 0.07 ), 'all on flat ground above the beach' );
	const C = new Colliders();
	C.addBox( new Vector3( centres[ 0 ].x, T.heightAt( centres[ 0 ].x, centres[ 0 ].z ) + 2, centres[ 0 ].z ), new Vector3( 30, 3, 30 ), 0, { tag: 'house' } );
	const s2 = puddleSites( T, C, { centres: [ { ...centres[ 0 ], r: 25 } ], rng } );
	ok( s2.length === 0, 'nothing under a building' );
	const p = new Puddles( sites );
	p.update( 1, 0 );
	ok( ! p.mesh.visible && p.wet === 0, 'dry: hidden' );
	for ( let i = 0; i < FILL_SECONDS; i ++ ) p.update( 1, 0.8 );
	ok( p.wet > 0.95 && p.mesh.visible, `steady rain fills them (${ p.wet.toFixed( 2 ) })` );
	for ( let i = 0; i < DRY_SECONDS / 2; i ++ ) p.update( 1, 0 );
	ok( p.wet > 0.3 && p.wet < 0.7, 'half dry after half the drying time' );
	for ( let i = 0; i < DRY_SECONDS; i ++ ) p.update( 1, 0 );
	ok( p.wet === 0 && ! p.mesh.visible, 'dried out' );

}

// ---- footprints
{

	// a beach point: walk inland from the sea at x = 0 until the sand is 0.5 - 2.5 m up
	let z0 = 0;
	for ( let z = 0; z > - 120; z -= 0.5 ) { const h = T.heightAt( 0, z ); if ( h > 0.8 && h < 2.0 ) { z0 = z; break; } }
	ok( z0 < 0, `beach found at z ${ z0 }` );
	const C = new Colliders();
	ok( onSand( T, C, 0, T.heightAt( 0, z0 ), z0 ), 'on the sand there' );
	ok( ! onSand( T, C, 40, T.heightAt( 40, - 130 ), - 130 ), 'not up in the village' );
	ok( ! onSand( T, C, 0, T.heightAt( 0, z0 ) + 2, z0 ), 'not while standing on a deck above it' );
	const f = new Footprints( { capacity: 16 } );
	const player = { position: new Vector3( - 10, 0, z0 ), mode: 'walk' };
	for ( let x = - 10; x <= 10; x += 0.1 ) {

		player.position.set( x, T.heightAt( x, z0 ), z0 );
		f.update( 0.05, { player, terrain: T, colliders: C, rain: 0 } );

	}

	ok( f.count >= 24 && f.count <= 30, `a 20 m walk leaves ${ f.count } prints (stride ${ 0.72 } m)` );
	ok( f.geometry.instanceCount === 16, 'the ring holds the last 16' );
	const A = f.fA.array;
	ok( Math.abs( A[ 2 ] - A[ 6 ] ) > 0.15, 'left and right of the walking line' );
	player.mode = 'boat';
	const n = f.count;
	f.update( 0.05, { player, terrain: T, colliders: C } );
	ok( f.count === n, 'no prints from a boat' );
	f.update( 200, { player: null } );
	ok( f.alive() === 0, 'they fade away' );

}

// ---- chimneys
{

	const C = new Colliders();
	C.addBox( new Vector3( 16, 10, - 130 ), new Vector3( 0.36, 4, 0.41 ), 0, { tag: 'chimney' } );
	C.addBox( new Vector3( 30, 11, - 149 ), new Vector3( 0.36, 4, 0.41 ), 0, { tag: 'chimney' } );
	C.addBox( new Vector3( 0, 1, 0 ), new Vector3( 1, 1, 1 ), 0, { tag: 'house' } );
	const sites = chimneySites( C );
	ok( sites.length === 2 && Math.abs( sites[ 0 ].y - 14.4 ) < 1e-6, 'chimney sites from the tagged colliders (stack tops)' );
	ok( smokeRate( 7 ) > smokeRate( 13 ) && smokeRate( 19 ) > smokeRate( 13 ) && smokeRate( 13, 'rain' ) > smokeRate( 13 ), 'more smoke at breakfast, supper and in the rain' );
	const puffs = [];
	const ch = new Chimneys( { sites, vfx: () => ( { smoke: ( ...a ) => puffs.push( a ) } ), rng } );
	for ( let i = 0; i < 100; i ++ ) ch.update( 0.1, { camera: { position: new Vector3( 20, 5, - 120 ) }, hour: 19, kind: 'clear', night: 0 } );
	ok( puffs.length > 10 && puffs.every( ( a ) => a.length === 7 && a[ 5 ] === 1 ), `${ puffs.length } puffs through vfx.smoke( x, y, z, strength, 0, 1, 0 )` );
	ok( ch.lights.every( ( l ) => ! l.enabled ), 'no glow by day' );
	ch.update( 0.1, { camera: { position: new Vector3( 20, 5, - 120 ) }, hour: 23, night: 1 } );
	ok( ch.lights.every( ( l ) => l.enabled && l.intensity > 1 ), 'at night the flues glow' );
	const n = puffs.length;
	for ( let i = 0; i < 50; i ++ ) ch.update( 0.1, { camera: { position: new Vector3( 900, 5, 900 ) }, hour: 19 } );
	ok( puffs.length === n && ch.lights.every( ( l ) => ! l.enabled ), 'nothing far from the camera' );
	const none = new Chimneys( { sites, vfx: () => null } );
	none.update( 1, { camera: { position: new Vector3( 20, 5, - 120 ) } } );
	ok( none.puffs === 0, 'no VFX set: quietly nothing' );

}

// ---- laundry
{

	const sites = laundrySites( T );
	ok( sites.length >= 1 && sites.every( ( s ) => Math.hypot( s.a[ 0 ] - s.b[ 0 ], s.a[ 2 ] - s.b[ 2 ] ) > 3 ), `${ sites.length } lines beside the Pons huts` );
	const l = new Laundry( sites );
	const sw = l.geometry.attributes.aSway.array;
	let moving = 0;
	for ( let i = 2; i < sw.length; i += 3 ) if ( sw[ i ] > 0 && sw[ i - 2 ] > 0.5 ) moving ++;
	ok( moving > 10, 'cloth hems swing, the top is pinned' );

}

// ---- rain by surface and wind up the mast (weather/WeatherAudio.js, owned by this package)
{

	const { WeatherAudio, surfaceMix } = await import( '../src/features/weather/WeatherAudio.js' );
	ok( surfaceMix( null ).ground === 1 && surfaceMix( {} ).aloft === 0, 'no player: all ground, nothing aloft' );
	const P = WORLD.pier;
	const deckApp = { terrainData: T, player: { mode: 'walk', position: new Vector3( P.x, P.deckHeight, 20 ) } };
	const dm = surfaceMix( deckApp );
	ok( dm.wood === 1 && dm.ground === 0 && dm.water > 0.3, `on the pier: wood, and the sea around (water ${ dm.water.toFixed( 2 ) })` );
	const sm = surfaceMix( { player: { mode: 'swim', position: new Vector3( 0, 0, 50 ) } } );
	ok( sm.water === 1 && sm.ground === 0, 'swimming: the water' );
	const sail = surfaceMix( { player: { mode: 'deck', position: new Vector3( 0, 3, 200 ) }, game: { state: { boat: 'brigantine' } } } );
	const motor = surfaceMix( { player: { mode: 'boat', position: new Vector3( 0, 1, 200 ) }, game: { state: { boat: 'launch' } } } );
	ok( sail.sails === 1 && sail.canvas > 0.5 && sail.aloft > motor.aloft && motor.sails === 0 && motor.canvas === 0, 'aboard a brigantine: canvas overhead and the wind up the mast; a launch has none' );
	const roof = surfaceMix( { terrainData: T, player: { mode: 'walk', position: new Vector3( 40, T.heightAt( 40, - 130 ), - 130 ) } }, 1 );
	ok( roof.canvas > 0.5 && roof.ground < 0.5, 'under a roof: the drum overhead' );
	// the graph: a stand-in context
	class Param { constructor( v ) { this.value = v; } setTargetAtTime( v ) { this.value = v; } setValueAtTime( v ) { this.value = v; } linearRampToValueAtTime() {} exponentialRampToValueAtTime() {} }
	class Node { constructor() { this.gain = new Param( 1 ); this.frequency = new Param( 350 ); this.Q = new Param( 1 ); } connect( n ) { return n; } disconnect() {} start() {} stop() {} }
	const ctx = { currentTime: 1, sampleRate: 8000, destination: {}, createGain: () => new Node(), createBiquadFilter: () => new Node(), createOscillator: () => new Node(), createBufferSource: () => new Node(), createBuffer: ( c, n, sr ) => { const d = new Float32Array( n ); return { length: n, duration: n / sr, getChannelData: () => d }; } };
	const app = { audio: { ctx, ambAbove: new Node(), muted: false }, player: { mode: 'deck', position: new Vector3( 0, 3, 200 ) }, game: { state: { boat: 'sloop' } } };
	const wa = new WeatherAudio( app );
	for ( let i = 0; i < 30; i ++ ) wa.update( 0.11, { rain: 0.9, wind: 18, danger: 0.8, shelter: 0 } );
	const n = wa.n;
	ok( n && n.wood.gain.value > 0.02 && n.canvas.gain.value > 0.03 && n.water.gain.value > 0.005, 'raining on a sloop: drops on the deck, the canvas and the sea' );
	ok( n.whistle.gain.value > 0.005 && n.flap.gain.value > 0.02, 'fresh wind aboard: the rigging whistles and the sail flaps' );
	const howlAloft = n.howl.gain.value;
	app.player = { mode: 'walk', position: new Vector3( 0, 1, - 60 ) };
	app.terrainData = T;
	for ( let i = 0; i < 5; i ++ ) wa.update( 0.11, { rain: 0.9, wind: 18, danger: 0.8, shelter: 0 } );
	ok( n.howl.gain.value < howlAloft && n.flap.gain.value === 0 && n.canvas.gain.value === 0, 'ashore on the beach: a lower howl, no flapping, no canvas' );
	wa.dispose();

}

console.log( fails ? `\n${ fails } life check(s) FAILED` : '\nall life checks passed' );
process.exit( fails ? 1 : 0 );
