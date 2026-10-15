# Wave 22B: right a capsized boat yourself; drown if you stay under too long

The user (2026-10-15): "I want a minigame to make the capsized small boats turn around. Also the possibility of dying due
to staying underwater too much time."

Read COMMON.md, w19-common.md, w20-common.md (English only; no standing HUD buttons: contextual only), then
src/player/BoatController.js (3af2572 just added ballast that rights any hull past 35 deg of heel: replace that for small
boats), src/world/boat/** (hulls, Boats.js sizes: skiff, dinghy, launch, cabin launch, sloop, trawler...), src/player/
Player.js (swim / dive modes, read only: report patches), src/features/death/** ('drowned' already exists as a cause; there is
no breath meter yet), src/features/rescue (flares, castaways), src/features/crew (crew aboard a capsized boat), src/ui/
TouchControls.js, src/game/GameHUD.js (read only: report patches), test/feature-ships.mjs, test/feature-death*.mjs.

Owned: src/features/capsize/** (new feature 'capsize'), src/player/BoatController.js (the righting rule only),
src/features/death/**, src/ui/TouchControls.js (contextual buttons only), test/feature-capsize.mjs (new),
test/feature-death*.mjs (additive), test/feature-ships.mjs (the righting checks). Report patches for install.js, Features.js,
Player.js, GameHUD.js / HudPanels.js, App.js. A Fable QA worker is fixing other bugs at the same time (seaplane, cars and
police, save/load, melee, UI polish): never edit files outside yours.

1. Capsizing: small boats (skiff, dinghy, rowboat, launch, small sailboats: decide by hull size / mass) stay capsized when they
   turn over (hull up, floating, drifting, the player thrown into the water, loose gear floats away or is lost). Big hulls keep
   3af2572's ballast righting (or sink by flooding as today).
2. The righting minigame: swim to the upturned hull, E (touch: a "Right her" button shown only there) climbs onto it; then a
   short physical minigame: stand on the keel / centreboard, lean back and pull the gunwale up in time with the swell: a
   balance meter with a moving sweet spot (waves push it), hold to pull, release to recover stamina; good timing raises the
   heel, bad timing slips you back into the water; 10-25 s for a good attempt, harder in rough weather, easier with crew
   helping (each hand aboard adds pull). Success: she rolls upright with water in her (bail out or the pump works it out over
   time; slow until dry). Animations: Climb_Pull / swim clips from the roster for the climb, lean back pose (pose clip), a splash
   when she comes up; sounds via the sfx feature's events (report a patch or emit events it hears).
3. Breath and drowning: a breath meter while the head is under water (diving, swimming under a hull, trapped under a capsized
   boat, thrown in by a wreck): ~30 s of air (less when sprint-swimming, more with a future upgrade), shown only while under
   or recovering (a ring near the centre, contextual), warning sounds and a darkening vignette in the last 8 s, then damage,
   then death with cause 'drowned' through the death feature (the existing respawn / lost-cargo rules). Surfacing refills in
   ~4 s. No drowning while seated in a vehicle above water, in a submerged plane cockpit only after the crash rules let you
   out; crew and NPCs not affected (or simply not drowning).
4. Multiplayer: capsize state and the righting replicate (report the netsync patch); other players can help pull.
5. Tests: which hulls stay capsized, the minigame maths (timing, weather, crew help, success / fail), bailing, breath drain /
   refill / drowning / no drowning in vehicles, save round trip with a capsized boat. Headless captures of an upturned boat,
   the player on the keel mid-minigame and the breath ring (READ them). Report under 300 words with patches.
