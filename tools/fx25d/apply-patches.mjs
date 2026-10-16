// Root patch for wave 25D: (1) the catch card's flourish, gap 4.1 (src/game/GameHUD.js is 25B's file) and (2) the new test in
// package.json's "test" script (root's file). Both change files with exact anchors: nothing is written unless every anchor is found exactly once (or the patch is already in).
//   node tools/fx25d/apply-patches.mjs --check     verify on a copy in the temp dir (anchors found, the result parses)
//   node tools/fx25d/apply-patches.mjs             apply to src/game/GameHUD.js
//
// What it adds to the catch card: a slow light fan behind the fish and a ring that pulses once when the card lands, a burst of
// sparks (gold for a record, aqua for a new species, pale for a plain catch) thrown out of the fish's middle on the stamp's
// beat, and a glint that sweeps once across the three stat tiles when they have risen. All CSS, ~1 KB, no new elements outside
// the stage; reduced-motion shows none of it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// --root=<dir> patches another checkout (a copy to look at the result in)
const RARG = process.argv.find( ( a ) => a.startsWith( '--root=' ) );
const ROOT = RARG ? path.resolve( RARG.slice( 7 ) ) : path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '../..' );
const FILE = path.join( ROOT, 'src/game/GameHUD.js' );
const PKG = path.join( ROOT, 'package.json' );
const CHECK = process.argv.includes( '--check' );
const MARK = 'wave 25D flourish';

const CSS = `/* ${ MARK }: a light fan, a ring and sparks behind the fish when the card lands; a glint across the stat tiles */
.gm-flourish { position: absolute; left: 50%; top: 52%; width: 0; height: 0; pointer-events: none; --fl: 242, 214, 150; }
.gm-flourish.is-new { --fl: 140, 224, 210; }
.gm-flourish.is-plain { --fl: 214, 232, 240; }
.gm-flourish::before { content: ''; position: absolute; left: 0; top: 0; width: min(78vw, 980px); aspect-ratio: 1; margin: calc(min(78vw, 980px) / -2); border-radius: 50%; opacity: 0;
	background: repeating-conic-gradient(from 0deg, rgba(var(--fl), 0.11) 0deg 4deg, transparent 4deg 18deg);
	-webkit-mask-image: radial-gradient(closest-side, #000 0%, transparent 78%); mask-image: radial-gradient(closest-side, #000 0%, transparent 78%); }
.gm-flourish::after { content: ''; position: absolute; left: 0; top: 0; width: min(36vw, 460px); aspect-ratio: 1; margin: calc(min(36vw, 460px) / -2); border-radius: 50%; opacity: 0;
	box-shadow: 0 0 0 2px rgba(var(--fl), 0.55), 0 0 40px rgba(var(--fl), 0.35) inset; }
.gm-catch.is-on .gm-flourish::before { animation: gm-fan 3.2s var(--tw-ease) 260ms forwards; }
.gm-catch.is-on .gm-flourish::after { animation: gm-ring 900ms cubic-bezier(0.2, 0.7, 0.3, 1) 220ms forwards; }
.gm-flourish i { position: absolute; left: 0; top: 0; width: var(--s); height: var(--s); margin: calc(var(--s) / -2); opacity: 0;
	background: radial-gradient(circle, rgba(255, 255, 255, 0.95) 0%, rgba(var(--fl), 0.8) 35%, transparent 70%);
	clip-path: polygon(50% 0, 60% 40%, 100% 50%, 60% 60%, 50% 100%, 40% 60%, 0 50%, 40% 40%); }
.gm-catch.is-on .gm-flourish i { animation: gm-spark 1000ms cubic-bezier(0.15, 0.7, 0.3, 1) var(--d) forwards; }
.gm-flourish.is-record i { filter: drop-shadow(0 0 6px rgba(var(--fl), 0.9)); }
@keyframes gm-fan { 0% { opacity: 0; transform: rotate(-8deg) scale(0.6); } 25% { opacity: 1; } 100% { opacity: 0; transform: rotate(14deg) scale(1.05); } }
@keyframes gm-ring { 0% { opacity: 0.9; transform: scale(0.25); } 100% { opacity: 0; transform: scale(1.25); } }
@keyframes gm-spark { 0% { opacity: 0; transform: translate(0, 0) scale(0.2) rotate(0deg); } 14% { opacity: 1; }
	100% { opacity: 0; transform: translate(var(--x), var(--y)) scale(1) rotate(120deg); } }
.gm-stat { position: relative; overflow: hidden; }
.gm-stat::after { content: ''; position: absolute; top: 0; bottom: 0; left: -60%; width: 40%; opacity: 0; pointer-events: none;
	background: linear-gradient(100deg, transparent, rgba(255, 244, 214, 0.38), transparent); transform: skewX(-18deg); }
.gm-catch.is-on .gm-stat::after { animation: gm-sweep 900ms var(--tw-ease) calc(1000ms + var(--n, 0) * 140ms) forwards; }
.gm-stat:nth-child(2) { --n: 1; } .gm-stat:nth-child(3) { --n: 2; }
@keyframes gm-sweep { 0% { opacity: 1; left: -60%; } 100% { opacity: 0; left: 130%; } }
`;

