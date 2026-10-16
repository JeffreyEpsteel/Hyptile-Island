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

# Wave 19A (2026-10-15): phones and frame time after wave 18; wet sand

## How it was measured

- GPU: `node tools/perf/headless.mjs --perf=views` on the RTX 5070 Ti (Vulkan): the home bay, Tidemark's quay, **Tidemark's
  square** (new view `tidemarkSquare`: noon, wave 18's townsfolk, the TownKit dressing, a cutlass drawn) and Blackwater's
  cove, in that order (a place stays loaded when the next is visited, as when sailing). Low and Medium at 1920x1080, phone =
  `--mobile --real-sizes --quality=low --size=852x393`. Before = `tools/perf/out/before-w19` (the tree with this wave's five
  src files restored, junction to `public`; removed after the runs with `rmdir` on the junction first), after = the tree, interleaved per profile. New in the harness: triangles per
  pass (`tris:<pass>`, printed with the draws), the JS heap after init in the report (`jsAfterInit`), `--log-fetch` (the
  files a place fetched on arrival, with `--mem-diff`), `tools/perf/pairs.mjs` (before / after sheets from any two folders).
- CPU: `node tools/perf/cpu-scenarios.mjs --scenario=wave18` (new **wave18**: Tidemark's square at noon in the two-tile world,
  75 townsfolk on stand-in avatars with the NavGrid built, the cutlass drawn through weapons / firearms / melee, the harbour,
  trade with rivals, destruction, 12 ships; deterministic: fingerprint 54670.392571 at 300 frames, `test/perf-w19.mjs`).
  Report: `tools/perf/out/cpu-w19.json`. Phone runs: `tools/perf/out/perf-phone-w19-before.json`, `perf-phone-w19.json`.

## Before / after (one interleaved round; GPU ms mean, CPU ms mean in Node + Dawn, draws, triangles, GPU memory MB)

| place | Low GPU | Medium GPU | phone GPU | Medium CPU | Medium draws / tris | phone MB |
|---|---|---|---|---|---|---|
| home bay | 2.94 -> 2.93 | 4.08 -> 4.07 | 1.83 -> 1.82 | 15.6 -> 18.0 * | 352 / 5.85 M -> 354 / 5.87 M | **378.9 -> 354.3** |
| Tidemark quay | 2.96 -> 2.91 | 4.02 -> 3.88 | 1.93 -> 1.95 | 21.3 -> 19.3 | 536 / 6.30 M -> 508 / 5.93 M | **401.5 -> 377.0** |
| Tidemark square | 2.91 -> 2.92 | 4.17 -> 4.02 | 1.89 -> 1.93 | 18.9 -> 15.8 | 433 / 5.90 M -> 410 / 5.66 M | **401.7 -> 377.2** |
| Blackwater cove | 3.02 -> 3.02 | 3.95 -> 3.88 | 1.55 -> 1.56 | 14.2 -> 11.3 | 184 / 2.55 M -> 171 / 2.52 M | **411.8 -> 382.1** |

Low / Medium GPU memory is unchanged (683 - 756 MB, desktop budgets). Phone peak (after the phone tier) 436.0 -> 407.5 MB, the
run's peak 417.7 MB. JS heap after init 299 MB desktop, 290 MB phone (unchanged: the roster clips were not stripped).
Phone triangles 4.92 / 4.10 / 3.84 / 2.10 M, phone CPU 10.8 - 13.7 ms (unchanged within noise). \* CPU in Node varies
+-20 % between runs on this shared machine; townlife at Tidemark on Medium 1.25 -> 0.85 ms (16 bodies, was 24).

| CPU wave18 (3600 frames, median of 3) | ms / frame | KB / frame |
|---|---|---|
| all features | 0.193 | 71.9 |
| naval / townlife / trade | 0.054 / 0.053 / 0.038 | 38.9 / 19.7 / 0.6 |
| weapons / firearms / melee | 0.003 / 0.003 / 0.009 | 0.06 / 0 / 0.6 |

Wave 18's own logic is small: townlife's sim 0.05 ms (the full avatars' animation is the rest of its 0.8 - 1.2 ms in the
views), weapons and firearms with a cutlass drawn ~0.006 ms.

## What changed

- Phones (PHONE_BUDGET, src/core/Quality.js): `halfTerrain` - the terrain's height atlas r16float (18.6 -> 9.3 MB) and its
  shore field rgba16float (6.5 -> 3.3 MB), rounded to nearest (<= 1.6 cm below 64 m, 12 cm on the 300 m peak; textureLoad,
  no WGSL change; src/world/TerrainGPU.js `toHalfArray`); `sunShadow: 256` - the heightfield sun shadow at 8 m cells and
  heights (2.7 -> 0.7 MB); `charTexture` 256 -> 192 px; `impostorFrame` 64 -> 40 px (the far crowns, 7.4 -> 2.9 MB).
- Townsfolk drawn as full avatars per tier (`townBodies`, Quality -> townlife.bodyCap): Low 12, Medium 16, High / Ultra 24
  (as wave 18 left it), phones 8; the others stay the instanced crowd.
- Wet sand (every tier, no extra pass): the terrain shader's damp band now runs ~1.5 m up the beach (1.2 m in a sheltered bay
  to 1.6 m where the swell runs up: the shore field's exposure, one 4-load lookup), darkest and glossiest at the edge
  (roughness 0.45 -> 0.2, 0.14 under the swash), drying back in mottled patches; the ShoreSim's run-up still wets it fresh.
  The tile islands bake the same band into their vertex colours and roughness (town/TerrainMesh.js, BlackwaterMesh.js: no
  shore sim there, it holds still).

## Patches proposed (not applied; owners' files): more phone headroom

- src/features/notices/NoticeBoard3D.js: on phones draw the three boards at half size (`capImage( drawBoardPixels( ... ), TEX_W / 2 )`
  at the texture's creation, line `this.tex = new Texture( { label: \`noticeBoard.${ port }\``, and at the re-upload): 9.3 -> 2.3 MB.
- src/world/islands/Tidemark.js / Blackwater.js: on phones release a town's near meshes (shells, kit, props, near terrain;
  ~13 MB for Tidemark) beyond ~1.5 km and rebuild them on approach.
- src/world/village/TownKit.js `build()`: on phones skip the flower boxes and planters (1,596 / 1,212 vertices each, the most
  per piece) - the merged Tidemark kit is 3.5 MB.
- src/game/StallKit.js: a `stallTexture: 128` phone key for the three 5 MB stall arrays (-11 MB; a visible softening up close).

## Not verified

- No browser or phone: the half-float heights rely on r16float being sampleable as unfilterable-float with textureLoad
  (core WebGPU; Dawn / Vulkan here); Safari's Float16Array path converts in one call, the fallback loop ~4 M values at load.
- Chrome's per-draw CPU cost (Node's is higher): Medium's CPU frame at Tidemark's quay is 18 - 19 ms here with GPU 3.9 ms.

