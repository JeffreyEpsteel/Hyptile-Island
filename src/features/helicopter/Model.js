// Authored light utility helicopter: bubble cockpit, panel, cabin, tail boom,
// four main blades, tail rotor, skid gear and rescue paint. Uses native engine materials.
import { Group, Mesh, Vector2, Vector3, BufferGeometry, BufferAttribute } from '../../engine/index.js';
import { standard } from '../../materials/Materials.js';
import { prepare, mergePrepared, box, roundedBox, cylinder, sphere, rod, torus, mat4 } from '../../world/boat/GeoKit.js';
import { createPropMaterial } from '../../game/GameMaterials.js';
import { LAYERS } from '../../core/SceneRenderer.js';
import { loadGLB } from '../../engine/loaders/GLTF.js';
import { ShaderModule } from '../../engine/gpu/Shader.js';
import { commonModule } from '../../engine/render/wgsl/common.js';

const V = ( x, y, z ) => new Vector3( x, y, z );
const EXTERIOR = { cache: null }; // the exterior GLB, parsed once for every aircraft (remote ones too)
export const PEDAL_Z = 0.85;
// rain on the glass (wave 25E): two jittered layers of beads (sizes and spacing vary, so no dotted grid), at rest sliding
// slowly down the glass with gravity; with airspeed they run back over the canopy as streaks with tails, faster and
// longer the faster you fly. Coordinates are the glass's own surface in metres (objScale turns the bubble's unit-sphere
// position into metres): across the flow and along it. A fresnel rim of reflection so the bubble reads as glass.
const canopyRain = new ShaderModule( {
	name: 'heliCanopyRain',
	deps: [ commonModule ],
	code: /* wgsl */`
// one layer of drops in ( across, along ) metres: cell size, how far a drop moved (m), how stretched (0 beads .. 1 streaks)
fn heliDrops( q: vec2f, cell: f32, slide: f32, stretch: f32, rain: f32, seed: f32 ) -> vec4f {
	let g = vec2f( q.x / cell, q.y / cell );
	let col = floor( g.x );
	// each column slides at its own pace (drops do not march in step)
	let sp = 0.6 + 0.8 * hash21( vec2f( col, seed ) );
	let gy = g.y + slide * sp / cell;
	let c = vec2f( col, floor( gy ) );
	let f = vec2f( fract( g.x ), fract( gy ) );
	let h = hash22( c + vec2f( seed, seed * 1.7 ) );
	let present = step( 1.0 - rain * 0.75, h.x );
	let o = vec2f( 0.2 + 0.6 * hash21( c + vec2f( 3.1, seed ) ), 0.25 + 0.5 * h.y );
	let r = 0.13 + 0.17 * hash21( c + vec2f( seed, 9.7 ) );
	// the bead: an ellipse drawn out along the flow; the streak's tail trails behind it
	let d = ( f - o ) * vec2f( 1.0, 1.0 / ( 1.0 + stretch * 3.0 ) );
	let bead = 1.0 - smoothstep( r * 0.65, r, length( d ) );
	let behind = clamp( ( o.y - f.y ) / max( o.y, 0.05 ), 0.0, 1.0 );
	let tail = ( 1.0 - smoothstep( r * 0.18, r * 0.35, abs( f.x - o.x ) ) ) * step( f.y, o.y ) * ( 1.0 - behind ) * stretch;
	let rim = smoothstep( r * 0.35, r, length( d ) ) * bead;
	let spark = ( 1.0 - smoothstep( 0.0, r * 0.3, length( f - o - vec2f( - r * 0.3, r * 0.35 ) ) ) ) * bead;
	return vec4f( max( bead, tail * 0.7 ) * present, rim * present, spark * present, tail * present );
}
`,
} );
const CANOPY = /* wgsl */`
	let vdn = abs( dot( normalize( in.V ), s.normal ) );
	let fres = pow( 1.0 - vdn, 4.0 );
	s.alpha = clamp( s.alpha + fres * 0.45, 0.0, 0.85 );
	if ( mat.rain > 0.01 ) {
		let P = in.vs.vObj * mat.objScale + mat.objOffset; // (model metres)
		// at rest: across = round the vertical axis, along = down the glass; in flight: across = round the long axis,
		// along = up and back from the nose (the airflow over a moving bubble)
		let rest = vec2f( atan2( P.x, P.z - 0.72 ) * 1.1, - P.y );
		let flow = vec2f( atan2( P.x, P.y - 0.3 ) * 1.1, ( P.y - P.z ) * 0.71 ); // (up the screen and back over the roof)
		let st = mat.streak;
		let slideRest = frame.time * 0.012;
		let slideFlow = frame.time * ( 0.4 + 3.0 * st );
		let a = heliDrops( rest, 0.034, slideRest, 0.0, mat.rain, 1.0 ) + heliDrops( rest + vec2f( 0.011, 0.017 ), 0.021, slideRest * 1.6, 0.0, mat.rain * 0.8, 5.0 );
		let b = heliDrops( flow, 0.03, slideFlow, st, mat.rain, 2.0 ) + heliDrops( flow + vec2f( 0.013, 0.0 ), 0.019, slideFlow * 1.3, st, mat.rain * 0.8, 7.0 );
		let k = smoothstep( 0.05, 0.35, st );
		let dr = clamp( mix( a, b, k ), vec4f( 0.0 ), vec4f( 1.0 ) );
		let drop = dr.x; let rim = dr.y; let spark = dr.z;
		s.alpha = max( s.alpha, drop * ( 0.38 + rim * 0.42 ) );
		s.albedo = mix( s.albedo, vec3f( 0.26, 0.3, 0.34 ) * ( 1.0 - rim * 0.6 ), drop );
		s.roughness = mix( s.roughness, 0.02, drop );
		s.emissive += vec3f( spark * 0.6 * ( 1.0 - frame.night * 0.7 ) );
	}
`;

