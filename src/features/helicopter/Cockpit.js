// The rescue helicopter's cockpit (wave 24A): the native WebGPU instrument face (a real six-pack: airspeed, attitude,
// altimeter, turn coordinator, heading, vertical speed; the engine and rotor gauges; the caution panel; a moving map),
// ray-operated switches on the face and on the overhead console, the accessible systems tray, and the modelled cabin
// (public/models/helicopter/cockpit.glb, tools/helicopter/build_cockpit.py: seats and harnesses, pedestal, overhead,
// the pilot's gloves and boots on the cyclic, collective and pedals) loaded only while you fly it or stand beside it.
// In sun the rotor blades' shadows sweep through the cabin; rain beads on the canopy (Model.js).
import { Mesh, BufferGeometry, BufferAttribute, Vector3, Vector4, Quaternion, Color, Matrix4 } from '../../engine/index.js';
import { Texture } from '../../engine/gpu/Texture.js';
import { GPU } from '../../engine/gpu/GPU.js';
import { generateMipmaps } from '../../engine/gpu/Mipmaps.js';
import { standard } from '../../materials/Materials.js';
import { buildInterior, loadInteriorGLB, rayScreens, LimbSet, cabinMaterial, cabinModule, ROTOR_SHADOW } from '../cars/CarInterior.js';
import { LAYERS } from '../../core/SceneRenderer.js';
import { WORLD } from '../../world/WorldLayout.js';
import { FLIGHT } from './Flight.js';
import { FUEL } from './Systems.js';

export const TEX = Object.freeze( { w: 1536, h: 576 } );
export const OVER = Object.freeze( { w: 768, h: 320 } );
export const FACE = { C: new Vector3( 0, 1.32, 1.565 ), R: new Vector3( - 1, 0, 0 ), U: new Vector3( 0, Math.cos( .22 ), Math.sin( .22 ) ), N: new Vector3( 0, Math.sin( .22 ), - Math.cos( .22 ) ), w: 1.72, h: .645 };
export const SWITCHES = [ [ 'engine', 'TURBINE', 'O' ], [ 'master', 'AVIONICS', 'U' ], [ 'hold', 'HOVER HOLD', 'Y' ], [ 'nav', 'NAV', 'N' ], [ 'landing', 'LANDING', ';' ], [ 'search', 'SEARCH', '' ], [ 'cabin', 'CABIN', '' ], [ 'ack', 'WARN ACK', '' ] ].map( ( [ id, label, key ], i ) => ( { id, label, key, x: 20 + i * 188, y: 461, w: 180, h: 92 } ) );
// the overhead console's toggles (pixels of the OVER canvas)
export const OVERHEAD = [ [ 'master', 'BATTERY' ], [ 'fuel', 'FUEL PUMP' ], [ 'engine', 'STARTER' ], [ 'nav', 'NAV LTS' ], [ 'landing', 'LDG LT' ], [ 'search', 'SEARCH LT' ], [ 'cabin', 'CABIN LT' ] ].map( ( [ id, label ], i ) => ( { id, label, x: 12 + i * 107, y: 64, w: 100, h: 190 } ) );
export function hitControl( x, y ) { return SWITCHES.find( c => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h ) || null; }
export function hitOverhead( u, v ) { const x = u * OVER.w, y = v * OVER.h; return OVERHEAD.find( c => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h ) || null; }
export function rayPanel( origin, direction ) {
	const dn = direction.dot( FACE.N ); if ( dn >= - .0001 ) return null;
	const t = FACE.C.clone().sub( origin ).dot( FACE.N ) / dn; if ( t <= 0 || t >= 3 ) return null;
	const p = direction.clone().multiplyScalar( t ).add( origin ).sub( FACE.C ), u = p.dot( FACE.R ) / FACE.w + .5, v = .5 - p.dot( FACE.U ) / FACE.h;
	return u < 0 || u > 1 || v < 0 || v > 1 ? null : { px: u * TEX.w, py: v * TEX.h, u, v, t };
}
export function buildFaceGeometry() {
	const positions = [], normals = [];
	for ( const [ x, y ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ 1, 1 ], [ - 1, 1 ] ] ) { const p = FACE.C.clone().addScaledVector( FACE.R, x * FACE.w / 2 ).addScaledVector( FACE.U, y * FACE.h / 2 ); positions.push( p.x, p.y, p.z ); normals.push( FACE.N.x, FACE.N.y, FACE.N.z ); }
	const g = new BufferGeometry(); g.setAttribute( 'position', new BufferAttribute( new Float32Array( positions ), 3 ) ); g.setAttribute( 'normal', new BufferAttribute( new Float32Array( normals ), 3 ) ); g.setAttribute( 'uv', new BufferAttribute( new Float32Array( [ 0, 0, 1, 0, 1, 1, 0, 1 ] ), 2 ) ); g.setIndex( new BufferAttribute( new Uint16Array( [ 0, 1, 2, 0, 2, 3 ] ), 1 ) ); g.computeBoundingBox(); g.computeBoundingSphere(); return g;
}
export function panelSnapshot( h ) {
	const f = h.flight, s = h.systems, c = f.controls || {};
	const speed = Math.hypot( f.velocity.x, f.velocity.z ) * 3.6;
	// derived engine readings: torque follows the collective and the speed, the turbine temperature its torque
	const run = s.running ? 1 : 0, torque = run * Math.min( 110, 32 + Math.max( 0, c.lift || 0 ) * 45 + Math.abs( c.forward || 0 ) * 20 + speed / 300 * 18 );
	return { speed, altitude: f.position.y - h.waterAt( f.position.x, f.position.z ), agl: f.agl, vs: f.velocity.y, heading: ( Math.atan2( Math.sin( f.yaw ), - Math.cos( f.yaw ) ) * 180 / Math.PI + 360 ) % 360, pitch: f.pitch * 180 / Math.PI, bank: f.roll * 180 / Math.PI,
		rpm: f.rpm * 100, ng: s.starting > 0 ? 20 + f.rpm * 60 : run * ( 62 + torque * 0.3 ), torque, tot: s.starting > 0 ? 420 + f.rpm * 900 : run * ( 480 + torque * 2.6 ) + ( 1 - run ) * Math.max( 20, f.rpm * 300 ), oil: run * 75 + ( s.starting > 0 ? 30 : 0 ),
		yawRate: ( f.engineOn && f.rpm > 0.8 ? ( c.yaw || 0 ) * FLIGHT.yaw : 0 ) * 180 / Math.PI, slip: ( c.strafe || 0 ) * 0.6 - ( c.yaw || 0 ) * 0.25,
		hp: h.hp, engine: s.running || s.starting > 0, starting: s.starting > 0, master: s.master, fuelPump: s.fuelPump !== false, fuel: s.fuel ?? 1, hold: !! s.hold, nav: s.nav, landing: s.landing, search: s.search, cabin: s.cabin,
		warnings: s.warnings.slice(), flashing: s.flashing, grounded: f.grounded, x: f.position.x, z: f.position.z, yaw: f.yaw, home: h.home ? { x: h.home.x, z: h.home.z } : null, clock: h.app?.settings?.timeOfDay ?? 12 };
}
const C = { ink: '#edf5e5', dim: '#92a7a3', aqua: '#69e6d1', amber: '#ffbc70', red: '#ff695c', green: '#59f08a', face: '#0a0d0e', bezel: '#2a2f31' };
const TAU = Math.PI * 2;
function label( c, t, x, y, size = 28, color = C.ink, align = 'left' ) { c.font = `600 ${ size }px ui-monospace,monospace`; c.fillStyle = color; c.textAlign = align; c.textBaseline = 'middle'; c.fillText( t, x, y ); }
function rect( c, x, y, w, h, color ) { c.fillStyle = color; c.fillRect( x, y, w, h ); }
function line( c, x, y, xx, yy, color, width = 3 ) { c.strokeStyle = color; c.lineWidth = width; c.beginPath(); c.moveTo( x, y ); c.lineTo( xx, yy ); c.stroke(); }
function disc( c, x, y, r, color ) { c.beginPath(); c.arc( x, y, r, 0, TAU ); c.fillStyle = color; c.fill(); }
function ring( c, x, y, r, w, color ) { c.beginPath(); c.arc( x, y, r, 0, TAU ); c.lineWidth = w; c.strokeStyle = color; c.stroke(); }
function poly( c, pts, color ) { c.beginPath(); c.moveTo( pts[ 0 ], pts[ 1 ] ); for ( let i = 2; i < pts.length; i += 2 ) c.lineTo( pts[ i ], pts[ i + 1 ] ); c.closePath(); c.fillStyle = color; c.fill(); }
const clamp = ( v, a, b ) => Math.max( a, Math.min( b, v ) );

