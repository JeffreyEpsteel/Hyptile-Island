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
//   limbs: const arm = new Limb( material, r0, r1 ); arm.reach( shoulder, wrist, l1, l2, hint )   (two-bone IK, local frame)
//   rayScreens( it, origin, dir ) -> { screen: 'cluster' | 'stack' | 'aux', u, v, t } | null   (car-local ray)
import { Group, Mesh, BufferGeometry, BufferAttribute, Vector3, Vector4, Quaternion, Matrix4, Color } from '../../engine/index.js';
import { Material } from '../../engine/render/Material.js';
import { ShaderModule } from '../../engine/gpu/Shader.js';
import { commonModule } from '../../engine/render/wgsl/common.js';
import { loadGLB } from '../../engine/loaders/GLTF.js';

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
const ROTOR = /* wgsl */`
	{
		let up = mat.rotorAxis.xyz; let sun = frame.sunDir;
		let along = dot( mat.rotorHub.xyz - in.P, up ) / max( dot( sun, up ), 0.05 );
		let q = in.P + sun * along - mat.rotorHub.xyz;
		let r = length( q );
		let ref = mat.rotorBlade.xyz;
		let ang = atan2( dot( cross( ref, q ), up ), dot( ref, q ) );
		let blade = abs( fract( ang / 1.5707963 + 0.5 ) - 0.5 ) * 1.5707963 * r;
		let cover = ( 1.0 - smoothstep( 0.1, 0.16, blade ) ) * step( 0.35, r ) * step( r, mat.rotorAxis.w ) * step( 0.0, along ) * step( 0.05, dot( sun, up ) );
		s.albedo *= 1.0 - cover * 0.55 * clamp( 1.0 - frame.night * 2.0, 0.0, 1.0 );
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
	let g = cabCell( in.uv * 180.0 ); let f = cabFade( in.uv, 180.0 );
	s.albedo *= 0.97 + 0.05 * g * f;
	s.roughness = mix( 0.34, 0.46, g * f );
	s.normal = cabBump( s.normal, in.P, g * 0.00018 * f, 1.0 );
	s.clearcoat = 0.3; s.clearcoatRoughness = 0.25;`,
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

export function cabinMaterial( name, { color = null, roughness = 0.6, metalness = 0, rotor = false, screenTexture = null, rect = null } = {} ) {

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

	} else if ( fam === 'glass' ) {

		Object.assign( o, { surface: SURF.glass + COMMON, transparent: true, depthWrite: false, side: 'double' } );

	} else {

		if ( fam === 'lamp' ) uniforms.glow = [ 'f32', 0 ];
		o.surface = SURF[ fam ] + COMMON + ( rotor ? ROTOR : '' );
		o.side = 'double';

	}
	const m = new Material( o );
	m.family = fam;
	if ( m.uniforms.rect && rect ) m.uniforms.rect.value.set( rect.x / ATLAS.w, rect.y / ATLAS.h, rect.w / ATLAS.w, rect.h / ATLAS.h );
	return m;

}

// ---- the scene graph

function toFloat( a ) {

	if ( a.array instanceof Float32Array ) return a.array;
	return Float32Array.from( a.array );

}

const SCREEN_KEYS = { Screen_Cluster: 'cluster', Screen_Stack: 'stack', Screen_Aux: 'aux' };

