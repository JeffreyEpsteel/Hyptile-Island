// Modelled vehicle interiors (wave 24A): the Blender GLBs of tools/cars/build_interiors.py (public/models/cars/interior-
// <kind>.glb) and tools/helicopter/build_cockpit.py, turned into an engine scene graph that keeps the authored nodes (so the
// wheel, pedals, levers and wipers move about their own pivots), with procedural WGSL materials that read as what they
// are (leather grain, woven cloth, grained plastic, carpet, carbon twill, walnut, brushed metal, mirrors, glass), the live
// instrument displays (one canvas atlas, three screen regions) and the rain on the windscreen with the wipers' clear arcs.
//
//   const gltf = await loadInteriorGLB( url )                 (fetch; tests pass parsed GLBs from disk instead)
//   const it = buildInterior( gltf, { screenTexture, rain: true } )
//   it.group (car-local Group)  it.nodes.get( 'Wheel' )  it.screens.cluster / stack / aux (Meshes)  it.materials
//   it.set( { night, glow, dome, rain, wipers: [ angle, angle ], speedW, time, cabin } )   it.dispose()
//   limbs: const set = new LimbSet( material, group ); const arm = set.limb( radii ); arm.reach( ... ); set.commit()
//   rayScreens( it, origin, dir ) -> { screen: 'cluster' | 'stack' | 'aux', u, v, t } | null   (car-local ray)
import { Group, Mesh, BufferGeometry, BufferAttribute, Vector3, Vector4, Quaternion, Matrix3, Matrix4, Color } from '../../engine/index.js';
import { Material } from '../../engine/render/Material.js';
import { ShaderModule } from '../../engine/gpu/Shader.js';
import { commonModule } from '../../engine/render/wgsl/common.js';
import { loadGLB } from '../../engine/loaders/GLTF.js';
import { MIRROR_SURFACE } from './CarMirrors.js';

// the instrument atlas: one canvas, three regions (normalized x, y, w, h; y down like the canvas)
export const ATLAS = Object.freeze( { w: 1024, h: 512 } );
export const REGIONS = Object.freeze( {
	cluster: Object.freeze( { x: 0, y: 0, w: 640, h: 256 } ),
	aux: Object.freeze( { x: 0, y: 256, w: 640, h: 256 } ),
	stack: Object.freeze( { x: 640, y: 0, w: 384, h: 512 } ),
} );

export async function loadInteriorGLB( url ) {

	return loadGLB( url );

}

// ---- materials

export const cabinModule = new ShaderModule( {
	name: 'cabinSurfaces',
	deps: [ commonModule ],
	code: /* wgsl */`
fn cabVN( p: vec2f ) -> f32 {
	let i = floor( p ); let f = fract( p ); let u = f * f * ( 3.0 - 2.0 * f );
	let a = hash21( i ); let b = hash21( i + vec2f( 1.0, 0.0 ) ); let c = hash21( i + vec2f( 0.0, 1.0 ) ); let d = hash21( i + vec2f( 1.0, 1.0 ) );
	return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}
fn cabFbm( p: vec2f ) -> f32 { return cabVN( p ) * 0.55 + cabVN( p * 2.03 + 7.1 ) * 0.3 + cabVN( p * 4.1 + 3.3 ) * 0.15; }
// leather pebble: distance to the nearest of jittered cell points
fn cabCell( p: vec2f ) -> f32 {
	let i = floor( p ); var d = 9.0;
	for ( var y = -1; y <= 1; y++ ) { for ( var x = -1; x <= 1; x++ ) {
		let c = i + vec2f( f32( x ), f32( y ) ); let o = hash22( c );
		d = min( d, length( c + o - p ) );
	} }
	return clamp( d, 0.0, 1.0 );
}
// bump from a height through screen derivatives (no tangents needed); fades out where the pattern would alias
fn cabBump( N: vec3f, P: vec3f, h: f32, k: f32 ) -> vec3f {
	let dpx = dpdx( P ); let dpy = dpdy( P ); let dhx = dpdx( h ); let dhy = dpdy( h );
	let r1 = cross( dpy, N ); let r2 = cross( N, dpx ); let det = dot( dpx, r1 );
	let g = sign( det ) * ( dhx * r1 + dhy * r2 );
	return normalize( abs( det ) * N - g * k );
}
fn cabFade( uv: vec2f, freq: f32 ) -> f32 { let w = fwidth( uv * freq ); return 1.0 - smoothstep( 0.35, 0.9, max( w.x, w.y ) ); }
fn rotorCover( P: vec3f, hub: vec4f, axis: vec4f, blade: vec4f ) -> f32 {
	let up = axis.xyz; let sun = frame.sunDir; let su = dot( sun, up );
	let along = dot( hub.xyz - P, up ) / max( su, 0.05 );
	let q = P + sun * along - hub.xyz;
	let r = length( q );
	let ang = atan2( dot( cross( blade.xyz, q ), up ), dot( blade.xyz, q ) );
	let d = abs( fract( ang / 1.5707963 + 0.5 ) - 0.5 ) * 1.5707963 * r;
	return ( 1.0 - smoothstep( 0.1, 0.16, d ) ) * step( 0.35, r ) * step( r, axis.w ) * step( 0.0, along ) * step( 0.05, su ) * clamp( 1.0 - frame.night * 2.0, 0.0, 1.0 );
}
`,
} );

