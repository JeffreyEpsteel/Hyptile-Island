// The live car instruments (wave 24A), drawn into one canvas atlas (CarInterior.ATLAS) that three screens of the modelled
// cabin sample: the cluster behind the wheel (seven different designs, one per kind), the centre stack (the clock, the
// trip and the touch switches) and the auxiliary display (the taxi's fare meter, the police laptop, the bus's ticket
// machine). Pure canvas drawing from a carPanelSnapshot(); the switches' rectangles are in CONTROLS for picking.
import { REGIONS } from './CarInterior.js';

const clamp = ( n, a, b ) => Math.max( a, Math.min( b, n ) );
const TAU = Math.PI * 2;

// the stack's touch switches (pixels in the stack region); kinds: only those cars show it
const COL = [ 12, 198 ], ROW = [ 132, 208, 284, 360, 436 ], BW = 174, BH = 68;
export const CONTROLS = [
	{ id: 'engine', label: 'Engine start / stop', short: 'ENGINE', x: COL[ 0 ], y: ROW[ 0 ] },
	{ id: 'lights', label: 'Headlights: auto / on / off', short: 'LAMPS', key: 'L', x: COL[ 1 ], y: ROW[ 0 ] },
	{ id: 'park', label: 'Parking brake', short: 'PARK BRAKE', x: COL[ 0 ], y: ROW[ 1 ] },
	{ id: 'hazard', label: 'Hazard lights', short: 'HAZARD', x: COL[ 1 ], y: ROW[ 1 ] },
	{ id: 'indL', label: 'Indicator left', short: '◀ SIGNAL', key: ',', x: COL[ 0 ], y: ROW[ 2 ] },
	{ id: 'indR', label: 'Indicator right', short: 'SIGNAL ▶', key: '.', x: COL[ 1 ], y: ROW[ 2 ] },
	{ id: 'wipers', label: 'Wipers: auto / on / fast / off', short: 'WIPERS', x: COL[ 0 ], y: ROW[ 3 ] },
	{ id: 'dome', label: 'Interior light', short: 'CABIN LAMP', x: COL[ 1 ], y: ROW[ 3 ] },
	{ id: 'horn', label: 'Horn', short: 'HORN', key: 'H', x: COL[ 0 ], y: ROW[ 4 ], wide: [ 'sedan', 'pickup', 'van', 'sports' ] },
	{ id: 'siren', label: 'Police siren and light bar', short: 'SIREN · BAR', x: COL[ 1 ], y: ROW[ 4 ], kinds: [ 'police' ] },
	{ id: 'meter', label: 'Taxi fare meter', short: 'FARE METER', x: COL[ 1 ], y: ROW[ 4 ], kinds: [ 'taxi' ] },
	{ id: 'doors', label: 'Passenger doors', short: 'DOORS', x: COL[ 1 ], y: ROW[ 4 ], kinds: [ 'bus' ] },
].map( ( c ) => ( { ...c, screen: 'stack', w: BW, h: BH } ) );

export function controlsFor( kind ) {

	return CONTROLS.filter( ( c ) => ! c.kinds || c.kinds.includes( kind ) ).map( ( c ) => c.wide && c.wide.includes( kind ) ? { ...c, w: COL[ 1 ] + BW - COL[ 0 ] } : c );

}

// a hit in a screen's uv (0..1, y down) -> the control there
export function hitControl( screen, u, v, kind = 'sedan' ) {

	if ( screen !== 'stack' ) return null;
	const R = REGIONS.stack, px = u * R.w, py = v * R.h;
	return controlsFor( kind ).find( ( c ) => px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h ) || null;

}

export function controlOn( s, id ) {

	return id === 'engine' ? s.engineOn : id === 'lights' ? s.lights : id === 'park' ? s.parkBrake : id === 'horn' ? s.horn : id === 'siren' ? s.siren
		: id === 'hazard' ? s.hazard : id === 'indL' ? s.ind === 'L' : id === 'indR' ? s.ind === 'R' : id === 'wipers' ? s.wipers !== 'off'
			: id === 'dome' ? s.dome : id === 'meter' ? !! s.meter?.on : id === 'doors' ? s.doors : false;

}

