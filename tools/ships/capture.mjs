// Wave 24C: the ship and boat audit captures, headless on Dawn like tools/visuals/capture.mjs. Every vessel the player sees
// (naval's ships and the navy's through naval.spawn, the rescue's launch, the player's fleet hulls bought and moored) is put
// on the same patch of open sea, heading the same way, and shot from three angles (bow quarter, broadside, stern quarter) at
// noon and at golden hour. A `fleet` view puts twelve ships on screen at 60..520 m for the LOD / impostor check.
//
//   node tools/ships/capture.mjs --dawn=<dir> [--out=<dir>] [--profile=medium|phone] [--size=1280x720]
//        [--only=frigate,sloop,...] [--times=noon,golden] [--angles=bow,side,stern] [--frames=50]
// Writes <out>/<profile>-<vessel>-<time>-<angle>.png (and <profile>-fleet-<time>.png). --wind=<deg> holds the wind's direction
// (toward; 0 = -z, 90 = +x) for the sail and flag check; --tag=<s> adds a suffix to the file names.
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

const [ W, H ] = arg( 'size', '1280x720' ).split( 'x' ).map( Number );
const profile = arg( 'profile', 'medium' );
const phone = profile === 'phone';
const out = resolve( arg( 'out', join( import.meta.dirname, 'out', 'before' ) ) );
const cache = resolve( arg( 'cache', join( tmpdir(), 'hyptile-visuals-images' ) ) );
const settle = Number( arg( 'frames', '50' ) );
mkdirSync( out, { recursive: true } );
mkdirSync( cache, { recursive: true } );
await installEnv( { search: '?bench&noAudio&quality=' + ( phone ? 'off&phone' : profile ), width: W, height: H, power: 'high-performance', flags: [ 'backend=vulkan' ], dawnDir: arg( 'dawn' ) } );
if ( phone ) globalThis.__phoneBudget = { ...( await import( '../../src/core/Quality.js' ) ).PHONE_BUDGET };
const { decodePNG } = await import( '../../src/world/marine/WhaleTextures.js' );
const { capImage } = await import( '../../src/engine/gpu/Texture.js' );
if ( phone ) globalThis.__assetImageCap = globalThis.__phoneBudget.textureMax;
let missing = 0;
globalThis.__assetImage = async ( bytes ) => {

	const u = bytes instanceof Uint8Array ? bytes : new Uint8Array( bytes );
	const h = createHash( 'sha1' ).update( u ).digest( 'hex' );
	const png = join( cache, h + '.png' );
	let img = null;
	if ( existsSync( png ) ) { const b = readFileSync( png ); img = await decodePNG( b.buffer.slice( b.byteOffset, b.byteOffset + b.byteLength ) ); }
	else if ( u[ 0 ] === 0x89 && u[ 1 ] === 0x50 ) img = await decodePNG( u.buffer.slice( u.byteOffset, u.byteOffset + u.byteLength ) );
	if ( img ) return globalThis.__assetImageCap ? capImage( img, globalThis.__assetImageCap ) : img;
	if ( ! existsSync( join( cache, h + '.img' ) ) ) writeFileSync( join( cache, h + '.img' ), u );
	missing ++;
	return { data: new Uint8Array( 16 ).fill( 128 ), width: 2, height: 2 };

};

await import( '../../src/core/BenchSeed.js' );
const { App } = await import( '../../src/App.js' );
const { GPU } = await import( '../../src/engine/gpu/GPU.js' );
const { canvasPNG } = await import( '../perf/shot.mjs' );
const { SHIP_CLASSES } = await import( '../../src/features/naval/ShipClasses.js' );
const { BOATS } = await import( '../../src/game/Boats.js' );
const errors = [];
GPU.onError( ( e ) => errors.push( e ) );
const app = new App();
await app.init( () => {} );
console.log( `${ missing } images not decoded yet` );
const Q = await import( '../../src/core/Quality.js' );
app.quality = new Q.Quality( app, { storage: null, query: new URLSearchParams( '?quality=' + ( phone ? 'low' : profile ) ), mobile: phone ? Q.MOBILE.phone : undefined } );
if ( app.quality.loop ) app.quality.loop.auto = false;
app.startSession( null, { mode: 'sandbox', restore: false, session: false } );
app.quality.apply();
if ( app.ui && app.ui.hide ) try { app.ui.hide(); } catch ( e ) { /* no HUD */ }
if ( app.settings ) app.settings.timeSpeed = 0;
const w = app.features.get( 'weather' );
if ( w && w.setManual ) w.setManual( 'clear', 1 );