const FAMILIES = [
	[ /^(Leather|Glove|Shoe)/, 'leather' ], [ /^(Cloth|Headliner|Strap)/, 'cloth' ], [ /^Vinyl/, 'vinyl' ], [ /^(Plastic|SoftTouch)/, 'plastic' ],
	[ /^Carpet/, 'carpet' ], [ /^Rubber/, 'rubber' ], [ /^(Chrome|Metal_Brushed)/, 'metal' ], [ /^Metal/, 'painted' ], [ /^Carbon/, 'carbon' ],
	[ /^Wood/, 'wood' ], [ /^Mirror/, 'mirror' ], [ /^Glass/, 'glass' ], [ /^Screen/, 'screen' ], [ /^RainGlass/, 'rain' ], [ /^Lamp/, 'lamp' ],
	[ /^Cardboard/, 'cardboard' ], [ /^Paint/, 'painted' ],
];
export const familyOf = ( name ) => ( FAMILIES.find( ( [ re ] ) => re.test( name ) ) || [ null, 'plastic' ] )[ 1 ];

// The cabin's own light: the dash glow at night, the dome lamp (added as albedo x light: a cheap, shadowless fill that
// still reads as a lit cabin); and, for a rotorcraft, the blades' shadow sweeping through the cockpit in sun.
const COMMON = /* wgsl */`
	s.emissive += s.albedo * mat.cabin.rgb;
`;
// a rotorcraft's blades between the sun and the cabin: a stripe of shade per blade, swept round with the rotor (the
// output stage dims the lit colour where the blade covers the sun; surfaces facing away are already in shade)
export const ROTOR_SHADOW = /* wgsl */`
	{
		let rc = rotorCover( in.P, mat.rotorHub, mat.rotorAxis, mat.rotorBlade ) * step( 0.0, dot( s.normal, frame.sunDir ) );
		( *r ).color = vec4f( ( *r ).color.rgb * ( 1.0 - rc * 0.62 ), ( *r ).color.a );
	}
`;

const SURF = {
	leather: `
	let g = cabCell( in.uv * 260.0 ); let f = cabFade( in.uv, 260.0 );
	s.albedo *= mix( 1.0, 0.92 + 0.12 * g, f ) * ( 0.94 + 0.12 * cabFbm( in.uv * 9.0 ) );
	s.roughness = mix( s.roughness, mix( 0.4, 0.6, g ), f );
	s.normal = cabBump( s.normal, in.P, g * 0.00028 * f, 1.0 );
	s.clearcoat = 0.12; s.clearcoatRoughness = 0.4; s.sheenColor = s.albedo * 0.25; s.sheenRoughness = 0.6;`,
	vinyl: `
	let g = cabCell( in.uv * 90.0 ); let f = cabFade( in.uv, 90.0 );
	s.albedo *= ( 0.97 + 0.05 * g * f ) * ( 0.95 + 0.1 * cabFbm( in.uv * 7.0 ) );
	s.roughness = mix( 0.42, 0.52, g * f );
	s.normal = cabBump( s.normal, in.P, g * 0.0001 * f, 1.0 );
	s.clearcoat = 0.1; s.clearcoatRoughness = 0.35;`,
	cloth: `
	let w = in.uv * 900.0; let f = cabFade( in.uv, 900.0 );
	let weave = mix( 0.5, 0.5 + 0.5 * sin( w.x * 6.2832 ) * sin( w.y * 6.2832 + 1.57 * step( 0.5, fract( w.x * 0.5 ) ) ), f );
	let mottle = cabFbm( in.uv * 40.0 );
	s.albedo *= ( 0.82 + 0.22 * weave ) * ( 0.92 + 0.16 * mottle );
	s.roughness = 0.95; s.metalness = 0.0;
	s.sheenColor = s.albedo * 1.1 + vec3f( 0.02 ); s.sheenRoughness = 0.45;
	s.normal = cabBump( s.normal, in.P, weave * 0.0004, 1.0 );`,
	plastic: `
	let g = cabVN( in.uv * 900.0 ); let f = cabFade( in.uv, 900.0 );
	let big = cabFbm( in.uv * 6.0 );
	s.albedo *= 0.94 + 0.1 * big;
	s.roughness = clamp( s.roughness + ( g - 0.5 ) * 0.18 * f, 0.2, 1.0 );
	s.normal = cabBump( s.normal, in.P, g * 0.00015 * f, 1.0 );`,
	carpet: `
	let g = cabVN( in.uv * 1500.0 ) * cabFade( in.uv, 1500.0 ); let m = cabFbm( in.uv * 18.0 );
	s.albedo *= ( 0.75 + 0.45 * g ) * ( 0.9 + 0.2 * m );
	s.roughness = 1.0; s.sheenColor = s.albedo * 0.8; s.sheenRoughness = 0.8;`,
	rubber: `
	let g = cabVN( in.uv * 500.0 ) * cabFade( in.uv, 500.0 );
	s.albedo *= 0.9 + 0.2 * g; s.roughness = 0.85 + 0.1 * g;`,
	metal: `
	let streak = cabVN( vec2f( in.uv.x * 4.0, in.uv.y * 1400.0 ) ) * cabFade( vec2f( 0.0, in.uv.y ), 1400.0 );
	s.roughness = clamp( s.roughness + ( streak - 0.5 ) * 0.16, 0.04, 1.0 );
	s.albedo *= 0.92 + 0.12 * streak;`,
	painted: `
	let g = cabFbm( in.uv * 60.0 );
	s.albedo *= 0.93 + 0.12 * g; s.roughness = clamp( s.roughness + ( g - 0.5 ) * 0.2, 0.2, 1.0 ); s.clearcoat = 0.2;`,
	carbon: `
	let c = in.uv * 220.0; let f = cabFade( in.uv, 220.0 );
	let cell = floor( c ); let t = fract( c );
	let dir = ( i32( cell.x ) + i32( cell.y ) ) & 1;
	let across = select( t.y, t.x, dir == 1 );
	let tow = sin( across * 3.1416 );
	s.albedo = mix( s.albedo, s.albedo * ( 0.45 + 1.4 * tow * f ), 1.0 ) + vec3f( 0.006 );
	s.roughness = mix( 0.25, 0.42, tow * f ); s.clearcoat = 1.0; s.clearcoatRoughness = 0.06;
	s.normal = cabBump( s.normal, in.P, tow * 0.0003 * f, 1.0 );`,
	wood: `
	let ww = in.uv.x * 45.0 + cabFbm( in.uv * vec2f( 3.0, 60.0 ) ) * 7.0 + in.uv.y * 3.0;
	let ring = 0.5 + 0.5 * sin( ww * 6.2832 );
	let fig = cabFbm( in.uv * vec2f( 30.0, 300.0 ) );
	s.albedo *= mix( 0.62, 1.18, ring * 0.7 + fig * 0.3 );
	s.roughness = 0.35; s.clearcoat = 1.0; s.clearcoatRoughness = 0.04;`,
	mirror: `
	s.metalness = 1.0; s.roughness = 0.02; s.albedo = vec3f( 0.86, 0.88, 0.9 );`,
	glass: `
	s.roughness = 0.05; s.metalness = 0.0; s.alpha = 0.14 + 0.25 * pow( 1.0 - abs( dot( normalize( in.V ), s.normal ) ), 3.0 );`,
	lamp: `
	s.emissive += s.albedo * mat.glow * 3.5;`,
	cardboard: `
	let g = cabFbm( in.uv * 30.0 ); let fl = 0.5 + 0.5 * sin( in.uv.x * 6.2832 * 120.0 ) * cabFade( in.uv, 120.0 );
	s.albedo *= ( 0.88 + 0.18 * g ) * ( 0.96 + 0.06 * fl ); s.roughness = 0.95;`,
};

