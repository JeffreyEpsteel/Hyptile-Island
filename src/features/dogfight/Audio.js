// The fighters' sound (wave 26A), synthesized like the seaplane's (no samples; a no-op without app.audio):
//   FighterAudio  the engine: the seaplane's radial voice (PlaneAudio) retuned per airframe - the Sabrewing's twelve-cylinder
//                 inline fires six times a revolution, the radials seven and nine - and a louder slipstream at fighter speeds
//   GunVoice      the guns: looped noise through a band-pass, chopped by a square wave at the rate of fire (one rattle per
//                 gun kind: light, heavy, cannon), on while the trigger fires; positioned for the others' guns
//   hits          a metallic clank when rounds strike your airframe, a dull tick when yours strike someone

import { PlaneAudio } from '../seaplane/PlaneAudio.js';

const VOICE = {
	sabrewing: { fires: 6, idle: 900, max: 3000, tone: 1.0 },
	stormgull: { fires: 9, idle: 700, max: 2700, tone: 0.82 },
	bulwark: { fires: 7, idle: 800, max: 2700, tone: 0.9 },
};
export const GUN_VOICE = {
	light: { band: 2600, q: 0.9, gain: 0.32, rate: 16 },
	heavy: { band: 1500, q: 0.8, gain: 0.42, rate: 13 },
	cannon: { band: 520, q: 0.7, gain: 0.6, rate: 9.5 },
};

export class FighterAudio extends PlaneAudio {

	constructor( app, id = 'sabrewing' ) {

		super( app );
		this.id = id;

	}

	update( dt, s = {} ) {

		super.update( dt, { ...s, horn: false, flaps: false, cranking: false } );
		const n = this.nodes, ctx = this.ctx;
		if ( ! n || ! ctx ) return;
		const V = VOICE[ this.id ] || VOICE.sabrewing;
		const rpm = Math.max( 0, Math.min( 1, s.rpm || 0 ) ), t = ctx.currentTime, k = 0.06;
		const rev = ( V.idle + ( V.max - V.idle ) * rpm ) / 60;
		const f = rev * V.fires / 2 * V.tone;
		n.fire.frequency.setTargetAtTime( f, t, k );
		n.sub.frequency.setTargetAtTime( f / 2, t, k );
		n.high.frequency.setTargetAtTime( f * 2.01, t, k );
		n.lp.frequency.setTargetAtTime( 320 + 2900 * Math.pow( rpm, 1.3 ) + ( s.inside ? 0 : 400 ), t, k );
		const as = Math.max( 0, s.airspeed || 0 );
		n.bp.frequency.setTargetAtTime( 420 + as * 14 + rpm * 400, t, 0.2 );
		n.wash.gain.setTargetAtTime( Math.min( 1.1, rpm * 0.2 + as / 130 * 0.7 ), t, 0.2 );

	}

}

export class GunVoice {

	constructor( app, { spatial = false } = {} ) {

		this.app = app;
		this.spatial = spatial;
		this.nodes = null;
		this.state = { firing: {}, hits: 0, ticks: 0 };

	}

	get ctx() {

		const a = this.app && this.app.audio;
		return a && a.ctx && ! a._failed ? a.ctx : null;

	}

