// Focused integration of native panel geometry/material, real flight systems and input.
// Canvas/DOM are recording stand-ins: this proves interaction/state, not WebGPU pixels.
import assert from 'node:assert/strict';
import { Scene, Vector3, PerspectiveCamera, Ray } from '../src/engine/index.js';
import { Features } from '../src/features/Features.js';
import { Colliders } from '../src/world/Colliders.js';
import { Player } from '../src/player/Player.js';
import { LocalLights } from '../src/materials/LocalLights.js';
import { Helicopter } from '../src/features/helicopter/Helicopter.js';
import { FACE, TEX, SWITCHES, OVERHEAD, panelSnapshot, drawPanel, drawOverhead, rayPanel, hitControl, hitOverhead } from '../src/features/helicopter/Cockpit.js';
import { interiorTriangles } from '../src/features/cars/CarInterior.js';
import { FUEL } from '../src/features/helicopter/Systems.js';
import { parseGLB } from '../src/engine/loaders/GLTF.js';
import { readFileSync } from 'node:fs';
const cockpitLoader = () => { const f = readFileSync( new URL( '../public/models/helicopter/cockpit.glb', import.meta.url ) ); return parseGLB( f.buffer.slice( f.byteOffset, f.byteOffset + f.byteLength ) ); };
import { sanitizeState } from '../src/net/Protocol.js';
import { Input } from '../src/core/Input.js';

