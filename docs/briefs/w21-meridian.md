# Wave 21A: Meridian, the island and its city

Read w21-common.md first, then the Tidemark and Blackwater tile islands end to end (src/world/islands/Tidemark.js,
TidemarkTerrain / town/**, Blackwater.js + BlackwaterTerrain.js + BlackwaterMesh.js, src/world/terrain/TerrainTiles.js,
IslandShape.js, TerrainData.js ensureTidemark / ensureBlackwater), src/world/village/TownKit.js (the Blender town kit),
src/world/WorldLayout.js (ports, discovery), the ports (src/game/ports/**), the harbour agents (Roid & Co. at every dock),
the airstrip at Tidemark (WORLD.tidemark.airstrip, the seaplane feature's strips), Minimap / world map, tools/town/**.

Owned: src/world/islands/meridian/** (new), src/world/islands/MeridianTerrain.js + MeridianMesh.js (new),
public/models/meridian/** (new), tools/meridian/** (new Blender scripts), test/feature-meridian.mjs (new). Patches for:
TerrainData.js (ensureMeridian), install / App wiring, WorldLayout ports, the map, the harbour agents, the seaplane strips.

1. The plan first (CityPlan.js, the contract in w21-common.md), then the tile: a low coastal island with beaches, a
   harbour with quays and a ferry slip, a river or canal, a park, hills at one end with villas; real sea round it.
2. The city: a street grid (avenues and streets, sidewalks, crossings, traffic lights at the main junctions), a downtown
   of highrises round the Meridian Twins' plaza (the two ~300 m square towers, w21-common.md rules), midrises, shops with
   signs, warehouses on the docks, a station, a market square, a city hall, a lighthouse; lit windows and street lamps at
   night (inside the local-light budget: emissive windows, few real lights). Blender kit, modular facades, a few CC0
   textures (Poly Haven) shared across buildings; skyline impostors for distance.
3. Life: a port entry (vendors, the fish market, a chandlery, a Roid & Co. agent, a notice board), an airstrip or an
   airport on reclaimed land, discovery, townsfolk seats / homes published for townlife like 18C's lists (report the
   townlife patch), parking lots and garages for 21B (the plan's parking).
4. Runtime: the `meridian` handle (w21-common.md) with building handles, setStage, fire anchors, colliders per building.
5. Verify by eye: Blender renders of the kit and the towers, headless captures (tools/visuals/capture.mjs: add views:
   the skyline from the sea at golden hour, downtown street at noon, the harbour, night; Medium and phone), the skyline
   from home. READ every PNG. Tests: the plan deterministic and well formed (roads connected, no building on a road,
   towers flagged landmark / not collapsible), the tile's heights / shore, the port, budgets. Report under 300 words.
