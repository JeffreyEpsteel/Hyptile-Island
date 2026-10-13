// The seaplane's cockpit: a live instrument panel in the model (a canvas-drawn face on a quad at GEOM.panel, redrawn
// ~10 Hz in first person, uploaded as a texture with an emissive night glow), its clickable switches (a ray from the
// eye or the mouse against the panel: hover highlight and a tooltip with the key), the first-person HUD rule (the
// desktop HUD steps off the windscreen; toasts and prompts stay) and the slim instrument strip of the chase view.
//
//   const cp = new Cockpit( seaplane );   cp.update( dt );   cp.dispose()
//   panelSnapshot( seaplane ) -> plain numbers the face shows;  drawPanel( ctx, snap )  (any 2D context)
//   rayPanel( origin, dir ) -> { px, py, u, v, t } | null   (model frame: where a ray meets the face, in canvas px)
//   hitControl( px, py ) -> CONTROLS entry | null;   CONTROLS: { id, label, key, x, y, w, h, act }  (canvas px)
//
// The face (TEX.w x TEX.h px, the pilot's left first): the six-pack in front of the left seat (airspeed m/s with
// knots, attitude with pitch ladder and bank, altimeter m, rpm + throttle, heading card, vertical speed), then the
// warning lamps (stall, master warning, fuel low, starter, autopilot, water rudder), the fuel and hull bars, the
// flap lever, the trim wheel, the radio (bearing / distance home, endurance; opens the world map) and the switches
// (master, engine start / stop, nav lights, landing light, autopilot).

import { Mesh, BufferGeometry, BufferAttribute, Vector3, Quaternion } from '../../engine/index.js';
import { Texture } from '../../engine/gpu/Texture.js';
import { GPU } from '../../engine/gpu/GPU.js';
import { generateMipmaps } from '../../engine/gpu/Mipmaps.js';
import { standard } from '../../materials/Materials.js';
import { GEOM, SPEC } from './Flight.js';
import { FUEL } from './Systems.js';
import { SITE } from './Site.js';
import { t } from '../../i18n/index.js';

export const TEX = { w: 1024, h: 336 };
const DEG = 180 / Math.PI;
const SIX = { r: 70, xs: [ 88, 243, 398 ], ys: [ 84, 248 ] }; // six-pack centres (the left seat's line is x 243)
const LAMP = { x: 484, y: 12, w: 82, h: 44, gap: 6 };
const SW = { x: 484, y: 222, w: 98, h: 102, gap: 8 };
const KT = 1.94384;

const lamp = ( i ) => ( { x: LAMP.x + i * ( LAMP.w + LAMP.gap ), y: LAMP.y, w: LAMP.w, h: LAMP.h } );
const sw = ( i ) => ( { x: SW.x + i * ( SW.w + SW.gap ), y: SW.y, w: SW.w, h: SW.h } );
const gauge = ( c, r ) => ( { x: SIX.xs[ c ] - SIX.r, y: SIX.ys[ r ] - SIX.r, w: SIX.r * 2, h: SIX.r * 2 } );

// act: a click does something (Seaplane.act( id )); the rest only name themselves on hover
export const CONTROLS = [
	{ id: 'master', label: 'Master switch (battery)', key: 'U', act: true, ...sw( 0 ) },
	{ id: 'engine', label: 'Engine start / stop', key: 'O', act: true, ...sw( 1 ) },
	{ id: 'nav', label: 'Navigation lights', key: 'N', act: true, ...sw( 2 ) },
	{ id: 'landing', label: 'Landing light', key: ';', act: true, ...sw( 3 ) },
	{ id: 'ap', label: 'Autopilot: wings level, altitude hold', key: 'Y', act: true, ...sw( 4 ) },
	{ id: 'warn', label: 'Master warning: click to silence', key: '', act: true, ...lamp( 1 ) },
	{ id: 'flapsUp', label: 'Flaps up', key: '[', act: true, x: 630, y: 66, w: 72, h: 70 },
	{ id: 'flapsDown', label: 'Flaps down', key: ']', act: true, x: 630, y: 136, w: 72, h: 72 },
	{ id: 'trimDown', label: 'Trim: nose down', key: '-', act: true, x: 716, y: 66, w: 92, h: 70 },
	{ id: 'trimUp', label: 'Trim: nose up', key: '=', act: true, x: 716, y: 136, w: 92, h: 72 },
	{ id: 'map', label: 'Radio: open the world map', key: 'M', act: true, x: 822, y: 66, w: 184, h: 142 },
	{ id: 'asi', label: 'Airspeed (m/s, knots)', ...gauge( 0, 0 ) },
	{ id: 'att', label: 'Attitude: pitch and bank', ...gauge( 1, 0 ) },
	{ id: 'alt', label: 'Altimeter (m above the sea)', ...gauge( 2, 0 ) },
	{ id: 'rpm', label: 'Engine rpm and throttle', ...gauge( 0, 1 ) },
	{ id: 'hdg', label: 'Heading', ...gauge( 1, 1 ) },
	{ id: 'vsi', label: 'Vertical speed (m/s)', ...gauge( 2, 1 ) },
	{ id: 'fuel', label: 'Fuel', x: 488, y: 66, w: 60, h: 142 },
	{ id: 'hull', label: 'Hull condition', x: 556, y: 66, w: 60, h: 142 },
	{ id: 'stallLamp', label: 'Stall warning', ...lamp( 0 ) },
	{ id: 'fuelLamp', label: 'Fuel low', ...lamp( 2 ) },
	{ id: 'startLamp', label: 'Starter engaged', ...lamp( 3 ) },
	{ id: 'apLamp', label: 'Autopilot engaged', ...lamp( 4 ) },
	{ id: 'rudderLamp', label: 'Water rudder down (on the water)', ...lamp( 5 ) },
];

export function hitControl( px, py ) {

	for ( const c of CONTROLS ) if ( px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h ) return c;
	return null;

}

// the face's frame in the model: centre C, R (canvas +x: the pilot's right = -X), U (canvas up), N (towards the pilot)
const P = GEOM.panel;
export const FACE = {
	C: new Vector3( ...P.c ),
	R: new Vector3( - 1, 0, 0 ),
	U: new Vector3( 0, Math.cos( P.tilt ), Math.sin( P.tilt ) ),
	N: new Vector3( 0, Math.sin( P.tilt ), - Math.cos( P.tilt ) ),
	w: P.w, h: P.h,
};

const _d = new Vector3(), _p = new Vector3();