// the live displays: a region of the instrument canvas, lit from behind; dark glass when the power is off
const SCREEN = /* wgsl */`
	let face = textureSample( carFace, smpAnisoClamp, mat.rect.xy + in.uv * mat.rect.zw );
	s.albedo = face.rgb * 0.25 + vec3f( 0.01 );
	s.roughness = 0.12; s.metalness = 0.0; s.clearcoat = 1.0; s.clearcoatRoughness = 0.03;
	s.emissive = face.rgb * mat.power * ( 0.9 + 1.4 * frame.night );
`;

// raindrops on the inside-facing quad over the windscreen, cleared in the wipers' arcs
const RAIN = /* wgsl */`
	let lp = in.vs.vLocal;
	let up = mat.glassUp.xyz;
	let rain = mat.glassUp.w;
	let gv = vec2f( lp.x, dot( lp, up ) );
	var dens = rain;
	for ( var k = 0; k < 2; k++ ) {
		let w = select( mat.wipeA, mat.wipeB, k == 1 );
		let reach = select( mat.params.z, mat.params.w, k == 1 );
		let rel = lp - w.xyz;
		let ry = dot( rel, up ); let rx = rel.x;
		let r = length( vec2f( rx, ry ) );
		let phi = atan2( - rx, ry );
		let inArc = step( 0.06, r ) * step( r, reach ) * step( - 0.05, ry );
		let age = abs( w.w - phi ) / max( mat.params.x, 0.01 );
		dens = mix( dens, dens * clamp( age * ( 0.25 + rain ), 0.0, 1.0 ), inArc * step( 0.01, mat.params.x ) );
	}
	let cellSize = 0.016;
	let c = gv / cellSize; let ci = floor( c );
	let h = hash22( ci + vec2f( 17.0, 3.0 ) );
	let center = ( ci + 0.2 + h * 0.6 ) * cellSize;
	let rad = cellSize * ( 0.12 + 0.22 * hash21( ci + vec2f( 5.0, 11.0 ) ) );
	// drops slide down a little and twinkle in at random times
	let d = length( gv - center ) / rad;
	let present = step( hash21( ci + vec2f( floor( mat.params.y * 0.3 + h.x * 3.0 ), 1.0 ) ), dens );
	let drop = ( 1.0 - smoothstep( 0.75, 1.0, d ) ) * present;
	let rim = smoothstep( 0.45, 0.95, d ) * drop;
	let spark = ( 1.0 - smoothstep( 0.0, 0.3, length( gv - center - vec2f( - 0.3, 0.35 ) * rad ) / rad ) ) * drop;
	s.albedo = vec3f( 0.75, 0.8, 0.85 ) * ( 1.0 - rim * 0.6 );
	s.roughness = 0.05; s.metalness = 0.0;
	s.emissive = vec3f( 1.0 ) * spark * 0.6 * ( 1.0 - frame.night * 0.6 );
	s.alpha = drop * ( 0.35 + 0.35 * rim ) + spark * 0.3 + rain * 0.04;
`;