export function controlState( s, id ) {

	if ( id === 'engine' ) return s.engineOn ? 'RUNNING' : 'START';
	if ( id === 'lights' ) return s.lightMode;
	if ( id === 'wipers' ) return s.wipers.toUpperCase();
	if ( id === 'horn' ) return 'PRESS';
	if ( id === 'meter' ) return s.meter?.on ? 'HIRED' : 'FOR HIRE';
	if ( id === 'doors' ) return s.doors ? 'OPEN' : 'CLOSED';
	return controlOn( s, id ) ? 'ON' : 'OFF';

}

// ---- drawing helpers

const FONT = 'system-ui, "Segoe UI", sans-serif';
function text( c, t, x, y, size = 16, color = '#e6ece8', align = 'center', weight = 600 ) {

	c.font = `${ weight } ${ size }px ${ FONT }`; c.textAlign = align; c.textBaseline = 'middle'; c.fillStyle = color; c.fillText( t, x, y );

}
function rect( c, x, y, w, h, color ) { c.fillStyle = color; c.fillRect( x, y, w, h ); }
function circle( c, x, y, r, color ) { c.beginPath(); c.arc( x, y, r, 0, TAU ); c.fillStyle = color; c.fill(); }
function ring( c, x, y, r, width, color ) { c.beginPath(); c.arc( x, y, r, 0, TAU ); c.lineWidth = width; c.strokeStyle = color; c.stroke(); }
function line( c, x, y, xx, yy, color, w = 2 ) { c.beginPath(); c.moveTo( x, y ); c.lineTo( xx, yy ); c.lineWidth = w; c.strokeStyle = color; c.stroke(); }
function panel( c, x, y, w, h, fill, edge = null ) { rect( c, x, y, w, h, fill ); if ( edge ) { c.lineWidth = 2; c.strokeStyle = edge; c.strokeRect( x + 1, y + 1, w - 2, h - 2 ); } }
function tri( c, pts, color ) { c.beginPath(); c.moveTo( pts[ 0 ], pts[ 1 ] ); for ( let i = 2; i < pts.length; i += 2 ) c.lineTo( pts[ i ], pts[ i + 1 ] ); c.closePath(); c.fillStyle = color; c.fill(); }

// a round gauge: face, bezel, ticks and numerals over [ a0, a0 + sweep ], a red zone, a needle with a counterweight
function gauge( c, x, y, r, value, max, o = {} ) {

	const { a0 = Math.PI * 0.75, sweep = Math.PI * 1.5, major = 8, minor = 4, labels = null, red = null, face = '#0b0f12', bezel = '#8d969b', tick = '#e9ece6',
		needle = '#ff5a2a', numeral = '#dfe5e0', unit = '', title = '', digital = null, accent = '#6fe3c8', fontScale = 1 } = o;
	if ( bezel ) { circle( c, x, y, r + 7, '#1a1e21' ); ring( c, x, y, r + 4, 4, bezel ); }
	circle( c, x, y, r, face );
	if ( red ) {

		c.beginPath(); c.arc( x, y, r - 7, a0 + sweep * red, a0 + sweep, false ); c.lineWidth = 8; c.strokeStyle = '#c8261c'; c.stroke();

	}
	const n = major * minor;
	for ( let i = 0; i <= n; i ++ ) {

		const a = a0 + sweep * i / n, big = i % minor === 0, inner = r - ( big ? 16 : 9 );
		line( c, x + Math.cos( a ) * inner, y + Math.sin( a ) * inner, x + Math.cos( a ) * ( r - 3 ), y + Math.sin( a ) * ( r - 3 ), tick, big ? 3 : 1.4 );
		if ( big ) {

			const lab = labels ? labels[ i / minor ] : String( Math.round( max * i / n ) );
			if ( lab !== undefined && lab !== '' ) text( c, lab, x + Math.cos( a ) * ( r - 32 ), y + Math.sin( a ) * ( r - 32 ), Math.round( r * 0.16 * fontScale ), numeral );

		}

	}
	if ( title ) text( c, title, x, y - r * 0.36, Math.round( r * 0.12 ), '#9ea9a7' );
	if ( unit ) text( c, unit, x, y + r * 0.3, Math.round( r * 0.11 ), '#9ea9a7' );
	if ( digital !== null ) { rect( c, x - r * 0.36, y + r * 0.46, r * 0.72, r * 0.26, '#050708' ); text( c, digital, x, y + r * 0.59, Math.round( r * 0.21 ), accent ); }
	const a = a0 + sweep * clamp( value / max, 0, 1 );
	line( c, x - Math.cos( a ) * r * 0.16, y - Math.sin( a ) * r * 0.16, x + Math.cos( a ) * ( r - 10 ), y + Math.sin( a ) * ( r - 10 ), needle, 4 );
	circle( c, x, y, r * 0.09, '#2b3134' ); circle( c, x, y, r * 0.05, needle );

}

