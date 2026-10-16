// Foley for the walking player (wave 25D, gap 4.2): the small sounds a body makes besides its footfalls, which the
// SoundScape plays per surface (footstep() in src/audio/SoundScape.js, driven by Player.js). All synthesised (no files,
// nothing to credit) and played in the head through the synth's sfx bus, so the master and sfx sliders apply.
//
//   cloth_swish   a sleeve or trouser brushing as the body moves; each stride, louder and brisker with speed
//   gear_clink    tackle on the belt (buckle, hooks, a lure) every few strides; the rod out adds to it
//   breath        a sprint's laboured in / out pairs, the recovery after it, and the winded breaths when the stamina is low
//   wade_splash   feet through shallows: a soft slosh at a wade, spray and drops at speed; deeper water carries more
//
// It only reads app.player (mode, velocity, sprinting, stamina, wade, grounded) and app.game.rod; it changes nothing.
// Swimming, boats, cars and the cockpit have their own sounds, so it is silent outside mode 'walk'.

import { tone, burst, CUES } from './Synth.js';
import { clamp, num, smooth } from './util.js';

const rnd = ( a, b ) => a + Math.random() * ( b - a );

// the strength (0..1) of a wading splash from the speed (m/s) and how deep the water is on the legs (0..1)
export function wadeLevel( speed, depth ) {

	if ( ! ( speed > 0.3 ) || ! ( depth > 0.02 ) ) return 0;
	return clamp( 0.18 + 0.82 * smooth( 0.4, 6.5, speed ), 0, 1 ) * ( 0.4 + 0.6 * smooth( 0.02, 0.9, depth ) );

}

