// Root patches of wave 25A (load time). Each patch is an exact anchor (found once) and its replacement.
//   node tools/w25a/apply-patches.mjs [rootDir] [--check]
// rootDir defaults to the repo; --check only reports whether every anchor is found exactly once (nothing written).
// Root owns these files: run it (or copy the pairs) at integration time. Line ends follow each file (CRLF or LF).
//
// What they do: App.init( onProgress, { deferCompile } ) ends with the world built and leaves the pipeline compile
// running (app.compiled); main.js opens the main menu at once with a quiet "Preparing the island" line, and after the
// choice holds the loader only until the chosen spot's first view draws whole (src/engine/Warmup.js warmView: the
// pipelines that view waits for jump the compile queue). ?bench, ?nomenu and ?bg keep the whole compile up front.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NL = String.fromCharCode( 10 ), CRLF = String.fromCharCode( 13, 10 );
const lines = ( ...a ) => a.join( NL );

export const PATCHES = [
	{ file: 'src/App.js', anchor: '\tasync init( onProgress = () => {} ) {',
		replace: '\tasync init( onProgress = () => {}, { deferCompile = false } = {} ) {' },
	{ file: 'src/App.js', anchor: lines(
		"\t\tawait progress( 0.36, 'Compiling shaders…', 0.95 );",
		'\t\tawait this.precompile();' ),
	replace: lines(
		'\t\t// wave 25A: deferCompile (main.js, the menu path): init ends here with the world built and the pipelines compile',
		'\t\t// behind the main menu; this.compiled resolves when they are all in (engine/Warmup.js holds the first view until it',
		'\t\t// draws whole)',
		'\t\tif ( deferCompile ) {',
		'',
		"\t\t\tthis.compiled = this.precompile().catch( ( e ) => console.warn( 'precompile', e ) );",
		'\t\t\treturn;',
		'',
		'\t\t}',
		'',
		"\t\tawait progress( 0.36, 'Compiling shaders…', 0.95 );",
		'\t\tawait this.precompile();' ) },
	{ file: 'src/main.js', anchor: "import { GPU } from './engine/gpu/GPU.js';",
		replace: lines( "import { GPU } from './engine/gpu/GPU.js';", "import { warmView, compileProgress } from './engine/Warmup.js';" ) },
	{ file: 'src/main.js', anchor: "const describeError = ( e ) =>",
		replace: lines(
			'// wave 25A: a quiet line under the main menu while the island\'s shaders compile behind it (App.init deferCompile).',
			'// The percentage needs the total, which the last visit stored (the compile requests more pipelines as it goes).',
			"const PIPES_KEY = 'hyptile-island.pipelines';",
			'function compileChip( done ) {',
			'',
			"\tconst el = document.createElement( 'div' );",
			"\tel.setAttribute( 'role', 'status' );",
			"\tel.style.cssText = 'position:fixed;left:50%;bottom:clamp(12px,2.4vh,24px);transform:translateX(-50%);z-index:30;padding:6px 14px;border-radius:999px;' +",
			"\t\t'font:500 12px/1.4 system-ui,sans-serif;letter-spacing:.04em;color:rgba(232,244,240,.82);background:rgba(4,14,24,.55);pointer-events:none;transition:opacity .6s';",
			'\tlet total = 0;',
			'\ttry { total = Number( localStorage.getItem( PIPES_KEY ) ) || 0; } catch ( e ) { /* no storage */ }',
			'\tconst paint = () => {',
			'',
			'\t\tconst p = compileProgress();',
			'\t\tconst all = Math.max( total, p.requested );',
			"\t\tel.textContent = total ? `Preparing the island · ${ Math.min( 99, Math.floor( 100 * p.done / all ) ) }%` : 'Preparing the island…';",
			'',
			'\t};',
			'\tpaint();',
			'\tdocument.body.appendChild( el );',
			'\tconst iv = setInterval( paint, 400 );',
			'\tconst remove = () => {',
			'',
			'\t\tclearInterval( iv );',
			"\t\tel.style.opacity = '0';",
			'\t\tsetTimeout( () => el.remove(), 700 );',
			'',
			'\t};',
			'\tdone.then( () => {',
			'',
			'\t\ttry { localStorage.setItem( PIPES_KEY, String( compileProgress().requested ) ); } catch ( e ) { /* no storage */ }',
			"\t\tel.textContent = 'Island ready';",
			'\t\tsetTimeout( remove, 900 );',
			'',
			'\t} );',
			'\treturn remove;',
			'',
			'}',
			'',
			'// wave 25A: the chosen spot\'s first frames run behind the loader until one draws everything it wants (engine/Warmup.js);',
			'// a view already compiled (a long look at the menu) never shows the loader',
			'async function firstView( app ) {',
			'',
			"\tsetStage( 'preparing the view' );",
			"\tconst L = document.getElementById( 'loader' );",
			"\tconst q = ( s ) => L && L.querySelector( s );",
			"\tconst fill = q( '.loader-fill' ), pct = q( '.loader-pct' ), status = q( '.loader-status' );",
			'\tconst paint = ( f, text ) => {',
			'',
			"\t\tif ( fill ) fill.style.transform = `scaleX(${ Math.max( 0.02, f ).toFixed( 3 ) })`;",
			"\t\tif ( pct ) pct.textContent = Math.floor( f * 100 ) + '%';",
			'\t\tif ( status ) status.textContent = text;',
			'',
			'\t};',
			'\tlet shown = false;',
			'\tconst show = setTimeout( () => {',
			'',
			'\t\tif ( ! L ) return;',
			'\t\tshown = true;',
			"\t\tL.style.display = '';",
			"\t\tL.classList.remove( 'tw-hidden', 'tw-error', 'is-compiling' );",
			"\t\tpaint( 0.05, 'Preparing the view…' );",
			'',
			'\t}, 300 );',
			'\tconst r = await warmView( app, { onProgress: ( s ) => {',
			'',
			"\t\tif ( shown && s.needed ) paint( 0.05 + 0.95 * s.ready / s.needed, `Preparing the view · ${ s.ready } / ${ s.needed }` );",
			'',
			'\t} } );',
			'\tclearTimeout( show );',
			"\terrorLog.push( 'stage', `first view in ${ ( r.ms / 1000 ).toFixed( 1 ) } s, ${ r.frames } frames${ r.waited ? `, ${ r.waited } draws still compiling` : '' }` );",
			'\tif ( shown && L ) {',
			'',
			"\t\tpaint( 1, 'Ready' );",
			"\t\tL.classList.add( 'tw-hidden' );",
			'\t\tawait new Promise( ( res ) => setTimeout( res, 920 ) );',
			"\t\tL.style.display = 'none';",
			'',
			'\t}',
			'',
			'}',
			'',
			'const describeError = ( e ) =>' ) },
	{ file: 'src/main.js', anchor: lines(
		'\tapp.init( ( p, text, until ) => {',
		'',
		'\t\tsetStage( text );',
		'\t\tui.setLoading( p, text, until );',
		'',
		'\t} ).then( async () => {' ),
	replace: lines(
		'\t// wave 25A: the menu path builds the world, then opens the main menu while the pipelines compile behind it',
		'\t// (automation: ?bench, and ?nomenu / ?bg without the menu flag, compiles everything before the first frame)',
		'\tlet menuFlag = false;',
		"\ttry { menuFlag = sessionStorage.getItem( MENU_FLAG ) === '1'; } catch ( e ) { /* no session storage */ }",
		'\tconst deferCompile = ! /[?&]bench(?![A-Za-z0-9_])/.test( location.search ) && ( ! /[?&](nomenu|bg)(?![A-Za-z0-9_])/.test( location.search ) || menuFlag );',
		'\tapp.init( ( p, text, until ) => {',
		'',
		'\t\tsetStage( text );',
		'\t\tui.setLoading( p, text, until );',
		'',
		'\t}, { deferCompile } ).then( async () => {' ) },
	{ file: 'src/main.js', anchor: lines(
		"\t\tsetStage( 'main menu' );",
		'\t\tapp.menu = new MainMenu( { ui, app } );' ),
	replace: lines(
		"\t\tsetStage( 'main menu' );",
		'\t\tconst chip = app.compiled ? compileChip( app.compiled ) : null;',
		'\t\tapp.menu = new MainMenu( { ui, app } );' ) },
	{ file: 'src/main.js', anchor: lines(
		"\t\t\tsetStage( 'starting the session' );",
		'\t\t\tapp.startSession( choice );' ),
	replace: lines(
		"\t\t\tsetStage( 'starting the session' );",
		'\t\t\tapp.startSession( choice );',
		'\t\t\tif ( chip ) chip();',
		'\t\t\tif ( app.compiled ) await firstView( app );' ) },
	// The six sky -> cube face kernels differed only in the face number written into their source: six compiles of the
	// heavy sky + clouds shader. The face comes from a one-word buffer per kernel now: one source, one pipeline
	// (engine/gpu/Compute.js shares it), six bind groups.
	{ file: 'src/sky/Environment.js', anchor: "\t\t\t\tbindings: { outCube: { storageTexture: this.source, viewDimension: '2d-array' } },",
		replace: lines(
			'\t\t\t\tbindings: {',
			"\t\t\t\t\toutCube: { storageTexture: this.source, viewDimension: '2d-array' },",
			"\t\t\t\t\tenvFace: { storage: new StorageBuffer( { label: 'envFace' + i, count: 1, type: 'u32', data: new Uint32Array( [ i ] ) } ), access: 'read' },",
			'\t\t\t\t},' ) },
	{ file: 'src/sky/Environment.js', anchor: '\tlet dir = envCubeDir( ${ i }u, gid.x, gid.y, ${ size }u );',
		replace: '\tlet dir = envCubeDir( envFace[ 0 ], gid.x, gid.y, ${ size }u );' },
	{ file: 'src/sky/Environment.js', anchor: '\ttextureStore( outCube, gid.xy, ${ i }, vec4f( skyRadianceWithClouds( dir, false ), 1.0 ) );',
		replace: '\ttextureStore( outCube, gid.xy, envFace[ 0 ], vec4f( skyRadianceWithClouds( dir, false ), 1.0 ) );' },
	// A-CLASS 5.4: the sand the swash has just left is a mirror film (the sky in it at the water's edge), and the foam left on
	// the sand is lace, not a pale wash over the whole wet band (its floor was 30 % everywhere the residue reached)
	{ file: 'src/world/Terrain.js', anchor: '\t\trough = mix( rough, mix( mix( 0.45, 0.2, band * band ), 0.14, wet ), wetK );',
		replace: '\t\trough = mix( rough, mix( mix( 0.45, 0.18, band * band ), 0.07, wet ), wetK ); // (wave 25A: a mirror film where fresh)' },
	{ file: 'src/world/Terrain.js', anchor: '.x ) * 0.7 + 0.3; }',
		replace: '.x ) * 0.9 + 0.1; } // (wave 25A: lace, not a wash)' },
	// the wave's test joins npm test (next to the shadow test)
	{ file: 'package.json', anchor: 'node test/visuals-shadows.mjs &&', replace: 'node test/visuals-shadows.mjs && node test/w25a-boot-shadows.mjs &&' },
	// A-CLASS 1.3: no motion blur while the opening glide drives the camera (src/post/MotionBlur.js setScripted eases it)
	{ file: 'src/world/start/Intro.js', anchor: lines(
		'\t\tthis.pending = false;',
		'\t\tthis.active = true;',
		'\t\tthis.time = 0;',
		'\t\tconst input = this.app.input;' ),
	replace: lines(
		'\t\tthis.pending = false;',
		'\t\tthis.active = true;',
		'\t\tthis.time = 0;',
		'\t\tthis.app.post?.setCameraScripted?.( true ); // (the lanterns by the lens smeared into streaks: no blur on the glide)',
		'\t\tconst input = this.app.input;' ) },
	{ file: 'src/world/start/Intro.js', anchor: lines(
		'\t\tthis.active = false;',
		'\t\tthis.pending = false;',
		"\t\tif ( typeof window !== 'undefined' ) {" ),
	replace: lines(
		'\t\tthis.active = false;',
		'\t\tthis.pending = false;',
		'\t\tthis.app.post?.setCameraScripted?.( false );',
		"\t\tif ( typeof window !== 'undefined' ) {" ) },
];

