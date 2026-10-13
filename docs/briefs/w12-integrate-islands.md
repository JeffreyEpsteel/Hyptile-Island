# Wave 12F: integrate Tidemark (town island) and Blackwater (pirate island)

Read docs/briefs/COMMON.md (style), docs/briefs/w12-town-island.md and w12-pirate-island.md (what was built), then the two
workers' reports below. For THIS job only, you may edit these normally root-owned files, exactly for the patches listed:
src/world/TerrainData.js, src/App.js, src/features/install.js, src/features/trade/index.js, src/features/harbour/index.js,
src/features/notices/NoticeData.js (+ its BOARD_SITES owner), src/ui/Minimap.js, src/ui/WorldMap.js (or wherever the map
icons / discovery live), src/features/naval/Routes.js, src/features/naval/Naval.js (only to add launchFrom), src/features/naval/Projectiles.js
(only if launchFrom needs it), src/features/pirates/Dens.js, src/features/pirates/index.js, src/features/destruction/Kinds.js,
Sites.js, Destruction.js (registration only). Also the test files those changes need. Nothing else. No browsers, no dev
servers, no npm install. The island modules themselves (src/world/islands/**, src/features/pirates/Stronghold.js,
Batteries.js, BlackMarket.js, src/game/ports/TidemarkPort.js) are done: read them, do not redesign them.

## Tidemark (worker 12A) report - patches to apply
1. TerrainData.js: import `ensureTidemark` from `./islands/town/TidemarkTerrain.js` and call `ensureTidemark( this );` after
   `this.buildMinMax();` (without it feature-harbour, feature-pirates and feature-exploration fail their Tidemark check).
2. App.js: pass `village: this.village` to `new Ports( ... )` so the town's houses use the village's house builder; after the
   features install add `this.ports?.tidemark?.connect( this.features );` so cannonballs, explosions and plane crashes crack
   or smoke the buildings.
3. trade/index.js `factorSite`: return `worldPort( port ).market` when it is set.
4. harbour/index.js: use `d.at` for a named resident's spot when present, and add `TAVERN_NAMES.tidemark = 'The Tide & Tankard'`.
5. Notices: add `tidemark` to NoticeData, and `BOARD_SITES.tidemark = TIDEMARK_BOARD` (TIDEMARK_BOARD is exported by the town
   module: find it).
6. Minimap and WorldMap: a plane icon, and discovery by `m.port || m.id` so the "Airstrip" marker can show.
Coordinates: island centre (1720, -60) radius 440 on its own terrain tile outside the 2048 m heightmap; airstrip
WORLD.tidemark.airstrip centre (1561.2, 55.7), heading -2.0076; bay (1996, 58).

## Blackwater (worker 12B) report - patches to apply
1. install.js: `import * as stronghold from './pirates/Stronghold.js';` and `[ 'stronghold', stronghold ]` after `'pirates'`.
2. Routes.js: set `PATROLS` to `BLACKWATER_PATROLS` as defined in test/feature-stronghold.mjs (the old lanes run over the
   island: four feature-naval patrol checks fail until then); move the definition into Routes.js and make the test import it.
3. Dens.js `sync()`: `if ( isl.den === false ) continue;`
4. pirates/index.js `searchZones()`: `out.push( ...( this.features?.get?.( 'stronghold' )?.zones?.() || [] ) );`
5. destruction: register `STRONGHOLD_KINDS` from `src/world/islands/stronghold/Kinds.js` into `KINDS` and `BUILD`; append
   `strongholdPlan( T )` to the plan in `Destruction.build()`.
6. naval: add `naval.launchFrom( x, y, z, dir, opts )` (a public way to fire a ball from a world point with the normal
   projectile flow: damage / owner / faction in opts), and switch Batteries.js from `remoteShot` to it (you may edit
   Batteries.js for that one call) so every client sees the shots and they are not tagged `by: 'remote'`.
Coordinates: centre (-55, 688), entrance (192, 749), fort pad (140, 670), main dock (-164, 661) to (-135, 668).

## Then
Run: feature-islands, world-islands, feature-town, feature-stronghold, feature-pirates, feature-naval, feature-destruction,
feature-harbour, feature-exploration, feature-trade-v3, feature-notices, feature-worldmap, feature-death, then `npm test`
once. Vite build check (`npx vite build --outDir <a folder under your temp dir>`). Report under 250 words: what you
applied, every test result, anything that still fails and why.
