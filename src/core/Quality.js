import { GPU } from '../engine/gpu/GPU.js';

// Graphics quality tiers and the auto quality loop (app.quality).
//
//   const q = app.quality = new Quality( app );        // reads ?quality=low|medium|high|ultra|auto|off and the saved choice
//   q.update( dt );                                    // once per frame (a second call in the same frame is ignored)
//   q.setTier( 'medium' )   q.setAuto( true )   q.setTarget( 30 )   q.describe() -> 'Auto · High 85% · 58 fps / 60'
//   q.settings              the applied tier's numbers (TIERS below); q.tier, q.scale, q.auto, q.target
//
// A tier sets the render scale, the shadow map size and reach, the post effects (AO, haze shafts, motion blur,
// water reflections, TAA jitter phases: 4 as the game always had, 8 on Ultra), the particle and local-light budgets, the draw distances (MeshRenderer's
// distance cull, the residents' radii) and the night / vfx budgets. High is the look the game always had; Ultra
// adds TAA samples and longer distances; Medium and Low trade them away.
//
// Auto (default on): every ~2 s window of frames the median frame time is compared with the target (60 fps;
// 30 once even Low at half resolution cannot hold 60): over budget steps the render scale down by 0.1 inside the
// tier's range, then the tier; well under budget (the busier of the CPU frame time and the GPU's, which the loop
// samples every few frames from onSubmittedWorkDone) for two windows steps back up, never above the tier the
// player chose (High unless Ultra was picked). The window after a change is skipped (render targets re-made), and
// every reversal doubles the wait before the next step up (no flapping). The first run probes ~1 s of GPU time at
// High and starts from the tier that fits; the result is saved (localStorage 'hyptile-island.quality').
//
// The state machine (QualityLoop) has no browser or GPU in it: test/perf-scenarios.mjs drives it with frame times.

export const TIER_IDS = [ 'low', 'medium', 'high', 'ultra' ];

export const TIERS = {
	low: {
		label: 'Low', scale: [ 0.5, 0.7 ], shadows: true, shadowSize: 1024, shadowFar: 150, ao: false, shafts: false, motionBlur: false, ssr: false,
		aa: 4, particles: 0.45, lights: 4, draw: 0.55, residents: { animate: 30, update: 70, hide: 120, shadow: 20 }, fx: 'low',
	},
	medium: {
		label: 'Medium', scale: [ 0.6, 0.85 ], shadows: true, shadowSize: 1024, shadowFar: 250, ao: true, shafts: true, motionBlur: true, ssr: true,
		aa: 4, particles: 0.7, lights: 6, draw: 0.75, residents: { animate: 45, update: 100, hide: 180, shadow: 30 }, fx: 'high',
	},
	high: {
		label: 'High', scale: [ 0.7, 1 ], shadows: true, shadowSize: 2048, shadowFar: 400, ao: true, shafts: true, motionBlur: true, ssr: true,
		aa: 4, particles: 1, lights: 8, draw: 1, residents: { animate: 60, update: 120, hide: 260, shadow: 40 }, fx: 'high',
	},
	ultra: {
		label: 'Ultra', scale: [ 0.85, 1 ], shadows: true, shadowSize: 2048, shadowFar: 400, ao: true, shafts: true, motionBlur: true, ssr: true,
		aa: 8, particles: 1, lights: 8, draw: 1.35, residents: { animate: 80, update: 160, hide: 320, shadow: 60 }, fx: 'high',
	},
};

export const STORAGE_KEY = 'hyptile-island.quality';
export const WINDOW_S = 2;
const STEP = 0.1;
const OVER = 1.12; // a window over target x this steps down
const UNDER = 0.68; // busy time under target x this (two windows running) steps up
const HOLD_MIN = 2, HOLD_MAX = 16; // windows to wait before stepping up again after a reversal

const clampScale = ( s ) => Math.min( 1, Math.max( 0.5, Math.round( s * 20 ) / 20 ) );
const median = ( v ) => {

	if ( ! v.length ) return 0;
	const s = v.slice().sort( ( a, b ) => a - b );
	return s[ s.length >> 1 ];

};

