# Reimagined starting point (the opening must not look like the Tidewater reference)

Owned files: src/world/start/** (new; a feature module src/world/start/index.js exporting install( app, features )),
the start/spawn fields of src/world/WorldLayout.js (WORLD.start and new spawn/intro fields ONLY; the islands worker
edits the islands/ports entries of the same file - small targeted edits, re-read before editing), index.html (loading
screen markup/style only), public/ui/keyart*/**, public/models/start/**, tools/start/**, test/feature-start.mjs.
(Nothing of this existed when the previous worker was cut off.)

1. Compare what Tidewater (D:\tidewater-main\tidewater-main) shows at spawn (its WorldLayout start, Village.js, Pier.js,
   its index.html loader) with Hyptile now. Write a short note atop src/world/start/README.md: what made it look like the
   reference and what you changed.
2. New spawn and opening composition with Hyptile identity: a jade-roofed fisher's landing on a headland or cove of the
   main island, a carved jade-fish totem landmark, paper lanterns and bunting, fish drying racks, hammocks, a
   coral/cream/jade palette, a boardwalk joining existing paths so the harbour, stalls and Captain Roid's yard stay
   reachable (they must not move). Dress over the most recognisable Tidewater elements visible from spawn from your own
   module (awnings, banners, flags, plantings); do not edit Village.js/Pier.js (report a patch if essential).
3. Never change terrain heights (bit-identical tests), never move WORLD.boatDock, stalls, BoatYard or ports; props get
   colliders (src/world/Colliders.js) and sit on the terrain; instanced/merged meshes, few local lights (lights[]).
   Other workers place a seaplane ramp near the harbour and destructible crates/huts around harbours: leave room.
4. A short skippable intro on the first campaign start (3-5 s camera glide from sea to the player, a "Hyptile Island"
   title card in the menu's style, any key skips; never under ?bench/?bg/?nomenu; once per save slot via localStorage).
   Report how root triggers it from App.startSession.
5. A new loading screen in index.html with Hyptile key art (reuse/crop public/ui/menu/hyptile-menu-*.jpg).
Report root patches (install.js MODULES entry, intro trigger) and the new spawn coordinates.
