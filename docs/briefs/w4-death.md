# Wave 4: destroyable boats, death, respawn, body crate, death marker

Owned files: src/features/death/** (new), src/features/naval/Naval.js, src/features/naval/Ship.js, src/features/naval/Projectiles.js,
src/features/naval/Models.js, src/features/naval/Wrecks.js (new), src/features/worldmap/** and src/game/Minimap.js (ONLY to add a
generic marker API: worldmap.addMarker( { id, kind, x, z, label, icon, mine } ) / removeMarker( id ), shown on both maps),
src/features/seaplane/Seaplane.js (crash -> death hook only), test/feature-death.mjs, test/feature-naval.mjs, test/feature-ships.mjs.
The combat worker owns src/features/melee/**, pirates/**, boarding/**, naval/Brains.js, Hud.js, Ballistics.js (ask them for
patches there: e.g. the melee 'down' state should emit playerDied instead of waking at the pier).
Root owns src/features/install.js (its playerBoatSunk handler today teleports the player to WORLD.start at once and calls
nv.rescue(): report the replacement; root will apply it).

1. The player's boat is destroyable: at 0 hull it lists, settles and sinks over ~8 s like the AI ships (reuse Ship.js's
   sinking), the player is thrown into the water (or dies if aboard a ship with a boarding party / below deck), the boat
   becomes a wreck (Wrecks.js: a persistent wreck mesh at the spot, bubbles/oil via vfx, loot of its cargo claimable by
   diving, listed on the maps). The boat is gone until salvaged: Captain Roid's yard offers "Salvage <boat>" for a fee
   (campaign; free in sandbox) that restores it at the berth; report the HudPanels row as exact code. Other players' boats
   likewise (host authority; wreck shared through sendWorldEvent).
2. Death: a single feature `death` handling every cause: boat sunk under you with no way out, melee hp 0 (today the melee
   module wakes you at the pier: it should emit playerDied { cause, x, y, z } and let you handle it; report that patch),
   seaplane crash, drowning (stamina out far from shore — if Player has drowning; else skip), pirates' boarding lost.
   On death: a short cut to black with a cause line, respawn at WORLD.start (Jade Landing) on foot with full hp, and a
   body crate ("your sea chest") left at the death spot (on the sea floor if at sea) holding the fish inventory, cargo
   crates and carried money above a small keep (campaign; sandbox keeps everything): a visible crate mesh + E to claim
   (diving if underwater), persisted in toJSON/fromJSON, one crate at a time (a new death replaces it: the old one's
   contents are lost), expires after 2 in-game days.
3. Marker: the death spot and the wreck are marked on the world map and the minimap for THAT player only (not shared),
   with a distance readout, cleared when claimed/salvaged. Emit playerDied, playerRespawned, crateClaimed, wreckSalvaged.
4. Multiplayer: the crate is per-player (local state), the wreck is a world event.
Report root patches (install.js MODULES entry, the playerBoatSunk replacement, HudPanels salvage row). Under 400 words.