# Wave 20A (2026-10-15): phone headroom at the towns; the CPU frame at Tidemark

## How it was measured

- GPU memory: `node tools/perf/headless.mjs --perf=views --mobile --real-sizes --quality=low --size=852x393` on the RTX 5070 Ti
  (Vulkan), the four views of 19A plus **tidemarkTavern** (new: inside the Tide & Tankard at 19:00, `place.interior`), in that
  order. Before = the same tree with `--budget-off=nearRelease,kitPlants,stallTexture` (new: phone budget keys left out).
  Reports `tools/perf/out/perf-phone-w20-before.json`, `perf-phone-w20.json`.
- CPU (Node + Dawn, Medium, 1920x1080, Tidemark's quay, square and tavern): before = a copy of the tree with this wave's four CPU
  files restored (NavGrid.js, townlife/index.js, Citizens.js, Interiors.js), after = the tree, patched = the tree plus the two
  root patches below applied by the harness (`--patch=farcull,eyes`); four interleaved rounds, the median. Reports
  `tools/perf/out/perf-medium-w20-before.json`, `perf-medium-w20.json`, `perf-medium-w20-patched.json`. **The machine was under
  heavy shared load: frame means moved 12 - 31 ms between rounds of one configuration**; compare the draw counts and scopes.
- Where the frame goes: `--draw-list[=n][,root]` (new: draws per frame by mesh or by top group, with their passes),
  `--scene-groups` (the top groups' bounds and culls), V8's `--cpu-prof`. CPU scenarios: `cpu-scenarios.mjs` with the new
  **wave19** (below). Pictures: `--shots=<dir>` (each scenario's last frame) and `pairs.mjs`.

## Where the time was (before)

At Tidemark's quay on Medium the renderer is ~60 % of the CPU frame: `drawItems` alone 30 % self (the Dawn calls: 2.75 us a
setBindGroup, 1.9 a setVertexBuffer / setIndexBuffer, 1.4 a draw: ~12 us of native calls a draw, `--trace-calls`), the scene
walks 8 %, queue submit 9 %, skinning 7 %. 470 - 510 draws a frame, of which: avatars' eye parts (pupils, rims, lids: 6 - 8
meshes a roster face, each in every shadow cascade) ~80; the home island 1.8 km away (village, boatyard, start dressing,
vendors, debris: no distance cull, several `frustumCulled = false`) ~120 across the passes; the parked planes ~50.
Hiding the home island's groups alone took 3.4 ms off. In the evening the tavern view spent **8.8 - 11 ms a frame in townlife**:
Tidemark's tavern door and patio are cut off from the streets in its NavGrid, and every tavern-goer's failed A* searched up to
60,000 cells, again and again (145.8 M expansions in a 60 s run).

## What changed

- Phones (PHONE_BUDGET, Quality.js): `nearRelease` - Tidemark and Blackwater free their near meshes' GPU buffers (the near
  terrain, the shells with the kit under the paving, the props, trees, lamps, the stream; Blackwater's props and near land)
  beyond 1.5 km and re-upload them from 1.3 km, 2 MB a frame (~7 frames), all at once on a teleport inside 900 m (TownKit.js
  `NearRelease`: the same arrays under new attribute objects, so the renderer's caches never meet a stale buffer; colliders
  and the CPU geometry stay); `kitPlants: 'simple'` - the kit's flower boxes and planters keep their box and one bloom colour,
  the leaves and the other blooms become one green dome (1,596 -> 372 vertices; the merged Tidemark kit 3.3 -> 1.4 MB);
  `stallTexture: 128` - the stalls' scanned-prop arrays (3 x 5 -> 1.25 MB; the planks stay at 256).
- townlife: NavGrid `components()` (the free cells' connected pieces under A*'s own moves, labelled once): a goal in another
  piece is answered at once (the same answers as A*: test/perf-w20.mjs); the townsfolk's pupils, rims and lids cast no shadow
  (`EYE_PART`); a standing citizen's ground is not looked up again; slot claims without a pair per step.
- Interiors: one room starts loading a frame (a room you stand in never waits); a room's seats are made once.
- Quality.js `farCull( scene )`: the far cull of the App.js patch below (not called by the game until root applies it).

## Before / after

| phone, GPU MB | home bay | Tidemark quay | Tidemark square | Blackwater cove | Tidemark tavern |
|---|---|---|---|---|---|
| before | 348.4 | 372.5 | 373.9 | 384.1 | **389.5** |
| after | 336.6 | 359.1 | 360.6 | **358.5** | 372.9 |

Phone GPU time unchanged (1.6 - 2.1 ms); the run's peak 411.0 -> 399.1 MB. Pictures: `tools/perf/out/w20/phone-sheet.png`
(five views, before | after: mean difference 0.04 - 0.23 / 255, the clouds and gulls), `flowerbox-crop.png` (a window box
up close, 4x: the dome with its red blooms against the full box).

| Medium, Node + Dawn (median of 4) | before | after | after + root patches |
|---|---|---|---|
| Tidemark quay: frame / draws | 24.7 ms / 426 | 22.8 ms / 408 | 19.6 ms / 280 (best round 13.4) |
| Tidemark square: frame / draws | 23.6 ms / 404 | 21.4 ms / 373 | 18.6 ms / 264 (best round 11.5) |
| Tidemark tavern (19:00): frame / draws | 31.2 ms / 465 | 22.8 ms / 418 | 20.3 ms / 299 (best round 16.2) |
| tavern: townlife / scene render / shadows | 8.81 / 7.81 / 6.16 | 1.24 / 7.90 / 5.50 | 1.32 / 6.01 / 4.77 |

Pictures: `tools/perf/out/w20/medium-before-A.png`, `medium-before-P.png` (before | after; identical: 0.000 - 0.005 / 255).

| CPU scenarios (3600 frames, median of 3) | before | after |
|---|---|---|
| wave19: all features, ms / frame | 8.82 | 0.285 (the same fingerprint, 65675.890444) |
| wave19: townlife, ms / frame (A* expansions) | 8.28 (145.8 M) | 0.062 (32 k) |
| wave18: all features, ms / frame | 0.189 | 0.183 (the same fingerprint, 54770.688244) |

`tools/perf/out/cpu-w20-before.json`, `cpu-w20.json`. **wave19** (new): Tidemark at 19:00 on the day a storm front crosses it,
the navy (3 ships) and naval's 12, the brigantine at the Tidemark dock with four hands aboard (gunner, cook, angler, lookout),
Tidemark's shells with their hollow colliders, the interiors feature loading the Tide & Tankard as the player strolls past its
door, townlife's evening, harbour, trade, destruction; deterministic (test/perf-w20.mjs). Navy 0.01 - 0.03, crew 0.01 - 0.05,
weather 0.015 - 0.05, interiors 0.003 - 0.013 ms a frame: no throttle needed there.

**Target not met:** the Medium town frame is not under 12 ms in Node on this machine (best rounds 11.5 - 13.4 ms with the
patches). What is left is the renderer's cost per draw (the engine, root's): see the proposals.

