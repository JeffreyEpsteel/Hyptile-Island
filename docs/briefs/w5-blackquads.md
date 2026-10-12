# Wave 5 (alpha feedback): black squares after dying; rain while the HUD says Clear

User report with two screenshots: after dying (the death feature, src/features/death) and respawning at Jade Landing,
large solid-black axis-aligned squares/rectangles appear in the world at random places (several at once, 2-6 m across,
some floating above the sand, some overlapping), while it is raining although the weather HUD says "Clear 12 m/s"
(the user's screenshots were taken at the home beach in Sandbox).

Owned files: src/features/vfx/**, src/features/death/** (Overlay.js, Crate.js, Spot.js), src/features/weather/**, src/features/life/**
(Decals.js), src/features/night/**, src/fx/Vfx*.js, src/engine/** ONLY if the cause is there (report the patch with evidence
instead if you can fix it in a feature), tools/perf/headless.mjs (use it to reproduce), test/feature-vfx.mjs, test/feature-death.mjs,
test/feature-weather.mjs, test/feature-life.mjs.

1. Reproduce headlessly: tools/perf/headless.mjs boots the whole App in Node on the real GPU (read its header; use
   --backend=vulkan as docs/PERF.md says). Script: load sandbox at the home beach, set rain through the weather feature,
   emit playerDied at sea, let the cut finish, respawn, then screenshot several times over 20 s and look at the PNGs.
   Suspects for black quads: vfx billboards drawn with a missing/unbound atlas texture or a NaN size (the death cut, the
   respawn teleport or the quality tier change at Low may re-create buffers), the death feature's crate/spot meshes or
   its screen overlay quad drawn in the world, life's puddle/footprint decals under rain with a broken material, night's
   halos in daylight, or an engine pipeline-sharing change from wave 4 (src/engine: identical materials now share
   pipelines - a material with a different texture binding may be sharing wrongly: check the sharing key includes the
   texture bindings and blend mode). Find the actual cause with evidence (which draw produces the quad), fix it, and
   add a regression test (headless render diff or a logic check).
2. Rain vs "Clear": find why rain renders while the weather state reports clear (RainFX intensity not following the
   schedule after a manual change / sandbox setManual, or the death respawn resetting the weather state but not the FX,
   or the wind readout). Fix and test.
3. While there: ensure the death cut (Overlay.js) is above every other panel including the welcome guide, and that the
   dying timer advances even if the guide is open (root found the guide pauses features.update: the cut must finish).
Report under 300 words with the root cause of each.
