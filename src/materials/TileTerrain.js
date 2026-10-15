import { standard } from './Materials.js';
import { terrainShadingModule } from '../world/terrain/TerrainShading.js';

// Wave 24D: the ground of the town islands' terrain tiles (Tidemark's town/TerrainMesh.js geometry: colour = the baked
// ground mask colour, aux.x = roughness). Drawn with the prop material those tiles were one flat vertex colour per
// 4 m: a lime hill and a plain green sheet round the town, no grain up close. Here the same colour is the base and
// the shared terrain detail texture (TerrainShading.js: the home island's) adds, by what the colour says the ground is:
//   grass / woodland: the home island's meadow palette and patchiness (olive, sun-bleached yellow, lush hollows; the
//                     same tones as its terrain, so the islands match), clumps and litter, a little relief
//   sand:             grain and shell grit, broad drifts
//   rock / paths:     plates and grain
// and a broad (47 - 173 m) brightness variation everywhere. One extra texture (the shared one), no new geometry.
//
//   const m = createTileTerrainMaterial( 'tidemarkTerrain' )   // a SceneMaterial: vertex colours + the `aux` attribute

export function createTileTerrainMaterial( name = 'tileTerrain' ) {

	const m = standard( {
		vertexColors: true,
		modules: [ terrainShadingModule() ],
		attributes: { aux: 'vec4f' },
		varyings: { vAux: 'vec4f' },
		vertex: 'o.vAux = v.aux;',
	} );
	m.name = name;
	m.surface = /* wgsl */`
	let base = in.color.rgb;
	let P = in.P;
	let g = terrainImplicitGrad( P );
	let gx = g.dpdx.xz; let gy = g.dpdy.xz;
	// macro (173 m, 47 m: the meadow's own scales), mid (9 m) and fine (1.7 m) detail
	let qA = ${ rot( 'P.xz', 0.7 ) } / 173.0; let qB = ${ rot( 'P.xz', 2.1 ) } / 47.0;
	let mA = terrainDetailGrad( qA, ${ rot( 'gx', 0.7 ) } / 173.0, ${ rot( 'gy', 0.7 ) } / 173.0 ).w;
	let mB = terrainDetailGrad( qB + 0.31, ${ rot( 'gx', 2.1 ) } / 47.0, ${ rot( 'gy', 2.1 ) } / 47.0 ).w;
	let mid = terrainDetailGrad( P.xz / 9.0 + 0.57, gx / 9.0, gy / 9.0 );
	let fine = terrainDetailGrad( P.xz / 1.7 + 0.13, gx / 1.7, gy / 1.7 );
	// features under a few pixels fade out instead of sparkling
	let px = max( length( g.dpdx ), length( g.dpdy ) );
	let fineK = 1.0 - smoothstep( 0.012, 0.05, px );
	let midK = 1.0 - smoothstep( 0.08, 0.35, px );
	// what the baked colour is: green (grass, woodland, the graded strip), sand (warm, bright), the rest rock / path / soil
	let green = sat( ( base.g - max( base.r, base.b ) ) / max( base.g, 1e-4 ) * 3.0 );
	let sandy = sat( ( base.r - base.b ) / max( base.r, 1e-4 ) * 2.5 - 0.6 ) * smoothstep( 0.18, 0.35, luminance( base ) ) * ( 1.0 - green );
	let rocky = sat( 1.0 - green - sandy );
	let slope = 1.0 - sat( in.N.y );
	// grass: the meadow tone (the home island's palette), keeping the baked darkening of woodland and wear
	let mt = terrainMeadowTone( mA, mB, slope, in.N.z, mid.w, true );
	let shade = sat( luminance( base ) / ${ GRASS_LUM } );
	var grass = mt.tone * mix( 0.62, 1.12, shade ) * ( ( fine.g - 0.5 ) * 0.5 * fineK + 1.0 );
	var col = mix( base, grass, green * 0.85 );
	// sand: grain and grit, broad drifts
	col *= 1.0 + ( ( fine.b - 0.5 ) * 0.22 * fineK + ( mid.b - 0.5 ) * 0.12 * midK ) * sandy;
	// rock and paths: plates and grain
	col *= 1.0 + ( ( fine.r - 0.5 ) * 0.3 * fineK + ( mid.r - 0.5 ) * 0.25 * midK ) * rocky;
	// broad brightness variation everywhere (no flat sheets)
	col *= mix( 0.88, 1.1, mB ) * mix( 0.94, 1.05, mA );
	s.albedo = max( col, vec3f( 0.0 ) );
	s.roughness = clamp( in.vs.vAux.x + ( fine.g - 0.5 ) * 0.1 * green, 0.05, 1.0 );
	s.metalness = 0.0;
	// relief (m): clumps in the grass, grains in the sand, plates in the rock
	let hd = ( fine.g * 0.035 * green + fine.b * 0.008 * sandy + fine.r * 0.04 * rocky ) * fineK + mid.r * 0.12 * rocky * midK;
	s.normal = terrainPerturbNormal( P, s.normal, hd, 1.0 );
`;
	return m;

}

// the luminance of town/TerrainMesh.js GRASS (0x6f8a42, linear): the meadow tone follows the baked colour's darkening
const GRASS_LUM = '0.2195';

function rot( v, a ) {

	const c = Math.cos( a ).toFixed( 6 ), s = Math.sin( a ).toFixed( 6 );
	return `( mat2x2f( ${ c }, ${ s }, ${ - s }, ${ c } ) * ( ${ v } ) )`;

}
