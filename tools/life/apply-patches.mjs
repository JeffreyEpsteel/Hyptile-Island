// Wave 24E's root patches (worker 24E does not edit root-owned files): each is an exact anchor and its replacement.
//   node tools/life/apply-patches.mjs            check: apply every patch to a copy in the OS temp dir and verify, touch nothing
//   node tools/life/apply-patches.mjs --apply    the same, then write the patched files into the tree
// A patch already in place is reported and skipped; a missing anchor fails the run (nothing is written).
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = resolve( import.meta.dirname, '..', '..' );

const PATCHES = [
	{
		file: 'package.json',
		why: 'npm test runs the wave 24E town life tests',
		anchor: 'node test/feature-townlife.mjs && ',
		replace: 'node test/feature-townlife.mjs && node test/feature-townlife-w24.mjs && ',
		done: 'node test/feature-townlife-w24.mjs',
	},
];

const apply = process.argv.includes( '--apply' );
const tmp = mkdtempSync( join( tmpdir(), 'life-patches-' ) );
let failed = 0;
const out = new Map();
for ( const p of PATCHES ) {

	const src = join( ROOT, p.file );
	const copy = join( tmp, p.file );
	mkdirSync( dirname( copy ), { recursive: true } );
	copyFileSync( src, copy );
	let text = out.get( p.file ) ?? readFileSync( copy, 'utf8' );
	if ( text.includes( p.done ) ) { console.log( `already in: ${ p.file } (${ p.why })` ); out.set( p.file, text ); continue; }
	const n = text.split( p.anchor ).length - 1;
	if ( n !== 1 ) { console.log( `FAIL ${ p.file }: the anchor is found ${ n } times (${ p.why })` ); failed ++; continue; }
	text = text.replace( p.anchor, p.replace );
	if ( p.file.endsWith( '.json' ) ) {

		try { JSON.parse( text ); } catch ( e ) { console.log( `FAIL ${ p.file }: not JSON after the patch` ); failed ++; continue; }

	}

	writeFileSync( copy, text );
	if ( ! readFileSync( copy, 'utf8' ).includes( p.done ) ) { console.log( `FAIL ${ p.file }: not applied on the copy` ); failed ++; continue; }
	out.set( p.file, text );
	console.log( `ok   ${ p.file }: ${ p.why } (verified on ${ copy })` );

}

if ( failed ) { console.log( `${ failed } patch(es) failed; nothing written` ); process.exit( 1 ); }
if ( apply ) for ( const [ file, text ] of out ) { writeFileSync( join( ROOT, file ), text ); console.log( `written: ${ file }` ); }
else console.log( 'check only (--apply writes them)' );