// a small fuel / temperature arc with its pictogram letter and the low / hot lamp
function miniGauge( c, x, y, r, frac, lo, hi, warn, color = '#e9ece6' ) {

	c.beginPath(); c.arc( x, y, r, Math.PI * 1.15, Math.PI * 1.85 ); c.lineWidth = 3; c.strokeStyle = '#59615f'; c.stroke();
	for ( let i = 0; i <= 4; i ++ ) { const a = Math.PI * ( 1.15 + 0.7 * i / 4 ); line( c, x + Math.cos( a ) * ( r - 6 ), y + Math.sin( a ) * ( r - 6 ), x + Math.cos( a ) * ( r + 2 ), y + Math.sin( a ) * ( r + 2 ), i === 0 && warn === 'low' || i === 4 && warn === 'hot' ? '#e0392a' : color, 2 ); }
	text( c, lo, x + Math.cos( Math.PI * 1.15 ) * ( r + 12 ), y + Math.sin( Math.PI * 1.15 ) * ( r + 12 ) + 6, 12, '#aab4b1' );
	text( c, hi, x + Math.cos( Math.PI * 1.85 ) * ( r + 12 ), y + Math.sin( Math.PI * 1.85 ) * ( r + 12 ) + 6, 12, '#aab4b1' );
	const a = Math.PI * ( 1.15 + 0.7 * clamp( frac, 0, 1 ) );
	line( c, x, y, x + Math.cos( a ) * ( r - 3 ), y + Math.sin( a ) * ( r - 3 ), '#ff6a33', 3 );
	circle( c, x, y, 4, '#2b3134' );

}

function fuelFrac( s ) { return clamp( s.fuel, 0, 1 ); }
function tempFrac( s ) { return clamp( ( s.temp - 40 ) / 90, 0, 1 ); }

// the green arrows, blinking with the relay
function arrows( c, x0, x1, y, s, size = 16 ) {

	const l = ( s.ind === 'L' || s.hazard ) && s.blinkOn, r = ( s.ind === 'R' || s.hazard ) && s.blinkOn;
	tri( c, [ x0 - size, y, x0, y - size * 0.7, x0, y + size * 0.7 ], l ? '#3cff6e' : '#1d2a22' );
	tri( c, [ x1 + size, y, x1, y - size * 0.7, x1, y + size * 0.7 ], r ? '#3cff6e' : '#1d2a22' );

}

// the warning lamps: park brake (red), low fuel / engine / hot (amber / red), headlights (green), doors (bus)
function lamps( c, x, y, s, gap = 44 ) {

	const list = [
		[ 'P', s.parkBrake, '#ff3b2e' ], [ 'FUEL', s.fuel <= 0.12, '#ffb020' ], [ 'TEMP', s.temp > 112, '#ff3b2e' ],
		[ 'ENG', s.hp < 45 || s.stage >= 2, '#ffb020' ], [ 'LAMP', s.lights, '#3cff6e' ],
	];
	if ( s.kind === 'bus' ) list.push( [ 'DOOR', s.doors, '#ffb020' ] );
	list.forEach( ( [ t, on, col ], i ) => {

		const xx = x + ( i - ( list.length - 1 ) / 2 ) * gap;
		rect( c, xx - 19, y - 10, 38, 20, on ? col : '#151a1c' );
		text( c, t, xx, y, 11, on ? '#101010' : '#3a4442', 'center', 700 );

	} );

}

function gearText( s ) { return s.gear; }

// ---- the seven clusters (640 x 256)