// a round instrument: bezel, face, ticks over a sweep, numerals, a needle
function dial( c, x, y, r, frac, { title = '', marks = 10, minor = 2, labels = null, a0 = - Math.PI * 1.25, sweep = Math.PI * 1.5, arcs = null, needle = C.ink, sub = '' } = {} ) {
	disc( c, x, y, r + 8, C.bezel ); ring( c, x, y, r + 5, 2, '#596265' ); disc( c, x, y, r, C.face );
	for ( const [ a, b, col ] of arcs || [] ) { c.beginPath(); c.arc( x, y, r - 9, a0 + sweep * a, a0 + sweep * b ); c.lineWidth = 7; c.strokeStyle = col; c.stroke(); }
	const n = marks * minor;
	for ( let i = 0; i <= n; i ++ ) { const a = a0 + sweep * i / n, big = i % minor === 0, i0 = r - ( big ? 18 : 10 ); line( c, x + Math.cos( a ) * i0, y + Math.sin( a ) * i0, x + Math.cos( a ) * ( r - 3 ), y + Math.sin( a ) * ( r - 3 ), C.ink, big ? 3 : 1.5 ); if ( big && labels ) { const l = labels[ i / minor ]; if ( l !== undefined ) label( c, String( l ), x + Math.cos( a ) * ( r - 34 ), y + Math.sin( a ) * ( r - 34 ), 17, C.ink, 'center' ); } }
	if ( title ) label( c, title, x, y - r * 0.32, 15, C.dim, 'center' );
	if ( sub ) label( c, sub, x, y + r * 0.34, 15, C.dim, 'center' );
	const a = a0 + sweep * clamp( frac, 0, 1 );
	line( c, x - Math.cos( a ) * 12, y - Math.sin( a ) * 12, x + Math.cos( a ) * ( r - 12 ), y + Math.sin( a ) * ( r - 12 ), needle, 5 );
	disc( c, x, y, 7, '#3a3f41' );
}
function offFlag( c, x, y, text = 'OFF' ) { rect( c, x - 30, y - 14, 60, 28, '#c8261c' ); label( c, text, x, y, 16, '#ffffff', 'center' ); }

const _land = { grid: null, n: 0 };
// a coarse land mask of the world for the moving map (once): islands from the terrain where there is one, else circles
function landGrid( h ) {
	if ( _land.grid ) return _land;
	const N = 96, half = 1400, T = h.app?.terrainData, g = new Uint8Array( N * N );
	for ( let j = 0; j < N; j ++ ) for ( let i = 0; i < N; i ++ ) {
		const x = - half + ( i + 0.5 ) / N * half * 2, z = - half + ( j + 0.5 ) / N * half * 2;
		let land = false;
		if ( T?.heightAt ) land = T.heightAt( x, z ) > 0.4;
		else for ( const is of WORLD.islands || [] ) if ( Math.hypot( x - is.center.x, z - is.center.z ) < is.radius * 0.8 ) land = true;
		g[ j * N + i ] = land ? 1 : 0;
	}
	_land.grid = g; _land.n = N; _land.half = half;
	return _land;
}