let checks = 0;
function check( condition, label ) { assert.ok( condition, label ); console.log( 'ok', label ); checks ++; }
const words = [], canvasCalls = [];
const ctx = new Proxy( {}, { get( target, key ) { if ( key === 'fillText' ) return ( text, ...numbers ) => { words.push( String( text ) ); canvasCalls.push( numbers ); }; if ( key === 'getImageData' ) return undefined; return target[ key ] || ( ( ...args ) => canvasCalls.push( args.filter( a => typeof a === 'number' ) ) ); }, set( target, key, value ) { target[ key ] = value; return true; } } );
class El {
	constructor( tag ) { this.tagName = tag; this.style = {}; this.attrs = {}; this.listeners = {}; this.children = []; this.hidden = false; this.textContent = ''; }
	setAttribute( k, v ) { this.attrs[ k ] = v; }
	append( ...nodes ) { this.children.push( ...nodes ); }
	remove() { this.removed = true; }
	addEventListener( kind, handler ) { ( this.listeners[ kind ] ||= [] ).push( handler ); }
	click() { for ( const f of this.listeners.click || [] ) f( { stopPropagation() {} } ); }
	getContext() { return this.tagName === 'canvas' ? ctx : null; }
}
const windowListeners = new Map();
globalThis.window = { addEventListener( key, f ) { windowListeners.set( key, f ); }, removeEventListener( key ) { windowListeners.delete( key ); } };
const documentListeners = new Map(); let pointerReleases = 0;
globalThis.document = { createElement: tag => new El( tag ), body: new El( 'body' ), pointerLockElement: null,
	addEventListener( key, fn ) { if ( ! documentListeners.has( key ) ) documentListeners.set( key, new Set() ); documentListeners.get( key ).add( fn ); },
	removeEventListener( key, fn ) { documentListeners.get( key )?.delete( fn ); },
	exitPointerLock() { this.pointerLockElement = null; pointerReleases ++; for ( const fn of documentListeners.get( 'pointerlockchange' ) || [] ) fn(); },
};
function world( opts = {} ) {
	const terrain = { heightAt: () => 1, normalAt: ( x, z, out ) => out.set( 0, 1, 0 ) }, colliders = new Colliders();
	const input = new Input( new El( 'canvas' ) ); input.locked = true;
	const query = { allocate: () => 0, setPoint() {}, cpuValid: false, cpu: new Float32Array( 16 ), resultInputs: new Float32Array( 16 ), version: 0 };
	const camera = new PerspectiveCamera( 60, 1.6, .1, 5000 ), player = new Player( { terrain, colliders, input, query, camera, boat: null } );
	let writes = 0; const messages = [], app = { scene: new Scene(), terrainData: terrain, colliders, input, query, camera, player, localLights: new LocalLights(), game: { toast: s => messages.push( s ), state: { save() { writes ++; } } } };
	const features = new Features( app ), h = new Helicopter( app, features, opts ); features.list.set( 'helicopter', { instance: h } ); for ( const l of h.lights ) app.localLights.add( l );
	const tick = () => { player.update( 1 / 60 ); features.update( 1 / 60 ); input.pressed.clear(); };
	const run = ( seconds, keys = [] ) => { input.keys = new Set( keys ); for ( let i = 0; i < seconds * 60; i ++ ) tick(); input.keys.clear(); };
	player.position.copy( h.flight.toWorld( [ 1.35, 0, .65 ] ) );
	return { app, features, h, player, input, camera, tick, run, messages, writes: () => writes };
}
const w = world(), { app, features, h, player, input, camera, tick, run } = w, f = h.flight, sys = h.systems;
check( h.board() && sys.starting > 0 && ! f.engineOn, 'boarding auto-cranks the actual turbine rather than instantly enabling flight' );
run( .5 ); check( f.starter && f.rpm > .04 && f.rpm < .22 && f.grounded && h.audio.state.cranking && h.audio.state.gain > 0, 'starter turns real rotors slowly without lift and drives the actual cranking audio state' );
run( 4 ); check( sys.running && f.engineOn && f.rpm > .9 && f.grounded, 'starter completes and turbine/rotor spool to operating speed on pad' );
const beforeStop = f.rpm, beforeAudio = h.audio.state.gain;
check( h.act( 'engine' ) && ! f.engineOn, 'panel engine switch shuts down a stationary grounded turbine' );
run( .5 ); check( f.rpm > .3 && f.rpm < beforeStop && h.audio.state.gain > 0 && h.audio.state.gain < beforeAudio && ! h.audio.state.cranking && ! f.engineOn, 'shutdown produces rotor and audio coast instead of resetting RPM' );
input.pressed.add( 'KeyO' ); tick(); check( sys.starting > 0, 'O key starts the same turbine used by the physical panel' );
run( 4 );
check( h.act( 'master' ) && ! sys.master && ! f.engineOn && h.lights.every( l => ! l.enabled ), 'avionics switch cuts turbine power and actual lighting on ground' );
check( ! h.act( 'engine' ) && ! sys.starting, 'a cold start without battery power is refused' );
words.length = 0; h.cockpit.draw();
check( words.includes( 'BATTERY / AVIONICS OFF' ) && words.includes( 'TURBINE' ) && words.includes( 'AVIONICS' ), 'dark displays retain readable engraved controls and power guidance' );
h.act( 'master' ); h.act( 'engine' ); run( 4 );
for ( const id of [ 'landing', 'search', 'cabin' ] ) h.act( id );
check( sys.lightsMask === 15 && h.lights.length === 5 && h.lights.every( l => l.enabled ), 'navigation, landing, aimed search and cabin switches enable five real native light sources' );
f.yaw = .7; f.quaternion.setFromAxisAngle( new Vector3( 0, 1, 0 ), .7 ); sys.syncLights();
check( h.lights.every( l => l.position.distanceTo( f.toWorld( l.local ) ) < 1e-8 && ( ! l.dir || Math.abs( l.dir.length() - 1 ) < 1e-8 ) ), 'illumination sources and cones follow aircraft translation and rotation' );
const search = h.lights.find( l => l.switchId === 'search' ), priorDirection = search.dirL.clone(); sys.aim( new Vector3( .8, - .8, 1 ).normalize().applyQuaternion( f.quaternion ) ); sys.syncLights();
check( search.dirL.distanceTo( priorDirection ) > .3 && search.dir.y < -.1 && search.cosInner > search.cosOuter && search.range > 100, 'search switch drives a steerable physical spotlight with finite cone and range' );
const packet = sanitizeState( h.decorateState( { p: [ 0, 1, 0 ], yaw: 0, mode: 'walk' } ) );
check( packet.helicopter.lights === 15, 'all four lighting bits survive the actual shared protocol sanitizer' );
run( 7, [ 'ShiftLeft' ] ); check( f.position.y > h.homeY + 20 && ! f.grounded, 'existing Shift collective still performs vertical takeoff with the new starter' );
check( ! h.act( 'engine' ) && ! h.act( 'master' ) && sys.running && sys.master, 'airborne turbine shutdown and battery cutoff are safely refused' );
run( 2 ); check( h.act( 'hold' ) && sys.hold, 'Y/panel hover hold captures real airborne position and altitude' );
const target = sys.hold.clone(); f.position.x += 3; f.position.y += 2; f.velocity.x = 2; run( 18 );
check( f.position.distanceTo( target ) < .15, 'hover controller corrects displaced aircraft to its captured position and altitude' );
run( .1, [ 'KeyW' ] ); check( ! sys.hold && f.controls.forward === 1, 'manual cyclic input releases hover hold immediately' ); run( 3, [ 'Space' ] );
document.pointerLockElement = input.dom;
const releasesBeforeTray = pointerReleases;
input.pressed.add( 'Digit3' ); tick(); check( h.isOpen() && features.panelOpen() && h.blocked() && ! h.blocked( true ) && ! input.locked, '3 opens the systems tray through native feature modal/mouse conventions' );
check( typeof input.unlock === 'undefined' && pointerReleases === releasesBeforeTray + 1 && document.pointerLockElement === null && input.releases > 0, 'real Input contract releases captured pointer through document.exitPointerLock and native pointerlockchange' );
input.keys = new Set( [ 'KeyW', 'ShiftLeft' ] ); input.pressed.add( 'KeyN' ); const nav = sys.nav; tick(); input.keys.clear();
check( f.controls.forward === 0 && f.controls.lift === 0 && f.controls.brake && sys.nav === nav, 'modal tray suppresses flight movement and unrelated cockpit keyboard actions' );
const landingButton = h.cockpit.buttons.get( 'landing' ).el, landingBefore = sys.landing; landingButton.click();
check( sys.landing !== landingBefore && landingButton.attrs[ 'aria-pressed' ] === String( sys.landing ), 'touch-accessible tray button changes the same live landing lamp and accessible state' );
h.cockpit.buttons.get( 'panel' ).el.click(); check( ! features.panelOpen(), 'resume button closes native modal state and restores flight controls' );
// Aim the real camera at the physical nav control; use model/world transform and actual LMB edge.
player.setView( 'first' ); input.locked = true; tick();
const navControl = SWITCHES.find( b => b.id === 'nav' ), u = ( navControl.x + navControl.w / 2 ) / TEX.w, v = ( navControl.y + navControl.h / 2 ) / TEX.h;
const localPoint = FACE.C.clone().addScaledVector( FACE.R, ( u - .5 ) * FACE.w ).addScaledVector( FACE.U, ( .5 - v ) * FACE.h );
camera.position.copy( f.toWorld( h.vehicle.eye ) ); camera.lookAt( f.toWorld( localPoint ) );
const hit = h.cockpit.aim(); check( hit?.id === 'nav', 'actual seated camera ray hits the correct in-world switch with tilted face coordinates' );
const navBeforeClick = sys.nav; input.mouseDown = true; h.cockpit.update( .12 ); h.cockpit.update( .12 ); input.mouseDown = false; h.cockpit.update( .12 );
check( sys.nav !== navBeforeClick, 'physical cockpit LMB invokes its real switch exactly once while held' );
check( ! rayPanel( new Vector3( 0, 1.32, 2.5 ), new Vector3( 0, 0, - 1 ) ) && ! rayPanel( new Vector3( 4, 1.32, .5 ), new Vector3( 0, 0, 1 ) ), 'panel ray rejects backface and outside-face clicks' );
check( SWITCHES.every( b => hitControl( b.x + b.w / 2, b.y + b.h / 2 ) === b ), 'all eight physical switch regions map to their real action IDs' );
const snap = panelSnapshot( h );
check( [ 'speed', 'altitude', 'agl', 'vs', 'heading', 'pitch', 'bank', 'rpm', 'hp' ].every( k => Number.isFinite( snap[ k ] ) ) && snap.speed === Math.hypot( f.velocity.x, f.velocity.z ) * 3.6 && snap.vs === f.velocity.y && snap.hp === h.hp, 'panel instruments read true ground speed, altitude, AGL, VSI, heading, attitude, RPM and hull' );
words.length = 0; drawPanel( ctx, snap );
check( [ 'AIRSPEED', 'ALT  m', 'TURN COORDINATOR', 'VERT SPEED', 'ROTOR  Nr', 'TRQ %', 'TOT °C', 'FUEL', 'CAUTION', 'SYSTEMS NORMAL', 'AIRFRAME 100%' ].every( word => words.includes( word ) ) && canvasCalls.flat().every( Number.isFinite ), 'live canvas: the six-pack, engine gauges, caution panel and map draw with no invalid coordinates' );
words.length = 0; drawOverhead( ctx, snap ); check( OVERHEAD.every( b => words.includes( b.label ) ) && OVERHEAD.every( b => hitOverhead( ( b.x + b.w / 2 ) / 768, ( b.y + b.h / 2 ) / 320 ) === b ), 'overhead console draws every switch and maps its regions to their actions' );
check( h.cockpit.mesh.parent === h.visual.root && h.cockpit.material.surface.includes( 'textureSample(heliPanel' ) && h.cockpit.tex.width === 1536 && h.cockpit.tex.usageList.includes( 'render' ), 'native model panel uses actual sampled texture surface and WebGPU-compatible upload usage' );
check( FACE.C.y + FACE.U.y * FACE.h / 2 < h.vehicle.eye[ 1 ] - .2, 'panel upper edge stays below the pilot eye with clear forward visibility' );
// Visibility must account for the REAL opaque airframe/control triangles. A bare
// rayPanel hit alone cannot detect a fuselage bulging between the pilot and panel.
h.visual.setPose( f.position, f.quaternion ); h.visual.root.updateMatrixWorld( true );
const panelEye = f.toWorld( h.vehicle.eye ), triangles = [], canopyTriangles = [];
h.visual.root.traverse( mesh => {
	if ( ! mesh.geometry || mesh === h.cockpit.mesh || ! mesh.visible ) return;
	const geometry = mesh.geometry, positions = geometry.attributes.position.array, indices = geometry.index?.array || Array.from( { length: positions.length / 3 }, ( _, i ) => i );
	const target = mesh.material?.transparent ? canopyTriangles : triangles;
	for ( let i = 0; i < indices.length; i += 3 ) target.push( { name: mesh.name, vertices: [ 0, 1, 2 ].map( n => { const j = indices[ i + n ] * 3; return new Vector3( positions[ j ], positions[ j + 1 ], positions[ j + 2 ] ).applyMatrix4( mesh.matrixWorld ); } ) } );
} );
const occluded = [], glassOccluded = [], outsideView = [], inspectionCamera = new PerspectiveCamera( 60, 1.6, .1, 5000 ); inspectionCamera.position.copy( panelEye ); inspectionCamera.lookAt( f.toWorld( FACE.C ) ); inspectionCamera.updateMatrixWorld( true );
for ( let row = 0; row <= 8; row ++ ) for ( let col = 0; col <= 16; col ++ ) {
	const u = .01 + col / 16 * .98, v = .01 + row / 8 * .98;
	const local = FACE.C.clone().addScaledVector( FACE.R, ( u - .5 ) * FACE.w ).addScaledVector( FACE.U, ( .5 - v ) * FACE.h ), target = f.toWorld( local ), distance = target.distanceTo( panelEye );
	const ray = new Ray( panelEye, target.clone().sub( panelEye ).normalize() );
	for ( const triangle of triangles ) { const hit = ray.intersectTriangle( ...triangle.vertices, false, new Vector3() ); if ( hit && hit.distanceTo( panelEye ) < distance - .005 ) { occluded.push( { u, v, mesh: triangle.name } ); break; } }
	for ( const triangle of canopyTriangles ) { const hit = ray.intersectTriangle( ...triangle.vertices, false, new Vector3() ); if ( hit && hit.distanceTo( panelEye ) < distance - .005 ) { glassOccluded.push( { u, v, mesh: triangle.name } ); break; } }
	const ndc = target.clone().project( inspectionCamera ); if ( Math.abs( ndc.x ) > .98 || Math.abs( ndc.y ) > .98 ) outsideView.push( { u, v, x: ndc.x, y: ndc.y } );
}
check( occluded.length === 0, '153 samples over the entire panel and switch row are unobstructed by actual opaque hull/control triangles: ' + JSON.stringify( occluded.slice( 0, 5 ) ) );
check( glassOccluded.length === 0, '153 panel and switch samples have no transparent canopy surface between eye and instruments: ' + JSON.stringify( glassOccluded.slice( 0, 5 ) ) );
check( outsideView.length === 0, 'entire instrument face and all switches fit a normal 60° seated view with modest down-look: ' + JSON.stringify( outsideView.slice( 0, 5 ) ) );
const forwardRay = new Ray( panelEye, new Vector3( 0, 0, 1 ).applyQuaternion( f.quaternion ) );
check( ! triangles.some( t => { const hit = forwardRay.intersectTriangle( ...t.vertices, false, new Vector3() ); return hit && hit.distanceTo( panelEye ) < 3; } ), 'real opaque hull leaves a clear straight-ahead horizon from relocated seated eye' );
const footwellStart = f.toWorld( [ .75, 1.4, 1.25 ] ), floorRay = new Ray( footwellStart, new Vector3( 0, - 1, 0 ).applyQuaternion( f.quaternion ) ); let floorDistance = Infinity;
for ( const t of triangles ) { const hit = floorRay.intersectTriangle( ...t.vertices, false, new Vector3() ); if ( hit ) floorDistance = Math.min( floorDistance, hit.distanceTo( footwellStart ) ); }
check( Math.abs( floorDistance - ( 1.4 - .795 ) ) < .002, 'actual modeled flat footwell covers the low belly and stays below pedal mounts' );
Object.assign( f.controls, { forward: .8, strafe: -.6, lift: .7, yaw: .5 } ); h.visual.spin( .1, f.rpm, f );
check( h.visual.cyclic.rotation.x > .1 && h.visual.cyclic.rotation.z > .1 && h.visual.collective.rotation.x < -.2 && h.visual.pedals[ 0 ].position.z !== h.visual.pedals[ 1 ].position.z, 'actual cyclic, collective and anti-torque pedal meshes animate from command inputs' );
h.hp = 41; sys.update( .1, { hp: h.hp, piloted: true } ); check( sys.warnings.includes( 'HULL DAMAGE' ), 'airframe damage produces an actual persistent caution' );
h.act( 'ack' ); check( ! sys.flashing && sys.warnings.includes( 'HULL DAMAGE' ), 'warning acknowledgement suppresses flashing without hiding the real fault' );
f.velocity.y = - 5; f.agl = 10; sys.update( .1, { hp: h.hp, piloted: true } ); check( sys.warnings.includes( 'SINK RATE' ), 'unsafe near-ground descent triggers the actual sink-rate warning' );
const saved = h.toJSON(), newWorld = world(), restored = newWorld.h; restored.fromJSON( saved );
check( restored.systems.nav === sys.nav && restored.systems.landing === sys.landing && restored.systems.search === sys.search && restored.systems.cabin === sys.cabin && restored.hp === 41 && ! restored.systems.running && ! restored.flight.engineOn && ! restored.systems.hold, 'save roundtrip retains real switch selections and hull while restoring cold without stale hover target' );
restored.fromJSON( { hp: 90, pose: [ restored.home.x, restored.home.y, restored.home.z, 0 ] } );
check( restored.systems.master && restored.systems.nav && ! restored.systems.search && ! restored.flight.engineOn, 'old saves without systems data restore backward-compatible safe defaults' );
const writes = newWorld.writes(); restored.reset(); check( newWorld.writes() === writes && ! restored.piloted && ! restored.systems.starting && ! restored.systems.running && ! restored.cockpit.open, 'reset remains silent and clears electrical/engine/modal transient states without saving' );
h.updateRemote( [ { id: 'remote-heli', helicopter: { p: [ 50, 10, 60 ], q: [ 0, 0, 0, 1 ], rpm: 0, lights: 5 } } ] );
const remote = h.remote.peers.get( 'remote-heli' ).visual; const rotation = remote.mainRotor.rotation.y; h.remote.update( .5 );
check( remote.lamps.filter( l => l.mesh.visible ).every( l => l.bit === 1 || l.bit === 4 ) && remote.lamps.filter( l => l.mesh.visible ).length === 3 && remote.mainRotor.rotation.y === rotation, 'remote light bitmask affects visible lamps while a cold parked remote rotor remains still' );
check( app.localLights.sources.length === 5, 'remote appearance adds no per-peer physical point lights' );
h.act( 'panel' ); app.menuOpen = true; const landing = sys.landing; h.cockpit.update( .12 );
check( ! h.cockpit.open && ! h.act( 'landing' ) && sys.landing === landing && h.cockpit.tip.hidden, 'opening a menu suppresses cockpit tray/tooltips and refuses panel side effects' );
app.menuOpen = false;
// ---- wave 24A: the modelled cabin, its controls, the pilot, the overhead console, fuel, rotor shadow, rain
{
	const m = world( { cockpitLoader } ), H = m.h, P = m.player;
	check( H.board() && H.cockpit._wanted(), 'boarding asks for the modelled cabin' );
	m.run( .2 ); await H.cockpit.ready; m.run( .1 );
	const it = H.cockpit.interior;
	check( it && it.group.parent === H.visual.root && ! H.visual.simple.visible && [ 'Cyclic', 'Collective', 'Pedal_L', 'Pedal_R', 'Screen_Overhead' ].every( n => it.nodes.get( n ) ), 'the cabin GLB loads into the aircraft with its controls and overhead console; the simple seats give way' );
	const tris = interiorTriangles( it ), eyeL = new Vector3( ...H.vehicle.eye ), blockedBy = [];
	for ( let row = 0; row <= 8; row ++ ) for ( let col = 0; col <= 16; col ++ ) {
		const u = .01 + col / 16 * .98, v = .01 + row / 8 * .98, target = FACE.C.clone().addScaledVector( FACE.R, ( u - .5 ) * FACE.w ).addScaledVector( FACE.U, ( .5 - v ) * FACE.h );
		const ray = new Ray( eyeL, target.clone().sub( eyeL ).normalize() ), d = target.distanceTo( eyeL );
		for ( const t of tris ) { const hit = ray.intersectTriangle( ...t.v, false, new Vector3() ); if ( hit && hit.distanceTo( eyeL ) < d - .005 ) { blockedBy.push( [ u, v, t.name ] ); break; } }
	}
	check( blockedBy.length === 0, 'the modelled cabin (glareshield, cheeks, controls, the gloves) hides none of the 153 panel samples: ' + JSON.stringify( blockedBy.slice( 0, 4 ) ) );
	const fwd = new Ray( eyeL, new Vector3( 0, 0, 1 ) );
	check( ! tris.some( t => { const hit = fwd.intersectTriangle( ...t.v, false, new Vector3() ); return hit && hit.distanceTo( eyeL ) < 3; } ), 'the cabin keeps the straight-ahead view clear' );
	m.run( 4 );
	Object.assign( H.flight.controls, { forward: .7, strafe: - .5, lift: .6, yaw: .8 } ); H.visual.spin( .05, H.flight.rpm, H.flight ); P.setView( 'first' ); H.cockpit.update( .016 );
	check( it.nodes.get( 'Cyclic' ).quaternion.angleTo( H.visual.cyclic.quaternion ) < 1e-6 && it.nodes.get( 'Collective' ).quaternion.angleTo( H.visual.collective.quaternion ) < 1e-6 && Math.abs( it.nodes.get( 'Pedal_L' ).position.z - H.visual.pedals[ 1 ].position.z ) < 1e-6, 'the modelled cyclic, collective and pedals take the commanded poses' );
	const wrist = it.point( 'Wrist_R' ), arm = H.cockpit.limbs[ 1 ];
	check( arm.end.distanceTo( wrist ) < .002 && H.cockpit.limbSet.mesh.visible, 'the pilot\'s right forearm reaches the glove on the cyclic in the first person' );
	P.setView( 'third' ); H.cockpit.update( .016 ); check( H.cockpit.body.every( b => ! b.visible ), 'the pilot\'s limbs hide in the chase view (the avatar is hidden aboard)' ); P.setView( 'first' );
	// the overhead console by eye: the fuel pump toggle
	const fuelBtn = OVERHEAD.find( b => b.id === 'fuel' ), om = it.screens.overhead, pts = om.geometry.attributes.position, uvs = om.geometry.attributes.uv;
	const corner = ( u, v ) => { let best = 0; for ( let i = 1; i < pts.count; i ++ ) if ( Math.hypot( uvs.getX( i ) - u, uvs.getY( i ) - v ) < Math.hypot( uvs.getX( best ) - u, uvs.getY( best ) - v ) ) best = i; return new Vector3().fromBufferAttribute( pts, best ); };
	const fu = ( fuelBtn.x + fuelBtn.w / 2 ) / 768, fv = ( fuelBtn.y + fuelBtn.h / 2 ) / 320;
	const local = corner( 0, 0 ).lerp( corner( 1, 0 ), fu ).lerp( corner( 0, 1 ).lerp( corner( 1, 1 ), fu ), fv );
	om.updateWorldMatrix( true, false ); const target = local.clone().applyMatrix4( om.matrixWorld );
	m.camera.position.copy( H.flight.toWorld( H.vehicle.eye ) ); m.camera.lookAt( target ); m.camera.updateMatrixWorld();
	const aimed = H.cockpit.aim();
	check( aimed?.id === 'fuel' && aimed.overhead, 'looking up at the overhead console aims at its fuel pump switch' );
	H.flight.velocity.set( 0, 0, 0 ); H.flight.place( H.home.x, H.homeY, H.home.z, 0 ); H.systems.stop( true ); m.run( .1 );
	check( H.act( 'fuel' ) && ! H.systems.fuelPump && ! H.systems.start( H.hp ).ok, 'on the ground the overhead fuel pump switch starves the turbine and blocks a start' );
	H.act( 'fuel' ); check( H.systems.fuelPump && H.systems.start( H.hp ).ok, 'pump back on: the starter engages' ); m.run( 4 );
	const f0 = H.systems.fuel; m.run( 6, [ 'ShiftLeft', 'KeyW' ] );
	check( ! H.flight.grounded && H.systems.fuel < f0 && H.systems.fuel >= FUEL.reserve && panelSnapshot( H ).fuel === H.systems.fuel, 'the turbine burns fuel in flight; the gauge reads it' );
	check( ! H.act( 'fuel' ) && H.systems.fuelPump, 'the fuel pump cannot be cut in the air' );
	H.systems.fuel = 0.1; H.systems.update( .01, { piloted: true, hp: H.hp } ); check( H.systems.warnings.includes( 'LOW FUEL' ), 'low fuel is a caution' );
	H.flight.place( H.home.x, H.homeY, H.home.z, 0 ); H.systems.stop( true ); H.flight.rpm = 0; const low = H.systems.fuel; m.run( 3 );
	check( H.systems.fuel > low + 0.05, 'landed on the helipad with the turbine stopped, the tank refuels' );
	const fuelSave = H.toJSON(); const w3 = world(); w3.h.fromJSON( fuelSave ); check( Math.abs( w3.h.systems.fuel - H.systems.fuel ) < 0.002 && w3.h.systems.fuelPump === H.systems.fuelPump, 'fuel and the pump switch survive the save' ); w3.h.dispose();
	// the rotor's shadow: the hub, mast and a blade reach the cabin materials
	H.systems.start( H.hp ); m.run( 3 ); H.cockpit.update( .016 );
	const mat = [ ...it.materials.values() ].find( x => x.uniforms.rotorHub );
	check( mat && mat.uniforms.rotorAxis.value.w > 5 && Math.abs( mat.uniforms.rotorAxis.value.y ) > .9 && Math.abs( new Vector3( mat.uniforms.rotorBlade.value.x, mat.uniforms.rotorBlade.value.y, mat.uniforms.rotorBlade.value.z ).length() - 1 ) < 1e-5 && mat.output.includes( 'rotorCover' ) && H.cockpit.material.uniforms.rotorHub.value.y > 3, 'the spinning rotor\'s blade shadows feed the cabin and panel shaders' );
	H.cockpit.rainOverride = .8; H.cockpit.update( .016 ); check( H.visual.glass.uniforms.rain.value === .8, 'rain reaches the canopy glass shader' );
	H.flight.velocity.set( 0, 0, 0 ); H.systems.stop( true ); m.run( 4 ); H.exit(); P.position.set( H.flight.position.x + 40, H.flight.position.y, H.flight.position.z ); m.run( 6 );
	check( ! H.cockpit.interior && H.visual.simple.visible, 'walking away from the aircraft releases the modelled cabin' );
	H.dispose();
}
const tray = h.cockpit.tray, tip = h.cockpit.tip;
h.dispose(); restored.dispose();
check( tray.removed && tip.removed && app.scene.children.length === 0 && app.localLights.sources.length === 0, 'dispose removes instrument geometry, owned light sources, DOM panels and aircraft' );
console.log( `${ checks } helicopter cockpit checks passed. Headless interaction/state evidence; rendered panel readability and sound require browser acceptance.` );
