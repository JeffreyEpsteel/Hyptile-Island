# Wave 22A: cars for everyone (multiplayer, phones) and Meridian on phones

Read COMMON.md, w19-common.md, w20-common.md, w21-common.md, then src/features/cars/** (Cars.js, CarPhysics, Traffic,
CarRender: `decorateState`, `updateRemote( [ { id, car } ] )`, `touch = { active, steer, throttle, brake, handbrake, horn }`,
`driving`, `policeLevel()`), src/features/netsync/** (NetSync.decorateState already calls cars.decorateState; peers' state
reaches RemotePlayers), src/net/RemotePlayers.js, server/** (rooms.mjs, universe.mjs rate limits), src/ui/TouchControls.js
(contextual clusters only: the user dislikes standing HUD buttons), tools/perf/** and docs/PERF.md (the phone budget,
<= 387 MB GPU).

Owned: src/features/cars/**, src/features/netsync/**, src/net/RemotePlayers.js, server/**, src/ui/TouchControls.js,
src/ui/ui.css (touch cluster styles only), test/feature-cars*.mjs, test/feature-netsync-w22.mjs (new), tools/perf/**,
docs/PERF.md, src/world/islands/meridian/** (LOD / budget constants only). A Fable QA worker is fixing bugs across the rest of
the game at the same time and worker 19D owns the animation files (AnimDef, Characters, WeaponPose, MeleeData, roster GLBs):
never edit their files; report patches with exact anchors for anything outside yours.

1. Multiplayer cars: a player's car (pose, wheels, lights, damage stage, horn, siren) seen by every other player; traffic
   and parked cars run by the host and mirrored cheaply (ids + lane positions, like NavalLink); taking another player's
   car is refused; police pursue the wanted player only on the host; bandwidth within the existing budget (measure).
2. Phones: a steering / pedal / handbrake / horn / exit cluster shown only while driving (thumb reach, 44 px targets),
   writing cars.touch; tilt optional. Verify in captures of the HUD at 390x844 and 844x390.
3. Meridian on phones: measure GPU memory and frame time at the downtown, the harbour and the skyline from home on the
   phone profile (tools/perf); cut until <= 387 MB (impostor distances, kit LOD, traffic density, window emissive) without
   making the city look worse at Medium.
4. Tests for all of it; English only; never use credentials, never deploy or push. Report under 300 words.