export function rayPanel( o, d, maxT = 3 ) {

	const dn = d.x * FACE.N.x + d.y * FACE.N.y + d.z * FACE.N.z;
	if ( dn > - 1e-4 ) return null; // from behind or edge on
	_d.copy( FACE.C ).sub( o );
	const tt = _d.dot( FACE.N ) / dn;
	if ( ! ( tt > 0 && tt < maxT ) ) return null;
	_p.copy( d ).multiplyScalar( tt ).add( o ).sub( FACE.C );
	const u = _p.dot( FACE.R ) / FACE.w + 0.5, v = 0.5 - _p.dot( FACE.U ) / FACE.h;
	if ( u < 0 || u > 1 || v < 0 || v > 1 ) return null;
	return { u, v, px: u * TEX.w, py: v * TEX.h, t: tt };

}

export function buildFaceGeometry() {

	const { C, R, U, N, w, h } = FACE;
	const corner = ( sx, sy ) => C.clone().addScaledVector( R, sx * w / 2 ).addScaledVector( U, sy * h / 2 );
	const bl = corner( - 1, - 1 ), br = corner( 1, - 1 ), tr = corner( 1, 1 ), tl = corner( - 1, 1 );
	const pos = new Float32Array( [ bl.x, bl.y, bl.z, br.x, br.y, br.z, tr.x, tr.y, tr.z, tl.x, tl.y, tl.z ] );
	const nrm = new Float32Array( [ N.x, N.y, N.z, N.x, N.y, N.z, N.x, N.y, N.z, N.x, N.y, N.z ] );
	const uv = new Float32Array( [ 0, 0, 1, 0, 1, 1, 0, 1 ] );
	const g = new BufferGeometry();
	g.setAttribute( 'position', new BufferAttribute( pos, 3 ) );
	g.setAttribute( 'normal', new BufferAttribute( nrm, 3 ) );
	g.setAttribute( 'uv', new BufferAttribute( uv, 2 ) );
	g.setIndex( new BufferAttribute( new Uint16Array( [ 0, 1, 2, 0, 2, 3 ] ), 1 ) );
	g.computeBoundingBox();
	g.computeBoundingSphere();
	return g;

}

// ---------------------------------------------------------------- what the face shows

const wrap360 = ( a ) => ( ( a % 360 ) + 360 ) % 360;
const _fw = new Vector3();

export function panelSnapshot( sp, hover = null ) {

	const f = sp.flight, sys = sp.systems, pilot = sp.pilot;
	const fwd = f.toWorldXYZ( 0, 0, 1, _fw ).sub( f.position );
	const sea = f.seaLevel();
	const dx = SITE.berth.x - f.position.x, dz = SITE.berth.z - f.position.z;
	const S = f.spec || SPEC; // (wave 12: the airframe's tank and burn)
	const burn = ( S.fuelIdle + ( 1 - S.fuelIdle ) * f.rpm ) / ( S.fuelMinutes * 60 );
	return {
		airspeed: f.airspeed, alt: Math.max( 0, f.position.y - sea + 0.2 ), vs: f.velocity.y,
		pitch: f.pitchAngle() * DEG, bank: f.rollAngle() * DEG,
		heading: wrap360( Math.atan2( fwd.x, - fwd.z ) * DEG ), // compass: north is -z (the HUD's convention)
		rpm: f.engineOn ? 600 + 1600 * f.rpm : f.rpm * 2200, throttle: f.controls.throttle || 0,
		fuel: f.fuel, litres: f.fuel * ( S.litres || FUEL.litres ), endurance: f.engineOn && burn > 0 ? f.fuel / burn / 60 : null,
		hp: sp.hp, flapPos: f.flapPos, flaps: f.flaps, notches: f.notches || 2, trim: pilot.trim, name: S.name || 'Jade', engineOut: !! ( f.engineFail && f.engineFail.some( Boolean ) ),
		master: sys.master, engineOn: f.engineOn, cranking: sys.cranking, nav: sys.nav, landing: sys.landing, ap: sys.apOn,
		stall: sys.stallWarn, warn: sys.master && sys.masterWarn, flash: sys.flash, fuelLow: sys.master && sys.fuelLow,
		rudderDown: sys.rudderDown, airborne: f.airborne,
		homeBearing: wrap360( Math.atan2( dx, - dz ) * DEG ), homeDist: Math.hypot( dx, dz ),
		hover,
	};

}

// ---------------------------------------------------------------- drawing (plain 2D canvas calls)

const INK = '#eef2ee', DIM = '#7d8a86', FACE_C = '#14181b', BEZEL = '#07090a', PANEL_C = '#1f2427', AQUA = '#5fe3d4', AMBER = '#ffb347', RED = '#ff4b3e', GREEN = '#59e08a';
const FONT = '"Segoe UI", system-ui, sans-serif';
const clamp = ( v, a, b ) => Math.max( a, Math.min( b, v ) );

// a = radians clockwise from twelve o'clock
function polar( cx, cy, r, a ) {

	return [ cx + r * Math.sin( a ), cy - r * Math.cos( a ) ];

}

function text( ctx, s, x, y, px, color = INK, w = 700, align = 'center' ) {

	ctx.font = `${ w } ${ px }px ${ FONT }`;
	ctx.fillStyle = color;
	ctx.textAlign = align;
	ctx.textBaseline = 'middle';
	ctx.fillText( s, x, y );

}

function circle( ctx, cx, cy, r, color ) {

	ctx.beginPath();
	ctx.arc( cx, cy, r, 0, Math.PI * 2 );
	ctx.fillStyle = color;
	ctx.fill();

}

function dial( ctx, cx, cy, r ) {

	circle( ctx, cx, cy, r + 4, BEZEL );
	circle( ctx, cx, cy, r, FACE_C );

}

function ticks( ctx, cx, cy, r, a0, a1, n, len, width = 2, color = INK ) {

	ctx.strokeStyle = color;
	ctx.lineWidth = width;
	ctx.lineCap = 'butt';
	ctx.beginPath();
	for ( let i = 0; i <= n; i ++ ) {

		const a = n ? a0 + ( a1 - a0 ) * i / n : a0;
		const [ x1, y1 ] = polar( cx, cy, r, a ), [ x2, y2 ] = polar( cx, cy, r - len, a );
		ctx.moveTo( x1, y1 );
		ctx.lineTo( x2, y2 );

	}

	ctx.stroke();

}

function arcBand( ctx, cx, cy, r, a0, a1, color, width ) {

	ctx.strokeStyle = color;
	ctx.lineWidth = width;
	ctx.lineCap = 'butt';
	ctx.beginPath();
	ctx.arc( cx, cy, r, a0 - Math.PI / 2, a1 - Math.PI / 2 );
	ctx.stroke();

}

