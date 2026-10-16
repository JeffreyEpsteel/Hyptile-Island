// The mix (wave 25D, gap 4.3): every synthesised cue, bed and sampled file of the sfx feature belongs to a group with a
// loudness target, so the beds sit under the one-shots, the one-shots under the alerts, and the body's foley under all
// of it. The loudness is measured, not guessed: tools/fx25d/mix.mjs renders each sound offline in a headless browser
// (OfflineAudioContext), K-weights it (ITU-R BS.1770), takes the maximum momentary loudness (400 ms) of its reference
// situation as the SoundScape does for its recordings (src/audio/SoundScape.js MIX) and writes MixTrims.js. applyMix()
// scales each sound's gain by its trim at start-up, so the numbers below are what comes out of the speaker at unity
// master (stereo-equivalent: a mono sound plays on both channels, +3 dB against its mono measurement).
//
//   foley   the body's small sounds (Foley.js): cloth, tackle, breath, wading
//   bed     sustained loops: crowds, surf on the cliffs, falls, the airstrip, fire and bilge, rigging and hull moans
//   life    ambient one-shots: gulls, parrots, dogs, hammers, bells in the distance, drums, dice, snoring
//   action  what a hand or a hull does: swings, blows, doors, floorboards, splashes, pumps and buckets
//   alert   what the player must not miss: guns, blasts, the fort bell, cracks of masts, floods, the heartbeat
//
// SoundScape rows (the surf, wind, the engine, footsteps, the rod) are listed for the record at the loudness MIX gives
// them; they are root's and are not trimmed here.

export const MIX_GROUPS = {
	foley: { target: - 56, label: 'the body (cloth, tackle, breath, wading)' },
	bed: { target: - 40, label: 'sustained loops under everything' },
	life: { target: - 32, label: 'ambient one-shots' },
	action: { target: - 24, label: 'actions of hands and hulls' },
	alert: { target: - 17, label: 'what must be heard' },
};

import { TRIMS } from './MixTrims.js';

// name -> { group, kind: 'cue' | 'bed' | 'file', target? (overrides the group), ref? (options measured with) }
const c = ( group, extra = {} ) => ( { group, kind: 'cue', ...extra } );
const b = ( group = 'bed', extra = {} ) => ( { group, kind: 'bed', ...extra } );
const f = ( group, extra = {} ) => ( { group, kind: 'file', ...extra } );

