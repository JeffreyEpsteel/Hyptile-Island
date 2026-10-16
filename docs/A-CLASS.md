# A-class gap list (wave 24F, 2026-10-16)

The bar (docs/briefs/w24-common.md): a player comparing Hyptile Island with a polished indie / AA game should not feel
the seams. This is the list of what still shows the seams, by area, with the owner by file, a priority (P1 blocks the
A-class feel for everyone in the first ten minutes; P2 hurts a session; P3 is noticed by a careful eye) and a screenshot
each. Root plans the next wave from it. Screenshots are under `tools/polish/out/w24f/` (before-*.jpg are the state at the
start of wave 24, after-*.jpg what 24F shipped). Captures were read in the built-in browser pane at 1024 x 768 on the
build served at http://127.0.0.1:5191/ (`npx vite build` of the working tree).

What wave 24F closed is at the end. Everything else is open.

## 1. First ten minutes (onboarding, menus, sheets)

| # | Gap | Owner (file) | Priority | Screenshot |
|---|-----|--------------|----------|------------|
| 1.1 | **Closed in 25A (headless Dawn; not timed in a browser).** The main menu opens as soon as the world is built and the pipelines compile behind it with a quiet "Preparing the island" line; after the choice the loader holds only until the chosen spot's first view draws whole (draws waiting for a pipeline move it to the head of the queue, src/engine/Warmup.js). Kernels and full-screen passes with one source share one pipeline (17 fewer compiles) and the sky's six cube-face kernels become one (patch). Shader sources are byte-identical across boots (302 modules, hashed twice), so the browser's own shader cache serves a warm start. Measured cold, same machine: menu 33.7 s -> 16.8 s; the first view with an instant click 30.2 s (tools/w25a/boot-profile.mjs). The App.js / main.js / Environment.js parts are tools/w25a/apply-patches.mjs, **root applies it**. | 25A, root | P1 | before-loader-tip-gap.jpg |
| 1.3 | **Closed in 25A (patch, not seen in a browser).** MotionBlur.setScripted fades the blur out in 0.15 s while a script drives the camera and back in over 0.6 s (PostFX.setCameraScripted); the opening glide calls it (src/world/start/Intro.js lines in tools/w25a/apply-patches.mjs, **root applies it**). | 25A, root | P2 | after-title-card-alone.jpg |
| 1.5 | The guide's three pages are still text-only cards; A-class teaches with a short clip or an animated key diagram per page. | 24F (src/game/Guide.js) | P3 | after-guide-page1-hud-dimmed.jpg |
| 1.6 | A cast into the surf (depth 0) never bites and said "Waiting for a bite" for ever (patched in tools/polish/apply-patches.mjs: the prompt now says nothing bites this close in). Root applies the patch. | root (src/game/Game.js prompt) | P1 | before-cast-windup.jpg |

## 2. HUD and panels

| # | Gap | Owner (file) | Priority | Screenshot |
|---|-----|--------------|----------|------------|

## 3. Camera and movement

