import { Material } from '../../../engine/render/Material.js';
import { LAYERS } from '../../../engine/render/SceneRenderer.js';
import { Color, Mesh } from '../../../engine/index.js';
import { Acc } from './Facades.js';

// Meridian's night light on the ground (wave 27C): the city had lit windows and nothing else, so the streets, the
// pavements, the apron and the runway stood black. The real LocalLights are few (6 on Medium, 16 at most, and the camera's
// nearest win), so the rest is baked into ONE static mesh of flat additive quads, a single draw call for the whole city:
//   lamp       a disc of warm light under each street lamp head (every lamp, whether or not it is one of the real lights)
//   flood      a wider disc under a flood mast on the apron and the airstrip's apron
//   shop       a rectangle of spill along a lit shop front (bay by bay: some shops are dark), warm, fading with the distance
//              from the wall
//   edge       a small disc of light round a runway edge light
// Unlit and depth tested, no depth write, premultiplied with alpha 0 (pure addition: the motion vectors and the water
// mask behind do not change), drawn with the transparent layer like the night's glows. Its brightness follows the same
// dusk ramp as the lamps (frame.night 0.05 .. 0.45). By day the mesh draws nothing.
//
//   buildNightPools( { lamps, floods, shops, edges, y: ( x, z ) => road height, phone } ) -> Acc  (world metres)
//   createPoolMaterial() -> Material (attributes: aux = ( kind, a, b, 0 ); the vertex colour is the radiance)
//   createPoolMesh( acc, center ) -> Mesh at `center` (the geometry is translated by -center)

const LAMP = new Color( 1.0, 0.8, 0.52 ), FLOOD = new Color( 1.0, 0.92, 0.78 ), SHOP = new Color( 1.0, 0.7, 0.4 ), EDGE = new Color( 1.0, 0.92, 0.7 );
const UP = [ 0, 1, 0 ];
const DISC_UV = [ [ - 1, - 1 ], [ - 1, 1 ], [ 1, 1 ], [ 1, - 1 ] ];
export const POOL = { lamp: 0, flood: 1, shop: 2, edge: 3 };
// lights lie on the sidewalk's top (0.15 m) and the road is 0.03 m: one plane above both
export const POOL_UP = 0.19;

const disc = ( acc, x, y, z, r, col, kind, a = 0, b = 0 ) => {

	acc.quad( [ x - r, y, z - r ], [ x - r, y, z + r ], [ x + r, y, z + r ], [ x + r, y, z - r ], UP, DISC_UV, col, [ kind, a, b, 0 ] );

};

export function buildNightPools( { lamps = [], floods = [], shops = [], edges = [], y = () => 0, phone = false, acc = new Acc() } = {} ) {

	const rl = phone ? 7 : 8.5;
	for ( const l of lamps ) {

		// under the head, 2.2 m out over the road (as the real light is placed)
		const x = l.x + Math.sin( l.yaw ) * 2.2, z = l.z + Math.cos( l.yaw ) * 2.2;
		disc( acc, x, y( x, z ) + POOL_UP, z, rl, LAMP, POOL.lamp, ( ( x * 7.13 + z * 3.71 ) % 1 + 1 ) % 1 );

	}

	for ( const f of floods ) disc( acc, f.x, y( f.x, f.z ) + POOL_UP, f.z, f.r || 15, FLOOD, POOL.flood, ( ( f.x * 5.3 + f.z * 2.9 ) % 1 + 1 ) % 1 );
	for ( const e of edges ) disc( acc, e.x, ( e.y ?? y( e.x, e.z ) ) + 0.12, e.z, 8.5, EDGE, POOL.edge );
	// a shop front: P -> Q along the wall (seen from outside), n the outward normal, depth metres of spill
	for ( const s of shops ) {

		const L = Math.hypot( s.qx - s.px, s.qz - s.pz );
		if ( L < 1 ) continue;
		const D = s.depth || 5.5;
		const yy = ( x, z ) => y( x, z ) + POOL_UP;
		const a = [ s.px, yy( s.px, s.pz ), s.pz ], b = [ s.qx, yy( s.qx, s.qz ), s.qz ];
		const c = [ s.qx + s.nx * D, yy( s.qx + s.nx * D, s.qz + s.nz * D ), s.qz + s.nz * D ], d = [ s.px + s.nx * D, yy( s.px + s.nx * D, s.pz + s.nz * D ), s.pz + s.nz * D ];
		acc.quad( a, b, c, d, UP, [ [ 0, 0 ], [ 1, 0 ], [ 1, 1 ], [ 0, 1 ] ], SHOP, [ POOL.shop, L, s.seed || 0, 0 ] );

	}

	return acc;

}