const once = ( s, a ) => s.indexOf( a ) >= 0 && s.indexOf( a ) === s.lastIndexOf( a );

export function apply( root, { check = false } = {} ) {

	const files = new Map(), report = [];
	for ( const p0 of PATCHES ) {

		const path = join( root, p0.file );
		if ( ! files.has( path ) ) files.set( path, readFileSync( path, 'utf8' ) );
		const s = files.get( path );
		const eol = s.includes( CRLF ) ? CRLF : NL;
		const p = { ...p0, anchor: p0.anchor.split( NL ).join( eol ), replace: p0.replace.split( NL ).join( eol ) };
		if ( s.includes( p.replace ) ) { report.push( [ p.file, 'already applied' ] ); continue; }
		if ( ! once( s, p.anchor ) ) { report.push( [ p.file, 'ANCHOR NOT FOUND ONCE: ' + p.anchor.slice( 0, 60 ) ] ); continue; }
		files.set( path, s.replace( p.anchor, () => p.replace ) );
		report.push( [ p.file, 'ok' ] );

	}

	if ( ! check ) for ( const [ path, s ] of files ) writeFileSync( path, s );
	return report;

}

if ( process.argv[ 1 ] && resolve( process.argv[ 1 ] ) === fileURLToPath( import.meta.url ) ) {

	const root = resolve( process.argv.slice( 2 ).find( ( a ) => ! a.startsWith( '--' ) ) || join( import.meta.dirname, '..', '..' ) );
	const r = apply( root, { check: process.argv.includes( '--check' ) } );
	for ( const [ f, m ] of r ) console.log( m.padEnd( 16 ), f );
	process.exit( r.some( ( x ) => x[ 1 ].startsWith( 'ANCHOR' ) ) ? 1 : 0 );

}