// --wind=<deg>: the direction the wind blows toward (0 = -z, 90 = +x), held for the shots (the sails and flags follow it)
const { G } = await import( '../../src/engine/render/Frame.js' );
const windDeg = arg( 'wind' );
const holdWind = () => {

	if ( windDeg === null ) return;
	if ( w && w.world && w.world.yielded ) w.world.yielded.add( 'windDir' ); // (the weather leaves the direction alone)
	const a = Number( windDeg ) * Math.PI / 180;
	G.windDir.value.set( Math.sin( a ), - Math.cos( a ) );

};
const nv = app.features.get( 'naval' );
nv.settings.autoSpawn = false;
// (the rescue feature teaches naval's ModelSet the procedural launch when it first needs one: here at once)
( await import( '../../src/world/boat/Launch.js' ) ).drawProcedural( nv.models );
const clearShips = () => { for ( let i = nv.ships.length - 1; i >= 0; i -- ) nv._removeShip( i ); };
clearShips();

// open water off the home island (the launch's sea in tools/visuals); the bow points east-north-east
const SEA = { x: 215, z: 285, yaw: 1.15 };
const TIMES = { noon: 12, golden: 17.6, dusk: 19.4, night: 22.5 };
const ANGLES = { bow: [ 38, 11 ], side: [ 90, 7 ], stern: [ 148, 13 ] }; // azimuth from the bow toward starboard, elevation (deg)
const SHIPS = [ 'trawler', 'sloop', 'brigantine', 'frigate', 'revenue', 'launch' ];
const FLEET = Object.keys( BOATS ).filter( ( k ) => BOATS[ k ].kind === 'fleet' );
const all = [ ...SHIPS, ...FLEET.map( ( k ) => 'boat-' + k ), 'fleet' ];
const only = arg( 'only' ) ? arg( 'only' ).split( ',' ) : all;
const times = ( arg( 'times' ) || 'noon,golden' ).split( ',' );
const angles = ( arg( 'angles' ) || 'bow,side,stern' ).split( ',' );

const frames = async ( n ) => {

	for ( let i = 0; i < n; i ++ ) {

		holdWind();
		app.frame( 1 / 60 );
		if ( ( i & 7 ) === 7 ) await GPU.queue.onSubmittedWorkDone();

	}

	await GPU.queue.onSubmittedWorkDone();

};

// the free camera at `pos` looking at `at`
const look = ( pos, at ) => {

	if ( ! app.freeCam ) app.setFreeCam( true );
	const dx = at.x - pos.x, dy = at.y - pos.y, dz = at.z - pos.z;
	const yaw = Math.atan2( - dx, - dz ), pitch = Math.atan2( dy, Math.hypot( dx, dz ) );
	app.fly.setPose( app.fly.camera.position.clone().set( pos.x, pos.y, pos.z ), yaw, pitch );
	app.fly.velocity.set( 0, 0, 0 );

};

// a point `d` metres from the vessel at azimuth `az` from its bow (toward starboard), `el` up
const orbit = ( c, yaw, az, el, d ) => {

	const a = az * Math.PI / 180, e = el * Math.PI / 180;
	const lx = - Math.sin( a ) * Math.cos( e ) * d, lz = Math.cos( a ) * Math.cos( e ) * d; // boat frame (+x port, +z bow)
	return { x: c.x + lx * Math.cos( yaw ) + lz * Math.sin( yaw ), y: c.y + Math.sin( e ) * d, z: c.z - lx * Math.sin( yaw ) + lz * Math.cos( yaw ) };

};

const shoot = async ( name, len, height, centre ) => {

	for ( const t of times ) {

		app.settings.timeOfDay = TIMES[ t ];
		for ( const a of angles ) {

			const [ az, el ] = ANGLES[ a ];
			const target = { x: centre.x, y: height * 0.36, z: centre.z };
			look( orbit( target, SEA.yaw, az, el, Math.max( len, height ) * 1.25 + 5 ), target );
			await frames( settle );
			const f = join( out, `${ profile }-${ name }-${ t }-${ a }${ arg( 'tag' ) ? '-' + arg( 'tag' ) : '' }.png` );
			await canvasPNG( GPU, f );
			console.log( '  ' + f );

		}

	}

};