## Patches proposed (not applied; root's files)

- src/App.js, after `this.ports?.tidemark?.connect( this.features );` add
  `import( './core/Quality.js' ).then( ( q ) => q.farCull( this.scene ) );` (or a static import of `farCull`). The home island's
  town groups and the ports' small props get Tidemark's town cull (800 m x draw scale + their radius); measured above (-120
  draws at Tidemark). Visual: from Tidemark looking west, the home village's specks at 1.8 km are gone, as Tidemark's own town
  is from the home bay.
- src/engine/render/Skinning.js, after `mesh.castShadow = true;` add
  `if ( /_(Pupil|Rim|Lid)_[lr]$/.test( mesh.name ) ) Object.defineProperty( mesh, 'castShadow', { get: () => false, set() {}, configurable: true } );`
  (Residents.js re-sets castShadow by distance; the property ignores it for these). ~40 draws at Tidemark.
- Engine, larger (estimates from `--trace-calls`): static geometry in shared vertex / index buffers drawn with baseVertex /
  firstIndex (no setVertexBuffer / setIndexBuffer a draw: ~3.7 us a draw); the per-draw slot through `firstInstance` and a
  storage buffer instead of a dynamic-offset setBindGroup (~2.7 us a draw); an interior cull (inside a room the outdoors
  still draws 300 - 400 draws).
