# Wave 21B: cars

Read w21-common.md first (the city plan contract: roads, parking, roadHeight), then how vehicles work today: the boat
controller (src/world/boat/**, Player.js drive modes, App.setBoat), the seaplane feature (enter / exit, camera, HUD,
cockpit), src/features/hijack (any vehicle can be taken: cars too), src/features/destruction (props that break on hit),
src/core/Colliders.js, the sfx feature (engine sounds are procedural there), TouchControls (driving on phones: 20D owns it,
report patches), src/features/netsync (20E owns it: report what a car needs synced).

Owned: src/features/cars/** (new feature 'cars'), public/models/cars/** (new), tools/cars/** (new Blender scripts),
test/feature-cars.mjs (new). Report patches for install.js, Features.js, Player.js / App.js (a 'car' drive mode if the
feature cannot do it alone), HudPanels (20D), touch (20D), sfx (20B), netsync (20E), hijack.

1. Models (Blender, low poly, shared atlas, phone friendly): a sedan, a taxi, a pickup, a delivery van, a sports car, a
   police car (the city's law, like the navy at sea: works with notoriety / wanted), a bus. Wheels as separate nodes.
2. Driving: E at a door enters (your own or any parked / stopped car: taking an occupied one throws the driver out and
   raises wanted like hijack), arcade raycast-wheel physics on the roads and the terrain (grip, handbrake slides, reverse,
   kerbs, slopes), a chase camera, horn, headlights at night, indicators optional; damage (dents by stages, smoke, fire,
   a wreck that explodes like a powder keg), collisions with buildings, props (lamps, benches, hydrants break), other cars
   and pedestrians (townsfolk dive away: no violence beyond knock-backs). Keys: WASD, Space handbrake, H horn, E exit;
   phones: a steering / pedal cluster shown only while driving.
3. Traffic: AI cars on the plan's road graph (lanes, speed limits, traffic lights, give way, honk, reroute round blocked
   or destroyed roads: listen for 21C's road-blocked events), parked cars on the plan's parking, buses on a loop; density
   by tier (phones a third), far cars instanced and ticked at low rate.
4. Buying: a car dealer in Meridian (a shop row; prices in the economy's range), your cars parked where you left them,
   saved; a ferry or the harbour agent can ship one to Tidemark or home if those islands have roads (else cars stay in
   Meridian).
5. Before 21A's plan exists, build and test against a small test road graph of your own in the test file. Tests: physics
   bounded (no flips on flat roads, stops on slopes with the brake), enter / exit / take, damage stages, traffic obeys
   lights and reroutes, save round trip, budgets. Captures of the cars in the city (READ them). Report under 300 words.
