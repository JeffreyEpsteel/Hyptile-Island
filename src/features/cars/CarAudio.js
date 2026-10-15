// The cars' sound, synthesised (no samples), into the SoundScape's sfx bus (app.audio.sfxAbove, else its master) so the
// volume, the mute switch and the underwater muffle apply. A no-op without app.audio (node tests, ?noAudio).
//   engine   the driven car: a sawtooth at the firing rate plus a square sub-octave through a low-pass that opens with the
//            throttle; tyre squeal (band-passed noise) with the slide
//   horn     two detuned squares (H; the AI's honks are short positional blasts)
//   siren    the police wail while a chase is on, at the nearest pursuer
//   crash    a thud and a crunch, by strength, positioned
//
//   const a = new CarAudio( app );  a.update( dt, { on, rpm 0..1, throttle, slip, horn, x, y, z, siren: { x, y, z } | null } )
//   a.honk( x, y, z, kind )   a.crash( strength, x, y, z )   a.dispose()   a.state (the last values: tests)
//   cabin one-shots (wave 24A, unpositioned: you sit in it): a.tick( { ticks, wipes } ) the indicator relay and the wiper
//   motor's reversal, a.click( id ) a switch, a.door( open ) the door's latch and thud

export class CarAudio {

	constructor( app ) {

		this.app = app;
		this.nodes = null;
		this.state = { on: false, rpm: 0, slip: 0, horn: false, siren: false, honks: 0, crashes: 0, ticks: 0, wipes: 0, clicks: 0, doors: 0 };
		this._noise = null;

	}

	get ctx() {

		const a = this.app && this.app.audio;
		return a && a.ctx && ! a._failed ? a.ctx : null;

	}

	_bus() {

		const a = this.app.audio;
		return a.sfxAbove || a.master || a.ctx.destination;

	}

	_noiseBuffer( ctx ) {

		if ( this._noise ) return this._noise;
		const b = ctx.createBuffer( 1, ctx.sampleRate, ctx.sampleRate );
		const d = b.getChannelData( 0 );
		for ( let i = 0; i < d.length; i ++ ) d[ i ] = Math.random() * 2 - 1;
		this._noise = b;
		return b;

	}

	_panner( ctx, ref = 8 ) {

		const p = ctx.createPanner();
		p.panningModel = 'equalpower';
		p.distanceModel = 'inverse';
		p.refDistance = ref;
		p.rolloffFactor = 1;
		p.maxDistance = 1500;
		p.connect( this._bus() );
		return p;

	}

	_place( p, x, y, z ) {

		if ( ! p || ! Number.isFinite( x ) ) return;
		const t = this.ctx.currentTime;
		if ( p.positionX ) { p.positionX.setTargetAtTime( x, t, 0.03 ); p.positionY.setTargetAtTime( y, t, 0.03 ); p.positionZ.setTargetAtTime( z, t, 0.03 ); } else p.setPosition( x, y, z );

	}

	_build( ctx ) {

		const pan = this._panner( ctx, 10 );
		const out = ctx.createGain(); out.gain.value = 0; out.connect( pan );
		const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300; lp.Q.value = 1.2; lp.connect( out );
		const saw = ctx.createOscillator(); saw.type = 'sawtooth'; saw.frequency.value = 40;
		const sq = ctx.createOscillator(); sq.type = 'square'; sq.frequency.value = 20;
		const gs = ctx.createGain(); gs.gain.value = 0.35; const gq = ctx.createGain(); gq.gain.value = 0.25;
		saw.connect( gs ); gs.connect( lp ); sq.connect( gq ); gq.connect( lp );
		saw.start(); sq.start();
		// tyre squeal
		const nz = ctx.createBufferSource(); nz.buffer = this._noiseBuffer( ctx ); nz.loop = true;
		const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 6;
		const gn = ctx.createGain(); gn.gain.value = 0;
		nz.connect( bp ); bp.connect( gn ); gn.connect( pan ); nz.start();
		// horn
		const h1 = ctx.createOscillator(); h1.type = 'square'; h1.frequency.value = 392;
		const h2 = ctx.createOscillator(); h2.type = 'square'; h2.frequency.value = 466;
		const hl = ctx.createBiquadFilter(); hl.type = 'lowpass'; hl.frequency.value = 1800;
		const gh = ctx.createGain(); gh.gain.value = 0;
		h1.connect( hl ); h2.connect( hl ); hl.connect( gh ); gh.connect( pan ); h1.start(); h2.start();
		// siren (its own panner: at the pursuer)
		const span = this._panner( ctx, 25 );
		const so = ctx.createOscillator(); so.type = 'triangle'; so.frequency.value = 700;
		const gsr = ctx.createGain(); gsr.gain.value = 0;
		so.connect( gsr ); gsr.connect( span ); so.start();
		this.nodes = { pan, out, lp, saw, sq, gn, bp, gh, span, so, gsr, nz, h1, h2 };

	}