function needle( ctx, cx, cy, a, len, width, color = INK, tail = 12 ) {

	const [ x1, y1 ] = polar( cx, cy, len, a ), [ x0, y0 ] = polar( cx, cy, - tail, a );
	ctx.strokeStyle = color;
	ctx.lineWidth = width;
	ctx.lineCap = 'round';
	ctx.beginPath();
	ctx.moveTo( x0, y0 );
	ctx.lineTo( x1, y1 );
	ctx.stroke();
	circle( ctx, cx, cy, width + 2, '#2a2f33' );

}

function rrect( ctx, x, y, w, h, r ) {

	ctx.beginPath();
	ctx.moveTo( x + r, y );
	ctx.lineTo( x + w - r, y );
	ctx.arcTo( x + w, y, x + w, y + r, r );
	ctx.lineTo( x + w, y + h - r );
	ctx.arcTo( x + w, y + h, x + w - r, y + h, r );
	ctx.lineTo( x + r, y + h );
	ctx.arcTo( x, y + h, x, y + h - r, r );
	ctx.lineTo( x, y + r );
	ctx.arcTo( x, y, x + r, y, r );
	ctx.closePath();

}

function box( ctx, x, y, w, h, color, r = 8 ) {

	rrect( ctx, x, y, w, h, r );
	ctx.fillStyle = color;
	ctx.fill();

}

function drawASI( ctx, cx, cy, r, s ) {

	dial( ctx, cx, cy, r );
	const A0 = - 150 / DEG, A1 = 150 / DEG, MAX = 80;
	const ang = ( v ) => A0 + ( A1 - A0 ) * clamp( v / MAX, 0, 1 );
	// white: the flap range, green: normal, amber: caution, the red line at 70 m/s
	arcBand( ctx, cx, cy, r - 6, ang( 17 ), ang( 35 ), INK, 5 );
	arcBand( ctx, cx, cy, r - 12, ang( 22 ), ang( 55 ), GREEN, 5 );
	arcBand( ctx, cx, cy, r - 12, ang( 55 ), ang( 70 ), AMBER, 5 );
	ticks( ctx, cx, cy, r - 2, A0, A1, 16, 7, 2 );
	ticks( ctx, cx, cy, r - 2, ang( 70 ), ang( 70 ), 0, 16, 4, RED );
	for ( let v = 0; v <= MAX; v += 20 ) {

		const [ x, y ] = polar( cx, cy, r - 31, ang( v ) );
		text( ctx, String( v ), x, y, 17 );

	}

	text( ctx, 'm/s', cx, cy - 24, 13, DIM, 600 );
	text( ctx, `${ Math.round( s.airspeed * KT ) } kt`, cx, cy + 30, 17, AQUA );
	needle( ctx, cx, cy, ang( s.airspeed ), r - 12, 4 );

}

function drawATT( ctx, cx, cy, r, s ) {

	ctx.save();
	ctx.beginPath();
	ctx.arc( cx, cy, r, 0, Math.PI * 2 );
	ctx.clip();
	ctx.translate( cx, cy );
	// banking right turns the horizon the other way; pitching up lowers it
	ctx.rotate( - s.bank / DEG );
	const k = 2.4; // px per degree of pitch
	const off = clamp( s.pitch, - 40, 40 ) * k;
	ctx.fillStyle = '#2f7fc1';
	ctx.fillRect( - r * 2, - r * 3 + off, r * 4, r * 3 );
	ctx.fillStyle = '#7a4f2a';
	ctx.fillRect( - r * 2, off, r * 4, r * 3 );
	ctx.strokeStyle = INK;
	ctx.lineWidth = 2.5;
	ctx.beginPath();
	ctx.moveTo( - r * 2, off );
	ctx.lineTo( r * 2, off );
	ctx.stroke();
	// the pitch ladder every 5 degrees, numbered at 10 and 20
	ctx.lineWidth = 2;
	for ( let p = - 20; p <= 20; p += 5 ) {

		if ( ! p ) continue;
		const y = off - p * k, half = p % 10 === 0 ? 24 : 12;
		ctx.strokeStyle = INK;
		ctx.beginPath();
		ctx.moveTo( - half, y );
		ctx.lineTo( half, y );
		ctx.stroke();
		if ( p % 10 === 0 ) {

			text( ctx, String( Math.abs( p ) ), - half - 13, y, 13 );
			text( ctx, String( Math.abs( p ) ), half + 13, y, 13 );

		}

	}

	// the bank pointer turns with the horizon
	ctx.fillStyle = INK;
	ctx.beginPath();
	ctx.moveTo( 0, - r + 14 );
	ctx.lineTo( - 7, - r + 26 );
	ctx.lineTo( 7, - r + 26 );
	ctx.closePath();
	ctx.fill();
	ctx.restore();
	// the fixed bank scale, its index and the little plane
	for ( const b of [ - 60, - 30, - 20, - 10, 10, 20, 30, 60 ] ) ticks( ctx, cx, cy, r - 2, b / DEG, b / DEG, 0, b % 30 === 0 ? 12 : 7, 2.5 );
	ctx.fillStyle = AMBER;
	ctx.beginPath();
	ctx.moveTo( cx, cy - r + 13 );
	ctx.lineTo( cx - 7, cy - r + 2 );
	ctx.lineTo( cx + 7, cy - r + 2 );
	ctx.closePath();
	ctx.fill();
	ctx.strokeStyle = AMBER;
	ctx.lineWidth = 5;
	ctx.lineCap = 'round';
	ctx.beginPath();
	ctx.moveTo( cx - 42, cy );
	ctx.lineTo( cx - 16, cy );
	ctx.lineTo( cx - 8, cy + 9 );
	ctx.moveTo( cx + 42, cy );
	ctx.lineTo( cx + 16, cy );
	ctx.lineTo( cx + 8, cy + 9 );
	ctx.stroke();
	circle( ctx, cx, cy, 3.5, AMBER );
	ctx.beginPath();
	ctx.arc( cx, cy, r + 2, 0, Math.PI * 2 );
	ctx.strokeStyle = BEZEL;
	ctx.lineWidth = 6;
	ctx.stroke();

}

