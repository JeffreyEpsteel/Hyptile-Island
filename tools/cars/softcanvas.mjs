// A small software Canvas2D for the headless captures (tools/perf/headless-env.mjs has a no-op 2D context, so the live
// instrument textures would upload flat grey). Enough of the API for the cockpit instruments: paths (lines, arcs, rects),
// fill / stroke, transforms, rectangular-or-path clips, gradients (as their mid colour), globalAlpha and a 5x7 bitmap
// font scaled to the font size. No anti-aliasing beyond 2x2 supersampled coverage; it proves layout and live values, not
// typography. Capture tooling only: the game never imports it.
//
//   import { installSoftCanvas } from './softcanvas.mjs';  installSoftCanvas();   // OffscreenCanvas + document canvases

const FONT = {
	'0': '0e1113151911 0e', '1': '04 0c 04 04 04 04 0e', '2': '0e 11 01 02 04 08 1f', '3': '1f 02 04 02 01 11 0e', '4': '02 06 0a 12 1f 02 02',
	'5': '1f 10 1e 01 01 11 0e', '6': '06 08 10 1e 11 11 0e', '7': '1f 01 02 04 08 08 08', '8': '0e 11 11 0e 11 11 0e', '9': '0e 11 11 0f 01 02 0c',
	A: '0e 11 11 1f 11 11 11', B: '1e 11 11 1e 11 11 1e', C: '0e 11 10 10 10 11 0e', D: '1c 12 11 11 11 12 1c', E: '1f 10 10 1e 10 10 1f',
	F: '1f 10 10 1e 10 10 10', G: '0e 11 10 17 11 11 0f', H: '11 11 11 1f 11 11 11', I: '0e 04 04 04 04 04 0e', J: '07 02 02 02 02 12 0c',
	K: '11 12 14 18 14 12 11', L: '10 10 10 10 10 10 1f', M: '11 1b 15 15 11 11 11', N: '11 11 19 15 13 11 11', O: '0e 11 11 11 11 11 0e',
	P: '1e 11 11 1e 10 10 10', Q: '0e 11 11 11 15 12 0d', R: '1e 11 11 1e 14 12 11', S: '0f 10 10 0e 01 01 1e', T: '1f 04 04 04 04 04 04',
	U: '11 11 11 11 11 11 0e', V: '11 11 11 11 11 0a 04', W: '11 11 11 15 15 15 0a', X: '11 11 0a 04 0a 11 11', Y: '11 11 0a 04 04 04 04',
	Z: '1f 01 02 04 08 10 1f', '.': '00 00 00 00 00 0c 0c', ',': '00 00 00 00 0c 04 08', ':': '00 0c 0c 00 0c 0c 00', '-': '00 00 00 1f 00 00 00',
	'+': '00 04 04 1f 04 04 00', '/': '01 01 02 04 08 10 10', '%': '18 19 02 04 08 13 03', '°': '0c 12 12 0c 00 00 00', '×': '00 11 0a 04 0a 11 00',
	'·': '00 00 00 0c 0c 00 00', '(': '02 04 08 08 08 04 02', ')': '08 04 02 02 02 04 08', '[': '0e 08 08 08 08 08 0e', ']': '0e 02 02 02 02 02 0e',
	'!': '04 04 04 04 04 00 04', '?': '0e 11 01 02 04 00 04', '#': '0a 0a 1f 0a 1f 0a 0a', '$': '04 0f 14 0e 05 1e 04', '<': '02 04 08 10 08 04 02',
	'>': '08 04 02 01 02 04 08', '=': '00 00 1f 00 1f 00 00', "'": '04 04 08 00 00 00 00', '"': '0a 0a 00 00 00 00 00', '—': '00 00 00 1f 00 00 00',
	'●': '00 0e 1f 1f 1f 0e 00', '▲': '00 04 0e 1f 00 00 00', '▼': '00 1f 0e 04 00 00 00', '◀': '02 06 0e 1e 0e 06 02', '▶': '08 0c 0e 0f 0e 0c 08',
	'*': '00 15 0e 1f 0e 15 00', '_': '00 00 00 00 00 00 1f', '&': '0c 12 14 08 15 12 0d',
};
FONT[ '0' ] = '0e 11 13 15 19 11 0e';
const GLYPH = {};
for ( const [ ch, rows ] of Object.entries( FONT ) ) GLYPH[ ch ] = rows.split( ' ' ).map( ( h ) => parseInt( h, 16 ) );

