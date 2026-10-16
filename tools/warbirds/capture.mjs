// Captures of the warbirds in the game (wave 26A), headless on Dawn like tools/cars/capture.mjs. Until the root installs the
// feature (tools/warbirds/apply-patches.mjs), the script adds it to the running App itself.
//
//   node tools/warbirds/capture.mjs --dawn=<dir> [--out=<dir>] [--profile=medium|phone] [--size=1280x720] [--only=line,...]
// Views: line (the Tidemark dispersal: all six for sale), each airframe parked (sabrewing, stormgull, bulwark, kitewing,
// seawarden, longreach), chase (the Sabrewing in flight), cockpit (its gunsight), dogfight (a Sabrewing against two
// Blackwater raiders: tracers, smoke, vapour), turret (the Longreach's top gunner looking aft at a raider), crew (the
// Longreach in flight with its crew aboard). The HUD is the page's DOM, which a headless capture does not draw: the
// gunsight and the turret's cross are drawn into the PNG from the HUD's own numbers (said so in the log).
import { installEnv } from '../perf/headless-env.mjs';
import { register } from 'node:module';
register( '../perf/stub-loader.mjs', import.meta.url );
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
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
mkdirSync( out, { recursive: true } );
mkdirSync( cache, { recursive: true } );
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
const { Vector3 } = await import( '../../src/engine/index.js' );
const dogfightModule = await import( '../../src/features/dogfight/index.js' );
const { WARBIRD_IDS, WARBIRDS } = dogfightModule;

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
const installed = !! app.features.get( 'dogfight' );
const df = installed ? app.features.get( 'dogfight' ) : app.features.add( 'dogfight', dogfightModule );
console.log( `dogfight ${ installed ? 'installed by the game' : 'added by this script (the root patch is not applied)' }` );

// the canvas to a PNG, with the HUD's sight drawn in (the DOM is not rendered headless)
async function shot( file, overlay = null ) {

	const tex = GPU.context.getCurrentTexture();
	const w = tex.width, h = tex.height, bpr = Math.ceil( w * 4 / 256 ) * 256;
	const buf = GPU.device.createBuffer( { size: bpr * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ } );
	const enc = GPU.device.createCommandEncoder();
	enc.copyTextureToBuffer( { texture: tex }, { buffer: buf, bytesPerRow: bpr }, [ w, h ] );
	GPU.queue.submit( [ enc.finish() ] );
	await buf.mapAsync( GPUMapMode.READ );
	const src = new Uint8Array( buf.getMappedRange().slice( 0 ) );
	buf.unmap();
	const bgra = String( GPU.format ).startsWith( 'bgra' );
	const px = new Uint8Array( w * h * 4 );
	for ( let y = 0; y < h; y ++ ) for ( let x = 0; x < w; x ++ ) {

		const s = y * bpr + x * 4, d = ( y * w + x ) * 4;
		px[ d ] = src[ s + ( bgra ? 2 : 0 ) ];
		px[ d + 1 ] = src[ s + 1 ];
		px[ d + 2 ] = src[ s + ( bgra ? 0 : 2 ) ];
		px[ d + 3 ] = 255;

	}

	if ( overlay ) overlay( {
		w, h,
		dot( x, y, r, g, b, a = 1 ) {

			x = Math.round( x ); y = Math.round( y );
			if ( x < 0 || y < 0 || x >= w || y >= h ) return;
			const d = ( y * w + x ) * 4;
			px[ d ] = px[ d ] * ( 1 - a ) + r * a; px[ d + 1 ] = px[ d + 1 ] * ( 1 - a ) + g * a; px[ d + 2 ] = px[ d + 2 ] * ( 1 - a ) + b * a;

		},
	} );
	const raw = Buffer.alloc( ( w * 4 + 1 ) * h );
	for ( let y = 0; y < h; y ++ ) {

		raw[ y * ( w * 4 + 1 ) ] = 0;
		Buffer.from( px.buffer, y * w * 4, w * 4 ).copy( raw, y * ( w * 4 + 1 ) + 1 );

	}

	const crcT = new Int32Array( 256 ).map( ( _, n ) => {

		let c = n;
		for ( let k = 0; k < 8; k ++ ) c = c & 1 ? 0xedb88320 ^ ( c >>> 1 ) : c >>> 1;
		return c;

	} );
	const crc = ( b ) => {

		let c = - 1;
		for ( const x of b ) c = crcT[ ( c ^ x ) & 255 ] ^ ( c >>> 8 );
		return ( c ^ - 1 ) >>> 0;

	};
	const chunk = ( type, data ) => {

		const o = Buffer.alloc( 12 + data.length );
		o.writeUInt32BE( data.length, 0 );
		o.write( type, 4, 'ascii' );
		data.copy( o, 8 );
		o.writeUInt32BE( crc( o.subarray( 4, 8 + data.length ) ), 8 + data.length );
		return o;

	};
	const ihdr = Buffer.alloc( 13 );
	ihdr.writeUInt32BE( w, 0 );
	ihdr.writeUInt32BE( h, 4 );
	ihdr[ 8 ] = 8; ihdr[ 9 ] = 6;
	writeFileSync( file, Buffer.concat( [ Buffer.from( [ 137, 80, 78, 71, 13, 10, 26, 10 ] ), chunk( 'IHDR', ihdr ), chunk( 'IDAT', deflateSync( raw ) ), chunk( 'IEND', Buffer.alloc( 0 ) ) ] ) );

}