// the glazing below the bubble: an elliptic band up to the bubble's rim (y 1.12 .. 1.7) round the nose and back past
// the doors (their windows), and the chin windows under the panel down to the floor
function canopySkirt() {
	const pos = [], nrm = [], uv = [], idx = [];
	const band = ( a0, a1, N, rows ) => {
		const base = pos.length / 3;
		for ( let i = 0; i <= N; i ++ ) {
			const t = a0 + ( a1 - a0 ) * i / N, x = Math.cos( t ) * 1.13, z = Math.sin( t ) * 1.62;
			for ( const [ y, k ] of rows ) { pos.push( x * k, y, 0.72 + z * k ); nrm.push( Math.cos( t ), 0, Math.sin( t ) * 0.7 ); uv.push( i / N, y ); }
			if ( i ) { const b = base + ( i - 1 ) * 2; idx.push( b, b + 2, b + 1, b + 1, b + 2, b + 3 ); }
		}
	};
	band( - 0.72, Math.PI + 0.72, 36, [ [ 1.12, 0.93 ], [ 1.7, 1 ] ] );
	band( Math.PI / 2 - 0.62, Math.PI / 2 + 0.62, 14, [ [ 0.66, 0.86 ], [ 1.12, 0.93 ] ] );
	const g = new BufferGeometry();
	g.setAttribute( 'position', new BufferAttribute( new Float32Array( pos ), 3 ) );
	g.setAttribute( 'normal', new BufferAttribute( new Float32Array( nrm ), 3 ) );
	g.setAttribute( 'uv', new BufferAttribute( new Float32Array( uv ), 2 ) );
	g.setIndex( idx ); g.computeBoundingBox(); g.computeBoundingSphere();
	return g;
}
export class HelicopterVisual {

