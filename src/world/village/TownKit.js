import { BufferAttribute, BufferGeometry, Color, Matrix4, Mesh } from '../../engine/index.js';
import { G } from '../../engine/render/Frame.js';
import { loadGLB } from '../../engine/loaders/GLTF.js';
import { prepare, mergePrepared } from '../boat/GeoKit.js';
import { createPropMaterial, PAT } from '../../game/GameMaterials.js';
import { cameraPosition } from '../islands/IslandKit.js';

// The towns' dressing kit (wave 18C): public/models/town/kit.glb, modelled in Blender by tools/town/kit.py (signboards
// with their lettering, street lamps, wall lanterns, benches, window boxes, planters, the fountain, awnings, net racks,
// Blackwater's rum barrels and skull pole, chimney pots). The GLB carries no textures: one glTF material per colour, its
// name the prop material's pattern (wood_*, paint_*, cloth_*, stone_*, iron, rust_*, gold, leaf_* / flower_*, water,
// bone, glow_* = lamp glass that lights up at night). Placements are recorded while a town builds (synchronously); the
// GLB loads once and every placement of a town merges into one prop mesh and one glow mesh (two draws a town), added
// under an anchor mesh the town already owns.
//
//   const kit = new TownKit( { name: 'tidemark' } )
//   kit.place( 'bench', matrix4 )                    (world matrix: the piece's local +z is its front, +y up)
//   kit.glow( geometry, { color, lit, matrix } )     procedural glow geometry (lit windows: lit 0..1 = the night mask)
//   kit.attach( anchor, { cullDistance, phoneCull } ) -> Promise<{ meshes, triangles } | null>  (once the GLB is in)
//   kit.glowMaterial / kit.material; TownKit.night() (0 day .. 1 night, what the glow follows)
//
// The glow material: the prop material whose emissive (a uniform set per frame from the night) is scaled per vertex by
// aux.w (lit) and tinted warm, so one draw holds lamps that always burn at night and windows some of which stay dark.

export const KIT_URL = 'models/town/kit.glb';

const base = () => {

	try {

		return ( import.meta.env && import.meta.env.BASE_URL ) || '/';

	} catch ( e ) {

		return '/';

	}

};

// material name -> prop-material channels
export function channelsOf( name ) {

	const n = ( name || '' ).toLowerCase();
	if ( n.startsWith( 'glow' ) ) return { rough: 0.3, metal: 0, pattern: 0, glow: true };
	if ( n.startsWith( 'wood' ) ) return { rough: 0.88, metal: 0, pattern: PAT.wood };
	if ( n.startsWith( 'cloth' ) ) return { rough: 0.92, metal: 0, pattern: PAT.cloth };
	if ( n.startsWith( 'rust' ) ) return { rough: 0.7, metal: 0.4, pattern: PAT.rusty };
	if ( n === 'iron' ) return { rough: 0.5, metal: 0.7, pattern: 0 };
	if ( n === 'gold' ) return { rough: 0.35, metal: 0.9, pattern: 0 };
	if ( n === 'water' ) return { rough: 0.04, metal: 0.1, pattern: 0 };
	if ( n.startsWith( 'paint' ) ) return { rough: 0.55, metal: 0, pattern: 0 };
	if ( n.startsWith( 'leaf' ) || n.startsWith( 'flower' ) ) return { rough: 0.75, metal: 0, pattern: 0 };
	return { rough: 0.93, metal: 0, pattern: 0 }; // stone, brick, terracotta, soil, bone
}

// the night factor every glow follows (the frame's night uniform; 0 when the engine has not set it)
export function night() {

	const v = G.night ? G.night.value : 0;
	return Math.max( 0, Math.min( 1, ( v - 0.1 ) / 0.6 ) );

}

export function createGlowMaterial( name = 'townGlow' ) {

	const m = createPropMaterial( name );
	m.surface += /* wgsl */`
	s.emissive = s.emissive * vec3f( 1.0, 0.8, 0.52 ) * in.vs.vAux.w;
`;
	m.side = 'double';
	return m;

}

// the parsed kit: piece name -> [ { position, normal, index, channels, color } ] (shared by every town)
let _kit = null;
export function loadKit( url = base() + KIT_URL ) {

	if ( ! _kit ) _kit = loadGLB( url ).then( parseKit ).catch( ( e ) => {

		_kit = null;
		if ( typeof console !== 'undefined' && ! globalThis.__quietKit ) console.warn( 'town kit: could not load ' + url, e && e.message ? e.message : e );
		return null;

	} );
	return _kit;

}

export function parseKit( gltf ) {

	const pieces = {};
	const f32 = ( a ) => ( a.array instanceof Float32Array ? a.array : Float32Array.from( a.array ) );
	for ( const ni of gltf.roots ) {

		const node = gltf.nodes[ ni ];
		if ( node.mesh === undefined ) continue;
		const prims = [];
		for ( const p of gltf.meshes[ node.mesh ] ) {

			if ( p.mode !== undefined && p.mode !== 4 ) continue;
			if ( ! p.attributes.POSITION ) continue;
			const gm = gltf.materials[ p.material ?? 0 ] || {};
			const f = ( gm.pbrMetallicRoughness && gm.pbrMetallicRoughness.baseColorFactor ) || [ 1, 1, 1, 1 ];
			prims.push( {
				name: gm.name || '',
				position: f32( p.attributes.POSITION ),
				normal: p.attributes.NORMAL ? f32( p.attributes.NORMAL ) : null,
				index: p.indices ? Uint32Array.from( p.indices ) : null,
				color: [ f[ 0 ], f[ 1 ], f[ 2 ] ], // linear (glTF base colour factors are linear)
				...channelsOf( gm.name ),
			} );

		}

		pieces[ node.name ] = prims;

	}

	return pieces;

}

