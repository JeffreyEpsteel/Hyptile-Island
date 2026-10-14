// Wave 19E: every interior through the real renderer (the headless App on Dawn, as tools/visuals/capture.mjs). Boots the
// game, installs the interiors feature (until install.js carries it), walks the player into each room and writes a PNG
// from the player's indoor camera, at night (the room's own lamps) and, with --day, at noon.
//
//   node tools/interiors/shots.mjs --dawn=<dir> [--out=<dir>] [--only=tidemark.tavern,...] [--frames=150] [--day] [--rain] [--profile=medium|phone]
import { installEnv } from '../perf/headless-env.mjs';
import { register } from 'node:module';
register( '../perf/stub-loader.mjs', import.meta.url );
import { pathToFileURL } from 'node:url';
// --loader=<file>: an extra module hook (a verification run with a patch served in place of a file)
{ const l = process.argv.find( ( x ) => x.startsWith( '--loader=' ) ); if ( l ) register( pathToFileURL( l.slice( 9 ) ).href ); }
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const arg = ( k, d = null ) => {

	const a = process.argv.find( ( x ) => x.startsWith( '--' + k + '=' ) );
	return a ? a.slice( k.length + 3 ) : d;

};

const [ W, H ] = arg( 'size', '1280x720' ).split( 'x' ).map( Number );
const profile = arg( 'profile', 'medium' );
const phone = profile === 'phone';
const out = resolve( arg( 'out', join( import.meta.dirname, 'out' ) ) );
const cache = resolve( arg( 'cache', join( tmpdir(), 'hyptile-visuals-images' ) ) );
const settle = Number( arg( 'frames', '150' ) );
mkdirSync( out, { recursive: true } );
mkdirSync( cache, { recursive: true } );
const search = '?bench&noAudio&quality=' + ( phone ? 'off' : profile ) + ( phone ? '&phone' : '' );
await installEnv( { search, width: W, height: H, power: 'high-performance', flags: [ 'backend=' + arg( 'backend', 'vulkan' ) ], dawnDir: arg( 'dawn' ) } );
if ( phone ) globalThis.__phoneBudget = { ...( await import( '../../src/core/Quality.js' ) ).PHONE_BUDGET };

const { decodePNG } = await import( '../../src/world/marine/WhaleTextures.js' );
let missing = 0;
globalThis.__assetImage = async ( bytes ) => {

	const u = bytes instanceof Uint8Array ? bytes : new Uint8Array( bytes );
	const h = createHash( 'sha1' ).update( u ).digest( 'hex' );
	const png = join( cache, h + '.png' );
	if ( existsSync( png ) ) {

		const b = readFileSync( png );
		return decodePNG( b.buffer.slice( b.byteOffset, b.byteOffset + b.byteLength ) );

	}

	if ( ! existsSync( join( cache, h + '.img' ) ) ) writeFileSync( join( cache, h + '.img' ), u );
	missing ++;
	return { data: new Uint8Array( 16 ).fill( 128 ), width: 2, height: 2 };

};

await import( '../../src/core/BenchSeed.js' );
const { App } = await import( '../../src/App.js' );
const { GPU } = await import( '../../src/engine/gpu/GPU.js' );
const { canvasPNG } = await import( '../perf/shot.mjs' );
const interiors = await import( '../../src/world/interiors/index.js' );
const { INTERIORS } = await import( '../../src/world/interiors/Rooms.js' );
const app = new App();
await app.init( () => {} );
const Q = await import( '../../src/core/Quality.js' );
app.quality = new Q.Quality( app, { storage: null, query: new URLSearchParams( '?quality=' + ( phone ? 'low' : profile ) ) } );
app.startSession( null, { mode: 'sandbox', restore: false, session: false } );
app.quality.apply();
if ( app.ui && app.ui.hide ) try { app.ui.hide(); } catch ( e ) { /* (no HUD in shots) */ }
const it = app.features.get( 'interiors' ) || app.features.add( 'interiors', interiors );
console.log( `${ missing } images not decoded yet; interiors bound: ${ it.rooms.list.map( ( r ) => r.id ).join() }` );
const only = arg( 'only' ) ? arg( 'only' ).split( ',' ) : INTERIORS.map( ( d ) => d.id );
const times = process.argv.includes( '--day' ) ? [ [ 'night', 21.5 ], [ 'day', 12 ] ] : [ [ 'night', 21.5 ] ];
const p = app.player;
p.setView( 'third' );
// --rain: a manual downpour (sandbox), eased in outdoors first: the shots show it stays outside
const WX = app.features.get( 'weather' );
if ( process.argv.includes( '--rain' ) && WX && WX.setManual && WX.setManual( 'rain', 1 ) ) {

	app.settings.timeSpeed = 0;
	for ( let i = 0; i < 1500; i ++ ) {

		app.frame( 1 / 60 );
		if ( ( i & 15 ) === 15 ) await GPU.queue.onSubmittedWorkDone();

	}

	console.log( `rain eased in: ${ WX.cur ? WX.cur.rain.toFixed( 2 ) : '?' } (outdoors, drawn ${ WX.rain ? WX.rain.density.toFixed( 2 ) : '-' })` );

}
for ( const id of only ) {

	for ( const [ tag, hour ] of times ) {

		app.settings.timeOfDay = hour;
		app.settings.timeSpeed = 0;
		const s = it.enter( id );
		if ( ! s ) { console.log( 'no room ' + id ); continue; }
		// look in from the doorway side toward the back of the room, a little down
		p.pitch = - 0.18;
		for ( let i = 0; i < settle; i ++ ) {

			app.frame( 1 / 60 );
			if ( ( i & 7 ) === 7 ) await GPU.queue.onSubmittedWorkDone();
			if ( i === 30 ) it.enter( id ); // (once loaded: the room's furniture colliders are in)

		}

		await GPU.queue.onSubmittedWorkDone();
		const room = it.rooms.byId.get( id );
		const file = join( out, `${ profile }-${ id }-${ tag }.png` );
		await canvasPNG( GPU, file );
		console.log( `${ file } inside=${ it.inside ? it.inside.id : '-' } loaded=${ room.loaded } group=${ !! room.group } tris=${ room.triangles ?? 0 } lights=${ app.localLights.active } rain=${ WX && WX.cur ? WX.cur.rain.toFixed( 2 ) : '-' } drawn=${ WX && WX.rain ? ( WX.rain.mesh.visible ? WX.rain.density.toFixed( 2 ) : 'hidden' ) : '-' } cam=${ app.camera.position.toArray().map( ( v ) => v.toFixed( 2 ) ).join() }` );

	}

}

process.exit( 0 );
