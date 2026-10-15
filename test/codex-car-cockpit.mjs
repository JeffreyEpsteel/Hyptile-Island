// Local cockpit integration (wave 24A): production Cars/physics/systems, the real modelled interior GLBs read from disk,
// picking through the real screen meshes, synthetic input + canvas/DOM; no GPU/browser.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Features } from '../src/features/Features.js';
import { Cars } from '../src/features/cars/Cars.js';
import { KINDS } from '../src/features/cars/CarData.js';
import { CarCockpit, PANEL, CABIN_STYLES } from '../src/features/cars/CarCockpit.js';
import { CONTROLS, controlsFor, hitControl, drawInstruments, CLUSTER_KINDS } from '../src/features/cars/CarInstruments.js';
import { REGIONS, interiorTriangles, rayScreens } from '../src/features/cars/CarInterior.js';
import { WorldMap } from '../src/ui/WorldMap.js';
import { carPanelSnapshot, systemsOf, FUEL, TEMP } from '../src/features/cars/CarSystems.js';
import { Group, PerspectiveCamera, Vector3, Quaternion, Ray } from '../src/engine/index.js';
import { parseGLB } from '../src/engine/loaders/GLTF.js';

let checks = 0;
const check = ( result, name ) => { assert.ok( result, name ); checks ++; console.log( 'ok', name ); };
const DT = 1 / 60;
const events = () => ( { listeners: new Map(), addEventListener( n, fn ) { this.listeners.set( n, fn ); }, removeEventListener( n, fn ) { if ( this.listeners.get( n ) === fn ) this.listeners.delete( n ); } } );
const labels = [];
const ctx = new Proxy( { fillText: text => labels.push( String( text ) ) }, { get: ( obj, key ) => key in obj ? obj[ key ] : () => {} } );
const canvas = { width: PANEL.w, height: PANEL.h, getContext: () => ctx };
const GLB = new Map();
const loader = kind => {

	if ( ! GLB.has( kind ) ) { const f = readFileSync( new URL( `../public/models/cars/interior-${ kind }.glb`, import.meta.url ) ); GLB.set( kind, parseGLB( f.buffer.slice( f.byteOffset, f.byteOffset + f.byteLength ) ) ); }
	return GLB.get( kind );

};

class Element {

	constructor() { Object.assign( this, events() ); this.children = []; this.attributes = {}; this.dataset = {}; this.queries = new Map(); this.classes = new Set(); this.classList = { add: x => this.classes.add( x ), remove: x => this.classes.delete( x ), toggle: ( x, on ) => on ? this.classes.add( x ) : this.classes.delete( x ) }; }
	append( el ) { this.children.push( el ); el.parent = this; }
	remove() { if ( this.parent ) this.parent.children = this.parent.children.filter( c => c !== this ); }
	setAttribute( k, v ) { this.attributes[ k ] = v; }
	focus() { document.activeElement = this; }
	querySelector( selector ) {

		if ( ! this.queries.has( selector ) ) { const el = new Element(); const match = /data-car-control="(\w+)"/.exec( selector ); if ( match ) el.dataset.carControl = match[ 1 ]; if ( selector === 'button' ) el.dataset.carControl = 'engine'; this.queries.set( selector, el ); }
		return this.queries.get( selector );

	}
	closest() { return this; }

}
const savedDoc = globalThis.document, savedWindow = globalThis.window;
globalThis.window = events();
globalThis.document = Object.assign( events(), { head: new Element(), createElement: () => new Element(), getElementById: id => document.head.children.find( el => el.id === id ), exitPointerLock() { this.pointerLockElement = null; this.releases = ( this.releases || 0 ) + 1; } } );