export function isTier( t ) {

	return TIER_IDS.includes( t );

}

// the starting tier for a probe: gpuMs = median GPU frame time measured at High, full resolution
export function pickFromProbe( gpuMs, target = 60 ) {

	const budget = 1000 / target;
	const r = gpuMs / budget;
	if ( ! Number.isFinite( r ) || r <= 0 ) return { tier: 'high', scale: 1, target };
	// GPU time scales roughly with the pixel count (scale squared) for this game's pixel-bound frame
	if ( r <= 0.75 ) return { tier: 'high', scale: 1, target };
	if ( r <= 1.4 ) return { tier: 'high', scale: clampScale( Math.max( 0.7, Math.sqrt( 0.75 / r ) ) ), target };
	if ( r <= 2.2 ) return { tier: 'medium', scale: clampScale( Math.max( 0.6, Math.min( 0.85, Math.sqrt( 0.8 / r ) * 1.15 ) ) ), target };
	if ( r <= 3.5 ) return { tier: 'low', scale: 0.6, target };
	// even Low at half resolution will not make 60: hold 30 instead
	return { tier: 'low', scale: 0.5, target: Math.min( target, 30 ) };

}

// The auto quality state machine: feed frame times, it answers with the changes to make.
//   const loop = new QualityLoop( { tier: 'high', scale: 1, target: 60, ceiling: 'high' } );
//   const change = loop.frame( dtMs, busyMs )   -> null | { tier, scale, target, why }
export class QualityLoop {

	constructor( { tier = 'high', scale = 1, target = 60, ceiling = 'high', auto = true, windowS = WINDOW_S } = {} ) {

		this.tier = isTier( tier ) ? tier : 'high';
		this.scale = clampScale( scale );
		this.target = target;
		this.baseTarget = target;
		this.ceiling = isTier( ceiling ) ? ceiling : 'high';
		this.auto = auto;
		this.windowS = windowS;
		this._frames = [];
		this._busy = [];
		this._t = 0;
		this._skip = 1; // the first window (start-up, compiles) is not judged
		this._good = 0;
		this._hold = HOLD_MIN;
		this._lastDir = 0;
		this.history = []; // [ { tier, scale, target, why } ] the changes made (debug, tests)
		this.lastMs = 0;
		this.lastBusy = 0;

	}

	range( tier = this.tier ) {

		return TIERS[ tier ].scale;

	}

	// one frame: dtMs the frame interval, busyMs the busier of the CPU and GPU frame times (null: unknown)
	frame( dtMs, busyMs = null ) {

		if ( ! this.auto || ! Number.isFinite( dtMs ) || dtMs <= 0 ) return null;
		this._frames.push( Math.min( dtMs, 250 ) );
		if ( Number.isFinite( busyMs ) && busyMs > 0 ) this._busy.push( busyMs );
		this._t += dtMs / 1000;
		if ( this._t < this.windowS ) return null;
		const ms = median( this._frames );
		const busy = this._busy.length >= 3 ? median( this._busy ) : ms;
		this._frames.length = 0;
		this._busy.length = 0;
		this._t = 0;
		this.lastMs = ms;
		this.lastBusy = busy;
		if ( this._skip > 0 ) {

			this._skip --;
			return null;

		}

		return this.judge( ms, busy );

	}

	// one window's verdict (median frame interval, median busy time)
	judge( ms, busy ) {

		const budget = 1000 / this.target;
		if ( ms > budget * OVER ) {

			this._good = 0;
			return this._down( `${ ms.toFixed( 1 ) } ms > ${ budget.toFixed( 1 ) } ms` );

		}

		if ( Math.max( busy, 0 ) < budget * UNDER ) {

			this._good ++;
			if ( this._good >= this._hold ) {

				this._good = 0;
				return this._up( `${ busy.toFixed( 1 ) } ms busy < ${ ( budget * UNDER ).toFixed( 1 ) } ms` );

			}

		} else this._good = 0;
		return null;

	}

