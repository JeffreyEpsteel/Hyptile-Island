# A-class gap list (wave 27A re-audit, 2026-10-16)

The bar (docs/briefs/w24-common.md): a player comparing Hyptile Island with a polished indie / AA game should not feel
the seams. This is what still shows the seams after waves 24-26, seen in a 30-minute pass as a new player on the live-
equivalent build (49c8be9, `npx vite build` of HEAD served at http://127.0.0.1:5191/, the built-in browser pane at
800 x 600 and 1024 x 768, `?bg` with a timer-driven frame loop because the pane's rAF stops while it is hidden). Played:
the menu, a new campaign ($100,000), fishing from the beach and the pier (three catches, two fight kinds), the fish stand,
the chandlery, the boat yard, a cabin launch at the helm, the seaplane to 98 m, the helicopter realistic (a pirouette and a
barrel roll, then a crash on its side) and assisted, a sedan in Meridian (chase and driver's eye), a Sabrewing and a
Longreach (flight engineer seat, AI gunners), the Upturned Keel, the music director's changes, 11 voice lines.

Priority: P1 blocks the A-class feel for everyone in the first ten minutes; P2 hurts a session; P3 is noticed by a careful
eye. Screenshots are under `tools/polish/out/w27a/`. The owner is the file to change. The closed history of waves 24F
and 25B is at the end; the 25A-25F / 26A-26C rows of the previous list are closed (released in db545f1) and dropped here.

## Fixed in this pass

| # | Gap | Fix | Screenshot |
|---|-----|-----|------------|
| F1 | **P1.** The fishing rod blew up: the bend spring (K 250, symplectic Euler) is unstable at the engine's 0.1 s frame clamp, so one hitch while the line was out (a shader compile, a covered window, a GC pause) sent `bend` to 1e6 and the tip to 1e10 m; the line and float meshes then filled the screen and the frame never recovered (1.5 fps for good, every later fight "threw the hook" because the fight's distance came from a 1e9 m `lineOut`). | eb047b8: the spring is substepped at 1/60 s and a non-finite bend resets (src/game/FishingRod.js); test/fishing-rod-spring.mjs fails on the old integrator at dt 0.1. **Root adds the test to package.json "test".** | (reproduced by numbers: node test/fishing-rod-spring.mjs on HEAD~1) |
| F2 | **P1.** (was 1.1) The start overlay (wordmark, rule, button) was drawn over the intro's title card: the overlay faded out over 650 ms while the card faded in at once, two HYPTILE ISLAND wordmarks stacked on the opening glide. | d8e52bb: the dismissed overlay fades in 200 ms and is hidden at 240 ms (`.is-leaving`, src/ui/UI.js, ui.css); `Intro._blocked()` holds the glide and the card until `startEl.hidden`, so the card and the overlay never share a frame (test/feature-start.mjs). Not re-played in the browser pane (24F only); the DOM order is covered by the test. | before: tools/polish/out/w27a/01-start-overlay-over-title-card.jpg |
| F3 | **P1.** (was 3.1) Meridian at night was a black void with white window rectangles: no light on the streets, pavements, apron or runway, no lit shop fronts, no car lights on the road. | One baked additive mesh (src/world/islands/meridian/NightLight.js, one draw, hidden by day): a warm pool under all 483 street lamps (every lamp, not only the 6 / 16 real LocalLights), flood-mast pools on the harbour apron and the airstrip, a spill in front of each of the 61 shops; shop glass reads as interiors (tint per shop, ceiling and shelves, signs), windows no longer clip to white; a faint sodium haze on walls (street level) and ground; runway edge lights, threshold bars and glowing markings (the runway lights were planned and never drawn); flood masts. Car headlight cones and tail-light wash on the road for every lit car (src/features/cars/CarBeams.js, one instanced draw, no light slot). Phone +0.3 MB, +1 draw (tools/perf/headless.mjs meridianDowntown / meridianDrive, before 562.7 / 565.9 MB, after 563.0 / 566.2). Tests: test/feature-meridian.mjs. | before / after in tools/polish/out/w27c/{before,after,before-cars,after-cars}/: medium-meridianStreetNight, AvenueNight, ShopsNight, ApronNight, StripNight, Night; cars lamps, night, linenight |

## Open: first ten minutes

| # | Gap | Owner (file) | Priority | Screenshot |
|---|-----|--------------|----------|------------|
| 1.2 | Play on an existing slot with the name box empty wipes the islander's name (`App.startSession`: `typeof choice.name === 'string'` is true for ''; the menu does not prefill the box from the slot). Seen: the "Audit" slot reloaded as "". | root (src/App.js: only a non-empty name replaces the slot's; src/ui/MainMenu.js: prefill) | P2 | 00-menu-slots-show-0-dollars.jpg |
| 1.3 | On the second visit the main menu waited ~55 s behind "Compiling shaders 274 / 310" (0:49 on the loader) although the shaders are byte-identical and cached; the first visit showed the menu in ~17 s. Seen under `?bg` (timer-driven frames), so verify in a plain tab before acting. | 25A (src/engine/Warmup.js, src/main.js deferCompile) | P2 | (loader text in the pane; no capture) |
| 1.4 | "The last start did not finish" card: a crash record from a session hours earlier (04:13) greets the next visit. Right as a diagnostic, but it should expire (same day, same build) and not be the first thing a returning player reads. | root (src/main.js BOOT_KEY) | P3 | 00-last-start-did-not-finish.jpg |
| 1.5 | Two tabs on one slot: a tab left open in the background (its clock frozen) autosaved its stale state ($0, play 286 s) over the new game's save every 2 min. No slot lock, no "in use elsewhere" notice. | root (src/App.js saveNow / GameState: a slot lease in localStorage with a heartbeat; refuse the autosave when another tab holds it) | P3 | 00-menu-slots-show-0-dollars.jpg |

