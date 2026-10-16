// Root patches for the voices feature (wave 26B). Idempotent; every anchor is checked and the script refuses (exit 1) if one is
// missing. Run from the repo root:   node tools/voices/apply-patches.mjs [--check] [--root <dir>]
//   --check   report what would change, write nothing
//   --root    apply to another tree (the copy the patches were verified on)
// It edits: src/features/install.js (import + MODULES entry after 'cars'), package.json (test script), CREDITS.md (the voices
// and effects licence lines). The sfx feature needs NO file patch: src/features/voices/Samples.js wraps sfx.synth.play and
// weather.audio.thunder at run time (and falls back to the synthesised cue whenever a sample is missing).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice( 2 );
const check = args.includes( '--check' );
const ri = args.indexOf( '--root' );
const root = resolve( ri >= 0 ? args[ ri + 1 ] : join( dirname( fileURLToPath( import.meta.url ) ), '..', '..' ) );

let bad = 0;
function patch( file, steps ) {

	const p = join( root, file );
	if ( ! existsSync( p ) ) { console.log( 'MISSING FILE', file ); bad ++; return; }
	let s = readFileSync( p, 'utf8' );
	const before = s;
	for ( const st of steps ) {

		if ( st.done( s ) ) { console.log( 'already', file, '-', st.name ); continue; }
		const next = st.apply( s );
		if ( next === null || next === s ) { console.log( 'ANCHOR NOT FOUND', file, '-', st.name ); bad ++; continue; }
		s = next;
		console.log( check ? 'would patch' : 'patched', file, '-', st.name );

	}

	if ( s !== before && ! check ) writeFileSync( p, s );

}

patch( 'src/features/install.js', [
	{
		name: 'import voices',
		done: ( s ) => s.includes( "from './voices/index.js'" ),
		apply: ( s ) => ( s.includes( "import * as capsize from './capsize/index.js';" ) ? s.replace( "import * as capsize from './capsize/index.js';", "import * as capsize from './capsize/index.js';\nimport * as voices from './voices/index.js';" ) : null ),
	},
	{
		name: "MODULES entry after 'cars'",
		done: ( s ) => /\[\s*'voices',\s*voices\s*\]/.test( s ),
		apply: ( s ) => {

			const m = /\t\[ 'cars', cars \],[^\n]*\n/.exec( s );
			if ( ! m ) return null;
			const at = m.index + m[ 0 ].length;
			return s.slice( 0, at ) + "\t[ 'voices', voices ], // wave 26B: ElevenLabs voices for the characters and sampled effects over the weakest synth cues (after sfx, navy, cars, crew)\n" + s.slice( at );

		},
	},
] );

patch( 'package.json', [
	{
		name: 'test script',
		done: ( s ) => s.includes( 'node test/feature-voices.mjs' ),
		// inserted after the sfx test (not at the end of the list, where other workers' patches anchor)
		apply: ( s ) => ( s.includes( ' && node test/feature-sfx.mjs' ) ? s.replace( ' && node test/feature-sfx.mjs', ' && node test/feature-sfx.mjs && node test/feature-voices.mjs' ) : null ),
	},
] );

patch( 'CREDITS.md', [
	{
		name: 'voices credit lines',
		done: ( s ) => s.includes( 'public/audio/voices' ),
		apply: ( s ) => s.replace( /\s*$/, '\n' ) + `
### October 16, 2026 additions (wave 26B)

Character voices (\`public/audio/voices\`: PoorGoat, Ethena, Captain Roid and his harbour agents, the tavern keepers, Lieutenant Hale,
the navy, the press gang, townsfolk, the crew, Meridian's police and the radio) were generated with ElevenLabs text to speech
(model \`eleven_v4\`, stock voices Callum, Beth, Charlie, Roger, Stres1, Aaron, Harry, Bobby, Sarah, Laura, George, Kurt, Will, Arron and Bella
from the account's voice list) and the effect samples (\`public/audio/sfx11\`: engines, cannon, musket, pistol, sail, rope, rain on canvas,
thunder, gulls, crowd, splashes) with ElevenLabs sound effects (\`eleven_text_to_sound_v2\`), both under the project owner's account.
The lines are original writing for this game; sources and timings: \`tools/voices\`.
`,
	},
] );

console.log( bad ? `${ bad } problem(s)` : check ? 'check passed' : 'patches applied' );
process.exit( bad ? 1 : 0 );
