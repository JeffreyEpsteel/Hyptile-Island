# Night as Hyptile Island's visual identity

Owned files: src/features/night/** (Glow.js, NightCurve.js, Plankton.js exist, ~590 lines), test/feature-night.mjs.
Read-only: src/ocean/*, src/sky/*, src/game/ports/* and src/world/islands/GullRock.js (lighthouse), src/features/weather/*.
Read the Unreal intent first (grep D:\fishing game\knowledge and UpsideDownFishing docs for night, lantern, glow, bioluminescence).

1. Expose a smooth nightFactor (0 day -> 1 deep night, dusk/dawn ramps) from the time of day / sky / weather WorldLink.
2. Bioluminescence: glowing plankton in boat wakes, around moving hulls, around the bobber and where fish bite, in
   breaking surf near the reef - additive particles or emissive quads on the water (your own meshes; report a patch only
   if an ocean shader hook is truly needed).
3. Gull Rock lighthouse: a rotating beam (soft cone or crossed gradient quads sweeping the water, visible from far) plus a
   lamp light at the lantern position.
4. Lantern glow: warm point lights and halos on docks, stalls, Roid's yard, boats' running lights at night (within the
   local light budget - read how localLights are culled), fireflies over vegetation near paths, moon glint if cheap.
5. Night fishing: a gentle visual cue only (lantern-lit bobber).
6. Fades out and stops updating in daylight; one or two particle draws; respects a low preset.
Report root patches (install.js MODULES entry, render hook).
