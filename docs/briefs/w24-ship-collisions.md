# Wave 24B: ship and boat collisions that feel solid

Read w24-common.md, then everything that moves or collides on water: src/player/BoatController.js, src/world/boat/**
(hull volumes, buoyancy), src/features/naval/** (AI ships, ramming, Sections, sinking; the host-authoritative collisions of
wave 11B), src/core/Colliders.js, the Rapier backend (src/physics or wherever RapierBackend lives), the docks / piers /
quays (src/world/Pier.js, Jetty.js, town and Meridian quays), rocks and reefs, src/features/netsync/NavalLink.js,
test/feature-ships.mjs, test/feature-naval.mjs, test/feature-capsize.mjs.

Owned: src/player/BoatController.js (collision and contact response), src/world/boat/** (collision shapes and buoyancy),
the collision parts of src/features/naval/** (the files you find that do hull-hull / hull-world contacts: name them in your
first commit message), src/core/Colliders.js (water-level contacts), test/feature-collisions-w24.mjs (new),
test/feature-ships.mjs + test/feature-naval.mjs (additive). 24C (ship looks) owns the ship GLBs and their materials: hull
shapes must be derived from whatever GLB is loaded at runtime (or from data 24C keeps in step), never hard-coded to today's.

1. Audit first: script the failure cases and capture them: player boat into an AI ship, ship into ship (broadside, bow),
   boats into docks / piers / quays / rocks / beaches at speed, ships passing through each other, boats tunnelling at high
   speed, jitter while moored, the player clipping into hulls when boarding, swimming under hulls. List each with numbers.
2. Fix them for real: hull colliders that match the hulls (convex hulls / capsule chains per hull from the GLB, not boxes),
   swept or substepped contacts so nothing tunnels, contact response with mass, restitution and friction (a 600 t frigate
   barely moves when a skiff hits it; a skiff bounces and takes damage), separation without jitter, grounding on beaches
   and rocks (keel scrape, stop, damage), docks that stop you with a thump and fenders, ramming damage scaled by relative
   speed (the existing Sections), splash / creak / crunch feedback (emit events the sfx feature hears; report a patch if
   it needs new cues), and the same results for every client (host authority unchanged).
3. Verify with the failure cases re-run (numbers before / after) and captures; tests for each case. No regressions in
   capsize, boarding, hijack, rescue, navy, cars on ferries.
