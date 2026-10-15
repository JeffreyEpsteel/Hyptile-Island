# Wave 24D: graphics that hold up next to a polished game

Read w24-common.md, then the renderer: src/engine/** (render passes, shadows, materials, lights), src/post/** (temporal
upscale, bloom, grade), src/materials/**, src/ocean/** (look only), src/world/vegetation/**, the sky and clouds, the
terrain shading (src/world/Terrain*.js, TerrainShading), src/core/Quality.js (tiers), docs/VISUALS.md, docs/PERF.md, the
wave 18 work (Grade.js, contact-hardening shadows, rim light), tools/visuals/capture.mjs and its views.

Owned: src/engine/render/**, src/post/**, src/materials/**, src/world/vegetation/**, sky / cloud / fog code you find (name
it), terrain shading files (shading only), src/core/Quality.js, docs/VISUALS.md, tools/visuals/**, test/visuals-*.mjs.
Ship materials belong to 24C, car / helicopter interiors to 24A, UI to 24F.

1. Baseline: capture every view of tools/visuals/capture.mjs on Medium, High and phone (before set), and write down what
   reads as amateur in each (flat ambient light, no AO, hard shadow edges, plastic materials, banding, aliasing, harsh fog,
   empty sky, static vegetation, characters without skin shading...).
2. Improve, highest impact first: ambient occlusion (GTAO or SSAO, half-res, temporally stable), better sky light / a
   probe-based ambient (or a baked sky irradiance), shadow quality and cascade blending, physically plausible materials
   (roughness / metalness ranges, detail normals, wet surfaces in rain), volumetric-looking fog and god rays, a richer sky
   with layered clouds that move with the weather fronts, vegetation that sways with translucency, character shading
   (subsurface-ish skin, rim), anti-aliasing quality (temporal stability), colour grading per time of day, water's
   shoreline foam and colour (ask 20A's work in docs/PERF.md for costs).
3. Tiers: High gets the expensive versions, Medium the balanced ones (no slower than today at the towns), Low and phones
   keep within their budgets. After captures at the same cameras for every tier, side by side (contact sheets), READ them;
   tests for the tier switches and that the passes compose.