function drawALT( ctx, cx, cy, r, s ) {

	dial( ctx, cx, cy, r );
	ticks( ctx, cx, cy, r - 2, 0, Math.PI * 2, 50, 6, 1.5 );
	ticks( ctx, cx, cy, r - 2, 0, Math.PI * 2, 10, 12, 3 );
	for ( let i = 0; i < 10; i ++ ) {

		const [ x, y ] = polar( cx, cy, r - 26, i / 10 * Math.PI * 2 );
		text( ctx, String( i ), x, y, 18 );

	}

	text( ctx, 'x10 m', cx, cy - 22, 12, DIM, 600 );
	text( ctx, `${ Math.round( s.alt ) } m`, cx, cy + 28, 17, AQUA );
	// the short needle turns once per 1000 m, the long one once per 100 m
	needle( ctx, cx, cy, s.alt / 1000 * Math.PI * 2, r - 34, 6, INK, 8 );
	needle( ctx, cx, cy, s.alt / 100 * Math.PI * 2, r - 10, 3.5 );

}

function drawRPM( ctx, cx, cy, r, s ) {

	dial( ctx, cx, cy, r );
	const A0 = - 135 / DEG, A1 = 135 / DEG, MAX = 2500;
	const ang = ( v ) => A0 + ( A1 - A0 ) * clamp( v / MAX, 0, 1 );
	arcBand( ctx, cx, cy, r - 8, ang( 600 ), ang( 2200 ), GREEN, 5 );
	ticks( ctx, cx, cy, r - 2, A0, A1, 25, 6, 1.5 );
	ticks( ctx, cx, cy, r - 2, A0, A1, 5, 12, 3 );
	ticks( ctx, cx, cy, r - 2, ang( 2300 ), ang( 2300 ), 0, 16, 4, RED );
	for ( let v = 0; v <= 25; v += 5 ) {

		const [ x, y ] = polar( cx, cy, r - 28, ang( v * 100 ) );
		text( ctx, String( v ), x, y, 16 );

	}

	// the throttle lever's position: an inner arc
	arcBand( ctx, cx, cy, r - 44, A0, A1, '#2a3236', 6 );
	if ( s.throttle > 0.005 ) arcBand( ctx, cx, cy, r - 44, A0, A0 + ( A1 - A0 ) * clamp( s.throttle, 0, 1 ), AQUA, 6 );
	text( ctx, 'rpm x100', cx, cy - 16, 12, DIM, 600 );
	text( ctx, `THR ${ Math.round( s.throttle * 100 ) }%`, cx, cy + 36, 15, AQUA );
	needle( ctx, cx, cy, ang( s.rpm ), r - 12, 4 );

}

function drawHDG( ctx, cx, cy, r, s ) {

	dial( ctx, cx, cy, r );
	ctx.save();
	ctx.translate( cx, cy );
	ctx.rotate( - s.heading / DEG );
	for ( let d = 0; d < 360; d += 10 ) {

		const a = d / DEG, maj = d % 30 === 0;
		const [ x1, y1 ] = polar( 0, 0, r - 3, a ), [ x2, y2 ] = polar( 0, 0, r - ( maj ? 14 : 8 ), a );
		ctx.strokeStyle = INK;
		ctx.lineWidth = maj ? 2.5 : 1.5;
		ctx.beginPath();
		ctx.moveTo( x1, y1 );
		ctx.lineTo( x2, y2 );
		ctx.stroke();
		if ( maj ) {

			const card = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[ d ];
			const [ x, y ] = polar( 0, 0, r - 27, a );
			ctx.save();
			ctx.translate( x, y );
			ctx.rotate( a );
			text( ctx, card || String( d / 10 ), 0, 0, card ? 19 : 14, card === 'N' ? AMBER : INK );
			ctx.restore();

		}

	}

	ctx.restore();
	// the lubber line and the little plane
	ctx.fillStyle = AMBER;
	ctx.beginPath();
	ctx.moveTo( cx, cy - r + 10 );
	ctx.lineTo( cx - 6, cy - r - 1 );
	ctx.lineTo( cx + 6, cy - r - 1 );
	ctx.closePath();
	ctx.fill();
	ctx.strokeStyle = AMBER;
	ctx.lineWidth = 4;
	ctx.lineCap = 'round';
	ctx.beginPath();
	ctx.moveTo( cx, cy - 16 );
	ctx.lineTo( cx, cy + 14 );
	ctx.moveTo( cx - 14, cy - 3 );
	ctx.lineTo( cx + 14, cy - 3 );
	ctx.moveTo( cx - 6, cy + 12 );
	ctx.lineTo( cx + 6, cy + 12 );
	ctx.stroke();
	box( ctx, cx - 26, cy + 24, 52, 22, 'rgba(0,0,0,0.6)', 5 );
	text( ctx, String( Math.round( s.heading ) % 360 ).padStart( 3, '0' ) + '°', cx, cy + 35, 15, AQUA );

}

function drawVSI( ctx, cx, cy, r, s ) {

	dial( ctx, cx, cy, r );
	// zero at nine o'clock, climbing clockwise, +-10 m/s
	const ang = ( v ) => - Math.PI / 2 + clamp( v / 10, - 1, 1 ) * ( 165 / DEG );
	ticks( ctx, cx, cy, r - 2, ang( - 10 ), ang( 10 ), 20, 7, 1.5 );
	ticks( ctx, cx, cy, r - 2, ang( - 10 ), ang( 10 ), 4, 13, 3 );
	for ( const v of [ - 10, - 5, 0, 5, 10 ] ) {

		const [ x, y ] = polar( cx, cy, r - 28, ang( v ) );
		text( ctx, String( Math.abs( v ) ), x, y, 16 );

	}

	text( ctx, 'UP', cx + 8, cy - 30, 12, DIM, 600 );
	text( ctx, 'DN', cx + 8, cy + 30, 12, DIM, 600 );
	text( ctx, 'm/s', cx + 28, cy, 12, DIM, 600 );
	needle( ctx, cx, cy, ang( s.vs ), r - 12, 4 );

}

function drawLamp( ctx, b, label, lit, color ) {

	box( ctx, b.x, b.y, b.w, b.h, lit ? color : '#16191b', 6 );
	ctx.strokeStyle = '#000';
	ctx.lineWidth = 2;
	ctx.stroke();
	text( ctx, label, b.x + b.w / 2, b.y + b.h / 2 + 1, 15, lit ? '#140a05' : '#4b5357', 800 );

}

