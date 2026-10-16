// Builds public/audio/sfx11 from the ElevenLabs sound-effect downloads (eleven_text_to_sound_v2, one mp3 per effect).
// usage: node tools/voices/sfx11.mjs <dir with <name>.mp3 files>
// One-shots are trimmed of leading silence and peak-normalised; loops get a tail-into-head crossfade so they wrap clean.
// Output: mono 80 kbps OGG per effect + manifest.json (the sfx bank in src/features/voices/Samples.js reads it).
import { writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname( fileURLToPath( import.meta.url ) );
const out = join( here, '..', '..', 'public', 'audio', 'sfx11' );
const src = process.argv[ 2 ];
if ( ! src ) { console.error( 'usage: node tools/voices/sfx11.mjs <dir>' ); process.exit( 1 ); }
mkdirSync( out, { recursive: true } );

// id: { loop, cat, gain (0..1), ref/max metres, replaces: synth cue names it stands in for, event: game event that plays it, about }
export const SFX = {
	plane_engine: { loop: true, cat: 'sfx', gain: 0.7, ref: 12, max: 260, about: 'seaplane radial engine cruise' },
	car_engine: { loop: true, cat: 'sfx', gain: 0.6, ref: 8, max: 120, about: 'old petrol car engine' },
	cannon: { cat: 'sfx', gain: 0.95, ref: 12, max: 600, replaces: [ 'battery_fire', 'distant_gun' ], about: 'iron cannon shot' },
	musket: { cat: 'sfx', gain: 0.8, ref: 6, max: 240, replaces: [ 'swivel_bark' ], about: 'flintlock musket crack' },
	pistol: { cat: 'sfx', gain: 0.75, ref: 5, max: 200, about: 'flintlock pistol bang' },
	sail_luff: { cat: 'ambience', gain: 0.6, ref: 6, max: 80, loop: true, about: 'canvas sail luffing' },
	rope_creak: { cat: 'sfx', gain: 0.6, ref: 4, max: 60, replaces: [ 'chute_creak' ], about: 'rope under tension' },
	rain_canvas: { loop: true, cat: 'ambience', gain: 0.5, ref: 3, max: 40, about: 'rain on a canvas tarp' },
	thunder: { cat: 'sfx', gain: 1, ref: 100, max: 4000, event: 'lightningStrike', about: 'thunderclap and roll' },
	gulls: { cat: 'ambience', gain: 0.7, ref: 10, max: 160, replaces: [ 'gull' ], about: 'seagulls over a harbour' },
	crowd: { loop: true, cat: 'ambience', gain: 0.55, ref: 8, max: 90, about: 'harbour market crowd murmur' },
	splash_big: { cat: 'sfx', gain: 0.9, ref: 8, max: 160, about: 'heavy splash into the sea' },
	splash_small: { cat: 'sfx', gain: 0.6, ref: 3, max: 50, replaces: [ 'wade_splash' ], about: 'small splash in shallows' },
};

function ff( args ) { return spawnSync( 'ffmpeg', [ '-hide_banner', '-y', ...args ], { encoding: 'utf8' } ); }
function secs( file ) {

	const r = ff( [ '-i', file, '-f', 'null', '-' ] );
	const m = /time=(\d+):(\d+):([\d.]+)/g;
	let last = null, x;
	while ( ( x = m.exec( r.stderr ) ) ) last = x;
	return last ? + last[ 1 ] * 3600 + + last[ 2 ] * 60 + + last[ 3 ] : 0;

}

const manifest = { model: 'eleven_text_to_sound_v2', files: {} };
let bad = 0;
for ( const [ id, o ] of Object.entries( SFX ) ) {

	const f = join( src, id + '.mp3' );
	if ( ! existsSync( f ) ) { console.log( 'MISSING', id ); bad ++; continue; }
	const d = secs( f );
	const dest = join( out, 's11_' + id + '.ogg' );
	let filter;
	if ( o.loop ) {

		const x = Math.min( 0.2, d * 0.2 );
		filter = `[0]atrim=0:${ x },asetpts=PTS-STARTPTS[h];[0]atrim=${ x },asetpts=PTS-STARTPTS[r];[r][h]acrossfade=d=${ x }:c1=tri:c2=tri,loudnorm=I=-20:TP=-2:LRA=9`;

	} else filter = 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-55dB,areverse,loudnorm=I=-18:TP=-1.5:LRA=9';

	const r = ff( [ '-i', f, '-filter_complex', o.loop ? filter : `[0]${ filter }`, '-ac', '1', '-ar', '32000', '-c:a', 'libvorbis', '-b:a', '80k', dest ] );
	if ( r.status !== 0 ) { console.log( 'FAIL', id, r.stderr.split( '\n' ).slice( - 4 ).join( ' ' ) ); bad ++; continue; }
	manifest.files[ id ] = { file: 's11_' + id + '.ogg', secs: + secs( dest ).toFixed( 2 ), bytes: statSync( dest ).size, ...o };

}

writeFileSync( join( out, 'manifest.json' ), JSON.stringify( manifest, null, '\t' ) + '\n' );
console.log( bad ? `${ bad } problems` : 'all built', Object.keys( manifest.files ).length );
process.exit( bad ? 1 : 0 );