export const FOLEY = {
	// cloth: band-passed noise, a brief swell and fall; k = 0..1 (how brisk the movement is)
	cloth_swish: {
		cat: 'sfx', gain: 0.03, ref: 1, max: 5, voices: 3, gap: 0.12, build( ctx, out, t, o ) {

			const k = clamp( num( o.k, 0.4 ), 0.05, 1 ), p = rnd( 0.9, 1.15 );
			const dur = 0.2 - 0.09 * k;
			burst( ctx, out, { t, dur, peak: 0.25 + 0.55 * k, type: 'bandpass', f: ( 650 + 500 * k ) * p, f1: ( 1500 + 900 * k ) * p, q: 0.8, attack: dur * 0.4 } );
			burst( ctx, out, { t, dur: dur * 1.3, peak: 0.18 + 0.25 * k, type: 'lowpass', f: 380, f1: 220, q: 0.6, attack: dur * 0.3, kind: 'brown' } );
			return dur * 1.4 + 0.05;

		},
	},
	// the tackle: a buckle's tick and the ring of a small hook against it; k = how hard the stride
	gear_clink: {
		cat: 'sfx', gain: 0.025, ref: 1, max: 5, voices: 2, gap: 0.1, build( ctx, out, t, o ) {

			const k = clamp( num( o.k, 0.4 ), 0.05, 1 ), p = rnd( 0.9, 1.12 );
			burst( ctx, out, { t, dur: 0.02, peak: 0.45 * ( 0.4 + k ), type: 'highpass', f: 4200, q: 0.8, attack: 0.001 } );
			tone( ctx, out, { type: 'sine', f0: 3400 * p, f1: 3300 * p, t, dur: 0.11, peak: 0.1 + 0.1 * k, attack: 0.001 } );
			tone( ctx, out, { type: 'sine', f0: 5100 * p, f1: 5000 * p, t: t + 0.006, dur: 0.07, peak: 0.05 + 0.05 * k, attack: 0.001 } );
			if ( k > 0.6 ) tone( ctx, out, { type: 'triangle', f0: 2250 * p, f1: 2150 * p, t: t + 0.03, dur: 0.1, peak: 0.07, attack: 0.001 } );
			return 0.18;

		},
	},
	// a breath: kind 'in' (a swell, rising pitch of the air) or 'out' (a falling sigh); effort 0..1
	breath: {
		cat: 'sfx', gain: 0.045, ref: 1, max: 5, voices: 1, gap: 0.2, build( ctx, out, t, o ) {

			const e = clamp( num( o.effort, 0.5 ), 0.05, 1 ), inh = o.kind !== 'out';
			const dur = ( inh ? 0.42 : 0.55 ) - 0.12 * e;
			const f0 = inh ? 750 : 1500, f1 = inh ? 1500 : 800;
			burst( ctx, out, { t, dur, peak: 0.2 + 0.45 * e, type: 'bandpass', f: f0, f1, q: 0.6, attack: dur * ( inh ? 0.6 : 0.25 ) } );
			burst( ctx, out, { t, dur, peak: 0.1 + 0.25 * e, type: 'bandpass', f: f0 * 2.2, f1: f1 * 2.2, q: 0.9, attack: dur * ( inh ? 0.6 : 0.25 ) } );
			burst( ctx, out, { t, dur: dur * 1.1, peak: 0.12 + 0.2 * e, type: 'lowpass', f: 420, q: 0.6, attack: dur * 0.4, kind: 'brown' } );
			return dur + 0.1;

		},
	},
	// feet in the shallows: strength 0..1
	wade_splash: {
		cat: 'sfx', gain: 0.08, ref: 1, max: 5, voices: 3, gap: 0.1, build( ctx, out, t, o ) {

			const s = clamp( num( o.strength, 0.4 ), 0.05, 1 ), p = rnd( 0.9, 1.1 );
			const dur = 0.22 + 0.3 * s;
			burst( ctx, out, { t, dur, peak: 0.22 + 0.5 * s, type: 'lowpass', f: ( 900 + 1600 * s ) * p, f1: 300, q: 0.7, attack: 0.012 } );
			burst( ctx, out, { t, dur: 0.1 + 0.1 * s, peak: 0.05 + 0.3 * s, type: 'highpass', f: 2600, q: 0.7, attack: 0.004 } );
			if ( s > 0.35 ) tone( ctx, out, { type: 'sine', f0: 190 * p, f1: 85, t, dur: 0.14, peak: 0.12 + 0.3 * s, attack: 0.003 } );
			// droplets pattering back
			for ( let i = 0, n = 2 + Math.round( 5 * s ); i < n; i ++ ) {

				const a = t + 0.04 + rnd( 0, 0.12 + 0.3 * s ), f = rnd( 700, 2100 ) * p;
				tone( ctx, out, { type: 'sine', f0: f, f1: f * 1.6, t: a, dur: 0.045, peak: 0.03 + 0.07 * s, attack: 0.002 } );

			}

			return dur + 0.45;

		},
	},
};

// the SynthPlayer plays any name in CUES
for ( const k of Object.keys( FOLEY ) ) if ( ! CUES[ k ] ) CUES[ k ] = FOLEY[ k ];

const STRIDE = { walk: 0.62, sprint: 0.9 }; // m: the Player's own footstep spacing

export class Foley {

	constructor( sfx ) {

		this.sfx = sfx;
		this.dist = 0;
		this.stride = 0; // strides since the last gear clink
		this.breathT = 0; // s until the next breath
		this.breathIn = true;
		this.recover = 0; // breaths still owed after a sprint
		this.sprintT = 0; // s sprinting so far
		this.wasSprint = false;
		this.wasGrounded = true;
		this.fallV = 0;
		this.lastSpeed = 0;
		this.counts = { cloth: 0, gear: 0, breath: 0, wade: 0, land: 0 };

	}

	_play( name, o ) {

		const s = this.sfx;
		return s.synth && s.synth.play( name, o );

	}