export function buildInterior( gltf, { screenTexture = null, rotor = false, regions = REGIONS, layers = null } = {} ) {

	const group = new Group();
	group.name = 'vehicle-interior';
	const nodes = new Map(), materials = new Map(), geometries = [], screens = {};
	const matFor = ( index ) => {

		const gm = gltf.materials[ index ] || {};
		const name = gm.name || 'Plastic_Dark';
		if ( materials.has( name ) ) return materials.get( name );
		const pbr = gm.pbrMetallicRoughness || {};
		const f = pbr.baseColorFactor || [ 0.5, 0.5, 0.5, 1 ];
		const key = SCREEN_KEYS[ name ];
		const m = cabinMaterial( name, { color: new Color( f[ 0 ], f[ 1 ], f[ 2 ] ), roughness: pbr.roughnessFactor ?? 0.6, metalness: pbr.metallicFactor ?? 0, rotor, screenTexture, rect: key ? regions[ key ] : null } );
		materials.set( name, m );
		return m;

	};
	const visit = ( ni, parent ) => {

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
		if ( n.mesh !== undefined ) for ( const p of gltf.meshes[ n.mesh ] ) {

			if ( p.mode !== 4 || ! p.attributes.POSITION ) continue;
			const geo = new BufferGeometry();
			geo.setAttribute( 'position', new BufferAttribute( toFloat( p.attributes.POSITION ).slice(), 3 ) );
			if ( p.attributes.NORMAL ) geo.setAttribute( 'normal', new BufferAttribute( toFloat( p.attributes.NORMAL ).slice(), 3 ) );
			if ( p.attributes.TEXCOORD_0 ) geo.setAttribute( 'uv', new BufferAttribute( toFloat( p.attributes.TEXCOORD_0 ).slice(), 2 ) );
			if ( p.indices ) geo.setIndex( new BufferAttribute( p.indices instanceof Uint8Array ? Uint16Array.from( p.indices ) : p.indices.slice(), 1 ) );
			if ( ! p.attributes.NORMAL ) geo.computeVertexNormals();
			geo.computeBoundingBox(); geo.computeBoundingSphere();
			geometries.push( geo );
			const mat = matFor( p.material ?? 0 );
			const mesh = new Mesh( geo, mat );
			mesh.name = n.name + ':' + mat.name;
			mesh.castShadow = false;
			mesh.receiveShadow = true;
			mesh.frustumCulled = false;
			if ( mat.transparent ) { mesh.renderOrder = 2; if ( layers ) mesh.layers.set( layers ); }
			g.add( mesh );
			const sk = SCREEN_KEYS[ gltf.materials[ p.material ]?.name ];
			if ( sk ) screens[ sk ] = mesh;

		}
		for ( const c of n.children ) visit( c, g );

	};
	for ( const r of gltf.roots ) visit( r, group );
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

// ---- limbs: a tapered tube along +Y, placed from a to b each frame; two of them make an arm or a leg

function limbGeometry( r0, r1, seg = 10 ) {

	const pos = [], nrm = [], uv = [], idx = [];
	const rings = [ [ 0, r0 ], [ 0.5, ( r0 + r1 ) / 2 * 1.04 ], [ 1, r1 ] ];
	rings.forEach( ( [ y, r ], j ) => {

		for ( let i = 0; i <= seg; i ++ ) {

			const a = i / seg * Math.PI * 2;
			pos.push( Math.cos( a ) * r, y, Math.sin( a ) * r ); nrm.push( Math.cos( a ), 0, Math.sin( a ) ); uv.push( i / seg * 0.3, y * 0.4 );
			if ( j && i < seg ) { const b = ( j - 1 ) * ( seg + 1 ) + i, c = j * ( seg + 1 ) + i; idx.push( b, c, b + 1, b + 1, c, c + 1 ); }

		}

	} );
	// round caps: a ring pinched to a point at each end
	const base = pos.length / 3;
	pos.push( 0, - r0 * 0.6, 0, 0, 1 + r1 * 0.6, 0 ); nrm.push( 0, - 1, 0, 0, 1, 0 ); uv.push( 0, 0, 0, 0.4 );
	for ( let i = 0; i < seg; i ++ ) { idx.push( base, i + 1, i ); idx.push( base + 1, 2 * ( seg + 1 ) + i, 2 * ( seg + 1 ) + i + 1 ); }
	const g = new BufferGeometry();
	g.setAttribute( 'position', new BufferAttribute( new Float32Array( pos ), 3 ) );
	g.setAttribute( 'normal', new BufferAttribute( new Float32Array( nrm ), 3 ) );
	g.setAttribute( 'uv', new BufferAttribute( new Float32Array( uv ), 2 ) );
	g.setIndex( idx );
	g.computeBoundingBox(); g.computeBoundingSphere();
	return g;

}

const _y = new Vector3( 0, 1, 0 ), _seg = new Vector3(), _dir = new Vector3(), _perp = new Vector3(), _mid = new Vector3();

export class Limb {

	constructor( material, [ r0, r1, r2 ], parent ) {

		this.upper = new Mesh( limbGeometry( r0, r1 ), material );
		this.lower = new Mesh( limbGeometry( r1, r2 ), material );
		for ( const m of [ this.upper, this.lower ] ) { m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false; m.name = 'limb'; parent.add( m ); }
		this.joint = new Vector3();

	}

	static place( mesh, a, b ) {

		_seg.subVectors( b, a );
		const len = Math.max( 1e-4, _seg.length() );
		mesh.position.copy( a );
		mesh.quaternion.setFromUnitVectors( _y, _seg.multiplyScalar( 1 / len ) );
		mesh.scale.set( 1, len, 1 );

	}

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
		this.joint.copy( a ).addScaledVector( _dir, x ).addScaledVector( _perp, h );
		Limb.place( this.upper, a, this.joint );
		// the lower bone ends at c even when c is out of reach (the hand stays on the rim)
		Limb.place( this.lower, this.joint, _mid.copy( c ) );
		return this.joint;

	}

	dispose() { for ( const m of [ this.upper, this.lower ] ) { m.removeFromParent(); m.geometry.dispose(); } }

}

// the steer / press / sweep of an authored node about one of its local axes, from its authored rest
const _qa = new Quaternion(), _ax = { x: new Vector3( 1, 0, 0 ), y: new Vector3( 0, 1, 0 ), z: new Vector3( 0, 0, 1 ) };
export function turnNode( g, axis, angle ) {

	if ( ! g ) return;
	g.quaternion.copy( g.userData.q0 ).multiply( _qa.setFromAxisAngle( _ax[ axis ], angle ) );

}
