// Root patches for the music feature (wave 26C). Idempotent; every anchor is checked and the script refuses (exit 1) if one is
// missing. Run from the repo root:   node tools/music/apply-patches.mjs [--check] [--root <dir>]
//   --check   report what would change, write nothing
//   --root    apply to another tree (the copy the patches were verified on)
// It edits: src/features/install.js (import + MODULES entry after 'voices': the director reads voices, navy, cars, interiors,
// night, harbour and naval, all installed before it), package.json (test script), CREDITS.md (the music credit line) and the
// Music slider's tooltip in src/i18n/en.js and src/ui/AppUI.js ("Reserved: the island has no music yet." is no longer true).
// The SoundScape needs NO patch: it already has the `music` category (audio.music -> master, setVolume( 'music' ), the slider).
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

const TIP_OLD = 'Reserved: the island has no music yet.';
const TIP_NEW = 'Background music: the menu, the islands, taverns, the open sea and fights. Sits under the effects and the voices.';

patch( 'src/features/install.js', [
	{
		name: 'import music',
		done: ( s ) => s.includes( "from './music/index.js'" ),
		apply: ( s ) => ( s.includes( "import * as voices from './voices/index.js';" ) ? s.replace( "import * as voices from './voices/index.js';", "import * as voices from './voices/index.js';\nimport * as music from './music/index.js';" ) : null ),
	},
	{
		name: "MODULES entry after 'voices'",
		done: ( s ) => /\[\s*'music',\s*music\s*\]/.test( s ),
		apply: ( s ) => {

			const m = /\t\[ 'voices', voices \],[^\n]*\n/.exec( s );
			if ( ! m ) return null;
			const at = m.index + m[ 0 ].length;
			return s.slice( 0, at ) + "\t[ 'music', music ], // wave 26C: the music director (six ElevenLabs Music tracks by context; after voices, navy, cars, interiors, night, harbour; ?noMusic)\n" + s.slice( at );

		},
	},
] );

patch( 'package.json', [
	{
		name: 'test script',
		done: ( s ) => s.includes( 'node test/feature-music.mjs' ),
		apply: ( s ) => {

			const m = /("test": "[^\n]*?)(",?\r?\n)/.exec( s );
			return m ? s.slice( 0, m.index ) + m[ 1 ] + ' && node test/feature-music.mjs' + m[ 2 ] + s.slice( m.index + m[ 0 ].length ) : null;

		},
	},
] );

patch( 'CREDITS.md', [
	{
		name: 'music credit line',
		done: ( s ) => s.includes( 'Music: generated with ElevenLabs Music v2.5 for the project owner' ),
		apply: ( s ) => {

			const a = 'The lines are original writing for this game; sources and timings: `tools/voices`.';
			const i = s.indexOf( a );
			if ( i < 0 ) return null;
			const at = i + a.length;
			return s.slice( 0, at ) + '\n\nMusic: generated with ElevenLabs Music v2.5 for the project owner (`public/audio/music`: six original tracks, model `eleven_music_v2_5`, encoded by `tools/music/encode.mjs`).' + s.slice( at );

		},
	},
] );

patch( 'src/i18n/en.js', [
	{
		name: 'music slider tooltip',
		done: ( s ) => ! s.includes( TIP_OLD ),
		apply: ( s ) => ( s.includes( TIP_OLD ) ? s.replace( TIP_OLD, TIP_NEW ) : null ),
	},
] );

patch( 'src/ui/AppUI.js', [
	{
		name: 'music slider tooltip default',
		done: ( s ) => ! s.includes( TIP_OLD ),
		apply: ( s ) => ( s.includes( TIP_OLD ) ? s.replace( TIP_OLD, TIP_NEW ) : null ),
	},
] );

if ( bad ) { console.log( bad + ' problem(s)' ); process.exit( 1 ); }