export function cabinMaterial( name, { color = null, roughness = 0.6, metalness = 0, rotor = false, screenTexture = null, rect = null, atlas = ATLAS, batched = false, mirrorTexture = null } = {} ) {

	const fam = familyOf( name );
	const uniforms = { cabin: [ 'vec3f', new Color( 0, 0, 0 ) ] };
	if ( rotor ) for ( const k of [ 'rotorHub', 'rotorAxis', 'rotorBlade' ] ) uniforms[ k ] = [ 'vec4f', new Vector4() ];
	const o = { name: 'cabin-' + name, color: color || new Color( 0.5, 0.5, 0.5 ), roughness, metalness, modules: [ cabinModule ], uniforms };
	if ( fam === 'screen' ) {

		Object.assign( o, { textures: { carFace: screenTexture }, surface: SCREEN, side: 'double' } );
		uniforms.rect = [ 'vec4f', new Vector4( 0, 0, 1, 1 ) ]; uniforms.power = [ 'f32', 1 ];

	} else if ( fam === 'rain' ) {

		Object.assign( o, { surface: RAIN, transparent: true, depthWrite: false, side: 'double', varyings: { vLocal: 'vec3f' }, vertex: 'o.vLocal = v.position;' } );
		for ( const k of [ 'wipeA', 'wipeB', 'glassUp', 'params' ] ) uniforms[ k ] = [ 'vec4f', new Vector4() ];

	} else if ( fam === 'mirror' && mirrorTexture ) {

		// a live mirror (wave 25E, CarMirrors.js): the rear view looked up along the reflected ray
		Object.assign( o, { textures: { mirrorTex: mirrorTexture }, surface: MIRROR_SURFACE + COMMON, side: 'double', varyings: { vMirror: 'vec3f' }, vertex: 'o.vMirror = v.position;' } );
		uniforms.mirrorVP = [ 'mat4x4f', new Matrix4() ]; uniforms.mirrorLive = [ 'f32', 0 ];
		for ( const k of [ 'mirrorEye', 'mirrorBack', 'mirrorC0', 'mirrorC1', 'mirrorC2' ] ) uniforms[ k ] = [ 'vec4f', new Vector4() ];

	} else if ( fam === 'glass' ) {

		Object.assign( o, { surface: SURF.glass + COMMON, transparent: true, depthWrite: false, side: 'double' } );

	} else {

		if ( fam === 'lamp' ) uniforms.glow = [ 'f32', 0 ];
		o.surface = ( batched ? '\ts.roughness = in.vs.vRM.x; s.metalness = in.vs.vRM.y;\n' : '' ) + SURF[ fam ] + COMMON;
		if ( batched ) Object.assign( o, { vertexColors: true, attributes: { aRM: 'vec2f' }, varyings: { vRM: 'vec2f' }, vertex: 'o.vRM = v.aRM;' } );
		o.side = 'double';

	}
	if ( rotor && fam !== 'rain' && fam !== 'glass' ) o.output = ROTOR_SHADOW;
	const m = new Material( o );
	m.family = fam;
	if ( m.uniforms.rect && rect ) m.uniforms.rect.value.set( rect.x / atlas.w, rect.y / atlas.h, rect.w / atlas.w, rect.h / atlas.h );
	return m;

}

// ---- the scene graph

function toFloat( a ) {

	if ( a.array instanceof Float32Array ) return a.array;
	return Float32Array.from( a.array );

}

const SCREEN_KEYS = { Screen_Cluster: 'cluster', Screen_Stack: 'stack', Screen_Aux: 'aux', Screen_Overhead: 'overhead' };

// Nodes the game moves; everything else is static and bakes into one batch per material family (draw calls: a car's
// cabin is ~25 draws, not a draw per authored material).
const ANIMATED = /^(Wheel|Pedal_|Gear|Handbrake|Stalk_|Wiper_|Cyclic|Collective)/;
// materials kept apart from their family's batch: the live screens, the rain, glass, lamps (their own glow), the
// driver's gloves and boots (hidden in the chase view)
const OWN = /^(Screen_|RainGlass|Glass|Lamp_|Glove|Shoe)/, OWN_MIRROR = /^(Screen_|RainGlass|Glass|Lamp_|Glove|Shoe|Mirror)/;
const _mrel = new Matrix4(), _mn = new Matrix4(), _inv4 = new Matrix4();