	constructor( scene ) {
		this.scene = scene; this.root = new Group(); this.root.name = 'coastal-rescue-helicopter';
		this.geometries = []; this.materials = []; this.meshes = [];
		const solid = createPropMaterial( 'helicopter-rescue-paint' ); this.materials.push( solid );
		const parts = [], simple = [];
		const add = ( g, color, matrix = null, metal = 0, rough = 0.45 ) => parts.push( prepare( g, { color, matrix, metal, rough } ) );
		// the primitive shell (wave 21): drawn until the modelled exterior (public/models/helicopter/exterior.glb,
		// tools/helicopter/build_exterior.py) has loaded, and in headless tests
		const shell = [], addS = ( g, color, matrix = null, metal = 0, rough = 0.45 ) => shell.push( prepare( g, { color, matrix, metal, rough } ) );
		const jade = 0x157d79, cream = 0xf6e8bd, black = 0x18272c, metal = 0x667980, rescue = 0xe67232;
		// A low belly and an aft engine pod leave a real open cabin volume. A full
		// ellipsoid through the seats used to occlude the lower instrument face.
		addS( sphere( 1, 24, 14 ), jade, mat4( 0, 0.48, 0.2, 0, 0, 0, 1.15, 0.25, 2.1 ) );
		addS( sphere( 1, 20, 12 ), jade, mat4( 0, 1.73, - 1.12, 0, 0, 0, 1.1, 0.83, 0.72 ) );
		// A real flat footwell above the belly, below the pedals and seat mounts.
		add( roundedBox( 1.95, .07, 2.25, .035 ), black, mat4( 0, .76, .35 ) );
		addS( roundedBox( 1.2, 0.5, 1.7, 0.2 ), cream, mat4( 0, 2.4, - 0.9 ) );
		for ( const s of [ - 1, 1 ] ) {
			addS( cylinder( 0.19, 0.23, 0.75, 12 ), black, mat4( s * 0.46, 2.35, - 1.82, Math.PI / 2 ) );
			// Skids curve up at their forward ends; two cross-struts tie the cabin to them.
			addS( rod( V( s * 1.3, 0.09, - 1.75 ), V( s * 1.3, 0.09, 1.8 ), 0.085 ), metal, null, 0.8 );
			addS( rod( V( s * 1.3, 0.09, 1.8 ), V( s * 1.3, 0.35, 2.15 ), 0.085 ), metal, null, 0.8 );
			for ( const z of [ - 1, 1 ] ) addS( rod( V( s * 1.3, 0.17, z ), V( s * 0.65, 0.85, z ), 0.07 ), metal, null, 0.8 );
			// Door frames and handles, cream rescue stripes, red/green navigation lamps.
			addS( rod( V( s * 1.05, 1.1, 0.6 ), V( s * 0.84, 2.23, 0.6 ), 0.035 ), cream );
			addS( box( 0.06, 0.16, 2.3 ), cream, mat4( s * 1.08, 1.09, - 0.2 ) );
			addS( box( 0.06, 0.08, 0.35 ), black, mat4( s * 1.13, 1.4, 0.15 ) );
			add( sphere( 0.08, 8, 6 ), s > 0 ? 0xe93333 : 0x37e67d, mat4( s * 1.14, 1.24, - 0.8 ) );
			const seatX = s > 0 ? .2 : -.55;
			simple.push( prepare( roundedBox( 0.58, 0.16, 0.64, 0.06 ), { color: black, matrix: mat4( seatX, 0.96, - .2 ) } ) );
			simple.push( prepare( roundedBox( 0.58, 0.8, 0.15, 0.05 ), { color: black, matrix: mat4( seatX, 1.34, - .55, - 0.08 ) } ) );
			// door skins (wave 24A): the lower doors close the cabin under their windows
			addS( roundedBox( 0.05, 0.36, 1.75, 0.02 ), jade, mat4( s * 1.08, 0.94, 0.45 ) );
		}
		addS( rod( V( 0, 1.63, - 1.45 ), V( 0, 2.08, - 7.05 ), 0.38, 16, 0.11 ), jade );
		addS( box( 2.5, 0.09, 0.7 ), cream, mat4( 0, 1.94, - 5.6, 0.04 ) );
		addS( box( 0.1, 1.7, 0.72 ), rescue, mat4( 0, 2.42, - 6.87, - 0.22 ) );
		addS( rod( V( 0, 2.5, - 0.4 ), V( 0, 3.12, - 0.4 ), 0.08 ), metal, null, 0.9 );
		addS( cylinder( 0.26, 0.26, 0.15, 12 ), black, mat4( 0, 3.1, - 0.4 ) );
		// Central windshield bar, panel, instrument rings, overhead beacon and nose searchlight.
		add( rod( V( 0, 1.15, 2.15 ), V( 0, 2.2, 1.65 ), 0.035 ), cream );
		add( roundedBox( 1.79, 0.7, 0.2, 0.04 ), black, mat4( 0, 1.294, 1.682, 0.22 ) );
		add( sphere( 0.105, 10, 8 ), rescue, mat4( 0, 2.77, - 1.1 ) );
		add( sphere( 0.15, 10, 8 ), cream, mat4( 0, 0.89, 2.06 ) );
		this._mesh( mergePrepared( parts ), solid, this.root, 'airframe' );
		this.shell = this._mesh( mergePrepared( shell ), solid, this.root, 'airframe-shell' );
		// Upper glazed dome ends above the glare shield. The old complete sphere
		// curved through the footwell and overlaid the lower panel from inside.
		// the glazing: the bubble, its skirt down to the belly and the door windows; reflections at grazing angles, rain on
		// it (setRain) beaded and streaming back with the airspeed
		const glazing = ( scale, fromPos, objScale, objOffset ) => standard( { color: 0x9dd5dd, roughness: 0.08, metalness: 0.05, transparent: true, opacity: 0.16, depthWrite: false, side: 2, modules: [ canopyRain ], uniforms: { rain: [ 'f32', 0 ], streak: [ 'f32', 0 ], fromPos: [ 'f32', fromPos ], dropScale: [ 'vec2f', new Vector2( ...scale ) ], objScale: [ 'vec3f', new Vector3( ...objScale ) ], objOffset: [ 'vec3f', new Vector3( ...objOffset ) ] }, varyings: { vObj: 'vec3f' }, vertex: 'o.vObj = v.position;', surface: CANOPY } );
		// (the bubble wraps its unit-sphere position 0..1 round and -1..1 up; the skirt's uv runs round it 0..1 and up it in
		// metres: drop cells of about 3 cm on both)
		// (the bubble is a unit sphere scaled 1.13 x 0.85 x 1.62 and set at 0, 1.7, 0.72: objScale turns it to metres)
		const glass = glazing( [ 200, 30 ], 1, [ 1.13, 0.85, 1.62 ], [ 0, 1.7, 0.72 ] ), skirtGlass = glazing( [ 160, 32 ], 0, [ 1, 1, 1 ], [ 0, 0, 0 ] );
		this.materials.push( glass, skirtGlass ); this.glass = glass; this.glazing = [ glass, skirtGlass ];
		this._mesh( sphere( 1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2 ), glass, this.root, 'bubble-canopy' ).scale.set( 1.13, 0.85, 1.62 );
		this.meshes[ this.meshes.length - 1 ].position.set( 0, 1.7, 0.72 );
		this._mesh( canopySkirt(), skirtGlass, this.root, 'canopy-skirt' );
		// the glazing draws in the late transparent pass, over the sea and the sky (in the main pass the water covered it)
		for ( const m of this.meshes.slice( - 2 ) ) { m.layers.set( LAYERS.TRANSPARENT ); m.renderOrder = 1; }
		const cabin = createPropMaterial( 'helicopter-cabin-simple' ); this.materials.push( cabin );
		this.simple = this._mesh( mergePrepared( simple ), cabin, this.root, 'cabin-simple' );
		this.mainRotor = new Group(); this.mainRotor.position.set( 0, 3.19, - 0.4 ); this.root.add( this.mainRotor );
		const blades = [];
		for ( let n = 0; n < 4; n ++ ) {
			const a = n * Math.PI / 2;
			blades.push( prepare( box( 0.24, 0.045, 4.7 ), { color: black, rough: 0.35, metal: 0.4, matrix: mat4( Math.sin( a ) * 2.7, 0, Math.cos( a ) * 2.7, 0, a ) } ) );
			blades.push( prepare( box( 0.25, 0.048, 0.35 ), { color: cream, matrix: mat4( Math.sin( a ) * 4.88, 0, Math.cos( a ) * 4.88, 0, a ) } ) );
		}
		this.bladesSimple = this._mesh( mergePrepared( blades ), solid, this.mainRotor, 'main-rotor-four-blades' );
		this.tailRotor = new Group(); this.tailRotor.position.set( 0.24, 2.25, - 6.95 ); this.root.add( this.tailRotor );
		const tail = [];
		for ( let n = 0; n < 2; n ++ ) tail.push( prepare( box( 0.05, 1.5, 0.12 ), { color: n ? cream : black, matrix: mat4( 0, 0, 0, n * Math.PI / 2 ) } ) );
		this.tailSimple = this._mesh( mergePrepared( tail ), solid, this.tailRotor, 'tail-rotor' );
		// Working flight controls stay below the eye and move with actual command inputs.
		this.cyclic = new Group(); this.cyclic.position.set( .2, 1.02, .35 ); this.root.add( this.cyclic );
		this._mesh( prepare( rod( V( 0, 0, 0 ), V( 0, .42, -.08 ), .027 ), { color: metal, metal: .7 } ), solid, this.cyclic, 'cyclic-column' );
		this._mesh( prepare( roundedBox( .13, .14, .12, .035 ), { color: black, matrix: mat4( 0, .43, -.08 ) } ), solid, this.cyclic, 'cyclic-grip' );
		// (wave 24A: the collective at the pilot's left hand, the cyclic and pedals within the seated pilot's reach)
		this.collective = new Group(); this.collective.position.set( .55, 1.08, -.25 ); this.root.add( this.collective );
		this._mesh( prepare( rod( V( 0, 0, 0 ), V( 0, .1, .36 ), .026 ), { color: metal, metal: .7 } ), solid, this.collective, 'collective-lever' );
		this._mesh( prepare( cylinder( .045, .045, .2, 8 ), { color: black, matrix: mat4( 0, .115, .42, Math.PI / 2 ) } ), solid, this.collective, 'collective-grip' );
		this.pedals = [ - 1, 1 ].map( side => { const pedal = new Group(); pedal.position.set( .2 + side * .16, .82, PEDAL_Z ); this.root.add( pedal ); this._mesh( prepare( box( .22, .09, .12 ), { color: metal, metal: .7 } ), solid, pedal, 'anti-torque-pedal' ); return pedal; } );
		this.lamps = [];
		for ( const [ bit, x, y, z, color, radius ] of [ [ 1, 1.15, 1.24, -.8, 0xff3524, .09 ], [ 1, - 1.15, 1.24, -.8, 0x32ff70, .09 ], [ 2, 0, .89, 2.1, 0xffecbe, .13 ], [ 4, .42, .8, 2.02, 0xd8f5ff, .11 ], [ 8, .15, 2.1, .2, 0xff6b45, .045 ] ] ) {
			const lampMat = standard( { color, emissive: color, emissiveIntensity: 3, roughness: .2 } ); this.materials.push( lampMat ); const mesh = this._mesh( sphere( radius, 10, 7 ), lampMat, this.root, 'powered-lamp-' + bit ); mesh.position.set( x, y, z ); mesh.visible = false; this.lamps.push( { bit, mesh } );
		}
		scene?.add?.( this.root );
		if ( scene ) this.ready = this._exterior( solid ).catch( () => null );
	}