function parseColor( c ) {

	if ( c && typeof c === 'object' && c.mid ) return c.mid;
	const s = String( c || '#000' ).trim();
	if ( s[ 0 ] === '#' ) {

		let h = s.slice( 1 );
		if ( h.length === 3 || h.length === 4 ) h = [ ...h ].map( ( x ) => x + x ).join( '' );
		const n = ( i ) => parseInt( h.slice( i, i + 2 ), 16 );
		return [ n( 0 ), n( 2 ), n( 4 ), h.length >= 8 ? n( 6 ) / 255 : 1 ];

	}
	const m = /rgba?\(([^)]+)\)/.exec( s );
	if ( m ) { const p = m[ 1 ].split( ',' ).map( Number ); return [ p[ 0 ], p[ 1 ], p[ 2 ], p.length > 3 ? p[ 3 ] : 1 ]; }
	return [ 0, 0, 0, 1 ];

}

class Gradient {

	constructor() { this.stops = []; }
	addColorStop( t, c ) { this.stops.push( [ t, parseColor( c ) ] ); this.mid = this._mid(); }
	_mid() { const s = this.stops; const a = s.reduce( ( acc, [ , c ] ) => acc.map( ( v, i ) => v + c[ i ] ), [ 0, 0, 0, 0 ] ); return a.map( ( v ) => v / s.length ); }

}

class Soft2D {

	constructor( canvas ) {

		this.canvas = canvas; this._alloc();
		this.fillStyle = '#000'; this.strokeStyle = '#000'; this.lineWidth = 1; this.font = '10px sans-serif'; this.textAlign = 'left'; this.textBaseline = 'alphabetic';
		this.globalAlpha = 1; this.lineCap = 'butt'; this.lineJoin = 'miter';
		this.m = [ 1, 0, 0, 1, 0, 0 ]; this.stack = []; this.clipMask = null; this.path = []; this.sub = null;

	}

	_alloc() { const w = this.canvas.width | 0, h = this.canvas.height | 0; if ( ! this.px || this.w !== w || this.h !== h ) { this.w = w; this.h = h; this.px = new Uint8ClampedArray( w * h * 4 ); } }
	save() { this.stack.push( { m: this.m.slice(), clip: this.clipMask, fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth, font: this.font, textAlign: this.textAlign, textBaseline: this.textBaseline, globalAlpha: this.globalAlpha } ); }
	restore() { const s = this.stack.pop(); if ( s ) { const { clip, m, ...rest } = s; Object.assign( this, rest ); this.m = m; this.clipMask = clip; } }
	setTransform( a = 1, b = 0, c = 0, d = 1, e = 0, f = 0 ) { this.m = [ a, b, c, d, e, f ]; }
	resetTransform() { this.m = [ 1, 0, 0, 1, 0, 0 ]; }
	getTransform() { const [ a, b, c, d, e, f ] = this.m; return { a, b, c, d, e, f }; }
	transform( a, b, c, d, e, f ) { const m = this.m; this.m = [ m[ 0 ] * a + m[ 2 ] * b, m[ 1 ] * a + m[ 3 ] * b, m[ 0 ] * c + m[ 2 ] * d, m[ 1 ] * c + m[ 3 ] * d, m[ 0 ] * e + m[ 2 ] * f + m[ 4 ], m[ 1 ] * e + m[ 3 ] * f + m[ 5 ] ]; }
	translate( x, y ) { this.transform( 1, 0, 0, 1, x, y ); }
	scale( x, y ) { this.transform( x, 0, 0, y, 0, 0 ); }
	rotate( a ) { const c = Math.cos( a ), s = Math.sin( a ); this.transform( c, s, - s, c, 0, 0 ); }
	_t( x, y ) { const m = this.m; return [ m[ 0 ] * x + m[ 2 ] * y + m[ 4 ], m[ 1 ] * x + m[ 3 ] * y + m[ 5 ] ]; }
	_scale() { return Math.sqrt( Math.abs( this.m[ 0 ] * this.m[ 3 ] - this.m[ 1 ] * this.m[ 2 ] ) ) || 1; }

