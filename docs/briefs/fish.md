# The Unreal fish set and its marker-timing catch minigame

Owned files: src/world/fish/** (FishGeometry.js, FishSpecies.js edited), src/world/Fish.js, src/game/FishTable.js, src/game/Bites.js,
src/game/CatchMinigame.js, src/game/FishPortrait.js, src/game/FishStand.js, test/feature-fish-unreal.mjs. Keep every existing
test green. Species ids EXACTLY: 'silverminnow', 'rootfin', 'lanterncarp', 'upsidedowneel', 'glassperch', 'crookedcod'
(quests reference them). Keep CatchMinigame colours in CSS variables or a palette object (accessibility hook later).

1. Read the Unreal definitions in D:\fishing game\UpsideDownFishing (Source/**/*Fish*, data tables in Content/Config,
   TASKS.md, knowledge) and the naval fork: rarity, weight, value, habitat, time of day, behaviour, colours/shapes, and the
   marker-timing minigame rules (moving marker, target zone, hits/misses, tension/escape).
2. Six species on the existing schema: LanternCarp night-only, faintly glowing; UpsideDownEel swims belly-up; GlassPerch
   semi-transparent; CrookedCod bent jaw/body; Rootfin root-like fins; SilverMinnow small schooling bait. Procedural
   geometry/material variants so they look distinct in the water, on the line, in FishPortrait and FishStand.
3. Marker-timing minigame variant in CatchMinigame.js chosen per species via a field; difficulty from fight strength and
   rod/line gear; losable (misses build tension; three misses or a snapped line lose the fish); existing minigame untouched
   in difficulty; non-intrusive visuals in the HUD style.
4. Balance: rarity per the Unreal data, no flooding of existing tables. Mapping table in src/world/fish/UNREAL_SPECIES.md.
Report root patches (e.g. Game.js passing gear to the variant).