	// the modelled exterior: the fuselage, boom, fins, skids and kit (one draw with the prop material: vertex colours
	// and roughness / metalness), the hub and tapered blades, the tail rotor; the primitive shell and blades give way
	async _exterior( solid ) {
		const base = ( () => { try { return ( import.meta.env && import.meta.env.BASE_URL ) || '/'; } catch { return '/'; } } )();
		const gltf = await ( EXTERIOR.cache || ( EXTERIOR.cache = loadGLB( ( base.endsWith( '/' ) ? base : base + '/' ) + 'models/helicopter/exterior.glb' ) ) );
		if ( this.disposed || ! gltf ) return null;
		const hex = ( f ) => { const g = ( c ) => Math.round( 255 * Math.min( 1, c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow( c, 1 / 2.4 ) - 0.055 ) ); return ( g( f[ 0 ] ) << 16 ) | ( g( f[ 1 ] ) << 8 ) | g( f[ 2 ] ); };
		const nodeMesh = ( name ) => {
			const n = gltf.nodes.find( ( x ) => x.name === name );
			if ( ! n || n.mesh === undefined ) return null;
			const pieces = [];
			for ( const p of gltf.meshes[ n.mesh ] ) {
				if ( p.mode !== 4 || ! p.attributes.POSITION ) continue;
				const g = new BufferGeometry();
				g.setAttribute( 'position', new BufferAttribute( Float32Array.from( p.attributes.POSITION.array ), 3 ) );
				if ( p.attributes.NORMAL ) g.setAttribute( 'normal', new BufferAttribute( Float32Array.from( p.attributes.NORMAL.array ), 3 ) );
				if ( p.indices ) g.setIndex( new BufferAttribute( p.indices instanceof Uint8Array ? Uint16Array.from( p.indices ) : p.indices, 1 ) );
				const m = gltf.materials[ p.material ?? 0 ] || {}, pbr = m.pbrMetallicRoughness || {};
				pieces.push( prepare( g, { color: hex( pbr.baseColorFactor || [ 0.5, 0.5, 0.5 ] ), rough: pbr.roughnessFactor ?? 0.5, metal: pbr.metallicFactor ?? 0 } ) );
			}
			return pieces.length ? mergePrepared( pieces ) : null;
		};
		const body = nodeMesh( 'Fuselage' ), main = nodeMesh( 'MainRotor' ), tail = nodeMesh( 'TailRotor' );
		if ( body ) { const m = this._mesh( body, solid, this.root, 'airframe-modelled' ); m.castShadow = true; if ( this.shell ) this.shell.visible = false; }
		if ( main ) { this._mesh( main, solid, this.mainRotor, 'main-rotor-modelled' ); if ( this.bladesSimple ) this.bladesSimple.visible = false; }
		if ( tail ) { this._mesh( tail, solid, this.tailRotor, 'tail-rotor-modelled' ); if ( this.tailSimple ) this.tailSimple.visible = false; }
		return this;
	}

