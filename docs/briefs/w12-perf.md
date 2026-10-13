# Wave 12D: optimisation pass (CPU, memory, pipeline count)

Read docs/briefs/COMMON.md first (rules, root-owned files, style, no browsers / dev servers / npm install), then
docs/briefs/w4-perf.md and the PLAN's perf notes (what wave 4 did: matrices once per frame, shared pipelines, culling),
tools/perf/** (headless.mjs needs a Dawn build: see the PLAN note "parked"; heap-buffers.mjs), src/core/Quality.js, the
feature modules' update() paths (src/features/*/index.js), src/world/residents, src/features/naval (ships, Collisions:
O(n^2)), src/features/crew, src/world/vegetation, src/engine/render/MeshRenderer.js, src/engine/gpu/GPU.js (memory
accounting), src/App.js _frame (read only).

Owned files: tools/perf/** (new scripts welcome), src/core/Quality.js, and the hot paths you find inside feature / world
modules NOT owned by the other wave 12 workers (they own src/world/islands/**, src/features/pirates/**, src/features/seaplane/**,
destruction Sites/Kinds): everything else under src/features/** and src/world/** is yours for micro-optimisations that do
not change behaviour (tests must stay green). Report anything root-owned (App.js, Game.js, engine files) as patches.

User direction: "continue improvement and optimization". Measured facts: a desktop frame is CPU-bound in the busy
scenarios (wave 4 measured 17-26 ms CPU per frame in the all-features scenario); phones lag; boat swaps leak ~10 GPU
buffers each (count, not MB).

1. Measure first, headless: write tools/perf/cpu-scenarios.mjs that drives the feature update loops without a GPU
   (the node test harnesses already construct naval, crew, pirates, boarding, residents' schedules, trade, destruction
   headless) for 3600 simulated frames at 60 Hz with 12 ships, 20 raiders, 2 crew, trade sim, and reports ms per
   frame per module (performance.now around each update) plus allocations (--expose-gc, process.memoryUsage deltas).
   Commit the baseline numbers in tools/perf/README.md.
2. Fix the top offenders you find (expected: per-frame allocations in naval Brains / Collisions pair loops, residents'
   schedule lookups, trade market ticks, vegetation / impostor culling, string building for HUD text every frame).
   Rules: no behaviour change (tests green), no new dependencies, object pools / scratch vectors / early-outs /
   spatial hashing for the O(n^2) ship pair loop (a 64 m grid), HUD text only when it changes.
3. The boat-swap buffer leak: find the GPU buffers (uniform / draw buffers) not released in App.setBoat's dispose path
   (MeshRenderer caches by material id? per-mesh draw buffers?) and release them; verify with GPU.memory counts in a
   headless-free way (a node test that constructs and disposes a FleetBoatModel 20 times and counts the engine's
   buffer registry if it exposes one; else report the exact leak and the fix for root to verify in the browser).
4. The headless Dawn harness: find a `webgpu` npm build (check the installed version's dist for other platforms /
   newer versions on the registry WITHOUT installing: `npm view webgpu versions` is allowed, installing is not) that
   ships a Vulkan-capable dawn.node, and write the exact restore steps in tools/perf/README.md; if the D3D12 path only
   needs dxil.dll, say where a legitimate copy comes from (the DirectX Shader Compiler releases) and the exact
   command line.
5. Report: the baseline vs after table per module, the leak fix, the harness steps. Vite build check as in COMMON.md.