const SURFACE = /* wgsl */`
	let aux = in.vs.vPoolAux;
	let kind = aux.x;
	let q = in.uv;
	let nightK = smoothstep( 0.05, 0.45, frame.night );
	var k = 0.0;
	if ( kind < 2.5 && kind > 1.5 ) {
		// a shop front's spill: bays of 5 m along the wall, a few dark; strongest at the glass, gone in 5.5 m
		let u = q.x * aux.y;
		let bay = floor( u / 5.0 );
		let h = fract( sin( bay * 12.9898 + aux.z * 78.233 ) * 43758.5453 );
		let on = step( 0.18, h ) * mix( 0.55, 1.0, h );
		let along = smoothstep( 0.0, 0.7, fract( u / 5.0 ) ) * ( 1.0 - smoothstep( 0.3, 1.0, fract( u / 5.0 ) ) ) * 0.5 + 0.5;
		let edge = smoothstep( 0.0, 0.08, q.x ) * ( 1.0 - smoothstep( 0.92, 1.0, q.x ) );
		let v = q.y;
		k = on * along * edge * pow( max( 1.0 - v, 0.0 ), 2.0 ) * 0.62;
	} else {
		let r2 = dot( q, q );
		if ( r2 >= 1.0 ) { discard; }
		let edgeF = 1.0 - r2;
		if ( kind > 2.5 ) {
			k = ( exp( - r2 * 4.0 ) * 0.7 + 0.3 ) * edgeF * edgeF * 0.17;
		} else if ( kind > 0.5 ) {
			// a flood: a broad even pool with a hot centre
			k = ( exp( - r2 * 2.6 ) * 0.8 + 0.2 ) * edgeF * edgeF * 0.26;
		} else {
			// a lamp: a hot centre, a long soft skirt; the pools do not all match (a slightly different warm / flicker)
			k = ( exp( - r2 * 3.6 ) * 0.85 + exp( - r2 * 1.3 ) * 0.15 ) * edgeF * 0.34 * mix( 0.9, 1.1, aux.y );
		}
	}
	s.albedo = in.color.rgb * ( k * nightK );
	s.emissive = vec3f( 0.0 );
	s.alpha = 0.0;
`;

export function createPoolMaterial() {

	const m = new Material( {
		name: 'MeridianNightPools',
		lit: false,
		transparent: true,
		depthWrite: false,
		depthTest: true,
		side: 'double',
		blending: 'premultiplied',
		velocityWeight: 0,
		underwaterLighting: 'none',
		receiveShadows: false,
		vertexColors: true,
		attributes: { aux: 'vec4f' },
		varyings: { vPoolAux: 'vec4f' },
		vertex: /* wgsl */`
	o.vPoolAux = v.aux;
`,
		surface: SURFACE,
		output: 'r.color = vec4f( s.albedo, 0.0 );',
	} );
	m.lightingHooks = false;
	return m;

}

export function createPoolMesh( acc, center, material = createPoolMaterial() ) {

	const g = acc.geometry();
	g.translate( - center.x, 0, - center.z );
	g.computeBoundingBox(); g.computeBoundingSphere();
	const mesh = new Mesh( g, material );
	mesh.name = 'MeridianNightPools';
	mesh.position.copy( center );
	if ( mesh.updateMatrix ) mesh.updateMatrix();
	mesh.castShadow = false;
	mesh.receiveShadow = false;
	mesh.renderOrder = 22;
	mesh.layers.set( LAYERS.TRANSPARENT );
	return mesh;

}
