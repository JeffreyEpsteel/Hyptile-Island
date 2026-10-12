# Hyptile Island: design and phase plan

Status 2026-10-12. Phase 1 is the browser game in this repository; Phase 2 is the plan below. Numbers are
read from the source files named next to them; where a system is still being written the file is named and
the number is marked TBD.

## Pillars

1. **Tidewater's island, untouched.** The ocean, sky, village, fishing and feel are Dan Greenheck's; the new
   layer sits on top and never trades away the rendering or the fishing fight.
2. **You are the crew.** Eight Hyptile-family characters on one rig, seen in third person. Unlocking them is the
   long arc: three are hired, four are earned by PoorGoat's story quests.
3. **Earn the boat.** You start on foot. The first boat is a real goal, and the five hulls give a progression
   from the bay to the deep water.
4. **PoorGoat gives you reasons to go out.** Story quests and rolling orders turn "fish anywhere" into trips.
5. **Fish together.** A relay server, name tags, chat and one shared clock. No accounts, no authority, no
   shared economy: your progress stays in your browser.

## Phase 1 (this repository)

### Economy

**Characters** (`src/game/Characters.js`; the save's `unlocked` list)

| Id | Name | Unlock |
|---|---|---|
| `hyptile` | Hyptile | From the start |
| `pepe` | Pepe | Hire for $350 at Ethena's |
| `bonk` | BONK | Hire for $800 at Ethena's |
| `clown` | The Clown | Hire for $1500 at Ethena's |
| `doge` | Doge | Quest `reefRun` |
| `pengu` | PENGU | Quest `nightShift` |
| `bravile` | Bravile | Quest `deepWater` |
| `heptyle` | Heptyle | Quest `recordHunter` |

Reference locomotion speeds for the in-place clips (`CLIP_SPEED`): walk 0.578 m/s, run 1.6125 m/s, swim 1.0,
fast swim 1.8; playback rate scales with the real speed.

**Boats** (`src/game/Boats.js`; trade-in `TRADE_IN = 0.6` of the old boat's price, one boat at a time)

| Id | Name | Price | Hold × | Tank × | Mass kg | Thrust N |
|---|---|---:|---:|---:|---:|---:|
| none | On foot | 0 | cooler only | no tank | | |
| `skiff` | Marsh skiff | 650 | 0.7 | 0.5 | 420 | 2400 |
| `canoe` | Outrigger canoe | 1200 | 0.8 | 0.6 | 520 | 3600 |
| `cutter` | Sail cutter | 2600 | 1.0 | 0.8 | 640 | 5200 |
| `launch` | Cabin launch | 4500 | 1.3 | 1.0 | 760 | 7800 |
| `lobster` | Lobster boat | 9000 | 2.0 | 1.5 | 3200 | 26000 |

Upgrading pays `price(to) - 0.6 × price(from)`: skiff → canoe costs $810, launch → lobster $6300. A new boat
comes with a full tank. A Tidewater v1 save loads with the lobster boat.

**Gear** (`src/game/Gear.js`, unchanged from Tidewater): line $60 / $180 / $450, reel $90 / $320, rod $75 /
$260, hold $120 / $400, tank $150 / $380, engine $300 / $700, fish finder $250, deck lights $140; diesel
$1.50 a litre. The boat's `holdMul` / `fuelMul` scale the hold and tank levels.

**Quests** (`src/game/Contracts.js`, PoorGoat's board; progress is read from the career counters below)

| Id | Kind | Goal | Reward |
|---|---|---|---|
| `firstCatch` | intro | land 1 fish | $40 |
| `reefRun` | story | 3 fish off the reef | $150 + Doge |
| `nightShift` | story | 3 fish landed between 19:30 and 06:00 | $200 + PENGU |
| `deepWater` | story | 2 deep-water fish caught from a boat | $400 + Bravile |
| `recordHunter` | story | beat 3 of your own records | $500 + Heptyle |

Rolling **orders**: three at a time (`ORDER_SLOTS`), each `count` fish of one species handed over from the
hold at `ORDER_RATE` 1.6 × their counter value plus a bonus of about `10 + price × mid-weight × count × 0.4`
(± 20 %); generated from a seed kept in the save so a reload shows the same board, and each one is replaced
by the next when delivered. Delivered fish leave the hold through `GameState.takeFish`.

**Income** is Tidewater's: `fishValue( species, kg )` from `FishTable.js`, 18 species, paid by weight at PoorGoat's.

### Save schema v2 (`src/game/GameState.js`)

localStorage key `hyptile-island.save.v2`; `tidewater.save.v1` is read as a fallback and migrated (boat →
`lobster`, defaults for the rest). Saved after every change, every minute (single player) and when the page is
hidden; storage may be missing or throw and the game runs without it. Four slots per game mode (`GameMode.js`):
the campaign keeps the key above (slot N adds `.slotN`), the sandbox and multiplayer prefix it with `sandbox.` /
`multiplayer.`. The key space decides the mode; the sandbox opens every character and boat, free.

| Field | Type | Meaning |
|---|---|---|
| `v` | 2 | schema version (1 accepted on load) |
| `money` | number | island dollars |
| `inventory` | `[{ id, species, kg, cm, value, caughtAt, record }]` | the cooler / hold |
| `log` | `{ species: { count, bestKg, bestCm } }` | the fish log |
| `upgrades` | `{ line, reel, rod, hold, fuel, engine, fishFinder, lights }` | gear level indices |
| `fuel` | number or null | litres left; null = full tank |
| `nextId` | int | next inventory id |
| `character` | id | the character you play (must be in `unlocked`) |
| `unlocked` | `[id]` | always contains `hyptile` |
| `boat` | id or null | the boat you own; null on foot |
| `quests` | `{ seed, orderN, orders: [k, k, k], progress: { questId: n }, done: [questId] }` | owned by `Contracts.js`, serialised as is |
| `career` | `{ caught, kg, records, species, night, reef, deep, aboard, sold, earned, boats, playSeconds }` | lifetime counters, read by quests |
| `name` | string ≤ 24 | multiplayer display name |
| `mode` | `sandbox`, `campaign` or `multiplayer` | informational (the key space decides); older saves have none and are campaign saves |
| `world` | `{ player: { x, y, z, yaw, mode }, boat: { x, z, heading, moored } \| null, timeOfDay } \| null` | where you are, filled by `App.captureWorld()` before each write and put back by `App.applyWorld()` after loading; walking / swimming load as walking, aboard as on deck; no `timeOfDay` in multiplayer |

### Multiplayer model

- **Relay, not authority** (`server/index.mjs`, protocol in `src/net/Protocol.js`, version 1). `npm run
  server` runs a `ws` room server on port 8765; the URL path is the room (`/island` by default, up to 16
  players a room, `--room-cap`), and `GET /health` lists rooms. It keeps each room's player list and fans
  each player's state out to the others; it never simulates the game and holds no economy. Clients join with
  `?server=ws://host:8765/island` or `?mp` (plus `?name=`).
- **15 Hz state** (`SEND_HZ`). Each client sends its sanitized, quantized pose (position, yaw, mode, speed,
  vertical speed, grounded / diving, action, character id, boat id and the boat's transform when aboard) at
  most fifteen times a second, skipping unchanged frames, with a one-second heartbeat when idle; frames are
  capped at 4 KB. `RemotePlayers` renders each peer about 120 ms behind the newest snapshot (24 kept),
  interpolating position, the shortest yaw arc and the boat quaternion, so motion is smooth at 60 fps and
  brief gaps don't snap.
- **Shared island clock.** Each room has a clock starting at 09:30 that runs at 0.01 h per real second (a
  40-minute day); the server sends it on welcome and every 10 s, and clients slew onto it (with an rtt-based
  server offset from pings), so sunrise and night fishing happen together. T (pause time) and the settings
  panel's time slider are solo only.
- **Name tags and chat.** A projected DOM tag over each remote avatar's head (`Avatar.headPosition`), Enter
  to type a line, sanitized and broadcast through the room.
- **Local economy.** Catches, money, gear, boats and quests are per browser. Two players can own "the same"
  boat; each sees the other's as a remote hull. No anti-cheat is attempted; the client auto-reconnects with
  backoff.

## Phase 2

### Other islands

Tidewater has one island: one heightmap (`src/world/Terrain.js`, `TerrainData.js`) and one shore field
(`ShoreField.js`) that the breakers, swash and bite habitats read. A second island reachable by boat needs
either a world of several heightmap tiles with their own shore fields, or one larger heightmap that holds both
islands with the shore field and the habitat lookup made island-aware. The Unreal project has eight islands
with eight docks; the browser should start with **one** neighbouring island (a second port with its own
vendor) and keep the world small enough for the FFT ocean's wave cascades to stay in range. Size: **L**.

### Functions of the Unreal game to port

From `UpsideDownFishing/README.md` and `TASKS.md` (read-only). Size: S under a day, M a few days, L a week or
more of focused work.

| Unreal feature | Maps to in the browser game | Size |
|---|---|---|
| Eight islands, home and neighbouring ports, port discovery XP | A second island and port (above); a discovery bonus in `career` / quests | L |
| Thirteen residents with gestures and seven patrols; three service residents at piers | `Avatar` in `lite` mode driving idle / talk / look-around / cheer clips on roster meshes at village spots; convert the remaining island-life clips (wave, beckon, sweep, inspect catch) with `tools/roster` | M |
| Harbour life: five houses, fifteen props, residents, the cabin clown prank | Village props via `tools/props`; the prank as a scripted `Vendor` dialogue that launches the player into the swim state | M |
| Server-checked player melee (0.3 s contact, range / cone / line of sight), health, weapon and down state | Client-side melee with a swing clip and a hit sent through the relay; "down" as a pose. Real authority waits for the dedicated server below | M |
| Ragdoll: 16 bodies / 15 joints per mesh, three-second cosmetic recovery | No physics engine here: a small verlet chain on the 48 joints (knockdown, falls, the prank tumble), blended back to the idle clip | L |
| Boat seats and rowing: captain + guest per hull, 26 seat-family clips (rowing, paddling, steering, seated fishing), boarding / disembarking | Seat sockets per hull in `Boats.js`; `Seated_Idle` / `Helm_Idle` already exist, convert the rowing and seated-fishing clips; a passenger pose over the relay (the captain drives, the guest's position is the boat's transform plus the seat) | M |
| Walk / run toggle (Caps Lock), stamina sprint | Caps Lock toggle on `Player`; stamina on the HUD | S |
| Weather and graphics presets, "reduce boat motion", quality presets | Named presets in the settings panel (H) over the existing sea state / clouds / haze / time sliders; a render-scale quality preset | S |
| Save slots (schema 5), preflight validation, Continue | Slot suffix on the localStorage key, a slot picker on the loader, `fromJSON` already validates; a v3 field for the slot's island | S |
| Dedicated server multiplayer: server authority over movement, crew, fishing, cargo, progression, purchases; crew codes and a Node matchmaker; four clients | Promote the relay to an authoritative Node server that runs `GameState` and the bite / fight rules per player and validates sales and purchases; the client becomes a view. Crew codes map to a room id in the URL | L |
| Rectangular cargo grid (6 × 4, mouse placement, cargo crate module) | Tidewater's cooler is by weight (`holdKg`); keep weight, or add a grid view in the inventory panel over the same list | M |
| XP, levels and reputation | A `level` derived from `career.earned` / `caught`, shown on the crew panel; reputation gates PoorGoat's harder orders | S |
| Modules (propulsion, cargo crate, fishing kit) | Already covered by `Gear.js` upgrades (engine, hold, rod) | S |
| Eyes: blink and gaze morphs, conversation look-at | Morph targets are dropped by the converter and the engine's skinning has no morphs; add morph support to `Skinning.js` or bake a blink as a tiny jaw-style bone | M |
| Audio settings: master / music / SFX / ambience sliders | Four gains in `src/audio` and sliders in the settings panel (Tidewater has mute only) | S |
| Camera feel: cast FOV kick, strike shake, catch hitstop, sailing FOV | Small additions to the player camera and `CatchMinigame` | S |
| Gamepad | An `Input` source for the Gamepad API mapped to the existing actions | M |
| Illustrated main menu, pause, matchmaking screen | A menu over the loader with slot / server / name fields | S |

### Known limits

- **Morph targets dropped.** `convert-character.py` removes shape keys (`export_morph=False`), so the
  blink / gaze morphs of the Unreal roster are not in the GLBs and the engine ignores morphs.
- **Decimated roster meshes.** Each character is collapsed to about 60 k triangles (hyptile 79 840 → 60 000;
  the others 56 000 to 60 000, see `tools/roster/logs/*.log`); fine at third-person distance, soft in close-ups
  and portraits. Textures are capped at 2048 (base colour) / 1024 (other maps) JPEG.
- **Fleet hull physics approximated.** The four fleet hulls reuse Tidewater's single-body boat model with
  per-hull mass, thrust, pitch speed, draft and freeboard from `Boats.js`; there is no per-hull buoyancy
  mesh, and the helm and boarding points are the same offset on all four (`{ x: 0, z: -0.15 }`). The lobster
  boat keeps Tidewater's tuned behaviour.
- **One-clip actions.** Cast, strike, celebrate and the other one-shots play through without foot IK or
  per-hull seat fitting; the hand socket drives the rod.
- **Relay trust.** Remote state is taken as sent; nothing stops a modified client from teleporting.
- **Clip set.** Twenty clips; the Unreal project's rowing, paddling, boarding, combat and resident gesture
  clips are not converted yet (they are on the same rig, so `tools/roster/build.ps1` can add them to `$Clips`).
