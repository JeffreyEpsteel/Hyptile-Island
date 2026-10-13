# Wave 10A: a crew that works the guns and the lines; cannons you can aim in third person

Read docs/briefs/COMMON.md first (rules, root-owned files, style, no browsers / dev servers / npm install), then
docs/briefs/w9-naval-collisions.md (what landed in wave 9: Collisions.js, aiming with the right button, AimAssist,
Hud.js) and the headers of src/features/naval/Naval.js, src/game/Boats.js, src/game/Characters.js (the roster: hired
"crew" today = playable characters, unlocked at Ethena's Crew tab in src/game/HudPanels.js crewCards), src/game/Game.js
(fishing: how a catch is produced and added to the cooler: look for the catch / CatchMinigame / state.addFish path and
src/game/Fish.js or FishData for the species by zone / depth / time), src/world/village/Residents* (skinned residents
built from roster GLBs: the way to put a crew member on deck), src/player/Player.js (updateBoat: the helm camera).

Owned files: src/features/naval/**, src/features/crew/** (new), src/player/Player.js ONLY the third-person helm camera
code inside updateBoat (nothing else in that file), test/feature-naval*.mjs, test/feature-crew.mjs (new). Report exact
patches for everything else (HudPanels crew tab rows, Game.js hooks, install.js registration, GameState keys) under
300 words. Root integrates and plays it.

User feedback (verbatim): "I want crew that can handle the cannons and fish automatically for me when I go out in the
ocean." "I want you to fix 3rd person shooting of cannons as it is impracticable right now."

1. Third-person aiming. Today holding the right button at the helm aims with the camera, but in the chase view the
   boat's own hull and the camera's height make the crosshair land uselessly. While `naval.aiming` and the player's
   view is third person: swing the helm camera to an over-the-shoulder aim camera on the aimed side (the side the look
   direction picks): offset ~2.5 m to that side and ~1.2 m up from the normal chase anchor, ~30 % closer, a slightly
   narrower FOV (-8 deg, restored on release), eased in / out over ~0.25 s; the crosshair marks where the ball would
   land (impact point of the arc, projected), the range readout next to it, the aim dots only between gun and impact.
   Vertical look sets the elevation (range), horizontal look picks the side and traverse within the gun's swing; past
   the swing the crosshair turns dim and says "out of arc" so the player turns the boat. Left button fires the aimed
   side. Also in first person keep what wave 9 did. Expose `naval.aimCamera()` -> { side, yawOffset, pitch, dist,
   fov } | null for the camera code you own in Player.updateBoat, so the maths is testable in node.
2. The crew. Hired characters (CHARACTERS unlocked in GameState, minus the one being played) can be posted to the
   boat: posts per hull from Boats.js (add `berths` to each hull in your report if Boats.js is root-owned - it is:
   report the numbers: skiff 0, canoe 0, cutter 1, launch 1, lobster 2, trawler 3, sloop 3, brigantine 4). Two posts:
   - gunner: works one broadside each (a gunner per side; the first gunner takes the side facing the nearest hostile).
     When a hostile pirate is inside the gun's reach and arc and the player is aboard (helm or deck), the gunner fires
     that side automatically through Naval's existing fire path with a longer reload (x1.6) and a worse spread (x1.5)
     than the player, never at merchants, never inside the peaceful home waters, never while the ship is crippled (so
     the boarding offer is not wasted). A small HUD line "Gunners: Pepe (port) · Doge (stbd)" with their reload state.
   - angler: while the boat is at sea (not moored / not in port, speed < 2.5 m/s or at anchor; or trolling under 4 m/s
     at half rate), the angler lands a fish every 45-90 s (tier / water dependent: use the same species-by-zone and
     weight rolls the player's catch uses, so a reef angler catches reef fish), into the cooler if there is room,
     consuming bait if the crafting feature's bait is in play (read how the player's cast does it; sandbox: free).
     A toast "Pengu landed a 1.3 kg Jade snapper" and the catch counts for quests / career like a player catch
     (use the same add-catch entry point you find in Game.js; report the hook if it is root-owned).
   - crew on deck: each posted member stands at a deck point of the hull (gunners by the guns, anglers at the rail
     with a rod) built from the roster GLB through the residents' skinned-model path (idle / fishing hold / a gun
     ramming loop if a clip exists; otherwise idle); they ride the boat frame (attach to the boat group / toWorld each
     frame like the deck props) and never collide. Keep it cheap: no IK, animated residents budget on phones
     (globalThis.__phoneBudget: at most 2 crew animated there).
   - posting UI: the chandlery Crew tab (HudPanels crewCards: report the patch) gets a "Post" control per hired
     character: Off / Gunner / Angler, greyed when the hull has no free berth. A crew member being played leaves the
     post. Persist posts in the crew feature's toJSON/fromJSON (report the save hook).
   - the crew feature: src/features/crew/index.js install( app, features ) returning { update, toJSON, fromJSON, reset,
     dispose, posts, berths(), setPost( id, post ), rows() } with the headless logic in Crew.js (node tests).
3. Tests: aim camera maths (side pick, swing clamp, out-of-arc), gunner fire decisions (hostile / merchant / peace /
   crippled / reload), angler timing and capacity, berths per hull, post persistence. Vite build check as in COMMON.md.