function drawBar( ctx, x, y, w, h, frac, label, value, color ) {

	box( ctx, x, y, w, h, '#0d1012', 6 );
	const ih = h - 40, fh = ih * clamp( frac, 0, 1 );
	box( ctx, x + 12, y + 8, w - 24, ih, '#20272a', 4 );
	if ( fh > 1 ) {

		ctx.fillStyle = color;
		ctx.fillRect( x + 12, y + 8 + ih - fh, w - 24, fh );

	}

	ctx.fillStyle = 'rgba(0,0,0,0.55)';
	for ( let i = 1; i < 4; i ++ ) ctx.fillRect( x + 12, y + 8 + ih * i / 4, w - 24, 2 );
	text( ctx, label, x + w / 2, y + h - 23, 12, DIM, 700 );
	text( ctx, value, x + w / 2, y + h - 9, 14, INK, 700 );

}

function drawSwitch( ctx, b, label, on, sub = '' ) {

	box( ctx, b.x, b.y, b.w, b.h, '#171b1e' );
	text( ctx, label, b.x + b.w / 2, b.y + 15, 14, INK, 800 );
	// the indicator and a toggle lever (up = on)
	circle( ctx, b.x + b.w / 2, b.y + 32, 5, on ? GREEN : '#2b3134' );
	const cx = b.x + b.w / 2, cy = b.y + 64;
	box( ctx, cx - 16, cy - 20, 32, 40, '#0a0c0d' );
	box( ctx, cx - 7, on ? cy - 26 : cy - 4, 14, 30, '#c9d1d3', 6 );
	if ( sub ) text( ctx, sub, cx, b.y + b.h - 9, 11, DIM, 700 );

}

function drawEngine( ctx, b, s ) {

	box( ctx, b.x, b.y, b.w, b.h, '#171b1e' );
	text( ctx, 'ENGINE', b.x + b.w / 2, b.y + 15, 14, INK, 800 );
	const cx = b.x + b.w / 2, cy = b.y + 58;
	circle( ctx, cx, cy, 27, '#0a0c0d' );
	circle( ctx, cx, cy, 22, s.engineOn ? '#b3261e' : s.cranking ? ( s.flash ? AMBER : '#8a5a1a' ) : '#2e7d4f' );
	text( ctx, s.engineOn ? 'STOP' : s.cranking ? '...' : 'START', cx, cy + 1, 13, '#fff', 800 );
	text( ctx, s.engineOn ? 'running' : s.cranking ? 'cranking' : 'off', cx, b.y + b.h - 9, 11, DIM, 700 );

}

function drawFlaps( ctx, s ) {

	const x = 630, y = 66, w = 72, h = 142;
	box( ctx, x, y, w, h, '#171b1e' );
	text( ctx, 'FLAPS', x + w / 2, y + 12, 12, INK, 800 );
	const top = y + 34, bot = y + h - 22, sx = x + 22;
	box( ctx, sx - 4, top - 6, 8, bot - top + 12, '#060708', 4 );
	const N = s.notches || 2; // (STOL flaps: a third notch)
	for ( let n = 0; n <= N; n ++ ) {

		const yy = top + ( bot - top ) * n / N;
		text( ctx, [ 'UP', '1', '2', '3' ][ n ], x + 52, yy, 13, Math.round( s.flaps ) === n ? AQUA : DIM, 800 );
		ctx.fillStyle = DIM;
		ctx.fillRect( sx + 8, yy - 1, 8, 2 );

	}

	// the knob shows where the flaps are (the motor follows the lever)
	const ky = top + ( bot - top ) * clamp( s.flapPos, 0, N ) / N;
	box( ctx, sx - 12, ky - 8, 24, 16, '#e8ece8', 4 );

}

function drawTrim( ctx, s ) {

	const x = 716, y = 66, w = 92, h = 142;
	box( ctx, x, y, w, h, '#171b1e' );
	text( ctx, 'TRIM', x + w / 2, y + 12, 12, INK, 800 );
	// the wheel: ribs that roll with the trim
	const wx = x + 12, wy = y + 26, ww = 34, wh = h - 40;
	box( ctx, wx, wy, ww, wh, '#0b0d0e', 10 );
	ctx.save();
	rrect( ctx, wx, wy, ww, wh, 10 );
	ctx.clip();
	const roll = ( ( s.trim * 60 ) % 12 + 12 ) % 12;
	ctx.fillStyle = '#3a4246';
	for ( let yy = wy - 12 + roll; yy < wy + wh + 12; yy += 12 ) ctx.fillRect( wx + 4, yy, ww - 8, 4 );
	ctx.restore();
	// the indicator: nose down at the top, nose up at the bottom
	const ix = x + 62, top = y + 34, bot = y + h - 18;
	ctx.fillStyle = '#060708';
	ctx.fillRect( ix - 2, top, 4, bot - top );
	ctx.fillStyle = DIM;
	ctx.fillRect( ix - 8, ( top + bot ) / 2 - 1, 16, 2 );
	const ty = ( top + bot ) / 2 + clamp( s.trim, - 1, 1 ) * ( bot - top ) / 2;
	ctx.fillStyle = AQUA;
	ctx.beginPath();
	ctx.moveTo( ix + 4, ty );
	ctx.lineTo( ix + 16, ty - 7 );
	ctx.lineTo( ix + 16, ty + 7 );
	ctx.closePath();
	ctx.fill();
	text( ctx, 'DN', ix + 4, top - 9, 10, DIM, 700 );
	text( ctx, 'UP', ix + 4, bot + 9, 10, DIM, 700 );

}

function fmtDist( m ) {

	return m < 1000 ? `${ Math.round( m / 10 ) * 10 } m` : `${ ( m / 1000 ).toFixed( m < 10000 ? 1 : 0 ) } km`;

}

function drawRadio( ctx, s ) {

	const x = 822, y = 66, w = 184, h = 142;
	box( ctx, x, y, w, h, '#171b1e' );
	box( ctx, x + 8, y + 8, w - 16, 92, s.master ? '#0c2a20' : '#0a0f0d', 6 );
	if ( s.master ) {

		const g = '#7dffc4';
		text( ctx, `HOME ${ String( Math.round( s.homeBearing ) % 360 ).padStart( 3, '0' ) }°`, x + 16, y + 26, 16, g, 700, 'left' );
		text( ctx, fmtDist( s.homeDist ), x + w - 16, y + 26, 16, g, 700, 'right' );
		text( ctx, `GS ${ Math.round( s.airspeed * KT ) } kt`, x + 16, y + 52, 16, g, 600, 'left' );
		text( ctx, `${ Math.round( s.litres ) } L`, x + w - 16, y + 52, 16, g, 600, 'right' );
		text( ctx, s.endurance === null ? 'ENDUR --' : `ENDUR ${ Math.floor( s.endurance ) } min`, x + 16, y + 78, 16, g, 600, 'left' );

	}

	box( ctx, x + 8, y + 106, w - 16, 28, '#262c30', 6 );
	text( ctx, 'MAP  (M)', x + w / 2, y + 120, 14, INK, 800 );

}