	update( dt, s = {} ) {

		const st = this.state;
		st.on = !! s.on; st.rpm = s.rpm || 0; st.slip = s.slip || 0; st.horn = !! s.horn; st.siren = !! s.siren;
		const ctx = this.ctx;
		if ( ! ctx ) return;
		if ( ! this.nodes ) {

			if ( ! s.on && ! s.siren && ! s.horn ) return;
			try { this._build( ctx ); } catch ( e ) { this._failed = true; return; }

		}

		const n = this.nodes, t = ctx.currentTime;
		this._place( n.pan, s.x, s.y, s.z );
		const rpm = Math.min( 1, Math.max( 0, st.rpm ) );
		const f = 34 + rpm * 150;
		n.saw.frequency.setTargetAtTime( f, t, 0.05 );
		n.sq.frequency.setTargetAtTime( f / 2, t, 0.05 );
		n.lp.frequency.setTargetAtTime( 260 + ( s.throttle || 0 ) * 1300 + rpm * 600, t, 0.06 );
		n.out.gain.setTargetAtTime( st.on ? 0.1 + 0.08 * ( s.throttle || 0 ) : 0, t, 0.1 );
		n.gn.gain.setTargetAtTime( st.on ? Math.min( 0.12, Math.max( 0, st.slip - 1 ) * 0.02 ) : 0, t, 0.05 );
		n.gh.gain.setTargetAtTime( st.horn ? 0.09 : 0, t, 0.015 );
		// the siren: a two-second wail
		if ( s.siren ) {

			this._place( n.span, s.siren.x, s.siren.y, s.siren.z );
			const ph = ( t % 2 ) / 2;
			n.so.frequency.setTargetAtTime( 650 + 450 * Math.sin( ph * Math.PI ), t, 0.05 );

		}

		n.gsr.gain.setTargetAtTime( s.siren ? 0.07 : 0, t, 0.2 );

	}

	// a short blast of an AI car's horn
	honk( x, y, z, kind = 'sedan' ) {

		this.state.honks ++;
		const ctx = this.ctx;
		if ( ! ctx ) return;
		try {

			const p = this._panner( ctx, 9 );
			this._place( p, x, y, z );
			const g = ctx.createGain(), t = ctx.currentTime;
			g.gain.setValueAtTime( 0, t );
			g.gain.linearRampToValueAtTime( 0.07, t + 0.02 );
			g.gain.setValueAtTime( 0.07, t + 0.32 );
			g.gain.linearRampToValueAtTime( 0, t + 0.4 );
			g.connect( p );
			const base = kind === 'bus' ? 220 : kind === 'van' || kind === 'pickup' ? 330 : 415;
			for ( const m of [ 1, 1.19 ] ) {

				const o = ctx.createOscillator();
				o.type = 'square';
				o.frequency.value = base * m;
				o.connect( g );
				o.start( t );
				o.stop( t + 0.42 );

			}

			setTimeout( () => { try { p.disconnect(); } catch ( e ) { /* gone */ } }, 600 );

		} catch ( e ) { /* audio is optional */ }

	}

