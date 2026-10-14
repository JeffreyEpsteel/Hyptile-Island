# Wave 16C: a second performance pass: two tiles, more ships, more plants, phones

Read docs/briefs/COMMON.md first, then docs/PERF.md + tools/perf/README.md (the CPU scenarios and the headless Dawn
harness: Vulkan works with vulkan-1.dll beside dawn.node in the session's scratchpad; see the wave 12D notes in
docs/PLAN.md), tools/perf/cpu-scenarios.mjs, test/perf-cpu.mjs, test/perf-scenarios.mjs, src/core/Quality.js (the
profiles and the phone budget), src/world/terrain/TerrainTiles.js + src/world/islands/BlackwaterMesh.js + town/TerrainMesh.js
(two outer tiles now), src/world/vegetation/** (Scatter plants ~2,800 on Blackwater and ~1,200 on Tidemark: budgets,
distance culling, impostors), src/features/naval/Naval.js (ship count: rivals' convoys, the raid, the launch, hunts all
add ships), src/features/trade/panel.js (the market window redraws: rows per frame?), src/features/seaplane/Cockpit.js
(redraw rates), src/game/Minimap.js (two bakes), src/features/rescue + hijack + agents (per-frame work: distance
checks over lists).

Owned files: tools/perf/**, test/perf-*.mjs, src/core/Quality.js, src/world/vegetation/**, src/world/islands/BlackwaterMesh.js,
src/features/naval/Naval.js (the ship cap and its culling only), src/features/trade/panel.js (DOM writes only),
src/features/seaplane/Cockpit.js (redraw gating only), src/features/agents/index.js + rescue/Rescue.js + hijack/index.js
(per-frame cost only: throttle scans), docs/PERF.md. Report App.js / Game.js patches under 200 words.

1. Measure first: the CPU scenarios gain a "wave 15 world" scenario (two tiles, the economy's rivals, a hijack, a
   rescue in progress, the agents, 12 AI ships) and report ms per module; the headless harness on Vulkan reports GPU
   memory and frame time for the home bay, Tidemark's quay and Blackwater's cove at Low / Medium / phone profile.
   Write the numbers into docs/PERF.md before and after.
2. Then cut: the biggest three CPU costs and the biggest three GPU costs you find. Likely: vegetation on the tiles
   (budget by distance band and quality; impostors past 120 m; phones at half), the Blackwater far mesh LOD, AI ship
   count (a cap by quality: Low 8, phones 6: the farthest non-mission ships sleep), the market window (write only on
   change: DomWrites.js style), the minimap's second bake chunked, feature scans throttled to 4 Hz.
3. Phones: the tile textures within the phone budget (globalThis.__phoneBudget), the two tiles' meshes at 3 m, and a
   memory check in the harness (--mobile) under the wave 12 numbers (GPU ~380 MB on an iPhone profile).
4. Tests: the new scenario is deterministic, the caps hold, the window writes only on change, the budgets per profile.
   Existing perf tests green. Vite build check. No browsers. Report under 250 words with the before / after table.
