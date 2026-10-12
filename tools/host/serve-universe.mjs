#!/usr/bin/env node
// Hosts a Hyptile Island universe on this computer: serves the built game on http://<this pc>:5190 and runs the server
// (Colyseus, server/index.mjs) with the persistent universe on ws://<this pc>:8765/universe (plus the island and crew
// rooms). The console takes the admin commands (help, list, captains, kick, ban, unban, release, save, backup, announce,
// stop). Node 22; the server's node_modules (Colyseus and its dependencies) must sit next to server/: the repository's
// own, or the release's (tools/host/pack-server-deps.mjs copies them). See docs/HOSTING.md.
//
//   node tools/host/serve-universe.mjs [--universe hyptile] [--data <dir>] [--port 5190] [--ws-port 8765] [--host 0.0.0.0]
//                                      [--max-players 16] [--backup-days 14] [--reconnect-seconds 60] [--no-game] [--no-console]
//
// Where things are: run from the repository it serves dist/ (npx vite build first) with server/ next to it; copied into a
// release folder (beside game/ and server/) it serves game/. The data goes to <that folder>/server-data/<universe> unless
// --data says otherwise.

import http from 'node:http';
import os from 'node:os';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, normalize, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = fileURLToPath( new URL( '.', import.meta.url ) );

// the release folder (game/ + server/ beside this file) or the repository (dist/ + server/ two levels up)
function findRoot() {

	if ( existsSync( join( here, 'server', 'index.mjs' ) ) ) return { root: here, game: join( here, 'game' ) };
	const repo = resolve( here, '..', '..' );
	return { root: repo, game: join( repo, 'dist' ) };

}

function parseArgs( argv ) {

	const o = { universe: 'hyptile', data: null, port: 5190, wsPort: 8765, host: '0.0.0.0', maxPlayers: 16, backupDays: 14, reconnectSeconds: 60, game: true, console: true };
	for ( let i = 0; i < argv.length; i ++ ) {

		const a = argv[ i ], v = argv[ i + 1 ];
		if ( a === '--universe' ) o.universe = v, i ++;
		else if ( a === '--data' ) o.data = v, i ++;
		else if ( a === '--port' ) o.port = Number( v ) || o.port, i ++;
		else if ( a === '--ws-port' ) o.wsPort = Number( v ) || o.wsPort, i ++;
		else if ( a === '--host' ) o.host = v, i ++;
		else if ( a === '--max-players' ) o.maxPlayers = Math.max( 1, Math.min( 64, Number( v ) | 0 ) ), i ++;
		else if ( a === '--backup-days' ) o.backupDays = Math.max( 1, Number( v ) | 0 ), i ++;
		else if ( a === '--reconnect-seconds' ) o.reconnectSeconds = Math.max( 0, Math.min( 600, Number( v ) | 0 ) ), i ++;
		else if ( a === '--no-game' ) o.game = false;
		else if ( a === '--no-console' ) o.console = false;
		else if ( a === '--help' || a === '-h' ) {

			console.log( 'usage: node serve-universe.mjs [--universe hyptile] [--data <dir>] [--port 5190] [--ws-port 8765] [--host 0.0.0.0]\n' +
				'                           [--max-players 16] [--backup-days 14] [--reconnect-seconds 60] [--no-game] [--no-console]' );
			process.exit( 0 );

		}

	}

	return o;

}

// the addresses friends on the same network can use
function lanAddresses() {

	const out = [];
	for ( const list of Object.values( os.networkInterfaces() ) ) for ( const a of list || [] ) if ( a.family === 'IPv4' && ! a.internal ) out.push( a.address );
	return out;

}

const TYPES = {
	'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
	'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
	'.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.ktx2': 'image/ktx2', '.hdr': 'application/octet-stream',
	'.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.txt': 'text/plain',
};

function serveGame( dir, port, host ) {

	const rootDir = resolve( dir ) + sep;
	const server = http.createServer( async ( req, res ) => {

		try {

			let p = decodeURIComponent( new URL( req.url, 'http://x' ).pathname );
			if ( p.endsWith( '/' ) ) p += 'index.html';
			let file = normalize( join( rootDir, p ) );
			if ( ! file.startsWith( rootDir ) ) throw new Error( 'outside' );
			// a crew code or another page path (/abcdef) is the game itself
			if ( ! existsSync( file ) && ! extname( file ) ) file = join( rootDir, 'index.html' );
			await stat( file );
			res.writeHead( 200, { 'content-type': TYPES[ extname( file ).toLowerCase() ] || 'application/octet-stream', 'cache-control': 'no-cache' } );
			res.end( await readFile( file ) );

		} catch ( e ) {

			res.writeHead( 404, { 'content-type': 'text/plain' } );
			res.end( 'not found' );

		}

	} );
	return new Promise( ( ok, fail ) => {

		server.once( 'error', fail );
		server.listen( port, host, () => ok( server ) );

	} );

}

const o = parseArgs( process.argv.slice( 2 ) );
const { root, game } = findRoot();
const data = resolve( o.data || join( root, 'server-data', String( o.universe || 'hyptile' ).toLowerCase().replace( /[^a-z0-9_-]/g, '' ) || 'hyptile' ) );
let relay = null;
try {

	relay = await import( pathToFileURL( join( root, 'server', 'index.mjs' ) ).href );

} catch ( e ) {

	// most likely the Colyseus packages are missing next to server/ (a release ships them in node_modules)
	console.error( `The universe server could not start: ${ e.message }` );
	console.error( 'From the repository run npm install once; a release folder needs its node_modules folder (docs/HOSTING.md).' );
	process.exit( 1 );

}

let web = null;
if ( o.game ) {

	if ( ! existsSync( join( game, 'index.html' ) ) ) {

		console.error( `No built game in ${ game }. In the repository run: npx vite build   (or start with --no-game to host the universe only)` );
		process.exit( 1 );

	}

	try {

		web = await serveGame( game, o.port, o.host );

	} catch ( e ) {

		console.error( `Port ${ o.port } is busy (${ e.message }). Close the other program or start with --port <another>.` );
		process.exit( 1 );

	}

}

const srv = relay.startServer( { port: o.wsPort, host: o.host, universe: o.universe, data, universeCap: o.maxPlayers, backupDays: o.backupDays, reconnectSeconds: o.reconnectSeconds } );
const stop = relay.stopOnSignals ? relay.stopOnSignals( srv ) : null;
try {

	await srv.ready;

} catch ( e ) {

	console.error( `Port ${ o.wsPort } is busy (${ e.message }). Is another universe server running? Close it or start with --ws-port <another>.` );
	process.exit( 1 );

}

const ips = lanAddresses();
console.log( '' );
console.log( `  Hyptile Island universe '${ srv.universe.name }' is running.` );
console.log( `  Saves: ${ srv.universe.dir }` );
if ( web ) {

	console.log( `  On this PC:   http://localhost:${ o.port }/   (Multiplayer > Universe, server localhost:${ o.wsPort })` );
	for ( const ip of ips ) console.log( `  On your LAN:  http://${ ip }:${ o.port }/   (server ${ ip }:${ o.wsPort })` );

} else for ( const ip of ips ) console.log( `  Universe:     ${ ip }:${ o.wsPort }` );
console.log( '  Type help for the admin commands; stop (or Ctrl+C) saves and quits. Closing the window also saves.' );
console.log( '' );
if ( o.console && relay.attachConsole ) relay.attachConsole( srv, { onStop: ( why ) => { if ( web ) web.close(); if ( stop ) stop( why ); else srv.close().then( () => process.exit( 0 ) ); } } );
