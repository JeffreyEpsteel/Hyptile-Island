# Wave 14D: Blackwater moves far south onto its own terrain tile

Read docs/briefs/COMMON.md first, then src/world/terrain/IslandShape.js (BLACKWATER at (-55, 688): a volcanic ring,
caldera, channel, pads, hills; TIDEMARK and isletWorld), src/world/islands/town/TidemarkTerrain.js (the 2 m tile recipe
for an island OUTSIDE the 2048 m heightmap: contains / heightAt / normalAt / coastDistance / maskAt, attachTidemark
wraps TerrainData's queries; the box lies wholly outside the domain), src/world/TerrainData.js (read only: generate(),
the islet recipe near line 199 and 258 that builds ISLETS into the heightmap, `box` islets near 634, ensureTidemark at
line 90, `get tiles()`), src/world/terrain/TerrainTiles.js (wave 13A: terrainTiles( T ) reads T.tiles / _outerTiles:
{ id, x0, z0, n | res, texel | size, heights }; the water's shallow tint, shore field, breakers, grass and trees, the
world map and the minimap all cover every tile automatically), src/world/islands/Blackwater.js + stronghold/** (read
only: built from WORLD.blackwater and terrain.heightAt, no hard-coded coordinates: verify), src/world/WorldLayout.js
(the Blackwater block near line 185: everything derives from ISLETS_BY_ID.blackwater), src/features/naval/Routes.js
(BLACKWATER_PATROLS: world coordinates round the island), src/features/pirates/** (read only: dens, zones, retaliation
reads WORLD), src/features/story/StoryData.js (read only: "Rumours from Blackwater" text says south of the reef: fine).

Owned files: src/world/terrain/IslandShape.js (BLACKWATER only), src/world/islands/BlackwaterTerrain.js (new, or a
generalised OuterTile.js under src/world/terrain/ that TidemarkTerrain could share later: do not edit
TidemarkTerrain.js), src/features/naval/Routes.js, src/world/WorldLayout.js (the Blackwater block only),
test/feature-stronghold.mjs, test/feature-pirates.mjs, test/feature-islands.mjs, test/world-islands.mjs,
test/feature-naval.mjs, test/feature-death.mjs (only the checks that encode the old position), test/feature-blackwater-tile.mjs
(new). Report the TerrainData.js patch (`ensureBlackwater( this )` after ensureTidemark) and anything else root-owned.

The user's words: "the island in front of the spawn island is too close and I crash the planes before I could lift
off. Put it further away." The seaplane's berth is SITE.berth (0, -20) heading 0 (bow +z): the take-off run goes due
+z and Blackwater's north shore sits 480 m ahead. Nothing else fits in the heightmap's south band (the Inverted Isles
at (-670, 700), Pons at (620, 560)), so:
1. BLACKWATER moves to about (-120, 1520) on its own 2 m tile (box ~ 900-1000 m, wholly outside the 2048 m domain:
   z0 >= 1030; the rim fades to the open-ocean floor like Tidemark's). The tile's heights use the SAME recipe the
   heightmap used for the islet (ring, caldera, channel, shelf, hills, pads, pocket, beach) so the fort, town, docks,
   batteries, moored ships and the hidden entrance land exactly as today relative to the centre: port the islet
   maths from TerrainData's recipe (read it carefully; call its helpers if exported, else copy them with a comment).
   Remove the `box` / heightmap-islet treatment for Blackwater (it must no longer be stamped into the heightmap).
2. attach the tile the Tidemark way (TerrainData.addOuterTile if it exists, else the same wrapper: the wrapper is
   generic once installed; make sure two tiles coexist: the lookup finds the tile whose box contains the point).
   coastDistance / islandAt / maskAt answer for Blackwater on the tile.
3. BLACKWATER_PATROLS: the lanes move with the island (deep water all round it on the tile) and one lane keeps
   patrolling the heightmap's south band (z 380-990, clear of the islands by 80 m and south of z 150) so pirates
   still meet the player between home and Blackwater. Dens / zones that read the lanes keep working (feature-pirates).
4. Tests: port the stronghold checks (border fade -> inside the tile and clear of its rim; cove depth; channel depth;
   patrol depth / clearance) to the tile; feature-islands and world-islands lose the Inverted Isles failures that
   the old overlap caused (they must pass again as before); feature-death's SEA_FAR stays. New test: the tile height
   at the fort pad / dock / cove matches the recipe, the heightmap at the old spot is open ocean again, two tiles
   coexist with Tidemark's. Run feature-stronghold, feature-pirates, feature-naval, feature-islands, world-islands,
   feature-death, feature-exploration, feature-ambience, feature-worldmap, feature-quests-w13, feature-netsync-w13,
   water-domain and the vite build check as in COMMON.md. No browsers. Report under 250 words.
