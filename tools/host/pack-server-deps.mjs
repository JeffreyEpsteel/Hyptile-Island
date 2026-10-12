#!/usr/bin/env node
// Copies the node_modules the Hyptile Island server needs into a release folder: the full dependency closure of
// server/index.mjs (Colyseus core, its WebSocket transport, @colyseus/schema, ws, express and everything under them),
// nothing the browser game or the tools use. Run it after the release folder has server/ and src/ (root's release step).
//
//   node tools/host/pack-server-deps.mjs <release dir> [--dry] [--verify] [--keep-maps]
//
// How: (1) a child process starts server/index.mjs (with a throwaway universe), answers one /health and one matchmaking
// request, and reports every file it loaded (ESM resolve hook + the CommonJS cache); each file's package is a root.
// (2) Each root adds its `dependencies` / `optionalDependencies` recursively, resolved the way Node does (nested
// node_modules first, then upwards). (3) Each package is copied to the same relative place under <release>/node_modules
// (its own nested node_modules left out: the nested packages that are needed are packages of the closure themselves).
// Source maps and .d.ts files are skipped unless --keep-maps. --dry lists without copying; --verify starts the server from
// the release folder afterwards (it must answer /health). A manifest goes to <release>/node_modules/.hyptile-server-deps.json.

import { spawnSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, cpSync, writeFileSync, rmSync, statSync, readdirSync, mkdtempSync } from 'node:fs';
import { join, resolve, relative, sep, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname( fileURLToPath( import.meta.url ) );
const repo = resolve( here, '..', '..' );
const NM = join( repo, 'node_modules' );

function parseArgs( argv ) {

	const o = { out: null, dry: false, verify: false, keepMaps: false };
	for ( const a of argv ) {

		if ( a === '--dry' ) o.dry = true;
		else if ( a === '--verify' ) o.verify = true;
		else if ( a === '--keep-maps' ) o.keepMaps = true;
		else if ( a === '--help' || a === '-h' ) {

			console.log( 'usage: node tools/host/pack-server-deps.mjs <release dir> [--dry] [--verify] [--keep-maps]' );
			process.exit( 0 );

		} else if ( ! o.out ) o.out = resolve( a );

	}

	return o;

}

// ---- (1) what the server really loads

const CHILD = `
import { register, createRequire } from 'node:module';
import { appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const out = process.argv[ 2 ], server = process.argv[ 3 ];
const hook = 'export async function resolve( s, c, next ) { const r = await next( s, c ); if ( r.url && r.url.startsWith( "file:" ) ) { const fs = await import( "node:fs" ); fs.appendFileSync( ' + JSON.stringify( out ) + ', r.url + "\\\\n" ); } return r; }';
register( 'data:text/javascript,' + encodeURIComponent( hook ) );
const data = mkdtempSync( join( tmpdir(), 'hyptile-trace-' ) );
const { startServer } = await import( server );
const srv = startServer( { port: 0, host: '127.0.0.1', universe: 'trace', data, log: () => {} } );
const port = await srv.ready;
await ( await fetch( 'http://127.0.0.1:' + port + '/health' ) ).text();
await ( await fetch( 'http://127.0.0.1:' + port + '/matchmake/joinOrCreate/room', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify( { v: 2, name: 'Trace', room: 'island' } ) } ) ).text();
await srv.close();
const req = createRequire( import.meta.url );
for ( const f of Object.keys( req( 'module' )._cache ) ) appendFileSync( out, f + '\\n' );
try { rmSync( data, { recursive: true, force: true } ); } catch ( e ) { /* temp */ }
process.exit( 0 );
`;

function traceLoaded() {

	const dir = mkdtempSync( join( tmpdir(), 'hyptile-pack-' ) );
	const list = join( dir, 'loaded.txt' );
	const child = join( dir, 'trace.mjs' );
	writeFileSync( list, '' );
	writeFileSync( child, CHILD );
	const r = spawnSync( process.execPath, [ child, list, pathToFileURL( join( repo, 'server', 'index.mjs' ) ).href ], { cwd: repo, encoding: 'utf8', timeout: 60000 } );
	if ( r.status !== 0 ) {

		console.error( r.stdout, r.stderr );
		throw new Error( 'the trace run of the server failed' );

	}

	const files = readFileSync( list, 'utf8' ).split( /\r?\n/ ).filter( Boolean ).map( ( l ) => ( l.startsWith( 'file:' ) ? fileURLToPath( l ) : l ) );
	try { rmSync( dir, { recursive: true, force: true } ); } catch ( e ) { /* temp */ }
	return files;

}

// the package folder (relative to node_modules, e.g. "@colyseus/core" or "@pm2/io/node_modules/debug") of a file
function packageOf( file ) {

	const rel = relative( NM, file );
	if ( rel.startsWith( '..' ) || rel === '' ) return null;
	const parts = rel.split( sep );
	const out = [];
	for ( let i = 0; i < parts.length; ) {

		const n = parts[ i ][ 0 ] === '@' ? 2 : 1;
		out.push( ...parts.slice( i, i + n ) );
		i += n;
		if ( parts[ i ] !== 'node_modules' ) break;
		out.push( 'node_modules' );
		i ++;

	}

	return out.join( '/' );

}

// ---- (2) the dependency closure

const readPkg = ( rel ) => {

	try {

		return JSON.parse( readFileSync( join( NM, rel, 'package.json' ), 'utf8' ) );

	} catch ( e ) {

		return null;

	}

};

// Node's lookup: <pkg>/node_modules/<dep>, then each parent node_modules up to the root
function resolveDep( fromRel, dep ) {

	let base = fromRel;
	for ( ;; ) {

		const cand = base ? `${ base }/node_modules/${ dep }` : dep;
		if ( existsSync( join( NM, cand, 'package.json' ) ) ) return cand;
		if ( ! base ) return null;
		const i = base.lastIndexOf( '/node_modules/' );
		base = i >= 0 ? base.slice( 0, i ) : '';

	}

}

function closure( roots ) {

	const seen = new Map(); // rel -> version
	const missing = [];
	const todo = [ ...roots ];
	while ( todo.length ) {

		const rel = todo.pop();
		if ( seen.has( rel ) ) continue;
		const pkg = readPkg( rel );
		if ( ! pkg ) {

			missing.push( rel );
			continue;

		}

		seen.set( rel, pkg.version || '?' );
		const deps = { ...( pkg.dependencies || {} ), ...( pkg.optionalDependencies || {} ) };
		for ( const d of Object.keys( deps ) ) {

			const r = resolveDep( rel, d );
			if ( r ) todo.push( r );
			else if ( ! ( pkg.optionalDependencies && d in pkg.optionalDependencies ) ) missing.push( `${ d } (needed by ${ rel })` );

		}

	}

	return { packages: [ ...seen.entries() ].sort( ( a, b ) => a[ 0 ].localeCompare( b[ 0 ] ) ), missing };

}

function dirSize( dir, keepMaps ) {

	let n = 0;
	for ( const e of readdirSync( dir, { withFileTypes: true } ) ) {

		const p = join( dir, e.name );
		if ( e.isDirectory() ) {

			if ( e.name !== 'node_modules' ) n += dirSize( p, keepMaps );

		} else if ( keepMaps || ! skipFile( e.name ) ) n += statSync( p ).size;

	}

	return n;

}

const skipFile = ( name ) => /\.map$|\.d\.[mc]?ts$/.test( name );

// ---- (3) copy

function main() {

	const o = parseArgs( process.argv.slice( 2 ) );
	if ( ! o.out ) {

		console.error( 'usage: node tools/host/pack-server-deps.mjs <release dir> [--dry] [--verify] [--keep-maps]' );
		process.exit( 2 );

	}

	const files = traceLoaded();
	const roots = new Set();
	for ( const f of files ) {

		const p = packageOf( f );
		if ( p ) roots.add( p );

	}

	const { packages, missing } = closure( [ ...roots ] );
	let bytes = 0;
	for ( const [ rel ] of packages ) bytes += dirSize( join( NM, rel ), o.keepMaps );
	console.log( `server runtime: ${ roots.size } packages loaded at start, ${ packages.length } with their dependencies, ${ ( bytes / 1048576 ).toFixed( 1 ) } MB` );
	for ( const [ rel, v ] of packages ) console.log( `  ${ rel }@${ v }${ roots.has( rel ) ? '' : '  (dependency)' }` );
	if ( missing.length ) console.log( `not installed (skipped): ${ missing.join( ', ' ) }` );
	if ( o.dry ) return;

	const dest = join( o.out, 'node_modules' );
	mkdirSync( dest, { recursive: true } );
	for ( const [ rel ] of packages ) {

		const src = join( NM, rel );
		const to = join( dest, rel );
		rmSync( to, { recursive: true, force: true } );
		cpSync( src, to, {
			recursive: true,
			filter: ( p ) => {

				const r = relative( src, p );
				if ( r.split( sep ).includes( 'node_modules' ) ) return false; // nested packages are copied as packages of their own
				return o.keepMaps || ! skipFile( p );

			},
		} );

	}

	writeFileSync( join( dest, '.hyptile-server-deps.json' ), JSON.stringify( { packedAt: new Date().toISOString(), from: repo, packages: Object.fromEntries( packages ) }, null, '\t' ) );
	console.log( `copied into ${ dest }` );
	if ( o.verify ) verify( o.out );

}

// the release folder's own server must start and answer /health with only these node_modules
function verify( out ) {

	const idx = join( out, 'server', 'index.mjs' );
	if ( ! existsSync( idx ) ) {

		console.log( `verify skipped: ${ idx } is not there yet` );
		return;

	}

	const data = mkdtempSync( join( tmpdir(), 'hyptile-verify-' ) );
	const child = spawn( process.execPath, [ idx, '--port', '0', '--host', '127.0.0.1', '--universe', 'verify', '--data', data, '--no-console' ], { cwd: out, stdio: [ 'ignore', 'pipe', 'pipe' ], env: { ...process.env, NODE_PATH: '' } } );
	let text = '';
	const done = ( okay, why ) => {

		child.kill();
		try { rmSync( data, { recursive: true, force: true } ); } catch ( e ) { /* temp */ }
		console.log( okay ? 'verify: the release server started and answered /health' : `verify FAILED: ${ why }\n${ text }` );
		process.exitCode = okay ? 0 : 1;

	};

	const timer = setTimeout( () => done( false, 'no answer in 20 s' ), 20000 );
	const onData = ( d ) => {

		text += d;
		const m = /listening on ws:\/\/[^:]+:(\d+)/.exec( text );
		if ( ! m ) return;
		child.stdout.off( 'data', onData );
		fetch( `http://127.0.0.1:${ m[ 1 ] }/health` ).then( ( r ) => r.json() ).then( ( j ) => {

			clearTimeout( timer );
			done( j && j.ok === true, 'bad /health' );

		}, ( e ) => {

			clearTimeout( timer );
			done( false, e.message );

		} );

	};

	child.stdout.on( 'data', onData );
	child.stderr.on( 'data', ( d ) => { text += d; } );
	child.on( 'exit', ( code ) => {

		if ( code && ! /verify:/.test( text ) ) {

			clearTimeout( timer );
			done( false, `exit ${ code }` );

		}

	} );

}

main();