	crash( strength, x, y, z ) {

		this.state.crashes ++;
		const ctx = this.ctx;
		if ( ! ctx ) return;
		try {

			const p = this._panner( ctx, 10 );
			this._place( p, x, y, z );
			const t = ctx.currentTime, k = Math.min( 1, Math.max( 0.1, strength ) );
			const src = ctx.createBufferSource();
			src.buffer = this._noiseBuffer( ctx );
			const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900 + 2000 * k;
			const g = ctx.createGain();
			g.gain.setValueAtTime( 0.35 * k, t );
			g.gain.exponentialRampToValueAtTime( 0.001, t + 0.25 + 0.4 * k );
			src.connect( lp ); lp.connect( g ); g.connect( p );
			src.start( t );
			src.stop( t + 0.8 );
			const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime( 90, t ); o.frequency.exponentialRampToValueAtTime( 40, t + 0.3 );
			const go = ctx.createGain(); go.gain.setValueAtTime( 0.4 * k, t ); go.gain.exponentialRampToValueAtTime( 0.001, t + 0.35 );
			o.connect( go ); go.connect( p ); o.start( t ); o.stop( t + 0.4 );
			setTimeout( () => { try { p.disconnect(); } catch ( e ) { /* gone */ } }, 1200 );

		} catch ( e ) { /* audio is optional */ }

	}

	// a short enveloped blip: a band of noise and / or a tone, straight to the sfx bus
	_blip( { freq = 0, noise = 0, q = 4, gain = 0.05, attack = 0.002, decay = 0.05, delay = 0, type = 'square', drop = 1 } ) {

		const ctx = this.ctx;
		if ( ! ctx ) return;
		try {

			const t = ctx.currentTime + delay, g = ctx.createGain();
			g.gain.setValueAtTime( 0, t );
			g.gain.linearRampToValueAtTime( gain, t + attack );
			g.gain.exponentialRampToValueAtTime( 0.0005, t + attack + decay );
			g.connect( this._bus() );
			if ( noise ) {

				const src = ctx.createBufferSource(); src.buffer = this._noiseBuffer( ctx );
				const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = noise; bp.Q.value = q;
				src.connect( bp ); bp.connect( g ); src.start( t ); src.stop( t + attack + decay + 0.02 );

			}
			if ( freq ) {

				const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime( freq, t );
				if ( drop !== 1 ) o.frequency.exponentialRampToValueAtTime( freq * drop, t + attack + decay );
				o.connect( g ); o.start( t ); o.stop( t + attack + decay + 0.02 );

			}
			setTimeout( () => { try { g.disconnect(); } catch ( e ) { /* gone */ } }, ( delay + attack + decay ) * 1000 + 200 );

		} catch ( e ) { /* audio is optional */ }

	}

	// the indicator relay (tick on, tock off) and the wiper motor at each end of its sweep
	tick( { ticks = 0, wipes = 0 } = {} ) {

		for ( let i = 0; i < ticks; i ++ ) {

			this.state.ticks ++;
			const on = this.state.ticks % 2 === 1;
			this._blip( { freq: on ? 2400 : 1500, noise: on ? 4200 : 2600, q: 3, gain: 0.05, decay: 0.022, type: 'square' } );

		}
		for ( let i = 0; i < wipes; i ++ ) {

			this.state.wipes ++;
			this._blip( { freq: 95, noise: 700, q: 1.5, gain: 0.05, attack: 0.01, decay: 0.12, type: 'triangle', drop: 0.7 } );
			this._blip( { noise: 3200, q: 6, gain: 0.012, attack: 0.05, decay: 0.25 } );

		}

	}

	// a dashboard switch
	click( id = '' ) {

		this.state.clicks ++;
		this._blip( { freq: id === 'horn' ? 0 : 1800, noise: 5200, q: 2, gain: 0.04, decay: 0.018 } );

	}

	// the door: the latch, then the panel's thud (shutting) or the seal's give (opening)
	door( open = false ) {

		this.state.doors ++;
		this._blip( { noise: 2400, q: 2.5, gain: 0.06, decay: 0.03 } );
		this._blip( { freq: open ? 140 : 80, noise: open ? 900 : 300, q: 1, gain: open ? 0.05 : 0.14, attack: 0.004, decay: open ? 0.12 : 0.22, delay: 0.03, type: 'sine', drop: 0.6 } );

	}

	dispose() {

		const n = this.nodes;
		this.nodes = null;
		if ( ! n ) return;
		for ( const o of [ n.saw, n.sq, n.so, n.nz, n.h1, n.h2 ] ) try { o.stop(); } catch ( e ) { /* stopped */ }
		for ( const o of [ n.pan, n.span ] ) try { o.disconnect(); } catch ( e ) { /* gone */ }

	}

}
