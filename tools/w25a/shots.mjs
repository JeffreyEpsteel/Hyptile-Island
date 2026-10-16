// Wave 25A: the reference shots for shadows, LOD and the shore (the same boot as tools/visuals/capture.mjs, real
// textures from its decoded image cache, the HUD hidden). Each view sets the time, the place and settles, then writes
// <out>/<tag>-<view>.png.
//
//   node tools/w25a/shots.mjs --dawn=<dir> [--out=<dir>] [--tag=after] [--only=start,shore] [--size=1280x720]
//                             [--profile=medium|low|phone] [--frames=120] [--eval=<js with app>] [--alt=<js>] [--alt-undo=<js>]
import { installEnv } from '../perf/headless-env.mjs';
import { register } from 'node:module';
register( '../perf/stub-loader.mjs', import.meta.url );
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const arg = ( k, d = null ) => {

	const a = process.argv.find( ( x ) => x.startsWith( '--' + k + '=' ) );
	return a ? a.slice( k.length + 3 ) : d;

};

// start: the first-start spot on the beach (WORLD.start), the totem and its lantern string, the bay and the horizon
// beyond; startBack: the same spot facing the palms (their shadows over the player); shore: the waterline at the start
// beach looking along it; horizon: a free camera over the start beach toward the far props (pop-in distance)
const FEET = `
	const p = app.player.position;
	app.setFreeCam( true );
	app.fly.setPose( app.fly.camera.position.clone().set( p.x + 1.7, p.y + 1.5, p.z + 1.7 ), Math.PI / 4, - 0.62 );`;

export const VIEWS = {
	start: { time: 12, place: { kind: 'walk', x: 169, z: - 68.29, heading: 2.25 } },
	startLate: { time: 16.5, place: { kind: 'walk', x: 169, z: - 68.29, heading: 2.25 } },
	startBack: { time: 15.5, place: { kind: 'walk', x: 169, z: - 68.29, heading: 2.25 + Math.PI } },
	shore: { time: 12, place: { kind: 'walk', x: 150, z: - 40, heading: 2.6 } },
	shoreLow: { time: 12, place: { kind: 'fly', pose: { x: 140, y: 1.9, z: - 30, yaw: 2.3, pitch: - 0.18 } } },
	horizon: { time: 12, place: { kind: 'fly', pose: { x: 165, y: 2.4, z: - 64, yaw: 1.05, pitch: - 0.02 } } },
	village: { time: 12, place: { kind: 'fly', pose: { x: 170, y: 3, z: - 60, yaw: 1.4, pitch: - 0.03 } } },
	// the swash at the start beach from head height, along the shore both ways (the foam band, the wet sand at the edge)
	swashA: { time: 12, place: { kind: 'fly', pose: { x: 150, y: 1.7, z: - 40, yaw: 1.5, pitch: - 0.22 } } },
	swashB: { time: 12, place: { kind: 'fly', pose: { x: 150, y: 1.7, z: - 40, yaw: 3.7, pitch: - 0.22 } } },
	swashLate: { time: 17.2, place: { kind: 'fly', pose: { x: 150, y: 1.7, z: - 40, yaw: 3.7, pitch: - 0.18 } } },
	// the village from the sea at ~290 m and ~400 m (where the distance culls used to cut props in and out)
	farBay: { time: 12, place: { kind: 'fly', pose: { x: 120, y: 6, z: 220, yaw: 0.15, pitch: - 0.02 } } },
	farBay2: { time: 12, place: { kind: 'fly', pose: { x: 120, y: 6, z: 330, yaw: 0.15, pitch: - 0.02 } } },
	// the player's feet on the sand from a free camera 2.4 m off (the contact shadow, the shadow's edge): noon and afternoon
	feet: { time: 12.5, place: { kind: 'walk', x: 163, z: - 62, heading: 2.25 }, late: FEET },
	feetLate: { time: 16.2, place: { kind: 'walk', x: 163, z: - 62, heading: 2.25 }, late: FEET },
	// the player under a 3 m slab 4 m up (a shadow the figure must take: A-CLASS 5.1 "palms cast no shadow on the player")
	slab: { time: 12.5, place: { kind: 'walk', x: 163, z: - 62, heading: 2.25 }, late: FEET + `
		const E = globalThis.__E, L = app.atmosphere.sunDir.value;
		const slab = new E.Mesh( new E.BoxGeometry( 3, 0.2, 3 ), new globalThis.__Material( { name: 'w25a-slab', color: 0x777777 } ) );
		slab.castShadow = true;
		slab.position.set( p.x + L.x / L.y * 3.2, p.y + 3.2, p.z + L.z / L.y * 3.2 );
		slab.position.y += 0;
		app.scene.add( slab );` },
	// the player in the shadow of the palm nearest the start (its crown 7 m up, the shadow cast away from the sun)
	palm: { time: 13.5, place: { kind: 'walk', x: 169, z: - 68.29, heading: 2.25 }, eval: `
		const P = app.vegetation.palms.inst; let best = 0, bd = 1e9;
		for ( let i = 0; i < P.count; i ++ ) { const d = Math.hypot( P.px[ i ] - 175, P.pz[ i ] + 60 ); if ( d < bd ) { bd = d; best = i; } }
		app.updateSun();
		const L = app.atmosphere.sunDir.value || app.atmosphere.sunDir, k = 6.5 / Math.max( 0.2, L.y );
		const x = P.px[ best ] - L.x * k, z = P.pz[ best ] - L.z * k;
		app._placePlayer( x, app.terrainData.heightAt( x, z ) + 0.1, z, Math.atan2( L.x, L.z ) );
		console.log( '  palm at', P.px[ best ].toFixed( 1 ), P.pz[ best ].toFixed( 1 ), 'player at', x.toFixed( 1 ), z.toFixed( 1 ) );`, late: FEET.replace( '+ 1.5', '+ 1.2' ).replace( '- 0.62', '- 0.35' ) },
};

