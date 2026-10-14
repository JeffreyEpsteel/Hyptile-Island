# Wave 19A: phones and frame time after wave 18; wet sand

Read COMMON.md, w19-common.md, docs/PERF.md (waves 12D and 16C: the numbers and the harness), tools/perf/README.md,
tools/visuals/capture.mjs, src/core/Quality.js, the wave 18 features' budgets (src/features/townlife: up to 24 full people,
far ones 2 Hz; src/world/village/TownKit.js: merged kit draws, far blocks; src/features/weapons: models and VFX; the 27 new
clips added ~2.3 MB per roster GLB), src/world/terrain/** + src/world/Terrain*.js (the terrain material: sand / grass / rock).

Owned files: tools/perf/**, test/perf-*.mjs, src/core/Quality.js, docs/PERF.md, the terrain material / shader files you find
for wet sand (src/world/Terrain*.js shading only, src/world/terrain/** material code), src/world/islands/town/TerrainMesh.js
+ src/world/islands/BlackwaterMesh.js (LOD / budgets only), and the budget / LOD constants inside src/features/townlife/**,
src/world/village/TownKit.js and src/features/weapons/** (constants only: report anything larger as a patch).

1. Measure (before): CPU scenarios (add a "wave 18 town" scenario: Tidemark at noon with the townsfolk, the kit, a weapon
   drawn) and the headless GPU views (home bay, Tidemark quay and square, Blackwater cove) at Low / Medium / phone: frame
   ms, draw calls, triangles, GPU memory, JS heap after load. Write the before table into docs/PERF.md.
2. Cut until the phone profile is under the wave 12 targets everywhere (GPU memory <= 387 MB at the towns; the iPhone
   killed the tab at ~507 MB in wave 9), and Medium holds 60 fps headroom on the harness: candidates are the towns'
   terrain textures (terrainHeights 18.6 MB), the town meshes' near LOD distance on phones, the townsfolk count / skinned
   draws on phones (instanced far crowd), shadow cascades on phones, texture sizes of new GLBs (weapons, kit), the roster
   GLBs' clip data (strip the clips a phone never plays? only if the anim tests stay green), lazy-loading the weapons GLBs
   until owned.
3. Wet sand: the sand within ~1.5 m above the waterline darkens and glosses (lower roughness) and dries back with the tide /
   wave run-up if the shore field gives it; on every tier (cheap), checked in golden-hour and noon captures.
4. After: the same table, before / after contact sheets of the views (nothing should look worse). Tests: the budgets per
   tier, the new scenario deterministic, wet sand shader composes. Report under 300 words with the table.