export function buildInterior( gltf, { screenTexture = null, rotor = false, regions = REGIONS, layers = null, atlas = ATLAS, mirrorTexture = null } = {} ) {
	// (with a live mirror texture the mirrors keep their own material: not batched into the family)
	const own = mirrorTexture ? OWN_MIRROR : OWN;

	const group = new Group();
	group.name = 'vehicle-interior';
	const nodes = new Map(), materials = new Map(), geometries = [], screens = {};
	const parts = [];
	const visit = ( ni, parent, animatedAncestor ) => {

		const n = gltf.nodes[ ni ];
		const g = new Group();
		g.name = n.name;
		g.position.set( n.t[ 0 ], n.t[ 1 ], n.t[ 2 ] );
		g.quaternion.set( n.r[ 0 ], n.r[ 1 ], n.r[ 2 ], n.r[ 3 ] );
		g.scale.set( n.s[ 0 ], n.s[ 1 ], n.s[ 2 ] );
		g.userData.q0 = g.quaternion.clone();
		g.userData.p0 = g.position.clone();
		parent.add( g );
		nodes.set( n.name, g );
		const owner = ANIMATED.test( n.name ) ? g : animatedAncestor;
		if ( n.mesh !== undefined ) for ( const p of gltf.meshes[ n.mesh ] ) if ( p.mode === 4 && p.attributes.POSITION ) parts.push( { node: g, owner, p } );
		for ( const c of n.children ) visit( c, g, owner );

	};
	for ( const r of gltf.roots ) visit( r, group, null );
	group.updateMatrixWorld( true );

	// the batches: ( target group, key ) -> primitives; static parts are carried into the root's frame; a moving part is
	// one batch in the family of its biggest piece (a wheel's rim grain matters, its spokes' less)
	const batches = new Map(), mainFamily = new Map();
	for ( const { owner, p } of parts ) {

		if ( ! owner ) continue;
		const name = gltf.materials[ p.material ?? 0 ]?.name || 'Plastic_Dark';
		if ( own.test( name ) ) continue;
		const c = mainFamily.get( owner ) || new Map(), fam = familyOf( name );
		c.set( fam, ( c.get( fam ) || 0 ) + p.attributes.POSITION.array.length );
		mainFamily.set( owner, c );

	}
	for ( const [ owner, c ] of mainFamily ) mainFamily.set( owner, [ ...c ].sort( ( a, b ) => b[ 1 ] - a[ 1 ] )[ 0 ][ 0 ] );
	for ( const { node, owner, p } of parts ) {

		const gm = gltf.materials[ p.material ?? 0 ] || {}, name = gm.name || 'Plastic_Dark';
		const isOwn = own.test( name ), target = isOwn && ( SCREEN_KEYS[ name ] || name === 'RainGlass' ) ? node : owner || group;
		const key = isOwn ? name : owner ? mainFamily.get( owner ) : familyOf( name );
		const id = target.uuid ?? target.id;
		const bk = id + '|' + key;
		if ( ! batches.has( bk ) ) batches.set( bk, { target, key, own: isOwn, name, list: [] } );
		// the part's frame relative to its batch's target
		node.updateWorldMatrix( true, false ); target.updateWorldMatrix( true, false );
		_mrel.copy( target.matrixWorld ).invert().multiply( node.matrixWorld );
		batches.get( bk ).list.push( { p, gm, m: _mrel.clone() } );

	}
	const familyMat = ( fam ) => {

		const k = 'family:' + fam;
		if ( ! materials.has( k ) ) materials.set( k, cabinMaterial( fam === 'cloth' ? 'Cloth' : fam === 'leather' ? 'Leather' : fam === 'vinyl' ? 'Vinyl' : fam === 'plastic' ? 'Plastic' : fam === 'carpet' ? 'Carpet' : fam === 'rubber' ? 'Rubber' : fam === 'metal' ? 'Metal_Brushed' : fam === 'painted' ? 'Metal_Painted' : fam === 'carbon' ? 'Carbon' : fam === 'wood' ? 'Wood' : fam === 'mirror' ? 'Mirror' : fam === 'cardboard' ? 'Cardboard' : 'Plastic', { color: new Color( 1, 1, 1 ), rotor, batched: true } ) );
		return materials.get( k );

	};
	for ( const b of batches.values() ) {

		let nv = 0, ni = 0;
		for ( const { p } of b.list ) { const c = p.attributes.POSITION.array.length / 3; nv += c; ni += p.indices ? p.indices.length : c; }
		const pos = new Float32Array( nv * 3 ), nrm = new Float32Array( nv * 3 ), uv = new Float32Array( nv * 2 ), col = new Float32Array( nv * 3 ), rm = new Float32Array( nv * 2 );
		const idx = nv > 65535 ? new Uint32Array( ni ) : new Uint16Array( ni );
		let vo = 0, io = 0;
		const v = new Vector3();
		for ( const { p, gm, m } of b.list ) {

			const P = toFloat( p.attributes.POSITION ), N = p.attributes.NORMAL ? toFloat( p.attributes.NORMAL ) : null, T = p.attributes.TEXCOORD_0 ? toFloat( p.attributes.TEXCOORD_0 ) : null;
			_mn.copy( m ); const nm = new Matrix3().getNormalMatrix( _mn );
			const pbr = gm.pbrMetallicRoughness || {}, f = pbr.baseColorFactor || [ 0.5, 0.5, 0.5, 1 ];
			const count = P.length / 3;
			for ( let i = 0; i < count; i ++ ) {

				v.set( P[ i * 3 ], P[ i * 3 + 1 ], P[ i * 3 + 2 ] ).applyMatrix4( m ); pos.set( [ v.x, v.y, v.z ], ( vo + i ) * 3 );
				if ( N ) { v.set( N[ i * 3 ], N[ i * 3 + 1 ], N[ i * 3 + 2 ] ).applyMatrix3( nm ).normalize(); nrm.set( [ v.x, v.y, v.z ], ( vo + i ) * 3 ); }
				if ( T ) uv.set( [ T[ i * 2 ], T[ i * 2 + 1 ] ], ( vo + i ) * 2 );
				col.set( [ f[ 0 ], f[ 1 ], f[ 2 ] ], ( vo + i ) * 3 );
				rm.set( [ pbr.roughnessFactor ?? 0.6, pbr.metallicFactor ?? 0 ], ( vo + i ) * 2 );

			}
			if ( p.indices ) for ( let i = 0; i < p.indices.length; i ++ ) idx[ io + i ] = p.indices[ i ] + vo;
			else for ( let i = 0; i < count; i ++ ) idx[ io + i ] = vo + i;
			vo += count; io += p.indices ? p.indices.length : count;

		}
		const geo = new BufferGeometry();
		geo.setAttribute( 'position', new BufferAttribute( pos, 3 ) );
		geo.setAttribute( 'normal', new BufferAttribute( nrm, 3 ) );
		geo.setAttribute( 'uv', new BufferAttribute( uv, 2 ) );
		let mat;
		if ( b.own ) {

			const gm = b.list[ 0 ].gm, pbr = gm.pbrMetallicRoughness || {}, f = pbr.baseColorFactor || [ 0.5, 0.5, 0.5, 1 ];
			const sk = SCREEN_KEYS[ b.name ];
			if ( ! materials.has( b.name ) ) materials.set( b.name, cabinMaterial( b.name, { color: new Color( f[ 0 ], f[ 1 ], f[ 2 ] ), roughness: pbr.roughnessFactor ?? 0.6, metalness: pbr.metallicFactor ?? 0, rotor, screenTexture, rect: sk ? regions[ sk ] : null, atlas, mirrorTexture } ) );
			mat = materials.get( b.name );

		} else {

			geo.setAttribute( 'color', new BufferAttribute( col, 3 ) );
			geo.setAttribute( 'aRM', new BufferAttribute( rm, 2 ) );
			mat = familyMat( b.key );

		}
		geo.setIndex( new BufferAttribute( idx, 1 ) );
		geo.computeBoundingBox(); geo.computeBoundingSphere();
		geometries.push( geo );
		const mesh = new Mesh( geo, mat );
		mesh.name = b.target.name + ':' + ( b.own ? b.name : b.key );
		mesh.castShadow = false;
		mesh.receiveShadow = true;
		mesh.frustumCulled = false;
		if ( mat.transparent ) { mesh.renderOrder = 2; if ( layers ) mesh.layers.set( layers ); }
		b.target.add( mesh );
		const sk = SCREEN_KEYS[ b.name ];
		if ( b.own && sk ) screens[ sk ] = mesh;

	}
	group.updateMatrixWorld( true );

	const v3 = ( name ) => { const g = nodes.get( name ); if ( ! g ) return null; const p = new Vector3(); g.updateWorldMatrix( true, false ); p.setFromMatrixPosition( g.matrixWorld ); return group.worldToLocal( p ); };
	const rainMesh = nodes.get( 'RainGlass' )?.children?.find( ( c ) => c.isMesh ) || null;
	const it = {
		group, nodes, materials, geometries, screens, rainMesh, eye: v3( 'Eye' ), dome: v3( 'Dome' ),
		// world (group-local) point of a named node / empty right now
		point: ( name, out = new Vector3() ) => { const g = nodes.get( name ); if ( ! g ) return null; g.updateWorldMatrix( true, false ); out.setFromMatrixPosition( g.matrixWorld ); return group.worldToLocal( out ); },
		set( { cabin = null, dome = 0, power = 1, glow = 0, rotorHub = null, rotorAxis = null, rotorBlade = null } = {} ) {

			for ( const m of materials.values() ) {

				if ( cabin && m.uniforms.cabin ) m.uniforms.cabin.value.copy( cabin );
				if ( m.uniforms.power ) m.uniforms.power.value = power;
				if ( m.uniforms.glow ) m.uniforms.glow.value = m.name === 'cabin-Lamp_Dome' ? dome : glow;
				if ( rotorHub && m.uniforms.rotorHub ) { m.uniforms.rotorHub.value.copy( rotorHub ); m.uniforms.rotorAxis.value.copy( rotorAxis ); m.uniforms.rotorBlade.value.copy( rotorBlade ); }

			}

		},
		dispose() {

			group.removeFromParent();
			for ( const g of geometries ) g.dispose();
			for ( const m of materials.values() ) m.dispose();
			geometries.length = 0; materials.clear();

		},
	};
	void _inv4;
	return it;

}

