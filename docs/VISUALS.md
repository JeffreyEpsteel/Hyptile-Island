# Visuals (wave 18A, 2026-10-14)

## Captures

    node tools/visuals/capture.mjs --dawn=<dawn dir> --profile=medium|low|high|phone --out=tools/visuals/out/after [--perf] [--ab] [--only=homeNight]
    node tools/visuals/contact.mjs [--profile=medium|low|phone]

The whole App on Dawn / Vulkan (dawn dir as in tools/perf/README.md), 1280x720, nine views: home bay at noon, golden
hour (17:33) and night (23:00), a fly-over of the home bay (16:00), Tidemark at noon and 22:00, Blackwater's cove at
dusk (18:21, from the dock), under water off the home pier, a storm on the launch (30 s of frames: a manual weather
pick eases in over ~25 s). Real textures: the JPEG / PNG blobs are decoded once by Windows GDI+
(`decode-images.ps1`, cache in %TEMP%\hyptile-visuals-images); the first run on a fresh cache draws them grey and says so.

`tools/visuals/out/before|after/<profile>-<view>.png`; `compare.png` (Medium), `compare-low.png`, `compare-phone.png`:
before left, after right, rows in the order above. The before set was rendered from a copy of the tree with this wave's
constants reverted, interleaved with the after runs. Tidemark rows also differ by wave 18C's town work (plaza,
fountain, houses), which landed between the two copies; that is not this wave.

## Knobs and tiers

| knob | where | value | tiers |
|---|---|---|---|
| time of day grade (split tone, golden warmth and saturation, night blue shift, rod desaturation, night floor) | `src/post/Grade.js`, `post.params.grade` (0 = off) | 1 | all (a few ALU in the final pass: <= 0.066 ms at 2560x1267, the timer's step) |
| grade weights | `PostFX.beginFrame` from the true sun (`atmosphere.sunDir`) and `G.night` | golden: sun -3..20 deg | all |
| night bloom (lamps, windows) | `post.params.nightBloom`: bloom x (1 + k night) | 1.6 | all |
| auto exposure reference | `post.autoExposure.ref` | 0.25 -> 0.22 (noon sand no longer clips) | all |
| night exposure ceiling | PostFX meter | 2.0 -> 2.6 | all |
| marine haze layer | `AirHaze.js MARINE` | 1.5e-4 / 110 m -> 2.1e-4 / 130 m | where the haze runs (all; shafts are Medium+) |
| moonlit horizon band | `Sky.js skyMoonSky` | x1.7 -> x2.6 near the horizon | all |

Unchanged and already good on the captures: water depth colour, crest translucency, shore foam, sun glitter, cloud
silver linings (forward phase + powder), underwater caustics, GTAO (no halos seen).

## Tests

`node test/visuals-grade.mjs` (grade monotonic per channel and in luminance on a 24-stop ramp at every blend, the looks
do what they say, WGSL mirrors the JS, every tier has its post switches), `node test/visuals-sky.mjs` (sky background,
LUTs and readbacks finite at sun -5..90 deg in five view directions). Existing: post-chain (air, under, noao,
waterline), sky-atmosphere, feature-night, ui-settings.

## Not done (owners)

- The launch shows a lighter rectangle of water around its hull at sea (before and after, storm view): a boat or water
  occluder mesh, not traced.
- Shadow softness / contact shadows: engine (`src/engine/render/Shadows.js`), root.
- A Settings slider for the grade: `src/ui/AppUI.js` (see the report).

## Wave 18F: shadows, water, materials (2026-10-14)

Pairs (before left, after right) in `tools/visuals/out/18f/`: `pair-launchSide.png`, `pair-launchStormGolden.png`,
`pair-seaGlitter.png`, `pair-homeGolden-shadows.png`, `pair-homeGolden-barrel.png`. New views in capture.mjs (`launchSea`,
`seaGlitter`, `seaNight`, `launchGolden`, then the storm ones last: weather leaks into the next view; `launchRough`,
`launchSide`, `launchStormGolden`), `--ab-soft`, `--eval`, `--place`, `--water-hull`, and `tools/visuals/crop.mjs` (zoomed side by side).

- The lighter rectangle around hulls: the sea discards its pixels where the hull-volume mask is in front of them (so the boat
  shows instead of a sea surface through it); the lofted volume stands proud of the launch's gunwale and stern, and there the
  discard opened a window onto the seabed (green / cyan block, seen in rough water and from outside). Now the discard only
  happens where the opaque pixel behind is above the volume's lowest corner (`SceneRenderer.hullMaskKeel`, `hullKeel` in the
  water block). Seen gone in `pair-launchSide` and `pair-launchStormGolden`.
- Shadows (Medium and up, via `SunShadows.setSoft` / the refit periods Quality sets; phones and Low keep the old filters):
  bilinear taps with a receiver-plane depth bias, contact hardening on the second cascade too (the penumbra grows away from
  the caster), the sun disc 1.3x, a wider 5-tap PCF beyond. A/B on the harness is inside its noise (+-0.5 ms).
- Water (Medium and up; phones keep the plain glint): sun / moon glitter sparks near the camera, a stronger greener crest
  translucency.
- Materials: `MATERIAL_DETAIL` (not on phones): +-12 % roughness / +-20 % specular noise on rough dielectrics and the splash
  zone (darker, glossier, last 0.55 m above the sea). Character rim at golden hour (`CHARACTER_RIM`, strength
  `SunShadows.rim`; skinned materials only; 0 = off).
- Test: `node test/visuals-shadows.mjs` (block layout, soft level follows the tier, phones never soft).
