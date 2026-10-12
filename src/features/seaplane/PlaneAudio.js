// The seaplane's sound, synthesized (no samples): a radial engine drone (a sawtooth at the firing rate, a square
// sub-octave and a detuned upper partial through a low-pass that opens with the rpm) and the propeller wash / wind
// (looped white noise through a band-pass that rises with the airspeed). One HRTF-less panner at the cowling, into
// the game's SoundScape sfx bus (a.sfxAbove, else its master), so the sfx volume, the mute switch and the underwater
// muffle apply. Built on the first update with the engine running; a no-op without app.audio (node tests, ?noAudio).
//
//   const s = new PlaneAudio( app );
//   s.update( dt, { running, rpm, airspeed, x, y, z, inside } );   s.dispose()

export class PlaneAudio {

	constructor( app ) {

		this.app = app;
		this.nodes = null;
		this.level = 0; // eased engine-running level
		this.state = { rpm: 0, airspeed: 0, gain: 0 }; // last values (tests)

	}

	get ctx() {

		const a = this.app && this.app.audio;
		return a && a.ctx && ! a._failed ? a.ctx : null;

	}

	_build( ctx ) {

		const a = this.app.audio;
		const out = ctx.createGain();
		out.gain.value = 0;
		const pan = ctx.createPanner();
		pan.panningModel = 'equalpower';
		pan.distanceModel = 'inverse';
		pan.refDistance = 12;
		pan.rolloffFactor = 1.0;
		pan.maxDistance = 3000;
		out.connect( pan );
		pan.connect( a.sfxAbove || a.master || ctx.destination );

		const lp = ctx.createBiquadFilter();
		lp.type = 'lowpass';
		lp.frequency.value = 400;
		lp.Q.value = 0.9;
		const eng = ctx.createGain();
		eng.gain.value = 0.5;
		lp.connect( eng );
		eng.connect( out );
		const osc = ( type, gain ) => {

			const o = ctx.createOscillator();
			o.type = type;
			o.frequency.value = 30;
			const g = ctx.createGain();
			g.gain.value = gain;
			o.connect( g );
			g.connect( lp );
			o.start();
			return o;

		};

		const fire = osc( 'sawtooth', 0.5 ), sub = osc( 'square', 0.28 ), high = osc( 'sawtooth', 0.12 );
		// a slow wobble on the firing rate: nine cylinders never quite agree
		const lfo = ctx.createOscillator();
		lfo.frequency.value = 3.1;
		const lfoG = ctx.createGain();
		lfoG.gain.value = 0.6;
		lfo.connect( lfoG );
		lfoG.connect( fire.frequency );
		lfo.start();

		const len = Math.floor( ctx.sampleRate * 2 );
		const buf = ctx.createBuffer( 1, len, ctx.sampleRate );
		const d = buf.getChannelData( 0 );
		for ( let i = 0; i < len; i ++ ) d[ i ] = Math.random() * 2 - 1;
		const noise = ctx.createBufferSource();
		noise.buffer = buf;
		noise.loop = true;
		const bp = ctx.createBiquadFilter();
		bp.type = 'bandpass';
		bp.frequency.value = 600;
		bp.Q.value = 0.6;
		const wash = ctx.createGain();
		wash.gain.value = 0;
		noise.connect( bp );
		bp.connect( wash );
		wash.connect( out );
		noise.start();
		this.nodes = { out, pan, lp, eng, fire, sub, high, lfo, noise, bp, wash, sources: [ fire, sub, high, lfo, noise ] };

	}

	update( dt, { running = false, rpm = 0, airspeed = 0, x = 0, y = 0, z = 0, inside = false } = {} ) {

		this.level += ( ( running ? 1 : 0 ) - this.level ) * ( 1 - Math.exp( - dt * ( running ? 2.5 : 1.2 ) ) );
		const a = this.app && this.app.audio;
		const gain = a && a._muted ? 0 : this.level * ( inside ? 0.55 : 0.8 );
		this.state.rpm = rpm;
		this.state.airspeed = airspeed;
		this.state.gain = gain;
		const ctx = this.ctx;
		if ( ! ctx ) return;
		if ( ! this.nodes ) {

			if ( ! running ) return;
			try { this._build( ctx ); } catch ( e ) { console.warn( 'seaplane: audio failed', e ); this.app = null; return; }

		}

		const n = this.nodes, t = ctx.currentTime, k = 0.08;
		// a nine-cylinder radial fires 4.5 times a revolution: idle ~600 rpm, full power ~2200
		const rev = ( 600 + 1600 * rpm ) / 60;
		const f = rev * 4.5 / 2; // pitched down an octave: the drone sits better under the music
		n.fire.frequency.setTargetAtTime( f, t, k );
		n.sub.frequency.setTargetAtTime( f / 2, t, k );
		n.high.frequency.setTargetAtTime( f * 2.02, t, k );
		n.lp.frequency.setTargetAtTime( 260 + 2400 * Math.pow( rpm, 1.4 ) + ( inside ? 0 : 300 ), t, k );
		n.bp.frequency.setTargetAtTime( 380 + airspeed * 22 + rpm * 500, t, 0.2 );
		n.wash.gain.setTargetAtTime( Math.min( 0.9, rpm * 0.25 + airspeed / 55 * 0.5 ), t, 0.2 );
		n.out.gain.setTargetAtTime( gain, t, 0.1 );
		const p = n.pan;
		if ( p.positionX ) {

			p.positionX.setTargetAtTime( x, t, 0.03 );
			p.positionY.setTargetAtTime( y, t, 0.03 );
			p.positionZ.setTargetAtTime( z, t, 0.03 );

		} else p.setPosition( x, y, z );

	}

	dispose() {

		const n = this.nodes;
		this.nodes = null;
		if ( ! n ) return;
		for ( const s of n.sources ) try { s.stop(); } catch ( e ) { /* already stopped */ }
		try { n.out.disconnect(); n.pan.disconnect(); } catch ( e ) { /* ignore */ }

	}

}
