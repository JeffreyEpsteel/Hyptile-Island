# Wave 18A: the whole game looks better (light, atmosphere, water, materials, grading)

Read docs/briefs/COMMON.md and w18-common.md first, then src/post/** (PostFX: the chain; GTAO, AirHaze, TemporalUpscale,
LensFlare, MotionBlur, Underwater, AntiAlias), src/sky/** (Sky, Atmosphere, Clouds, SkyProClouds, Environment), src/materials/
SceneLighting.js + GroundBounce.js + Materials.js, src/ocean/** (WaterMaterial, foam, shore waves), src/core/Quality.js (the
tiers and the phone profile), tools/perf/README.md (headless captures on Vulkan; --perf=views gives the home bay, Tidemark's
quay, Blackwater's cove).

Owned files: src/post/**, src/sky/**, src/materials/SceneLighting.js, GroundBounce.js, src/ocean/** (look only), src/core/
Quality.js (visual knobs only; keep the perf caps of wave 16C), tools/visuals/** (new: capture scripts), docs/VISUALS.md (new),
test/visuals-*.mjs (new). Do not edit materials of other features' meshes (report patches).

1. Capture a reference set first (headless, Vulkan, Medium and Low and the phone profile): the home bay at noon, golden hour
   and night; Tidemark's quay at noon and night; Blackwater's cove at dusk; underwater; a storm if the weather feature can be
   forced. Save to tools/visuals/out/before/ and READ them: write down what looks flat or wrong (exposure, colour, fog,
   shadow softness, AO halos, water colour and foam, sky banding, night too dark / too bright, light from lamps).
2. Then improve, with each change judged on the captures: a filmic colour grade per time of day (warm golden hour, cool
   blue night with readable silhouettes), exposure / tonemap tuning, aerial perspective and height fog that separates the
   islands, soft shadows and contact shadows where cheap, GTAO tuning (no halos), bloom on lamps and sun glints, sharper
   water: depth colour, subsurface tint in wave crests, foam lines at the shore and wakes, sun glitter; a better night sky
   (stars, moon light on the water); clouds with silver linings at golden hour. Keep each effect on a Quality tier (phones
   get the cheap ones only) and frame time within +0.3 ms on Medium (measure with the harness).
3. Captures after (same views) to tools/visuals/out/after/, a side by side contact sheet tools/visuals/out/compare.png,
   docs/VISUALS.md with the knobs and their tiers. Tests: the post chain composes on every tier, the grade LUT / curve is
   monotonic, no NaN in the sky at sun angles -5..90 deg. Existing render tests green. Report under 300 words.
