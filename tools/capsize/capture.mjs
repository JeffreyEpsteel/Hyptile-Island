// Wave 22B captures on Dawn: the whole App (like tools/visuals/capture.mjs) with the capsize feature added by hand (until
// install.js has it) and the Keel_Lean pose injected (tools/capsize/patches.mjs: the AnimDef / Avatar patch's data), then
//   upturned   the launch hull up after she went over, from the water
//   keel       the player on her keel mid-minigame (the righting meter drawn over the frame as Meter.js lays it out)
//   breath     diving beside her with ~4 s of air left (the breath ring and the vignette drawn as BreathRing.js lays them out)
// The HUD is DOM (none in node): the ring, the vignette and the meter are rasterised over the canvas from the same models.
//   node tools/capsize/capture.mjs --dawn=<dir> [--out=<dir>] [--size=1280x720]
import { installEnv } from '../perf/headless-env.mjs';
import { register } from 'node:module';
register( '../perf/stub-loader.mjs', import.meta.url );
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { deflateSync } from 'node:zlib';

const arg = ( k, d = null ) => { const a = process.argv.find( ( x ) => x.startsWith( '--' + k + '=' ) ); return a ? a.slice( k.length + 3 ) : d; };
const [ W, H ] = arg( 'size', '1280x720' ).split( 'x' ).map( Number );
const out = resolve( arg( 'out', join( import.meta.dirname, 'out' ) ) );
const cache = resolve( arg( 'cache', join( tmpdir(), 'hyptile-visuals-images' ) ) );
mkdirSync( out, { recursive: true } );
mkdirSync( cache, { recursive: true } );
await installEnv( { search: '?bench&noAudio&quality=medium', width: W, height: H, power: 'high-performance', flags: [ 'backend=vulkan' ], dawnDir: arg( 'dawn' ) } );
const { decodePNG } = await import( '../../src/world/marine/WhaleTextures.js' );
globalThis.__assetImage = async ( bytes ) => {

	const u = bytes instanceof Uint8Array ? bytes : new Uint8Array( bytes );
	const h = createHash( 'sha1' ).update( u ).digest( 'hex' );
	const png = join( cache, h + '.png' );
	if ( existsSync( png ) ) { const b = readFileSync( png ); return decodePNG( b.buffer.slice( b.byteOffset, b.byteOffset + b.byteLength ) ); }
	if ( u[ 0 ] === 0x89 && u[ 1 ] === 0x50 ) return decodePNG( u.buffer.slice( u.byteOffset, u.byteOffset + u.byteLength ) );
	if ( ! existsSync( join( cache, h + '.img' ) ) ) writeFileSync( join( cache, h + '.img' ), u );
	return { data: new Uint8Array( 16 ).fill( 128 ), width: 2, height: 2 };

};

// the lean-back pose (the reported AnimDef / Avatar patch), in memory
const { KEEL_LEAN, KEEL_STATE } = await import( './patches.mjs' );
const DEF = ( await import( '../../src/player/anim/AnimDef.js' ) ).default;
if ( ! DEF.clips.Keel_Lean ) DEF.clips.Keel_Lean = KEEL_LEAN;
if ( ! DEF.states.keelPull ) DEF.states.keelPull = KEEL_STATE;
const { ONE_SHOT } = await import( '../../src/player/Avatar.js' );
ONE_SHOT.keelPull = 'keelPull';

await import( '../../src/core/BenchSeed.js' );
const { App } = await import( '../../src/App.js' );
const { GPU } = await import( '../../src/engine/gpu/GPU.js' );
const { setupScenario } = await import( '../perf/runner.js' );
const capsizeModule = await import( '../../src/features/capsize/index.js' );
const { autoHold, METER, COLORS } = capsizeModule;
const { RING, TONES } = await import( '../../src/features/death/BreathRing.js' );
const app = new App();
await app.init( () => {} );
const Q = await import( '../../src/core/Quality.js' );
app.quality = new Q.Quality( app, { storage: null, query: new URLSearchParams( '?quality=medium' ) } );
app.quality.loop.auto = false;
app.startSession( null, { mode: 'sandbox', restore: false, session: false } );
app.quality.apply();
if ( app.ui && app.ui.hide ) try { app.ui.hide(); } catch ( e ) { /* no HUD */ }
const F = app.features, inp = app.input, p = app.player;
const cap = F.get( 'capsize' ) || F.add( 'capsize', capsizeModule );
const death = F.get( 'death' );
const toasts = [];
const toast0 = app.game.toast.bind( app.game );
app.game.toast = ( t, ms ) => { toasts.push( String( t ) ); return toast0( t, ms ); };
const run = async ( n, each = null ) => {

	for ( let i = 0; i < n; i ++ ) {

		if ( each ) each( i );
		app.frame( 1 / 60 );
		if ( ( i & 15 ) === 15 ) await GPU.queue.onSubmittedWorkDone();

	}

};

