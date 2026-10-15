// Applies wave 22B's patches (tools/capsize/patches.mjs) to a tree: each anchor must appear exactly once, or nothing is
// written. Already applied (the replacement is there): skipped.
//   node tools/capsize/apply-patches.mjs [--root=<tree>] [--check]      (--check: report only, write nothing)
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PATCHES } from './patches.mjs';

const arg = ( k, d = null ) => { const a = process.argv.find( ( x ) => x.startsWith( '--' + k + '=' ) ); return a ? a.slice( k.length + 3 ) : d; };
const root = resolve( arg( 'root', join( import.meta.dirname, '..', '..' ) ) );
const check = process.argv.includes( '--check' );
const files = new Map();
let bad = 0;
for ( const p of PATCHES ) {

	const f = join( root, p.file );
	if ( ! files.has( f ) ) files.set( f, readFileSync( f, 'utf8' ).replace( /\r\n/g, '\n' ) );
	const s = files.get( f );
	if ( s.includes( p.replace ) ) { console.log( `already   ${ p.file }: ${ p.anchor.trim().slice( 0, 60 ) }` ); continue; }
	const n = s.split( p.anchor ).length - 1;
	if ( n !== 1 ) { bad ++; console.log( `ANCHOR x${ n } ${ p.file }: ${ p.anchor.trim().slice( 0, 80 ) }` ); continue; }
	files.set( f, s.replace( p.anchor, p.replace ) );
	console.log( `patched   ${ p.file }: ${ p.anchor.trim().slice( 0, 60 ) }` );

}

if ( bad ) { console.log( `${ bad } anchor(s) not found once: nothing written` ); process.exit( 1 ); }
if ( ! check ) for ( const [ f, s ] of files ) writeFileSync( f, s );
console.log( check ? 'check only: nothing written' : `written: ${ files.size } files` );