export function pieceTriangles( prims ) {

	let n = 0;
	for ( const p of prims || [] ) n += ( p.index ? p.index.length : p.position.length / 3 ) / 3;
	return n;

}

function geometryOf( p ) {

	const g = new BufferGeometry();
	g.setAttribute( 'position', new BufferAttribute( p.position.slice(), 3 ) );
	if ( p.normal ) g.setAttribute( 'normal', new BufferAttribute( p.normal.slice(), 3 ) );
	if ( p.index ) g.setIndex( new BufferAttribute( p.index.slice(), 1 ) );
	return g;

}

// a linear [ r, g, b ] as the GeoKit colour (a Color is taken as is; numbers would be read as sRGB hex)
const linColor = ( c ) => new Color( c[ 0 ], c[ 1 ], c[ 2 ] );

export class TownKit {

	constructor( { name = 'town', material = null, glowMaterial = null } = {} ) {

		this.name = name;
		this.placements = [];
		this.glowParts = [];
		this.material = material;
		this.glowMaterial = glowMaterial;
		this.meshes = [];

	}

	place( piece, matrix ) {

		this.placements.push( { piece, matrix: matrix.clone ? matrix.clone() : new Matrix4().copy( matrix ) } );

	}

	// procedural glow geometry (a window pane, a lamp glass) for the glow mesh: lit 0..1
	glow( geometry, { color = 0x2a3036, lit = 1, matrix = null } = {} ) {

		const g = prepare( geometry, { color, rough: 0.15, metal: 0, pattern: 0, anim: lit, matrix } );
		this.glowParts.push( g );

	}

	count( piece ) {

		return this.placements.filter( ( p ) => p.piece === piece ).length;

	}

	// the merged meshes once the kit is in; relative to the anchor's position (the anchor's geometry was re-centred)
	async attach( anchor, { cullDistance = 0, cullRadius = 0, url = undefined } = {} ) {

		const pieces = await loadKit( url );
		return this.build( pieces, anchor, { cullDistance, cullRadius } );

	}

	build( pieces, anchor = null, { cullDistance = 0, cullRadius = 0 } = {} ) {

		const P = [], L = [ ...this.glowParts ];
		const missing = new Set();
		const rel = new Matrix4();
		if ( anchor ) {

			if ( anchor.updateMatrixWorld ) anchor.updateMatrixWorld( true );
			rel.copy( anchor.matrixWorld ).invert();

		}

		const m = new Matrix4();
		if ( pieces ) for ( const pl of this.placements ) {

			const prims = pieces[ pl.piece ];
			if ( ! prims ) {

				missing.add( pl.piece );
				continue;

			}

			m.multiplyMatrices( rel, pl.matrix );
			for ( const p of prims ) {

				const g = prepare( geometryOf( p ), { color: linColor( p.color ), rough: p.rough, metal: p.metal, pattern: p.pattern, anim: p.glow ? 1 : 0, matrix: m } );
				( p.glow ? L : P ).push( g );

			}

		}

		// the procedural glow parts are in world space: into the anchor's frame
		if ( anchor ) for ( const g of this.glowParts ) g.applyMatrix4( rel );
		this.glowParts = [];
		const out = [];
		const mk = ( list, mat, suffix, shadow ) => {

			if ( ! list.length || ! mat ) return;
			const mesh = new Mesh( mergePrepared( list ), mat );
			mesh.name = this.name + suffix;
			mesh.castShadow = shadow;
			mesh.receiveShadow = true;
			if ( cullDistance ) {

				mesh.cullDistance = cullDistance;
				mesh.cullRadius = cullRadius;

			}

			if ( mat === this.glowMaterial ) mesh.onBeforeRender = () => updateGlow( mat );
			if ( anchor ) anchor.add( mesh );
			out.push( mesh );

		};
		mk( P, this.material, 'Kit', true );
		mk( L, this.glowMaterial, 'Glow', false );
		this.meshes.push( ...out );
		const triangles = out.reduce( ( s, q ) => s + ( q.geometry.index ? q.geometry.index.count / 3 : 0 ), 0 );
		return { meshes: out, triangles, missing: [ ...missing ] };

	}

}

// near / far switching for meshes a town re-shows every frame (Tidemark.update sets its shells visible): onBeforeRender
// hides the one that should not draw at this camera distance from the block's centre (the renderer asks it before it
// queues the mesh, per pass). near: drawn within `dist`, far: beyond.
export function lodSwitch( mesh, { x, z, dist, near = true } ) {

	const prev = mesh.onBeforeRender;
	mesh.userData = mesh.userData || {};
	mesh.userData.lod = { x, z, dist, near };
	mesh.onBeforeRender = function ( ...a ) {

		const c = cameraPosition();
		const d = c ? Math.hypot( c.x - x, c.z - z ) : 0;
		this.visible = near ? d < dist : d >= dist;
		if ( prev ) prev.apply( this, a );

	};
	return mesh;

}

// the glow material's emissive for the night (call per frame, or from an onBeforeRender)
export function updateGlow( material, k = night() ) {

	const e = 0.04 + 3.4 * k;
	material.emissive = [ e, e, e ];

}
