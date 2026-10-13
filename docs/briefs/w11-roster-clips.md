# Wave 11C: the roster's broken clips re-exported; tillers and AI wheels move

Read docs/briefs/COMMON.md first, then tools/roster/README.md and build.ps1 / convert-character.py (how the 8 roster
GLBs in public/models/roster are built with Blender 5.2 headless from D:\fishing game sources: read-only sources),
src/player/ik/ProcPose.js (wave 10B: `bindLike()` flags clips that stay within ~4 deg of the bind pose; today
Helm_Idle, Steer_Left / Right, Seated_Idle and Fall_Loop are such clips: a retarget fault), src/player/Avatar.js
(CLIPS / LOOPS names the graph expects), test/feature-helm.mjs, test/character-smoke* (currently failing on a stale
joe.glb path: fix the path to the renamed character).

Owned files: tools/roster/**, public/models/roster/** (rebuilt GLBs), src/world/boat/FleetBoatModel.js (tillers only),
src/features/naval/Models.js (the AI ships' wheel / tiller only; another worker edits the rest of naval: touch nothing
else there), test/character-smoke*.mjs, test/roster-*.mjs (new). Report anything else as patches.

1. Find why those clips export as bind poses (the retarget mapping in convert-character.py: a source clip name mismatch,
   a missing source file, a bone-map gap, or a bake that samples frame 0 only). Fix the pipeline, re-export all 8 GLBs
   with the same build (Blender headless; render a preview of Seated_Idle / Helm_Idle / Fall_Loop frames to your
   scratchpad and look at them), and keep every other clip identical (compare the clip name list and durations before /
   after). If a source clip truly does not exist, author a short procedural one in the build (seated: knees bent, hands
   on thighs; fall: arms up, legs trailing; helm: hands forward at wheel height) rather than leaving the bind pose.
2. A node test (test/roster-clips.mjs) that loads each roster GLB with the project's GLTF loader and asserts no clip in
   CLIPS is bind-like (reuse ProcPose.bindLike), and the character-smoke test green again.
3. Tillers: the fleet hulls with a tiller (not a wheel) move it with the steering (FleetBoatModel.setSteering, the tiller
   node by name, else the procedural one), and the AI ships (naval Models.js) turn their wheel / tiller with Ship.yawRate
   or the brain's steer. Test the rotation on every hull / ship class headless.
Vite build check as in COMMON.md. Report under 250 words.