const CLUSTER = {
	// classic twin analogue: cream faces, chrome bezels, a centre column with fuel, temperature and the odometer
	sedan( c, s ) {

		rect( c, 0, 0, 640, 256, '#1b1714' );
		const face = '#ebe5d4', ink = '#22201c';
		gauge( c, 150, 132, 104, s.speed, 220, { major: 11, minor: 2, labels: [ 0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220 ].map( String ), face, tick: ink, numeral: ink, needle: '#c4161c', bezel: '#c9c9c4', unit: 'km/h', fontScale: 0.82 } );
		gauge( c, 490, 132, 104, s.rpm / 1000, 7, { major: 7, minor: 4, labels: [ '0', '1', '2', '3', '4', '5', '6', '7' ], red: 6 / 7, face, tick: ink, numeral: ink, needle: '#c4161c', bezel: '#c9c9c4', unit: 'x1000 r/min' } );
		miniGauge( c, 320, 78, 34, fuelFrac( s ), 'E', 'F', 'low' );
		miniGauge( c, 320, 152, 34, tempFrac( s ), 'C', 'H', 'hot' );
		rect( c, 282, 182, 76, 26, '#0b0a09' ); text( c, String( Math.floor( s.odo ) ).padStart( 6, '0' ), 320, 195, 17, '#e8dcb8' );
		text( c, gearText( s ), 320, 232, 22, '#f0c46a', 'center', 800 );
		arrows( c, 296, 344, 20, s, 14 );
		lamps( c, 320, 246, s, 40 );

	},
	// the taxi: black dials, amber needles, a duty display between them
	taxi( c, s ) {

		rect( c, 0, 0, 640, 256, '#121416' );
		gauge( c, 140, 132, 102, s.speed, 200, { major: 10, minor: 2, labels: [ 0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200 ].map( String ), needle: '#ffb52e', unit: 'km/h', fontScale: 0.85 } );
		gauge( c, 500, 132, 102, s.rpm / 1000, 7, { major: 7, minor: 4, labels: [ '0', '1', '2', '3', '4', '5', '6', '7' ], red: 6 / 7, needle: '#ffb52e', unit: 'r/min x1000' } );
		panel( c, 262, 40, 116, 150, '#06120a', '#2c4a33' );
		text( c, 'TAXI', 320, 58, 14, '#ffd46a', 'center', 800 );
		text( c, s.meter?.on ? 'HIRED' : 'FOR HIRE', 320, 82, 15, s.meter?.on ? '#ff8c4a' : '#7dff9c' );
		text( c, gearText( s ), 320, 116, 30, '#ffd46a', 'center', 800 );
		rect( c, 274, 140, 92 * fuelFrac( s ), 8, s.fuel < 0.12 ? '#ff6a33' : '#ffd46a' ); text( c, 'FUEL', 320, 158, 11, '#9fb0a3' );
		rect( c, 274, 168, 92 * tempFrac( s ), 8, s.temp > 112 ? '#ff3b2e' : '#7dc7ff' ); text( c, 'TEMP', 320, 184, 11, '#9fb0a3' );
		arrows( c, 296, 344, 22, s, 13 );
		lamps( c, 320, 222, s, 42 );

	},
	// the police: a digital speed tape, an analogue tach, the unit's status
	police( c, s ) {

		rect( c, 0, 0, 640, 256, '#0b1118' );
		panel( c, 30, 34, 210, 180, '#06111c', '#1f4b6e' );
		for ( let i = 0; i < 9; i ++ ) { const y = 52 + i * 18, v = Math.round( s.speed / 10 ) * 10 + ( 4 - i ) * 10; if ( v >= 0 ) { line( c, 40, y, 58, y, '#4e7fa6', 2 ); text( c, String( v ), 70, y, 12, '#6f9cc0', 'left' ); } }
		text( c, String( Math.round( s.speed ) ), 160, 110, 64, '#e8f4ff', 'center', 800 );
		text( c, 'km/h', 160, 152, 15, '#7fb6e6' );
		text( c, s.siren ? 'CODE 3' : s.wanted ? 'ALERT ' + s.wanted : 'PATROL', 160, 190, 17, s.siren ? '#ff4d4d' : s.wanted ? '#ffb020' : '#7fb6e6', 'center', 800 );
		gauge( c, 470, 128, 100, s.rpm / 1000, 7, { major: 7, minor: 4, labels: [ '0', '1', '2', '3', '4', '5', '6', '7' ], red: 6 / 7, needle: '#4fb4ff', face: '#05090d', unit: 'r/min x1000', digital: gearText( s ), accent: '#bfe3ff' } );
		rect( c, 280, 60, 60 * fuelFrac( s ), 10, '#4fb4ff' ); text( c, 'FUEL', 310, 82, 11, '#7fa7c5' );
		rect( c, 280, 104, 60 * tempFrac( s ), 10, s.temp > 112 ? '#ff3b2e' : '#4fb4ff' ); text( c, 'TEMP', 310, 126, 11, '#7fa7c5' );
		arrows( c, 296, 326, 24, s, 12 );
		lamps( c, 330, 236, s, 42 );

	},
	// the pickup: four square utility gauges, amber backlight
	pickup( c, s ) {

		rect( c, 0, 0, 640, 256, '#1c1d1a' );
		const sq = ( x, w, title ) => { panel( c, x, 22, w, 196, '#0e0d0a', '#4c4636' ); text( c, title, x + w / 2, 40, 12, '#b9a774' ); };
		sq( 16, 230, 'SPEED' ); sq( 256, 180, 'ENGINE' ); sq( 446, 178, 'FUEL · TEMP' );
		gauge( c, 131, 138, 84, s.speed, 160, { major: 8, minor: 2, labels: [ 0, 20, 40, 60, 80, 100, 120, 140, 160 ].map( String ), face: '#0e0d0a', bezel: null, tick: '#ffb84a', numeral: '#ffcf7a', needle: '#ffffff', unit: 'km/h', fontScale: 0.9 } );
		gauge( c, 346, 138, 66, s.rpm / 1000, 6, { major: 6, minor: 2, labels: [ '0', '1', '2', '3', '4', '5', '6' ], red: 5 / 6, face: '#0e0d0a', bezel: null, tick: '#ffb84a', numeral: '#ffcf7a', needle: '#ffffff', unit: 'x1000' } );
		miniGauge( c, 535, 100, 40, fuelFrac( s ), 'E', 'F', 'low', '#ffb84a' );
		miniGauge( c, 535, 182, 40, tempFrac( s ), 'C', 'H', 'hot', '#ffb84a' );
		text( c, gearText( s ), 346, 200, 18, '#ffcf7a', 'center', 800 );
		arrows( c, 300, 392, 238, s, 12 );
		lamps( c, 140, 238, s, 40 );

	},
	// the van: compact digital, bar graphs
	van( c, s ) {

		rect( c, 0, 0, 640, 256, '#0f1514' );
		panel( c, 20, 20, 600, 216, '#06100e', '#2a4642' );
		text( c, String( Math.round( s.speed ) ), 210, 106, 86, '#d8fff4', 'center', 800 );
		text( c, 'km/h', 210, 160, 16, '#7fc9b6' );
		for ( let i = 0; i < 20; i ++ ) rect( c, 360 + i * 12, 60, 9, 40, s.rpm / 6500 > i / 20 ? ( i > 16 ? '#ff5a3a' : '#5fe0c0' ) : '#173029' );
		text( c, Math.round( s.rpm ) + ' r/min', 480, 118, 15, '#7fc9b6' );
		text( c, gearText( s ), 70, 70, 26, '#5fe0c0', 'center', 800 );
		for ( const [ y, f, label, warn ] of [ [ 150, fuelFrac( s ), 'FUEL', s.fuel < 0.12 ], [ 186, tempFrac( s ), 'TEMP', s.temp > 112 ] ] ) {

			text( c, label, 380, y, 12, '#7fc9b6', 'left' );
			for ( let i = 0; i < 12; i ++ ) rect( c, 430 + i * 14, y - 8, 11, 16, f > i / 12 ? warn ? '#ff5a3a' : '#5fe0c0' : '#173029' );

		}
		text( c, 'ODO ' + Math.floor( s.odo ) + ' km', 210, 196, 14, '#7fc9b6' );
		arrows( c, 160, 260, 34, s, 13 );
		lamps( c, 320, 222, s, 44 );

	},
	// the sports car: one big tachometer, the speed inside it, shift lights over it
	sports( c, s ) {

		rect( c, 0, 0, 640, 256, '#0d0d10' );
		for ( let y = 0; y < 256; y += 8 ) for ( let x = ( y / 8 ) % 2 ? 0 : 8; x < 640; x += 16 ) rect( c, x, y, 8, 8, '#141418' );
		const shift = clamp( ( s.rpm - 4800 ) / 1400, 0, 1 );
		for ( let i = 0; i < 10; i ++ ) circle( c, 230 + i * 20, 14, 6, shift * 10 > i ? ( i < 4 ? '#3cff6e' : i < 8 ? '#ffb020' : '#ff2e2e' ) : '#22262a' );
		gauge( c, 320, 140, 108, s.rpm / 1000, 8, { a0: Math.PI * 0.8, sweep: Math.PI * 1.4, major: 8, minor: 4, labels: [ '0', '1', '2', '3', '4', '5', '6', '7', '8' ], red: 6.5 / 8, face: '#08080a', bezel: '#b5292a', needle: '#ff3a1a', tick: '#f2f2f2', numeral: '#f2f2f2' } );
		text( c, String( Math.round( s.speed ) ), 320, 140, 48, '#ffffff', 'center', 800 );
		text( c, 'km/h', 320, 172, 13, '#c9c9c9' );
		text( c, gearText( s ), 320, 214, 22, '#ff5a3a', 'center', 800 );
		for ( const [ x, f, label, warn ] of [ [ 80, fuelFrac( s ), 'FUEL', s.fuel < 0.12 ], [ 560, tempFrac( s ), 'OIL °C', s.temp > 112 ] ] ) {

			for ( let i = 0; i < 8; i ++ ) rect( c, x - 30, 170 - i * 16, 60, 11, f > i / 8 ? warn ? '#ff2e2e' : '#e8e8e8' : '#26262a' );
			text( c, label, x, 196, 12, '#b0b0b0' );

		}
		text( c, s.grounded ? 'TRACTION' : 'AIRBORNE', 560, 40, 12, s.grounded ? '#8a8a8a' : '#ffb020' );
		arrows( c, 150, 490, 40, s, 14 );
		lamps( c, 320, 244, s, 40 );

	},
	// the bus: speed dial, door and stop status, air pressure
	bus( c, s ) {

		rect( c, 0, 0, 640, 256, '#0f1a17' );
		gauge( c, 128, 132, 100, s.speed, 100, { major: 10, minor: 2, labels: [ 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100 ].map( String ), needle: '#ffd23a', unit: 'km/h', digital: gearText( s ), accent: '#ffd23a', fontScale: 0.85 } );
		panel( c, 248, 28, 196, 196, '#06110e', '#2c5248' );
		text( c, 'ROUTE 1 · CIRCLE', 346, 48, 13, '#9fe0c9' );
		text( c, s.doors ? 'DOORS OPEN' : 'DOORS CLOSED', 346, 86, 19, s.doors ? '#ffb020' : '#7dffb0', 'center', 800 );
		text( c, s.speed < 1 ? 'AT STOP' : 'IN SERVICE', 346, 118, 15, '#cfe9de' );
		text( c, Math.round( s.rpm ) + ' r/min', 346, 152, 15, '#9fe0c9' );
		text( c, 'ODO ' + Math.floor( s.odo ) + ' km', 346, 184, 13, '#9fe0c9' );
		gauge( c, 520, 76, 46, 7.6 + Math.sin( s.odo * 3 ) * 0.2, 10, { major: 5, minor: 2, labels: [ '0', '2', '4', '6', '8', '10' ], unit: 'AIR 1', needle: '#ff6a33', fontScale: 1.3 } );
		gauge( c, 520, 186, 46, 7.4 + Math.cos( s.odo * 3 ) * 0.2, 10, { major: 5, minor: 2, labels: [ '0', '2', '4', '6', '8', '10' ], unit: 'AIR 2', needle: '#ff6a33', fontScale: 1.3 } );
		rect( c, 588, 40, 12, 180, '#122420' ); rect( c, 588, 40 + 180 * ( 1 - fuelFrac( s ) ), 12, 180 * fuelFrac( s ), s.fuel < 0.12 ? '#ff5a3a' : '#7dffb0' );
		rect( c, 610, 40, 12, 180, '#122420' ); rect( c, 610, 40 + 180 * ( 1 - tempFrac( s ) ), 12, 180 * tempFrac( s ), s.temp > 112 ? '#ff3b2e' : '#7dc7ff' );
		arrows( c, 300, 392, 238, s, 12 );
		lamps( c, 128, 244, s, 40 );

	},
};

