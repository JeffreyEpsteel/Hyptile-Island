# Wave 18E: a bigger animation library (way of life, combat, emotes) without a single A-pose

Read docs/briefs/COMMON.md and w18-common.md first, then tools/roster/README.md (the whole file: the roster pipeline, the
Rocketbox retarget (MIT mocap, tools/roster/rocketbox/clips.json + fetch-rocketbox.ps1 + retarget.py), the wave 17 Kimodo
section, kimodo-splice.ps1 and splice-clips.mjs: build a character with extra clips into a scratch folder and splice ONLY
those clips into the committed GLBs), src/game/Characters.js (CLIPS), src/player/anim/AnimDef.js + AnimGraph.js +
ClipTools.js (states, montages, pose clips `{ base, baseTime, keys }`), src/player/Avatar.js (read only: ACTIONS, ONE_SHOT),
src/features/emotes/** (the emote wheel), test/clip-frame.mjs (render any clip frame headlessly and READ the PNG),
test/roster-clips.mjs, test/feature-anim-audit.mjs (no clip the game plays is bind-like).

Owned files: tools/roster/** (clips.json additions, scripts), public/models/roster/*.glb (splice only: never rebuild every
clip; one character build at a time, Blender is shared with workers 18C / 18D), src/game/Characters.js (clip names),
src/player/anim/AnimDef.js (new states / montages / pose clips; keep every existing one), src/features/emotes/**,
test/roster-clips.mjs, test/feature-anim*.mjs (additive), test/feature-emotes.mjs (additive).

1. Way-of-life clips for worker 18B's residents (they use names through a fallback, so add these names exactly): Sit_Chair
   (a seat at 0.45 m: Rocketbox's sit clips with the `sit` option; the pelvis must land at seat height, not the floor),
   Sit_Chair_Idle (loop), Stand_From_Chair, Lean_Wall, Drink, Eat, Carry_Box (walk loop carrying), Kneel_Work, Crouch,
   Talk_Group, Clap, Point_Out, Hammer, Fish_Net (mend a net), Drunk_Walk, Lamp_Light (reach up). Sources in order of
   preference: Rocketbox mocap (MIT; check its animation list in the repo: `Assets/Animations/all_animations_max_motextr_*`),
   then existing Kimodo BVHs in D:\fishing game\Assets\HyptileMotion\game_set (run through
   D:\fishing game\tools\kimodo_text_encoder_setup\kimodo_clip_pipeline.py: ~20 min per clip, Blender), then pose clips in
   AnimDef. Review each with clip-frame renders on hyptile and one slim character (clown) before splicing.
2. Seats done right: replace Sit_Down / Stand_Up / Seated_Idle if a Rocketbox take at the 0.29 m pelvis drop the game
   expects (README "Rebased clips"; roster-clips checks it) reads better than the current ones; Captain Roid's crate and the
   boat seats must still line up.
3. More emotes on the wheel (Digit5): bow, salute, flex, facepalm, thumbs up, sit on the ground, dance 2, laugh (exists),
   wave (exists): Rocketbox gestures first.
4. Locomotion polish: a crouch walk, a tired walk at low stamina (the player's stamina exists: report the Avatar / Player
   patch to pick it), a carry walk, a short turn-in-place, ladder climb if any rig take exists.
5. Tests: every new name in Characters.js is in all eight GLBs and not bind-like (feature-anim-audit's list), every new
   AnimDef state / montage resolves, the seat clips' pelvis height. Report under 300 words: the clip table (name, source,
   length, loop) and the AnimDef / Avatar patches for root.