// ---- the frame back as RGBA, an overlay painter, a PNG
async function grab() {

	await GPU.queue.onSubmittedWorkDone();
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
	const px = new Float32Array( w * h * 3 );
	for ( let y = 0; y < h; y ++ ) for ( let x = 0; x < w; x ++ ) {

		const s = y * bpr + x * 4, d = ( y * w + x ) * 3;
		px[ d ] = src[ s + ( bgra ? 2 : 0 ) ]; px[ d + 1 ] = src[ s + 1 ]; px[ d + 2 ] = src[ s + ( bgra ? 0 : 2 ) ];

	}

	return { w, h, px };

}

const parse = ( c ) => {

	if ( c.startsWith( '#' ) ) return [ parseInt( c.slice( 1, 3 ), 16 ), parseInt( c.slice( 3, 5 ), 16 ), parseInt( c.slice( 5, 7 ), 16 ), 1 ];
	const m = c.match( /rgba?\(([^)]+)\)/ ).slice( 1 )[ 0 ].split( ',' ).map( Number );
	return [ m[ 0 ], m[ 1 ], m[ 2 ], m.length > 3 ? m[ 3 ] : 1 ];

};
const blend = ( img, x, y, col, a ) => {

	if ( x < 0 || y < 0 || x >= img.w || y >= img.h || a <= 0 ) return;
	const d = ( y * img.w + x ) * 3, k = Math.min( 1, a * col[ 3 ] );
	for ( let c = 0; c < 3; c ++ ) img.px[ d + c ] += ( col[ c ] - img.px[ d + c ] ) * k;

};
const rect = ( img, x0, y0, w, h, col, a = 1 ) => {

	for ( let y = Math.floor( y0 ); y < Math.ceil( y0 + h ); y ++ ) for ( let x = Math.floor( x0 ); x < Math.ceil( x0 + w ); x ++ ) blend( img, x, y, col, a );

};

// BreathRing.js: the vignette (radial-gradient, farthest corner) and the ring at RING.y, the arc clockwise from 12 o'clock
function drawBreath( img, m, time ) {

	if ( m.vignette > 0 ) {

		const col = [ 0, 8, 16, 1 ];
		for ( let y = 0; y < img.h; y ++ ) for ( let x = 0; x < img.w; x ++ ) {

			const r = Math.hypot( ( x - img.w / 2 ) / ( img.w / 2 ), ( y - img.h / 2 ) / ( img.h / 2 ) ) / Math.SQRT2;
			const a = r < 0.38 ? 0 : r < 0.78 ? ( r - 0.38 ) / 0.4 * 0.75 : 0.75 + ( r - 0.78 ) / 0.22 * 0.22;
			blend( img, x, y, col, a * m.vignette );

		}

	}

	if ( ! m.show ) return;
	const pulse = m.pulse > 0 ? 0.55 + 0.45 * Math.abs( Math.sin( time * Math.PI * ( m.pulse > 0.5 ? 3 : 1.6 ) ) ) : 1;
	const cx = img.w / 2 + RING.x, cy = img.h * RING.y, R = ( RING.size - RING.stroke ) / 2, hw = RING.stroke / 2;
	const track = parse( TONES.track ), tone = parse( TONES[ m.tone ] );
	for ( let y = Math.floor( cy - R - 4 ); y <= cy + R + 4; y ++ ) for ( let x = Math.floor( cx - R - 4 ); x <= cx + R + 4; x ++ ) {

		const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.abs( Math.hypot( dx, dy ) - R );
		const cov = Math.max( 0, Math.min( 1, hw + 0.5 - d ) );
		if ( cov <= 0 ) continue;
		blend( img, x, y, track, cov );
		let a = Math.atan2( dy, dx ) + Math.PI / 2;
		if ( a < 0 ) a += Math.PI * 2;
		if ( a <= m.frac * Math.PI * 2 ) blend( img, x, y, tone, cov * pulse );

	}

}