export function drawPanel( ctx, s ) {

	ctx.fillStyle = PANEL_C;
	ctx.fillRect( 0, 0, TEX.w, TEX.h );
	ctx.fillStyle = 'rgba(255,255,255,0.025)'; // a faint grain in the paint
	for ( let i = 0; i < 24; i ++ ) ctx.fillRect( 0, i * 14, TEX.w, 1 );
	const R = SIX.r, X = SIX.xs, Y = SIX.ys;
	drawASI( ctx, X[ 0 ], Y[ 0 ], R, s );
	drawATT( ctx, X[ 1 ], Y[ 0 ], R, s );
	drawALT( ctx, X[ 2 ], Y[ 0 ], R, s );
	drawRPM( ctx, X[ 0 ], Y[ 1 ], R, s );
	drawHDG( ctx, X[ 1 ], Y[ 1 ], R, s );
	drawVSI( ctx, X[ 2 ], Y[ 1 ], R, s );
	// the warning lamps (dark without the master)
	const m = s.master;
	drawLamp( ctx, lamp( 0 ), 'STALL', m && s.stall && s.flash, RED );
	drawLamp( ctx, lamp( 1 ), 'WARN', m && s.warn && ( s.flash || s.hp < 50 ), s.hp < 30 ? RED : AMBER );
	drawLamp( ctx, lamp( 2 ), 'FUEL', m && s.fuelLow, AMBER );
	drawLamp( ctx, lamp( 3 ), 'START', m && s.cranking, AMBER );
	drawLamp( ctx, lamp( 4 ), 'AP', m && s.ap, GREEN );
	drawLamp( ctx, lamp( 5 ), s.rudderDown ? 'RUD DN' : 'RUD UP', m && s.rudderDown, GREEN );
	drawBar( ctx, 488, 66, 60, 142, s.fuel, 'FUEL', `${ Math.round( s.fuel * 100 ) }%`, s.fuel < FUEL.low ? RED : s.fuel < 0.3 ? AMBER : GREEN );
	drawBar( ctx, 556, 66, 60, 142, s.hp / 100, 'HULL', `${ Math.round( s.hp ) }%`, s.hp < 30 ? RED : s.hp < 60 ? AMBER : GREEN );
	drawFlaps( ctx, s );
	drawTrim( ctx, s );
	drawRadio( ctx, s );
	drawSwitch( ctx, sw( 0 ), 'MASTER', s.master, s.master ? 'on' : 'off' );
	drawEngine( ctx, sw( 1 ), s );
	drawSwitch( ctx, sw( 2 ), 'NAV', s.nav, 'lights' );
	drawSwitch( ctx, sw( 3 ), 'LAND', s.landing, 'light' );
	drawSwitch( ctx, sw( 4 ), 'AUTO', s.ap, 'pilot' );
	// the hovered control
	const c = s.hover ? CONTROLS.find( ( k ) => k.id === s.hover ) : null;
	if ( c ) {

		rrect( ctx, c.x - 3, c.y - 3, c.w + 6, c.h + 6, 9 );
		ctx.strokeStyle = AQUA;
		ctx.lineWidth = 4;
		ctx.stroke();

	}

}

// ---------------------------------------------------------------- the DOM bits (tooltip, aim dot, chase strip)

const CSS = /* css */`
.sp-tip { position: absolute; left: 50%; top: 50%; transform: translate(-50%, calc(18 * var(--tw-u))); padding: calc(4 * var(--tw-u)) calc(10 * var(--tw-u));
	border-radius: 999px; font: 600 var(--tw-fs-sm) var(--tw-font); color: var(--tw-ink); white-space: nowrap; pointer-events: none; opacity: 0;
	transition: opacity var(--tw-fast) var(--tw-ease); z-index: 5; }
.sp-tip.is-on { opacity: 1; }
.sp-tip kbd { margin-left: calc(6 * var(--tw-u)); font: 600 var(--tw-fs-xs) var(--tw-mono); padding: 0 calc(5 * var(--tw-u)); border-radius: 4px; background: var(--tw-fill-2); }
.sp-dot { position: absolute; left: 50%; top: 50%; width: 5px; height: 5px; margin: -2.5px; border-radius: 50%; background: rgba(255,255,255,0.8);
	box-shadow: 0 0 3px rgba(0,0,0,0.7); pointer-events: none; opacity: 0; transition: opacity var(--tw-fast); }
.sp-dot.is-on { opacity: 1; }
.sp-dot.is-hot { background: var(--tw-aqua); }
.sp-strip { position: absolute; left: var(--tw-edge); bottom: var(--tw-edge); display: flex; gap: var(--tw-2);
	padding: var(--tw-2) var(--tw-3); border-radius: calc(16 * var(--tw-u)); pointer-events: none; opacity: 0; transform: translateY(calc(10 * var(--tw-u)));
	transition: opacity var(--tw-slow) var(--tw-ease), transform var(--tw-slow) var(--tw-ease); }
.sp-strip.is-on { opacity: 1; transform: none; }
.sp-cell { display: flex; flex-direction: column; align-items: flex-start; min-width: calc(54 * var(--tw-u)); padding: 0 var(--tw-2); }
.sp-cell + .sp-cell { border-left: 1px solid var(--tw-line); }
.sp-cell span { font: 600 var(--tw-fs-xs) var(--tw-font); letter-spacing: 0.08em; text-transform: uppercase; color: var(--tw-ink-3); }
.sp-cell b { font: 600 var(--tw-fs-md) var(--tw-mono); color: var(--tw-ink); white-space: nowrap; }
.sp-cell b small { font-size: var(--tw-fs-xs); color: var(--tw-ink-3); margin: 0 2px; }
.sp-cell.is-warn b { color: var(--tw-coral); }
.tw-root.is-touch .sp-strip { left: 50%; bottom: auto; top: calc(var(--tw-edge) + 40px); translate: -50% 0; scale: 0.8; transform-origin: 50% 0; }
.tw-root.is-photo .sp-strip, .tw-root.is-photo .sp-tip, .tw-root.is-photo .sp-dot { display: none; }
/* first person in the cockpit: the windscreen is clear (toasts and the prompt stay) */
.tw-root.sp-cockpit .tw-tl, .tw-root.sp-cockpit .gm-purse, .tw-root.sp-cockpit .gm-map, .tw-root.sp-cockpit .tw-depth, .tw-root.sp-cockpit .tw-boat {
	opacity: 0 !important; pointer-events: none !important; transition: opacity var(--tw-med) var(--tw-ease); }
`;