	_down( why ) {

		const [ lo ] = this.range();
		let { tier, scale, target } = this;
		if ( scale - STEP >= lo - 1e-6 ) scale = clampScale( scale - STEP );
		else {

			const i = TIER_IDS.indexOf( tier );
			if ( i > 0 ) {

				tier = TIER_IDS[ i - 1 ];
				scale = clampScale( Math.min( TIERS[ tier ].scale[ 1 ], scale ) );

			} else if ( target > 30 ) {

				// nothing left to give at 60: hold 30 (a weak GPU) instead of flapping at the floor
				target = 30;

			} else return null;

		}

		return this._apply( tier, scale, target, - 1, why );

	}

	_up( why ) {

		const [ , hi ] = this.range();
		let { tier, scale, target } = this;
		if ( target < this.baseTarget && tier === 'low' && scale <= TIERS.low.scale[ 0 ] + 1e-6 ) target = this.baseTarget; // try 60 again first
		else if ( scale + STEP <= hi + 1e-6 ) scale = clampScale( scale + STEP );
		else {

			const i = TIER_IDS.indexOf( tier );
			if ( i >= TIER_IDS.indexOf( this.ceiling ) ) return null;
			tier = TIER_IDS[ i + 1 ];
			scale = clampScale( Math.max( TIERS[ tier ].scale[ 0 ], scale ) );

		}

		return this._apply( tier, scale, target, 1, why );

	}

	_apply( tier, scale, target, dir, why ) {

		if ( tier === this.tier && scale === this.scale && target === this.target ) return null;
		// a reversal (down after up or up after down) makes the next step up wait longer
		if ( this._lastDir && dir !== this._lastDir ) this._hold = Math.min( HOLD_MAX, this._hold * 2 );
		this._lastDir = dir;
		this.tier = tier;
		this.scale = scale;
		this.target = target;
		this._skip = 1;
		this._good = 0;
		const c = { tier, scale, target, why };
		this.history.push( c );
		if ( this.history.length > 32 ) this.history.shift();
		return c;

	}

	// a manual choice: the loop continues from there and never steps above it
	set( tier, scale = null ) {

		if ( ! isTier( tier ) ) return;
		this.tier = tier;
		this.ceiling = tier;
		const [ lo, hi ] = TIERS[ tier ].scale;
		this.scale = clampScale( scale ?? hi );
		if ( this.scale < lo ) this.scale = lo;
		this.target = this.baseTarget;
		this._skip = 1;
		this._good = 0;
		this._hold = HOLD_MIN;
		this._lastDir = 0;

	}

}

// app.quality: the loop bound to the running app (applies tiers to the systems that exist)
export class Quality {

	constructor( app, { storage = null, query = null } = {} ) {

		this.app = app;
		this.storage = storage ?? ( typeof localStorage !== 'undefined' ? localStorage : null );
		const qs = query ?? app.qs;
		const q = qs && typeof qs.get === 'function' ? ( qs.get( 'quality' ) || '' ).toLowerCase() : '';
		const saved = this._load();
		let tier = saved && isTier( saved.tier ) ? saved.tier : 'high';
		let scale = saved && Number.isFinite( saved.scale ) ? saved.scale : null;
		let auto = saved && typeof saved.auto === 'boolean' ? saved.auto : true;
		const target = saved && ( saved.target === 30 || saved.target === 60 ) ? saved.target : 60;
		this.probed = !! ( saved && saved.probed );
		if ( isTier( q ) ) { tier = q; auto = false; scale = null; this.probed = true; }
		else if ( q === 'auto' ) auto = true;
		else if ( q === 'off' ) { auto = false; this.probed = true; } // benchmarks: the tier as it is, no loop
		// ?bench runs are measured at a fixed tier
		if ( qs && typeof qs.has === 'function' && qs.has( 'bench' ) && q !== 'auto' ) { auto = false; this.probed = true; }
		this.override = q || null;
		this.loop = new QualityLoop( { tier, scale: scale ?? TIERS[ tier ].scale[ 1 ], target, ceiling: saved && isTier( saved.ceiling ) ? saved.ceiling : ( tier === 'ultra' ? 'ultra' : 'high' ), auto } );
		this._frame = - 1;
		this._gpu = { pending: false, ms: 0, n: 0 };
		this._probe = null;
		this.listeners = new Set();
		this.apply();

	}

