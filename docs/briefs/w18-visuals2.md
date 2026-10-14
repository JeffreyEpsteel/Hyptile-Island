# Wave 18F: visuals, second pass (the parts 18A left: shadows, water, materials)

Read docs/briefs/COMMON.md, w18-common.md and w18-visuals.md, then docs/VISUALS.md and tools/visuals/** (wave 18A's
headless capture tool: `node tools/visuals/capture.mjs` nine views per profile, before / after contact sheets; READ the
PNGs), src/engine/** (the renderer: shadow maps in SunShadows / the shadow pass, the PBR shading in the material shaders),
src/ocean/** (WaterMaterial: depth colour, foam, glitter, shore waves), src/materials/** (Materials.js shared PBR,
SceneLighting, GroundBounce), src/world/vegetation/** (read only: the plants' shading).

Owned files: src/engine/render/** and src/engine/shaders/** that implement shadows and the standard material (find them;
keep their public APIs), src/ocean/** (look only), src/materials/Materials.js, SceneLighting.js, GroundBounce.js, tools/visuals/**
(additive), docs/VISUALS.md (additive), test/visuals-*.mjs (additive). Worker 18C edits buildings and 18B people: their
meshes use createPropMaterial: improving the shared material improves them; do not edit their files.

1. Shadows: softer sun shadows (PCF / PCSS-lite with a penumbra that grows with distance from the caster), cascade
   blending without seams, contact shadows near the feet and under props on Medium and up; phones keep today's.
2. Water: a richer depth colour (turquoise shallows to deep blue), subsurface tint in the wave crests against the sun,
   crisper shore foam lines and boat wakes, sun glitter that sparkles, the night water catching the moon and lamp light.
   Investigate the lighter rectangle of water around boat hulls (seen in the at-sea capture before and after 18A): find its
   cause (a hull occluder / foam mask / depth prepass) and fix it.
3. Materials: a touch of specular / roughness variation on wood, cloth and stone (the vertex-colour aux layout of the prop
   material), rim light on characters at golden hour, wet sand darkening at the waterline.
4. Budget: Medium +0.4 ms at most, phones +0.1 ms; measure with the harness. Before / after captures and a contact sheet;
   existing render and post tests green; Vite build check. Report under 300 words with the image paths.
