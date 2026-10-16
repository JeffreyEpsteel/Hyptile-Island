// Fishing-scale effects (wave 25D): the small, close recipes the rod, the line and the bobber call. They are mixed into
// VfxSystem's prototype (VfxSystem.js), so `this` is the system: they use its record helpers (_rec, _col, _n, _r, _dup,
// _spray, _foam) and fill the same particle pool. Strength 1 is a bobber landing at casting range; a hooked fish
// thrashing is about 2; a big fish 3. Sizes are metres (a bobber is a few centimetres, a drop 1-3 cm).
//
//   sys.plop( x, y, z, strength )               the bobber (or a fish) breaking the surface: a thin crown, drops, two rings
//   sys.ripple( x, y, z, strength )             a nibble: a ring or two spreading from the float, no drops
//   sys.glint( x, y, z, strength )              the flash of light off a wet rod tip or a line snapping taut (no point light)
//   sys.drips( x, y, z, strength, floorY )      drops falling from a hanging fish or the tip, lit by the sky
//   sys.flick( x, y, z, strength, dx, dy, dz )  a fan of drops thrown off the line along a direction (a cast, a snap, a crank)

import { LOOK, ORIENT, FLOOR } from './VfxPool.js';
import { SPRITE } from '../../fx/VfxAtlas.js';

const G = 9.81;
const WATER = [ 0.9, 0.93, 0.95 ];
const clamp = ( v, a, b ) => ( v < a ? a : v > b ? b : v );

export const FISH_TYPES = [ 'plop', 'ripple', 'glint', 'drips' ];

