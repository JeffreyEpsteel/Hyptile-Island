# Wave 21: Meridian, the big city island (read with COMMON.md, w19-common.md, w20-common.md)

The user (2026-10-15): "a bigger island further away with a big city. I want the city destroyable. I also want you to
integrate cars and 2 big skyscrapers like the ones that were in New York."

Three workers: 21A the island and the city (owner of the shared plan), 21B cars, 21C the city's destruction. Waves 19D and
20A-E run at the same time (their owned files are listed in w20-common.md and the w20-*.md briefs): never edit them;
report patches. Root owns App.js, Game.js, main.js, install.js, Features.js, HudPanels.js (20D has it this wave),
GameState.js, Avatar.js, Player.js, package.json, docs/PLAN.md, CREDITS.md.

## Where
Meridian lies west of home, on its own terrain tile (like Tidemark src/world/islands/TidemarkTerrain + TerrainTiles.js and
Blackwater src/world/islands/BlackwaterTerrain.js + BlackwaterMesh.js): centre near (-2700, -300), about 1.4 x 1.1 km,
the biggest island in the game, ~2.5 km from Jade Landing (a real voyage or a flight). 21A may move it a few hundred metres
if the tile system, the ocean or the map needs it; the map, the minimap and the world map show it.

## The two towers (the user's "skyscrapers like the ones in New York")
Two identical square twin towers side by side on a plaza (fictional name: the Meridian Twins), ~300 m tall, dense
vertical pinstripe facades, a mast on one roof, an observation deck, the tallest things in the world and visible from
home on a clear day (far impostor). Hard rule: the towers never collapse, never burn and never take structural damage from
aircraft. A plane that hits them breaks up as it does on any cliff (the crash feature); at most a few cracked windows
that mend. Cannon fire and bombs mark their lower facade only. Do not add anything that stages, scripts, rewards or
replays an aircraft striking them. Every other building in the city is destructible.

## The shared plan (21A writes it first, within its first hour; 21B and 21C read it, never edit it)
src/world/islands/meridian/CityPlan.js exports:
- `MERIDIAN` { id: 'meridian', center: { x, z }, size, tile } and `cityPlan()` (deterministic, no RNG state outside a seed)
  -> { buildings: [ { id, kind ('tower' | 'highrise' | 'midrise' | 'lowrise' | 'shop' | 'warehouse' | 'station' |
  'landmark'), x, z, w, d, h, yaw, floors, style, landmark: bool, collapsible: bool, block } ],
  roads: { nodes: [ { id, x, z, signal: bool } ], edges: [ { id, a, b, lanes, width, speed, oneWay } ] },
  parking: [ { x, z, yaw } ], sidewalks, plazas, docks, airstrip? }.
- The building handles 21A's builder publishes at runtime: `meridian.building( id )` -> { group, bounds, colliders,
  setStage( 0..3 ), stage, fireAnchors: [ ... ], landmark, collapsible } where stage 0 is whole, 1 scarred, 2 gutted, 3
  collapsed (21C supplies what stages 2-3 look like through a hook 21A calls: `meridian.onStage = ( id, stage ) => ...`).
- Road surface height at a point: `meridian.roadHeight( x, z )` (or the terrain's heightAt if roads are on the terrain).
Change the plan's shape only additively once 21B / 21C have started; tell root in the report.

## Budgets
Phones: the island must keep phone GPU <= 387 MB everywhere (docs/PERF.md): far skyline as impostors / merged low LOD,
near blocks streamed in by distance, no per-building draw calls at distance, cars instanced. Desktop Medium: the city
frame must not cost more than Tidemark's does today.
