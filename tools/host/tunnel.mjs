// Hyptile Island: host a universe and open it to the internet with a Cloudflare quick tunnel (no account, no port
// forwarding; the tunnel gives an https address, which the GitHub Pages game needs for a wss connection).
//
//   node tools/host/tunnel.mjs [--universe hyptile] [--data dir] [--port 8765]   (from a release: HOST_UNIVERSE_TUNNEL.cmd)
//
// Steps: downloads cloudflared.exe into ./bin once (Cloudflare's GitHub release), starts the universe server (no game
// files: the players use the GitHub Pages site), starts `cloudflared tunnel --url http://127.0.0.1:<port>`, reads the
// https://....trycloudflare.com address it prints and shows it. Players paste that address into Multiplayer > Universe.
// The address changes every time the tunnel starts (a quick tunnel); a named tunnel with a Cloudflare account keeps one.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const here = fileURLToPath( new URL( '.', import.meta.url ) );
const args = process.argv.slice( 2 );
const arg = ( k, d ) => { const i = args.indexOf( '--' + k ); return i >= 0 && args[ i + 1 ] ? args[ i + 1 ] : d; };
const port = Number( arg( 'port', 8765 ) ) || 8765;
const bin = join( here, 'bin' );
const exe = join( bin, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared' );
const dl = process.platform === 'win32' ? 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
	: process.platform === 'darwin' ? null : 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64';

function download( url, to ) {

	return new Promise( ( resolve, reject ) => {

		const go = ( u, hops = 0 ) => https.get( u, { headers: { 'user-agent': 'hyptile-island' } }, ( res ) => {

			if ( res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 6 ) { res.resume(); return go( res.headers.location, hops + 1 ); }
			if ( res.statusCode !== 200 ) { res.resume(); return reject( new Error( 'download failed: HTTP ' + res.statusCode ) ); }
			const out = createWriteStream( to );
			res.pipe( out );
			out.on( 'finish', () => out.close( resolve ) );
			out.on( 'error', reject );

		} ).on( 'error', reject );
		go( url );

	} );

}

if ( ! existsSync( exe ) ) {

	if ( ! dl ) { console.error( 'Install cloudflared first (brew install cloudflared) and put it in ' + bin ); process.exit( 1 ); }
	mkdirSync( bin, { recursive: true } );
	console.log( 'Downloading cloudflared (once) from ' + dl );
	await download( dl, exe );
	if ( process.platform !== 'win32' ) ( await import( 'node:fs/promises' ) ).chmod( exe, 0o755 );

}

// 1. the universe server (the players get the game from the GitHub Pages site)
const serveArgs = [ join( here, 'serve-universe.mjs' ), '--no-game', '--port', String( port ), ...args.filter( ( a ) => a !== '--port' ) ];
const server = spawn( process.execPath, serveArgs, { stdio: [ 'inherit', 'inherit', 'inherit' ] } );
server.on( 'exit', ( c ) => { console.log( 'universe server ended (' + c + ')' ); tunnel && tunnel.kill(); process.exit( c || 0 ); } );

// 2. the tunnel; its address is on stderr
const tunnel = spawn( exe, [ 'tunnel', '--url', 'http://127.0.0.1:' + port, '--no-autoupdate' ], { stdio: [ 'ignore', 'pipe', 'pipe' ] } );
let shown = false;
const watch = ( chunk ) => {

	const m = String( chunk ).match( /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i );
	if ( m && ! shown ) {

		shown = true;
		console.log( '\n==========================================================' );
		console.log( '  Universe address for players (Multiplayer > Universe):' );
		console.log( '  ' + m[ 0 ] );
		console.log( '  Game: https://jeffreyepsteel.github.io/Hyptile-Island/' );
		console.log( '  (the address changes each time this starts; keep this window open; Ctrl-C ends it)' );
		console.log( '==========================================================\n' );

	}

};
tunnel.stdout.on( 'data', watch );
tunnel.stderr.on( 'data', ( c ) => { watch( c ); if ( /error|failed/i.test( String( c ) ) ) process.stderr.write( c ); } );
tunnel.on( 'exit', ( c ) => { console.log( 'tunnel ended (' + c + ')' ); server.kill(); process.exit( c || 0 ); } );
process.on( 'SIGINT', () => { tunnel.kill(); server.kill(); process.exit( 0 ); } );
