# Wave 10C: lamps that light the water

Read docs/briefs/COMMON.md first (rules, root-owned files, style, no browsers / dev servers / npm install).
Owned files: src/ocean/WaterMaterial.js (and any WGSL module file it alone imports under src/ocean/), test/water-*.mjs if
one exists for the shader source (a plain node test that composes the WGSL and checks the strings is enough). Read, do not
edit: src/materials/LocalLights.js (the `localLights` uniform block: pos[8] (xyz + range^2 in w), col[8], dir[8] with the
spot cones, count, the flashlight flashOn / flashPos / flashDir / flashCol / flashCone, and `localLightsSpotProfile`),
src/engine/render/wgsl/lighting.js (how hookLocalLights accumulates point / spot light into LightAccum for the standard
materials: the water must match that look), src/materials/SceneLighting.js (how the module is attached).

User feedback (verbatim): "I want the light to actually illuminate the surrounding areas, not be useless." The lamps now
light decks, hulls, sand and pier posts (the standard materials take hookLocalLights), but the sea does not take local
lights at all, so a boat at night sits in a black pool and the flashlight beam stops at the waterline.

1. Make the water surface take the same local lights: in WaterMaterial's fragment lighting, after the sun / sky terms,
   add the point / spot contributions from the `localLights` block (attach the module the way SceneLighting attaches it
   to the standard materials, or read its uniforms directly if the water builds its own bindings): for each light within
   range (smooth window falloff like lighting.js) a diffuse term on the wave normal (wrap it a little: water is a
   scattering surface, use N.L * 0.5 + 0.5 scaled down) tinted by the water's near-surface colour, plus a specular glint
   (the same GGX / Blinn the sun uses, with the light's colour and a roughness floor so the glint is a soft streak on
   choppy water, a tight dot on calm), and the flashlight cone the same way. Range, cone and colour come from the block;
   intensity is the block's (already night-scaled by LocalLights.update). Keep the total within the HDR range the sun
   uses (the auto exposure must not pump when a boat lamp enters the frame: clamp the sum to ~2x the sky term).
2. Underwater: when the camera is below the surface the lamps above should still light the surface from below weakly
   (0.3x) so a lit boat is visible from under water; no caustics work.
3. Cost: at most 8 lights + the flashlight per pixel, a single loop; skip the loop entirely when localLights.count == 0
   and the flashlight is off (uniform branch). Phones (globalThis.__phoneBudget, or a define the material already has for
   low quality) get the loop too but with the specular term only (cheaper).
4. Verify: a node test that composes the water shader source and asserts the local-light loop and the flashlight term are
   present and that the WGSL still parses structurally (balanced braces; use the project's shader compose helper if it
   runs headless: look at test/ for an existing shader-compose test to copy). Vite build check as in COMMON.md.
   Report (under 200 words) what you changed, the terms used, and anything root must wire.
