// Root patches for wave 25E (vehicles that look real; the realistic helicopter). Each patch is an exact anchor (found
// once) and its replacement.
//   node tools/helicopter/apply-patches.mjs [rootDir] [--check]
// rootDir defaults to the repo; --check only reports whether every anchor is found exactly once (nothing written).
// Root owns these files (App.js, package.json) or another worker does (src/ui: 25B): run it at integration time.
// Line ends follow each file (CRLF or LF).
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NL = String.fromCharCode( 10 ), CRLF = String.fromCharCode( 13, 10 );
const lines = ( ...a ) => a.join( NL );

export const PATCHES = [
	// the player's own avatar in the driver's / pilot's seat, both views (the vehicle says so: showsDriver; behind the
	// first-person eye the cars / helicopter fold its head away: src/features/cars/SeatedBody.js)
	{ file: 'src/App.js', anchor: "this.avatar.visible = this.freeCam || ( ! this.features?.get?.( 'cars' )?.hidesDriver?.() && ( p.mode === 'boat' ? p.camMode === 'third' : p.view === 'third' ) );",
		replace: "this.avatar.visible = this.freeCam || ( p.mode === 'plane' && !! p.vehicle?.showsDriver?.() ) || ( ! this.features?.get?.( 'cars' )?.hidesDriver?.() && ( p.mode === 'boat' ? p.camMode === 'third' : p.view === 'third' ) );" },
	// its hands on the wheel / collective / cyclic, its feet on the pedals (vehicle.ikTargets: world points)
	{ file: 'src/App.js', anchor: "this.avatar.setIKTargets( contactTargets( this._ikTargets || ( this._ikTargets = {} ), { player: p, rod: this.game && this.game.rod, boat: this.boatCtl, action: pose.action } ) );",
		replace: "this.avatar.setIKTargets( ( p.mode === 'plane' && p.vehicle?.ikTargets?.( this._vehicleIK || ( this._vehicleIK = {} ) ) ) || contactTargets( this._ikTargets || ( this._ikTargets = {} ), { player: p, rod: this.game && this.game.rod, boat: this.boatCtl, action: pose.action } ) );" },
	// the car's live mirrors: their rear view, after the main scene (nothing unless you drive in the first person; desktop)
	{ file: 'src/App.js', anchor: "\t\tthis.sceneRenderer.render();",
		replace: lines( "\t\tthis.sceneRenderer.render();", "\t\tthis.features?.get?.( 'cars' )?.renderMirrors?.( this.engine.meshRenderer, this.scene ); // (wave 25E: the car mirrors' rear view)" ) },
	// the flight-envelope test
	{ file: 'package.json', anchor: 'node test/feature-cars.mjs &&', replace: 'node test/feature-cars.mjs && node test/feature-helicopter-flight.mjs &&' },
	// touch: the helicopter's buttons name both models' meaning (realistic: the collective lever, the pedals, level)
	{ file: 'src/ui/TouchControls.js', anchor: "\theliRise: { label: 'Rise', code: 'ShiftLeft', hold: true },", replace: "\theliRise: { label: 'Rise / collective +', code: 'ShiftLeft', hold: true }," },
	{ file: 'src/ui/TouchControls.js', anchor: "\theliDescend: { label: 'Descend', code: 'KeyC', hold: true },", replace: "\theliDescend: { label: 'Descend / collective -', code: 'KeyC', hold: true }," },
	{ file: 'src/ui/TouchControls.js', anchor: "\theliHover: { label: 'Hover / brake', code: 'Space', hold: true },", replace: "\theliHover: { label: 'Hover / level', code: 'Space', hold: true }," },
	{ file: 'src/ui/TouchControls.js', anchor: "\theliLeft: { label: 'Slide left', code: 'Comma', hold: true },", replace: "\theliLeft: { label: 'Slide / yaw left', code: 'Comma', hold: true }," },
	{ file: 'src/ui/TouchControls.js', anchor: "\theliRight: { label: 'Slide right', code: 'Period', hold: true },", replace: "\theliRight: { label: 'Slide / yaw right', code: 'Period', hold: true }," },
	// settings: the helicopter's assisted flight for new pilots (realistic by default; K in the cockpit does the same)
	{ file: 'src/ui/AppUI.js', anchor: "\t\tview.addToggle( { label: t( 'set.reduce_boat_motion', 'Reduce boat motion' ), object: s, key: 'reduceMotion', tooltip: t( 'set.reduce_boat_motion.tip', 'Steadier boat cameras (less roll and pitch at the helm) and no camera shake on strikes.' ), onChange: ( v ) => a11y.set( 'reduceMotion', v ) } );",
		replace: lines( "\t\tview.addToggle( { label: t( 'set.reduce_boat_motion', 'Reduce boat motion' ), object: s, key: 'reduceMotion', tooltip: t( 'set.reduce_boat_motion.tip', 'Steadier boat cameras (less roll and pitch at the helm) and no camera shake on strikes.' ), onChange: ( v ) => a11y.set( 'reduceMotion', v ) } );",
			"\t\t// wave 25E: the rescue helicopter flies realistically unless the player asks for the assisted hover",
			"\t\ts.helicopterAssist = !! app.settings.helicopterAssist;",
			"\t\tview.addToggle( { label: t( 'set.heli_assist', 'Helicopter flight assist' ), object: s, key: 'helicopterAssist', tooltip: t( 'set.heli_assist.tip', 'The helicopter holds its own hover and levels itself (no torque, no vortex ring, no flips). Off: realistic flight with the collective, cyclic and pedals. K in the cockpit switches too.' ), onChange: ( v ) => { app.settings.helicopterAssist = v; app.features?.get?.( 'helicopter' )?.setAssist?.( v ); } } );" ) },
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