// Meter.js: the label row (12 px + 4), the balance bar, the heel bar, the stamina line
function drawMeter( img, m ) {

	const x0 = img.w / 2 - METER.w / 2, y0 = img.h * METER.y + 19, c = ( s ) => parse( COLORS[ s ] );
	rect( img, x0, y0, METER.w, METER.h, c( 'track' ) );
	rect( img, x0 + ( m.centre - m.half ) * METER.w, y0, 2 * m.half * METER.w, METER.h, c( m.inSpot ? 'spotOn' : 'spot' ) );
	rect( img, x0, y0, METER.w, METER.h, c( 'strain' ), Math.min( 1, m.strain ) * 0.55 );
	rect( img, x0 + m.marker * METER.w - 2, y0 - 2, 4, METER.h + 4, c( 'marker' ) );
	const y1 = y0 + METER.h + METER.gap;
	rect( img, x0, y1, METER.w, METER.heelH, c( 'track' ) );
	rect( img, x0, y1, m.heel * METER.w, METER.heelH, c( 'heel' ) );
	const y2 = y1 + METER.heelH + 3;
	rect( img, x0, y2, METER.w, METER.staminaH, c( 'track' ) );
	rect( img, x0, y2, m.stamina * METER.w, METER.staminaH, c( 'stamina' ) );

}

function writePNG( file, img ) {

	const { w, h, px } = img;
	const raw = Buffer.alloc( ( w * 4 + 1 ) * h );
	for ( let y = 0; y < h; y ++ ) {

		raw[ y * ( w * 4 + 1 ) ] = 0;
		for ( let x = 0; x < w; x ++ ) {

			const s = ( y * w + x ) * 3, d = y * ( w * 4 + 1 ) + 1 + x * 4;
			raw[ d ] = px[ s ]; raw[ d + 1 ] = px[ s + 1 ]; raw[ d + 2 ] = px[ s + 2 ]; raw[ d + 3 ] = 255;

		}

	}

	const T = new Int32Array( 256 ).map( ( _, n ) => { let c = n; for ( let k = 0; k < 8; k ++ ) c = c & 1 ? 0xedb88320 ^ ( c >>> 1 ) : c >>> 1; return c; } );
	const crc = ( b ) => { let c = - 1; for ( const x of b ) c = T[ ( c ^ x ) & 255 ] ^ ( c >>> 8 ); return ( c ^ - 1 ) >>> 0; };
	const chunk = ( type, data ) => { const o = Buffer.alloc( 12 + data.length ); o.writeUInt32BE( data.length, 0 ); o.write( type, 4, 'ascii' ); data.copy( o, 8 ); o.writeUInt32BE( crc( o.subarray( 4, 8 + data.length ) ), 8 + data.length ); return o; };
	const ihdr = Buffer.alloc( 13 ); ihdr.writeUInt32BE( w, 0 ); ihdr.writeUInt32BE( h, 4 ); ihdr[ 8 ] = 8; ihdr[ 9 ] = 6;
	writeFileSync( file, Buffer.concat( [ Buffer.from( [ 137, 80, 78, 71, 13, 10, 26, 10 ] ), chunk( 'IHDR', ihdr ), chunk( 'IDAT', deflateSync( raw ) ), chunk( 'IEND', Buffer.alloc( 0 ) ) ] ) );
	console.log( 'wrote ' + file );

}

// ---- the scene: the launch at sea, the player aboard; she goes over
await setupScenario( app, { id: 'capsize', name: 'capsize', ships: [], fire: null, peers: 0, intensity: 0, time: 14.5, weather: 'clear', place: { kind: 'deck', boat: 'launch', x: 200, z: 260, heading: 2.4 } } );
await run( 120 );
const b = app.boatCtl;
console.log( `boat ${ app.boatId } small ${ b.small } mode ${ p.mode }` );
b.moored = false;
b.quaternion.multiply( new b.quaternion.constructor().setFromAxisAngle( { x: 0, y: 0, z: 1 }, 2.1 ) );
await run( 240 );
console.log( `capsized ${ b.capsized } heel ${ ( b.heel() * 180 / Math.PI ).toFixed( 0 ) } player ${ p.mode } toasts ${ JSON.stringify( toasts ) }` );

// 1. upturned, seen from the water
const yaw = b.getYaw(), look = ( cx, cy, cz, tx, ty, tz ) => { app.setFreeCam( true ); app.fly.setPose( app.fly.camera.position.clone().set( cx, cy, cz ), Math.atan2( - ( tx - cx ), - ( tz - cz ) ), Math.atan2( ty - cy, Math.hypot( tx - cx, tz - cz ) ) ); };
const side = ( d, up, along = 0 ) => [ b.position.x + d * Math.cos( yaw ) + along * Math.sin( yaw ), up, b.position.z - d * Math.sin( yaw ) + along * Math.cos( yaw ) ];
{ const [ cx, cy, cz ] = side( 5.5, 1.4, 3.5 ); look( cx, cy, cz, b.position.x, 0.1, b.position.z ); }
await run( 30 );
writePNG( join( out, 'capsize-upturned.png' ), await grab() );
app.setFreeCam( false );

