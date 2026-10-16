// ElevenLabs sound effects (wave 26B) that stand in for the weakest synthesised ones: public/audio/sfx11/manifest.json lists
// each sample (file, level, range, `replaces` = synth cue names it takes over). The bank lazily fetches and decodes a sample
// the first time its cue is wanted (the synth plays that very first time, the sample every time after), plays it through
// the sfx feature's SfxPlayer (distance gain, HRTF panner, category sinks, master / mute) and falls back to the synth
// whenever the sample is not decoded yet, the audio is off or anything throws.
//
//   const bank = new SampleBank( app, manifest, { url, fetchImpl } )
//   bank.ready( 'cannon' ) / bank.preload( [ 'cannon' ] ) / bank.play( 'cannon', { at, gain, rate } ) -> voice | null
//   preferSamples( sfx, bank ) wraps sfx.synth.play: a cue named in a sample's `replaces` plays the sample when it is ready
//   preferThunder( weather, bank ) wraps weather.audio.thunder( delay, power ) the same way
//
// Loops in the manifest (engines, rain on canvas, sail luff, crowd) are listed with `loop: true` for the engine owners;
// the bank only plays one-shots (the seaplane, car and weather audio own their continuous layers).

import { SfxPlayer, FILES } from '../sfx/SfxPlayer.js';

const NAME = ( id ) => 's11_' + id;

export function sampleUrl() {

	try {

		return ( ( import.meta.env && import.meta.env.BASE_URL ) || '/' ) + 'audio/sfx11/';

	} catch ( e ) {

		return 'audio/sfx11/';

	}

}

export class SampleBank {

	constructor( app, manifest, { url = sampleUrl(), fetchImpl = null, player = null } = {} ) {

		this.app = app;
		this.manifest = manifest || { files: {} };
		this.player = player || new SfxPlayer( app, { url, fetchImpl } );
		this.map = new Map(); // synth cue name -> sample id
		this.played = 0;
		for ( const [ id, o ] of Object.entries( this.manifest.files || {} ) ) {

			const name = NAME( id );
			FILES[ name ] = { cat: o.cat || 'sfx', gain: o.gain ?? 0.8, ref: o.ref ?? 6, max: o.max ?? 120, voices: o.loop ? 1 : 3, fade: 0 };
			for ( const cue of o.replaces || [] ) this.map.set( cue, id );

		}

	}

	has( id ) {

		return !! ( this.manifest.files && this.manifest.files[ id ] );

	}

	ready( id ) {

		return this.has( id ) && this.player.has( NAME( id ) );

	}

	preload( ids ) {

		return this.player.preload( ( Array.isArray( ids ) ? ids : [ ids ] ).filter( ( i ) => this.has( i ) ).map( NAME ) );

	}

	play( id, opts = {} ) {

		if ( ! this.has( id ) ) return null;
		const v = this.player.play( NAME( id ), opts );
		if ( v ) this.played ++;
		return v;

	}

	dispose() {

		this.player.dispose();

	}

}

// wraps the synth's play: replaced cues play their sample once it is decoded (a delayed cue, a far gun, waits its delay)
export function preferSamples( sfx, bank ) {

	const synth = sfx && sfx.synth;
	if ( ! synth || synth.__samples ) return false;
	const orig = synth.play.bind( synth );
	synth.__samples = bank;
	synth.play = ( name, opts = {} ) => {

		const id = bank.map.get( name );
		if ( id ) {

			try {

				if ( bank.ready( id ) ) {

					const d = Number.isFinite( opts.delay ) ? opts.delay : 0;
					const o = { at: opts.at, gain: opts.gain, rate: opts.rate };
					if ( d > 0.02 && typeof setTimeout === 'function' ) { setTimeout( () => { try { bank.play( id, o ); } catch ( e ) { /* ignore */ } }, d * 1000 ); return { name, sample: id, delayed: true }; }
					const v = bank.play( id, o );
					if ( v ) return v;

				} else bank.preload( [ id ] );

			} catch ( e ) { /* fall back to the synth */ }

		}

		return orig( name, opts );

	};

	return true;

}

export function preferThunder( weather, bank ) {

	const wa = weather && weather.audio;
	if ( ! wa || typeof wa.thunder !== 'function' || wa.__samples || ! bank.has( 'thunder' ) ) return false;
	const orig = wa.thunder.bind( wa );
	wa.__samples = bank;
	wa.thunder = ( delay = 2, power = 0.7 ) => {

		try {

			if ( bank.ready( 'thunder' ) ) {

				const v = () => { try { bank.play( 'thunder', { gain: 0.35 + 0.65 * Math.max( 0, Math.min( 1, power ) ), rate: 0.85 + 0.3 * Math.random() } ); } catch ( e ) { /* ignore */ } };
				if ( typeof setTimeout === 'function' ) { setTimeout( v, Math.max( 0, delay ) * 1000 ); return; }

			} else bank.preload( [ 'thunder' ] );

		} catch ( e ) { /* fall back */ }

		return orig( delay, power );

	};

	return true;

}