// the reflector sight (a ring and a pip) or a turret's cross, amber, where the HUD puts it
const sightOverlay = ( s, ring ) => ( o ) => {

	if ( ! s ) return;
	const col = [ 255, 196, 92 ];
	if ( ring ) {

		for ( let a = 0; a < 720; a ++ ) for ( const dr of [ - 0.6, 0, 0.6 ] ) o.dot( s.x + Math.cos( a / 720 * Math.PI * 2 ) * ( s.r + dr ), s.y + Math.sin( a / 720 * Math.PI * 2 ) * ( s.r + dr ), ...col, 0.9 );
		for ( let dx = - 2; dx <= 2; dx ++ ) for ( let dy = - 2; dy <= 2; dy ++ ) if ( dx * dx + dy * dy <= 4 ) o.dot( s.x + dx, s.y + dy, ...col, 0.95 );
		for ( let t = 0; t < s.r * 0.35; t ++ ) for ( const k of [ - 0.5, 0.5 ] ) {

			o.dot( s.x - s.r - 2 + t, s.y + k, ...col, 0.9 );
			o.dot( s.x + s.r + 2 - t, s.y + k, ...col, 0.9 );
			o.dot( s.x + k, s.y + s.r + 2 - t, ...col, 0.9 );

		}

	} else for ( let t = 3; t < 10; t ++ ) for ( const k of [ - 0.6, 0.6 ] ) {

		o.dot( s.x - t, s.y + k, ...col, 0.95 ); o.dot( s.x + t, s.y + k, ...col, 0.95 );
		o.dot( s.x + k, s.y - t, ...col, 0.95 ); o.dot( s.x + k, s.y + t, ...col, 0.95 );

	}

};

const frames = async ( n, each = null ) => {

	for ( let i = 0; i < n; i ++ ) {

		if ( each ) each( i );
		app.frame( 1 / 60 );
		if ( ( i & 7 ) === 7 ) await GPU.queue.onSubmittedWorkDone();

	}

	await GPU.queue.onSubmittedWorkDone();

};

const strip = df._line( 'tidemark' );
// fair weather for every shot (a manual pick eases in: the first views wait for it)
const weather = app.features.get( 'weather' );
if ( weather && weather.setManual ) weather.setManual( 'clear', 0 );
for ( let i = 0; i < 600; i ++ ) app.frame( 1 / 30 );
const sea = ( x, z ) => df.waterAt( x, z );
// the models: every GLB loaded before the shots
for ( const id of WARBIRD_IDS ) if ( df.models ) await df.models.ready( id );
console.log( 'models: ' + WARBIRD_IDS.map( ( id ) => id + ( df.models && df.models.templates.has( id ) ? ' ok' : ' FAILED' ) ).join( ', ' ) );

const placePlayer = ( x, z ) => {

	const y = df.groundAt( x, z );
	if ( typeof app._placePlayer === 'function' ) app._placePlayer( x, y + 0.1, z, 0 );
	else app.player.position.set( x, y + 0.1, z );

};