	beginPath() { this.path = []; this.sub = null; }
	moveTo( x, y ) { this.sub = [ this._t( x, y ) ]; this.path.push( this.sub ); }
	lineTo( x, y ) { if ( ! this.sub ) return this.moveTo( x, y ); this.sub.push( this._t( x, y ) ); }
	closePath() { if ( this.sub && this.sub.length ) { this.sub.closed = true; this.sub = [ this.sub[ 0 ] ]; this.path.push( this.sub ); } }
	rect( x, y, w, h ) { this.moveTo( x, y ); this.lineTo( x + w, y ); this.lineTo( x + w, y + h ); this.lineTo( x, y + h ); this.closePath(); }
	roundRect( x, y, w, h ) { this.rect( x, y, w, h ); }
	arc( x, y, r, a0, a1, ccw = false ) {

		let sweep = a1 - a0;
		if ( ! ccw && sweep < 0 ) sweep = sweep % ( Math.PI * 2 ) + Math.PI * 2;
		if ( ccw && sweep > 0 ) sweep = sweep % ( Math.PI * 2 ) - Math.PI * 2;
		if ( Math.abs( a1 - a0 ) >= Math.PI * 2 ) sweep = ccw ? - Math.PI * 2 : Math.PI * 2;
		const n = Math.max( 8, Math.ceil( Math.abs( sweep ) * Math.max( 4, r * this._scale() ) / 6 ) );
		for ( let i = 0; i <= n; i ++ ) { const a = a0 + sweep * i / n, p = [ x + Math.cos( a ) * r, y + Math.sin( a ) * r ]; if ( i === 0 && ! this.sub ) this.moveTo( ...p ); else this.lineTo( ...p ); }

	}
	ellipse( x, y, rx, ry, rot, a0, a1, ccw ) { this.save(); this.translate( x, y ); this.rotate( rot || 0 ); this.scale( rx, ry ); const s = this.sub; this.arc( 0, 0, 1, a0, a1, ccw ); this.restore(); void s; }
	quadraticCurveTo( cx, cy, x, y ) { this.lineTo( cx, cy ); this.lineTo( x, y ); }
	arcTo( x1, y1, x2, y2 ) { this.lineTo( x1, y1 ); this.lineTo( x2, y2 ); }
	bezierCurveTo( a, b, c, d, x, y ) { this.lineTo( x, y ); }

	_polys( path = this.path ) { return path.filter( ( p ) => p.length > 1 ); }