const REDUCED = '\t.gm-catch.is-on .gm-flourish::before, .gm-catch.is-on .gm-flourish::after, .gm-catch.is-on .gm-flourish i, .gm-catch.is-on .gm-stat::after { animation: none; opacity: 0; }\n';

const JS = `		// ${ MARK }: sparks thrown out of the fish's middle; gold for a record, aqua for a new species
		const flk = info.record ? 'is-record' : info.newSpecies ? 'is-new' : 'is-plain';
		let sparks = '';
		for ( let i = 0, n = info.record ? 22 : info.newSpecies ? 16 : 9; i < n; i ++ ) {

			const a = ( i / n ) * Math.PI * 2 + Math.random() * 0.4, r = 120 + Math.random() * ( info.record ? 380 : 260 );
			sparks += \`<i style="--s:\${ ( 10 + Math.random() * ( info.record ? 22 : 14 ) ).toFixed( 1 ) }px;--x:\${ ( Math.cos( a ) * r * 1.7 ).toFixed( 0 ) }px;--y:\${ ( Math.sin( a ) * r * 0.6 - 30 ).toFixed( 0 ) }px;--d:\${ ( 880 + Math.random() * 260 ).toFixed( 0 ) }ms"></i>\`;

		}

`;

// [ anchor, replacement builder ( anchor ) ]
const EDITS = [
	[ '@keyframes gm-timer { from { transform: scaleX(1); } to { transform: scaleX(0); } }\n', ( a ) => a + CSS ],
	[ '\t.gm-catch.is-on .gm-splash i { animation: none; }\n', ( a ) => a + REDUCED ],
	[ '\t\tconst c = this.catchCard;\n\t\tc.style.setProperty( \'--gm-catch-ms\'', ( a ) => JS + a ],
	[ '<div class="gm-splash">${ drops }</div></div>', ( a ) => '<div class="gm-flourish ${ flk }">${ sparks }</div>' + a ],
];

function patch( src ) {

	let out = src;
	for ( const [ anchor, build ] of EDITS ) {

		const n = out.split( anchor ).length - 1;
		if ( n !== 1 ) throw new Error( `anchor found ${ n } times (need 1): ${ anchor.slice( 0, 70 ).replace( /\n/g, '\\n' ) }` );
		out = out.replace( anchor, () => build( anchor ) );

	}

	return { out, already: false };

}

// package.json: node test/feature-feedback-w25.mjs runs right after the first test of "test"
const PKG_ANCHOR = '"test": "node test/game-logic.mjs && ';
const PKG_ADD = 'node test/feature-feedback-w25.mjs && ';

function run( file, apply, mark, label ) {

	const src = fs.readFileSync( file, 'utf8' );
	if ( src.includes( mark ) ) { console.log( `${ label }: already applied` ); return null; }
	const out = apply( src );
	return { file, src, out, label };

}

const hud = run( FILE, ( src ) => patch( src ).out, MARK, 'GameHUD.js' );
const pkg = run( PKG, ( src ) => {

	if ( src.split( PKG_ANCHOR ).length - 1 !== 1 ) throw new Error( 'package.json: the "test" anchor is not found exactly once' );
	return src.replace( PKG_ANCHOR, () => PKG_ANCHOR + PKG_ADD );

}, 'node test/feature-feedback-w25.mjs', 'package.json' );

for ( const j of [ hud, pkg ] ) {

	if ( ! j ) continue;
	// the result must parse (JS as a module, package.json as JSON)
	if ( j.file === PKG ) JSON.parse( j.out );
	else {

		const tmp = fs.mkdtempSync( path.join( os.tmpdir(), 'fx25d-patch-' ) );
		const copy = path.join( tmp, 'GameHUD.mjs' );
		fs.writeFileSync( copy, j.out );
		const r = spawnSync( process.execPath, [ '--check', copy ], { encoding: 'utf8' } );
		fs.rmSync( tmp, { recursive: true, force: true } );
		if ( r.status !== 0 ) { console.error( 'the patched file does not parse: ' + r.stderr ); process.exit( 1 ); }

	}

	if ( CHECK ) console.log( `${ j.label }: ok, anchors found once each, the result parses (+${ j.out.length - j.src.length } bytes); nothing written` );
	else { fs.writeFileSync( j.file, j.out ); console.log( `${ j.label }: patched (+${ j.out.length - j.src.length } bytes)` ); }

}