const st = app.game && app.game.state;
for ( const id of only ) {

	clearShips();
	if ( SHIPS.includes( id ) ) {

		// the player ashore, his own boat far off; the ship moored on the patch
		const s = nv.spawn( id, { x: SEA.x, z: SEA.z, yaw: SEA.yaw, state: 'moored', speed: 0 } );
		s.dist = 0;
		await frames( 4 );
		if ( nv.models && nv.models.ready ) try { await nv.models.ready( id ); } catch ( e ) { /* procedural */ }
		await frames( 10 );
		const c = SHIP_CLASSES[ id ];
		await shoot( id, c.length, c.mast, { x: SEA.x, z: SEA.z } );

	} else if ( id.startsWith( 'boat-' ) ) {

		const k = id.slice( 5 ), b = BOATS[ k ];
		if ( st && st.boat !== k && st.buyBoat ) st.buyBoat( k );
		if ( app.setBoat && st ) app.setBoat( st.boat );
		app._placeBoat( { x: SEA.x, z: SEA.z, heading: SEA.yaw, moored: true } );
		await frames( 60 );
		await shoot( id, Math.max( b.length * 1.4, 6 ), 3.5, { x: SEA.x, z: SEA.z } );
		app._placeBoat( { x: SEA.x + 2000, z: SEA.z, heading: 0, moored: true } );

	} else if ( id.startsWith( 'aboard-' ) || id.startsWith( 'helm-' ) ) {

		// the player's own ship (any Boats.js hull) moored on the patch, the player on deck (aboard-) or at the wheel (helm-):
		// the game's own camera
		const k = id.slice( id.indexOf( '-' ) + 1 );
		if ( st && st.boat !== k && st.buyBoat ) st.buyBoat( k );
		if ( app.setBoat && st ) app.setBoat( st.boat );
		if ( app.boat && app.boat.ready ) try { await app.boat.ready; } catch ( e ) { /* the placeholder */ }
		app._placeBoat( { x: SEA.x, z: SEA.z, heading: SEA.yaw, moored: true } );
		if ( app.freeCam ) app.setFreeCam( false );
		await frames( 30 );
		const p = app.player;
		if ( id.startsWith( 'helm-' ) && p.enterBoat ) p.enterBoat(); else if ( p.boardBoat ) p.boardBoat();
		if ( p.yaw !== undefined && id.startsWith( 'aboard-' ) ) { p.yaw = SEA.yaw + Math.PI; p.pitch = 0.05; }
		for ( const t of times ) {

			app.settings.timeOfDay = TIMES[ t ];
			await frames( settle + 30 );
			const f = join( out, `${ profile }-${ id }-${ t }${ arg( 'tag' ) ? '-' + arg( 'tag' ) : '' }.png` );
			await canvasPNG( GPU, f );
			console.log( '  ' + f );

		}

		if ( p.mode === 'boat' && p.leaveHelm ) p.leaveHelm();
		if ( ( p.mode === 'deck' || p.mode === 'seat' ) && p.exitBoat ) p.exitBoat( null, 1 );
		app._placeBoat( { x: SEA.x + 2000, z: SEA.z, heading: 0, moored: true } );

	} else if ( id === 'fleet' ) {

		// twelve ships at 60..520 m in a fan in front of the camera (the LOD / impostor check)
		const kinds = [ 'sloop', 'brigantine', 'frigate', 'trawler', 'revenue', 'brigantine', 'sloop', 'frigate', 'trawler', 'revenue', 'brigantine', 'sloop' ];
		const cam = { x: SEA.x + 150, y: 6, z: SEA.z + 40 };
		for ( let i = 0; i < kinds.length; i ++ ) {

			// (east of the patch: open water)
			const d = 60 + i * 42, a = - 0.5 + ( i % 4 ) * 0.33 + ( i * 0.05 );
			nv.spawn( kinds[ i ], { x: cam.x + Math.cos( a ) * d, z: cam.z + Math.sin( a ) * d, yaw: 0.6 + i * 0.9, state: 'moored', speed: 0 } );

		}

		for ( const k of new Set( kinds ) ) try { await nv.models.ready( k ); } catch ( e ) { /* (logged) */ }
		for ( const t of times ) {

			app.settings.timeOfDay = TIMES[ t ];
			look( cam, { x: cam.x + 200, y: 3, z: cam.z + 20 } );
			await frames( settle );
			const f = join( out, `${ profile }-fleet-${ t }.png` );
			await canvasPNG( GPU, f );
			console.log( '  ' + f );
			console.log( '  lods ' + nv.ships.map( ( s ) => s.kind + ':' + ( s.visual ? s.visual.lod : '-' ) + '@' + Math.round( s.dist ) ).join( ' ' ) );
			if ( process.argv.includes( '--perf' ) ) {

				const ms = [];
				for ( let i = 0; i < 60; i ++ ) {

					const t0 = performance.now();
					app.frame( 1 / 60 );
					await GPU.queue.onSubmittedWorkDone();
					ms.push( performance.now() - t0 );

				}

				ms.sort( ( x, y ) => x - y );
				console.log( `  fleet ${ t } frame ${ ms[ 30 ].toFixed( 2 ) } ms (median of 60)` );

			}

		}

	}

}

if ( errors.length ) console.log( `${ errors.length } GPU errors, first: ${ JSON.stringify( errors[ 0 ] ).slice( 0, 400 ) }` );
const pending = readdirSync( cache ).filter( ( f ) => f.endsWith( '.img' ) && ! existsSync( join( cache, f.replace( '.img', '.png' ) ) ) );
if ( pending.length ) {

	console.log( `decoding ${ pending.length } images (run again for real textures)` );
	console.log( execFileSync( 'powershell', [ '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join( import.meta.dirname, '..', 'visuals', 'decode-images.ps1' ), '-Dir', cache, '-Max', '1024' ], { encoding: 'utf8' } ).trim() );

}

process.exit( errors.length ? 1 : 0 );
