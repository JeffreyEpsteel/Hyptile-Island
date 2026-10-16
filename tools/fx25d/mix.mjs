// Measures the loudness of every sound in src/features/sfx/Mix.js CUE_LEVELS in a headless browser and writes
// src/features/sfx/MixTrims.js (the gain trim that brings each to its target) and tools/fx25d/out/mix-measured.json.
//   node tools/fx25d/mix.mjs            measure and rewrite the trims (idempotent: the page measures the sounds with the
//                                       current trims applied; the old trims are undone before the new ones are computed)
//   node tools/fx25d/mix.mjs --report   measure and print only
//   node tools/fx25d/mix.mjs --only=gull,breath
// Needs Chrome or Edge (OfflineAudioContext). Serves only localhost; no network.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '../..' );
const REPORT = process.argv.includes( '--report' );
const ONLY = ( process.argv.find( ( a ) => a.startsWith( '--only=' ) ) || '' ).replace( '--only=', '' );
const BROWSERS = [ 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' ];
const exe = BROWSERS.find( ( p ) => fs.existsSync( p ) );
if ( ! exe ) { console.error( 'no Chrome or Edge found' ); process.exit( 2 ); }

const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.ogg': 'audio/ogg' };
let resolveResult;
const got = new Promise( ( r ) => { resolveResult = r; } );
const server = http.createServer( ( req, res ) => {

	if ( req.method === 'POST' && req.url === '/__result' ) {

		let body = '';
		req.on( 'data', ( c ) => { body += c; } );
		req.on( 'end', () => { res.end( 'ok' ); resolveResult( JSON.parse( body ) ); } );
		return;

	}

	const u = decodeURIComponent( req.url.split( '?' )[ 0 ] );
	const ok = u.startsWith( '/tools/fx25d/' ) || u.startsWith( '/src/' ) || u.startsWith( '/public/audio/' );
	const file = path.join( ROOT, ok ? u : '__none__' );
	if ( ! file.startsWith( ROOT ) || ! fs.existsSync( file ) || fs.statSync( file ).isDirectory() ) { res.statusCode = 404; res.end( 'no' ); return; }
	res.setHeader( 'Content-Type', MIME[ path.extname( file ) ] || 'application/octet-stream' );
	res.end( fs.readFileSync( file ) );

} );
await new Promise( ( r ) => server.listen( 0, '127.0.0.1', r ) );
const port = server.address().port;
const profile = fs.mkdtempSync( path.join( process.env.TEMP || ROOT, 'fx25d-chrome-' ) );
const child = spawn( exe, [ '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${ profile }`, '--autoplay-policy=no-user-gesture-required', `http://127.0.0.1:${ port }/tools/fx25d/mix.html${ ONLY ? '?only=' + ONLY : '' }` ], { stdio: 'ignore' } );
const timer = setTimeout( () => { console.error( 'timed out' ); child.kill(); process.exit( 3 ); }, 8 * 60 * 1000 );
const measured = await got;
clearTimeout( timer );
child.kill();
server.close();
try { fs.rmSync( profile, { recursive: true, force: true } ); } catch ( e ) { /* locked: leave it */ }

const { CUE_LEVELS, MIX_GROUPS, targetOf } = await import( pathToFileURL( path.join( ROOT, 'src/features/sfx/Mix.js' ) ).href );
const { TRIMS: old } = await import( pathToFileURL( path.join( ROOT, 'src/features/sfx/MixTrims.js' ) ).href );
const rows = [];
const trims = { ...old }, raw = {};
for ( const [ name, m ] of Object.entries( measured ) ) {

	const e = CUE_LEVELS[ name ];
	if ( m.error ) { rows.push( { name, group: e.group, error: m.error } ); continue; }
	const untrimmed = m.lufs - ( old[ name ] || 0 );
	const target = targetOf( name );
	const trim = Math.round( ( target - untrimmed ) * 10 ) / 10;
	raw[ name ] = Math.round( untrimmed * 10 ) / 10;
	trims[ name ] = trim;
	rows.push( { name, group: e.group, kind: m.kind, raw: raw[ name ], target, trim, now: Math.round( m.lufs * 10 ) / 10, peak: Math.round( m.peak * 10 ) / 10 } );

}

const order = Object.keys( MIX_GROUPS );
rows.sort( ( a, b ) => order.indexOf( a.group ) - order.indexOf( b.group ) || ( a.target ?? 0 ) - ( b.target ?? 0 ) );
console.log( 'group    name               kind   raw LUFS  target  trim dB  now LUFS  peak dBFS  (now = measured with the trims in MixTrims.js applied)' );
for ( const r of rows ) console.log( r.error ? `${ r.group.padEnd( 8 ) } ${ r.name.padEnd( 18 ) } ERROR ${ r.error }` : `${ r.group.padEnd( 8 ) } ${ r.name.padEnd( 18 ) } ${ r.kind.padEnd( 5 ) } ${ String( r.raw ).padStart( 8 ) } ${ String( r.target ).padStart( 7 ) } ${ String( r.trim ).padStart( 8 ) } ${ String( r.now ).padStart( 9 ) } ${ String( r.peak ).padStart( 9 ) }` );
fs.mkdirSync( path.join( ROOT, 'tools/fx25d/out' ), { recursive: true } );
fs.writeFileSync( path.join( ROOT, 'tools/fx25d/out/mix-measured.json' ), JSON.stringify( { measuredWithTrims: measured, rows }, null, 1 ) );
if ( ! REPORT ) {

	const j = ( o ) => '{\n' + Object.entries( o ).map( ( [ k, v ] ) => `\t${ k }: ${ v },` ).join( '\n' ) + '\n}';
	const oldMeasured = ( await import( pathToFileURL( path.join( ROOT, 'src/features/sfx/MixTrims.js' ) ).href ) ).MEASURED;
	fs.writeFileSync( path.join( ROOT, 'src/features/sfx/MixTrims.js' ), `// Generated by tools/fx25d/mix.mjs (wave 25D): the measured gain trim (dB) that brings each sound to its target in Mix.js.\n// MEASURED is the sound's max momentary loudness (LUFS, stereo-equivalent, K-weighted) before the trim; beds: median.\nexport const TRIMS = ${ j( trims ) };\nexport const MEASURED = ${ j( { ...oldMeasured, ...raw } ) };\n` );
	console.log( 'wrote src/features/sfx/MixTrims.js' );

}