	_mesh( g, m, parent, name ) {
		this.geometries.push( g ); const mesh = new Mesh( g, m ); mesh.name = name;
		mesh.castShadow = /^airframe/.test( name ); mesh.receiveShadow = true; parent.add( mesh ); this.meshes.push( mesh ); return mesh;
	}
	setPose( p, q ) { this.root.position.copy( p ); this.root.quaternion.copy( q ); }
	setLights( mask = 0 ) { this.lamps.forEach( l => { l.mesh.visible = !! ( mask & l.bit ); } ); }
	setRain( rain = 0, airspeed = 0 ) { for ( const g of this.glazing || [] ) { g.uniforms.rain.value = rain; g.uniforms.streak.value = Math.min( 1, airspeed / 30 ); } }
	// the detailed cockpit (Cockpit.js) replaces the simple seats and control meshes; their groups keep moving
	setDetailed( on ) { if ( this.simple ) this.simple.visible = ! on; for ( const g of [ this.cyclic, this.collective, ...this.pedals ] ) for ( const m of g.children ) m.visible = ! on; }
	spin( dt, rpm = 0, flight = null ) {
		rpm = this.remoteRPM ?? rpm;
		this.mainRotor.rotation.y = ( this.mainRotor.rotation.y + dt * rpm * 38 ) % ( Math.PI * 2 );
		this.tailRotor.rotation.x = ( this.tailRotor.rotation.x + dt * rpm * 64 ) % ( Math.PI * 2 );
		if ( flight ) { const c = flight.controls; this.cyclic.rotation.x = ( c.forward || 0 ) * .18; this.cyclic.rotation.z = - ( c.strafe || 0 ) * .2; this.collective.rotation.x = - .15 - ( c.lift || 0 ) * .23; this.pedals.forEach( ( p, i ) => { p.position.z = PEDAL_Z + ( i ? 1 : - 1 ) * ( c.yaw || 0 ) * .07; } ); }
	}
	dispose() { this.disposed = true; this.scene?.remove?.( this.root ); this.geometries.forEach( g => g.dispose() ); this.materials.forEach( m => m.dispose() ); }
}

