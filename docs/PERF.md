# Performance (wave 4, 2026-10-13)

The owner reported ~24 fps with everything on. This file records how it was measured, what was cut, and the
numbers before and after. Raw reports: `tools/perf/out/perf-guard.json` (the guard run below); the full runs
were written to a scratch folder with `--out` and are reproduced by the commands here.

## How it is measured

`node tools/perf/headless.mjs` boots the whole App in Node on the real GPU through Dawn (`tools/perf/headless-env.mjs`
stands in for the browser: DOM, canvas, fetch of `public/`, 2x2 grey images), starts a sandbox session like `?bench`,
and runs the perf scenarios of `tools/perf/scenarios.js` with the bench's per-pass GPU timestamps. New in the runner:
CPU time and draw count per mesh pass (`pass:<label>`, `draws:<label>`), `--baseline` (all of the work below off:
the "before" column), `--quality=low|medium|high|ultra`, `--shot=file.png` (a picture to compare; `tools/perf/pngdiff.mjs`),
`--trace-pipelines`, `--trace-calls`. `node tools/perf/table.mjs a=run1.json b=run2.json` prints the table.

    copy node_modules/webgpu/dist/win32-x64/* and C:/Windows/System32/vulkan-1.dll into <dawn dir>
    node tools/perf/headless.mjs --perf=every --quality=high --dawn=<dawn dir> --backend=vulkan --tag=high --out=<dir>
    node tools/perf/report.mjs <dir>/perf-high.json

Why Vulkan: the npm Dawn build compiles WGSL with FXC on D3D12, which took over 20 minutes for this game's pipelines
(it never finished); Chrome's own DXC was refused by that Dawn build. Vulkan compiles everything in ~20 s.

Machine: the owner's laptop, Ryzen AI 7 350, RTX 5070 Ti Laptop (measured) and Radeon 860M (Dawn's Vulkan driver lost the
device on it: no iGPU numbers). Output 2560x1267. CPU numbers vary up to 2x between runs on this shared machine (other
workers were building at the same time): compare columns of the same run pair, and the draw counts, which do not vary.

Caveat: the CPU time per draw call in Node (Dawn's N-API bindings, 1-2 us per encoder call, `--trace-calls`) is probably
higher than Chrome's; the GPU numbers are the real GPU's.

## Results (mean ms per frame, CPU / GPU, RTX 5070 Ti, 2560x1267)

| scenario | before (run 1) | before (run 2) | High (run 1) | High (run 2) | Medium | Low |
|---|---|---|---|---|---|---|
| navalFight | 29.0 / 6.6 | 17.5 / 6.8 | 18.2 / 6.5 | 12.0 / 6.6 | 12.6 / 5.5 | 12.7 / 3.9 |
| storm | 24.8 / 6.7 | 14.3 / 6.9 | 17.8 / 6.6 | 11.0 / 6.7 | 11.6 / 5.4 | 12.2 / 4.1 |
| night | 36.4 / 7.9 | 24.1 / 7.3 | 21.9 / 6.5 | 13.6 / 6.8 | 13.2 / 5.6 | 13.5 / 4.2 |
| crowd | 55.8 / 8.4 | 31.9 / 8.4 | 30.3 / 7.5 | 23.5 / 7.3 | 21.6 / 6.2 | 18.7 / 4.9 |
| all | 45.3 / 7.9 | 25.5 / 7.7 | 25.9 / 7.1 | 21.6 / 7.3 | 22.4 / 6.0 | 19.1 / 4.7 |

Guard run (`--perf=all --quality=high`, tools/perf/out/perf-guard.json): 17.4 / 7.6 ms. Start-up (App.init in Node):
44 s before, 23 s after (half the pipelines: shared shaders).

Draws per frame, same runs (stable):

| pass | all: before -> High | crowd: before -> High | crowd: Low |
|---|---|---|---|
| opaque | 205 -> 165 | 326 -> 168 | 167 |
| shadow cascade 0 / 1 / 2 | 164 / 87 / 53 -> 131 / 77 / 51 | 274 / 164 / 86 -> 168 / 131 / 68 | 152 / 51 / 26 |
| refraction | 111 -> 91 | 32 -> 32 | 31 |

## Where the time was (before, 'all' and 'crowd')

The frame was CPU bound: the GPU took 7-9 ms, the CPU 25-55 ms. Of the CPU, 75-80 % was the mesh passes (opaque 10-14 ms,
shadow cascades 12-20 ms together, refraction 3-6 ms) for only 300-800 draws: every pass recomposed every object's world
matrix (`scene.updateMatrixWorld()` in each collect), and every skinned mesh (44 residents, the crowd, Roid) had
`frustumCulled = false`, so each was drawn in all three shadow cascades and the main pass wherever it stood. Everything
else: remote players 1.3-2.8 ms (12-16 stand-ins), post 1.0-1.3, residents 0.6-1.1, game 0.2-0.7, boat physics 0.5,
naval 0.2-0.5, wildlife (gull flocks) 0.3-0.5, rocks 0.3, caustics 0.3, fft 0.2, clouds 0.2, night 0.2, avatar (skinning)
0.2, dressing 0.07, vegetation 0.04, vfx 0.03, destruction / Rapier < 0.02 (asleep), terrain + CDLOD 0.1, ocean LOD 0.1,
water query 0.1, shore sim 0.08. Islands 5-8 already cull themselves by distance (IslandKit) and cost nothing measurable.
GPU ('all', before): opaque 2.1, refraction 1.1, water + transparent 1.05, TAAU 0.5, clouds 0.5, shadows 0.6, haze 0.3,
AO 0.2 + 0.3 composite, final 0.2, ocean FFT 0.1.

Also found: below ~26 fps the shadow code saw the day's sun move more than 1e-4 rad per frame and re-rendered all three
cascades every frame (3 passes instead of 1.75): a slow frame made the next one slower.

## What changed

Engine (all of it at every tier, the look unchanged: shots before/after: crowd 0.012/255 mean difference, no pixel over 24; naval fight 0.23/255, 0.16 % of pixels over 24, the gun smoke):
- MeshRenderer: world matrices once per frame; world bounding spheres cached per frame; identical materials share shader
  modules and GPU pipelines (the uniform struct name no longer carries the material id); never-updated geometry draws from
  one interleaved vertex buffer (1 setVertexBuffer per draw instead of up to 6; the first update unpacks it); redundant
  vertex / index buffer binds skipped; reusable dynamic-offset array; `cullDistance` / `cullRadius` on any object skips its
  subtree beyond a distance (x `distanceScale`); a size cull (a mesh under `minPixels` on screen) and a caster cull in shadow
  passes (bounding radius under 0.75 texel).
- Skinning: a culling sphere fitted round the joints each update; skinned meshes are frustum culled like the rest.
- Shadows: the sun-moved test is against the last full refit (0.3°), `setSize`, `setReach`, `periods` per tier.
- Residents: `setRadii( { animate, update, hide, shadow } )`; no sun shadow beyond 40 m (High).
- LocalLights `limit`, PostFX `setAO`, night `setLow` (run-time budgets).

Auto quality (`src/core/Quality.js`, `app.quality`): tiers Low / Medium / High / Ultra set render scale range, shadow
map size and reach, AO, sun shafts, motion blur, water reflections, TAA phases, particle (vfx) and night budgets, lamp
count, draw distance scale, resident radii, far-cascade periods. High is the old look. Auto (default) judges 2 s windows:
over 112 % of the target frame time steps the render scale down 0.1, then the tier, then the target to 30; under 68 % of
it (busy time: max of CPU and sampled GPU time) for two windows steps up, never above the chosen tier; reversals double
the wait. First run: a ~1 s GPU probe picks the start. `?quality=low|medium|high|ultra|auto|off`; the Performance tab shows
"Now: Auto · High 90% · 58 fps / 60 · GPU 7.1 ms", the Auto switch, the 60/30 target and the presets.

## Guardrails

`test/perf-scenarios.mjs`: the QualityLoop state machine (steps, ceiling, hysteresis, 30 fps floor, probe, persistence,
URL override, the apply to every system), and the 'all' scenario's CPU budget (30 ms mean, Node + Dawn on this machine)
from `tools/perf/out/perf-guard.json` when a guard run exists.

## Not verified

- The browser: no dev server or browser was used. Chrome's per-call cost, its adapter choice and the HUD line are unchecked.
- On Windows Chrome may run WebGPU on the integrated Radeon 860M regardless of `powerPreference` (it has ignored it on
  Windows); if the 24 fps is the iGPU, the auto loop's Low / Medium tiers are what helps (GPU -18 % / -36 % here), and
  setting Chrome to "High performance" in Windows Settings > Display > Graphics moves it to the RTX.
- iGPU numbers (Dawn Vulkan lost the device on the 860M).

# Wave 16C (2026-10-14): two tiles, more ships, more plants, phones

## How it was measured

- GPU: `node tools/perf/headless.mjs --perf=views` (on foot at noon at the home bay, Tidemark's quay and Blackwater's
  dock over the cove), RTX 5070 Ti on Vulkan. Low and Medium at 1920x1080; "phone" = `--mobile --real-sizes --quality=low
  --size=852x393` (MOBILE.phone: Low at 70 %, 512 px shadow cascades, the phone texture caps and PHONE_BUDGET). Before =
  a copy of `src` with this wave's files restored (`tools/perf/out/before`), after = the tree; the two interleaved, two
  rounds each, means. Memory = GPU.memory with each place up (the views build their islands on arrival).
- CPU: `node tools/perf/cpu-scenarios.mjs` (sea, shore and the new **wave15**: the sea fight in the two-tile world, the
  rivals sailing, the harbour agents, a wanted stolen hull, a rescue under way, 12 AI ships), ms per module, median of 3;
  and the per-feature scopes of the views above (`tools/perf/out/cpu-w16-before.json`, `cpu-w16-after.json`). The runs are deterministic: the end-state fingerprints before / after
  are equal (sea 44372.096037, shore 43596.037020, wave15 44781.317697) without a ship cap.
- What each vegetation layer costs: `--hide=<name>` runs (Low, GPU ms saved when hidden: impostor crowns 0.04 - 0.18,
  palms 0.09 - 0.11, grass 0.06 - 0.12; all vegetation 0.24 - 0.47 = 8 - 16 % of the GPU frame, 64 MB of GPU memory
  on desktop, 29 MB on a phone).

## Where the time was (before)

CPU per frame at the views (Node + Dawn, 7 - 11 ms): scene render 2.3 - 4.1 ms and shadows 1.3 - 1.8 ms (the engine's
mesh passes, root's), then residents 0.2 - 0.4, wildlife 0.2 - 0.4, post 0.35, naval 0.16 - 0.23, melee 0.25 at
Blackwater, seaplane 0.06 - 0.16, rescue 0.02, hijack 0.017, agents 0.002. The feature logic of wave15 is 0.09 ms
(naval 0.05, trade 0.02, crew 0.02). Not visible headless but counted: the trade window rewrote 1,071 DOM values per
refresh (twice a second while open), and the cockpit redrew its canvas, uploaded it and rebuilt its mips 10 times a
second in first person even moored with the engine off.
GPU (Low): the opaque pass 0.5 - 1.1 ms, clouds 0.3, water + transparent 0.2 - 0.7; the vegetation's share above.
The far impostor crowns of all three islands (21,559) drew everywhere out to 2.8 km.

## What changed

- Vegetation distance bands (`VegType.setReach`, applied by Quality from the tier's draw distance, `min( 1, draw )`:
  Low 0.55, Medium 0.75, phone 0.44, High / Ultra 1 = unchanged): the far crowns' and palms' fade window scales and the
  instances past it are left out of the far buffers (no vertices, no fragments); the fading understory and the palms'
  near range scale with max( 0.7, k ). The impostor bake's depth buffer is freed once the bake is done (11.2 MB desktop,
  2.8 MB phone).
- Phones (PHONE_BUDGET): half the tiles' plants (a fixed half by position; the home island untouched), a 512 px leaf
  atlas (5.3 -> 1.3 MB), grass masks at 4 m (6.9 -> 1.7 MB).
- Naval: `setShipCap( n )` (Quality: Low 8, Medium 12, phones 6, High / Ultra none). Past the cap the farthest ships with
  no business (patrol / lane / moored, no bounty, hunt, raid, rescue, prize or remote puppet), beyond the 600 m draw
  range, sleep: they think and sail at ~4 Hz with the time they missed, out of the query list.
- Trade window: every field written only on a change. Cockpit: a timed redraw is skipped when the face (snapshot to
  1/100) is unchanged. Rescue: situation() at 4 Hz (every frame while F is held). Hijack: the mail and skiff scans at 4 Hz.

## Before / after

| place | GPU ms Low | Medium | phone | GPU MB Low | Medium | phone | plant triangles Low / phone |
|---|---|---|---|---|---|---|---|
| home bay | 3.02 -> 2.87 | 3.97 -> 3.93 | 1.99 -> 1.93 | 694.5 -> 683.3 | 735.8 -> 724.6 | 391.2 -> 379.1 | 841k -> 557k / 854k -> 575k |
| Tidemark quay | 3.00 -> 2.84 | 3.70 -> 3.66 | 2.12 -> 1.88 | 716.3 -> 705.1 | 752.8 -> 741.5 | 405.8 -> 393.7 | 477k -> 204k / 479k -> 129k |
| Blackwater cove | 2.91 -> 2.81 | 4.00 -> 3.97 | 1.81 -> 1.62 | 720.9 -> 709.6 | 757.1 -> 745.8 | 413.2 -> 401.1 | 343k -> 163k / 355k -> 140k |

Vegetation GPU memory 60.6 -> 49.4 MB (desktop), 29.3 -> 17.2 MB (phone). Far crowns drawn on a phone: 21,559 -> 18,876
at home, 4,002 at Tidemark, 2,003 at Blackwater.

| CPU | before | after |
|---|---|---|
| wave15 naval, ms / frame (no cap / cap 8 / cap 6) | 0.050 | 0.050 / 0.050 (4 asleep) / 0.046 (6 asleep) |
| wave15 all features, ms / frame | 0.090 | 0.089 (same fingerprint) |
| hijack at the views, ms / frame | 0.015 - 0.018 | 0.011 - 0.014 |
| rescue at the views, ms / frame | 0.020 - 0.022 | 0.022 - 0.026 (noise: the rest is Floaters / flares, 16A's) |
| trade window DOM writes per refresh (unchanged market / after a purchase) | 1,071 / 1,071 | 0 / 20 |
| cockpit redraws per second, first person, moored, engine off | 10 | 0 (in flight: as before) |

CPU frame times at the views moved within this shared machine's noise (7 - 12 ms either way): the frame is the engine's
mesh passes, not these systems.

## Phones

GPU memory at the home bay is now 379 MB, under wave 12's 387 MB; Tidemark's quay 394 and Blackwater's cove 401 MB stay
over it. What the islands add on arrival is theirs (`--mem-diff`: SaltmarshKeyProps 4.2 MB, tidemark_wood 3.2, the
Tidemark town and terrain meshes ~2.8, BlackwaterProps 1.3, glb# 3.3) and the terrain's textures (terrainHeights
18.6 MB, r32float, with 2.6 MB of tile rows; terrainShoreField 6.5): owners' follow-ups. Both tiles' near meshes are
already 3 m on phones (Blackwater.js / Tidemark.js); Blackwater's far mesh is 0.1 MB and one draw (left as it is).

## Not verified

- No browser: the DOM writes, the cockpit's canvas and texture uploads and Chrome's per-draw cost are counted, not timed.
- The ship cap's effect in a real raid (20+ hulls): wave15 has 12 ships, most within the draw range.
- The minimap's second bake (src/game/Minimap.js, not this wave's file) was not measured.