// ---- the auxiliary display (640 x 256): taxi meter, police laptop, bus ticket machine

const AUX = {
	taxi( c, s ) {

		rect( c, 0, 0, 640, 256, '#070707' );
		const m = s.meter || {};
		text( c, 'MERIDIAN CAB CO · TARIFF 1', 320, 24, 18, '#9a8a6a' );
		panel( c, 40, 50, 560, 120, '#120303', '#3a1410' );
		text( c, '$ ' + ( m.on ? m.fare : m.last || 0 ).toFixed( 2 ), 320, 112, 82, m.on ? '#ff3b26' : '#5a1c14', 'center', 800 );
		text( c, m.on ? 'HIRED' : 'FOR HIRE', 120, 210, 30, m.on ? '#ff8a3a' : '#3cff6e', 'center', 800 );
		text( c, ( ( m.dist || 0 ) / 1000 ).toFixed( 2 ) + ' km', 360, 200, 22, '#d9c7a0' );
		const t = Math.floor( m.time || 0 );
		text( c, Math.floor( t / 60 ) + ':' + String( t % 60 ).padStart( 2, '0' ), 530, 200, 22, '#d9c7a0' );
		text( c, 'DIST', 360, 232, 13, '#7a6a52' ); text( c, 'TIME', 530, 232, 13, '#7a6a52' );

	},
	police( c, s ) {

		rect( c, 0, 0, 640, 256, '#0a1622' );
		rect( c, 0, 0, 640, 34, '#13324d' );
		text( c, 'MERIDIAN PD · MDT · UNIT 7-ADAM', 16, 17, 16, '#d9ecff', 'left', 700 );
		text( c, s.siren ? 'CODE 3' : 'CODE 1', 624, 17, 16, s.siren ? '#ff6060' : '#7fe0a0', 'right', 800 );
		text( c, 'CITY STATUS', 24, 60, 13, '#7fa7c5', 'left' );
		for ( let i = 0; i < 5; i ++ ) { const on = s.wanted > i; tri( c, [ 40 + i * 44, 82, 52 + i * 44, 106, 28 + i * 44, 106 ], on ? '#ffb020' : '#1d2f40' ); }
		text( c, s.wanted ? 'WANTED LEVEL ' + s.wanted : 'NO ACTIVE ALERTS', 24, 132, 18, s.wanted ? '#ffb020' : '#a8c8e0', 'left', 700 );
		text( c, 'SPEED ' + Math.round( s.speed ) + ' km/h · ' + gearText( s ), 24, 166, 16, '#a8c8e0', 'left' );
		text( c, 'LIGHT BAR ' + ( s.siren ? 'ON · SIREN ON' : 'OFF' ), 24, 196, 16, s.siren ? '#ff8a8a' : '#a8c8e0', 'left' );
		panel( c, 380, 50, 236, 186, '#08121c', '#1f4b6e' );
		for ( let i = 0; i < 6; i ++ ) line( c, 390, 70 + i * 30, 606, 70 + i * 30, '#13324d', 1 );
		for ( let i = 0; i < 7; i ++ ) line( c, 390 + i * 36, 56, 390 + i * 36, 230, '#13324d', 1 );
		circle( c, 498, 143, 7, '#4fb4ff' ); ring( c, 498, 143, 18, 2, '#4fb4ff' );
		text( c, 'GPS', 600, 222, 11, '#4f7fa6', 'right' );

	},
	bus( c, s ) {

		rect( c, 0, 0, 640, 256, '#0c1412' );
		rect( c, 0, 0, 640, 40, '#1f7350' );
		text( c, 'MERIDIAN TRANSIT', 320, 20, 22, '#ffffff', 'center', 800 );
		text( c, 'TAP CARD HERE', 320, 80, 30, '#ffe066', 'center', 800 );
		text( c, 'SINGLE  $2.40   ·   DAY  $6.00', 320, 124, 20, '#d8efe6' );
		text( c, s.doors ? 'BOARDING · DOORS OPEN' : 'NEXT STOP · CENTRAL AVENUE', 320, 172, 20, s.doors ? '#7dffb0' : '#9fe0c9' );
		const h = s.clock, hh = Math.floor( h ), mm = Math.floor( ( h - hh ) * 60 );
		text( c, String( hh ).padStart( 2, '0' ) + ':' + String( mm ).padStart( 2, '0' ), 320, 220, 22, '#ffffff' );

	},
};