// rain: the windscreen's up-the-glass direction from the RainGlass quad, the wipers' pivots and reaches
export function rainSetup( it ) {

	const m = it.rainMesh;
	if ( ! m ) return null;
	const p = m.geometry.attributes.position;
	// the quad's two highest corners are its top edge
	const pts = Array.from( { length: p.count }, ( _, i ) => new Vector3( p.getX( i ), p.getY( i ), p.getZ( i ) ) ).sort( ( a, b ) => b.y - a.y );
	const half = Math.max( 1, Math.floor( pts.length / 2 ) );
	const top = pts.slice( 0, half ).reduce( ( s, v ) => s.add( v ), new Vector3() ).multiplyScalar( 1 / half );
	const bottom = pts.slice( half ).reduce( ( s, v ) => s.add( v ), new Vector3() ).multiplyScalar( 1 / Math.max( 1, pts.length - half ) );
	const up = top.clone().sub( bottom ).normalize();
	const wipers = [ 'Wiper_A', 'Wiper_B' ].map( ( n ) => {

		const g = it.nodes.get( n );
		if ( ! g ) return null;
		let reach = 0;
		g.traverse( ( c ) => { if ( c.geometry ) { c.geometry.computeBoundingBox(); reach = Math.max( reach, c.geometry.boundingBox.max.y ); } } );
		return { node: g, pivot: g.position.clone(), reach };

	} );
	return { up, wipers };

}

// ---- picking: a car-local ray against the screen quads

const _inv = new Matrix4(), _o = new Vector3(), _d = new Vector3(), _a = new Vector3(), _b = new Vector3(), _c = new Vector3(), _e1 = new Vector3(), _e2 = new Vector3(), _pv = new Vector3(), _tv = new Vector3(), _qv = new Vector3();

