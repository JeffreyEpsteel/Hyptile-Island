// Encodes the ElevenLabs Music masters (public/audio/music/*.mp3) to web-ready OGG Vorbis: stereo, ~128 kbps, loudness
// normalised to -16 LUFS (EBU R128 loudnorm, two passes), 0.15 s fade-in and 0.8 s fade-out so a looped file has no click.
//   node tools/music/encode.mjs [--keep]      --keep leaves the .mp3 masters in place (default: deleted once the .ogg exists)
// Needs ffmpeg on PATH (or FFMPEG=<path>).
import { spawnSync } from 'node:child_process';
import { readdirSync, unlinkSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TRACKS = [ 'menu-theme', 'island-day', 'tavern', 'sailing', 'combat', 'meridian-night' ];
const dir = join( dirname( fileURLToPath( import.meta.url ) ), '..', '..', 'public', 'audio', 'music' );
const ff = process.env.FFMPEG || 'ffmpeg';
const keep = process.argv.includes( '--keep' );
const run = ( a ) => spawnSync( ff, a, { encoding: 'utf8', maxBuffer: 1 << 26 } );

for ( const name of TRACKS ) {

	const src = join( dir, name + '.mp3' ), out = join( dir, name + '.ogg' );
	if ( ! existsSync( src ) ) { console.log( 'skip (no mp3)', name ); continue; }
	const target = 'I=-16:TP=-1.5:LRA=11';
	const p1 = run( [ '-hide_banner', '-i', src, '-af', 'loudnorm=' + target + ':print_format=json', '-f', 'null', '-' ] );
	const m = /\{[^{}]*"input_i"[^{}]*\}/.exec( p1.stderr || '' );
	if ( ! m ) { console.log( 'FAIL measure', name, ( p1.stderr || '' ).slice( - 300 ) ); process.exitCode = 1; continue; }
	const j = JSON.parse( m[ 0 ] );
	const dur = Number( run( [ '-hide_banner', '-i', src ] ).stderr.match( /Duration: (\d+):(\d+):([\d.]+)/ ).slice( 1 ).reduce( ( a, v ) => a * 60 + Number( v ), 0 ) );
	const af = `loudnorm=${ target }:measured_I=${ j.input_i }:measured_TP=${ j.input_tp }:measured_LRA=${ j.input_lra }:measured_thresh=${ j.input_thresh }:offset=${ j.target_offset }:linear=true,afade=t=in:d=0.15,afade=t=out:st=${ ( dur - 0.8 ).toFixed( 2 ) }:d=0.8`;
	const p2 = run( [ '-hide_banner', '-y', '-i', src, '-af', af, '-ac', '2', '-ar', '44100', '-c:a', 'libvorbis', '-b:a', '128k', out ] );
	if ( p2.status !== 0 ) { console.log( 'FAIL encode', name, ( p2.stderr || '' ).slice( - 300 ) ); process.exitCode = 1; continue; }
	console.log( name, 'in', j.input_i, 'LUFS ->', ( statSync( out ).size / 1e6 ).toFixed( 2 ), 'MB' );
	if ( ! keep ) unlinkSync( src );

}