## Open: HUD and panels

| # | Gap | Owner (file) | Priority | Screenshot |
|---|-----|--------------|----------|------------|
| 2.1 | At 800 px wide the HUD collides: toasts sit over the wordmark and the mode pill; the mode pill is clipped by the purse (boat: the compass strip overlaps both; seaplane: "chase view · ' bail out (" cut; warbird the same); the fight panel overlaps the minimap and the prompt pill; the helm prompt hides behind the instrument cluster ("eave helm · V camera"). Phones in landscape are this width. | src/ui/ui.css (a top row with a max width per pill and the toast column below it under 900 px), src/game/GameHUD.js (fight panel and prompt above the minimap's top) | P2 | 02-fight-panel-overlaps-minimap-800x600.jpg, 02-toast-over-wordmark-800x600.jpg, 06-sold-toast-over-mode-pill.jpg, 07-boat-helm-compass-strip-over-pills.jpg, 07-seaplane-airborne-mode-pill-clipped.jpg |
| 2.2 | The helicopter's flight readout and the bomber's flight-engineer panel are plain dark-green monospace boxes with raw text ("RESCUE FLIGHT · COLL 100% · ALT 31 m ..."): a debug overlay next to the glass HUD. The seaplane and warbird strips show the house style. | src/features/helicopter/HUD.js, src/features/dogfight/Hud.js (crew panels): `.gm-panel` tokens, the seaplane strip's layout | P2 | 07-helicopter-status-box-debug-look-toast-clipped.jpg, 11-bomber-engineer-seat-panel-debug-look.jpg |
| 2.3 | Vehicle key lists arrive as 6-9 s toasts (helicopter: the whole CONTROLS string, cars, warbirds, the engineer seat) and are clipped by the purse; A-class shows a controls card once per vehicle (the guide's page style) and a short toast. | src/features/helicopter/Helicopter.js, cars/Cars.js, dogfight/Dogfight.js `_tip`; src/game/Guide.js (vehicle pages) | P2 | 07-helicopter-status-box-debug-look-toast-clipped.jpg |
| 2.4 | Subtitles stack three deep and Captain Roid speaks two lines at once ("Back again. Good." and "Pick a hull." together, Ethena's line still up); the stack covers the panel's footer. | src/features/voices/Rules.js (one line per speaker at a time, a queue; at most two subtitles) | P2 | 06-subtitles-stack-three-deep-roid-two-lines-at-once.jpg |
| 2.5 | The Meridian minimap is a flat green disc: no streets, no coast, no blocks (the home island's bake is fine). | src/game/Minimap.js (bake the city's road graph and the coast for the Meridian tile) | P2 | 08-meridian-night-black-ground-green-minimap.jpg |
| 2.6 | The mode pill says "Campaign · Seaplane · chase view" in a warbird. | src/ui/AppUI.js (the vehicle's kind from the feature: 'warbird') | P3 | 10-warbird-line-meridian-night-pill-says-seaplane.jpg |
| 2.7 | The coach tip "The bobber is dipping ... click to strike" stays up into the fight. | src/game/Guide.js (tips retire on the state they taught) | P3 | 02-fight-stale-nibble-tip.jpg |

## Open: camera, world, weather

| # | Gap | Owner (file) | Priority | Screenshot |
|---|-----|--------------|----------|------------|
| 3.2 | With the player's back against the fish stand the spring arm collapses to zero and the camera sits inside the avatar's head (a green screen); a step earlier it was inside the stand's roof slab. A-class fades the avatar out under ~0.6 m of arm and keeps the camera out of solids it cannot see through. | src/player/CameraRig.js (avatar fade with the arm length; the stand's awning as a blocker) | P2 | 04-camera-inside-avatar-at-fish-stand.jpg, 04-camera-in-roof-near-fish-stand.jpg |
| 3.3 | In rain the lens droplets read as large soft white blobs across the middle of the frame, not drops on glass. | src/post (24D LensDroplets: smaller, refracting, on the edges) | P2 | 05-lens-droplets-white-blobs-rain.jpg |
| 3.4 | Rain streaks are long bright white lines against the sky from the pier. | src/fx (rain: shorter, dimmer, lit by the sky colour) | P3 | 05-rain-streaks-pier.jpg |
| 3.5 | The car's instrument faces are blown-out white discs at night (the driver's eye). | src/features/cars/CarInstruments.js (dial backlight, emissive clamp) | P2 | 09-car-drivers-eye-night-gauges-blown-out.jpg |

## Open: vehicles and combat

| # | Gap | Owner (file) | Priority | Screenshot |
|---|-----|--------------|----------|------------|
| 4.1 | Warbird from the Meridian line: full throttle as the tip says ("Shift opens the throttle · S lifts the nose at 140 km/h") rolls the Sabrewing off the apron into the sea in 8 s (78 km/h), "Ditched", the aircraft lost ($6,100 to rebuild). The line's noses point 0.65 rad off the runway and nothing says "taxi onto the runway first"; a brake-hold until lined up, or a tip with the taxi step, is owed. | 27B placement (src/features/dogfight/Site.js: a brake hold on the line, the tip) | P2 | 10-warbird-ditched-off-the-line-full-throttle.jpg |
| 4.2 | Warbird cockpit (V): a bare canopy frame and a dark block where the panel should be; the reticle is the only instrument. The crewed cockpit is a dark cabin with glowing blobs. | src/features/dogfight/Model.js (interior: panel, gunsight, seat, stick; the seaplane's Cockpit.js as the pattern) | P2 | 10-warbird-cockpit-bare-canopy.jpg, 11-bomber-engineer-seat-panel-debug-look.jpg |
| 4.3 | The Longreach costs $96,000: after a $4,500 launch and the $18,000 seaplane a first session ($100,000) cannot reach the four-seat bomber; the Sabrewing is $34,000. | src/features/dogfight/Warbirds.js COSTS (or a hire at the dispersal) | P3 | - |
| 4.4 | The helicopter stunt board, the avatar's hand grips and the car proportions stay open from the previous list (27B owns the board). | src/features/helicopter (27B), src/features/cars | P3 | 07-helicopter-barrel-roll-combo.jpg |

## Verified in play (no row)

Guide pages and the $100,000 start; the beach cast says nothing bites this close in and the tip sends you to the pier;
bites, nibbles, the take, the tension fight (a 1.78 kg houndfish in 21 s) and the marker fight; the fish stand (sold 3 for
$57 with PoorGoat's voice line and subtitle), the chandlery, the boat yard (the launch moored at the pier head, the helm,
10 knots, the instrument cluster); the seaplane (engine start, the take-off hump at 28 m/s, 98 m); the helicopter in both
models (the tricks score "Gas-fee Pirouette +100", "Margin-call Barrel roll +180", the crash card, the recall); a parked
sedan (enter, drive, the driver's eye with the dashboard prompt); the Sabrewing and the Longreach (seat 1 = flight
engineer, AI gunners in 2-3); the Upturned Keel's panel; the music director (menu -> island -> meridian-night -> sailing
while flying); voices: 11 lines said, 3 refused by the rules, 63 samples.

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