const [ W, H ] = arg( 'size', '1280x720' ).split( 'x' ).map( Number );
const profile = arg( 'profile', 'medium' );
const phone = profile === 'phone';
const tier = phone ? 'low' : profile;
const out = resolve( arg( 'out', join( import.meta.dirname, 'out' ) ) );
const tag = arg( 'tag', 'shot' );
const cache = resolve( arg( 'cache', join( tmpdir(), 'hyptile-visuals-images' ) ) );
const only = arg( 'only' ) ? arg( 'only' ).split( ',' ) : Object.keys( VIEWS );
const settle = Number( arg( 'frames', '120' ) );
mkdirSync( out, { recursive: true } );
mkdirSync( cache, { recursive: true } );

const search = '?bench&noAudio&quality=' + ( phone ? 'off' : tier ) + ( phone ? '&phone' : '' );
await installEnv( { search, width: W, height: H, power: 'high-performance', flags: [ 'backend=vulkan' ], dawnDir: arg( 'dawn' ) } );
if ( phone ) globalThis.__phoneBudget = { ...( await import( '../../src/core/Quality.js' ) ).PHONE_BUDGET };

const { decodePNG } = await import( '../../src/world/marine/WhaleTextures.js' );
const { capImage } = await import( '../../src/engine/gpu/Texture.js' );
if ( phone ) globalThis.__assetImageCap = globalThis.__phoneBudget.textureMax;
let missing = 0;
globalThis.__assetImage = async ( bytes ) => {

	const u = bytes instanceof Uint8Array ? bytes : new Uint8Array( bytes );
	const h = createHash( 'sha1' ).update( u ).digest( 'hex' );
	const png = join( cache, h + '.png' );
	if ( existsSync( png ) ) {

		const b = readFileSync( png );
		const img = await decodePNG( b.buffer.slice( b.byteOffset, b.byteOffset + b.byteLength ) );
		return globalThis.__assetImageCap ? capImage( img, globalThis.__assetImageCap ) : img;

	}

	if ( ! existsSync( join( cache, h + '.img' ) ) ) writeFileSync( join( cache, h + '.img' ), u );
	missing ++;
	return { data: new Uint8Array( 16 ).fill( 128 ), width: 2, height: 2 };

};

