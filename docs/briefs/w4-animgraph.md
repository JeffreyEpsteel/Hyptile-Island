# Wave 4: UE5-style animation graph (blend spaces, montages, state machine)

Owned files: src/player/Avatar.js, src/player/anim/** (new), src/game/Characters.js (clip tables), src/engine/render/Skinning.js
(only if a blend API is strictly missing; keep its public API), tools/roster/** (if new or retimed clips are needed: Blender 5.2
D:\blender\blender.exe, pipeline tools/roster/build.ps1, retarget.py, fishing_pose.py; the roster GLBs in public/models/roster),
test/feature-anim.mjs (new), test/avatar-overlay.mjs. src/player/Player.js is not yours (its pose() drives you; report patches).
The IK pass (src/player/ik, poseOverride) runs after your graph: keep it working.

1. src/player/anim: an AnimGraph with a state machine (ground: idle / walk / jog / run / sprint, jump / fall / land,
   swim, deck, seated, helm, ride, plane, ragdoll / getup, fishing), transitions with blend times and rules, blend spaces
   (1D speed for locomotion, 2D speed x strafe for combat strafing, a lean/turn additive), montages for one-shot actions
   (cast, strike, catch, swing, dodge, block, hit reactions, knockdown, wave, dance, emotes, boarding) with blend in/out,
   playback rate, root-motion flag, slots (full body / upper body over locomotion using the existing overlay machinery),
   notify events at times (e.g. 'contact' at the swing's hit frame, 'footstep'), and an inertial-blend or crossfade so
   nothing pops. Pose evaluation stays on the GPU-skinning path (clip sampling as today; the graph only decides weights).
2. API: avatar.playMontage( name, opts ) -> handle { stop(), onEvent }, avatar.setLocomotion( { speed, strafe, turn,
   grounded } ), avatar.state (read-only), avatar.graph for debugging; keep the existing action API (ONE_SHOT / LOOPS /
   setOverlay / ragdoll / EyeDriver / setIKTargets) as thin wrappers so nothing else changes.
3. Fix what the user disliked: walking that looks like a slide (speed-matched stride via the blend space + foot-locked
   IK hook), A-pose moments, pops between rod poses; add a strafe blend space for combat (the combat worker calls
   setLocomotion with strafe) and clean hit/dodge/block montages (retarget from the Rocketbox set if present, else author
   short clips procedurally with fishing_pose.py's FK tools).
4. A ?animdebug console line (state, weights). Hot reload: the graph definition is a plain data module so Vite HMR swaps it.
5. Test: state transitions, blend-space weights, montage slots/events, the fallback wrappers.
Report root patches (Player.pose() changes, Game action calls that should become montages). Under 400 words.