function fixture( kind = 'sedan', visual = false ) {

	const held = new Set(), pressed = new Set(), root = new Element(), scene = new Group();
	const player = { view: 'first', mode: 'walk', position: new Vector3(), enterVehicle( v ) { this.vehicle = v; this.mode = 'plane'; }, exitVehicle( x, y, z, yaw, mode ) { this.vehicle = null; this.mode = mode; this.position.set( x, y, z ); } };
	const lights = [];
	const app = { mode: 'campaign', scene, player, camera: new PerspectiveCamera( 60, 16 / 9, 0.1, 2000 ), settings: { timeOfDay: 12 },
		input: { enabled: true, locked: true, sensitivity: 1, down: c => held.has( c ), hit: c => pressed.has( c ) },
		localLights: { add: l => lights.push( l ), remove: l => lights.splice( lights.indexOf( l ), 1 ), sources: lights },
		ui: { ui: { root, hud: root } }, game: { state: { money: 0 }, toast() {} } };
	const features = new Features( app );
	const cars = features.add( 'cars', { install: ( a, f ) => new Cars( a, f, { render: false, scale: 0, terrain: { heightAt: () => 0 }, roadHeight: () => 0, flatRoads: true, traffic: { cars: 0, buses: 0, police: 0, fill: 0 } } ) } );
	if ( visual ) { cars.cockpit.dispose(); cars.cockpit = new CarCockpit( cars, { visual: true, canvas, loader } ); }
	const r = cars._record( kind, { x: 0, y: 0, z: 0, yaw: 0, state: 'idle' } ); r.own = true; cars.records.push( r );
	const step = ( n = 1 ) => { for ( let i = 0; i < n; i ++ ) { cars.update( DT ); pressed.clear(); } };
	const press = code => { pressed.add( code ); step(); };
	return { app, cars, features, r, held, step, press, root, lights };

}

// a point at the middle of a screen's rectangle (uv 0..1) in car-local space
function screenPoint( it, key, u = 0.5, v = 0.5 ) {

	const m = it.screens[ key ], p = m.geometry.attributes.position, uv = m.geometry.attributes.uv;
	// bilinear over the quad's corners by their uvs
	const c = [ 0, 1, 2, 3 ].map( i => ( { p: new Vector3().fromBufferAttribute( p, i ), u: uv.getX( i ), v: uv.getY( i ) } ) );
	const pick = ( uu, vv ) => c.reduce( ( a, b ) => Math.hypot( b.u - uu, b.v - vv ) < Math.hypot( a.u - uu, a.v - vv ) ? b : a ).p;
	const tl = pick( 0, 0 ), tr = pick( 1, 0 ), br = pick( 1, 1 ), bl = pick( 0, 1 );
	const top = tl.clone().lerp( tr, u ), bottom = bl.clone().lerp( br, u ), out = top.lerp( bottom, v );
	m.updateWorldMatrix( true, false );
	it.group.updateWorldMatrix( true, false );
	return it.group.worldToLocal( out.applyMatrix4( m.matrixWorld ) );

}

function occluded( tris, eye, target ) {

	const ray = new Ray( eye, target.clone().sub( eye ).normalize() ), dist = target.distanceTo( eye ), hit = new Vector3();
	for ( const t of tris ) { const h = ray.intersectTriangle( ...t.v, false, hit ); if ( h && h.distanceTo( eye ) < dist - 0.004 ) return t.name; }
	return null;

}

