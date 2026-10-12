# Islands 5-8 including the Inverted Isles (the Unreal game planned eight islands)

Owned files: src/world/islands/** (new files; keep GullRock.js, SaltmarshKey.js, Jetty.js working), src/game/ports/**,
src/world/TerrainData.js and src/world/terrain/** (additive changes only), the islands/ports entries of
src/world/WorldLayout.js (the start worker owns its start/spawn fields; small targeted edits, re-read before editing),
public/models/islands/**, tools/islands/**, test/feature-islands.mjs. Read src/world/islands/*, src/game/ports/*
(Ports.js: vendors, markers, near(), premiumBonus), src/world/PonsCove.js, src/game/PonsPort.js and the terrain tests.
The main island and Pons terrain must stay bit-identical (tests check it). The previous worker got as far as reading
IslandShape/_rowSpan; check for any partial edits in TerrainData.js / terrain/.

1. Read the Unreal island and world identity: D:\fishing game\UpsideDownFishing (TASKS.md, Config, maps), D:\fishing
   game\knowledge (island, inverted, upside, suspended, waterfall, root, horizon), the naval fork's port/island list under
   D:\fishing game\Forks\Fishing_Naval_20261007. Use their names and roles where they exist.
2. Four islands within the terrain/ocean/CDLOD extent and fog distance, each with a distinct silhouette and role: a
   mangrove/root island, a basalt sea-stack cluster with a hermit fisher, a trading harbour town (bigger port, a ship
   chandler vendor via Ports.js), and the remote "Inverted Isles": suspended upside-down rock islands floating above the
   sea with hanging roots and waterfalls that fall upward, visible on the horizon from the main island, with a calm lagoon
   a seaplane can land in.
3. Each new port: dock + mooring point (Player loops over WORLD.ports), a stand/vendor if it trades (species premium like
   Saltmarsh), Ports.markers for the maps, discovery via Game.discoverPort (called for any port id), colliders, few lights.
4. The floating rocks are scenery (no collision above head height), cheap: instanced/merged meshes, upward waterfall as a
   scrolling material or particles. Distance culling so the main island's frame cost is unchanged.
Report new coordinates, root patches (App/Game constructing anything new), and what you verified.
