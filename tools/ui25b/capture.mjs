// Headless-Chrome captures of the UI harness (tools/ui25b/harness.html): no game, no WebGPU, just the DOM and the CSS.
//   node tools/ui25b/capture.mjs [--url=http://127.0.0.1:5193] [--out=tools/ui25b/out] [--size=1280x800] [--only=hud,cast] [--tag=after]
// Needs a vite dev server on --url (npx vite --port 5193) and Chrome or Edge installed (CHROME env overrides the path).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const arg = ( k, d = null ) => { const a = process.argv.find( ( x ) => x.startsWith( '--' + k + '=' ) ); return a ? a.slice( k.length + 3 ) : d; };
const url = arg( 'url', 'http://127.0.0.1:5193' );
const out = resolve( arg( 'out', join( import.meta.dirname, 'out' ) ) );
const [ W, H ] = arg( 'size', '1280x800' ).split( 'x' ).map( Number );
const tag = arg( 'tag', 'after' );
const SCENES = [
	[ 'hud', 'scene=hud&bg=beach' ], [ 'cast-30', 'scene=cast&p=0.3&bg=beach' ], [ 'cast-full', 'scene=cast&p=1&bg=beach' ], [ 'levelup', 'scene=levelup&bg=beach', 1100 ],
	[ 'stand', 'scene=stand&bg=beach' ], [ 'shop', 'scene=shop&bg=beach' ], [ 'inv', 'scene=inv&bg=beach' ], [ 'tavern', 'scene=tavern&bg=beach' ], [ 'tavern-dice', 'scene=tavern&tab=dice&bg=beach' ],
	[ 'navy', 'scene=navy&bg=beach' ], [ 'navy-press', 'scene=navy&mode=press&bg=beach' ], [ 'toasts', 'scene=toasts&bg=beach' ], [ 'markers', 'scene=markers' ], [ 'worldmap', 'scene=worldmap' ],
	[ 'menu', 'scene=menu' ], [ 'menu-online', 'scene=menu-online' ], [ 'menu-online-closed', 'scene=menu-online&adv=0' ], [ 'menu-online-adv', 'scene=menu-online&adv=1' ], [ 'start', 'scene=start&bg=beach' ], [ 'settings', 'scene=hud&bg=beach&panel=1' ],
];
const only = arg( 'only' ) ? arg( 'only' ).split( ',' ) : null;
const chrome = process.env.CHROME || [ 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' ].find( existsSync );
if ( ! chrome ) throw new Error( 'no Chrome or Edge found (set CHROME)' );
mkdirSync( out, { recursive: true } );
const profile = mkdtempSync( join( tmpdir(), 'ui25b-chrome-' ) );
for ( const [ name, query, ms = 4000 ] of SCENES ) {

	if ( only && ! only.includes( name ) ) continue;
	const file = join( out, `${ tag }-${ name }.png` );
	const r = spawnSync( chrome, [ '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', `--user-data-dir=${ profile }`, `--window-size=${ W },${ H }`,
		`--virtual-time-budget=${ ms }`, `--screenshot=${ file }`, `${ url }/tools/ui25b/harness.html?${ query }&t=${ Date.now() }` ], { encoding: 'utf8', timeout: 60000 } );
	console.log( r.status === 0 && existsSync( file ) ? 'ok  ' : 'FAIL', name, file );

}