const freeCam = ( x, y, z, yaw, pitch ) => {

	if ( app.setFreeCam ) app.setFreeCam( true );
	app.fly.setPose( new Vector3( x, y, z ), yaw, pitch );

};

// the camera on a slot: from in front of its nose, off to its left, a little above
const slotView = ( id, dist = 1, yawOff = 0.75, up = 0.35 ) => {

	const s = strip.slots[ id ], span = WARBIRDS[ id ].flight.span;
	const d = span * 1.25 * dist;
	const a = s.heading + yawOff;
	const x = s.x + Math.sin( a ) * d, z = s.z + Math.cos( a ) * d;
	const y = s.y + 1.4 + d * up * 0.25;
	// (FlyCamera yaw 0 looks -z)
	const yaw = Math.atan2( - ( s.x - x ), - ( s.z - z ) );
	return [ x, y, z, yaw, - 0.1 ];

};

// an aircraft of mine in the air
function airborne( id, seat, x, y, z, heading, speed = 115 ) {

	if ( df.ac ) df._park( 'ground' );
	df.fleet[ id ].owned = true;
	df.fleet[ id ].lost = false;
	df.fleet[ id ].at = 'tidemark';
	const r = df.fly( id, seat );
	if ( ! r.ok ) throw new Error( 'fly: ' + r.text );
	const a = df.ac;
	a.flight.place( x, y, z, heading, { grounded: false, speed } );
	a.flight.flaps = 0;
	a.flight.gearDown = 0;
	a.status = 'fly';
	df._input.throttle = 0.85;
	a.flight.controls.throttle = 0.85;
	return a;

}

const VIEWS = {
	line: { time: 10, run() { freeCam( ...( () => { const d = strip.desk, s = strip.slots.seawarden; const x = d.x + ( s.x - d.x ) * 0.5 + Math.cos( strip.strip.heading ) * - 30, z = d.z + ( s.z - d.z ) * 0.5 - Math.sin( strip.strip.heading ) * - 30; return [ x, strip.strip.y + 9, z, Math.atan2( - ( ( d.x + s.x ) / 2 - x ), - ( ( d.z + s.z ) / 2 - z ) ), - 0.18 ]; } )() ); } },
	chase: { time: 11, frames: 200, run() {

		const c = WORLD_T;
		airborne( 'sabrewing', 0, c.x + 300, 260, c.z + 400, 2.4 );
		app.setFreeCam && app.setFreeCam( false );
		app.player.setView && app.player.setView( 'third' );

	} },
	cockpit: { time: 11, frames: 160, overlay: 'ring', run() {

		const c = WORLD_T;
		const a = airborne( 'sabrewing', 0, c.x - 200, 160, c.z + 600, 0.9 );
		a.arm.armed = a.arm.want = true;
		app.setFreeCam && app.setFreeCam( false );
		app.player.setView && app.player.setView( 'first' );

	} },
	dogfight: { time: 15.5, frames: 260, run() {

		const c = WORLD_T;
		const a = airborne( 'sabrewing', 0, c.x + 600, 420, c.z - 300, 1.9, 125 );
		a.arm.armed = a.arm.want = true;
		const f = a.flight;
		const ahead = ( d, side = 0, up = 0 ) => f.toWorld( [ side, up, d ], new Vector3() );
		const p1 = ahead( 170, - 8, 4 ), p2 = ahead( 420, 60, 30 );
		const r1 = df._spawnAI( 'bulwark', 'raider', { x: p1.x, y: p1.y, z: p1.z, heading: f.heading() + 0.15, skill: 0.3 } );
		const r2 = df._spawnAI( 'sabrewing', 'raider', { x: p2.x, y: p2.y, z: p2.z, heading: f.heading() - 0.4, skill: 0.3 } );
		r1.hit( 'engine', 45 );
		r1.damage.fires.engine = 30;
		r2.hit( 'wingL', 50 );
		// (the raiders keep flying straight for the shot: their pilots look away)
		for ( const r of [ r1, r2 ] ) r.pilot.think = () => ( { pitch: 0, roll: 0.15, yaw: 0, throttle: 0.85, fire: false } );
		app.setFreeCam && app.setFreeCam( false );
		app.player.setView && app.player.setView( 'third' );
		app.player.planeDist = 13;
		app.player.orbitPitch = 0.1;
		app.player.orbitYaw = f.heading() + Math.PI + 0.25;
		VIEWS.dogfight.each = ( i ) => { app.input.mouseDown = i > 150; };

	} },
	turret: { time: 16.5, frames: 230, overlay: 'cross', run() {

		const c = WORLD_T;
		const a = airborne( 'longreach', 3, c.x + 200, 380, c.z - 800, - 0.6, 105 );
		a.arm.armed = a.arm.want = true;
		const f = a.flight;
		const behind = f.toWorld( [ 25, 18, - 150 ], new Vector3() );
		const r = df._spawnAI( 'bulwark', 'raider', { x: behind.x, y: behind.y, z: behind.z, heading: f.heading() + 0.05, skill: 0.6 } );
		r.pilot.think = () => ( { pitch: 0.02, roll: 0, yaw: 0, throttle: 0.95, fire: true } );
		app.setFreeCam && app.setFreeCam( false );
		app.player.setView && app.player.setView( 'first' );
		app.player.helmPitch = 0.12;
		app.player.helmYaw = - 0.16;
		VIEWS.turret.each = ( i ) => { app.input.mouseDown = i > 160; };

	} },
	crew: { time: 9.5, frames: 200, run() {

		const c = WORLD_T;
		const a = airborne( 'longreach', 0, c.x - 500, 300, c.z + 200, 1.2, 110 );
		a.seats.who[ 1 ] = 'ai';
		a.seats.who[ 2 ] = 'ai';
		a.seats.who[ 3 ] = 'ai';
		app.setFreeCam && app.setFreeCam( false );
		app.player.setView && app.player.setView( 'third' );
		app.player.orbitYaw = a.flight.heading() + Math.PI - 0.9;
		app.player.orbitPitch = 0.22;
		app.player.planeDist = 34;

	} },
};
const WORLD_T = strip.strip;
for ( const id of WARBIRD_IDS ) VIEWS[ id ] = { time: 10.5, run() { freeCam( ...slotView( id ) ); } };