export const CUE_LEVELS = {
	// foley (the cue is played at roughly this gain by Foley.js: see its _play calls)
	cloth_swish: c( 'foley', { target: - 60, ref: { k: 0.7, gain: 0.8 } } ),
	gear_clink: c( 'foley', { target: - 62, ref: { k: 0.7, gain: 0.8 } } ),
	breath: c( 'foley', { target: - 50, ref: { kind: 'in', effort: 0.8, gain: 0.85 } } ),
	wade_splash: c( 'foley', { target: - 46, ref: { strength: 0.7, gain: 0.75 } } ),
	// beds: the place beds (Places.js BEDS), the event loops (EventSounds.js LOOPS), the ship's moans
	market: b( 'bed', { target: - 40 } ), tavern: b( 'bed', { target: - 38 } ), cliffs: b( 'bed', { target: - 36 } ), falls: b( 'bed', { target: - 38 } ),
	strip: b( 'bed', { target: - 46 } ), engine: b( 'bed', { target: - 38 } ),
	spout: b( 'bed', { target: - 34 } ), shipfire: b( 'bed', { target: - 36 } ), bilge: b( 'bed', { target: - 42 } ), hearth: b( 'bed', { target: - 46 } ),
	market_home: b( 'bed', { target: - 40 } ), market_bw: b( 'bed', { target: - 38 } ),
	rigging_strain: f( 'bed' ), hull_groan: f( 'bed' ), sail_luff: f( 'bed', { target: - 38 } ),
	chute_creak: c( 'bed', { target: - 42 } ), gust: c( 'bed', { target: - 36 } ),
	// life
	gull: c( 'life' ), parrot: c( 'life' ), frigate: c( 'life', { target: - 34 } ), dog_bark: c( 'life', { target: - 30 } ), hammer: c( 'life', { target: - 32 } ),
	chapel_bell: c( 'life', { target: - 28 } ), drum: c( 'life', { target: - 28 } ), tavern_shout: c( 'life', { target: - 34 } ),
	dice_rattle: c( 'life', { target: - 40 } ), snore: c( 'life', { target: - 38 } ),
	bran_workshop: f( 'life', { target: - 34 } ), iona_workshop: f( 'life', { target: - 34 } ), clown_prank: f( 'life', { target: - 26 } ),
	// action
	blade_swing: c( 'action', { target: - 28 } ), axe_swing: c( 'action', { target: - 28 } ), pin_swing: c( 'action', { target: - 30 } ), harpoon_jab: c( 'action', { target: - 30 } ),
	blade_hit: c( 'action', { target: - 22 } ), axe_hit: c( 'action', { target: - 21 } ), pin_hit: c( 'action', { target: - 23 } ), harpoon_strike: c( 'action', { target: - 22 } ),
	bullet_hit: c( 'action', { target: - 24 } ), fire_crackle: c( 'action', { target: - 42 } ), bucket_slosh: c( 'action', { target: - 28 } ), pump_stroke: c( 'action', { target: - 28 } ),
	door: c( 'action', { target: - 28 } ), board_creak: c( 'action', { target: - 44 } ), sword_clack: c( 'action', { target: - 24 } ),
	black_flag: c( 'action', { target: - 24 } ), claim: c( 'action', { target: - 22 } ), canopy_snap: c( 'action', { target: - 22 } ),
	thwack: f( 'action', { target: - 26 } ), thud: f( 'action', { target: - 28 } ), line_creak: f( 'action', { target: - 38 } ), splinter: f( 'action', { target: - 22 } ), cannon_reload: f( 'action', { target: - 24 } ),
	// alert
	battery_fire: c( 'alert', { target: - 14 } ), powder_blast: c( 'alert', { target: - 12 } ), fort_bell: c( 'alert', { target: - 20 } ), watch_call: c( 'alert', { target: - 22 } ),
	swivel_bark: c( 'alert', { target: - 15 } ), fire_whoomph: c( 'alert', { target: - 20 } ), flood_rush: c( 'alert', { target: - 22 } ), mast_crack: c( 'alert', { target: - 15 } ),
	bosun_call: c( 'alert', { target: - 24 } ), heave_to: c( 'alert', { target: - 24 } ), quarters_drum: c( 'alert', { target: - 20 } ), distant_gun: c( 'alert', { target: - 20 } ),
	heartbeat: c( 'alert', { target: - 26 } ),
};

// the SoundScape's own rows (root's, from src/audio/SoundScape.js MIX), for the record: beds vs one-shots there
export const SOUNDSCAPE_ROWS = {
	surfFar: { group: 'bed', target: - 31 }, wind: { group: 'bed', target: - 36 }, palms: { group: 'bed', target: - 39 }, crickets: { group: 'bed', target: - 33 },
	pierLap: { group: 'bed', target: - 32 }, step: { group: 'foley', target: - 56 }, splashSoft: { group: 'foley', target: - 38 }, swim: { group: 'foley', target: - 43 },
	plop: { group: 'action', target: - 30 }, fishSplash: { group: 'action', target: - 24 }, lineSnap: { group: 'alert', target: - 24 }, coins: { group: 'action', target: - 30 },
};

// a name's loudness target (LUFS)
export function targetOf( name ) {

	const e = CUE_LEVELS[ name ];
	if ( ! e ) return null;
	return Number.isFinite( e.target ) ? e.target : MIX_GROUPS[ e.group ].target;

}

const lin = ( db ) => Math.pow( 10, db / 20 );

// scales each sound's gain by its measured trim (dB); `trims` defaults to MixTrims.js. Safe to call twice with the same
// objects (a second call is ignored); a name without a trim is left alone.
export function applyMix( { CUES = {}, FILES = {}, LOOPS = {}, BEDS = {} } = {}, trims = null ) {

	const t = trims || TRIMS;
	for ( const [ name, db ] of Object.entries( t ) ) {

		if ( ! Number.isFinite( db ) || ! db ) continue;
		const e = CUE_LEVELS[ name ];
		if ( ! e ) continue;
		const k = lin( db );
		let def = null, key = 'gain';
		if ( e.kind === 'cue' ) def = CUES[ name ];
		else if ( e.kind === 'file' ) def = FILES[ name ];
		else { def = LOOPS[ name ] || BEDS[ name ]; key = 'peak'; }
		if ( ! def || def._mixed ) continue;
		def[ key ] *= k;
		def._mixed = db;

	}

}