	_build( ctx ) {

		const a = this.app.audio;
		const out = ctx.createGain();
		out.gain.value = 1;
		let pan = null;
		if ( this.spatial ) {

			pan = ctx.createPanner();
			pan.panningModel = 'equalpower';
			pan.distanceModel = 'inverse';
			pan.refDistance = 25;
			pan.maxDistance = 4000;
			out.connect( pan );
			pan.connect( a.sfxAbove || a.master || ctx.destination );

		} else out.connect( a.sfxAbove || a.master || ctx.destination );
		const len = Math.floor( ctx.sampleRate * 1.5 );
		const buf = ctx.createBuffer( 1, len, ctx.sampleRate );
		const d = buf.getChannelData( 0 );
		for ( let i = 0; i < len; i ++ ) d[ i ] = Math.random() * 2 - 1;
		const voices = {};
		const sources = [];
		for ( const kind in GUN_VOICE ) {

			const G = GUN_VOICE[ kind ];
			const src = ctx.createBufferSource();
			src.buffer = buf;
			src.loop = true;
			const bp = ctx.createBiquadFilter();
			bp.type = 'bandpass';
			bp.frequency.value = G.band;
			bp.Q.value = G.q;
			// the chopper: gain = 0.5 + 0.5 * square( rate ), so each round is a crack
			const chop = ctx.createGain();
			chop.gain.value = 0.5;
			const lfo = ctx.createOscillator();
			lfo.type = 'square';
			lfo.frequency.value = G.rate;
			const depth = ctx.createGain();
			depth.gain.value = 0.5;
			lfo.connect( depth );
			depth.connect( chop.gain );
			const vol = ctx.createGain();
			vol.gain.value = 0;
			src.connect( bp );
			bp.connect( chop );
			chop.connect( vol );
			vol.connect( out );
			src.start( 0, Math.random() );
			lfo.start();
			sources.push( src, lfo );
			voices[ kind ] = { vol, lfo, peak: G.gain };

		}

		this.nodes = { out, pan, voices, sources, buf };

	}

	// firing: { light: rounds this frame, heavy, cannon } (counts), at: the position for a spatial voice
	update( dt, firing = {}, at = null, gain = 1 ) {

		const ctx = this.ctx;
		const any = Object.values( firing ).some( ( v ) => v > 0 );
		for ( const k in GUN_VOICE ) this.state.firing[ k ] = firing[ k ] > 0;
		if ( ! ctx ) return;
		if ( ! this.nodes ) {

			if ( ! any ) return;
			try { this._build( ctx ); } catch ( e ) { this.app = null; return; }

		}

		const n = this.nodes, t = ctx.currentTime;
		const muted = !! ( this.app.audio && this.app.audio._muted );
		for ( const k in n.voices ) {

			const v = n.voices[ k ];
			v.vol.gain.setTargetAtTime( ! muted && firing[ k ] > 0 ? v.peak * gain : 0, t, 0.015 );

		}

		if ( n.pan && at ) {

			const p = n.pan;
			if ( p.positionX ) {

				p.positionX.setTargetAtTime( at.x, t, 0.03 );
				p.positionY.setTargetAtTime( at.y, t, 0.03 );
				p.positionZ.setTargetAtTime( at.z, t, 0.03 );

			} else p.setPosition( at.x, at.y, at.z );

		}

	}

	// rounds striking: 'clank' (your airframe, loud and close) / 'tick' (yours landing on a target)
	hit( kind = 'clank' ) {

		if ( kind === 'clank' ) this.state.hits ++;
		else this.state.ticks ++;
		const ctx = this.ctx, n = this.nodes;
		if ( ! ctx || ( this.app.audio && this.app.audio._muted ) ) return;
		try {

			if ( ! this.nodes ) this._build( ctx );
			const t = ctx.currentTime;
			const src = ctx.createBufferSource();
			src.buffer = this.nodes.buf;
			const f = ctx.createBiquadFilter();
			f.type = 'bandpass';
			f.frequency.value = kind === 'clank' ? 1900 + Math.random() * 900 : 900;
			f.Q.value = kind === 'clank' ? 4 : 1.5;
			const g = ctx.createGain();
			g.gain.setValueAtTime( kind === 'clank' ? 0.7 : 0.18, t );
			g.gain.exponentialRampToValueAtTime( 0.001, t + ( kind === 'clank' ? 0.12 : 0.05 ) );
			src.connect( f );
			f.connect( g );
			g.connect( this.nodes.out );
			src.start( t, Math.random() );
			src.stop( t + 0.15 );

		} catch ( e ) { /* a missed clank is fine */ }

	}

	dispose() {

		const n = this.nodes;
		this.nodes = null;
		if ( ! n ) return;
		for ( const s of n.sources ) try { s.stop(); } catch ( e ) { /* stopped */ }
		try { n.out.disconnect(); if ( n.pan ) n.pan.disconnect(); } catch ( e ) { /* ignore */ }

	}

}
