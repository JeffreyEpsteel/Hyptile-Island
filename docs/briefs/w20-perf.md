# Wave 20A: phone headroom and the CPU frame at the towns

Read w20-common.md, docs/PERF.md (wave 19A: tables, "Patches proposed", "Not verified"), tools/perf/README.md.

Owned: src/world/islands/Tidemark.js + Blackwater.js (near-mesh release only), src/world/village/TownKit.js,
src/game/StallKit.js, src/core/Quality.js, tools/perf/**, test/perf-*.mjs, docs/PERF.md, src/features/townlife/** (draw
batching only), src/world/interiors/** (load / unload budget only).

1. Apply 19A's proposals that are still open: far towns release their near meshes on phones beyond ~1.5 km and rebuild on
   approach (no hitch: spread the rebuild over frames, colliders kept), TownKit flower boxes / planters skipped or
   simplified on phones, a stallTexture phone key. Measure the GPU memory after (the four views + an interior).
2. The CPU frame: Medium at Tidemark's quay is 18-19 ms in Node with the GPU at 3.9 ms. Profile it (tools/perf
   cpu scenarios: wave18 + a new wave19 scenario with the navy, crew aboard, a front and an interior nearby) and cut the
   top costs: draw-call merging / instancing of townsfolk and kit props, per-frame allocations, update throttles for far
   AI ships (navy and pirates), crew and townlife ticks at distance. Target: the Medium town frame under 12 ms in Node
   without visual change; before / after tables in docs/PERF.md and contact sheets (nothing looks worse).
3. Tests: budgets per tier, the release / rebuild round trip, the new scenario deterministic.
