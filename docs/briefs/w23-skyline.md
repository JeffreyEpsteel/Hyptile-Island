# Wave 23A: Meridian's skyline: many different skyscrapers, all destructible

The user (2026-10-15): "Add more towers and make them different from reality. I don't care about 9/11 or them looking in
that way. I just want destroyable sky scrapers."

Read COMMON.md and w21-common.md (its "two towers" hard rule is retired by this brief), then the city as ChatGPT's release
3ba863b left it: src/world/islands/meridian/** (CityPlan.js: the Twins and the highrises; Meridian.js: building handles,
setStage / setCollisionStage, roof landings for the helicopter; Facades.js: the window shaders; World.js; TownLife.js),
src/features/citywreck/** (CityWreckData.js: tower class now HP 4000, ARMOR 0.65, MAX_STAGE 3, burns and collapses;
Model.js, Looks.js, Render.js: collapse animation, rubble, fire), tools/meridian/** (towers.py, kit.py: the Blender kit),
the helicopter feature (rooftop landings on the towers: find it from 3ba863b's files), test/feature-meridian.mjs,
test/feature-citywreck.mjs, docs/PERF.md (phone budget <= 387 MB).

Owned: src/world/islands/meridian/**, src/features/citywreck/**, tools/meridian/**, public/models/meridian/**,
test/feature-meridian.mjs, test/feature-citywreck.mjs. Report patches for anything else (helicopter, cars, quests, maps).
A Fable QA worker is committing other fixes on main at the same time: never touch files outside yours.

1. Replace the identical twin towers with a downtown of 6-9 distinctive, fictional skyscrapers of different heights
   (about 140-320 m), none of them a pair of identical square boxes: e.g. a setback Art-Deco needle with a spire, a twisting
   glass tower, a stepped ziggurat with a crown, a slim cylinder with a ring deck, a split-top tower with a sky bridge
   within one building, a triangular-plan tower with a lit edge, a cantilevered tower with a hanging garden; varied facade
   materials and night lighting (the Facades shader styles), visible from home as a recognisable skyline (far impostors).
2. All of them destructible: hits from cannon, bombs, car explosions and aircraft crashes damage them by stages; heavy
   structure (they take far more than a midrise), fires spread floor by floor, upper sections can break off and fall, a
   full collapse is possible after heavy damage and leaves a large rubble field that blocks roads (roadBlocked) and damages
   what it hits; repairs rebuild them over in-game days. Keep it performant: at most two collapse animations at once,
   chunked rigid pieces / baked motion, phones simpler dust.
3. Keep what 3ba863b added working: roof landings (helicopter) on the towers that have flat roofs or helipads (give at
   least three towers a helipad), roof collision removed when that part is destroyed, quests and map references to the
   old Twins renamed to the new towers (report patches), save compatibility (old saves with Twins ids load: map them).
4. Budgets: phone <= 387 MB GPU at downtown and the skyline from home; Medium downtown frame no worse than now (15.6 ms,
   185 draws in docs/PERF.md). English only. Never use credentials, never deploy, commit or push.
5. Verify by eye: Blender renders of each tower, headless captures (tools/meridian/capture.mjs): the skyline at golden hour
   and night, downtown street, a tower mid-collapse and its rubble, Medium and phone. READ every PNG. Tests: the plan
   (distinct shapes, heights, ids), the damage model (stages, collapse, fire, repair, aircraft), landings, saves. Report
   under 300 words with image paths and patches.
