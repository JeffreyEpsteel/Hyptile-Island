# Wave 5 (alpha feedback): Captain Roid sinks through the boardwalk, stands in an A-pose, and should move around

User report with a screenshot: at Captain Roid's boat yard he stands on the new Jade Landing boardwalk planks with his
feet below the planks (placed at terrain height under a raised deck), arms out in an A-pose (his Idle clip is not
playing), and he never moves. The user wants him "active and moving around".

Owned files: src/game/CaptainRoid.js, src/game/Vendor.js, src/game/BoatYard.js, src/audio/RoidVoice.js, src/audio/Clicks.js,
src/world/start/Landing.js (ONLY the boardwalk's route/end near the yard if it must change), test/roid.mjs, test/feature-start.mjs
(keep green). Read src/world/start/README.md + Landing.js (the boardwalk from Jade Landing to the boathouse path at (88, -62)),
CaptainRoid.js placeRoid(), Vendor.js loadCharacter(), src/world/Colliders.js (groundHeightAt( x, z, maxY ) returns the top
of colliders such as deck planks), and how residents walk (src/world/Residents.js, src/features/harbour/Schedules.js: a
resident gets tasks/routes; read-only for you).

1. Placement: Roid (and any vendor placed by terrain height) must stand ON the boardwalk/deck when one covers his spot:
   use Math.max( terrain.heightAt, colliders.groundHeightAt( x, z, 50 ) ) at placement and whenever he moves. If the
   boardwalk end cuts straight through the yard's working area, reroute its last metres to end at the path beside the yard
   instead (small change in Landing.js; keep feature-start's walk test green).
2. The A-pose: find why his Idle clip has no weight now (suspects: the wave-4 animation changes in src/player/Avatar.js
   do not apply to Vendor's own SkinnedModel; the perf worker's skinned-mesh culling / bounds (src/engine/render) may stop
   the animation update when it thinks he is off-screen; or Characters.js CLIP_SPEED changes). Fix it in your files or
   report the exact patch for the engine file with the cause.
3. A routine: Roid walks around his yard with the island clock (checks the moored boats, stands at the sign, sits on a
   crate, looks out to sea, strolls to the pier head and back), using his own clips (Idle / Talk / the walk clip if his GLB
   has one; if it has none, retarget a walk from the roster pipeline tools/roster or blend a procedural step) at a
   plausible speed, pathing over the sand/decks with colliders.groundHeightAt, never through props; when the player comes
   within ~6 m he stops, turns to face them and the E prompt / panel works exactly as today (the yard panel must not
   depend on him standing at the nominal spot: anchor the interaction on his live position). Clicks/voice unchanged.
4. Multiplayer: his routine is local per client (deterministic from the clock so everyone sees roughly the same).
Report what caused the A-pose, root patches if any, and a headless render of him standing on the planks (look at it).