- townlife / Tidemark data: the tavern's door and patio are a separate NavGrid piece from the streets (the hollow shell and
  porch colliders close them off): the evening's tavern-goers never get there (7,187 goals answered unreachable in wave19).
- Parked planes (owner): ~50 draws at Tidemark's quay (every part its own mesh): one mesh per material per plane.

## Not verified

- No browser or phone: Chrome's per-draw cost, a real phone's re-upload time (2 MB a frame) and its memory.
- An unlabelled 1.3 MB GPU buffer appears with each place visited (before and after this wave's changes; not this wave's).

# Wave 22A (2026-10-15): Meridian on phones; cars in multiplayer

## How it was measured

- `node tools/perf/headless.mjs --perf=homeBay,meridianDowntown,meridianHarbour,meridianDrive,homeSkyline --mobile --real-sizes
  --quality=low --size=852x393` (phone) and `--perf=meridian --quality=medium --size=1920x1080` (Medium), RTX 5070 Ti, Vulkan.
  New views (tools/perf/scenarios.js, `--perf=meridian`, also in `views`): downtown at the Twins Plaza, the Meridian port stand,
  a sedan driven on the avenue south of the plaza at 17:30 (`car`: runner.js seats the player), the home stand (Meridian's far
  meshes in the frame). Reports `tools/perf/out/perf-phone-w22.json`, `perf-medium-w22.json`; pictures `tools/perf/out/w22/`.