	get tier() { return this.loop.tier; }
	get scale() { return this.loop.scale; }
	get auto() { return this.loop.auto; }
	get target() { return this.loop.target; }
	get settings() { return TIERS[ this.loop.tier ]; }
	get gpuMs() { return this._gpu.ms; }

	onChange( fn ) {

		this.listeners.add( fn );
		return () => this.listeners.delete( fn );

	}

	setTier( tier, { scale = null, save = true } = {} ) {

		if ( ! isTier( tier ) ) return false;
		this.loop.set( tier, scale );
		this.probed = true;
		this.apply();
		if ( save ) this._save();
		return true;

	}

	setAuto( on ) {

		this.loop.auto = !! on;
		if ( on ) this.loop.ceiling = this.loop.tier === 'ultra' ? 'ultra' : 'high';
		this._save();

	}

	setTarget( fps ) {

		this.loop.target = this.loop.baseTarget = fps >= 45 ? 60 : 30;
		this._save();

	}

	// pushes the current tier and scale into every system that has a knob for it
	apply() {

		const app = this.app, t = TIERS[ this.loop.tier ];
		const tryDo = ( fn ) => { try { fn(); } catch ( e ) { console.warn( 'quality:', e && e.message ); } };
		if ( app.setRenderScale && app.post ) tryDo( () => app.setRenderScale( this.loop.scale ) );
		else if ( app.settings ) app.settings.renderScale = this.loop.scale;
		if ( app.settings ) app.settings.quality = this.loop.tier;
		const sh = app.shadows;
		if ( sh ) {

			sh.enabled = t.shadows && ( app.settings ? app.settings.shadowsOff !== true : true );
			if ( sh.setSize ) tryDo( () => sh.setSize( t.shadowSize ) );
			if ( sh.setReach ) tryDo( () => sh.setReach( t.shadowFar ) );
			// the far cascades re-render less often on Low (the near one stays every frame: the player's own shadow)
			if ( Array.isArray( sh.periods ) && sh.periods.length === 3 ) sh.periods = this.loop.tier === 'low' ? [ 1, 4, 8 ] : [ 1, 2, 4 ];

		}
		const post = app.post;
		if ( post ) tryDo( () => {

			if ( post.setAO ) post.setAO( t.ao );
			// uniforms the panels may also set: the tier's 'off' is 0, its 'on' is what they were before
			const toggle = ( u, on, key ) => {

				if ( ! u || ! ( 'value' in u ) ) return;
				if ( this[ key ] === undefined ) this[ key ] = u.value;
				if ( ! on && u.value !== 0 ) this[ key ] = u.value;
				u.value = on ? this[ key ] : 0;

			};
			if ( post.motionBlur ) toggle( post.motionBlur.shutter, t.motionBlur, '_shutter' );
			if ( post.haze ) toggle( post.haze.shafts, t.shafts, '_shafts' );
			if ( post.aaMode !== 'none' && post.taau ) post.taau.jitterPhaseOverride = t.aa;

		} );
		if ( app.waterMaterial && app.waterMaterial.params && app.waterMaterial.params.ssr ) app.waterMaterial.params.ssr.value = t.ssr ? 1 : 0;
		if ( app.localLights && 'limit' in app.localLights ) app.localLights.limit = t.lights;
		const mr = app.engine && app.engine.meshRenderer;
		if ( mr && 'distanceScale' in mr ) mr.distanceScale = t.draw;
		if ( app.residents && app.residents.setRadii ) tryDo( () => app.residents.setRadii( t.residents ) );
		if ( app.spray && 'budget' in app.spray ) app.spray.budget = t.particles;
		const f = app.features && app.features.get ? app.features : null;
		if ( f ) tryDo( () => {

			const vfx = f.get( 'vfx' );
			if ( vfx && vfx.sys && vfx.sys.setQuality ) vfx.sys.setQuality( t.fx );
			const night = f.get( 'night' );
			if ( night && night.setLow ) night.setLow( t.fx === 'low' );
			for ( const name of [ 'dressing', 'life' ] ) {

				const m = f.get( name );
				if ( m && m.setDrawScale ) m.setDrawScale( t.draw );

			}

		} );
		for ( const fn of this.listeners ) tryDo( () => fn( this ) );

	}

