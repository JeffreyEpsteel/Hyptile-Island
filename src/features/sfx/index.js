import { SfxPlayer, FILES } from './SfxPlayer.js';
import { FishingSfx } from './FishingSfx.js';
import { ShipSfx, isSailBoat, SAIL_BOATS } from './ShipSfx.js';
import { FolkSfx, isWorking } from './FolkSfx.js';
import { SynthPlayer, CUES } from './Synth.js';
import { PlaceBeds, bedWeights, sources, marketCrowd, bellStrikes } from './Places.js';
import { Cues, cueFor, wheelLevels } from './Cues.js';

// Dynamic audio, driven by the game state every frame (NAVAL_BRIEF B2 / WORLD_TRADE_PIRATES_BRIEF A6). A feature
// module that only listens: it changes no game state and draws nothing.
//
//   features.add( 'sfx', sfxModule );            // module: { install }
//   const sfx = features.get( 'sfx' );
//   sfx.play( 'splinter', { at: { x, y, z } } )  // any file of SfxPlayer FILES, through the SoundScape sfx / ambience paths
//
// What it plays (files in public/audio/sfx, built by tools/make-assets.mjs, lazily fetched and decoded):
//   FishingSfx  line creak rising with app.game.fight.tension, thwack when a fish is hooked, thud on a miss
//   ShipSfx     rigging strain, hull groans (roll, pitch and slams), sail luffing, cannon reload clank, wood splinters
//   FolkSfx     the clown's prank line when the player is launched, workshop lines from working residents
//   PlaceBeds   (wave 13C, synthesised, no files) Tidemark's market murmur on the residents' schedule, the chapel bell on
//               the hour, gulls over the quay, the windsock and a plane running up on the apron, boatyard hammering by day;
//               Blackwater's drums and rowdy Rum Hole at night, parrots and frigatebirds, surf on the cliffs; the Inverted
//               Isles' upward waterfalls. Beds fade by distance like the surf bed (Places.js).
//   Cues        (wave 13C, synthesised) shore batteries firing, a powder store exploding, the fort bell and the watch's call,
//               the black flag and the claim, the practice fight's wooden swords, the parachute's canopy snap and lines, the
//               Kestrel's wheels rolling and braking; each with its own rate limit (Cues.js)
// The reel ratchet, drag, snap, hull slap and engine are the SoundScape's; weather sound is the weather feature's.
//
// Volume: everything goes into the SoundScape's sfx or ambience category nodes (see SfxPlayer.js), so the master
// volume, the mute switch and both sliders apply; muted audio plays nothing. Without app.audio (?noAudio, tests)
// every call is a no-op.
//
// Events listened to (features): playerBoatDamaged { hp, maxHp, cause } (splinters), strikeMissed (thud),
// cannonReloaded { x?, y?, z? } (reload clank; the naval feature is also polled via reloadLeft), and for Cues.js
// cannonFired, explosion, strongholdAlarm, blackFlagBought, strongholdClaimed, meleeHit, practiceStarted / practiceEnded,
// planeBailedOut.
// Hooks it takes by itself: it chains app.boatCtl.onSlam (never replaces it).

export { SfxPlayer, FILES, FishingSfx, ShipSfx, FolkSfx, isSailBoat, isWorking, SAIL_BOATS, SynthPlayer, CUES, PlaceBeds, Cues, bedWeights, sources, marketCrowd, bellStrikes, cueFor, wheelLevels };

export class Sfx {

	constructor( app, features, { player = null } = {} ) {

		this.app = app;
		this.features = features || null;
		this.player = player || new SfxPlayer( app );
		this.synth = new SynthPlayer( this.player );
		this.time = 0;
		this.fishing = new FishingSfx( this );
		this.ship = new ShipSfx( this );
		this.folk = new FolkSfx( this );
		this.places = new PlaceBeds( this );
		this.cues = new Cues( this );
		this.failed = new Set();
		this.off = [];
		if ( features && features.on ) this.off.push( features.on( 'strikeMissed', () => this.fishing.miss() ) );

	}

	// plays a sound of the bank (see SfxPlayer.play); null when it did not start
	play( name, opts ) {

		return this.player.play( name, opts );

	}

	update( dt ) {

		dt = Math.min( Math.max( Number.isFinite( dt ) ? dt : 0, 0 ), 0.25 );
		this.time += dt;
		for ( const k of [ 'fishing', 'ship', 'folk', 'places', 'cues' ] ) {

			try {

				this[ k ].update( dt );

			} catch ( e ) {

				// one broken part must not silence the others: report once
				if ( ! this.failed.has( k ) ) console.warn( `sfx ${ k } update failed`, e );
				this.failed.add( k );

			}

		}

	}

	reset() {

		this.player.stopAll();
		this.synth.stopAll();
		this.places.reset();
		this.cues.reset();
		this.ship.stress = 0;
		this.ship.lastHp = null;

	}

	dispose() {

		for ( const f of this.off ) try { f(); } catch ( e ) { /* ignore */ }
		this.off.length = 0;
		this.fishing.dispose();
		this.ship.dispose();
		this.folk.dispose();
		this.places.dispose();
		this.cues.dispose();
		this.synth.stopAll();
		this.player.dispose();

	}

}

export function install( app, features, options = {} ) {

	return new Sfx( app, features, options );

}