// 2. on the keel mid-minigame (the player's own camera)
const bw = b.model.dimensions.beam;
p.mode = 'swim'; p.floating = true;
p.position.set( ...side( - ( bw / 2 + 1 ), - 0.2 ) );
await run( 10 );
console.log( 'prompt ' + JSON.stringify( p.prompt ) );
inp.pressed.add( 'KeyE' );
await run( 2 );
console.log( `righting ${ cap.righting() } mode ${ p.mode }` );
let heelAt = 0;
await run( 60 * 7, () => {

	const g = cap.game;
	if ( ! g ) return;
	if ( autoHold( g, 'good' ) ) inp.keys.add( 'KeyE' ); else inp.keys.delete( 'KeyE' );
	heelAt = g.heel;

} );
const g = cap.game;
console.log( `mid-game: heel ${ heelAt.toFixed( 2 ) } pull ${ b.pull.toFixed( 2 ) } hull heel ${ ( b.heel() * 180 / Math.PI ).toFixed( 0 ) } action ${ p.action } prompt ${ JSON.stringify( p.prompt ) }` );
{ const img = await grab(); if ( g ) drawMeter( img, g.model() ); writePNG( join( out, 'capsize-keel.png' ), img ); }
// the same moment from the side (the pose)
{ const [ cx, cy, cz ] = side( 3.5, 1.3, 6.5 ); look( cx, cy, cz, p.position.x, p.position.y + 0.7, p.position.z ); }
await run( 40, () => { if ( cap.game && autoHold( cap.game, 'good' ) ) inp.keys.add( 'KeyE' ); else inp.keys.delete( 'KeyE' ); } );
writePNG( join( out, 'capsize-keel-side.png' ), await grab() );
app.setFreeCam( false );
// (leaving the free camera puts the player where it was: a fresh attempt from the water)
await run( 2 );
console.log( `after the free camera: mode ${ p.mode } righting ${ cap.righting() }` );
if ( ! cap.game ) {

	p.mode = 'swim'; p.floating = true; p.position.set( ...side( - ( bw / 2 + 1 ), - 0.2 ) );
	await run( 5 );
	inp.pressed.add( 'KeyE' );
	await run( 2 );
	console.log( `second attempt: righting ${ cap.righting() }` );

}
// finish her
await run( 60 * 30, () => { const q = cap.game; if ( ! q ) return; if ( autoHold( q, 'good' ) ) inp.keys.add( 'KeyE' ); else inp.keys.delete( 'KeyE' ); } );
inp.keys.delete( 'KeyE' );
await run( 240 );
console.log( `after: capsized ${ b.capsized } heel ${ ( b.heel() * 180 / Math.PI ).toFixed( 0 ) } flood ${ F.get( 'naval' )?.floodState?.level?.toFixed( 2 ) } player ${ p.mode } stats ${ JSON.stringify( cap.stats ) }` );
{ const [ cx, cy, cz ] = side( 5.5, 1.6, 3.5 ); look( cx, cy, cz, b.position.x, 0.2, b.position.z ); }
await run( 20 );
writePNG( join( out, 'capsize-righted.png' ), await grab() );
app.setFreeCam( false );

// 3. diving beside her, ~4 s of air left
p.mode = 'swim'; p.floating = false;
p.position.set( ...side( bw / 2 + 2.5, - 2.2 ) );
p.pitch = 0.15;
await run( 60 * 26, () => { p.floating = false; p.velocity.set( 0, 0, 0 ); } );
const m = death.breath.ring();
console.log( `breath: air ${ death.breath.air.toFixed( 2 ) } left ${ m.left.toFixed( 1 ) } s tone ${ m.tone } vignette ${ m.vignette.toFixed( 2 ) } under ${ death.breath.under }` );
{ const img = await grab(); drawBreath( img, m, 0.3 ); writePNG( join( out, 'capsize-breath.png' ), img ); }
await run( 60 * 12, () => { p.floating = false; p.velocity.set( 0, 0, 0 ); } );
console.log( `drowned? dying ${ death.dying && death.dying.cause } deaths ${ death.stats.deaths }` );
process.exit( 0 );
