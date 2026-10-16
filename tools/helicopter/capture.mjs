// Captures of the rescue helicopter's cockpit (wave 24A), headless on Dawn (tools/cars/capture-interiors.mjs' setup): the
// pilot's eye on the pad and in flight, by day and night, the instruments live (tools/cars/softcanvas.mjs), plus an
// outside view of the aircraft.
//
//   node tools/helicopter/capture.mjs --dawn=<dir> [--out=<dir>] [--views=pad,panel,overhead,flight,night,rain,outside,cabin]
// Out: <out>/<profile>-heli-<view>.png and one JSON line per shot (the instruments' readings).
import { installEnv } from '../perf/headless-env.mjs';
import { register } from 'node:module';
register( '../perf/stub-loader.mjs', import.meta.url );
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const arg = ( k, d = null ) => { const a = process.argv.find( ( x ) => x.startsWith( '--' + k + '=' ) ); return a ? a.slice( k.length + 3 ) : d; };
const [ W, H ] = arg( 'size', '1280x720' ).split( 'x' ).map( Number );
const profile = arg( 'profile', 'medium' ), phone = profile === 'phone';
const out = resolve( arg( 'out', join( import.meta.dirname, 'out' ) ) );
const cache = resolve( arg( 'cache', join( tmpdir(), 'hyptile-visuals-images' ) ) );
mkdirSync( out, { recursive: true } ); mkdirSync( cache, { recursive: true } );
await installEnv( { search: '?bench&noAudio&quality=' + ( phone ? 'off&phone' : profile ), width: W, height: H, power: 'high-performance', flags: [ 'backend=vulkan' ], dawnDir: arg( 'dawn' ) } );
if ( phone ) globalThis.__phoneBudget = { ...( await import( '../../src/core/Quality.js' ) ).PHONE_BUDGET };
const { decodePNG } = await import( '../../src/world/marine/WhaleTextures.js' );
globalThis.__assetImage = async ( bytes ) => {

	const u = bytes instanceof Uint8Array ? bytes : new Uint8Array( bytes );
	const png = join( cache, createHash( 'sha1' ).update( u ).digest( 'hex' ) + '.png' );
	if ( existsSync( png ) ) { const b = readFileSync( png ); return decodePNG( b.buffer.slice( b.byteOffset, b.byteOffset + b.byteLength ) ); }
	if ( u[ 0 ] === 0x89 && u[ 1 ] === 0x50 ) return decodePNG( u.buffer.slice( u.byteOffset, u.byteOffset + u.byteLength ) );
	return { data: new Uint8Array( 16 ).fill( 128 ), width: 2, height: 2 };

};
await import( '../../src/core/BenchSeed.js' );
const { App } = await import( '../../src/App.js' );
const { GPU } = await import( '../../src/engine/gpu/GPU.js' );
const { canvasPNG } = await import( '../perf/shot.mjs' );
const { installSoftCanvas } = await import( '../cars/softcanvas.mjs' );
installSoftCanvas();
const errors = [];
GPU.onError( ( e ) => errors.push( e ) );
const app = new App();
await app.init( () => {} );
const Q = await import( '../../src/core/Quality.js' );
app.quality = new Q.Quality( app, { storage: null, query: new URLSearchParams( '?quality=' + ( phone ? 'low' : profile ) ), mobile: phone ? Q.MOBILE.phone : undefined } );
if ( app.quality.loop ) app.quality.loop.auto = false;
app.startSession( null, { mode: 'sandbox', restore: false, session: false } );
app.quality.apply();
if ( app.ui && app.ui.hide ) try { app.ui.hide(); } catch ( e ) { /* no HUD */ }
const h = app.features.get( 'helicopter' );
if ( ! h ) { console.log( 'no helicopter feature' ); process.exit( 1 ); }
// the cockpit's fresh canvas (the feature made its own before the software canvas existed)
if ( h.cockpit?.useSoftCanvas ) h.cockpit.useSoftCanvas();
// --avatar=1: emulate wave 25E's App patch (the player's avatar seated at the controls with its IK, drawn in both views)
if ( arg( 'avatar' ) !== null && app.avatar ) {

	const set = app.avatar.setIKTargets.bind( app.avatar ), ik = {};
	app.avatar.setIKTargets = ( r ) => set( ( app.player.mode === 'plane' && app.player.vehicle?.ikTargets?.( ik ) ) || r );
	let vis = true;
	const seat = () => !! ( app.player.mode === 'plane' && app.player.vehicle?.showsDriver?.() );
	Object.defineProperty( app.avatar, 'visible', { configurable: true, get: () => seat() || vis, set: ( v ) => { vis = v; if ( app.avatar.group ) app.avatar.group.visible = seat() || v; } } );

}
const VIEWS = {
	pad: { time: 11, look: [ 0, - 0.2 ] },
	panel: { time: 11, look: [ 0.05, - 0.42 ] },
	lap: { time: 11, look: [ 0.2, - 0.95 ] },
	shadow: { time: 12.5, look: [ 0.1, - 0.75 ], still: true },
	overhead: { time: 11, look: [ - 0.25, 0.75 ] },
	cabin: { time: 11, look: [ - 1.2, - 0.35 ] },
	flight: { time: 15, look: [ 0, - 0.3 ], fly: true },
	night: { time: 22.5, look: [ 0, - 0.35 ], fly: true },
	rain: { time: 14, look: [ 0.1, - 0.12 ], rain: 0.8 },
	outside: { time: 11, outside: true },
	// wave 25E: the modelled exterior up close, and a backflip caught upside down (realistic flight, flown on the keys)
	close: { time: 10.5, outside: true, cam: [ 4.2, 2.2, 5.2, 0.68, - 0.16 ] },
	closerear: { time: 16, outside: true, cam: [ - 5, 2.6, - 7.5, Math.PI + 0.58, - 0.14 ] },
	flip: { time: 10.5, flip: true },
	fliprain: { time: 14, flip: true, rain: 0.8 },
	rainfly: { time: 14, look: [ 0, - 0.12 ], fly: true, rain: 0.8 },
	// the pilot (the player's avatar) at the controls: from the door, and the cyclic / collective from the seat
	pilot: { time: 10.5, look: [ 0, - 0.2 ], door: true },
	hands: { time: 10.5, look: [ 0.15, - 0.85 ] },
};
const only = ( arg( 'views' ) || Object.keys( VIEWS ).join( ',' ) ).split( ',' );
for ( const id of only ) {

	const v = VIEWS[ id ];
	if ( ! v ) continue;
	app.settings.timeOfDay = v.time; app.settings.timeSpeed = 0;
	if ( h.piloted ) { h.piloted = false; h.systems.stop( true ); app.player.exitVehicle?.( h.home.x + 3, h.home.y + 0.05, h.home.z, 0, 'walk' ); }
	h.recall();
	if ( h.cockpit ) h.cockpit.rainOverride = v.rain ?? null;
	const door = h.flight.toWorld( [ 1.35, 0, 0.65 ] );
	if ( typeof app._placePlayer === 'function' ) app._placePlayer( door.x, door.y + 0.1, door.z, 0 ); else app.player.position.copy( door );
	if ( app.setFreeCam ) app.setFreeCam( false );
	// (the scripted climbs below are the assisted model's keys; the flip flies the realistic one)
	h.setAssist?.( !! v.fly );
	if ( v.outside ) {

		app.setFreeCam?.( true );
		const p = h.flight.position, c = v.cam || [ 9, 4, 11, 0.7, - 0.25 ];
		app.fly.setPose( app.fly.camera.position.clone().set( p.x + c[ 0 ], p.y + c[ 1 ], p.z + c[ 2 ] ), c[ 3 ], c[ 4 ] );

	} else if ( v.flip ) {

		// airborne 45 m over the pad, the rotor at speed, the lever at a hover: then S through a backflip (C while upside
		// down), caught when the mast points at the ground
		h.board();
		const f = h.flight;
		f.position.y += 45; f.grounded = false; f.agl = 45; f.rpm = 1; f.engineOn = true; h.systems.running = true; h.systems.starting = 0; h.collective = 0.45;
		// (the chase camera: the free camera would stop the player's vehicle drive, and with it the keys)
		app.player.setView( 'third' ); app.player.planeDist = 14;

	} else { h.board(); app.player.setView( 'first' ); }
	let flipAcc = 0;
	for ( let i = 0; i < 330; i ++ ) {

		if ( v.flip ) {

			const f = h.flight, up = f.up(), p = f.position;
			app.input.keys.clear();
			if ( i > 30 ) {

				flipAcc += f.omega.x / 60;
				app.input.keys.add( flipAcc > - Math.PI * 2 * 0.97 ? 'KeyS' : 'Space' );
				if ( up.y < - 0.2 && h.collective > - 0.6 ) app.input.keys.add( 'KeyC' );
				if ( up.y > 0.2 && h.collective < 0.6 ) app.input.keys.add( 'ShiftLeft' );

			}
			void p;
			// (stop the clock upside down)
			if ( i > 30 && up.y < - 0.45 ) { app.frame( 1 / 60 ); break; }

		}
		if ( ! v.outside && ! v.flip ) { app.player.helmYaw = v.look[ 0 ]; app.player.helmPitch = v.look[ 1 ]; }
		if ( v.door && i === 2 ) app.player.setView( 'third' );
		if ( v.door ) { app.player.orbitYaw = h.flight.yaw + Math.PI * 0.5 - 0.35; app.player.orbitPitch = 0.05; }
		if ( v.fly ) {

			app.input.keys.clear();
			if ( i > 150 && i < 270 ) app.input.keys.add( 'ShiftLeft' );
			if ( i > 200 ) app.input.keys.add( 'KeyW' );
			if ( i > 230 ) app.input.keys.add( 'KeyA' );

		}
		if ( i === 100 && id === 'night' ) { h.act( 'landing' ); h.act( 'cabin' ); }
		// (a stopped rotor parked fore and aft: its blade's shadow lies still across the cabin)
		if ( v.still && i > 60 ) { h.systems.stop( true ); h.flight.rpm = 0.05; h.visual.mainRotor.rotation.y = 0.12; }
		app.frame( 1 / 60 );
		if ( ( i & 7 ) === 7 ) await GPU.queue.onSubmittedWorkDone();
		if ( i === 30 && h.cockpit?.ready ) await h.cockpit.ready;

	}
	app.input.keys.clear();
	await GPU.queue.onSubmittedWorkDone();
	const file = join( out, `${ profile }-heli-${ id }.png` );
	await canvasPNG( GPU, file );
	const f = h.flight;
	console.log( JSON.stringify( { file, id, alt: f.position.y.toFixed( 1 ), agl: f.agl.toFixed( 1 ), speed: ( Math.hypot( f.velocity.x, f.velocity.z ) * 3.6 ).toFixed( 0 ), vs: f.velocity.y.toFixed( 1 ), rpm: f.rpm.toFixed( 2 ), pitch: f.pitch.toFixed( 3 ), roll: f.roll.toFixed( 3 ), detailed: !! h.cockpit?.interior, fuel: h.systems.fuel?.toFixed?.( 3 ), rotor: ( () => { const m = h.cockpit?.interior && [ ...h.cockpit.interior.materials.values() ].find( x => x.uniforms.rotorAxis ); return m ? [ m.uniforms.rotorHub.value, m.uniforms.rotorAxis.value, m.uniforms.rotorBlade.value ].map( v => [ v.x, v.y, v.z, v.w ].map( n => +n.toFixed( 2 ) ) ) : null; } )() } ) );
	app.setFreeCam?.( false );

}
if ( errors.length ) console.log( `${ errors.length } GPU errors, first: ${ JSON.stringify( errors[ 0 ] ).slice( 0, 400 ) }` );
process.exit( errors.length ? 1 : 0 );
