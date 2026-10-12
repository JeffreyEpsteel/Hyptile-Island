# WP-B: pirates, dens, consequences (docs/UNREAL_PARITY.md rows Q4, V7-V10, V12, V18, E11 corsair axis, U6)

Owned files: src/features/pirates/** (new: Roster.js, Dens.js, Retaliation.js, Ledger.js, Notoriety.js, SearchZones.js, index.js),
src/features/boarding/** (add Hostile.js), test/feature-pirates.mjs, test/feature-boarding*.mjs. The previous worker reached
"now the boarding feature": check src/features/pirates for files. src/features/naval/** is the naval worker's (changing
right now: modules, cannon events, sinking, nearest-player targeting): use naval only through public methods (spawn,
ships, events) and re-read it before finishing. Keep boarding and naval tests green.

Cover: ~16 named pirate captains from the Unreal data with traits and ships (spawned via naval's spawn API), dens on
islands (existing now, WORLD.islands dynamically when new ones land) that can be raided, retaliation raids when you hurt
a crew, a persistent kill/capture ledger, tier 4-5 bounties with search zones (expose pirates.searchZones() for the
world map), hostile boarding of the player's ship by pirates, a notoriety indicator (small HUD element, no standing
prompt). Multiplayer: share den raids/captain deaths via sendWorldEvent. Emit denRaided, captainKilled, notorietyChanged
and list them in the report.
Report root patches (install.js MODULES entry, events, HUD hook).
