# PBIK-style contact IK for the roster characters

Owned files: src/player/Avatar.js, src/player/ik/** (ContactIK.js, Grips.js, Ground.js, Solvers.js exist, ~1200 lines),
the skinning code under src/engine only if a pose hook is strictly needed (keep setOverlay/setMorph and the GPU path
intact), test/feature-ik.mjs. src/player/Player.js belongs to the seaplane worker (report any patch you need there).
Characters: GLBs with the 48-bone JadeFisher rig (src/game/Characters.js), SkinnedModel with an upper-body overlay API
(setOverlay), EyeDriver look-at, a verlet ragdoll (Avatar.ragdoll). Player modes: walk, swim, deck, seat, boat, ride, plane.

1. src/player/ik: analytic two-bone solver with pole vector and joint limits, FABRIK/CCD fallback for spine/neck chains,
   a post-animation pass after the clip pose and before the skinning upload.
2. Foot IK on walk/deck/seat: ground under each foot (terrain via app.terrainData like Player.js; decks via the boat's
   deck height and world transform), drop the pelvis to the lowest foot, plant feet with smoothing, align to the ground
   normal (clamped), fade out when running fast, swimming, jumping or ragdolling.
3. Hand IK: avatar.setIKTargets( { leftHand, rightHand, leftFoot, rightFoot, weight } ) in world space (optional
   rotations): both hands on the helm wheel/tiller/oars, both hands on the rod during the fight (Game.helmAction,
   src/game/FishingRod.js grip points; report the Game.js/Player.js patch that feeds targets each frame).
4. Budget < 0.2 ms per character, no per-frame allocations; ?ikdebug prints console stats only.
5. Test: two-bone reach/unreachable/pole, pelvis drop, weight blending. Run node test/engine-smoke.mjs and the avatar
   tests (test/feature-eyes currently reports one clown Blink_L failure - check whether your area causes it).
Report root patches and what you verified.
