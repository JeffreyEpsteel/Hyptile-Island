// Splits the ElevenLabs batch downloads (one mp3 per character, lines separated by pauses) into one small mono OGG per
// line and writes public/audio/voices/manifest.json (id, file, who, kind, text, duration, voice).
// usage: node tools/voices/split.mjs <dir with <batch.file>.mp3 files>
// Needs ffmpeg on the PATH. Lines are in tools/voices/lines.json (the source of truth for the subtitle text).
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname( fileURLToPath( import.meta.url ) );
const root = join( here, '..', '..' );
const src = process.argv[ 2 ];
if ( ! src ) { console.error( 'usage: node tools/voices/split.mjs <dir>' ); process.exit( 1 ); }
const data = JSON.parse( readFileSync( join( here, 'lines.json' ), 'utf8' ) );
const out = join( root, 'public', 'audio', 'voices' );
mkdirSync( out, { recursive: true } );

function ff( args ) { return spawnSync( 'ffmpeg', [ '-hide_banner', '-y', ...args ], { encoding: 'utf8' } ); }

function duration( file ) {

	const r = ff( [ '-i', file, '-f', 'null', '-' ] );
	const m = /time=(\d+):(\d+):([\d.]+)/g;
	let last = null, x;
	while ( ( x = m.exec( r.stderr ) ) ) last = x;
	return last ? + last[ 1 ] * 3600 + + last[ 2 ] * 60 + + last[ 3 ] : 0;

}

const timings = JSON.parse( readFileSync( join( here, 'timings.json' ), 'utf8' ) );

const manifest = { model: data.model, files: {} };
let bad = 0;
for ( const b of data.batches ) {

	const file = join( src, b.file + '.mp3' );
	if ( ! existsSync( file ) ) { console.log( 'MISSING', b.file ); bad ++; continue; }
	const total = duration( file );
	const seg = timings[ b.file ], used = 'scribe';
	if ( ! seg || seg.length !== b.lines.length ) { console.log( 'FAIL timings', b.file ); bad ++; continue; }
	b.lines.forEach( ( ln, i ) => {

		const [ a, z ] = seg[ i ];
		const t0 = Math.max( 0, a - 0.04 ), t1 = Math.min( total, z + 0.1 );
		const dest = join( out, ln.id + '.ogg' );
		const r = ff( [ '-ss', t0.toFixed( 3 ), '-t', ( t1 - t0 ).toFixed( 3 ), '-i', file, '-af', 'loudnorm=I=-19:TP=-2:LRA=7,afade=t=in:d=0.01,afade=t=out:st=' + Math.max( 0, t1 - t0 - 0.08 ).toFixed( 3 ) + ':d=0.08', '-ac', '1', '-ar', '32000', '-c:a', 'libvorbis', '-b:a', '64k', dest ] );
		if ( r.status !== 0 ) { console.log( 'FAIL encode', ln.id ); bad ++; return; }
		manifest.files[ ln.id ] = { file: ln.id + '.ogg', who: ln.who || b.who, name: b.name, kind: ln.kind, text: ln.text, secs: + ( t1 - t0 ).toFixed( 2 ), bytes: statSync( dest ).size, voice: b.voice };

	} );
	console.log( 'ok', b.file, used, b.lines.length, 'lines' );

}

writeFileSync( join( out, 'manifest.json' ), JSON.stringify( manifest, null, '\t' ) + '\n' );
console.log( bad ? `${ bad } problems` : 'all split' );
process.exit( bad ? 1 : 0 );