- Bandwidth: `node test/feature-netsync-w22.mjs` (a real server, three clients in Meridian, two driving, the host's traffic;
  bytes on each client's socket, 6 s).

## Results (GPU MB / GPU ms / CPU ms in Node + Dawn / draws)

| view | phone | Medium |
|---|---|---|
| Meridian downtown | **366.2** / 1.44 / 12.6 / 155 | 765.7 / 2.79 / 15.6 / 185 |
| Meridian harbour | **367.9** / 1.47 / 14.1 / 187 | 780.5 / 2.96 / 14.4 / 232 |
| Meridian drive (traffic, a third on phones) | **369.3** / 1.39 / 8.3 / 104 | 788.4 / 3.05 / 11.9 / 118 |
| home stand (the skyline) | **356.7** / 1.90 / 14.4 / 282 | 798.6 / 4.39 / 20.1 / 392 |
| home bay (same run) | 344.0 / 1.97 / 15.7 / 276 | |

Every place is under the 387 MB phone budget, so nothing was cut (Meridian.js keeps its constants; Medium looks as it did).
At home Meridian costs 18 draws and ~1 MB (its 16 far block meshes and the far land: `--mem-match=Meridian --draw-list`);
its near meshes, streets and kit (~14 MB on a phone) upload on arrival and NearRelease frees them past 1.5 km. Medium downtown
is 15.6 ms / 185 draws against Tidemark's quay at 22.8 ms / 408 (wave 20A, same harness). The run's peak (406.6 MB) is
reached at home before any Meridian view (`--perf=homeBay` alone: the same 406.6, from the first frames after init, 396.3 MB
after the phone tier): not the city's.

| cars in a room (bytes / s, in + out) | busiest client | budget (wave 20E) |
|---|---|---|
| three players in Meridian, two driving, the host's traffic (~73 puppets per guest) | 5,856 (a guest) | 7,243 |
| the same with a police chase | 5,813 | 7,243 |

The host's traffic goes as lane codes at 2 Hz (4 Hz in a chase): a key snapshot every 2 s, deltas between (only the cars the
guests' own prediction would draw wrong: the host keeps their view on a shadow); a driven car rides the state lean (yaw alone
on flat roads, flags only while on). The puppets sit a median 0.34 m (p90 0.96 m) from the host's cars.

## Not verified

- No browser or phone: the touch cluster's look is checked from its geometry (carLayout drawn over a phone capture,
  `tools/perf/out/w22/car-hud-*.png`), tilt steering is untested on a device (the sign of beta in landscape is assumed).
- The home stand view keeps the stand's own camera framing (Meridian is in its draws, not in the middle of the picture).

## Wave 23A: Meridian's skyline (eight destructible skyscrapers)

| view | GPU MB | draws |
|---|---|---|
| phone, downtown | 363.4 (was 362.0) | 172 (was 172) |
| phone, skyline from home | 355.2 | 290 |
| phone, harbour | 371.0 | - |
| Medium, downtown | - | 201 (was 202); CPU 12.40 ms (was 12.34) |

At most two falls animate at once; phones get fewer chunks and simpler dust. Headless Dawn, same harness as wave 22A.

# Phone memory at Meridian, re-measured (2026-10-16, HEAD 9a084f7)

The 563 / 566 MB read in wave 27C was a harness-flag difference, not a regression. Clean `git archive` of HEAD, the exact
wave 22A line (`--perf=meridianDowntown,meridianDrive --mobile --real-sizes --quality=low --size=852x393`, Vulkan, RTX 5070 Ti):

| run | downtown | drive | after init |
|---|---|---|---|
| 22A (phone) | 366.2 | 369.3 | |
| HEAD, 22A line (`--mobile`) | **360.0** | **363.4** | 393.8 (396.8 after the phone tier) |
| HEAD, same line without `--mobile` | 576.8 | 580.8 | desktop Low tier, not the phone one |

Waves 25-27 (cars, warbirds, interiors, music, voices, night lights) cost nothing net on a phone: 6 MB under 22A, 27 MB under
the 387 MB budget, so no cut was made. Phone numbers need `--mobile` (it keeps the phone Quality and `PHONE_BUDGET`; `--quality`
alone selects the desktop Low tier, ~215 MB more). Always quote the line with `--mobile --real-sizes`.
