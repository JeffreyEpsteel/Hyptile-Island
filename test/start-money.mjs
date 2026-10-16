// New players start with START_MONEY (src/net/Protocol.js; user, 2026-10-16): a new campaign or multiplayer game gets it in
// App.startSession, and the universe server opens a new captain's purse at it, so the first save is not clamped.
// node test/start-money.mjs

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Universe, MONEY_BURST } from '../server/universe.mjs';
import { START_MONEY } from '../src/net/Protocol.js';

let failed = 0;
const ok = ( c, msg ) => { console.log( `${ c ? 'ok  ' : 'FAIL' } ${ msg }` ); if ( ! c ) failed ++; };
const profileOf = ( money ) => ( { v: 2, mode: 'multiplayer', name: 'whoever', money, xp: 0, inventory: [], log: {}, upgrades: { rod: 1 }, unlocked: [ 'hyptile' ], character: 'hyptile', boat: null, fuel: null, nextId: 1, rep: {}, discovered: [], career: {}, quests: {}, world: null, features: {} } );

ok( START_MONEY === 100000, `new players start with $${ START_MONEY }` );

const root = mkdtempSync( join( tmpdir(), 'hyptile-start-money-' ) );
try {

	const u = new Universe( { name: 'startmoney', dir: join( root, 'u' ) } ).load();
	const a = u.admit( { name: 'New Captain', token: 'd'.repeat( 32 ), remote: 'start' } );
	ok( a && a.key, 'a new captain is admitted' );
	const r = u.storeProfile( a.key, profileOf( START_MONEY ), { startedAt: Date.now() } );
	ok( r && r.ok && ! r.fix && u.loadProfile( a.key ).money === START_MONEY, `the first save keeps the $${ START_MONEY } purse (not clamped)` );
	const b = u.admit( { name: 'Greedy Captain', token: 'e'.repeat( 32 ), remote: 'start2' } );
	const r2 = u.storeProfile( b.key, profileOf( START_MONEY * 3 ), { startedAt: Date.now() } );
	ok( r2 && r2.fix && r2.fix.money <= START_MONEY + MONEY_BURST + 1, `a first save far above it is still clamped ($${ r2 && r2.fix && r2.fix.money })` );

} finally { rmSync( root, { recursive: true, force: true } ); }

if ( failed ) { console.log( `${ failed } start money check(s) failed` ); process.exit( 1 ); }
console.log( 'all start money checks passed' );