	// once per frame (after GPU.submit is fine): the frame interval drives the loop
	update( dt ) {

		const frame = GPU.frame;
		if ( frame === this._frame ) return;
		this._frame = frame;
		const ms = dt * 1000;
		// the size cull measures pixels on the internal render height
		const mr = this.app.engine && this.app.engine.meshRenderer, sr = this.app.sceneRenderer;
		if ( mr && sr && sr.height > 1 ) mr.viewHeight = sr.height;
		this._sampleGpu();
		if ( ! this.probed ) return this._probeStep( ms );
		const cpu = this.app.cpuMs || 0;
		const busy = this._gpu.n ? Math.max( cpu, this._gpu.ms ) : null;
		const c = this.loop.frame( ms, busy );
		if ( c ) {

			this.apply();
			this._save();

		}

	}

	// the GPU time of one frame in four: submit -> work done (the queue is idle at submit when the GPU keeps up,
	// so this is the frame's GPU time; when it does not, it is longer, which only confirms a step down)
	_sampleGpu() {

		const g = this._gpu;
		if ( g.pending || ! GPU.queue || ( this._frame & 3 ) !== 0 ) return;
		g.pending = true;
		const t0 = performance.now();
		GPU.queue.onSubmittedWorkDone().then( () => {

			const ms = performance.now() - t0;
			g.ms = g.n ? g.ms * 0.8 + ms * 0.2 : ms;
			g.n ++;
			g.pending = false;
			if ( this._probe ) this._probe.push( ms );

		} ).catch( () => { g.pending = false; } );

	}

	// first run: ~1 s of GPU samples at High, full scale, then the tier that fits
	_probeStep( ms ) {

		if ( ! this._probe ) {

			this._probe = [];
			this._probeT = 0;
			this._probeSaved = { tier: this.loop.tier, scale: this.loop.scale };
			this.loop.set( 'high', 1 );
			this.loop.ceiling = 'high';
			this.apply();
			return;

		}

		this._probeT += ms / 1000;
		if ( this._probeT < 1.2 || this._probe.length < 5 ) {

			if ( this._probeT > 5 ) this._finishProbe( null ); // no GPU samples: keep High and let the loop decide
			return;

		}

		this._finishProbe( median( this._probe.slice( 2 ) ) );

	}

	_finishProbe( gpuMs ) {

		const pick = gpuMs === null ? { tier: 'high', scale: 1, target: this.loop.baseTarget } : pickFromProbe( gpuMs, this.loop.baseTarget );
		this.loop.set( pick.tier, pick.scale );
		this.loop.ceiling = 'high';
		this.loop.target = pick.target;
		this.probed = true;
		this.probeMs = gpuMs;
		this._probe = null;
		this.apply();
		this._save();

	}

	describe() {

		const l = this.loop, t = TIERS[ l.tier ];
		const fps = l.lastMs ? ` · ${ ( 1000 / l.lastMs ).toFixed( 0 ) } fps / ${ l.target }` : ` · target ${ l.target }`;
		return `${ l.auto ? 'Auto · ' : '' }${ t.label } ${ Math.round( l.scale * 100 ) }%${ fps }${ this._gpu.n ? ` · GPU ${ this._gpu.ms.toFixed( 1 ) } ms` : '' }`;

	}

	_load() {

		try {

			const s = this.storage && this.storage.getItem( STORAGE_KEY );
			return s ? JSON.parse( s ) : null;

		} catch ( e ) {

			return null;

		}

	}

	_save() {

		if ( this.override && this.override !== 'auto' ) return; // a URL override is not remembered
		try {

			const l = this.loop;
			if ( this.storage ) this.storage.setItem( STORAGE_KEY, JSON.stringify( { tier: l.tier, scale: l.scale, auto: l.auto, target: l.baseTarget, ceiling: l.ceiling, probed: this.probed } ) );

		} catch ( e ) { /* private mode */ }

	}

}