export function rayMesh( mesh, rootInverse, origin, dir ) {

	// mesh -> group local: matrixWorld relative to the group's inverse world
	mesh.updateWorldMatrix( true, false );
	_inv.multiplyMatrices( rootInverse, mesh.matrixWorld ).invert();
	_o.copy( origin ).applyMatrix4( _inv );
	_d.copy( dir ).transformDirection( _inv );
	const g = mesh.geometry, p = g.attributes.position, uv = g.attributes.uv, idx = g.index ? g.index.array : null;
	const n = idx ? idx.length : p.count;
	let best = null;
	for ( let i = 0; i < n; i += 3 ) {

		const ia = idx ? idx[ i ] : i, ib = idx ? idx[ i + 1 ] : i + 1, ic = idx ? idx[ i + 2 ] : i + 2;
		_a.fromBufferAttribute( p, ia ); _b.fromBufferAttribute( p, ib ); _c.fromBufferAttribute( p, ic );
		_e1.subVectors( _b, _a ); _e2.subVectors( _c, _a );
		_pv.crossVectors( _d, _e2 );
		const det = _e1.dot( _pv );
		if ( Math.abs( det ) < 1e-9 ) continue;
		const inv = 1 / det;
		_tv.subVectors( _o, _a );
		const u = _tv.dot( _pv ) * inv;
		if ( u < 0 || u > 1 ) continue;
		_qv.crossVectors( _tv, _e1 );
		const v = _d.dot( _qv ) * inv;
		if ( v < 0 || u + v > 1 ) continue;
		const t = _e2.dot( _qv ) * inv;
		if ( t <= 0 || ( best && t >= best.t ) ) continue;
		const w = 1 - u - v;
		best = { t, u: uv ? uv.getX( ia ) * w + uv.getX( ib ) * u + uv.getX( ic ) * v : 0, v: uv ? uv.getY( ia ) * w + uv.getY( ib ) * u + uv.getY( ic ) * v : 0 };

	}
	return best;

}

const _rootInv = new Matrix4();
export function rayScreens( it, origin, dir, maxT = 3 ) {

	it.group.updateWorldMatrix( true, false );
	_rootInv.copy( it.group.matrixWorld ).invert();
	let best = null;
	for ( const [ key, mesh ] of Object.entries( it.screens ) ) {

		const h = rayMesh( mesh, _rootInv, origin, dir );
		if ( h && h.t <= maxT && ( ! best || h.t < best.t ) ) best = { screen: key, ...h };

	}
	return best;

}

// every opaque triangle of the interior in group-local space (tests: sightlines)
export function interiorTriangles( it, { skipScreens = true, skipTransparent = true } = {} ) {

	const out = [];
	it.group.updateWorldMatrix( true, true );
	_rootInv.copy( it.group.matrixWorld ).invert();
	it.group.traverse( ( m ) => {

		if ( ! m.isMesh || ! m.visible ) return;
		if ( skipTransparent && m.material?.transparent ) return;
		if ( skipScreens && Object.values( it.screens ).includes( m ) ) return;
		const M = new Matrix4().multiplyMatrices( _rootInv, m.matrixWorld );
		const p = m.geometry.attributes.position, idx = m.geometry.index ? m.geometry.index.array : null, n = idx ? idx.length : p.count;
		for ( let i = 0; i < n; i += 3 ) out.push( { name: m.name, v: [ 0, 1, 2 ].map( ( k ) => new Vector3().fromBufferAttribute( p, idx ? idx[ i + k ] : i + k ).applyMatrix4( M ) ) } );

	} );
	return out;

}

// ---- limbs: the driver's / pilot's arms and legs, two-bone IK each, all of them one mesh (one draw) rewritten per frame
//   const set = new LimbSet( material, parent );  const arm = set.limb( [ r0, r1, r2 ] );
//   arm.reach( shoulder, wrist, l1, l2, hint ) ... set.commit()   set.mesh (visible / hide)   arm.joint, arm.end

const SEG = 10, PROFILE = [ [ 0, 0 ], [ 0.5, 0.5 ], [ 1, 1 ] ], RINGS = 6;
const TUBE_V = PROFILE.length * ( SEG + 1 ), BALL_V = ( RINGS + 1 ) * ( SEG + 1 ), LIMB_V = TUBE_V * 2 + BALL_V;
function tubeIndex( base, out ) {

	for ( let j = 1; j < PROFILE.length; j ++ ) for ( let i = 0; i < SEG; i ++ ) { const b = base + ( j - 1 ) * ( SEG + 1 ) + i, c = base + j * ( SEG + 1 ) + i; out.push( b, c, b + 1, b + 1, c, c + 1 ); }

}
function ballIndex( base, out ) {

	for ( let j = 1; j <= RINGS; j ++ ) for ( let i = 0; i < SEG; i ++ ) { const b = base + ( j - 1 ) * ( SEG + 1 ) + i, c = base + j * ( SEG + 1 ) + i; out.push( b, b + 1, c, b + 1, c + 1, c ); }

}

const _y = new Vector3( 0, 1, 0 ), _seg = new Vector3(), _dir = new Vector3(), _perp = new Vector3(), _ql = new Quaternion(), _lv = new Vector3(), _ln = new Vector3();

class Limb {

	constructor( set, radii, color ) { this.set = set; this.radii = radii; this.color = color; this.a = new Vector3(); this.joint = new Vector3(); this.end = new Vector3(); this.active = false; }

	// two-bone IK from the root a to the end c, bones l1 and l2, the joint pushed toward hint (a direction)
	reach( a, c, l1, l2, hint ) {

		_dir.subVectors( c, a );
		let L = _dir.length();
		L = Math.min( Math.max( L, Math.abs( l1 - l2 ) + 1e-3 ), l1 + l2 - 1e-3 );
		_dir.normalize();
		const x = ( l1 * l1 - l2 * l2 + L * L ) / ( 2 * L ), h = Math.sqrt( Math.max( 0, l1 * l1 - x * x ) );
		_perp.copy( hint ).addScaledVector( _dir, - hint.dot( _dir ) );
		if ( _perp.lengthSq() < 1e-8 ) _perp.set( 0, - 1, 0 );
		_perp.normalize();
		this.a.copy( a );
		this.joint.copy( a ).addScaledVector( _dir, x ).addScaledVector( _perp, h );
		// the lower bone ends at c even when c is out of reach (the hand stays on the rim)
		this.end.copy( c );
		this.active = true;
		return this.joint;

	}

}

export class LimbSet {