try {

	const shapes = new Set(), layouts = new Set();
	for ( const kind of Object.keys( KINDS ) ) {

		const trace = [], draw = new Proxy( {}, { get: ( _, key ) => ( ...args ) => { if ( [ 'arc', 'fillRect', 'strokeRect', 'moveTo', 'lineTo' ].includes( key ) ) trace.push( [ key, ...args ] ); } } );
		const f = fixture( kind );
		drawInstruments( draw, { ...carPanelSnapshot( f.cars ), name: 'same', kind, engineOn: true } ); layouts.add( JSON.stringify( trace.filter( t => true ) ) );
		f.cars.dispose();

	}
	check( CLUSTER_KINDS.length === 7 && layouts.size === 7, 'all seven instrument clusters draw different layouts beyond labels and colours' );

	for ( const [ kind, spec ] of Object.entries( KINDS ) ) {

		const w = fixture( kind, true ), { cars, r, app } = w;
		app.camera.position.set( 0, 50, 0 );
		check( cars.enter( r ).ok, kind + ': boarding works' );
		await cars.cockpit.ready; w.step();
		const cp = cars.cockpit, it = cp.interior;
		check( it && cp.interiorKind === kind && r.cockpitDetailed && app.scene.children.includes( cp.group ), kind + ': the modelled interior GLB loads into one local cabin' );
		check( cp.group.userData.cabinStyle === CABIN_STYLES[ kind ].id, kind + ': its own cabin style' );
		const tri = interiorTriangles( it );
		shapes.add( tri.length + ':' + [ ...it.materials.keys() ].sort().join( ',' ) );
		for ( const n of [ 'Wheel', 'Pedal_Gas', 'Pedal_Brake', 'Gear', 'Stalk_Ind', 'Stalk_Wiper', 'Wiper_A', 'Wiper_B', 'RainGlass', 'DomeLens' ] ) assert.ok( it.nodes.get( n ), kind + ' has ' + n );
		check( it.screens.cluster && it.screens.stack && ( [ 'taxi', 'police', 'bus' ].includes( kind ) ? !! it.screens.aux : true ), kind + ': wheel, pedals, selector, stalks, wipers, rain glass, dome and the live displays are authored nodes' );
		check( tri.length < 40000 && it.materials.size <= 30, kind + ': interior budget (' + tri.length + ' triangles, ' + it.materials.size + ' materials)' );
		const eye = new Vector3( ...spec.eye );
		check( it.eye && it.eye.distanceTo( eye ) < 0.01, kind + ': the GLB is authored round the KINDS eye' );
		// the road ahead: nothing opaque in front of the eye
		check( ! occluded( tri, eye, eye.clone().add( new Vector3( 0, - 0.03, 3 ) ) ), kind + ': clear forward sightline through the windscreen' );
		// the cluster: its middle band is visible from the eye (through or over the wheel, with the driver's hands on it)
		const blocked = [];
		for ( const u of [ 0.25, 0.5, 0.75 ] ) for ( const v of [ 0.35, 0.5 ] ) { const o = occluded( tri, eye, screenPoint( it, 'cluster', u, v ) ); if ( o ) blocked.push( [ u, v, o ] ); }
		check( blocked.length <= 1, kind + ': the instrument cluster reads from the driver\'s eye: ' + JSON.stringify( blocked ) );
		// every switch of the stack: an eye ray to its centre lands on it, nothing opaque in the way
		const R = REGIONS.stack;
		for ( const c of controlsFor( kind ) ) {

			const target = screenPoint( it, 'stack', ( c.x + c.w / 2 ) / R.w, ( c.y + c.h / 2 ) / R.h );
			const h = rayScreens( it, eye, target.clone().sub( eye ).normalize() );
			assert.ok( h && h.screen === 'stack' && hitControl( 'stack', h.u, h.v, kind )?.id === c.id, kind + ' eye ray reaches ' + c.id );
			assert.ok( ! occluded( tri, eye, target ), kind + ' nothing hides ' + c.id + ': ' + occluded( tri, eye, target ) );

		}
		check( true, kind + ': every stack switch is reachable and unobstructed from the eye (' + controlsFor( kind ).length + ')' );
		// look at the horn and click with the real camera ray
		const horn = controlsFor( kind ).find( c => c.id === 'horn' ), ht = screenPoint( it, 'stack', ( horn.x + horn.w / 2 ) / R.w, ( horn.y + horn.h / 2 ) / R.h );
		app.camera.position.copy( eye ); app.camera.lookAt( ht ); app.camera.updateMatrixWorld(); app.input.mouseDown = true; cp.update( DT );
		check( cp.hover === 'horn' && cars._hornPulse > 0, kind + ': gaze + mouse press on the stack sounds the horn' );
		app.input.mouseDown = false; cp.update( DT );
		// steering: the wheel turns about its column with the rack, the hands ride it and the forearms reach them
		w.held.add( 'KeyA' ); w.step( 20 ); w.held.clear();
		const q = new Quaternion().copy( cp.wheel.userData.q0 ).invert().multiply( cp.wheel.quaternion ), ang = 2 * Math.atan2( q.z, q.w );
		check( Math.abs( r.body.steer ) > 0.05 && Math.abs( Math.abs( ang ) - Math.abs( r.body.steer ) * ( kind === 'bus' ? 5.5 : kind === 'sports' ? 2.1 : kind === 'pickup' ? 3 : kind === 'van' ? 3.2 : kind === 'police' ? 2.5 : 2.6 ) ) < 1e-3 && Math.abs( q.x ) + Math.abs( q.y ) < 1e-6, kind + ': steering wheel turns about its own column with the rack' );
		const wrist = it.point( 'Wrist_L' ), arm = cp.limbs[ 0 ].lower; arm.updateWorldMatrix( true, false );
		const tip = new Vector3( 0, 1, 0 ).applyMatrix4( arm.matrixWorld ); it.group.worldToLocal( tip );
		check( tip.distanceTo( wrist ) < 0.002 && arm.visible, kind + ': the driver\'s forearm follows the glove on the turning rim' );
		// pedals and the selector
		w.held.add( 'KeyW' ); w.step( 10 );
		const gas = it.nodes.get( 'Pedal_Gas' ), dq = new Quaternion().copy( gas.userData.q0 ).invert().multiply( gas.quaternion );
		check( dq.x > 0.04, kind + ': the throttle pedal goes down with W' ); w.held.clear();
		cars.cockpitAct( 'park' ); w.step( 240 ); const gq = it.nodes.get( 'Gear' ).quaternion.clone(); cars.cockpitAct( 'park' ); w.held.add( 'KeyW' ); w.step( 30 ); w.held.clear();
		check( gq.angleTo( it.nodes.get( 'Gear' ).quaternion ) > 0.1, kind + ': the selector moves from P to D' );
		const tex = cp.tex, version = tex.version, geo = tri.length && it.geometries[ 0 ]; let released = 0; geo.addEventListener( 'dispose', () => released ++ );
		r.body.vx = r.body.vz = 0;
		check( cars.exit() && ! cp.group && ! r.cockpitDetailed && app.player.mode === 'walk' && released === 1, kind + ': getting out disposes the interior' );
		void version;
		cars.enter( r ); w.step(); check( !! cp.group && app.scene.children.filter( c => c.name === 'car-local-cockpit' ).length === 1, kind + ': reboarding builds exactly one interior (cached GLB)' );
		cars.dispose();

	}
	check( shapes.size === 7, 'the seven interiors are different models' );

	// ---- systems: indicators, wipers, fuel, temperature, dome, the taxi meter, the bus doors, the police light bar
	{

		const w = fixture( 'sedan', true ), { cars, r, held, step, press, app } = w;
		cars.enter( r ); await cars.cockpit.ready; step();
		const s = systemsOf( r );
		press( 'Comma' ); check( s.ind === 'L', ', sets the left indicator' );
		const t0 = cars.audio.state.ticks; step( 120 ); check( cars.audio.state.ticks - t0 >= 4 && carPanelSnapshot( cars ).ind === 'L', 'the indicator relay ticks while it blinks' );
		held.add( 'KeyW' ); held.add( 'KeyA' ); step( 60 ); held.delete( 'KeyA' ); step( 90 ); held.clear();
		check( s.ind === null, 'the indicator cancels itself when the wheel comes back from the turn' );
		cars.cockpitAct( 'hazard' ); step( 60 ); check( s.hazard && carPanelSnapshot( cars ).hazard, 'hazards blink both sides' ); cars.cockpitAct( 'hazard' );
		const rig = cars.cockpit.rainRig, wiper = rig.wipers[ 0 ].node;
		cars.cockpit.rainOverride = 0; step( 120 ); const parked = wiper.quaternion.clone();
		check( s.wipe === 0 && ! s.wipeSpeed, 'auto wipers stay parked in the dry' );
		cars.cockpit.rainOverride = 0.7; const w0 = cars.audio.state.wipes; step( 30 );
		check( s.wipeSpeed === 2 && wiper.quaternion.angleTo( parked ) > 0.3 && cars.cockpit.interior.rainMesh.visible, 'auto wipers sweep fast in heavy rain, the drops show on the glass' );
		step( 120 ); check( cars.audio.state.wipes > w0, 'the wiper motor sounds at each end of the sweep' );
		const u = cars.cockpit.interior.rainMesh.material.uniforms;
		check( u.glassUp.value.w === 0.7 && u.params.value.x > 0 && Math.abs( u.wipeA.value.w - ( Math.PI / 2 - s.wipe * 1.55 ) ) < 1e-6, 'the rain shader gets the rain, the sweep speed and the blade angle' );
		cars.cockpit.rainOverride = 0; cars.cockpitAct( 'wipers' ); check( s.wipers === 'on', 'the wiper switch cycles auto -> on' ); step( 30 ); check( s.wipeSpeed === 1, 'wipers on run in the dry' );
		cars.cockpitAct( 'wipers' ); cars.cockpitAct( 'wipers' ); step( 200 ); check( s.wipers === 'off' && s.wipe === 0, 'wipers off park' );
		cars.cockpitAct( 'wipers' );
		const f0 = r.fuel, temp0 = s.temp; held.add( 'KeyW' ); step( 600 ); held.clear();
		check( r.fuel < f0 && r.fuel >= FUEL.reserve && s.temp > temp0 + 5 && carPanelSnapshot( cars ).fuel === r.fuel, 'fuel drains and the coolant warms with the engine; the gauges read them' );
		r.fuel = 0.051; held.add( 'KeyW' ); step( 300 ); held.clear(); check( r.fuel >= FUEL.reserve, 'the tank never runs below its reserve (no stranding)' );
		s.temp = 60; r.engineOn = true; step( 60 * 30 ); check( Math.abs( s.temp - TEMP.run ) < 12, 'the coolant settles near its running temperature' );
		app.settings.timeOfDay = 22; cars.cockpitAct( 'dome' ); step();
		check( s.dome && cars.cockpit.lights[ 0 ].enabled && cars.cockpit.lights[ 0 ].intensity > 1 && w.lights.includes( cars.cockpit.lights[ 0 ] ), 'the cabin lamp switch lights a real local light' );
		cars.cockpitAct( 'dome' ); step(); check( cars.cockpit.lights[ 0 ].intensity < 0.5, 'off it falls back to the faint night dash glow' );
		app.settings.timeOfDay = 12;
		const saved = JSON.parse( JSON.stringify( cars.toJSON() ) ); const load = fixture(); load.cars.fromJSON( saved );
		check( Math.abs( load.cars.owned()[ 0 ].fuel - r.fuel ) < 0.01, 'your car\'s fuel survives the save' ); load.cars.dispose();
		const clicks = cars.audio.state.clicks; cars.cockpitAct( 'lights' ); check( cars.audio.state.clicks === clicks + 1, 'a switch clicks' );
		const doors = cars.audio.state.doors; r.body.vx = r.body.vz = 0; cars.exit(); check( cars.audio.state.doors === doors + 1, 'the door thuds shut behind you' );
		cars.dispose();

	}
	{

		const t = fixture( 'taxi', true ); t.cars.enter( t.r ); await t.cars.cockpit.ready; t.step();
		check( t.cars.cockpitAct( 'meter' ).ok && systemsOf( t.r ).meter.on, 'the taxi meter starts' );
		t.held.add( 'KeyW' ); t.step( 300 ); t.held.clear();
		const m = systemsOf( t.r ).meter;
		check( m.dist > 30 && m.fare > 3.2 && carPanelSnapshot( t.cars ).meter.fare === m.fare, 'the fare runs with the distance' );
		labels.length = 0; drawInstruments( ctx, carPanelSnapshot( t.cars ) ); check( labels.some( l => l.startsWith( '$ ' ) ) && labels.includes( 'HIRED' ), 'the fare meter display shows the fare' );
		t.cars.dispose();
		const b = fixture( 'bus', true ); b.cars.enter( b.r ); await b.cars.cockpit.ready; b.step();
		check( b.cars.cockpitAct( 'doors' ).ok && systemsOf( b.r ).doors, 'the bus doors open when stopped' );
		b.held.add( 'KeyW' ); b.step( 120 ); check( Math.abs( b.r.body.speed ) < 0.2, 'a bus will not pull away with its doors open' );
		b.cars.cockpitAct( 'doors' ); b.step( 120 ); b.held.clear(); check( Math.abs( b.r.body.speed ) > 1 && ! b.cars.cockpitAct( 'doors' ).ok, 'doors shut, it drives; they stay shut while moving' );
		b.cars.dispose();
		const p = fixture( 'police', true ); p.cars.enter( p.r ); await p.cars.cockpit.ready; p.step();
		p.cars.cockpitAct( 'siren' ); p.step(); check( p.cars.siren && p.cars.audio.state.siren, 'police: the light bar / siren switch drives the real siren and beacons' );
		labels.length = 0; drawInstruments( ctx, carPanelSnapshot( p.cars ) ); check( labels.includes( 'CODE 3' ) && labels.some( l => l.startsWith( 'MERIDIAN PD' ) ), 'the laptop and the cluster show the code 3 status' );
		p.cars.dispose();

	}
	// ---- standing next to a parked car loads its interior (look in through the glass); walking away unloads it
	{

		const w = fixture( 'sports', true ), { cars, r, app, step } = w;
		app.player.position.set( 0, 0, 20 ); step( 30 ); check( ! cars.cockpit.interior, 'far from the car: only the cheap instanced cabin' );
		app.player.position.set( 1.8, 0, 0 ); step( 30 ); await cars.cockpit.ready; step( 2 );
		check( cars.cockpit.interior && cars.cockpit.record === r && r.cockpitDetailed && ! cars.cockpit.body.some( m => m.visible ), 'beside it: its interior loads, empty of a driver' );
		app.player.position.set( 0, 0, 30 ); step( 30 ); check( ! cars.cockpit.interior && ! r.cockpitDetailed, 'walking away unloads it' );
		cars.dispose();

	}

	// ---- the accessible tray, the blocked states, the engine, save, locks (unchanged behaviour)
	const w = fixture(), { cars, r, app, held, press, step } = w; cars.enter( r );
	press( 'Digit3' ); check( cars.isOpen() && cars.cockpit.el?.attributes[ 'aria-label' ] === 'Car dashboard controls', '3 opens accessible dashboard panel' );
	document.pointerLockElement = {}; cars.cockpit.close(); cars.cockpit.open(); check( ! document.pointerLockElement && document.releases > 0, 'controls panel releases pointer capture' );
	held.add( 'KeyW' ); step( 60 ); check( r.body.speed === 0, 'open dashboard blocks drive input' ); held.clear();
	const engineButton = new Element(); engineButton.dataset.carControl = 'engine'; cars.cockpit._onButton( { target: engineButton } );
	check( r.engineOn === false, 'accessible engine button invokes real engine switch' );
	const grid = cars.cockpit.el.querySelector( '.car-driver-grid' ); cars.cockpit._dom();
	check( grid.innerHTML.includes( 'aria-pressed="false"' ) && grid.innerHTML.includes( 'Engine start / stop' ) && grid.innerHTML.includes( 'Wipers' ) && grid.innerHTML.includes( 'Indicator left' ), 'accessible buttons expose every switch with its state' );
	let stopped = 0, prevented = 0;
	for ( const code of [ 'Tab', 'Space', 'Enter' ] ) document.listeners.get( 'keydown' )( { code, stopPropagation() { stopped ++; }, preventDefault() { prevented ++; } } );
	check( stopped === 3 && prevented === 0, 'native Tab focus and Space/Enter button activation bypass game key prevention' );
	const escape = { code: 'Escape', preventDefault() {}, stopPropagation() {} }; document.listeners.get( 'keydown' )( escape ); check( ! cars.isOpen() && ! document.listeners.has( 'keydown' ), 'Escape closes controls and unregisters handler' );
	cars.cockpit.open(); const focused = document.activeElement, beforeMap = r.engineOn;
	const map = { isOpen: false, feature: {}, _canOpen: () => true, open() { this.isOpen = true; } };
	w.features.add( 'map-fixture', { install: () => ( { isOpen: () => map.isOpen } ) } );
	const keyEvent = code => ( { code, preventDefault() { this.prevented = true; }, stopPropagation() {}, stopImmediatePropagation() {} } );
	WorldMap.prototype.key.call( map, keyEvent( 'KeyM' ) );
	check( map.isOpen && document.activeElement === focused, 'real M dispatch opens map while old dashboard button retains focus' );
	const enter = keyEvent( 'Enter' ); WorldMap.prototype.key.call( map, enter ); cars.cockpit._onKey( enter );
	cars.cockpit._onButton( { target: focused } );
	check( enter.prevented && ! cars.cockpit.isOpen && r.engineOn === beforeMap && ! cars.cockpitAct( 'engine' ).ok, 'map overlay closes tray and prevents stale focused-button and public-API engine activation' );
	map.isOpen = false;
	for ( const [ owner, key ] of [ [ app.ui.ui, 'helpOpen' ], [ app.ui.ui, 'panelOpen' ], [ app.ui.ui, 'photoMode' ], [ app.game.hud = {}, 'invOpen' ] ] ) {

		cars.cockpit.open(); owner[ key ] = true; cars.cockpit.update( DT );
		check( ! cars.cockpit.isOpen && ! cars.cockpitAct( 'horn' ).ok, key + ': external UI blocks dashboard controls and closes tray' ); owner[ key ] = false;

	}
	held.add( 'KeyW' ); step( 90 ); check( r.body.speed === 0 && ! cars.audio.state.on && carPanelSnapshot( cars ).rpm === 0, 'engine off disables drive, sound and RPM' );
	held.clear(); held.add( 'KeyS' ); step( 60 ); check( r.body.speed === 0, 'engine off refuses powered reverse' );
	r.body.vz = - 6; step( 120 ); check( Math.abs( r.body.speed ) < 0.4, 'engine off service brake still stops backward motion' ); held.clear();
	check( cars.cockpitAct( 'engine' ).ok && r.engineOn, 'stopped car engine restarts' );
	held.add( 'KeyW' ); step( 180 ); held.clear();
	const s = carPanelSnapshot( cars ); check( s.speed > 35 && s.rpm > 780 && /^D[1-6]$/.test( s.gear ) && Math.abs( s.rpm / 6500 - cars.audio.state.rpm ) < 1e-9, 'live speed, automatic gear and RPM match physics and engine audio' );
	check( ! cars.cockpitAct( 'engine' ).ok && r.engineOn, 'engine toggle safely refused while moving' );
	cars.cockpitAct( 'park' ); step( 240 ); check( Math.abs( r.body.speed ) < 0.4 && r.parkBrake && carPanelSnapshot( cars ).gear === 'P', 'parking brake stops and holds actual car' );
	cars.cockpitAct( 'park' ); held.add( 'KeyS' ); step( 60 ); held.clear(); check( r.body.speed < - 1 && carPanelSnapshot( cars ).gear === 'R', 'S produces powered reverse and real R indication' );
	r.body.place( 0, 0, 0, 0 );
	cars.lightsOn = null; app.settings.timeOfDay = 12; cars._lightsUpdate( false ); cars.cockpitAct( 'lights' ); cars._lightsUpdate( false );
	check( r.lights && cars.lights.every( l => l.enabled ), 'headlight button enables actual world spotlights' );
	cars.cockpitAct( 'horn' ); step(); check( cars.audio.state.horn, 'horn pulse reaches audio' ); step( 30 ); check( ! cars.audio.state.horn, 'horn pulse releases without a stuck key' );
	cars.cockpitAct( 'engine' ); cars.cockpitAct( 'horn' ); step(); check( cars.audio.state.horn && ! cars.audio.state.on, 'horn still works with engine stopped' );
	r.parkBrake = true;
	const saved = JSON.parse( JSON.stringify( cars.toJSON() ) ), loaded = fixture(); loaded.cars.fromJSON( saved );
	check( loaded.cars.owned().length === 1 && loaded.cars.owned()[ 0 ].engineOn === false && loaded.cars.owned()[ 0 ].parkBrake === true, 'owned-car engine and parking brake survive save round trip' );
	delete saved.owned[ 0 ].engineOn; delete saved.owned[ 0 ].parkBrake; delete saved.owned[ 0 ].fuel; loaded.cars.fromJSON( saved );
	check( loaded.cars.owned()[ 0 ].engineOn && ! loaded.cars.owned()[ 0 ].parkBrake, 'legacy saves keep original ready-to-drive defaults' ); loaded.cars.dispose();
	app.paused = true; check( ! cars.cockpitAct( 'engine' ).ok, 'paused dashboard actions refused' ); app.paused = false;
	const remote = cars._record( 'sedan', { state: 'remote' } ); cars.exit( { force: true } ); check( ! cars.enter( remote ).ok && ! cars.cockpitAct( 'engine' ).ok, 'another player car stays locked and out-of-car switches do nothing' );
	cars.enter( r ); press( 'Digit3' ); app.player.mode = 'walk'; app.player.vehicle = null; step(); check( ! cars.drive && ! cars.isOpen(), 'external respawn clears cockpit and modal' );
	cars.dispose(); check( ! window.listeners.has( 'mousemove' ) && ! document.listeners.has( 'keydown' ), 'feature disposal removes pointer and keyboard listeners' );
	check( CONTROLS.every( c => c.screen === 'stack' ) && hitControl( 'cluster', 0.5, 0.5 ) === null, 'switches live on the stack; the cluster is read-only' );
	labels.length = 0; drawInstruments( ctx, { ...s, kind: 'sedan', lightMode: 'AUTO', hp: 37 } );
	check( labels.includes( 'km/h' ) && labels.includes( s.gear ) && labels.includes( 'CONDITION 37%' ) && labels.includes( 'WIPERS' ), 'instrument artwork includes live units, gear, condition and the switches' );

} finally {

	globalThis.document = savedDoc; globalThis.window = savedWindow;

}
console.log( `${ checks } car cockpit checks passed` );