let cssInstalled = false;
const STRIP = [ [ 'af', 'Plane' ], [ 'spd', 'Speed' ], [ 'alt', 'Alt' ], [ 'hdg', 'Hdg' ], [ 'thr', 'Thr' ], [ 'fuel', 'Fuel' ] ];

function makeCanvas( w, h ) {

	if ( typeof OffscreenCanvas !== 'undefined' ) return new OffscreenCanvas( w, h );
	if ( typeof document !== 'undefined' ) return Object.assign( document.createElement( 'canvas' ), { width: w, height: h } );
	return null;

}

const _o = new Vector3(), _dir = new Vector3(), _q = new Quaternion();

export class Cockpit {

	constructor( sp, { canvas = null } = {} ) {

		this.sp = sp;
		this.app = sp.app || {};
		this.hover = null;
		this.aim = null; // { px, py } where the eye / mouse meets the face (null: not looking at it)
		this.redraws = 0;
		this._acc = 1;
		this._dirty = true;
		this._lmb = false;
		this._mouse = null; // client px of the pointer while it is free
		this._cls = false;
		this.tip = undefined;
		this.canvas = canvas || makeCanvas( TEX.w, TEX.h );
		this.ctx = this.canvas && this.canvas.getContext ? this.canvas.getContext( '2d' ) : null;
		this.tex = null;
		this.mesh = null;
		this.material = null;
		const visual = sp.visual;
		if ( visual ) {

			// a plain dark face until the first draw (and in a run without a canvas)
			const blank = new Uint8Array( TEX.w * TEX.h * 4 );
			for ( let i = 0; i < blank.length; i += 4 ) {

				blank[ i ] = 31; blank[ i + 1 ] = 36; blank[ i + 2 ] = 39; blank[ i + 3 ] = 255;

			}

			// phones: no mip chain (the face is viewed near 1:1 from the seat; a 10-level rebuild after every redraw cost frames)
			this._phone = !! globalThis.__phoneBudget;
			this.tex = new Texture( { label: 'seaplane.panel', width: TEX.w, height: TEX.h, format: 'rgba8unorm-srgb', mips: ! this._phone, usage: [ 'sample', 'copyDst', 'render' ], data: blank } ); // ('render': copyExternalImageToTexture needs RenderAttachment on its destination)
			this.material = standard( {
				name: 'seaplanePanel',
				side: 'double',
				textures: { cpFace: this.tex },
				uniforms: { glow: [ 'f32', 0 ] },
				surface: /* wgsl */`
	let t = textureSample( cpFace, smpAnisoClamp, vec2f( in.uv.x, 1.0 - in.uv.y ) );
	s.albedo = t.rgb;
	s.roughness = 0.55;
	s.metalness = 0.0;
	// backlit markings: a little by day (the cabin's shade), a warm glow at night with the master on
	let nightOn = smoothstep( 0.15, 0.75, frame.night );
	s.emissive = t.rgb * mat.glow * ( 0.22 + 1.1 * nightOn ) * vec3f( 1.0, 0.86, 0.72 );
`,
			} );
			this.mesh = new Mesh( buildFaceGeometry(), this.material );
			this.mesh.name = 'seaplane-panel';
			this.mesh.castShadow = false;
			this.mesh.receiveShadow = true;
			visual.body.add( this.mesh );
			this._gpu();

		}

		this._onMove = ( e ) => {

			this._mouse = { x: e.clientX, y: e.clientY };

		};

		if ( typeof window !== 'undefined' && window.addEventListener ) window.addEventListener( 'mousemove', this._onMove, { passive: true } );

	}

	_gpu() {

		if ( ! GPU.device || ! this.tex ) return;
		this.tex.getGPU();
		if ( ! this._phone ) generateMipmaps( this.tex );

	}

	get firstPerson() {

		const p = this.app.player;
		return !! ( this.sp.piloted && p && p.view === 'first' );

	}

	// ---- per frame

	update( dt ) {

		const sp = this.sp;
		const fp = this.firstPerson;
		const open = !! ( sp.features && sp.features.panelOpen && sp.features.panelOpen() );
		this._setCls( fp );
		if ( sp.piloted !== this._wasPiloted ) {

			this._wasPiloted = sp.piloted;
			this._dirty = true; // (the switched-off panel after climbing out)

		}

		let hover = null;
		if ( fp && ! open ) hover = this._aimAt();
		else this.aim = null;
		const id = hover ? hover.id : null;
		if ( id !== this.hover ) {

			this.hover = id;
			this._dirty = true;

		}

		// a click on a control (the left button's press)
		const inp = this.app.input;
		const lmb = !! ( inp && inp.mouseDown && inp.enabled !== false );
		if ( lmb && ! this._lmb && fp && ! open && hover && hover.act && sp.act ) sp.act( hover.id, 'click' );
		this._lmb = lmb;

		// redraw: ~10 Hz in first person, a few times a second from outside while piloted, once after leaving
		this._acc += dt;
		const rate = this._phone ? ( fp ? 5 : sp.piloted ? 1 : 0 ) : ( fp ? 10 : sp.piloted ? 3 : 0 );
		if ( this._dirty || ( rate && this._acc >= 1 / rate ) ) this.draw();
		if ( this.material ) this.material.uniforms.glow.value = sp.systems.master ? 1 : 0;
		this._dom( fp, hover, open );

	}

	// where the eye (pointer locked, touch) or the free mouse meets the face, and the control there
	_aimAt() {

		const cam = this.app.camera, f = this.sp.flight, inp = this.app.input;
		if ( ! cam ) return null;
		_o.copy( cam.position );
		let ok = false;
		const dom = inp && inp.dom;
		if ( inp && ! inp.locked && ! inp.touchMode && this._mouse && dom && dom.getBoundingClientRect ) {

			const r = dom.getBoundingClientRect();
			if ( r.width > 0 && r.height > 0 ) {

				const nx = ( this._mouse.x - r.left ) / r.width * 2 - 1, ny = - ( ( this._mouse.y - r.top ) / r.height * 2 - 1 );
				if ( cam.updateMatrixWorld ) cam.updateMatrixWorld();
				_dir.set( nx, ny, 0.5 ).unproject( cam ).sub( cam.position ).normalize();
				ok = Number.isFinite( _dir.x );

			}

		}

		if ( ! ok ) _dir.set( 0, 0, - 1 ).applyQuaternion( cam.quaternion );
		// into the model frame
		_q.copy( f.quaternion ).invert();
		_o.sub( f.position ).applyQuaternion( _q );
		_dir.applyQuaternion( _q );
		const hit = rayPanel( _o, _dir );
		this.aim = hit;
		return hit ? hitControl( hit.px, hit.py ) : null;

	}