export const FISH_RECIPES = {

	plop( x, y, z, strength = 1 ) {

		const s = clamp( strength, 0.1, 4 );
		if ( this._dup( this.T.plop, x, y, z ) ) return;
		const ss = Math.sqrt( s );
		// the crown: a few torn sheets jumping up a hand's height and falling back
		for ( let i = 0, n = 1 + this._n( 1.5 + 1.5 * s ); i < n; i ++ ) {

			const a = this.rand() * Math.PI * 2, h = this._r( 0.15, 0.6 ) * ss;
			const r = this._rec( x + Math.cos( a ) * 0.03, y + 0.03, z + Math.sin( a ) * 0.03, this._r( 0.35, 0.6 ) * ss, SPRITE.SHEET, LOOK.WATER, ORIENT.UPRIGHT );
			r.vx = Math.cos( a ) * h; r.vz = Math.sin( a ) * h; r.vy = this._r( 1.6, 2.8 ) * ss;
			r.ay = - G; r.drag = 0.5;
			r.s0 = 0.05 * ss; r.s1 = 0.22 * ss; r.a = 0.75; r.floor = y; r.floorMode = FLOOR.DIE;
			this._col( r, WATER );
			this.pool.spawn();

		}

		// drops flung out
		for ( let i = 0, n = this._n( 7 + 6 * s ); i < n; i ++ ) {

			const a = this.rand() * Math.PI * 2, h = this._r( 0.3, 1.8 ) * ss;
			const r = this._rec( x, y + 0.04, z, this._r( 0.5, 0.9 ), SPRITE.EMBER, LOOK.WATER, ORIENT.STREAK );
			r.vx = Math.cos( a ) * h; r.vz = Math.sin( a ) * h; r.vy = this._r( 1.5, 4 ) * ss;
			r.ay = - G; r.drag = 0.15; r.s0 = r.s1 = this._r( 0.02, 0.04 );
			r.a = 1; r.floor = y; r.floorMode = FLOOR.DIE;
			this._col( r, WATER );
			this.pool.spawn();

		}

		// two rings, the second smaller and later in its life (it starts as large as the first would be a moment on)
		this._ring( x, y, z, 0.55 * ss, 1.1, 0.75 );
		this._ring( x, y, z, 0.3 * ss, 0.8, 0.5 );
		// the scene's GPU spray as well, when there is one: fine mist lit by the sun
		this._spray( x, y + 0.05, z, 0, 2.2 * ss, 0, Math.round( 8 * s * this.scale ), 0.014, 0, 1.2, 0.3, 0.9 );

	},

	// a ring of foam lying on the water growing to `size` metres across
	_ring( x, y, z, size, life, alpha ) {

		const r = this._rec( x, y + 0.03, z, life * this._r( 0.9, 1.2 ), SPRITE.FOAM_RING, LOOK.WATER, ORIENT.FLAT );
		r.s0 = 0.06; r.s1 = size; r.spin = this._r( - 0.2, 0.2 ); r.a = alpha;
		this._col( r, WATER );
		this.pool.spawn();

	},

	ripple( x, y, z, strength = 1 ) {

		const s = clamp( strength, 0.1, 3 );
		if ( this._dup( this.T.ripple, x, y, z ) ) return;
		this._ring( x, y, z, 0.35 + 0.35 * s, 1.5 + 0.4 * s, 0.4 + 0.12 * s );
		if ( s > 0.7 ) this._ring( x, y, z, 0.2 + 0.2 * s, 1.0, 0.3 );

	},

	// the bite: a light additive star at a point (the tip of a wet rod catching the sun, a line going taut)
	glint( x, y, z, strength = 1 ) {

		const s = clamp( strength, 0.1, 3 );
		if ( this._dup( this.T.glint, x, y, z ) ) return;
		const r = this._rec( x, y, z, 0.16, SPRITE.FLASH, LOOK.GLOW );
		r.s0 = 0.025 * s; r.s1 = 0.1 * s; r.spin = this._r( - 1.5, 1.5 );
		this._col( r, [ 1.0, 0.95, 0.82 ], 4 );
		this.pool.spawn( true );
		// two or three sparks of beaded water leaving the tip
		for ( let i = 0, n = 2 + this._n( 2 ); i < n; i ++ ) {

			const k = this._rec( x, y, z, this._r( 0.25, 0.5 ), SPRITE.EMBER, LOOK.GLOW, ORIENT.STREAK );
			k.vx = this._r( - 1.5, 1.5 ); k.vy = this._r( 0.2, 1.4 ); k.vz = this._r( - 1.5, 1.5 );
			k.ay = - G * 0.6; k.drag = 1.2; k.s0 = k.s1 = 0.012;
			this._col( k, [ 1.0, 0.95, 0.85 ], 5 );
			this.pool.spawn();

		}

	},

	drips( x, y, z, strength = 1, floorY = - 1e4 ) {

		const s = clamp( strength, 0.1, 3 );
		if ( this._dup( this.T.drips, x, y, z ) ) return;
		const fl = Number.isFinite( floorY ) ? floorY : - 1e4;
		for ( let i = 0, n = 1 + this._n( 2.5 * s ); i < n; i ++ ) {

			const r = this._rec( x + this._r( - 0.06, 0.06 ), y, z + this._r( - 0.06, 0.06 ), this._r( 0.5, 1.1 ), SPRITE.EMBER, LOOK.WATER, ORIENT.STREAK );
			r.vx = this._r( - 0.25, 0.25 ); r.vy = this._r( - 0.4, 0.3 ); r.vz = this._r( - 0.25, 0.25 );
			r.ay = - G; r.drag = 0.05; r.s0 = r.s1 = this._r( 0.022, 0.04 );
			r.a = 1; r.floor = fl; r.floorMode = FLOOR.DIE;
			this._col( r, WATER );
			this.pool.spawn();

		}

	},

	flick( x, y, z, strength = 1, dx = 0, dy = 0, dz = 1 ) {

		const s = clamp( strength, 0.1, 3 );
		if ( this._dup( this.T.drips, x, y, z ) ) return;
		const dl = Math.hypot( dx, dy, dz ) || 1;
		dx /= dl; dy /= dl; dz /= dl;
		for ( let i = 0, n = 3 + this._n( 7 * s ); i < n; i ++ ) {

			const v = this._r( 1.5, 5 ) * Math.sqrt( s );
			const r = this._rec( x + dx * this._r( 0, 0.8 ), y + dy * this._r( 0, 0.8 ), z + dz * this._r( 0, 0.8 ), this._r( 0.4, 0.9 ), SPRITE.EMBER, LOOK.WATER, ORIENT.STREAK );
			r.vx = dx * v + this._r( - 0.8, 0.8 ); r.vy = dy * v + this._r( 0, 1.5 ); r.vz = dz * v + this._r( - 0.8, 0.8 );
			r.ay = - G; r.drag = 0.2; r.s0 = r.s1 = this._r( 0.02, 0.036 );
			r.a = 1; r.floor = y - 3; r.floorMode = FLOOR.DIE;
			this._col( r, WATER );
			this.pool.spawn();

		}

	},

};