const only = arg( 'only' ) ? arg( 'only' ).split( ',' ) : [ 'line', ...WARBIRD_IDS, 'chase', 'cockpit', 'dogfight', 'turret', 'crew' ];
placePlayer( strip.desk.x + 6, strip.desk.z + 6 );
for ( const id of only ) {

	const v = VIEWS[ id ];
	if ( ! v ) continue;
	app.settings.timeOfDay = v.time;
	app.settings.timeSpeed = 0;
	if ( df.ac ) df._park( 'ground' );
	df._clearAI();
	app.input.mouseDown = false;
	if ( ! [ 'chase', 'cockpit', 'dogfight', 'turret', 'crew' ].includes( id ) ) placePlayer( strip.desk.x + 6, strip.desk.z + 6 );
	v.each = null;
	v.run();
	await frames( v.frames || 120, ( i ) => v.each && v.each( i ) );
	let overlay = null, sight = null;
	if ( v.overlay && df.ac ) {

		const hv = df._hudAboard( app.player.view === 'first' );
		sight = hv.sight || null;
		overlay = sightOverlay( sight, v.overlay === 'ring' );

	}

	const file = join( out, `${ profile }-${ id }.png` );
	await shot( file, overlay );
	const a = df.ac;
	console.log( `  ${ id }: ${ a ? `${ a.W.name } at ${ a.position.y.toFixed( 0 ) } m, ${ a.flight.airspeed.toFixed( 0 ) } m/s, status ${ a.status }, rounds in the air ${ df.bullets.list.length }, tracers ${ df.fx.drawn.tracers }, vapour ${ df.fx.drawn.vapour }` : 'parked' }${ df.ai.length ? `, AI ${ df.ai.map( ( x ) => x.W.name + ' ' + x.damage.code() + ' ' + x.status ).join( ' / ' ) }` : '' }${ sight ? `, sight drawn at ${ sight.x.toFixed( 0 ) },${ sight.y.toFixed( 0 ) } (the HUD's DOM, composited)` : '' } -> ${ file }` );

}

if ( errors.length ) console.log( `${ errors.length } GPU errors, first: ${ JSON.stringify( errors[ 0 ] ).slice( 0, 400 ) }` );
process.exit( errors.length ? 1 : 0 );