| # | Gap | Owner (file) | Priority | Screenshot |
|---|-----|--------------|----------|------------|
| 3.1 | **Closed in 25C (verify in play).** The look goes through a 28 ms time-constant slew (90 % of a flick applied by 50-64 ms, 95 % by ~84 ms; nothing lost, the same at 30 and 144 fps) and the pad's share is applied per second, not per frame, with a soft start (55 % rate rising over 0.22 s) and a 20 % boost on a held full sweep. Measured in the whole App: a 90 degree flick used to turn in one frame (90.0 deg), now peaks at 40 deg a frame and is 90 % done in 4 frames (67 ms). The pad curve needs the Input / Gamepad root patch (tools/camera25c/apply-patches.mjs); without it the pad is slewed like the mouse. | player (src/player/CameraRig.js LookSlew, Player.js) | P2 | tools/camera25c/out/after-results.json |
| 3.2 | **Closed for trunks, boxes, roofs and own cabin; hulls and other towns' roofs wait for the patch (25C).** The arm is a sphere cast (r 0.22 m) from the head to where the camera wants to be, against every solid box, tree trunk / post (cylinder), the enterable houses' roofs, your own boat's cabin boxes and what a provider adds; low things (< 0.5 m above the feet) and thin posts do not stop it; it snaps in and eases out over ~0.25 s, and the camera slides along the head-to-camera line so the avatar keeps its place. Before: a trunk 2 m behind the player left the camera past it, inside the wood (arm 4.21 m, 2.2 m beyond the trunk); after: arm 1.77 m, 0.25 m clear of its surface. The ships' hull outlines (naval Collisions' shapes) and the village's porch eaves are providers registered by the patch (Naval.js, Village.js via src/world/Roofs.js); the other towns' houses do not register their roofs yet. | player (src/player/CameraRig.js, Player.springArm), root patch | P2 | tools/camera25c/out/before-tree.png, after-tree.png |
| 3.3 | **Closed in 25C (verify in play).** The capsule still steps in one frame; the body, the avatar and the camera ride a visual offset that eases away in ~0.28 s (StepSmoother), for stairs and ledges up, short drops down (the feet stay on the treads, no fall flicker), the deck coaming and the pier ladder's top / the pull-up onto a ledge. Measured on a ten-tread porch stair: largest per-frame step of the body 0.186 m before, 0.047 m after (the capsule's 0.186 m is unchanged); the camera 0.045 -> 0.034 m. | player (Player.updateWalk / updateDeck / updateSwim) | P2 | tools/camera25c/out/after-results.json |
| 3.4 | **Closed on the camera side (25C); the lens blur belongs to src/post.** The swimming eye dips and rolls with the stroke (the phase is the stroke cue's: 0.63 deg of roll, 5 cm of dip at a swim) and the waterline crossing kicks the view (a dunk dips ~1 deg and closes the fov 2 deg, a surfacing lifts and opens 1.8 deg; CameraFeel submerge / surface, driven by player.crossSeq / waterCross). The drips on the lens after surfacing are 24D's LensDroplets (visible in after-surface.png); a blur at the waterline would be a pass in src/post (25A) and is not done. | player, CameraFeel | P3 | tools/camera25c/out/after-surface.png |
| 3.5 | **Closed in 25C (verify in play).** The body follows the view's yaw with a lag (0.11 s standing, 0.035 s moving, capped at 700 deg/s), so a turn on the spot is a body turning with the library's Turn_Left / Turn_Right stepping the feet (the rule already existed; the instant yaw never tripped it); a start leans forward and a stop sits back (pelvis pitch from the change of the velocity along the facing: +3.8 deg at a jog start, -3.2 deg at a stop, capped 10 / 7.5 deg), a sideways push rolls the body the way it is pushed (src/player/Avatar.js, src/player/anim/AnimGraph.js + AnimDef.lean.pitch). No new start / stop clips exist in the library: the lean is procedural; a foot-plant on the stop is still ContactIK's. | animation (Avatar, AnimGraph) | P2 | tools/camera25c/out/before-lean-start.png, after-lean-start.png |

## 4. Feedback (feel, particles, sound)

| # | Gap | Owner (file) | Priority | Screenshot |
|---|-----|--------------|----------|------------|
| 4.1 | **Closed in 25D (verify in play).** The rod now throws particles: a bobber plop with crown, drops and two rings (stronger for a longer cast), a nibble's ring on each pulse, the dunk on the take, a rod-tip glint plus a thrash at the float on the strike, a bigger thrash per run of a heavy fish, drops shed off the cranked line, a wake behind the float, drips off the fish hanging on the line, and a fan off the tip on a cast or a snap (src/features/vfx/FishRecipes.js, FishingFx.js; captures tools/fx25d/out/plop-*.png, strike-0.2s.png, glint-0.06s.png). The catch card's flourish (light fan, ring, sparks, a glint across the stat tiles) is the patch in tools/fx25d/apply-patches.mjs, **root applies it**. | vfx, 25B (src/game/GameHUD.js via the patch) | P2 | tools/fx25d/out/plop-0.12s.png |
| 4.2 | **Closed in 25D (synthesised, not auditioned by ear).** Cloth brushing each stride (louder with speed, softer crouched), tackle clinks every few strides (more with the rod out), a sprint's in / out breaths, recovery breaths after a long sprint and winded breaths at low stamina, wading splashes that grow with speed and depth, a landing's cloth and gear (src/features/sfx/Foley.js; test/feature-feedback-w25.mjs). | sfx | P2 | - |
| 4.3 | **Measured in 25D, still owed a listen.** Every synthesised cue, bed and sampled file of the sfx feature (70 sounds) is rendered offline in headless Chrome, K-weighted and logged (tools/fx25d/mix.mjs -> tools/fx25d/out/mix-measured.json); five groups (foley -56, bed -40, life -32, action -24, alert -17 LUFS, per-sound targets in src/features/sfx/Mix.js) and the trim that lands each on its target are applied at start-up (MixTrims.js). Before: the synthesised beds sat at -19..-33 LUFS (the cliffs -23, the water spout -19) over the SoundScape's surf at -31 and a bosun's call at -8.7; after: beds -34..-46, alerts -12..-26. Root's SoundScape MIX rows are untouched; the pass is by numbers, not by ear on headphones. | sfx | P2 | tools/fx25d/out/mix-measured.json |

## 5. World, graphics, life (other workers' areas, as seen from the player's seat)

| # | Gap | Owner (file) | Priority | Screenshot |
|---|-----|--------------|----------|------------|
| 5.1 | **Closed in 25A.** Capsule shadows of the four figures nearest the camera (src/engine/render/CapsuleShadows.js, lighting.js characterOcclusion): a soft skylight occlusion round the feet and legs and the sun's contact shadow the map's biases lose (residents 10-40 m off no longer float). The player did not darken under a palm or a roof because the sand's bounce lit the body as strongly as the sun: the bounce now fades with the receiver's own shadow. Captures: tools/w25a/out (a3-slab vs a4-slab: the legs go dark under a slab), feet / feetLate. | 25A | P1 | before-hud-idle.jpg |
| 5.2 | The lanterns on the pole and the line are unlit discs by day and flat sprites by night; the string sags in straight segments. | 24E life / dressing (src/world/start Dressover.js) | P3 | before-hud-idle.jpg |
| 5.3 | **Closed in 25A (partly).** Every distance-culled group (the village kit at ~285 m on Medium, the ports and villages Quality.farCull cuts at 600 m+) dissolves over the last 12 % of its reach with a moving dither the temporal resolve smooths (MeshRenderer, MeshShader DISTANCE_FADE) instead of popping. The dark "domes" on the horizon are the Inverted Isles (src/world/islands/InvertedIsles.js, not 25A's): their look is unchanged. | 25A | P2 | before-hud-idle.jpg |
| 5.4 | **Closed in 25A (partly).** The shore field's exposure now varies along the shore over 40-110 m (src/world/ShoreField.js), so the surf, its run-up, foam and milky water come in sets of sections instead of one even band; the fresh wet sand is a mirror film (roughness 0.07) and the foam left on the sand is lace without a 30 % floor (src/world/Terrain.js lines in tools/w25a/apply-patches.mjs, **root applies it**). No screen-space reflection: the sand mirrors the sky only. | 25A, root | P2 | before-sprint.jpg |
| 5.5 | The ships at anchor off the bay read as silhouettes without rigging detail from the beach; closer they are 24C's. | 24C (public/models/ships/**) | P2 | before-pause.jpg |
| 5.6 | Residents stand on the boardwalk without idle variety; the two by the pier in before-hud-idle.jpg have the same pose. | 24E (src/features/townlife/**) | P2 | before-hud-idle.jpg |

## 6. Phones

| # | Gap | Owner (file) | Priority | Screenshot |
|---|-----|--------------|----------|------------|
| 6.1 | Not re-captured this wave (the pane is a desktop viewport). The touch layout tests (test/feature-mobile.mjs, feature-ios.mjs) pass; a real-device pass is still owed after 24D's graphics work. | root / 24F (src/ui/TouchControls.js) | P2 | - |

## What wave 24F closed (commits on main, 2026-10-16)

- The first start plays in order: the title card alone (HUD, rail and minimap away), then a three-page guide (the goal,
  fishing, where to go) with the HUD stepped back; the other eleven pages wait for F1 > Replay the guide
  (src/game/Guide.js INTRO_PAGES, ui.css is-intro / is-modal). Before: before-opening-guide-over-title.jpg; after:
  after-title-card-alone.jpg, after-guide-page1-hud-dimmed.jpg, after-guide-page3-lets-go.jpg.
- The frame-rate overlay is off by default (Settings > Performance > Frame rate overlay, or ?stats). Before:
  before-hud-idle.jpg (89 fps / frame 11.1 ms at the top left); after: after-settings-game-first.jpg.
- The pause sheet dims the HUD, the rail and the minimap (ui.css is-paused). Before: before-pause.jpg; after: after-pause.jpg.
- One wordmark (the loader's jade gradient and its coral / cream / jade rule) on the loader, the main menu, the start
  overlay and the pause sheet (ui.css .tw-wordmark). Before: before-main-menu.jpg, before-start-overlay.jpg; after:
  after-main-menu.jpg, after-start-overlay.jpg.
- Settings open on the Game tab for a campaign / multiplayer player (the Ocean tab was a page of "Sandbox only"
  sliders). Before: before-settings-ocean-first.jpg; after: after-settings-game-first.jpg.
- One slim scrollbar on every scroller under the HUD root (the controls sheet, the cooler and the crew showed the
  browser's grey bar). Before: before-controls-scrollbar.jpg, before-cooler.jpg; after: after-crew-faces.jpg.
- The quest journal speaks the HUD's tokens (glass, type scale, aqua selection, sun eyebrows) instead of a third style.
  Before: before-journal.jpg; after: after-journal.jpg.
- The crew portraits sit on a pale sky disc (they were black blobs on a dark well). Before: before-crew-black-faces.jpg;
  after: after-crew-faces.jpg.
- The loader's tips cross-fade (the label stood over nothing for 1.5 s of every 6 s slot). Before: before-loader-tip-gap.jpg.
- Camera: the spring arm stops at walls and hulls (Colliders.raycast, 9 us a frame at 1,373 boxes), rides level through
  a jump (a slower vertical lag in the air), reaches out 0.7 m at a sprint while CameraFeel opens the fov +6 degrees
  (measured in the pane: 62 -> 68 over 2 s, arm 4.2 -> 4.9 m). Before: before-sprint.jpg (fov 62, arm 4.2 at 8.5 m/s).
- Movement weight: 9 from rest, 12 in motion, 18 to stop (was 14 both ways).
- Tests: test/feature-ui-w24.mjs (36 checks). Root patch script: tools/polish/apply-patches.mjs (Game.js surf prompt,
  package.json test entry).

## What wave 25B closed (one UI language; commits on main, 2026-10-16)

Captures are from tools/ui25b (headless Chrome over a harness page, `node tools/ui25b/capture.mjs`), before = HEAD at the
start of the wave (tools/ui25b/out/b-*.png), after = this wave (a-*.png). The Minimap.js icon patch and the package.json test
entry are root's: `node tools/ui25b/apply-patches.mjs`.

- 1.2 The Multiplayer card reads "Play online" with no server words; its step shows one state line ("Online · 3 captains
  aboard"), the captain name and one button. The server address, the crew code and the Universe / Island switch sit behind
  "Use another server" (open only when the address is not the shared universe). b-menu-online.png, a-menu-online-closed.png.
- 1.4 The start overlay is the wordmark, the rule and one button (the keys are the guide's first pages and F1). b-start.png, a-start.png.
- 2.1 One `.gm-panel` shell in ui.css for the inventory / fish stand / yard (GameHUD), the roster and journal, the tavern and
  bench (`.hb-panel`) and the navy office (`.nv-panel`): same width rule, title, eyebrow, row, tab, aqua / ghost button and
  `.gm-act` row. The world map's chrome (controls, tracked card, close, legend) uses the same glass and pill tokens.
  b-navy.png / a-navy.png, b-tavern.png / a-tavern.png, a-worldmap.png.
- 2.2 The rail is one gear (and the controls button); the tabs live inside the panel it opens. b-hud.png, a-hud.png.
- 2.3 The cast meter is a 64 px ring round the reticle (aqua to sun, pulses when full). b-cast-full.png, a-cast-full.png.
- 2.4 One pill family (30 high, glass, 12.5 type) for the mode, weather and purse pills. b-hud.png, a-hud.png.
- 2.5 One marker set: `MARKER_ICONS` in ui/icons.js (2.2 stroke, one hand) and one dark disc with a ring in the kind's colour for
  the minimap, the chart and its legend (Minimap.js takes the set through the root patch). b-markers.png, a-markers.png.
- 2.6 One notification channel: two toasts at a time, the rest queue (stale after 14 s, held while a window or the catch card
  is open), and the coach tip waits for the channel to be quiet and comes back after a toast. a-toasts.png.
- 4.4 Interface sounds: click, tab, toggle, confirm, back, open, close, notify, level-up (synth cues in sfx/Cues.js, played
  through the sfx category so master and mute apply; one delegated listener in ui/UI.js and AppUI).
- 4.5 Distinct motion: a toast pops down with an overshoot, the coach tip slides in from the side, the catch card keeps its
  rise and stamp, and a level-up opens two gold rings with a number (GameHUD `showLevelUp`). a-levelup.png.

Not closed from 25B's list: the nine `ui_*` cues are not auditioned or measured (no audio in the headless tools). Their gains
are at most 0.5 in the sfx category and quieter than the listed action cues by construction; 25D's measured mix (Mix.js
CUE_LEVELS, group "action", about -28) can adopt them. The cast ring and the level-up are checked in the harness only, not in
the running game (the pane and Dawn captures do not show the DOM HUD over the world).
