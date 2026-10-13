# Wave 12A: a big new island with a little town, destructible

Read docs/briefs/COMMON.md first (rules, root-owned files, style, no browsers / dev servers / npm install), then
docs/briefs/islands.md (how islands 5-8 were added: WorldLayout islands / ports entries, IslandShape ISLETS, Ports.js
vendors and markers, Game.discoverPort, colliders, lights, distance culling, the bit-identical home / Pons terrain tests),
src/world/islands/*.js (GullRock, SaltmarshKey, WestHaven ... the pattern: one module, GeoKit geometry merged into few
meshes, lights[], update(dt)), src/world/village/** (how the home village is built: houses, props, residents, the
TextureBaker), src/world/residents/ResidentData.js + src/features/harbour (roles, schedules per port: a town needs them),
src/features/destruction (Kinds.js KINDS, Sites.js planProps: props become destructible by kind at sites), src/features/trade
(a port market), src/features/notices (the notice board), src/world/WorldLayout.js (read dynamically; you own the new
island's entries), src/core/Quality.js (phone budgets: everything you add must be culled by distance and cheap on phones).

Owned files: src/world/islands/Tidemark.js (new; name the island "Tidemark" unless the Unreal sources under
D:\fishing game\knowledge name a big town island: then use that name), src/world/islands/town/** (new), the new entries in
src/world/WorldLayout.js and src/world/terrain/IslandShape.js (additive only; re-read before editing; the existing
islands' terrain must stay bit-identical: run the terrain tests), src/game/ports/** (the new port), src/features/destruction/Sites.js
and Kinds.js (additive: new site kinds / prop kinds for the town), test/feature-islands.mjs, test/feature-town.mjs (new).
Report patches for App.js (constructing the island), Game.js, HudPanels, harbour / trade / notices registrations under 300 words.

The user asked (verbatim): "let's add another big island with a little town like with a destroyable environment".

1. The island: the biggest after the home island (radius ~420 m), placed within the ocean / fog extent where the map has
   room (read WORLD.islands; keep 400 m of water from every other island and from the pirates' patrol lines in
   src/features/naval/Routes.js), with a sheltered bay on the lee side, a long beach, a headland with cliffs, a hill with
   a lookout, a river mouth, palms and the existing vegetation system (read src/world/vegetation: how islands get trees /
   grass). A seaplane can land in the bay; a boat has a dock and a mooring like the other ports.
2. The town (on the bay): 10-14 buildings on a grid of two streets (a market square, a chandler, a tavern, a warehouse,
   a chapel or lookout tower, fishermen's houses, a boatyard shed), a stone pier and a timber quay, lamp posts, market
   stalls, crates, barrels, fences, a well, carts. Built from engine geometry (GeoKit) with the village's texture baker /
   materials; merged meshes; night lights within the local-light budget (the LocalLights block holds 8: the town gets a
   few lanterns that matter, the rest emissive).
3. Destructible: every prop that is not a building shell (stalls, crates, barrels, fences, carts, lamp posts, the well
   roof, pier railings, boat shed doors) registers through the destruction feature's Sites / Kinds (new kinds where
   needed: 'stall', 'cart', 'lampPost', 'fence', 'wellRoof'), so cannon balls, ramming, melee and the seaplane break
   them with the existing pieces / debris flow and they respawn on the feature's schedule. Buildings take a damage
   decal state (cracked / smoking) at most: no collapse.
4. The port in the game: a Ports.js entry (name, vendors: a fish buyer with a species premium, a chandler, the tavern with
   a keeper, a notice board), market cell in trade (read how 'haven' / 'shrine' were added), 6-10 residents with roles
   and schedules from the harbour feature, discovery via Game.discoverPort, map markers, pirates allowed to raid its
   waters (not peaceful, unlike the home island), a den on its far shore if Dens.js picks it up automatically (it reads
   WORLD.islands).
5. Tests: the island entry is inside the world extent and clear of the others, the terrain tests still pass, the town's
   props plan through planProps, the port appears in Ports.markers and trade cells, the residents' schedule has no gaps.
   Vite build check as in COMMON.md. Report the coordinates and what you verified.
