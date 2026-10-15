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
| 1.2 | The main menu's Multiplayer card, the Universe probe and the crew-code field expose server plumbing to a first-time player ("wss://", "Updating", "banned"). Hide behind "Play online" with one state line. | 24F (src/ui/MainMenu.js) | P2 | after-main-menu.jpg |
| 1.3 | The title card's motion blur during the opening glide smears the lanterns to streaks (after-title-card-alone.jpg): the glide needs a lower blur strength or a disabled blur while the camera is scripted. | 24D (src/post/**) with start (src/world/start/Intro.js) | P2 | after-title-card-alone.jpg |
| 1.4 | The start overlay ("Click to explore") shows the whole key list in a grey strip: A-class is the wordmark, one button, nothing else (the keys belong to the first guide page). | 24F (src/ui/UI.js _buildStart, ui.css .tw-start-keys) | P3 | after-start-overlay.jpg |
| 1.5 | The guide's three pages are still text-only cards; A-class teaches with a short clip or an animated key diagram per page. | 24F (src/game/Guide.js) | P3 | after-guide-page1-hud-dimmed.jpg |
| 1.6 | A cast into the surf (depth 0) never bites and said "Waiting for a bite" for ever (patched in tools/polish/apply-patches.mjs: the prompt now says nothing bites this close in). Root applies the patch. | root (src/game/Game.js prompt) | P1 | before-cast-windup.jpg |

## 2. HUD and panels

| # | Gap | Owner (file) | Priority | Screenshot |
|---|-----|--------------|----------|------------|
| 2.1 | Three panel languages remain: the HUD glass (cooler, crew, journal now), the world map (its own chart chrome, grid, buttons) and the vendor / tavern / navy windows (src/features/harbour PanelKit, NavyPanel: their own type scale). One `.gm-panel` base for all of them. | 24F (src/game/HudPanels.js, src/ui/WorldMap.js), harbour (src/features/harbour/PanelKit.js), navy (src/features/navy/NavyPanel.js) | P2 | before-worldmap.jpg, after-journal.jpg |
| 2.2 | The settings rail shows twelve icons at all times; a player cannot tell Ocean from Shore from Sky by the glyph. A-class: a single gear, tabs inside. | 24F (src/ui/UI.js rail, ui.css .tw-rail) | P2 | before-hud-idle.jpg |
| 2.3 | The cast power meter is a 60 px hairline in the centre of the screen (before-cast-windup.jpg): too small to read while winding up. A ring around the reticle, or a bar by the avatar. | 24F (src/game/GameHUD.js castBar, ui.css) | P2 | before-cast-windup.jpg |
| 2.4 | The "Breezy 8 m/s" wind pill and the "Campaign · Walking" mode pill sit at the top left as plain chips; the purse / cooler at the top right is a different shape. One pill family. | 24F (ui.css .tw-mode, GameHUD purse) | P3 | before-hud-idle.jpg |
| 2.5 | The minimap's markers are flat orange discs with tiny glyphs; the world map's are different glyphs again. One icon set (src/ui/icons.js) for both. | 24F (src/game/Minimap.js is root's; src/ui/WorldMap.js, src/ui/icons.js) | P3 | before-worldmap.jpg |
| 2.6 | Toasts and the coach tip can show at the same time as a vendor window and the prompt pill (four text sources on screen): a single notification channel with a queue. | 24F (src/ui/UI.js toasts, src/game/Guide.js coach, src/game/Tips.js) | P3 | before-cast-windup.jpg |

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
| 4.1 | A strike, a catch and a snap have camera kicks (CameraFeel) but no particle burst on the bobber and no rod-tip flash; the landing card appears without a flourish. | vfx (src/features/vfx/**), 24F (src/game/GameHUD.js catch card) | P2 | - |
| 4.2 | Footsteps exist per surface but there is no cloth / gear foley, no breath on a sprint, no splash variations by speed when wading. | 24F (src/features/sfx/**: new cues), audio (src/audio/SoundScape.js is root's) | P2 | - |
| 4.3 | The mix was not auditioned in this pass (the browser pane is silent to the worker): the surf bed, the market murmur and the synthesised cues need a listening pass on headphones with the master at 80 %. | 24F (src/features/sfx/SfxPlayer.js gains), root | P2 | - |
| 4.4 | UI sounds: menus, tabs, toggles, the guide's Next and the pause sheet are silent. A tiny click / confirm / back set. | 24F (src/features/sfx/Cues.js, src/ui/UI.js hooks) | P2 | after-pause.jpg |
| 4.5 | The guide's coach tips and the toasts fade in / out with the same 240 ms ease; A-class gives the catch card and the level-up a distinct motion. | 24F (ui.css, src/game/GameHUD.js) | P3 | - |

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
