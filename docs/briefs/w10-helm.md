# Wave 10B: the helmsman holds the wheel and the wheel turns

Read docs/briefs/COMMON.md first (rules, root-owned files, style, no browsers / dev servers / npm install).
Owned files: src/player/Avatar.js, src/player/ik/** (Grips.js: contactTargets builds the helm grips), src/world/BoatModel.js
(the wheel only), src/world/boat/FleetBoatModel.js, src/world/boat/ShipBoatModel.js, public/models/fleet/** only if a
wheel node must be added (tools/roster or tools/fleet build scripts, Blender headless - render a preview to your
scratchpad and look at it), test/avatar-*.mjs / test/feature-helm.mjs (new). Report exact patches for src/player/Player.js
(avatarPose: the helm pose data) and anything else root-owned, under 250 words.

User feedback (verbatim): "The wheel is not rotating when I steer and the character is keeping an A pose in front of it."

1. The A-pose. Avatar.js line ~848 drops the helm loop clip at the helm (`! ( bact === 'helm' && pose.mode === 'boat' )`),
   so at the wheel no base clip plays and the rig falls to its bind pose (the A). Find out why that exclusion exists
   (the IK grips were meant to take the arms; the legs were meant to come from a standing loop) and make the helmsman
   look right on every hull: a standing idle (or the helm clip if the roster GLBs carry one: check with the GLB clip
   list; tools/roster has the clip sources) on the legs and body, both hands on the wheel through the ContactIK grips
   (Grips.js contactTargets: the grip points must come from the hull's wheel position and radius, FleetBoatModel /
   BoatModel expose helm + wheel data: add `wheelGrips()` returning the two hand targets in boat space, rotating with
   the wheel angle), a lean / weight shift with the steering input and a little sway with the hull roll. Rigs without
   the IK bones get a plain upper-body pose (arms forward, hands at wheel height) instead of the A.
2. The wheel. BoatController calls model.setSteering( steer ) every frame; BoatModel rotates `wheelMesh` by WHEEL_TURNS,
   but the fleet hulls (FleetBoatModel, the GLB boats in public/models/fleet) and the ship hulls (ShipBoatModel) must
   find their wheel: locate the node by name (wheel / helm / rudder-wheel, check the GLBs) and rotate it about its own
   axle; when a GLB has no wheel node, add the procedural wheel from BoatModel at the helm point (helmEye / helm data)
   so every hull has a wheel that turns, and the grips above use it. The ship hulls' tiller / whipstaff, if that is
   what they have, moves the same way.
3. Tests (node, no GPU): wheelGrips rotate with the angle; setSteering changes the wheel rotation on every hull class
   (FleetBoatModel can be built headless? check its tests / fallbacks: test/fleet* exists); the avatar's helm state has
   a base clip or a procedural pose, never none. Vite build check as in COMMON.md.