export function buildHelipad( scene, x, y, z ) {
	const parts = [];
	const add = ( g, color, matrix ) => parts.push( prepare( g, { color, matrix, rough: 0.85 } ) );
	add( cylinder( 6.7, 6.7, 0.4, 48 ), 0x3c4749, mat4( 0, - 0.2, 0 ) );
	add( torus( 5.4, 0.08, 4, 48 ), 0xf5dc98, mat4( 0, 0.02, 0, Math.PI / 2 ) );
	for ( const dx of [ - 1.15, 1.15 ] ) add( box( 0.32, 0.025, 3 ), 0xf5dc98, mat4( dx, 0.025, 0 ) );
	add( box( 2.3, 0.025, 0.32 ), 0xf5dc98, mat4( 0, 0.025, 0 ) );
	// Orange service bollard at the safe side of the rotor disk.
	add( box( 0.6, 1.1, 0.6 ), 0xe67232, mat4( 6.9, 0.55, 0 ) );
	const geo = mergePrepared( parts ), mat = createPropMaterial( 'coastal-helipad' ), mesh = new Mesh( geo, mat );
	mesh.name = 'coastal-rescue-helipad'; mesh.position.set( x, y, z ); mesh.receiveShadow = true; scene?.add?.( mesh );
	return { mesh, dispose() { scene?.remove?.( mesh ); geo.dispose(); mat.dispose(); } };
}
