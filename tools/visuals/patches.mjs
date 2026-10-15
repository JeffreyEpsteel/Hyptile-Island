// Wave 24D's patches to files it does not own (applied by tools/visuals/apply-patches.mjs).
//   Tidemark.js / Blackwater.js (islands): their terrain tiles' land meshes take the tile terrain material
//   (src/materials/TileTerrain.js: the shared terrain detail and the home island's meadow tones on the baked colours)
//   instead of the flat prop material. The buildings, props and trees keep the prop material.
//   weather/index.js: drives the rain wetness (src/materials/Wetness.js) once a frame.
const NL = String.fromCharCode( 10 ), TAB = String.fromCharCode( 9 );
export const PATCHES = [
	{
		file: 'src/world/islands/Tidemark.js',
		anchor: "import { createPropMaterial } from '../../game/GameMaterials.js';\n",
		replace: "import { createPropMaterial } from '../../game/GameMaterials.js';\nimport { createTileTerrainMaterial } from '../../materials/TileTerrain.js';\n",
	},
	{
		file: 'src/world/islands/Tidemark.js',
		anchor: "\t\tconst nearT = new Mesh( terrainGeometry( T, { step: phone < 1 ? 3 : 2, floor: phone < 1 ? - 3 : - 4 } ), this.material );\n",
		replace: "\t\t// wave 24D: the ground's own material (detail, meadow tones; src/materials/TileTerrain.js)\n\t\tthis.terrainMaterial = createTileTerrainMaterial( 'tidemarkTerrain' );\n\t\tconst nearT = new Mesh( terrainGeometry( T, { step: phone < 1 ? 3 : 2, floor: phone < 1 ? - 3 : - 4 } ), this.terrainMaterial );\n",
	},
	{
		file: 'src/world/islands/Tidemark.js',
		anchor: "\t\tconst farT = new Mesh( terrainGeometry( T, { step: 8, floor: - 40 } ), this.material );\n",
		replace: "\t\tconst farT = new Mesh( terrainGeometry( T, { step: 8, floor: - 40 } ), this.terrainMaterial );\n",
	},
	{
		file: 'src/world/islands/Blackwater.js',
		anchor: "import { createPropMaterial, PAT } from '../../game/GameMaterials.js';\n",
		replace: "import { createPropMaterial, PAT } from '../../game/GameMaterials.js';\nimport { createTileTerrainMaterial } from '../../materials/TileTerrain.js';\n",
	},
	{
		file: 'src/world/islands/Blackwater.js',
		anchor: "\t\tconst near = new Mesh( blackwaterLandGeometry( tile, { step: phone < 1 ? 3 : 2, floor: phone < 1 ? - 3 : - 4 } ), this.material );\n",
		replace: "\t\t// wave 24D: the ground's own material (detail, meadow tones; src/materials/TileTerrain.js)\n\t\tthis.terrainMaterial = this.terrainMaterial || createTileTerrainMaterial( 'blackwaterTerrain' );\n\t\tconst near = new Mesh( blackwaterLandGeometry( tile, { step: phone < 1 ? 3 : 2, floor: phone < 1 ? - 3 : - 4 } ), this.terrainMaterial );\n",
	},
	{
		file: 'src/world/islands/Blackwater.js',
		anchor: "\t\tconst far = new Mesh( blackwaterLandGeometry( tile, { step: 8, floor: - 40 } ), this.material );\n",
		replace: "\t\tconst far = new Mesh( blackwaterLandGeometry( tile, { step: 8, floor: - 40 } ), this.terrainMaterial );\n",
	},
	// rain wets the world (src/materials/Wetness.js eases G.wetness; every scene material darkens / glosses by it)
	{
		file: 'src/features/weather/index.js',
		anchor: [ "import { G } from '../../core/Globals.js';", '' ].join( NL ),
		replace: [ "import { G } from '../../core/Globals.js';", "import { updateWetness } from '../../materials/Wetness.js';", '' ].join( NL ),
	},
	{
		file: 'src/features/weather/index.js',
		anchor: [ TAB + TAB + 'this.world.apply( p, dt );', '' ].join( NL ),
		replace: [ TAB + TAB + 'this.world.apply( p, dt );', TAB + TAB + 'updateWetness( dt, p.rain, { sun: 1 - clamp( ( p.clouds - 0.4 ) / 0.55, 0, 1 ), wind: p.wind } ); // wave 24D: wet surfaces in rain', '' ].join( NL ),
	},
];