	constructor( material, parent, count = 4 ) {

		this.limbs = [];
		this.count = count;
		const nv = LIMB_V * count, idx = [];
		for ( let k = 0; k < count; k ++ ) { const b = k * LIMB_V; tubeIndex( b, idx ); tubeIndex( b + TUBE_V, idx ); ballIndex( b + TUBE_V * 2, idx ); }
		const g = new BufferGeometry();
		g.setAttribute( 'position', new BufferAttribute( new Float32Array( nv * 3 ), 3 ) );
		g.setAttribute( 'normal', new BufferAttribute( new Float32Array( nv * 3 ), 3 ) );
		g.setAttribute( 'uv', new BufferAttribute( new Float32Array( nv * 2 ), 2 ) );
		// (a batched cloth material: each limb's own colour, sleeves and trousers in one draw)
		g.setAttribute( 'color', new BufferAttribute( new Float32Array( nv * 3 ).fill( 0.1 ), 3 ) );
		g.setAttribute( 'aRM', new BufferAttribute( new Float32Array( nv * 2 ).fill( 0.92 ), 2 ) );
		g.setIndex( idx );
		g.boundingSphere = null;
		this.mesh = new Mesh( g, material );
		this.mesh.name = 'limbs';
		this.mesh.castShadow = false; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
		parent.add( this.mesh );

	}

	limb( radii, color = new Color( 0.1, 0.12, 0.16 ) ) {

		const l = new Limb( this, radii, color ), k = this.limbs.length, g = this.mesh.geometry, c = g.attributes.color.array, rm = g.attributes.aRM.array;
		for ( let v = k * LIMB_V; v < ( k + 1 ) * LIMB_V; v ++ ) { c[ v * 3 ] = color.r; c[ v * 3 + 1 ] = color.g; c[ v * 3 + 2 ] = color.b; rm[ v * 2 ] = 0.92; rm[ v * 2 + 1 ] = 0; }
		g.attributes.color.needsUpdate = true;
		this.limbs.push( l );
		return l;

	}

	_tube( P, N, U, o, a, b, r0, r1 ) {

		_seg.subVectors( b, a );
		const len = Math.max( 1e-4, _seg.length() );
		_ql.setFromUnitVectors( _y, _seg.multiplyScalar( 1 / len ) );
		let v = o;
		for ( const [ t, k ] of PROFILE ) {

			const r = r0 + ( r1 - r0 ) * k;
			for ( let i = 0; i <= SEG; i ++ ) {

				const ang = i / SEG * Math.PI * 2, cx = Math.cos( ang ), cz = Math.sin( ang );
				_lv.set( cx * r, t * len, cz * r ).applyQuaternion( _ql ).add( a );
				_ln.set( cx, 0, cz ).applyQuaternion( _ql );
				P[ v * 3 ] = _lv.x; P[ v * 3 + 1 ] = _lv.y; P[ v * 3 + 2 ] = _lv.z;
				N[ v * 3 ] = _ln.x; N[ v * 3 + 1 ] = _ln.y; N[ v * 3 + 2 ] = _ln.z;
				U[ v * 2 ] = i / SEG * 0.3; U[ v * 2 + 1 ] = t * len;
				v ++;

			}

		}

	}

	_ball( P, N, U, o, c, r ) {

		let v = o;
		for ( let j = 0; j <= RINGS; j ++ ) for ( let i = 0; i <= SEG; i ++ ) {

			const t = j / RINGS * Math.PI, a = i / SEG * Math.PI * 2, nx = Math.sin( t ) * Math.cos( a ), ny = Math.cos( t ), nz = Math.sin( t ) * Math.sin( a );
			P[ v * 3 ] = c.x + nx * r; P[ v * 3 + 1 ] = c.y + ny * r; P[ v * 3 + 2 ] = c.z + nz * r;
			N[ v * 3 ] = nx; N[ v * 3 + 1 ] = ny; N[ v * 3 + 2 ] = nz;
			U[ v * 2 ] = i / SEG * 0.3; U[ v * 2 + 1 ] = j / RINGS * 0.1;
			v ++;

		}

	}

	// write every limb that reached this frame into the shared mesh (an idle one collapses to a point)
	commit() {

		const g = this.mesh.geometry, P = g.attributes.position.array, N = g.attributes.normal.array, U = g.attributes.uv.array;
		this.limbs.forEach( ( l, k ) => {

			const o = k * LIMB_V, [ r0, r1, r2 ] = l.radii;
			if ( ! l.active ) { P.fill( 0, o * 3, ( o + LIMB_V ) * 3 ); return; }
			this._tube( P, N, U, o, l.a, l.joint, r0, r1 );
			this._tube( P, N, U, o + TUBE_V, l.joint, l.end, r1, r2 );
			this._ball( P, N, U, o + TUBE_V * 2, l.joint, r1 * 1.08 );

		} );
		g.attributes.position.needsUpdate = g.attributes.normal.needsUpdate = g.attributes.uv.needsUpdate = true;
		g.computeBoundingBox(); g.computeBoundingSphere();

	}

	set visible( v ) { this.mesh.visible = v; }
	get visible() { return this.mesh.visible; }
	dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); }

}

// the steer / press / sweep of an authored node about one of its local axes, from its authored rest
const _qa = new Quaternion(), _ax = { x: new Vector3( 1, 0, 0 ), y: new Vector3( 0, 1, 0 ), z: new Vector3( 0, 0, 1 ) };
export function turnNode( g, axis, angle ) {

	if ( ! g ) return;
	g.quaternion.copy( g.userData.q0 ).multiply( _qa.setFromAxisAngle( _ax[ axis ], angle ) );

}
