# Wave 19F: the navy's own ships

Read COMMON.md, w19-common.md, then src/features/navy/NavyModels.js (today: the brigantine / sloop GLBs at a scale with a
navy "dress" mesh on top), src/features/naval/ShipClasses.js (frigate, revenue: their stations, helm, sizes, guns),
src/features/naval/Models.js (ModelSet: how a class's GLB is loaded, the sail / flag / wheel nodes it looks for, LOD,
wrecks), src/features/naval/Sections.js + Fire.js + Flood.js (what the hull model must provide for masts falling, fire
anchors, sinking), public/models/ships/*.glb and whichever tools/ script built them (find it: the node naming and the
materials must match), src/features/hijack (a taken frigate becomes the player's 'brigantine' hull) and
tools/visuals/capture.mjs (headless renders; the 19B worker's views of the frigate were in a frigate-zoom capture).

Owned files: public/models/navy/** (new), tools/navy/** (new Blender scripts), src/features/navy/NavyModels.js, the
frigate / revenue entries in src/features/naval/ShipClasses.js (model, glb, stations, sizes only), test/feature-navy.mjs
(additive). 19D (still running) owns AnimDef / Characters / the roster GLBs / WeaponPose / MeleeData: do not touch them.

1. A frigate GLB (Blender, headless, low poly in the style of brigantine_v2: the same node conventions so ModelSet,
   Sections, sails, flags, wheel and wrecks work unchanged): three masts, square sails, a raised quarterdeck, two rows of
   gun ports with barrels on each side (the lower row closed when not in action is fine), a white strake, navy blue
   and white paint, a stern with windows and the blue ensign with a white cross. ~28-32 m long, still a phone-friendly
   triangle count (compare with brigantine_v2 and stay within 1.6x its size and textures; reuse its textures if you can).
2. A revenue cutter GLB: a fast single-mast gaff cutter, ~14-16 m, long bowsprit, two small guns a side, navy colours.
3. Wire them: the classes load their own GLBs (glb set, model back to the normal path or keep 'navy' as a thin wrapper:
   whatever keeps hijack, wrecks, fire, flooding and the dress-free LOD simple), stations / helm / deck heights measured on
   the new hulls so gunners stand at the guns and the coxswain at the wheel; remove the dress mesh if the GLB carries it.
4. Verify by eye: Blender renders of both from three angles, and headless captures at sea (a frigate and a cutter on the
   Tidemark lanes at noon and golden hour, Medium and phone). READ every PNG. Tests: feature-navy, feature-naval,
   feature-hijack, feature-boarding, feature-ships green; add checks that both GLBs load with the expected nodes.
Report under 250 words with image paths, triangle counts, GLB sizes and any patches for files you do not own.