	draw() {

		this._acc = 0;
		this._dirty = false;
		this.redraws ++;
		const ctx = this.ctx;
		if ( ! ctx ) return;
		drawPanel( ctx, panelSnapshot( this.sp, this.hover ) );
		if ( ! this.tex ) return;
		// straight from the canvas to the texture when the device can (no read-back), else through the pixels
		if ( GPU.device && this.tex.gpu && GPU.queue && GPU.queue.copyExternalImageToTexture && ! this._noCopy ) {

			try {

				GPU.queue.copyExternalImageToTexture( { source: this.canvas }, { texture: this.tex.gpu }, { width: TEX.w, height: TEX.h } );
				if ( ! this._phone ) generateMipmaps( this.tex );
				return;

			} catch ( e ) {

				this._noCopy = true;

			}

		}

		if ( ! ctx.getImageData ) return;
		const img = ctx.getImageData( 0, 0, TEX.w, TEX.h );
		const data = new Uint8Array( img.data.buffer, img.data.byteOffset, img.data.byteLength );
		if ( GPU.device && this.tex.gpu ) {

			this.tex.upload( data );
			if ( ! this._phone ) generateMipmaps( this.tex );

		} else {

			this.tex.pendingData = data;
			this._gpu();

		}

	}

	// ---- the DOM (lazily, once a HUD exists)

	_ui() {

		const ui = this.app.ui && this.app.ui.ui;
		return ui && ui.root ? ui : null;

	}

	_setCls( on ) {

		if ( on === this._cls ) return;
		const ui = this._ui();
		if ( ! ui ) return;
		this._cls = on;
		ui.root.classList.toggle( 'sp-cockpit', on );

	}

	_ensureDom() {

		if ( this.tip ) return true;
		const ui = this._ui();
		if ( ! ui || typeof document === 'undefined' ) return false;
		if ( ! cssInstalled ) {

			const st = document.createElement( 'style' );
			st.textContent = CSS;
			document.head.append( st );
			cssInstalled = true;

		}

		const host = ui.hud || ui.root;
		this.tip = document.createElement( 'div' );
		this.tip.className = 'sp-tip tw-glass';
		this.dot = document.createElement( 'div' );
		this.dot.className = 'sp-dot';
		this.strip = document.createElement( 'div' );
		this.strip.className = 'sp-strip tw-glass';
		this.strip.setAttribute( 'aria-hidden', 'true' );
		this.strip.innerHTML = STRIP.map( ( [ k, l ] ) => `<div class="sp-cell" data-k="${ k }"><span>${ t( 'seaplane.strip.' + k, l ) }</span><b>-</b></div>` ).join( '' );
		this.cells = {};
		for ( const [ k ] of STRIP ) this.cells[ k ] = this.strip.querySelector( `[data-k="${ k }"]` );
		host.append( this.tip, this.dot, this.strip );
		return true;

	}

	_dom( fp, hover, open ) {

		if ( ! this._ensureDom() ) return;
		const sp = this.sp, f = sp.flight, inp = this.app.input;
		// the aim dot and the tooltip, only while the eye is on the panel
		const looking = fp && ! open && !! this.aim;
		const centred = ! inp || inp.locked || inp.touchMode || ! this._mouse;
		this.dot.classList.toggle( 'is-on', looking && centred );
		this.dot.classList.toggle( 'is-hot', !! ( hover && hover.act ) );
		const tipOn = looking && !! hover;
		if ( tipOn && this._tipId !== hover.id ) {

			this._tipId = hover.id;
			this.tip.innerHTML = `${ t( 'seaplane.ctl.' + hover.id, hover.label ) }${ hover.key ? `<kbd>${ hover.key }</kbd>` : '' }`;

		}

		if ( ! tipOn ) this._tipId = null;
		this.tip.classList.toggle( 'is-on', tipOn );
		if ( tipOn && ! centred ) {

			this.tip.style.left = `${ this._mouse.x }px`;
			this.tip.style.top = `${ this._mouse.y }px`;

		} else if ( this.tip.style.left ) {

			this.tip.style.left = '';
			this.tip.style.top = '';

		}

		// the chase view's strip
		const p = this.app.player;
		const on = !! ( sp.piloted && p && p.view !== 'first' && ! open );
		this.strip.classList.toggle( 'is-on', on );
		if ( ! on ) return;
		this._stripN = ( this._stripN || 0 ) + 1;
		if ( this._stripN % 6 !== 1 ) return; // ~10 Hz
		const s = panelSnapshot( sp );
		const set = ( k, html, warn = false ) => {

			const c = this.cells[ k ];
			const b = c.lastChild;
			if ( b._v !== html ) {

				b._v = html;
				b.innerHTML = html;

			}

			c.classList.toggle( 'is-warn', warn );

		};

		set( 'af', s.name + ( s.engineOut ? ' <small>1 eng</small>' : '' ), s.engineOut ); // wave 12: the airframe
		set( 'spd', `${ Math.round( s.airspeed * KT ) }<small>kt</small>${ Math.round( s.airspeed ) }<small>m/s</small>`, s.stall );
		set( 'alt', `${ Math.round( s.alt ) }<small>m</small>` );
		set( 'hdg', `${ String( Math.round( s.heading ) % 360 ).padStart( 3, '0' ) }°` );
		set( 'thr', f.engineOn ? `${ Math.round( s.throttle * 100 ) }<small>%</small>` : sp.systems.cranking ? '...' : t( 'seaplane.strip.off', 'off' ), ! f.engineOn );
		set( 'fuel', `${ Math.round( s.fuel * 100 ) }<small>%</small>`, s.fuel < FUEL.low );

	}

	dispose() {

		this._setCls( false );
		if ( typeof window !== 'undefined' && window.removeEventListener ) window.removeEventListener( 'mousemove', this._onMove );
		for ( const el of [ this.tip, this.dot, this.strip ] ) if ( el && el.remove ) el.remove();
		if ( this.mesh ) {

			this.mesh.removeFromParent();
			this.mesh.geometry.dispose();

		}

		if ( this.tex ) this.tex.destroy();

	}

}