	update( dt ) {

		const s = this.sfx, app = s.app, pl = app && app.player;
		if ( ! pl || ! pl.velocity || pl.mode !== 'walk' ) {

			this.dist = 0;
			this.recover = 0;
			this.wasSprint = false;
			this.lastSpeed = 0;
			return;

		}

		const speed = Math.hypot( num( pl.velocity.x ), num( pl.velocity.z ) );
		const grounded = pl.grounded !== false;
		const sprint = !! pl.sprinting;
		const wade = num( pl.wade, 0 );
		const k = smooth( 0.8, 8.5, speed );

		// ---- strides: a swish between footfalls, a clink now and then, a splash in the shallows
		if ( grounded && speed > 0.6 ) {

			this.dist += speed * dt;
			const len = sprint ? STRIDE.sprint : STRIDE.walk;
			if ( this.dist >= len ) {

				this.dist -= len;
				this.stride ++;
				// cloth keeps its own rhythm a little behind the foot
				this.counts.cloth ++;
				this._play( 'cloth_swish', { k: k * ( crouchK( pl ) ), gain: 0.55 + 0.45 * k } );
				const gearP = ( sprint ? 0.8 : 0.4 ) * ( app.game && app.game.rod && app.game.rod.equipped ? 1.5 : 1 );
				if ( this.stride >= 2 && Math.random() < gearP ) {

					this.stride = 0;
					this.counts.gear ++;
					this._play( 'gear_clink', { k, gain: 0.6 + 0.4 * k } );

				}

				const w = wadeLevel( speed, wade );
				if ( w > 0 ) {

					this.counts.wade ++;
					this._play( 'wade_splash', { strength: w, gain: 0.5 + 0.5 * w, rate: 1 } );

				}

			}

		} else this.dist = Math.min( this.dist, 0.3 );

		// ---- a landing: the body settles, the gear jumps
		if ( ! grounded ) this.fallV = Math.max( this.fallV, - num( pl.velocity.y ) );
		else if ( ! this.wasGrounded ) {

			if ( this.fallV > 2.5 ) {

				this.counts.land ++;
				const hard = smooth( 2.5, 9, this.fallV );
				this._play( 'cloth_swish', { k: 0.5 + 0.5 * hard, gain: 0.7 + 0.3 * hard } );
				this._play( 'gear_clink', { k: 0.5 + 0.5 * hard } );
				if ( wade > 0.1 ) this._play( 'wade_splash', { strength: clamp( 0.4 + hard, 0, 1 ) } );

			}

			this.fallV = 0;

		}

		this.wasGrounded = grounded;

		// ---- a stop: the cloth catches up
		if ( this.lastSpeed > 3 && speed < 1 && grounded ) this._play( 'cloth_swish', { k: 0.35, gain: 0.5 } );
		this.lastSpeed = speed;

		// ---- breath
		if ( sprint ) {

			this.sprintT += dt;
			this.wasSprint = true;

		} else if ( this.wasSprint ) {

			this.wasSprint = false;
			// the longer the run, the more breaths to catch
			this.recover = Math.min( 6, Math.round( this.sprintT / 2.5 ) );
			this.sprintT = 0;

		}

		const winded = ! sprint && num( pl.stamina, 1 ) < 0.2 && speed > 0.3;
		const interval = sprint ? 0.5 : winded ? 0.75 : this.recover > 0 ? 0.85 : 0;
		if ( interval > 0 ) {

			this.breathT -= dt;
			if ( this.breathT <= 0 ) {

				this.breathT = interval * rnd( 0.9, 1.15 );
				const effort = sprint ? clamp( 0.45 + 0.5 * ( 1 - num( pl.stamina, 1 ) ) + this.sprintT * 0.02, 0.4, 1 ) : winded ? 0.55 : 0.4 * ( this.recover / 6 ) + 0.2;
				this.counts.breath ++;
				this._play( 'breath', { kind: this.breathIn ? 'in' : 'out', effort, gain: 0.7 + 0.3 * effort } );
				this.breathIn = ! this.breathIn;
				if ( ! sprint && ! winded && this.breathIn ) this.recover = Math.max( 0, this.recover - 1 );

			}

		} else {

			this.breathT = Math.min( this.breathT, 0.2 );
			this.breathIn = true;

		}

	}

	reset() {

		this.dist = 0;
		this.recover = 0;
		this.sprintT = 0;
		this.wasSprint = false;

	}

	dispose() {}

}

// a crouch walk brushes cloth more softly
function crouchK( pl ) {

	return pl.crouching ? 0.45 : 1;

}