	// nonzero scanline coverage of polygons in device space, 2x2 samples per pixel, -> callback( i, coverage )
	_raster( polys, plot ) {

		let y0 = Infinity, y1 = - Infinity;
		for ( const p of polys ) for ( const [ , y ] of p ) { y0 = Math.min( y0, y ); y1 = Math.max( y1, y ); }
		y0 = Math.max( 0, Math.floor( y0 ) ); y1 = Math.min( this.h - 1, Math.ceil( y1 ) );
		const cov = new Float32Array( this.w );
		for ( let py = y0; py <= y1; py ++ ) {

			cov.fill( 0 ); let any = false, xmin = this.w, xmax = - 1;
			for ( const sy of [ 0.25, 0.75 ] ) {

				const y = py + sy, xs = [];
				for ( const p of polys ) for ( let i = 0; i < p.length; i ++ ) {

					const a = p[ i ], b = p[ ( i + 1 ) % p.length ];
					if ( ( a[ 1 ] <= y ) !== ( b[ 1 ] <= y ) ) xs.push( [ a[ 0 ] + ( y - a[ 1 ] ) / ( b[ 1 ] - a[ 1 ] ) * ( b[ 0 ] - a[ 0 ] ), b[ 1 ] > a[ 1 ] ? 1 : - 1 ] );

				}
				if ( xs.length < 2 ) continue;
				xs.sort( ( a, b ) => a[ 0 ] - b[ 0 ] );
				let wind = 0;
				for ( let i = 0; i < xs.length - 1; i ++ ) {

					wind += xs[ i ][ 1 ];
					if ( ! wind ) continue;
					for ( const sx of [ 0.25, 0.75 ] ) {

						const a = Math.max( 0, Math.ceil( xs[ i ][ 0 ] - sx ) ), b = Math.min( this.w - 1, Math.floor( xs[ i + 1 ][ 0 ] - sx ) );
						for ( let x = a; x <= b; x ++ ) cov[ x ] += 0.25;
						if ( a <= b ) { any = true; xmin = Math.min( xmin, a ); xmax = Math.max( xmax, b ); }

					}

				}

			}
			if ( any ) for ( let x = xmin; x <= xmax; x ++ ) if ( cov[ x ] > 0 ) plot( py * this.w + x, cov[ x ] );

		}

	}

	_blend( polys, style ) {

		this._alloc();
		const [ r, g, b, a0 ] = parseColor( style ), a = a0 * this.globalAlpha, px = this.px, clip = this.clipMask;
		if ( a <= 0 ) return;
		this._raster( polys, ( i, c ) => {

			const k = a * c * ( clip ? clip[ i ] / 255 : 1 );
			if ( k <= 0 ) return;
			const j = i * 4;
			px[ j ] += ( r - px[ j ] ) * k; px[ j + 1 ] += ( g - px[ j + 1 ] ) * k; px[ j + 2 ] += ( b - px[ j + 2 ] ) * k; px[ j + 3 ] = Math.min( 255, px[ j + 3 ] + 255 * k );

		} );

	}

	fill() { this._blend( this._polys(), this.fillStyle ); }
	stroke() {

		const hw = Math.max( 0.5, this.lineWidth * this._scale() / 2 ), quads = [];
		for ( const p of this._polys() ) {

			const pts = p.closed ? [ ...p, p[ 0 ] ] : p;
			for ( let i = 0; i + 1 < pts.length; i ++ ) {

				const [ ax, ay ] = pts[ i ], [ bx, by ] = pts[ i + 1 ], dx = bx - ax, dy = by - ay, l = Math.hypot( dx, dy ) || 1;
				const nx = - dy / l * hw, ny = dx / l * hw, ex = dx / l * ( this.lineCap === 'butt' ? 0 : hw ), ey = dy / l * ( this.lineCap === 'butt' ? 0 : hw );
				quads.push( [ [ ax + nx - ex, ay + ny - ey ], [ bx + nx + ex, by + ny + ey ], [ bx - nx + ex, by - ny + ey ], [ ax - nx - ex, ay - ny - ey ] ] );

			}

		}
		// each segment separately, so overlapping joins do not cancel under the nonzero rule
		for ( const q of quads ) this._blend( [ q ], this.strokeStyle );

	}
	fillRect( x, y, w, h ) { const s = this.path; this.beginPath(); this.rect( x, y, w, h ); this.fill(); this.path = s; }
	strokeRect( x, y, w, h ) { const s = this.path; this.beginPath(); this.rect( x, y, w, h ); this.stroke(); this.path = s; }
	clearRect( x, y, w, h ) { const ga = this.globalAlpha; this.globalAlpha = 1; const s = this.path; this.beginPath(); this.rect( x, y, w, h ); this._alloc(); this._raster( this._polys(), ( i ) => { this.px.fill( 0, i * 4, i * 4 + 4 ); } ); this.path = s; this.globalAlpha = ga; }
	clip() {

		this._alloc();
		const mask = new Uint8ClampedArray( this.w * this.h ), old = this.clipMask;
		this._raster( this._polys(), ( i, c ) => { mask[ i ] = Math.min( 255, mask[ i ] + c * 255 ); } );
		if ( old ) for ( let i = 0; i < mask.length; i ++ ) mask[ i ] = mask[ i ] * old[ i ] / 255;
		this.clipMask = mask;

	}

