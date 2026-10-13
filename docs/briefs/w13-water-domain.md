# Wave 13A: the sea and the plants reach Tidemark (and anything outside the 2048 m heightmap)

Read docs/briefs/COMMON.md first (rules, root-owned files, style, no browsers / dev servers / npm install), then
src/world/islands/town/TidemarkTerrain.js + TerrainMesh.js + Vegetation.js (wave 12A: Tidemark sits on its own 2 m
terrain tile at (1720, -60) r 440 OUTSIDE the 2048 m heightmap, with IslandKit palms because the vegetation system,
the shore field (ShoreWaves / shoreSim), the shallow-water tint, the breakers and the world-map terrain picture only
cover the heightmap domain), src/world/TerrainData.js (ensureTidemark wraps the height queries), src/world/TerrainGPU.js
(the GPU height / normal / splat textures the water and vegetation sample), src/ocean/** (WaterMaterial: shallow tint
from the terrain height texture, ShoreWaves.buildDirTexture, Breakers, the CDLOD ocean extent), src/world/vegetation/**
(GrassField, Impostors, tree placement from the splat / height data), src/features/dressing (shore debris), src/core/Quality.js.

Owned files: src/ocean/**, src/world/TerrainGPU.js, src/world/vegetation/**, src/world/terrain/** (additive), src/world/islands/town/TerrainMesh.js
and Vegetation.js (you may replace the IslandKit stand-ins once the real systems cover the island), test/ocean-*.mjs,
test/feature-islands.mjs (additive checks), test/water-domain.mjs (new). Report App.js / TerrainData patches.

Goal: a player sailing or flying to Tidemark sees the same sea as at home: shallow turquoise over its sand, breakers and
shore waves on its beaches, grass and the real trees on its land, shore debris, and the world map shows its land.
1. Domain: generalise the shore / shallow data from "one 2048 m heightmap" to "the heightmap plus extra terrain tiles"
   (a list TerrainData.tiles: { x0, z0, size, res, heights }). The GPU height texture used by the water and vegetation
   becomes either one larger atlas covering every tile (cheapest to implement: a 4096 m domain at half the texel
   density on phones) or a second height texture sampled by tile; pick what keeps the water shader's uniform /
   texture budget (it is near the fragment uniform limit: see the wave 10C report in docs/PLAN.md) and phones' memory
   (globalThis.__phoneBudget terrainTexture 1024).
2. Shore: ShoreWaves / shoreSim / Breakers build their direction and distance fields from the tiles too (Tidemark's
   beaches get breakers; its river mouth gets the shore field's calm).
3. Vegetation: the grass field and tree / impostor placement run over Tidemark's tile with its own splat (sand / grass /
   rock from slope and height), the same budgets and distance culling; remove the IslandKit stand-ins when the real
   trees are there (keep the town's planted palms along the streets).
4. The world map's terrain picture includes the tiles; the minimap too.
5. Phones: the extra tile costs at most ~6 MB of GPU memory; everything culls by distance; run the existing phone
   memory check if the harness is available (tools/perf/headless.mjs --mobile, see tools/perf/README.md: Vulkan works).
6. Tests: the water shader composes and the terrain texture covers both domains (a height lookup at Tidemark's beach
   returns its height through the GPU-side sampler maths you can test on the CPU), shore fields are non-empty on
   Tidemark, the home island's fields stay bit-identical (existing tests). Vite build check as in COMMON.md.
