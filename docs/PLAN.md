# Hyptile Island: continuation plan

Written 2026-10-12 so that any model (including smaller ones) can carry the project on without the
original session. Read this first, then `README.md`, then `docs/HYPTILE_ISLAND.md`. Everything below is
checkable from the repository; nothing depends on chat history.

## 1. What the project is

A browser fishing game (WebGPU + WGSL, Tidewater's own engine in `src/engine`, Vite dev server, Node 22)
forked from Tidewater at `D:\tidewater-main`. Hyptile Island adds: eight playable characters converted
from the owner's fishing workspace (`D:\fishing game`), a third-person avatar, boats to buy, PoorGoat's quests,
multiplayer through a Node relay, and (phase 2) a second island, residents, seats and rowing, progression.

Source assets never change: `D:\fishing game\Assets\...` and `D:\fishing game\JadeFisher_Comfy`. The
game's assets are REBUILT from them with Blender (`tools/roster/build.ps1`, Blender 5.2 at `D:\blender`).

## 2. Run, test, build (always do these before and after a change)

```bash
npm run dev            # http://127.0.0.1:5189  (add ?noAudio, ?bg to run in a hidden tab, ?mp for multiplayer)
npm run server         # ws://127.0.0.1:8765/island  (GET /health)
npm test               # node tests: game logic, save v2, contracts, net protocol, engine smoke
npm run test:roster    # headless render of the 8 roster GLBs (~1 min)
npm run test:fleet     # headless render of the 4 fleet hulls
npm run build          # dist/ (production bundle)
```

`START_HYPTILE_ISLAND.cmd` starts everything for the owner. The desktop app's launch configs are in
`.claude/launch.json` (names `hyptile-island`, `hyptile-server`).

Verifying in the built-in browser: the page only advances while the tab is visible; use `?bg` for a hidden
pane. The app is on `window.__app` (`__app.game.state`, `__app.player`, `__app.boatCtl`, `__app.avatar`).
Useful console checks are in `docs/PLAN.md` section 8.

## 3. Code map (who does what)

| Area | Files | Notes |
|---|---|---|
| App wiring | `src/App.js`, `src/main.js` | builds every system, `setBoat( id )`, `connect( url )`, per-frame order in `_frame` |
| Player | `src/player/Player.js` | modes walk / swim / deck / seat / boat; spring-arm third person (`view`), `pose()` for the avatar, `launch()` (shove), stamina, Caps Lock run |
| Avatar | `src/player/Avatar.js` | SkinnedModel driven by a pose; ONE_SHOT / LOOPS action maps -> clip names in `Characters.js` CLIPS |
| Characters | `src/game/Characters.js` | roster catalog, unlock rules, CLIPS, CORE_CLIPS |
| Boats | `src/game/Boats.js`, `src/world/boat/BoatFactory.js`, `FleetBoatModel.js`, `SimpleHullLines.js`, `StaticGLB.js`, `src/world/BoatModel.js` | catalog with seats / drive; fleet hulls from GLB; lobster boat procedural |
| Boat physics | `src/player/BoatController.js` | `setModel()` re-reads hydro, stations, contacts, physics from the model |
| Yard | `src/game/BoatYard.js`, `src/game/CaptainRoid.js` | display fleet moored east of the pier; Captain Roid sells boats |
| Economy / save | `src/game/GameState.js` (v2: character, unlocked, boat, quests, career, xp...) | localStorage key `hyptile-island.save.v2` (+ slots) |
| Quests | `src/game/Contracts.js` | story quests unlock characters; rolling orders; `onCatch`, `deliver` |
| HUD | `src/game/GameHUD.js` + `src/game/HudPanels.js` | panels: inventory, PoorGoat (sell / quests), Ethena Prosper (gear / crew), roster (K), yard |
| Game loop | `src/game/Game.js` | rod, bites, fight, vendors, prompts, avatar actions (`avatarAction`, `helmAction`) |
| Multiplayer | `server/index.mjs`, `src/net/*` | relay, 15 Hz, interpolation, chat, shared clock |
| Phase 2 | `src/world/PonsCove.js`, `src/game/PonsPort.js`, `src/world/Residents.js`, `src/game/Progression.js`, `src/ui/MainMenu.js`, `src/game/CameraFeel.js` | see section 5 |
| Assets | `tools/roster/*` | Blender converters; `build.ps1` is the single entry point |

Conventions: tabs, spaces inside parentheses `fn( a, b )`, no frameworks, no three.js, comments in the
existing tone. One owner per file when working in parallel. Never commit `test/out`, `dist`, `node_modules`.

## 4. Status board

Done and verified in the page (2026-10-12): roster (8 GLBs, 49 clips), third person + rod in hand,
boats to buy (5), fleet display, quests, multiplayer, save v2, seats / rowing clips, stamina, Caps Lock run,
gamepad, prank launch, HUD stamina gauge, rod tip no longer permanent.

In progress by subagents at the time of writing (check whether the files exist and their tests pass):

| Task | Files | Test | Root hooks still needed |
|---|---|---|---|
| Pons Cove (second island + port) | `src/world/terrain/IslandShape.js`, `TerrainData.js`, `WorldLayout.js` (adds `islands`, `pons`), `src/world/PonsCove.js`, `src/game/PonsPort.js` | `node test/world-islands.mjs` | App: construct `PonsCove` + `PonsPort`, add its lights; Game: push `pons.vendor` into `vendors`, call `update`, discovery bonus (`state.discover( 'pons' )` + xp); Minimap marker at `PONS_STAND` |
| Residents + clown prank | `src/world/Residents.js`, `src/world/residents/ResidentData.js` | `node test/residents.mjs` | App: `this.residents = new Residents( { scene, terrain, colliders, village } )`, per-frame `update( dt, player )`; Game: E prompt "Talk to <name>" via `residents.nearest( p.position )`, `interact()` -> toast; prank result `'launch'` -> `player.launch( dirFromClown, 6 )` |
| Progression / menu / slots / audio / presets / camera feel | `src/game/Progression.js`, `GameState.js` (xp, rep, discovered, slots), `src/ui/MainMenu.js`, `src/audio/SoundScape.js` (gains), `src/ui/AppUI.js`, `src/game/CameraFeel.js` | `node test/progression.mjs` | main.js: show the menu before the start overlay; App: `cameraFeel.update( dt )` after `player.update`; Game: `addXp` on quest deliver, `cameraFeel.kick( 'cast' | 'strike' | 'catch' | 'snap' )`; Player: `player.reduceMotion = app.settings.reduceMotion` |
| Animation retarget (Rocketbox -> 48-bone rig) | `tools/roster/retarget.py`, `fetch-rocketbox.ps1`, `build.ps1`, rebuilt `public/models/roster/*.glb` | `npm run test:roster` + look at `test/out/roster-*.png` | none (clip names unchanged) |
| Captain Roid (the owner's character from the naval fork; model `public/models/npc/captain-roid.glb` built by `tools/roster/convert-roid.ps1`, recorded clicks `public/audio/captain_roid_clicks.ogg`) | `src/game/CaptainRoid.js`, `src/audio/Clicks.js`, `src/game/HudPanels.js` (yard panel, Marta loses the boats tab) | `node test/roid.mjs` | App: construct `CaptainRoid` with `new Clicks( { getContext: () => this.audio && this.audio.ctx } )`, add his lantern; Game: push `roid.vendor`, `roid.update( dt, player )`, `roid.hooks` (state.career.metRoid), `game.roid = roid` |

When a subagent's report is missing, read the top comment of each file: every file documents its own
interface.

Update after 1.1 (2026-10-12): residents, Captain Roid, progression / menu / presets / camera feel and the
Rocketbox animation retarget are integrated and shipped as `releases/hyptile-island-1.1`. Movement speeds:
jog 2.7 m/s default, Caps Lock walk 1.25, Shift sprint 4.6 (Player.updateWalk), avatar walk/run threshold
1.8 m/s (Avatar.update). Pons Cove is the remaining in-progress task (partial files in `wip/pons-island/`
if its agent did not finish; check `test/world-islands.mjs`).

Version 1.2 (in progress 2026-10-12, owner feedback on 1.1): the boat seller is **Captain Roid** (not
"Rodi"; done: `CaptainRoid.js`, `tools/roster/convert-roid.ps1`, `test/roid.mjs`): his model, three animations and
recorded clicks come from `D:\fishing game\Forks\Fishing_Naval_20261007\Assets\CaptainRoid`. Also: roster mesh quality (higher
triangle budget, normal maps), swim animation broken, rod-in-hand fishing looks like a static pose, arms
clip through the body in the walk (retarget offsets), and the fishing fight must be losable (tuning in
`CatchMinigame.js`; it was never changed from Tidewater, it is just lenient). Release folder:
`releases/hyptile-island-1.2` built the same way as 1.1 (copy `dist`, `server`, `src/net/Protocol.js`,
`src/game/Characters.js`, `src/game/Boats.js`, `node_modules/ws`, `serve.mjs`, the launcher).

Version 1.3 (2026-10-12, owner feedback on 1.2): Captain Roid's voice is the naval fork's click-and-call
synthesiser (`src/audio/RoidVoice.js`, verified sample-identical to the fork's browser prototype
`Deliverables/Fishing_Browser_Prototype_20261011_v2`), not the 2 s ElevenLabs file; subtitles follow the
phrase timing. The fork's prototype also has `web/assets/roid/CaptainRoid_v3.glb` (a newer Roid model than
ours) if his look needs another pass. In progress: upper-body animation layering (rod clips on the arms while
the legs walk) and a real overhead cast; game modes Sandbox / Campaign / Multiplayer with world options locked
outside Sandbox; an Esc pause menu with Save. Release servers send `cache-control: no-cache` (1.1 and 1.2 shared
port 5190, so the browser could reuse old character files).

## v2 (started 2026-10-12): the naval fork's concepts, as feature modules

Source of the concepts: `D:\fishing game\Forks\Fishing_Naval_20261007\docs\WORLD_TRADE_PIRATES_BRIEF.md` and
`NAVAL_BRIEF.md` (weather, merchant trade, pirates, mini-quests and bounties, naval combat, melee, dynamic audio),
its browser prototype (`Deliverables/Fishing_Browser_Prototype_20261011_v2`: ships, raider combat, Roid) and its
assets (`Assets/NavalShips`, `NavalAudio`, `Audio/Combat`, `MarineLife`, `HarbourDetails*`).

Contract: every v2 system is a folder `src/features/<name>/` whose `index.js` exports `install( app, features )`
returning an instance (`update( dt )`, `dispose()`, `toJSON()` / `fromJSON()`, `reset()`), registered on the
`Features` registry (`src/features/Features.js`: events, E interactables, key claims, per-feature save data).
Integration (one person, after the parallel agents): App creates `this.features = new Features( this )`, adds
each module, calls `features.update( dt )` after `game.update`; Game shows `features.nearestInteractable()` as the
E prompt when nothing else has it and emits `fishCaught` / `fishSold`; GameState saves `features.toJSON()`.

| Feature | Folder | Owner status |
|---|---|---|
| Dynamic weather (clear / breeze / overcast / rain / storm / fog, rain, lightning) | `src/features/weather` | agent |
| Merchant trade (goods, two ports, supply and demand, spoilage, events, ledger) | `src/features/trade` | agent |
| Naval: AI merchant and pirate ships, cannons, hull damage, sinking, loot | `src/features/naval` | agent |
| Notice board and bounty contracts | `src/features/notices` | agent |
| On-foot melee: shore raiders, block / dodge / stamina | `src/features/melee` | agent |

## 5. Next tasks, in order (each is one bounded job for one model)

1. **Integrate the five in-progress deliveries** (root hooks above). Acceptance: `npm test` green, the page
   loads with no console errors, `?bg` console checks in section 8 pass, `npm run build` succeeds.
2. **Version 1.1 build**: bump `package.json` version to `1.1.0`, `npm run build`, copy `dist` to
   `releases/hyptile-island-1.1/` with `START_HYPTILE_ISLAND.cmd` and `server/`, write `releases/NOTES-1.1.md`
   (what changed since 1.0: everything in section 4 plus the animation fix and Captain Roid).
3. **Animation quality pass 2**: blend walk <-> run by speed (two layers weighted by speed instead of a
   switch) in `Avatar.js`; foot slide check; idle variations (Look_Around / Swagger every 20-40 s when
   standing still); turn-in-place when the yaw changes by more than 60° while standing.
4. **Character look**: hull-space lighting for the avatar materials (`underwaterLighting: 'lite'` costs
   little), a subtle rim / sheen on the skin material in `Skinning.js`'s `skinnedMaterial` (surface snippet),
   eye highlights (the eye materials are flat: give them `roughness 0.25`); portrait re-render.
5. **Passengers on another player's boat** (multiplayer): a `seat` request message, the host boat's
   transform drives the guest; `src/net/Protocol.js` + `RemotePlayers.js` + `Player.js`.
6. **Authoritative server** (large): server runs `GameState` per player, validates sales / purchases /
   catches; client becomes a view; rooms with persistent saves on disk.
7. **Melee + ragdoll knockdown** (the Unreal game's combat): swing clip, hit reaction, knockdown / get up;
   ragdoll as a verlet chain over the 48 joints.
8. **Blink / gaze**: keep the shape keys in `convert-character.py` (needs decimation before shape keys are
   re-added, or skip decimation for the eye region) and add morph targets to `GLTF.js` + `Skinning.js`.
9. **Cargo grid** view over the weight-based hold (optional).

## 6. Asset pipeline rules

- `tools/roster/build.ps1 [-Only id,id] [-Boats] [-NoCharacters]`: 8 characters + portraits, 4 hulls.
  Logs in `tools/roster/logs/`. Decimation target 60 k triangles; textures 2048 / 1024 JPEG.
- Clips are FBX files on the same 48-bone rig assigned directly (no retargeting needed) unless they come
  from Rocketbox, which go through `tools/roster/retarget.py` first (delta retargeting: source rotation
  relative to its rest applied on the target rest).
- After any clip change: rebuild, `npm run test:roster`, look at the PNGs, and keep `Characters.js` CLIPS
  in sync (the smoke test asserts every CLIPS value exists in every GLB).

## 7. Pitfalls learned (do not rediscover them)

- Writing files through the shell with heredocs breaks on apostrophes in this harness: write patch
  scripts with the Write tool, then run them with `python -I script.py`.
- A hidden browser pane never fires `requestAnimationFrame`: load with `?bg`.
- `App.setBoat` only swaps the model when the id changes; the initial lobster model needs `boat.id`.
- `BoatController.setModel` keeps its water-query slots; a bigger hull reallocates.
- `SkinnedModel` builds every skinned mesh node (Bravile has body + quiff); `nodeMatrix( 'weapon_r' )` is the
  rod socket.
- The Rocketbox fetch needs the LFS media URL first and the raw URL as fallback (`tools/characters/fetch.sh`).
- `npm test` runs `test/engine-smoke.mjs` with an output path under `test/out` (the `/tmp` default fails on
  Windows).

## 8. Console checks (paste into the page console with `?bg&noAudio`)

```js
const a = __app, g = a.game, s = g.state;
s.earn( 20000 ); g.buyBoat( 'launch' ); g.unlockCharacter( 'bonk' ); g.setCharacter( 'bonk' );
// expect: s.boat === 'launch', a.boat.group.visible, a.avatar.character === 'bonk'
a.player.position.set( 62, 2.3, 30 ); a.player.enterBoat(); a.input.keys.add( 'KeyW' );
// after 3 s: a.boatCtl.speed > 3, s.fuelL < s.stats.fuelL; then a.input.keys.delete( 'KeyW' ); a.player.leaveHelm();
g.contracts.active.map( ( q ) => q.title ); // first catch, four story quests, three orders
a.net && a.net.online; // with ?mp and the server running
```

## Handover 2026-10-12 (usage limit reached mid-v2)

Done and green (`npm test`, `npm run build`): modes + pause menu + world save, Roid voice (RoidVoice.js),
upper-body rod layering + new fishing clips, Doge mesh fix (decimation weight 0.9), trade feature, and the
generic feature integration (src/features/install.js, App/Game/GameState hooks: registry, E prompts,
panel / mouse gating, fishCaught / fishSold events, features data in the save).

Next steps, in order:
1. Rebuild Pengu (same decimation bug as Doge): `powershell -ExecutionPolicy Bypass -File tools/roster/build.ps1 -Only pengu -SkipRetarget`
   (optionally all characters: the new weights help Pepe, Bonk and Clown), then `node test/roster-smoke.mjs`.
2. Package 1.3: copy `dist` into `releases/hyptile-island-1.3/game` like 1.2 (server, src/net/Protocol.js,
   src/game/Characters.js + Boats.js, node_modules/ws, serve.mjs with `cache-control: no-cache`, launcher
   renamed to 1.3), notes are in `releases/NOTES-1.3.md`. Trade is included (it is integrated).
3. v2: four feature agents (weather, naval, notices, melee) were still running; check which of
   `src/features/{weather,naval,notices,melee}/index.js` and their `test/feature-*.mjs` exist and pass, then add
   each to MODULES in `src/features/install.js`, apply the hooks each report asks for (weather: bite delay /
   biteModifier in Game.updateBite; naval: speedFactor on boatCtl.maxThrust, playerBoatSunk -> ashore + berth,
   `naval.playerGun` purchase at Roid; notices: map 'rewardUnlock' to state.unlockCharacter( id, { free: true } );
   melee: avatar action from `melee.playerAction`), append their tests to the npm "test" script, verify in
   the browser (`?bg&mode=sandbox`), and package as `releases/hyptile-island-2.0`.

Update after the reset (2026-10-12): Pengu and the others rebuilt with the fixed decimation (8/8 smoke);
weather, trade, notices and melee integrated (src/features/install.js MODULES, rewardUnlock -> free unlock,
portVisited on arriving at Pons, melee.playerAction first in Game.avatarAction, weather.biteModifier in
Game.weatherBiteDelay); verified in the page (no errors, features installed, trade prompt, 4 postings,
3 raiders). Released as `releases/hyptile-island-1.3`. Remaining for v2.0: integrate naval
(src/features/naval: an agent is finishing it) and package `releases/hyptile-island-2.0`.

v2.0 released (2026-10-12): `releases/hyptile-island-2.0`. Naval integrated (MODULES; Game.updateBoat applies
naval.speedFactor to boatCtl.maxThrust; playerBoatSunk in install.js puts the player ashore at WORLD.start,
resets the boat and calls naval.rescue(); Roid's yard sells the swivel gun levels 1-3 ($600 / $1200 / $2400)
and hull repairs (HudPanels yardExtras)). Live check: 3 ships at start, gun fitted from the panel, hull damage
slows the boat, an accepted bounty spawned its captain's ship, no console errors.
Next ideas: tune pirate frequency and gun damage from play; naval combat in multiplayer (server authority);
weather and ships frame cost on lower-end GPUs; a HUD hint for Z / X at the helm once the gun is fitted.

## v2.1 wave (2026-10-12): every remaining concept from the other game

Common rules for these agents: new code goes in `src/features/<name>/` (install( app, features ) contract)
unless the task says it owns a shared file; describe the core hooks needed (App / Game / GameState are
integrated by the root afterwards); tests in `test/feature-<name>.mjs`; `node --check`, the test, and a
scratch Vite build (`npx vite build --outDir <Temp dir>` with a scratch entry; never overwrite dist/).

| Gap | Owner files |
|---|---|
| A ship classes: own a sloop / brigantine / trawler with cannons | Boats.js, src/world/boat/*, src/features/naval/* |
| B boarding, captured captains, ransom | src/features/boarding/ |
| C marine life + harbour dressing + Pons palms / rocks | src/features/dressing/, public/models/marine, public/models/harbour |
| D dynamic audio (rigging, hull, line creak, strike, clown audio, residents) | src/features/sfx/, public/audio/sfx |
| E Captain Roid chat topics + subtitles | src/game/CaptainRoid.js, src/audio/RoidVoice.js, src/audio/Clicks.js, src/game/HudPanels.js |
| F1 blink / gaze morphs + ragdoll knockdown | src/engine/loaders/GLTF.js, src/engine/render/Skinning.js, src/player/Avatar.js, tools/roster/convert-character.py, roster GLBs |
| F2 illustrated main menu + cargo grid view | src/ui/MainMenu.js, src/game/GameHUD.js, public/ui/menu |
| H multiplayer: crew codes, passengers, ships and cannon fire for everyone | server/*, src/net/*, src/features/netsync/ |
| I more islands with ports | src/world/TerrainData.js, terrain/IslandShape.js, WorldLayout.js, src/world/islands/, src/game/ports/ |

## v2.1 released (2026-10-12): `releases/hyptile-island-2.1`

All nine v2.1 tasks integrated (MODULES order in src/features/install.js: weather, trade, notices, melee, naval, sfx,
boarding, netsync, dressing; Ports in App/Game/Minimap/Player; ship berths via BoatController.dockPosition and
Boats.berthOf; helm deck height for ships; ragdoll on melee knockdown in Game.avatarAction; WaterQuery MAX_QUERIES
128 with Math.ceil( MAX_QUERIES / 64 ) workgroups). Live check in sandbox: every feature installed with no failures,
brigantine at its berth (4 guns a side, 760 hull points), broadside reload, both new ports, Pepe's blink morphs
and a blink, a ragdoll fall and recovery, a pirate at sea. Release launchers (all versions) fixed: serve.mjs now
calls server startServer() because importing server/index.mjs does not start the relay.

Every concept from the naval fork's briefs and the Unreal game's feature table now has a browser counterpart.
Open polish: pirates aim only at the crew's first player; frame cost with everything on (lower-end GPUs);
tune ship acceleration, pirate frequency and boarding difficulty from play; get-up uses Knockdown reversed
(the roster's GetUp clips are authored as falls).

## v3 wave (2026-10-12): seaplane, destruction, new start, world map, persistent universe, Unreal parity

| Task | Owner files |
|---|---|
| Parity audit of every planned Unreal / naval-fork feature | docs/UNREAL_PARITY.md (read-only otherwise) |
| Seaplane (take off / land on water) | src/features/seaplane/, public/models/seaplane/, tools/seaplane/, Player.js (vehicle passthrough + pose only) |
| Destructible environment (AVBD-style physics) | src/physics/, src/features/destruction/, public/models/destructible/ |
| New starting point + loader art | src/world/start/, WorldLayout.js (start / spawn fields), index.html loader images, public/ui/keyart* |
| World map in the minimap style | src/game/Minimap.js, src/ui/WorldMap.js |
| Persistent universe (self-hosted server) | server/*, src/net/*, src/features/netsync/*, src/ui/MainMenu.js, src/game/GameMode.js, docs/HOSTING.md, tools/host/ |
| Foot / hand IK | src/player/Avatar.js, src/engine/render/Skinning.js, src/player/ik/ |
| Ship modules and upgrades (naval fork NavalModules) | Boats.js, src/world/boat/*, src/features/naval/*, public/models/modules/ |
| VFX set (muzzle smoke, splinters, splashes, sinking) | src/features/vfx/ |
| Night identity (bioluminescence, lighthouse beam, lantern glow) | src/features/night/ |
| Accessibility, key remapping, localization (EN / RO) | src/ui/Accessibility.js, src/core/Input.js, src/ui/AppUI.js, src/i18n/ |
| 30+ mini-quests, NPC memory, consequences | src/features/notices/*, src/game/Contracts.js, src/features/story/ |
| Unreal fish set (silverminnow, rootfin, lanterncarp, upsidedowneel, glassperch, crookedcod) + marker-timing minigame | src/world/fish/*, src/world/Fish.js, src/game/FishTable.js, Bites.js, CatchMinigame.js, FishPortrait.js, FishStand.js |
| Islands 5-8 incl. the Inverted Isles (Unreal identity) | src/world/islands/*, src/game/ports/*, TerrainData + src/world/terrain (additive), WorldLayout islands/ports |

Libraries (user, 2026-10-12): after phase 2 three.js, Rapier and similar libraries are allowed. Installed: three@0.186.1,
three-avbd@0.3.0 (MIT), @dimforge/rapier3d-compat@0.21.0. The renderer stays the project's WebGPU engine. Workers never run
npm install themselves; root installs. Any model may be used for workers (Opus for the hard ones).
Cross-worker APIs: app.netsync.sendWorldEvent( kind, data ) + 'remoteWorldEvent'; destruction.raycastSegment / impulse;
vfx.splash/spray/smoke/splinters/flash/debris/fire/stopFire/bubbles; seaplane.marker/decorateState/updateRemote.

### v3 gap packages (from docs/UNREAL_PARITY.md, launched 2026-10-12)

| WP | Owner files | Notes |
|---|---|---|
| A economy, customs, operating costs | src/features/trade/*, src/features/customs/*, Gear.js, Chandlery.js | holds the naval holdBonus, story priceMod and universe market snapshot hooks |
| B pirates, dens, notoriety | src/features/pirates/*, src/features/boarding/* | uses naval only through its public API |
| C ship systems (sections, fire, flood, wrecks, ammo, sail model) | src/features/shipdamage/*, src/player/SailModel.js | waits for the naval ship-modules worker |
| D world identity, exploration | src/features/inverted/*, life/*, exploration/*, weather/WeatherAudio.js | no fireflies (night), no splashes (vfx), no Inverted Isles terrain (islands) |
| E harbour life, tavern, crafting | Residents.js, residents/*, src/features/harbour/*, crafting/* | no dialogue system (story owns it); harbour.openService for story |
| F saves, perf, gamepad, feel | SaveVault.js, SaveManager.js, SAVE_FORMAT.md, Gamepad.js, Glyphs.js, CameraFeel.js, DebugPanel.js, ErrorLog.js, tools/perf | |

### v3 integration log (root, 2026-10-12)

Briefs for every worker live in docs/briefs/ (COMMON.md + one per task) so a cut-off worker resumes from disk.
Installed in MODULES and green: worldmap (M; mute is Shift+M), vfx (after naval), night, story (after notices; Roid's
Talk tab lists story topics; residents with a story open the conversation panel). Wired without a module: accessibility
(app.accessibility: captions, fishing assist -> career.assisted, Controls/Access tabs, EN/RO), IK (App feeds
playerGroundProbe + contactTargets; remote players get terrainGroundProbe), universe (netsync + MainMenu Universe tab,
docs/HOSTING.md, tools/host). Also landed: fish set (marker fight, GameHUD MarkerGauge, rateMul assist hook), naval modules (HudPanels Modules section,
biteBonus in weatherBiteDelay, holdKgBonus), WP-F (ErrorLog in main.js, attachVault + attachGlyphs in App, debug + saves
modules, Saves button in the pause menu, ?bench&perf=all runner). Browser-checked in sandbox: world map (layout fix
requested), night glow, all modules installed with no console errors.
Also landed: destruction (Rapier backend; initPhysics awaited in App before installFeatures; melee emits meleeHit and
canSwing near props), pirates (after boarding), harbour + crafting (after story; bite hook in weatherBiteDelay), WP-D
inverted / life / exploration (after naval), seaplane (App onStates -> updateRemote, netState -> decorateState).
All 17 v3 workers landed (start first in MODULES with the intro trigger in startSession; islands 5-8 need no root hook;
customs after trade with the bait / upkeep / gear-gate hooks in Game, GameState, HudPanels, GameHUD).
Release: releases/hyptile-island-3.0-pre (intermediate, 2026-10-12): game/ (dist), server/ (relay + universe),
src/{net,game} sources the server imports, node_modules/ws, serve.mjs, PLAY_HYPTILE_ISLAND_3.0-pre.cmd,
HOST_UNIVERSE.cmd + serve-universe.mjs + HOSTING.md, NOTES-3.0-pre.md. Packaging recipe: build dist into game/, copy
those files, rename 2.1 -> version in serve.mjs and the cmd (it was done with a scratch script; keep this list current).
Verified live from the package: all modules install, 6 outer ports, no console errors; sandbox opening view, world map,
night glow checked in the dev build. Not played through: seaplane flight, boarding by pirates, universe hosting end to end.
Open polish: player boat sinks instantly (install.js rescues on playerBoatSunk; an 8 s listing needs a root delay);
MainMenu language choice; NavalLink puppet hits may draw twice with vfx (check src/features/netsync/NavalLink.js).

## Wave 4: alpha polish (2026-10-13, briefs in docs/briefs/w4-*.md)

| Task | Owner files |
|---|---|
| Colyseus transport + rooms (keeps universe persistence) | server/*, src/net/*, src/features/netsync/*, MainMenu.js, tools/host/*, HOSTING.md |
| Performance + auto quality (user: ~24 fps) | src/core, engine, post, ocean, sky, world (not start/islands), materials, fx, AppUI presets, vfx/night/dressing/life budgets, tools/perf, docs/PERF.md |
| Destroyable boats, death, respawn, body crate, map markers | src/features/death/*, naval/Naval.js, Ship.js, Projectiles.js, Models.js, Wrecks.js, worldmap marker API, Minimap.js |
| Combat rework + peaceful home island | melee/*, pirates/*, boarding/*, naval/Brains.js, Hud.js, Ballistics.js, AimAssist.js, CameraFeel.js |
| Animation graph (blend spaces, montages, state machine) | src/player/Avatar.js, src/player/anim/*, Characters.js, tools/roster |
Installed: colyseus 0.18.9, @colyseus/sdk 0.18.5 (colyseus.js 0.16 was removed: it needed a shim), @colyseus/schema 5.0.39.
The official Colyseus agent skill is at .claude/skills/colyseus (user-added 2026-10-13): read its SKILL.md before any Colyseus code.

Wave 4 landed (2026-10-13): all five workers integrated; full suite 4,918 checks green. Release
releases/hyptile-island-3.0-alpha (packager: build into game/, copy server/* incl. rooms.mjs + schema.mjs, src/net/Protocol.js,
src/game/Boats.js + Characters.js, tools/host launchers, HOSTING.md, then `node tools/host/pack-server-deps.mjs <release> --verify`
for the Colyseus server deps). Browser-checked in campaign: death cut -> respawn at Jade Landing -> sea chest marked on both
maps; auto quality picks a tier; frames need a fronted pane (the ?bg shim now falls back to timers when rAF stalls).
Not played through: seaplane flight, pirates boarding, a hosted universe with two real clients, long combat sessions.
Next: alpha feedback from testers; per-feature i18n; the player-boat sinking is only resolved on its owner's machine.

### Wave 5: alpha feedback (2026-10-13, briefs docs/briefs/w5-*.md) - all landed
Roid: own clips were frozen poses -> six roster clips retargeted (tools/roid/retarget.mjs -> public/models/npc/captain-roid-clips.json),
yard moved beside the boathouse (99.3, -56.5), routine by the clock, deck-aware height; Game no longer updates him twice.
Keys: Ctrl never a game key (browser shortcuts blocked, Ctrl+S quick save), seaplane throttle-down = C, F11 fullscreen + keyboard
lock; guard is a hold with release rules (the stuck block was a looping montage). Names: Marta -> Ethena Prosper, Joe -> PoorGoat
(signs repainted in public/models/props/signs.png). CREDITS.md + src/ui/Credits.js (main + pause menus); the art credit is a
placeholder for the user. Black squares = NaN from VegMaterials.js / GrassField.js pow() of negatives (guarded;
`node tools/perf/headless.mjs --nan-check --quality=low --dawn=<dir> --backend=vulkan` is the regression check). Weather chip
now names the current kind until a change is half way. Death cut on the UI root (z 900), self-driven when the game pauses.

### Wave 6: mobile (2026-10-13, docs/briefs/w6-mobile.md) - landed
Touch.js (detection + maths), TouchControls.js (stick, look drag, context buttons, lever; created by AppUI), Input touch
source, Quality mobile tier (phones Low at 0.75, M-series iPads Medium), textures capped at 1024 px on phones (?tex=full),
no-WebGPU page in UI.js, manifest + icons, pinch-zoom map, docs/MOBILE.md checklist. Verified in the pane at 740x360 with
touch emulation: layout, stick moves the player (synthetic pointer events). Follow-ups: WaterQuery count and SoundScape
voice limits have no mobile setting; no service worker; not yet run on a real phone.
GitHub: https://github.com/JeffreyEpsteel/Hyptile-Island (Pages deploys main via .github/workflows/pages.yml to
https://jeffreyepsteel.github.io/Hyptile-Island/). Pushes go through the user's terminal (no token in the sandbox).

### Alpha feedback round 2 (2026-10-13, root)
iOS: WebKit limits + serial compiles + stripped WGSL + the phone memory budget (GPU 694 -> 387 MB; shared packed/index
buffers in MeshRenderer, one height texture, phone caps) - the iPhone 17 Pro now plays; a kill at frame 3534 / 472 MB GPU
is still open (no GPU growth headlessly over 3600 frames). Mobile: fullscreen button (iOS: Add to Home Screen tip), guide
card fits, iOS media unlock for sound. Melee swings anywhere the rod is stowed. Fishing: strain while the crank is held
(pump the rod), rod breaks past 1.14 tension (state.rodBroken, Ethena repairs), fishing from a still boat's helm.
Multiplayer on Pages: no page-host default (isStaticHost), https tunnel addresses, tools/host/HOST_UNIVERSE_TUNNEL.cmd
(cloudflared quick tunnel) + HOSTING.md. Cockpit rework: docs/briefs/w8-cockpit.md (worker).

### Cockpit landed + iPhone round 3 (2026-10-13, root)
Seaplane cockpit (worker wave 8, integrated): live instrument panel (six-pack, lamps, fuel / hull bars, flaps, trim, radio),
clickable switches (mouse ray / keys U O N ; Y [ ] - = M, touch Cockpit panel = 3), master + starter + fuel tank (refuel at
the ramp), nav / landing / cabin lights, flaps and trim in Flight.js, autopilot level hold, chase-view instrument strip,
HUD off the windscreen in first person, engine / flap / stall / switch sounds. HUD mode label "Seaplane · cockpit / chase view".
Black screen after the engine ran (Chrome, not Dawn): the lens flare's eased visibility (a storage float) had gone NaN
once and `mix()` kept it NaN for ever; `vis <= 0.0` is false for NaN so every pixel got NaN light -> black. Fixed in
src/post/LensFlare.js: the kernel drops non-finite / out-of-range values, flareLight returns 0 unless vis > 0, update()
guards a non-finite projection / dt. The first NaN's source was not caught (clouds history scanned clean afterwards).
iPhone (user report, frame 15974, 507 MB, killed while "boatTrap main" compiled after quick boat swaps): MeshRenderer no
longer compiles pipelines synchronously on phones (syncPipelines = !GPU.lazyPipelines; a swapped boat pops in when its
async compile is done). Boat yard panel on a short landscape phone: the list kept 120 px min-height (it was squeezed to a
sliver under the footer), greeting clamped / hidden under 460 px. Getting ashore: ashoreTarget() reaches 5 m and accepts
wading depth; at the helm, stopped by land, E steps straight ashore (Q keeps the deck; touch shows a Deck button).
Boat swaps leak ~10 small GPU buffers each (count only, no MB growth over 16 swaps): follow-up.

### Wave 9 (2026-10-13, root + 3 workers): combat you can play, settings you can reach
User feedback: cannons uncontrollable, boats clip through each other (wants collisions with damage and visible
destruction), pistol + musket to buy, settings tabs unreachable / drifting on mobile, light options on touch, AA off by
default. Root: anti-aliasing off by default (PostFX aaMode 'none'; Settings > Performance turns TAA on), L at the helm
toggles the boat's lights on every hull (App.setBoatLights / toggleBoatLights, app.boatLightsOn; L stays the flashlight
elsewhere). Workers (briefs docs/briefs/w9-*.md, exclusive files, root patches reported): 9A naval collisions (SAT hull
boxes, inverse-mass separation + impulse, closing-speed damage with a bow bonus, splinters / planks / smoke / audio,
pirate ramming, RMB-aimed cannons + LMB fire, sandbox swivel gun, target hull bar with the 25 % cripple mark, shipCrippled
event); 9B firearms feature (flintlock pistol + musket, cartridges at the chandlery, G draw, LMB fire, RMB aim, R reload,
hitscan through the melee enemy API, peace zone); 9C settings panel as a fixed flex column with a wrapping tab strip and
the pages as the only scroll region, touch light buttons (boat L, plane N / ;).
Landed (2026-10-13): 9A src/features/naval/Collisions.js + Planks.js, Ship.shift / applyImpulse, BoatController.applyCollision,
ShipClasses masses, Brains ramming / avoidance, Naval aiming (naval.aiming / aimInfo, input.rightDown or aimHeld),
Hud crosshair + range + target hull bar, hullsCollided event; played: the launch stops against a sloop instead of
passing through, a ram at ~8 m/s cost the launch 18 hull and the sloop 2, the aim overlay reads "STBD · 28 m" and a
shot reports "WIDE 94 m". 9B src/features/firearms/* (index, Firearms, FirearmsData, Hitscan, GunAudio, WeaponMesh):
registered after death in install.js; Game.js routes R to the reload and the player action to the gun; melee yields
the mouse while a gun is drawn; chandlery rows via firearms.shopRows(); touch Gun / Fire / Aim buttons. Played: buy,
draw, the pistol in hand. 9C landed (see above). Boat swaps / remote boats do not collide yet (local boat + AI ships).
Still open from the user's list: "improve fighting and combat per total" beyond these (next wave, after the user plays
9A / 9B), iOS constant lag (needs a profile with the pane visible), Low-quality clouds (resolution decoupled; judge on
the phone).

### Wave 10 (2026-10-13, root + 2 workers): crew, helm, lights, pace
User list: stamina 10x, running 3-4x, purchases must not scroll the panel, lights that light the surroundings, crew that
works the cannons and fishes at sea, the helmsman's A-pose and the still wheel, third-person cannon aiming.
Root: sprint 16 m/s (was 4.6) and a sprint lasts ~80 s (was 8); GameHUD._keepScroll keeps the stand list scrolled across
re-renders (purchases, sales, tabs); LocalLights: boat lamps 2-3x brighter and twice the range, lamps come up from dusk,
flashlight 120 / 48 m (was 55 / 30). Workers: 10A docs/briefs/w10-crew-aim.md (over-the-shoulder aim camera with the
impact crosshair, naval.aimCamera(); src/features/crew: gunners and anglers posted from the chandlery Crew tab, berths
per hull, crew figures on deck); 10B docs/briefs/w10-helm.md (helm pose through the IK grips on every hull, the wheel
turns on the fleet / ship hulls, wheelGrips()); 10C w10-water-lights.md (the sea takes the local lights); 10D
w10-plane-crash.md (crash severity, wrecks that break up, the pilot thrown clear, recovery at the yard); 10E
w10-plane-ui.md (touch fold tray + top-row toggle).
Landed (2026-10-13, all five): see the commits 9998432..0e9615c. Played in the browser: the cutter's procedural wheel
turns with the steering and the helmsman stands with his hands on it; treading water upright, a prone crawl when
moving; the aim camera swings over the aimed shoulder with the impact crosshair and "out of arc"; the stand list
keeps its scroll across a purchase; sprint 16 m/s; lamps light the lobster boat's deck, every hull has lamps, the
torch lights the pier. Known: the roster's Helm_Idle / Steer / Seated_Idle / Fall_Loop clips are near-bind retargets
(re-export in tools/roster some day); AI ships' wheels and fleet tillers are still; other players do not see wrecks;
remote boats do not collide.

### Wave 13 (2026-10-13 night, root + 4 workers): the new places become places
13C ambience and maps (docs/briefs/w13-ambience-maps.md, landed 535b5aa): synthesised beds for Tidemark (market murmur on
the residents' schedule, chapel bell on the hour, quay gulls, airstrip run-ups, boatyard hammering by day) and Blackwater
(Rum Hole and drums at night, caldera surf, fort bell on the alarm, battery reports echoing), cues for batteries, powder,
the black flag, claims, practice swords, the chute, the Kestrel's wheels; the Albatross's second engine voice beats
against the first (PlaneAudio engines / failed); world map legend, Blackwater "?" until discovered, airstrip and
parked-plane markers, quest pins (questPin / questPinClear), Tidemark on the map terrain bake.
13A water / vegetation domain (w13-water-domain.md, 8d34193): the height and shore textures carry the outer terrain
tiles (TerrainTiles.js) under the home data, so shallow tint, shore waves, swash and breakers reach Tidemark; scatter and
grass plant the tile; the minimap bakes the tile under the player. 13B quest lines (w13-quests.md, e3d2eeb): seven
quests in StoryData.W13_CHAINS (A ferry to Tidemark, Wings, The long way round, Rumours from Blackwater, The black flag,
Hold the line with a raiding sloop that fires on the waterfront, Learn to fight), new Rules (counts, standing gates, step
payouts, time limits, repeats, plane-only reach), board notices taken through the story, root hooks (contrabandSold,
powder / Kestrel / chandler discounts, the strip hangar's engine row, Tidemark haul contracts and gunner wages behind
their quests, sales report the port). 13D netsync (w13-netsync.md, 1148098): PlaneLink (airframe / livery / upgrades,
the chute, stray and parked planes), StrongholdLink (host-authoritative Blackwater), TownLink (prop respawns,
hostRequest / askHost), server messages plane / fort / ask with rate limits; the fort state does not survive a universe
server restart yet.

### Wave 18 (2026-10-14, root + 5 workers): visuals, way of life, city looks, weapons, animation library
Asked for: improve all aspects of the visuals, the way of life and the looks of the cities, expand weaponry, continue the
animations; Blender, BlenderKit and found assets allowed (permissive licences only, no logins). 18A visuals
(w18-visuals.md), 18B town life (w18-townlife.md), 18C city looks (w18-citylooks.md), 18D weapons (w18-weapons.md), 18E
animation library (w18-animlib.md); common rules in w18-common.md. In progress.

### Wave 17 (2026-10-14, root + 1 worker): no A-pose
Asked for: fix the animations (even the jump was an A-pose), using ComfyUI SkinTokens / NVIDIA Kimodo. Found: 22 roster
clips from the old procedural motion pack moved 11-13 of 48 joints and left the spine, neck, head and hands at the bind
pose; the rig itself was fine (no re-rig needed). Root (97f734f): 19 clips replaced with Kimodo takes through the approved
roster pipeline (direction retarget, per-character arm collision fix) and spliced into all eight GLBs
(tools/roster/kimodo-splice.ps1; unpitch-swim.mjs stands the prone swim takes up), GetUp_Back added, Fall_Air pose clip for
the fall, the jump / hit / get-up timings, the ragdoll picks the front or back get-up; rejected: the Kimodo fall, the
floor-height sits, the arms-down helm. 17B audit (w17-anim-audit.md): chute hang, rowing / paddling stroke loops, the
water pull-up, gun aim / kick / reload poses, gunners at the guns, the coxswain on the wheel, test/feature-anim-audit.mjs.

### Wave 16 (2026-10-14/15, root + 4 workers): polish, onboarding, perf, saves
Root verified wave 15 in the browser first (a merchant taken with her cargo, a calm-zone pirate turning back, a flare
answered by a trawler and the ride to the dock on her deck, the mail Petrel's schedule). 16B onboarding
(w16-onboarding.md, 779b2de): eleven guide pages as data with binding-aware glyphs and touch names, the F1 sheet from the
a11y model, seven one-time tips (src/game/Tips.js, feature 'tips'), ~220 en / ro strings. 16D saves + quests
(w16-saves-quests.md, 0d1299e): test/save-roundtrip.mjs over every feature and a universe profile; fixed a slot switch
writing the previous game's features into the new slot (App.startSession), career flags failing the vault's validation
(every load fell back to a backup), destruction's pending list, market event ids, the universe's career booleans and
fence-sale budget; quests Mayday, Letters of marque, The salt road (W16_NOTICES). npm test now runs the wave 13-16
suites. 16A (w16-polish.md, 6d48847): a 'launch' ship class with a shared GeoKit hull (world/boat/Launch.js) naval
draws for everyone, a coxswain at the wheel, the mail Petrel at her stops with MAIL on her sides and a walking pilot,
left boats pinned on the maps, a rescue in progress saved, RescueLink syncs a guest's launch and left boats; verified
in the browser. 16C (w16-perf2.md, 6c24985): vegetation bands by tier, impostor depth freed, phone plant halving, a
ship cap by tier, the trade window and the cockpit write only on change, 4 Hz feature scans, the harness's wave-15
scenario and per-place GPU views; phone GPU memory 391 -> 379 MB at home (Tidemark 394, Blackwater 401 still over the
387 target: the town meshes and terrain textures). Root: the fence price moved to hijack/Fence.js so the server image
stays free of the engine (9f9bb65).

### Wave 15 (2026-10-14, root + 4 workers): a shared universe, economy, hijacking, rescue
Asked for: a persistent server as the default for Multiplayer; better trades / economy; pirates placed further from the
start; NPC ships / planes / every transport hijackable; climbing onto objects from the water; flares that bring an ally
vessel. 15A shared universe (w15-universe-hosting.md, 001a1c6): Dockerfile + fly.toml (an always-on machine in
Frankfurt, a 1 GB volume at /data, /health), deploy-universe.yml deploys the server from the same commit as the Pages
build once FLY_API_TOKEN exists, admin routes behind ADMIN_TOKEN, a save on SIGTERM, the fort state persisted; the
client defaults to wss://hyptile-universe.fly.dev/universe on the Pages site (a plain-http page offers that PC's own
:8765), the Multiplayer card opens on the Universe tab and probes the server, a commit mismatch reads "the universe
is updating"; vite defines __BUILD_HASH__. Owner's one-time steps: deploy/SETUP_FLY.cmd (fly auth signup + card,
launch, volume, ADMIN_TOKEN, deploy, a deploy token into the FLY_API_TOKEN secret). NOT deployed yet: needs the account.
15B economy (w15-economy.md, 5e4e27f): PORT_IDENTITY per port (made cheap / wanted dear, 32 goods), the window opens on
the harbourmaster's board and the fish hall's wanted fish, rows with tags, a day trend, news and the best route (margin
per crate, hours, lanes crossed: routes.js), rivals' convoys move prices, harbour dues, insurance, the Tidemark
warehouse, licences, a ledger with net profit, fish by freshness and taste (Game.sell paths call trade.fishSale); saves
version 2 with migration; verified in the browser. 15C (w15-hijack.md, 4a983bc): Routes CALM (450 m round Jade Landing
/ the home dock, 250 m round every dock, spawns 600 m+ from home, keepOut turns pirates back), raids from Blackwater's
direction with a horizon warning; the hijack feature (take a crippled merchant / navy / pirate after the deck fight,
night sneak with a guard roll, the mail Petrel, residents' skiffs, wanted hulls hunted until a yard repaint or the
fence buys her, the old boat left moored for an agent to send for; vesselTaken syncs); the test seas moved to z 750.
15D (w15-rescue.md, 381b59d): one water climb rule (ledges, rocks, floating boxes, own hull over the rail, AI decks:
mode 'aboard'), distress flares (chandlery / agents, F held, touch Flare) and the launch or a passing merchant that
answers in 60-120 s and carries you to the dock, verified in the browser (a merchant trawler came alongside).

### Wave 14 (2026-10-14, root + 4 workers): the user's play-test notes
Asked for: planes visible and findable at the airstrip, the parachute discoverable, cockpits that differ per airframe,
a replacement boat at every dock and a replacement plane at every landing place, Blackwater further from the seaplane's
take-off run. Take-off runs measured in the flight model (Jade lifts at 318 m and reaches 30 m at 629 m, Petrel 133 / 387,
Albatross 504 / 798): Blackwater's shore sat 480 m dead ahead of the berth and nothing else fits in the heightmap's
south band, so it moved onto its own 2 m terrain tile at (-120, 1520) (14D, w14-blackwater-tile.md, 5ab2476:
BlackwaterTerrain.js ports the heightmap's islet recipe, the fort / town / docks match to the centimetre, one patrol lane
keeps the south band and four circle the island; BlackwaterMesh.js draws the tile's land, 81cc597). Release
3.1-alpha packaged (releases/hyptile-island-3.1-alpha.zip, 111 MB, notes in releases/NOTES-3.1-alpha.md; the packaging
script now copies src/features/firearms/FirearmsData.js for the server). 14A cockpits per airframe
(w14-cockpits.md, 5b37824: Panels.js layouts, the Albatross's engine columns with feather switches, the Kestrel's gear
lever and parking brake, the face rebuilds on an airframe change). 14B (w14-parked-planes.md, 18817bc): parked airframes
on the strip apron and the ramp with E to buy or fly, a 4 m office prompt and an arrival toast, takeOut / recall with a
delivery site, the bail-out hint in the HUD (only Quote bails: naval claims X). 14C (w14-replacements.md, 55d97d3): the
agents feature, Roid & Co. lecterns at every port's dock head, the yard window there with boats moored at that dock,
salvage, seaplane recovery into the port's water, fees by distance and standing, a pin when stranded. Verified in the
browser: the Pons agent moors a lobster boat at Pons, the parked Kestrel prompts for sale on the apron, the Jade and
Kestrel panels differ.
Root: climb out of the water onto a pier or ledge (Space / W, rise 0.2-2.6 m); the crash toast says where to recover a
wreck (hangar or yard); the world map refreshes its discovery state.

### Wave 12 (2026-10-13 evening, root + 6 workers): two islands, planes, perf, combat feel
12A Tidemark (docs/briefs/w12-town-island.md): a 440 m town island on its own terrain tile at (1720, -60) outside the
2048 m heightmap (no room inside with 400 m of water), a town of 10-14 buildings with a pier, quay, market, chandler,
tavern "The Tide & Tankard", warehouse, destructible stalls / carts / lamps / fences through destruction Sites / Kinds,
a port with vendors, market cell, residents' schedules, discovery, and the airstrip WORLD.tidemark.airstrip (320 x 28 m
at (1561, 56), heading -2.01) with a hangar and pad. Ocean shore shading / vegetation cover only the heightmap domain.
12B Blackwater (w12-pirate-island.md): a volcanic ring at (-55, 688) with a caldera cove, a fort with two destructible
shore batteries (naval.launchFrom), powder stores, a watchtower alarm, a pirate town with a tavern and black market
(black flag $800), three moored ships, 7-9 raider guards, claim / restock / retaliation, discovery. Patrol lanes moved
(Routes BLACKWATER_PATROLS). 12C seaplane (w12-plane-upgrades.md): 4 airframes, upgrades, cargo, parachute (Quote twice),
Kestrel land plane from the airstrip. 12D perf (w12-perf.md): headless CPU runner, allocation and HUD DOM-write cuts,
Material.dispose frees its uniform buffer (the boat-swap leak), Vulkan harness back. 12E combat feel (w12-combat-feel.md):
in progress. 12F integration (w12-integrate-islands.md) applied both islands' root patches.
Root: sprint 8.5 m/s; no touch fold / toggle, compact vehicle cluster; 16 local light slots and ship lanterns; shooting
allowed on the home island except at people; lost-at-sea range 300 m.

### Wave 11 (2026-10-13, root + 4 workers): parity gaps
11A ship damage (docs/briefs/w11-ship-damage.md): finite ammunition per hull (every hull at least 8 rounds; bought at the
yard, a hold powder keg refills, AI ships carry their own and ram / flee when dry), sections (hull, rudder, sails, mast,
guns a side) with steering / speed / silence effects, a falling mast, fire that grows, spreads, reaches the magazine and is
doused at the rail, flooding with a pump and sinking at full flood; yard rows "Powder and shot", "Rigging and rudder
repairs"; Tab cycles the aim section while aiming. 11B netsync (w11-netsync.md): host-authoritative hull collisions for
every player boat, wreck entries on the schema (boats, seaplane) drawn by all, crew replicated, fire rate limits on the
server, reconnect-safe. 11C roster (w11-roster-clips.md): the near-bind clips were deltas from a posed frame 1; rebased
and spliced into the 8 GLBs, fleet tillers / rudders and AI ship wheels move, test/roster-clips.mjs. 11D life + emotes
(w11-life-emotes.md): gull reactions to casting, cast / strike / catch / miss effects, emotes on 5.
Headless Dawn harness: the stock webgpu build has no Vulkan adapter and the D3D12 path needs dxil.dll beside Chrome's
dxcompiler.dll (not shipped with Chrome 155); parked until a Dawn build with Vulkan is found again.