export function drawPanel( c, s, hover = null, h = null ) {
	rect( c, 0, 0, TEX.w, TEX.h, '#1b2326' );
	for ( const x of [ 10, TEX.w - 10 ] ) for ( const y of [ 10, TEX.h - 10 ] ) disc( c, x, y, 4, '#a5aaa0' );
	label( c, 'COASTAL RESCUE  /  ROTORCRAFT', 30, 30, 22, C.dim );
	label( c, s.master ? ( s.starting ? 'STARTING' : s.engine ? 'TURBINE RUN' : 'TURBINE OFF' ) : 'AVIONICS OFF · U / SWITCH TO POWER', 1505, 30, 22, s.engine ? C.aqua : C.amber, 'right' );
	// ---- the six-pack: pneumatic instruments read without power, the gyros flag OFF
	const P = [ [ 142, 155 ], [ 390, 155 ], [ 638, 155 ], [ 142, 352 ], [ 390, 352 ], [ 638, 352 ] ], R = 88;
	dial( c, P[ 0 ][ 0 ], P[ 0 ][ 1 ], R, s.speed / 300, { title: 'AIRSPEED', sub: 'km/h', marks: 6, minor: 5, labels: [ 0, 50, 100, 150, 200, 250, 300 ], a0: - Math.PI * 0.5, sweep: Math.PI * 1.8, arcs: [ [ 0.1, 0.72, '#2fb36a' ], [ 0.72, 0.85, '#e0b020' ], [ 0.85, 0.87, '#e0392a' ] ] } );
	{ // attitude: the horizon rolls and pitches inside a round mask, the bank scale over it
		const [ x, y ] = P[ 1 ];
		disc( c, x, y, R + 8, C.bezel );
		c.save(); c.beginPath(); c.arc( x, y, R, 0, TAU ); c.clip(); c.translate( x, y );
		if ( s.master ) {
			c.rotate( - s.bank * Math.PI / 180 ); const py = clamp( s.pitch * 3.2, - 80, 80 );
			rect( c, - 200, - 200 + py, 400, 200, '#2c7fb3' ); rect( c, - 200, py, 400, 200, '#7a5232' ); line( c, - 200, py, 200, py, '#f5f0e0', 3 );
			for ( const d of [ - 20, - 10, 10, 20 ] ) { const yy = py - d * 3.2; line( c, - ( Math.abs( d ) === 10 ? 26 : 40 ), yy, Math.abs( d ) === 10 ? 26 : 40, yy, C.ink, 2 ); }
		} else rect( c, - 200, - 200, 400, 400, '#2a2f31' );
		c.restore();
		for ( const d of [ - 60, - 30, - 20, - 10, 0, 10, 20, 30, 60 ] ) { const a = - Math.PI / 2 + d * Math.PI / 180; line( c, x + Math.cos( a ) * ( R - 2 ), y + Math.sin( a ) * ( R - 2 ), x + Math.cos( a ) * ( R + 7 ), y + Math.sin( a ) * ( R + 7 ), C.ink, d % 30 ? 2 : 3 ); }
		poly( c, [ x - 50, y, x - 16, y, x - 8, y + 9, x, y, x + 8, y + 9, x + 16, y, x + 50, y, x + 50, y + 4, x - 50, y + 4 ], C.amber );
		disc( c, x, y, 4, C.amber );
		if ( ! s.master ) offFlag( c, x, y - 40 );
	}
	{ // altimeter: the long hand per 100 m, the short per 1000 m, a drum readout
		const [ x, y ] = P[ 2 ], alt = Math.max( 0, s.altitude );
		dial( c, x, y, R, ( alt % 100 ) / 100, { title: 'ALT  m', marks: 10, minor: 5, labels: [ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9 ], a0: - Math.PI / 2, sweep: TAU, needle: C.ink } );
		const a2 = - Math.PI / 2 + TAU * ( alt % 1000 ) / 1000;
		line( c, x, y, x + Math.cos( a2 ) * R * 0.5, y + Math.sin( a2 ) * R * 0.5, C.ink, 8 );
		rect( c, x - 34, y + 26, 68, 26, '#000' ); label( c, String( Math.round( alt ) ).padStart( 4, '0' ), x, y + 39, 20, C.ink, 'center' );
	}
	{ // turn coordinator: the little aircraft banks with the yaw rate, the ball slips
		const [ x, y ] = P[ 3 ];
		disc( c, x, y, R + 8, C.bezel ); disc( c, x, y, R, C.face );
		label( c, 'TURN COORDINATOR', x, y - 52, 12, C.dim, 'center' );
		for ( const a of [ - 0.35, 0.35 ] ) line( c, x + Math.cos( Math.PI + a ) * ( R - 22 ), y + Math.sin( Math.PI + a ) * ( R - 22 ), x + Math.cos( Math.PI + a ) * ( R - 6 ), y + Math.sin( Math.PI + a ) * ( R - 6 ), C.ink, 3 ), line( c, x + Math.cos( a ) * ( R - 22 ), y + Math.sin( a ) * ( R - 22 ), x + Math.cos( a ) * ( R - 6 ), y + Math.sin( a ) * ( R - 6 ), C.ink, 3 );
		label( c, 'L', x - R + 16, y + 34, 16, C.ink, 'center' ); label( c, 'R', x + R - 16, y + 34, 16, C.ink, 'center' );
		c.save(); c.translate( x, y ); c.rotate( s.master ? clamp( - s.yawRate / 3 * 0.35, - 0.7, 0.7 ) : 0 );
		line( c, - 62, 0, 62, 0, C.ink, 6 ); disc( c, 0, 0, 9, C.ink ); line( c, 0, - 8, 0, - 24, C.ink, 4 ); c.restore();
		rect( c, x - 46, y + 46, 92, 18, '#1b2a1f' ); disc( c, x + clamp( s.slip, - 1, 1 ) * 36, y + 55, 8, '#111' ); ring( c, x + clamp( s.slip, - 1, 1 ) * 36, y + 55, 8, 2, '#c9d0cc' );
		line( c, x - 11, y + 44, x - 11, y + 66, C.ink, 2 ); line( c, x + 11, y + 44, x + 11, y + 66, C.ink, 2 );
		if ( ! s.master ) offFlag( c, x, y - 18 );
	}
	{ // heading: the compass card turns under the lubber line
		const [ x, y ] = P[ 4 ];
		disc( c, x, y, R + 8, C.bezel ); disc( c, x, y, R, C.face );
		c.save(); c.translate( x, y ); c.rotate( - s.heading * Math.PI / 180 );
		for ( let d = 0; d < 360; d += 10 ) { const a = d * Math.PI / 180 - Math.PI / 2, big = d % 30 === 0; line( c, Math.cos( a ) * ( R - ( big ? 16 : 9 ) ), Math.sin( a ) * ( R - ( big ? 16 : 9 ) ), Math.cos( a ) * ( R - 3 ), Math.sin( a ) * ( R - 3 ), C.ink, big ? 3 : 1.5 ); if ( big ) { c.save(); c.rotate( d * Math.PI / 180 ); label( c, { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[ d ] ?? String( d / 10 ), 0, - R + 30, 16, d % 90 ? C.ink : C.amber, 'center' ); c.restore(); } }
		c.restore();
		poly( c, [ x, y - 30, x - 11, y + 12, x, y + 4, x + 11, y + 12 ], C.amber );
		poly( c, [ x - 7, y - R - 6, x + 7, y - R - 6, x, y - R + 8 ], C.amber );
		if ( s.home ) { const b = Math.atan2( s.home.x - s.x, s.home.z - s.z ) - s.yaw; c.save(); c.translate( x, y ); c.rotate( - b ); poly( c, [ 0, - R + 12, - 6, - R + 26, 6, - R + 26 ], C.green ); c.restore(); }
		if ( ! s.master ) offFlag( c, x, y + 40 );
	}
	// vertical speed: ±10 m/s
	dial( c, P[ 5 ][ 0 ], P[ 5 ][ 1 ], R, 0.5 + clamp( s.vs, - 10, 10 ) / 20, { title: 'VERT SPEED', sub: 'm/s', marks: 4, minor: 5, labels: [ 10, 5, 0, 5, 10 ].map( String ), a0: Math.PI * 0.5, sweep: Math.PI * 2 * 0.9, needle: C.ink } );
	label( c, 'VSI ' + ( s.vs >= 0 ? '+' : '' ) + s.vs.toFixed( 1 ) + ' m/s', P[ 5 ][ 0 ], P[ 5 ][ 1 ] + 52, 15, C.ink, 'center' );
	// ---- engine and rotor: the dual tachometer, torque, turbine temperature, fuel, oil
	{
		const x = 893, y = 140;
		dial( c, x, y, 76, s.rpm / 120, { title: 'ROTOR  Nr', marks: 6, minor: 2, labels: [ 0, 20, 40, 60, 80, 100, 120 ], a0: Math.PI * 0.75, sweep: Math.PI * 1.5, arcs: [ [ 0.79, 0.88, '#2fb36a' ], [ 0.88, 0.9, '#e0392a' ] ], needle: C.ink } );
		const a = Math.PI * 0.75 + Math.PI * 1.5 * clamp( s.ng / 120, 0, 1 );
		line( c, x, y, x + Math.cos( a ) * 52, y + Math.sin( a ) * 52, C.amber, 4 );
		label( c, 'Nr ' + Math.round( s.rpm ) + '%  N2 ' + Math.round( s.ng ) + '%', x, y + 40, 15, s.rpm >= 80 ? C.aqua : C.amber, 'center' );
		const bars = [ [ 'TRQ %', s.torque / 120, s.torque > 100 ], [ 'TOT °C', s.tot / 1000, s.tot > 850 ], [ 'FUEL', s.fuel, s.fuel <= FUEL.low ], [ 'OIL', s.oil / 100, false ] ];
		bars.forEach( ( [ t, f, warn ], i ) => {
			const bx = 790 + i * 54, by = 238, bh = 190;
			rect( c, bx, by, 34, bh, '#0b0f10' ); rect( c, bx, by + bh * ( 1 - clamp( f, 0, 1 ) ), 34, bh * clamp( f, 0, 1 ), warn ? C.red : t === 'FUEL' ? '#e8e070' : C.aqua );
			for ( let k = 0; k <= 4; k ++ ) line( c, bx - 4, by + bh * k / 4, bx, by + bh * k / 4, C.dim, 2 );
			label( c, t, bx + 17, by + bh + 16, 13, C.dim, 'center' );
		} );
	}
	// ---- the caution panel
	{
		const lamps = [ [ 'LOW ROTOR', s.warnings.includes( 'LOW ROTOR' ), C.red ], [ 'ENG OUT', ! s.engine && ! s.grounded, C.red ], [ 'HULL', s.warnings.includes( 'HULL DAMAGE' ), C.amber ],
			[ 'SINK RATE', s.warnings.includes( 'SINK RATE' ), C.red ], [ 'LOW FUEL', s.warnings.includes( 'LOW FUEL' ), C.amber ], [ 'FUEL PUMP', ! s.fuelPump, C.amber ],
			[ 'GEN', ! s.engine, C.amber ], [ 'DITCHED', s.warnings.includes( 'DITCHED' ), C.red ], [ 'HOLD', s.hold, C.green ],
			[ 'NAV LTS', s.nav, C.green ], [ 'SEARCH', s.search, C.green ], [ 'STARTER', s.starting, C.amber ] ];
		label( c, 'CAUTION', 1100, 70, 15, C.dim, 'center' );
		lamps.forEach( ( [ t, on, col ], i ) => {
			const lx = 1022 + ( i % 2 ) * 80, ly = 86 + Math.floor( i / 2 ) * 58, lit = s.master && on && ( col !== C.red || s.flashing || ! s.warnings.length || true );
			rect( c, lx, ly, 74, 48, lit ? col : '#1a1f20' ); c.lineWidth = 2; c.strokeStyle = '#3a4244'; c.strokeRect( lx, ly, 74, 48 );
			label( c, t, lx + 37, ly + 24, 12, lit ? '#101010' : '#46504f', 'center' );
		} );
		label( c, s.warnings.length ? s.warnings[ 0 ] : 'SYSTEMS NORMAL', 1100, 448, 13, s.warnings.length ? ( s.flashing ? C.red : C.amber ) : C.aqua, 'center' );
		label( c, 'AIRFRAME ' + Math.round( s.hp ) + '%', 1100, 468 - 40, 13, s.hp < 50 ? C.red : C.dim, 'center' );
	}
	// ---- the moving map: north up, 2.4 km across, the land, the home pad, the aircraft and its track
	{
		const mx = 1186, my = 60, mw = 330, mh = 390;
		rect( c, mx, my, mw, mh, '#04080a' );
		if ( s.master ) {
			c.save(); c.beginPath(); c.rect( mx, my, mw, mh ); c.clip();
			rect( c, mx, my, mw, mh, '#0b2b40' );
			const scale = mw / 2400, cx = mx + mw / 2, cy = my + mh / 2;
			if ( h ) {
				const L = landGrid( h ), cell = L.half * 2 / L.n;
				for ( let j = 0; j < L.n; j ++ ) for ( let i = 0; i < L.n; i ++ ) {
					if ( ! L.grid[ j * L.n + i ] ) continue;
					const wx = - L.half + i * cell, wz = - L.half + j * cell;
					// north up: world -z is up the screen (heading 0 = north = -z), world +x to the right
					const sx = cx + ( wx - s.x ) * scale, sy = cy + ( wz - s.z ) * scale;
					if ( sx < mx - 20 || sx > mx + mw + 20 || sy < my - 20 || sy > my + mh + 20 ) continue;
					rect( c, sx, sy, cell * scale + 1, cell * scale + 1, '#5d7d48' );
				}
			}
			for ( const r of [ 300, 600 ] ) ring( c, cx, cy, r * scale, 1, '#2f5f74' );
			label( c, '300 m', cx + 300 * scale + 4, cy - 8, 12, '#6fa8c0' );
			if ( s.home ) { const hx = cx + ( s.home.x - s.x ) * scale, hy = cy + ( s.home.z - s.z ) * scale; ring( c, hx, hy, 9, 2, C.green ); label( c, 'H', hx, hy, 12, C.green, 'center' ); }
			const fx = Math.sin( s.yaw ), fz = Math.cos( s.yaw );
			line( c, cx, cy, cx + fx * 160, cy + fz * 160, '#ffffff', 1 );
			c.save(); c.translate( cx, cy ); c.rotate( Math.atan2( fz, fx ) - Math.PI / 2 ); poly( c, [ 0, 14, - 9, - 10, 0, - 5, 9, - 10 ], C.amber ); c.restore();
			c.restore();
			rect( c, mx, my, mw, 26, '#0d1a20cc' );
			label( c, 'MAP  N↑  ' + Math.round( s.speed ) + ' km/h  ' + String( Math.round( s.heading ) % 360 ).padStart( 3, '0' ) + '°', mx + 8, my + 13, 14, C.aqua );
			label( c, 'GND ' + Math.round( s.speed ) + '   AGL ' + Math.round( s.agl ) + ' m', mx + 8, my + mh - 14, 14, s.agl < 10 ? C.amber : C.aqua );
		} else label( c, 'BATTERY / AVIONICS OFF', mx + mw / 2, my + mh / 2, 18, '#718781', 'center' );
	}
	for ( const b of SWITCHES ) {
		const on = b.id === 'ack' ? s.warnings.length > 0 : s[ b.id ]; rect( c, b.x, b.y, b.w, b.h, hover === b.id ? '#35575a' : '#23363b' ); rect( c, b.x + 12, b.y + 12, 10, 10, on ? b.id === 'ack' ? C.amber : C.aqua : '#677572' ); label( c, b.label, b.x + b.w / 2, b.y + 39, 21, C.ink, 'center' ); label( c, b.key || ( b.id === 'search' ? 'LOOK TO AIM' : b.id === 'ack' ? 'ACKNOWLEDGE' : 'CLICK' ), b.x + b.w / 2, b.y + 70, 18, C.dim, 'center' );
	}
}

// the overhead console: guarded toggles (bat up = on), their labels, a breaker row
export function drawOverhead( c, s, hover = null ) {
	rect( c, 0, 0, OVER.w, OVER.h, '#262c2e' );
	rect( c, 0, 0, OVER.w, 40, '#1b2022' );
	label( c, 'OVERHEAD · ELECTRICAL · FUEL · LIGHTS', OVER.w / 2, 21, 17, '#d9e0d6', 'center' );
	for ( const b of OVERHEAD ) {
		const on = b.id === 'engine' ? s.engine : b.id === 'fuel' ? s.fuelPump : !! s[ b.id ];
		rect( c, b.x, b.y, b.w, b.h, hover === b.id ? '#3a4a4c' : '#2f3739' );
		label( c, b.label, b.x + b.w / 2, b.y + 18, 13, '#e8ece4', 'center' );
		label( c, b.id === 'engine' ? 'START' : 'ON', b.x + b.w / 2, b.y + 42, 12, '#9fb0a8', 'center' );
		label( c, b.id === 'engine' ? 'STOP' : 'OFF', b.x + b.w / 2, b.y + 168, 12, '#9fb0a8', 'center' );
		const cx = b.x + b.w / 2, cy = b.y + 105;
		disc( c, cx, cy, 20, '#9aa3a0' ); disc( c, cx, cy, 14, '#5d6664' );
		const tipY = on ? cy - 46 : cy + 46;
		line( c, cx, cy, cx, tipY, '#d8dcd8', 11 ); disc( c, cx, tipY, 8, '#eef0ec' );
		// the guard over the battery and the fuel pump
		if ( b.id === 'master' || b.id === 'fuel' ) { c.strokeStyle = '#c8261c'; c.lineWidth = 4; c.strokeRect( cx - 26, cy - 60, 52, 120 ); }
		disc( c, b.x + 14, b.y + b.h - 14, 6, on ? ( b.id === 'engine' && s.starting ? C.amber : C.green ) : '#1a1f20' );
	}
	for ( let i = 0; i < 22; i ++ ) { disc( c, 26 + i * 33, 286, 10, '#141819' ); disc( c, 26 + i * 33, 286, 6, i % 7 === 3 ? '#c8261c' : '#5d6664' ); }
}

const _hub = new Vector4(), _axis = new Vector4(), _blade = new Vector4(), _tv = new Vector3(), _tv2 = new Vector3(), _q = new Quaternion(), _sh = new Vector3(), _hint = new Vector3();
const PEEK = 14; // m: standing this near the aircraft loads its cabin

export class HelicopterCockpit {
	constructor( h, { canvas = null, loader = null } = {} ) {
		this.h = h; this.app = h.app; this.open = false; this.elapsed = 1; this._lmb = false; this.hover = null; this.interior = null; this.limbs = []; this.rainOverride = null;
		this.canvas = canvas || this._canvas( TEX.w, TEX.h ); this.ctx = this.canvas?.getContext?.( '2d' );
		this.overCanvas = this._canvas( OVER.w, OVER.h ); this.overCtx = this.overCanvas?.getContext?.( '2d' );
		let base = '/'; try { base = ( import.meta.env && import.meta.env.BASE_URL ) || '/'; } catch { /* node */ }
		this.loader = loader || h.opts?.cockpitLoader || ( () => loadInteriorGLB( ( base.endsWith( '/' ) ? base : base + '/' ) + 'models/helicopter/cockpit.glb' ) );
		this.ready = Promise.resolve( null );
		if ( h.visual ) {
			const data = new Uint8Array( TEX.w * TEX.h * 4 ); for ( let i = 0; i < data.length; i += 4 ) { data[ i ] = 21; data[ i + 1 ] = 35; data[ i + 2 ] = 40; data[ i + 3 ] = 255; }
			this.tex = new Texture( { label: 'rescue-helicopter-instruments', width: TEX.w, height: TEX.h, format: 'rgba8unorm-srgb', mips: ! this.app.input?.touchMode, usage: [ 'sample', 'copyDst', 'render' ], data } );
			this.material = standard( { textures: { heliPanel: this.tex }, uniforms: { glow: [ 'f32', 1 ], rotorHub: [ 'vec4f', new Vector4() ], rotorAxis: [ 'vec4f', new Vector4() ], rotorBlade: [ 'vec4f', new Vector4() ] }, side: 'double', surface: 'let t = textureSample(heliPanel, smpAnisoClamp, vec2f(in.uv.x, 1.0-in.uv.y)); s.albedo=t.rgb; s.roughness=0.3; s.metalness=0.0; s.clearcoat=1.0; s.clearcoatRoughness=0.05; s.emissive=t.rgb*mat.glow*(0.25+frame.night*1.2);', modules: [ cabinModule ], output: ROTOR_SHADOW } );
			this.mesh = new Mesh( buildFaceGeometry(), this.material ); this.mesh.name = 'live-rescue-flight-panel'; h.visual.root.add( this.mesh );
			const odata = new Uint8Array( OVER.w * OVER.h * 4 ).fill( 40 );
			this.overTex = new Texture( { label: 'rescue-helicopter-overhead', width: OVER.w, height: OVER.h, format: 'rgba8unorm-srgb', mips: false, usage: [ 'sample', 'copyDst', 'render' ], data: odata } );
		}
		this._move = e => { this.mouse = { x: e.clientX, y: e.clientY }; }; this._escape = e => { if ( e.code === 'Escape' && this.open ) { this.close(); e.preventDefault(); e.stopImmediatePropagation(); } };
		if ( typeof window !== 'undefined' ) { window.addEventListener( 'mousemove', this._move ); window.addEventListener( 'keydown', this._escape, true ); }
	}
	_canvas( w, h ) { return typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas( w, h ) : typeof document !== 'undefined' ? Object.assign( document.createElement( 'canvas' ), { width: w, height: h } ) : null; }
	// (headless captures install a software 2D canvas after the feature exists)
	useSoftCanvas() { this.canvas = this._canvas( TEX.w, TEX.h ); this.ctx = this.canvas?.getContext?.( '2d' ); this.overCanvas = this._canvas( OVER.w, OVER.h ); this.overCtx = this.overCanvas?.getContext?.( '2d' ); this.signature = null; }
	close() { this.open = false; if ( this.tray ) this.tray.hidden = true; }
	toggle() {
		this.open = ! this.open;
		// Input tracks the browser's pointerlockchange; it has no unlock() method.
		// Mark the feature open first so PauseMenu treats this release as a modal.
		if ( this.open && globalThis.document?.pointerLockElement ) { try { document.exitPointerLock?.(); } catch { /* browsers without pointer lock still expose the tray */ } }
		this.dom();
	}
	aim() {
		const cam = this.app.camera; if ( ! cam ) return null;
		const origin = cam.position.clone(), direction = new Vector3( 0, 0, - 1 ).applyQuaternion( cam.quaternion ), inp = this.app.input;
		if ( ! inp?.locked && ! inp?.touchMode && this.mouse && inp?.dom?.getBoundingClientRect ) { const r = inp.dom.getBoundingClientRect(); if ( r.width && r.height ) { cam.updateMatrixWorld?.(); direction.set( ( this.mouse.x - r.left ) / r.width * 2 - 1, 1 - ( this.mouse.y - r.top ) / r.height * 2, .5 ).unproject( cam ).sub( origin ).normalize(); } }
		if ( this.h.systems.search ) this.h.systems.aim( direction );
		const inv = new Quaternion().copy( this.h.flight.quaternion ).invert(); origin.sub( this.h.flight.position ).applyQuaternion( inv ); direction.applyQuaternion( inv ); this.hit = rayPanel( origin, direction );
		if ( this.hit ) return hitControl( this.hit.px, this.hit.py );
		// the overhead console (the cabin's own screen mesh; local to the aircraft like the ray)
		if ( this.interior?.screens.overhead ) {
			const hit = rayScreens( this.interior, origin, direction, 2 );
			if ( hit ) { this.overHit = hit; const b = hitOverhead( hit.u, hit.v ); return b ? { ...b, overhead: true } : null; }
		}
		return null;
	}
	_wanted() {
		const h = this.h, p = this.app.player?.position;
		if ( ! h.visual ) return false;
		if ( h.piloted ) return true;
		return !! p && Math.hypot( p.x - h.flight.position.x, p.z - h.flight.position.z ) < PEEK && Math.abs( p.y - h.flight.position.y ) < 8;
	}
	_load() {
		if ( ! this._gltfP ) this._gltfP = Promise.resolve().then( () => this.loader() ).then( g => { this.gltf = g || null; return g; } ).catch( e => { console.warn( 'helicopter: no cockpit model', e?.message || e ); this.gltf = null; return null; } );
		this.ready = this._gltfP;
		return this._gltfP;
	}
	_build() {
		const h = this.h;
		const it = this.interior = buildInterior( this.gltf, { screenTexture: this.overTex, regions: { overhead: { x: 0, y: 0, w: OVER.w, h: OVER.h } }, atlas: OVER, rotor: true, layers: LAYERS.TRANSPARENT } );
		it.group.name = 'rescue-helicopter-cockpit';
		h.visual.root.add( it.group ); h.visual.setDetailed?.( true );
		// the pilot's olive flight suit (one batched cloth draw for the four limbs)
		const suit = cabinMaterial( 'Cloth_Suit', { color: new Color( 1, 1, 1 ), batched: true } );
		it.materials.set( 'Cloth_Suit', suit );
		this.limbSet = new LimbSet( suit, it.group );
		const olive = new Color( 0.07, 0.085, 0.055 );
		this.limbs = [ 0, 1, 2, 3 ].map( i => this.limbSet.limb( i < 2 ? [ 0.05, 0.043, 0.034 ] : [ 0.08, 0.062, 0.046 ], olive ) );
		this.body = [ this.limbSet.mesh ];
		it.group.traverse( m => { if ( m.isMesh && /Glove|Shoe/.test( m.name ) ) this.body.push( m ); } );
	}
	_release() {
		this.limbSet?.dispose(); this.limbSet = null; this.limbs = []; this.body = [];
		if ( this.interior ) { this.interior.dispose(); this.interior = null; this.h.visual?.setDetailed?.( false ); }
	}
	// the controls (Model.js poses them from the commands), the pilot's limbs, the rotor's shadow, the cabin light
	_pose( first ) {
		const h = this.h, it = this.interior, v = h.visual;
		it.nodes.get( 'Cyclic' )?.quaternion.copy( v.cyclic.quaternion );
		it.nodes.get( 'Collective' )?.quaternion.copy( v.collective.quaternion );
		const pl = it.nodes.get( 'Pedal_L' ), pr = it.nodes.get( 'Pedal_R' );
		if ( pl ) pl.position.copy( v.pedals[ 1 ].position ); if ( pr ) pr.position.copy( v.pedals[ 0 ].position );
		const show = first && h.piloted;
		for ( const m of this.body ) m.visible = show;
		if ( show ) {
			const e = h.vehicle.eye;
			for ( const [ i, side, wrist ] of [ [ 0, 1, 'Wrist_L' ], [ 1, - 1, 'Wrist_R' ] ] ) {
				const w = it.point( wrist, _tv ); if ( ! w ) continue;
				this.limbs[ i ].reach( _sh.set( e[ 0 ] + side * 0.2, e[ 1 ] - 0.26, e[ 2 ] - 0.12 ), w, 0.31, 0.3, _hint.set( side * 0.8, - 0.7, 0 ) );
			}
			for ( const [ i, side, ankle ] of [ [ 2, 1, 'Ankle_L' ], [ 3, - 1, 'Ankle_R' ] ] ) {
				const a = it.point( ankle, _tv ); if ( ! a ) continue;
				this.limbs[ i ].reach( _sh.set( e[ 0 ] + side * 0.11, 1.07, - 0.15 ), a, 0.52, 0.5, _hint.set( side * 0.1, 1, 0.3 ) );
			}
			this.limbSet.commit();
		}
		// the blades' shadow: hub, mast axis and one blade in world space (Model.js: mast at 0,3.19,-0.4; blades along z)
		const f = h.flight;
		f.toWorld( [ 0, 3.19, - 0.4 ], _tv2 ); _hub.set( _tv2.x, _tv2.y, _tv2.z, 0 );
		_tv.set( 0, 1, 0 ).applyQuaternion( f.quaternion ); _axis.set( _tv.x, _tv.y, _tv.z, f.rpm > 0.02 ? 5.05 : 0 );
		_q.copy( f.quaternion ).multiply( v.mainRotor.quaternion ); _tv.set( 0, 0, 1 ).applyQuaternion( _q ); _blade.set( _tv.x, _tv.y, _tv.z, 0 );
		const s = h.systems, cabinOn = s.master && s.cabin;
		it.set( { cabin: _cabin.setRGB( cabinOn ? 0.03 : 0, cabinOn ? 0.006 : 0, cabinOn ? 0.004 : 0 ), power: s.master ? 1 : 0.08, glow: s.master ? 1 : 0, rotorHub: _hub, rotorAxis: _axis, rotorBlade: _blade } );
		if ( this.material?.uniforms.rotorHub ) { this.material.uniforms.rotorHub.value.copy( _hub ); this.material.uniforms.rotorAxis.value.copy( _axis ); this.material.uniforms.rotorBlade.value.copy( _blade ); }
	}
	update( dt ) {
		const h = this.h, first = h.piloted && this.app.player?.view === 'first', blocked = h.blocked();
		if ( ! h.piloted || h.blocked( true ) ) this.close();
		// the cabin model: loaded while you fly or stand by the aircraft, released a few seconds after you walk off
		const want = this._wanted();
		this._away = want ? 0 : ( this._away || 0 ) + dt;
		if ( want && ! this.interior ) { if ( this.gltf ) this._build(); else this._load(); }
		if ( ! want && this.interior && this._away > 4 ) this._release();
		if ( this.interior ) this._pose( first );
		// rain on the canopy
		const rain = this.rainOverride ?? ( () => { const w = h.features?.get?.( 'weather' ), c = w && w.current; return w && Number.isFinite( w.rain ) ? w.rain : c && Number.isFinite( c.rain ) ? c.rain : 0; } )();
		h.visual?.setRain?.( rain, Math.hypot( h.flight.velocity.x, h.flight.velocity.z ) );
		this.hover = first && ! blocked ? this.aim() : null;
		const down = !! ( this.app.input?.mouseDown && this.app.input?.enabled !== false ); if ( down && ! this._lmb && this.hover ) h.act( this.hover.id ); this._lmb = down;
		this.elapsed += dt; if ( this.elapsed >= ( first ? .1 : h.piloted ? .3 : 1 ) ) { this.elapsed = 0; this.draw(); this.dom(); }
		if ( this.material ) this.material.uniforms.glow.value = h.systems.master ? 1 : 0;
		if ( this.tip ) { this.tip.hidden = ! first || blocked; this.tip.textContent = this.hover ? '● ' + this.hover.label + ( this.hover.key ? ' [' + this.hover.key + ']' : '' ) + ' · click' : 'Look down to instruments, up to the overhead · aim and click switches · 3 systems'; }
	}
	_upload( tex, canvas, ctx, w, hgt ) {
		if ( ! tex ) return;
		if ( GPU.device && ! tex.gpu ) tex.getGPU();
		if ( GPU.device && GPU.queue?.copyExternalImageToTexture && tex.gpu && ! this.noCopy ) { try { GPU.queue.copyExternalImageToTexture( { source: canvas }, { texture: tex.gpu }, { width: w, height: hgt } ); if ( tex.mipLevelCount > 1 ) generateMipmaps( tex ); return; } catch { this.noCopy = true; } }
		if ( ctx.getImageData ) { const pixels = ctx.getImageData( 0, 0, w, hgt ).data; const bytes = new Uint8Array( pixels.buffer, pixels.byteOffset, pixels.byteLength ); if ( GPU.device && tex.gpu ) { tex.upload( bytes ); if ( tex.mipLevelCount > 1 ) generateMipmaps( tex ); } else tex.pendingData = bytes; }
	}
	draw() {
		if ( ! this.ctx ) return;
		const snapshot = panelSnapshot( this.h ), signature = JSON.stringify( snapshot, ( k, v ) => typeof v === 'number' ? Math.round( v * 10 ) / 10 : v ) + ( this.hover?.id || '' ) + ( this.hover?.overhead ? 'o' : '' );
		if ( signature === this.signature ) return; this.signature = signature;
		drawPanel( this.ctx, snapshot, this.hover && ! this.hover.overhead ? this.hover.id : null, this.h );
		this._upload( this.tex, this.canvas, this.ctx, TEX.w, TEX.h );
		if ( this.overCtx && ( this.interior || ! this.tex ) ) { drawOverhead( this.overCtx, snapshot, this.hover?.overhead ? this.hover.id : null ); this._upload( this.overTex, this.overCanvas, this.overCtx, OVER.w, OVER.h ); }
	}
	dom() {
		if ( typeof document === 'undefined' || ! document.body ) return;
		if ( ! this.tray ) {
			this.tray = document.createElement( 'section' ); this.tray.setAttribute( 'role', 'dialog' ); this.tray.setAttribute( 'aria-label', 'Rescue helicopter systems' ); this.tray.style.cssText = 'position:fixed;left:50%;bottom:max(16px,env(safe-area-inset-bottom));transform:translateX(-50%);width:min(580px,92vw);max-height:70vh;overflow:auto;background:#142b30f7;border:1px solid #6cad9b;padding:18px;border-radius:14px;z-index:190;color:#eaf3de;font:14px/1.5 system-ui;box-shadow:0 8px 40px #0008';
			const title = document.createElement( 'strong' ); title.textContent = 'COASTAL RESCUE · COCKPIT SYSTEMS'; this.tray.append( title );
			this.status = document.createElement( 'p' ); this.tray.append( this.status );
			const grid = document.createElement( 'div' ); grid.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px'; this.buttons = new Map();
			for ( const s of [ ...SWITCHES, { id: 'fuel', label: 'FUEL PUMP', key: '' }, { id: 'panel', label: 'RESUME FLIGHT', key: '3 / Esc' } ] ) { const b = document.createElement( 'button' ); b.type = 'button'; b.style.cssText = 'min-height:48px;padding:9px;border:1px solid #77988e;border-radius:7px;background:#243f44;color:#edf4df;font:600 13px system-ui;cursor:pointer'; b.addEventListener( 'click', e => { e.stopPropagation(); this.h.act( s.id, 'tray' ); this.dom(); } ); grid.append( b ); this.buttons.set( s.id, { el: b, def: s } ); }
			this.tray.append( grid ); const notes = document.createElement( 'p' ); notes.textContent = 'Boarding auto-cranks the turbine. Wait for rotor ≥80%. O starts/stops on ground; U powers avionics; the overhead console holds the battery, fuel pump, starter and light switches. Y holds position and altitude; manual input releases. Searchlight follows your cockpit view. Land on a helipad with the turbine stopped to refuel. Flight controls pause while this tray is open. Shift rise · C descend · Space brake · V view · E exit after landing.'; notes.style.cssText = 'font-size:12px;color:#b7cbc1;margin-bottom:0'; this.tray.append( notes ); this.tray.addEventListener( 'pointerdown', e => e.stopPropagation() ); document.body.append( this.tray );
			this.tip = document.createElement( 'div' ); this.tip.style.cssText = 'position:fixed;left:50%;bottom:26px;transform:translateX(-50%);padding:5px 10px;background:#12282bd9;color:#e7edd5;border-radius:6px;font:12px system-ui;pointer-events:none;z-index:84;max-width:80vw;text-align:center'; document.body.append( this.tip );
		}
		this.tray.hidden = ! this.open; if ( ! this.open ) return;
		const s = panelSnapshot( this.h ); this.status.textContent = `${ s.starting ? 'STARTING' : s.engine ? 'TURBINE RUNNING' : 'TURBINE OFF' } · ROTOR ${ Math.round( s.rpm ) }% · ${ Math.round( s.speed ) } km/h · ALT ${ Math.round( s.altitude ) } m · AGL ${ Math.round( s.agl ) } m · VSI ${ s.vs.toFixed( 1 ) } m/s · FUEL ${ Math.round( s.fuel * 100 ) }% · HULL ${ Math.round( s.hp ) }%${ s.warnings.length ? ' · ' + s.warnings.join( ' · ' ) : '' }`;
		for ( const [ id, b ] of this.buttons ) { const on = id === 'ack' ? s.warnings.length > 0 : id === 'fuel' ? s.fuelPump : !! s[ id ]; b.el.textContent = b.def.label + ( id === 'panel' ? '' : ' · ' + ( on ? 'ON' : 'OFF' ) ) + ( b.def.key ? ' [' + b.def.key + ']' : '' ); if ( id !== 'panel' && id !== 'ack' ) b.el.setAttribute( 'aria-pressed', String( on ) ); b.el.style.borderColor = on ? '#6ee3be' : '#77988e'; }
	}
	dispose() { this.close(); this._release(); if ( typeof window !== 'undefined' ) { window.removeEventListener( 'mousemove', this._move ); window.removeEventListener( 'keydown', this._escape, true ); } this.tray?.remove(); this.tip?.remove(); this.mesh?.removeFromParent(); this.mesh?.geometry.dispose(); this.material?.dispose(); this.tex?.destroy(); this.overTex?.destroy(); }
}
const _cabin = new Color();