	_size() { const m = /(\d+(?:\.\d+)?)px/.exec( this.font ); return m ? Number( m[ 1 ] ) : 10; }
	measureText( t ) { const s = this._size(); return { width: String( t ).length * s * 0.72, actualBoundingBoxAscent: s * 0.7, actualBoundingBoxDescent: s * 0.2 }; }
	fillText( text, x, y ) {

		const s = this._size(), cell = s * 0.72, px = s / 9.5, str = String( text ).toUpperCase(), width = str.length * cell;
		let ox = this.textAlign === 'center' ? x - width / 2 : this.textAlign === 'right' || this.textAlign === 'end' ? x - width : x;
		const oy = this.textBaseline === 'middle' ? y - 3.5 * px : this.textBaseline === 'top' ? y + s * 0.1 : y - 7 * px;
		const polys = [];
		for ( const ch of str ) {

			const g = GLYPH[ ch ];
			if ( g ) for ( let r = 0; r < 7; r ++ ) for ( let c = 0; c < 5; c ++ ) if ( g[ r ] & ( 16 >> c ) ) {

				const x0 = ox + c * px * 1.18, y0 = oy + r * px;
				polys.push( [ this._t( x0, y0 ), this._t( x0 + px * 1.18, y0 ), this._t( x0 + px * 1.18, y0 + px ), this._t( x0, y0 + px ) ] );

			}
			ox += cell;

		}
		for ( const p of polys ) this._blend( [ p ], this.fillStyle );

	}
	strokeText( t, x, y ) { const f = this.fillStyle; this.fillStyle = this.strokeStyle; this.fillText( t, x, y ); this.fillStyle = f; }
	createLinearGradient() { return new Gradient(); }
	createRadialGradient() { return new Gradient(); }
	createPattern() { return '#808080'; }
	setLineDash() {}
	drawImage() {}
	getImageData( x, y, w, h ) {

		this._alloc();
		const out = new Uint8ClampedArray( w * h * 4 );
		for ( let r = 0; r < h; r ++ ) out.set( this.px.subarray( ( ( y + r ) * this.w + x ) * 4, ( ( y + r ) * this.w + x + w ) * 4 ), r * w * 4 );
		return { data: out, width: w, height: h };

	}
	putImageData() {}

}

export function softContext( canvas ) { return new Soft2D( canvas ); }

export function installSoftCanvas() {

	const make = ( w = 300, h = 150 ) => {

		const c = { width: w, height: h, _ctx: null, getContext( k ) { if ( k !== '2d' ) return null; return this._ctx || ( this._ctx = new Soft2D( this ) ); }, addEventListener() {}, removeEventListener() {}, style: {} };
		return c;

	};
	globalThis.OffscreenCanvas = class { constructor( w, h ) { return make( w, h ); } };
	const doc = globalThis.document;
	if ( doc && doc.createElement && ! doc.__softCanvas ) {

		const orig = doc.createElement.bind( doc );
		doc.createElement = ( tag ) => {

			const el = orig( tag );
			if ( String( tag ).toLowerCase() !== 'canvas' ) return el;
			const gc = el.getContext.bind( el );
			el.getContext = ( k ) => k === '2d' ? ( el._ctx || ( el._ctx = new Soft2D( el ) ) ) : gc( k );
			return el;

		};
		doc.__softCanvas = true;

	}

}