// ---- the centre stack (384 x 512): the clock and trip, then the switches

const ACCENT = { sedan: '#e9c27a', taxi: '#ffd04a', police: '#5fb8ff', pickup: '#ffb84a', van: '#5fe0c0', sports: '#ff5a3a', bus: '#7dffb0' };

function stack( c, s, hover ) {

	const accent = ACCENT[ s.kind ] || '#6fe3c8';
	rect( c, 0, 0, 384, 512, '#0a0d10' );
	const h = s.clock, hh = Math.floor( h ), mm = Math.floor( ( h - hh ) * 60 );
	text( c, String( hh ).padStart( 2, '0' ) + ':' + String( mm ).padStart( 2, '0' ), 20, 36, 34, '#f2f4f2', 'left', 700 );
	text( c, ( s.rain > 0.05 ? 'RAIN · ' : '' ) + ( 14 + Math.round( 8 * Math.sin( ( h - 9 ) / 24 * TAU ) ) ) + ' °C', 364, 36, 18, '#aab4b1', 'right' );
	line( c, 16, 64, 368, 64, '#22292c', 2 );
	text( c, 'TRIP ' + s.trip.toFixed( 1 ) + ' km', 20, 84, 16, '#c8d0cc', 'left' );
	text( c, 'RANGE ' + Math.round( s.fuel * 520 ) + ' km', 364, 84, 16, s.fuel < 0.12 ? '#ffb020' : '#c8d0cc', 'right' );
	text( c, s.engineOn ? ( s.parkBrake ? 'PARKED' : 'READY · ' + s.gear ) : 'ENGINE OFF', 20, 110, 15, s.engineOn ? accent : '#ffb020', 'left', 700 );
	text( c, 'CONDITION ' + Math.round( s.hp ) + '%', 364, 110, 15, s.hp < 45 ? '#ff8a6a' : '#8c9894', 'right' );
	for ( const ctl of controlsFor( s.kind ) ) {

		const on = controlOn( s, ctl.id ), hov = hover === ctl.id;
		rect( c, ctl.x, ctl.y, ctl.w, ctl.h, hov ? '#24343a' : '#141b1f' );
		c.lineWidth = on ? 3 : 1.5; c.strokeStyle = on ? accent : '#33403f'; c.strokeRect( ctl.x + 1.5, ctl.y + 1.5, ctl.w - 3, ctl.h - 3 );
		const blink = ( ctl.id === 'indL' && s.ind === 'L' || ctl.id === 'indR' && s.ind === 'R' || ctl.id === 'hazard' && s.hazard ) && ! s.blinkOn;
		rect( c, ctl.x + 10, ctl.y + 10, 9, 9, on && ! blink ? accent : '#2c3537' );
		text( c, ctl.short + ( ctl.key ? '  ' + ctl.key : '' ), ctl.x + ctl.w / 2, ctl.y + 24, 15, '#dfe7e3' );
		text( c, controlState( s, ctl.id ), ctl.x + ctl.w / 2, ctl.y + 48, 15, on ? accent : '#7c8885', 'center', 700 );

	}

}

// the whole atlas
export function drawInstruments( ctx, s, hover = null ) {

	const R = REGIONS;
	for ( const [ key, fn ] of [ [ 'cluster', CLUSTER[ s.kind ] || CLUSTER.sedan ], [ 'aux', AUX[ s.kind ] ], [ 'stack', ( c ) => stack( c, s, hover ) ] ] ) {

		const r = R[ key ];
		ctx.save();
		ctx.beginPath(); ctx.rect( r.x, r.y, r.w, r.h ); ctx.clip();
		ctx.translate( r.x, r.y );
		if ( fn ) fn( ctx, s ); else rect( ctx, 0, 0, r.w, r.h, '#050505' );
		// an engine switched off leaves the cluster dark but legible
		if ( key === 'cluster' && ! s.engineOn ) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect( 0, 0, r.w, r.h ); text( ctx, 'ENGINE OFF · START ON THE CONSOLE', r.w / 2, 18, 13, '#ffb020' ); }
		ctx.restore();

	}

}

export const CLUSTER_KINDS = Object.keys( CLUSTER );