await import( '../../src/core/BenchSeed.js' );
const { App } = await import( '../../src/App.js' );
const { GPU } = await import( '../../src/engine/gpu/GPU.js' );
const { setupScenario } = await import( '../perf/runner.js' );
const { canvasPNG } = await import( '../perf/shot.mjs' );
globalThis.__E = await import( '../../src/engine/index.js' ); // (the engine's classes for --eval / --alt statements)
globalThis.__Material = ( await import( '../../src/engine/render/Material.js' ) ).Material;
const gpuErrors = [];
GPU.onError( ( e ) => gpuErrors.push( e ) );

const t0 = performance.now();
const app = new App();
await app.init( () => {} );
if ( app.compiled ) await app.compiled;
console.log( `init ${ ( ( performance.now() - t0 ) / 1000 ).toFixed( 1 ) } s, ${ missing } images not decoded yet` );
const Q = await import( '../../src/core/Quality.js' );
if ( phone ) {

	app.quality = new Q.Quality( app, { storage: null, query: new URLSearchParams( '' ), mobile: Q.MOBILE.phone } );
	app.quality.loop.auto = false;

} else app.quality = new Q.Quality( app, { storage: null, query: new URLSearchParams( '?quality=' + tier ) } );
app.startSession( null, { mode: 'sandbox', restore: false, session: false } );
app.quality.apply();
if ( app.ui && app.ui.hide ) try { app.ui.hide(); } catch ( e ) { /* (no HUD in shots) */ }
const evalCode = arg( 'eval' ) ? new Function( 'app', arg( 'eval' ) ) : null;
const altCode = arg( 'alt' ) ? new Function( 'app', arg( 'alt' ) ) : null;
const altUndo = arg( 'alt-undo' ) ? new Function( 'app', arg( 'alt-undo' ) ) : null;

for ( const id of only ) {

	const v = VIEWS[ id ];
	if ( ! v ) { console.log( 'unknown view ' + id ); continue; }
	const set = await setupScenario( app, { id, name: id, ships: [], fire: null, peers: 0, intensity: 0, weather: 'clear', ...v } );
	if ( v.eval ) new Function( 'app', v.eval )( app );
	if ( evalCode ) evalCode( app );
	const n = v.frames || settle;
	for ( let i = 0; i < n; i ++ ) {

		set.tick( 1 / 60, i / 60 );
		// late: a statement once the player has landed (two thirds in), e.g. the free camera on the feet
		if ( v.late && i === Math.floor( n * 0.66 ) ) new Function( 'app', v.late )( app );
		app.frame( 1 / 60 );
		if ( ( i & 7 ) === 7 ) await GPU.queue.onSubmittedWorkDone();

	}

	await GPU.queue.onSubmittedWorkDone();
	await canvasPNG( GPU, join( out, `${ tag }-${ id }.png` ) );
	// --alt=<js>: the same view again after a second statement (A / B in one boot), written as <tag>-<view>-alt.png
	if ( altCode ) {

		altCode( app );
		for ( let i = 0; i < 24; i ++ ) { set.tick( 1 / 60, ( n + i ) / 60 ); app.frame( 1 / 60 ); }
		await GPU.queue.onSubmittedWorkDone();
		await canvasPNG( GPU, join( out, `${ tag }-${ id }-alt.png` ) );
		if ( altUndo ) altUndo( app );

	}

	set.undo();
	console.log( `  ${ id }` );

}

if ( gpuErrors.length ) console.log( `${ gpuErrors.length } GPU errors, first: ${ JSON.stringify( gpuErrors[ 0 ] ).slice( 0, 400 ) }` );
const pending = readdirSync( cache ).filter( ( f ) => f.endsWith( '.img' ) && ! existsSync( join( cache, f.replace( '.img', '.png' ) ) ) );
if ( pending.length ) {

	console.log( `decoding ${ pending.length } images (run again for real textures)` );
	console.log( execFileSync( 'powershell', [ '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join( import.meta.dirname, '..', 'visuals', 'decode-images.ps1' ), '-Dir', cache, '-Max', '1024' ], { encoding: 'utf8' } ).trim() );

}

process.exit( gpuErrors.length ? 1 : 0 );
