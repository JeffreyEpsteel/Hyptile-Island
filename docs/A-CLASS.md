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
| 1.1 | The cold load spends 40-60 s at "Starting WebGPU" / "Compiling shaders" before the menu: a phone user leaves. Needs a pipeline cache, fewer variants, or a menu that opens before the world compiles. | 24D graphics (src/engine/render/**), root (src/main.js loader order) | P1 | before-loader-tip-gap.jpg |
| 1.3 | The title card's motion blur during the opening glide smears the lanterns to streaks (after-title-card-alone.jpg): the glide needs a lower blur strength or a disabled blur while the camera is scripted. | 24D (src/post/**) with start (src/world/start/Intro.js) | P2 | after-title-card-alone.jpg |
| 1.5 | The guide's three pages are still text-only cards; A-class teaches with a short clip or an animated key diagram per page. | 24F (src/game/Guide.js) | P3 | after-guide-page1-hud-dimmed.jpg |
| 1.6 | A cast into the surf (depth 0) never bites and said "Waiting for a bite" for ever (patched in tools/polish/apply-patches.mjs: the prompt now says nothing bites this close in). Root applies the patch. | root (src/game/Game.js prompt) | P1 | before-cast-windup.jpg |

## 2. HUD and panels

| # | Gap | Owner (file) | Priority | Screenshot |
|---|-----|--------------|----------|------------|

## 3. Camera and movement

| # | Gap | Owner (file) | Priority | Screenshot |
|---|-----|--------------|----------|------------|
| 3.1 | Mouse look has no smoothing and no aim assist for the gamepad; turning 90 degrees snaps the spring arm (the arm length is right, the rotation is instant). A short yaw / pitch slew (60-90 ms) and a gamepad curve. | 24F (src/player/Player.js look, src/core/Input.js is root's) | P2 | - |
| 3.2 | The spring arm now stops at walls (24F) but still passes through trees, ship hulls that are not colliders and the stilt huts' roofs; the ground probe is six samples only. A proper sphere cast against the vegetation and hull proxies. | 24F (src/player/Player.js springArm), 24B (hull proxies in src/world/boat/**) | P2 | - |
| 3.3 | Stairs and the pier ladders: the capsule steps up STEP_PAD ledges with a vertical pop (0.36 m in one frame) that the camera's airborne lag now hides partly. A step-smoothing offset on the feet (as Unreal's) removes the pop. | 24F (src/player/Player.js groundAt / updateWalk) | P2 | - |
| 3.4 | Swimming has no stroke animation tie-in with the camera (the eye rides a sine); surfacing / diving lacks the water-line blur and a drip pass. | 24F (Player.js updateSwim), 24D (src/post/** underwater) | P3 | - |
| 3.5 | The avatar's start / stop have no lean or foot-plant; the new 9 / 18 acceleration gives weight but the body still rotates on the spot. Needs the animation library's turn-in-place and start / stop clips driven by the velocity change. | animation (src/player/Avatar.js, src/player/anim/**) | P2 | before-sprint.jpg |

## 4. Feedback (feel, particles, sound)

| # | Gap | Owner (file) | Priority | Screenshot |
|---|-----|--------------|----------|------------|
| 4.1 | **Closed in 25D (verify in play).** The rod now throws particles: a bobber plop with crown, drops and two rings (stronger for a longer cast), a nibble's ring on each pulse, the dunk on the take, a rod-tip glint plus a thrash at the float on the strike, a bigger thrash per run of a heavy fish, drops shed off the cranked line, a wake behind the float, drips off the fish hanging on the line, and a fan off the tip on a cast or a snap (src/features/vfx/FishRecipes.js, FishingFx.js; captures tools/fx25d/out/plop-*.png, strike-0.2s.png, glint-0.06s.png). The catch card's flourish (light fan, ring, sparks, a glint across the stat tiles) is the patch in tools/fx25d/apply-patches.mjs, **root applies it**. | vfx, 25B (src/game/GameHUD.js via the patch) | P2 | tools/fx25d/out/plop-0.12s.png |
| 4.2 | **Closed in 25D (synthesised, not auditioned by ear).** Cloth brushing each stride (louder with speed, softer crouched), tackle clinks every few strides (more with the rod out), a sprint's in / out breaths, recovery breaths after a long sprint and winded breaths at low stamina, wading splashes that grow with speed and depth, a landing's cloth and gear (src/features/sfx/Foley.js; test/feature-feedback-w25.mjs). | sfx | P2 | - |
| 4.3 | **Measured in 25D, still owed a listen.** Every synthesised cue, bed and sampled file of the sfx feature (70 sounds) is rendered offline in headless Chrome, K-weighted and logged (tools/fx25d/mix.mjs -> tools/fx25d/out/mix-measured.json); five groups (foley -56, bed -40, life -32, action -24, alert -17 LUFS, per-sound targets in src/features/sfx/Mix.js) and the trim that lands each on its target are applied at start-up (MixTrims.js). Before: the synthesised beds sat at -19..-33 LUFS (the cliffs -23, the water spout -19) over the SoundScape's surf at -31 and a bosun's call at -8.7; after: beds -34..-46, alerts -12..-26. Root's SoundScape MIX rows are untouched; the pass is by numbers, not by ear on headphones. | sfx | P2 | tools/fx25d/out/mix-measured.json |

## 5. World, graphics, life (other workers' areas, as seen from the player's seat)

| # | Gap | Owner (file) | Priority | Screenshot |
|---|-----|--------------|----------|------------|
| 5.1 | The avatar's shadow is a hard-edged blob and the contact shadow under the feet is missing on sand; the palms cast no shadow on the player. | 24D (src/engine/render/** shadows, csm) | P1 | before-hud-idle.jpg |
| 5.2 | The lanterns on the pole and the line are unlit discs by day and flat sprites by night; the string sags in straight segments. | 24E life / dressing (src/world/start Dressover.js) | P3 | before-hud-idle.jpg |
| 5.3 | The stilt village on the horizon pops in at ~300 m as untextured domes (before-hud-idle.jpg, centre). LOD fade or an impostor. | 24D (src/world/vegetation/** LOD, src/world/Village.js) | P2 | before-hud-idle.jpg |
| 5.4 | The sea foam at the beach is a bright uniform band; the wet-sand reflection is missing at the water line. | 24D (src/materials/**, src/world/ShoreField.js) | P2 | before-sprint.jpg |
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
