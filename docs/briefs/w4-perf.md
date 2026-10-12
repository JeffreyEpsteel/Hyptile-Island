# Wave 4: performance (the user gets ~24 fps on their PC with everything on)

Owned files: src/core/**, src/engine/**, src/post/**, src/ocean/**, src/sky/**, src/world/** EXCEPT src/world/start/** and
src/world/islands/** (report patches for those), src/materials/**, src/fx/**, src/ui/AppUI.js (presets section),
src/features/vfx/**, src/features/night/**, src/features/dressing/**, src/features/life/**, tools/perf/**, test/perf-scenarios.mjs,
test/engine-smoke.mjs. Everything else: report a patch with the measured saving.

1. Measure first: the perf harness (tools/perf, `?bench&perf=all`, src/core/Profiler.js GPU scopes, Bench reference
   views). Run it headless where possible (Dawn through the engine-smoke harness) and record per-system CPU and GPU
   cost for: terrain + CDLOD, ocean + WaterQuery, shore, vegetation, residents (44 now, with schedules), dressing,
   islands 5-8 scenery (sky isles, waterfalls, mangroves, basalt columns), destruction instancing + Rapier step,
   vfx, night plankton/glow, gull flocks (Gulls + GullCues), naval ships + puppets, post (TAA, bloom, DoF, underwater),
   skinning (player + remote + residents), shadows. Write the numbers to docs/PERF.md (before/after table).
2. Cut the big ones without changing the look at the default preset: distance culling and LOD for every island's
   scenery and props (nothing from an island 500 m+ away should cost draw calls except its horizon silhouette), a resident
   animate/skin radius and a cheap far pose, instanced draw merging, particle budgets by preset, shadow cascade/resolution
   by preset, WaterQuery count, CPU work scheduling (stagger expensive updates across frames), avoid per-frame
   allocations in hot loops, Rapier stepping only when something is awake.
3. Auto quality: app.quality (src/core/Quality.js) with tiers (Low / Medium / High / Ultra) that set render scale, shadow
   quality, post effects, particle and light budgets, draw distances, and an auto mode (default on) that measures frame
   time over ~2 s windows and steps the tier / render scale down (and back up) to hold a target (60 fps default, 30 on
   weak GPUs); a first-run probe picks the starting tier from a 1 s GPU timing. Expose a HUD line in the F1/settings and
   a `?quality=low|auto` override. Presets in AppUI drive it.
4. Guardrail: a node test on the quality state machine and a perf-scenarios check that the "all" scenario's CPU time
   per frame stays under a budget you set from the measurements.
Report: the before/after numbers per scenario, the patches you need in files you don't own, and anything unverified.
Under 400 words.
