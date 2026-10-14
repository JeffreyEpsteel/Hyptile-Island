# tools/perf

Two harnesses: the **CPU scenarios** (game logic only, no GPU, seconds) and the **headless App on Dawn** (the whole game on
the real GPU, `headless.mjs`, docs/PERF.md). Wave 12D (2026-10-13) added the first, the boat-swap check and the Dawn
restore steps below.

## CPU scenarios (`cpu-scenarios.mjs`)

    node tools/perf/cpu-scenarios.mjs [--frames=3600] [--scenario=sea,shore] [--detail] [--repeat=3] [--no-alloc] [--json=out.json]
    node tools/perf/cpu-scenarios.mjs --sites=40      (where the bytes come from: V8's sampling heap profiler)

The feature modules on the node tests' stand-ins (stub avatars and input, real TerrainData / Colliders / Features; HUDs on
a counting fake DOM, `fake-dom.mjs`): trade (market ticks, rivals, events), harbour (the residents' schedules) + 44
residents, melee with 20 raiders, naval with 12+ ships (4 merchants, 8 pirates on the patrols; brains, collisions, balls),
boarding, pirates, crew (2 gunners on the lobster boat, swivel gun), destruction (Rapier, the port props). 3600 frames at
60 Hz. `sea`: the player sails a slow circle amid the patrols and fights (hull and shot topped up); `shore`: the player
strolls in the raider ring by the village. Pass 1: ms per module (median of `--repeat` fresh worlds); pass 2: bytes
allocated per module (minor GC before every frame, 64 MB young generation); the HUD DOM writes per frame; a fingerprint of
the end state (equal before / after a change = same behaviour; the run is deterministic).

### Baseline and after (wave 12D; `out/cpu-baseline.json`, `out/cpu-after.json`)

Same tree, same moment (a snapshot with the wave 12D files back at HEAD vs the current ones); fingerprints equal.

| scenario / module | ms per frame before | after | KB allocated per frame before | after |
|---|---|---|---|---|
| sea: all features | 0.112 | 0.126 * | 117.8 | 75.6 |
| sea: naval | 0.076 | 0.085 * | 84.7 | 61.9 |
| sea: crew | 0.008 | 0.009 | 12.6 | 6.7 |
| sea: destruction | 0.005 | 0.002 | 13.5 | 0.0 |
| shore: all features | 0.091 | 0.123 * | 86.6 | 50.9 |
| shore: melee (20 raiders) | 0.039 | 0.045 * | 36.1 | 12.9 |
| shore: naval | 0.030 | 0.045 * | 38.5 | 28.6 |
| shore: residents | 0.005 | 0.008 * | 3.4 | 3.8 |

| HUD DOM writes per frame (sea) | before | after |
|---|---|---|
| textContent (same value) | 7.5 (7.0) | 0.5 (0) |
| inline style (same value) | 29.0 (28.1) | 2.9 (2.0) |

\* noise: this machine is shared (other workers build and test); modules nobody touched moved as much (trade 0.012 ->
0.015). The feature logic is ~0.1 ms of a 16.7 ms frame in every run: the CPU-bound frame of docs/PERF.md is the
renderer, not these loops. What the pass removes is garbage (5-7 MB/s before -> 3-4.5 MB/s: fewer, shorter scavenges,
the stutter phones feel) and DOM churn (a same-value textContent still replaces the text node and relayouts).

What changed (behaviour identical: fingerprints, every test):
- Collisions.js: per-body reach radius once a step (n Math.hypot, not n^2/2), obb2 / satOverlap into scratch objects
  (no axes array), pair map walked by value; a 64 m grid broad phase that visits the pairs in the brute-force order. The
  grid only pays from ~64 hulls (1 us vs 5 us at 13 hulls, 78 vs 47 us at 128), so `GRID.min = 64`.
- Hud.js / AimAssist.js / MeleeHud.js: text, inline styles, classes written only on a change (`naval/DomWrites.js`), numbers
  compared after rounding before any string is built; no Set per frame for the arrows.
- Naval.js: one near-ships list, a hoisted sort comparator, `mods` compared field by field (no key string per read);
  WaterPool.assign without slice / Set; Brains.hullLost without spreading the log into Math.max.
- Crew.js: the posted lists without spread / filter / map copies (several calls a frame), sync's early-outs.
- Raider.js: clip options built only when the clip changes, a square reject before Math.hypot in the crowd push.
- Destruction.js: square rejects before Math.hypot in the ram and raycast loops (every prop, every frame at speed).

Left (measured, not mine this wave): destruction `Kinds.js contactPoints` allocates 8-18 KB per frame averaged (about 30 to
65 MB over a run, the piece / joint planning when props break and at build: `rotate()` and `{ x, y, z }` per corner);
`ShipLights.update` sorts with a fresh comparator every frame (1.5-2.4 KB per frame). Math.hypot allocates a heap number
per call in V8 when not inlined: the hottest loops use a loose square reject first and keep the exact hypot test.

## Boat swaps leak GPU buffers (wave 12D)

    node tools/perf/headless.mjs --boat-swaps=16 [--patch-dispose] --dawn=<dawn dir> --backend=vulkan --size=1280x720 --quality=low

Measured on the RTX 5070 Ti (Vulkan), 16 swaps through the catalog, buffers counted by GPU.memory: as the engine stands the
second lap adds 81 buffers over 8 swaps (**~10 per swap**: one uniform buffer per disposed material - `Material.dispose()`
only fires its listeners, nobody destroys `uniformBlock.buffer`; plus the FleetBoatModel placeholder's material, never
disposed). With `--patch-dispose` (the engine patch below, applied by the harness) the second lap adds **0** and no GPU error
is reported. `test/perf-cpu.mjs` checks the same with a counting device in node (20 cutter swaps, the lobster boat, a sloop).
The placeholder fix is in `src/world/boat/FleetBoatModel.js`; the engine part is root's (src/engine).

## Restoring the headless Dawn harness (`headless.mjs`)

The installed `webgpu@0.6.1` (`node_modules/webgpu/dist/win32-x64/dawn.node`) has the Vulkan backend: it only fails to
load `vulkan-1.dll` from System32 (error 87) when run from node_modules, so it reports no Vulkan adapter there. Beside a
copy of `vulkan-1.dll` it finds the NVIDIA Vulkan adapter (driver 616.92). Steps (checked 2026-10-13: `--boot=60` 0 GPU errors,
init 17-35 s):

    mkdir %TEMP%\dawn
    copy node_modules\webgpu\dist\win32-x64\* %TEMP%\dawn\
    copy C:\Windows\System32\vulkan-1.dll %TEMP%\dawn\
    node tools/perf/headless.mjs --boot=60 --dawn=%TEMP%\dawn --backend=vulkan --size=1280x720 --quality=low
    node tools/perf/headless.mjs --perf=every --quality=high --dawn=%TEMP%\dawn --backend=vulkan --tag=high --out=<dir>

Registry (`npm view webgpu versions`, not installed): newest is 0.6.2 (2026-10-02, 137 MB unpacked, same dist layout:
darwin-universal, linux-arm64/x64, win32-arm64/x64). Nothing newer is needed for Vulkan. The D3D12 path stays slow: this
build ships `d3dcompiler_47.dll` (FXC; tens of minutes for the game's pipelines). DXC needs `dxcompiler.dll` and `dxil.dll`
beside dawn.node from one DirectX Shader Compiler release (https://github.com/microsoft/DirectXShaderCompiler/releases,
`dxc_<date>.zip`, `bin\x64\dxcompiler.dll` + `bin\x64\dxil.dll`, signed by Microsoft), then
`node tools/perf/headless.mjs --dawn=<dir> --backend=d3d12` (headless.mjs adds `enable-dawn-features=use_dxc` when --dawn is
given without --backend). Not tried: Dawn may refuse a DXC version it was not built against (it refused Chrome's copy);
use Vulkan.

## Wave 16C additions (2026-10-14)

- `cpu-scenarios.mjs`: the **wave15** scenario (default set: sea, shore, wave15): the sea fight in the two-tile world with
  the economy's rivals, the harbour agents, a wanted stolen hull (hijack's hunters), a rescue under way and the 12 AI ships;
  `--cap=n` sets naval's awake-ship cap (Quality: Low 8, Medium 12, phones 6). The fake DOM also counts attribute and
  title / disabled writes (`attr`, `prop`).
- `headless.mjs --perf=views`: the three places of the two-tile world on foot at noon (`homeBay`, `tidemarkQuay`,
  `blackwaterCove`; not in `every`). The bench now renders at `--size` (it always rendered 2560x1267, so a phone run
  measured a desktop canvas), each scenario records its GPU memory (`memory`: total, buffers, textures, and by owner:
  vegetation, terrain, the tile islands, characters) and the vegetation drawn (`vegetation`: instances near / far per
  type, triangles). `--mobile` keeps the phone Quality (a `--quality` no longer replaces it with the desktop tier) and
  takes the game's own `PHONE_BUDGET`.
- `--mem-top[=n]` after a perf run too, `--mem-diff` (what each scenario built on arrival), `--mem-match=<regex>` (every
  live label that matches), `--hide=<regex>` (objects hidden for the run: what one system costs, `--hide=veg-canopy-far`).
- Before / after on one machine: a copy of `src` with the wave's files restored under `out/before` (with a junction to
  `public`: remove it with `rmdir` before deleting the folder, or the delete follows it) and the runs interleaved;
  docs/PERF.md "Wave 16C" has the table.

## Wave 19A additions (2026-10-15)

- `cpu-scenarios.mjs`: **wave18** (now in the default set): Tidemark's market square at noon, wave 18's townsfolk (townlife on
  stand-in avatars, the NavGrid built first), a cutlass drawn (weapons, firearms, melee), harbour, trade, destruction, 12 ships.
- `headless.mjs --perf=views` adds **tidemarkSquare** (scenarios.js `weapon`: a melee weapon drawn for the run); every pass
  counts its triangles (`tris:<pass>`); `--log-fetch` lists the files each place fetched (with `--mem-diff`).
- `pairs.mjs --out=sheet.png before.png=after.png ...`: a before / after sheet from any folders (capture.mjs output).
- docs/PERF.md "Wave 19A" has the table; `test/perf-w19.mjs` the checks.

## Other tools

`headless.mjs` (whole App on Dawn; `--boot`, `--nan-check`, `--boat-swaps`), `runner.js` + `scenarios.js` (the perf
scenarios), `report.mjs`, `table.mjs`, `pngdiff.mjs`, `shot.mjs`, `heap-buffers.mjs` (heap snapshot ArrayBuffer owners),
`collect.mjs`, `stub-loader.mjs`, `headless-env.mjs` (the browser stand-in).

## Wave 20A additions (2026-10-15)

- `cpu-scenarios.mjs`: **wave19** (in the default set): Tidemark at 19:00 under a storm front, the navy, the crew aboard at the
  dock, the Tide & Tankard's interior loading and unloading, townlife's evening; `--sites` now samples from the first frame on.
- `headless.mjs`: `--draw-list[=n][,root]` (draws per frame by mesh or by top group, with their passes), `--scene-groups`,
  `--shots=<dir>` (each scenario's last frame), `--budget-off=a,b` (phone budget keys left out: a phone change's before on the
  same tree), `--patch=farcull,eyes` (the wave's proposed root patches, to measure them). View **tidemarkTavern**
  (`place.interior`: inside a room through interiors.enter). docs/PERF.md "Wave 20A"; `test/perf-w20.mjs` the checks.
