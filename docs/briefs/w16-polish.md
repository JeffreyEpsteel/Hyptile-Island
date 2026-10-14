# Wave 16A: the harbour launch, the mail plane and the taken ships look the part

Read docs/briefs/COMMON.md first, then src/features/rescue/** (RescueData.js LAUNCH: naval's 'launch' class when there is
one, else a trawler tuned fast; the coxswain is a name in toasts only; the stern prompt), src/features/naval/ShipClasses.js
+ Models.js + ModuleModels.js + Ship.js (how a class gets a GLB and a procedural fallback, deck height, stations),
src/world/boat/** (GeoKit, the procedural hulls: the lobster boat is built there: reuse its recipe for an open launch),
src/features/hijack/** (the mail Petrel calls at Tidemark's bay and the home harbour: how it is drawn today, the pilot's
walk, hj.view().mail; the left-behind boats `left` and `_drawLeft`), src/features/seaplane/Remote.js (ParkedPlane),
src/world/residents/** (read only: how a resident figure walks a path: the pilot could be one), src/features/netsync
(read only: NavalLink syncs the host's ships; a guest's rescue launch is local only today: see the 15D note),
src/features/crew (read only: how a hired character stands at a post on deck: the coxswain can stand the same way).

Owned files: src/features/rescue/**, src/features/naval/ShipClasses.js (additive: a 'launch' class), src/world/boat/Launch.js
(new), src/features/hijack/index.js + Rules.js (the mail plane's visuals and pilot only), src/features/netsync/RescueLink.js
(new) + NetSync.js (register it only), test/feature-rescue.mjs, test/feature-hijack.mjs (additive), test/feature-netsync-w16.mjs
(new). Report App.js / Game.js / residents patches under 200 words.

1. A real harbour launch: naval class 'launch' (open boat ~9 m, a wheel aft, a lamp on a short mast, a blue hull with a
   white gunwale, "HARBOUR" on the bow, fast, no guns), procedural from GeoKit (no Blender needed; a GLB later), used by
   the rescue (LAUNCH.kind exists), with a coxswain figure at the wheel (a roster character in a jersey if the roster
   supports it, else the crew's stand-in figure) who turns to the player and speaks the toasts; the lamp is a light.
2. The mail Petrel: visible on the water at its stops (a ParkedPlane in a mail livery with "MAIL" on the fuselage), the
   pilot walks from the plane to the tavern and back on the schedule (a resident path), a toast when the mail comes in.
3. Left-behind boats draw as moored hulls (they do: check they also appear in the world map / minimap as "your boat"
   markers and the agents' pin) and other players see them (an entry in the moored list netsync already has).
4. Multiplayer: a guest's rescue launch is visible to the others (RescueLink: the launch rides the host's ship list as a
   'launch' kind entry, or the guest streams it like a stray plane: pick the cheaper path that reuses NavalLink / PlaneLink).
5. Tests: the launch class spec, the rescue uses it, coxswain stands at the wheel, the mail plane's schedule and visuals
   state, the left-boat markers, the launch entry syncs between two clients. Existing rescue / hijack / naval / netsync
   tests green. Vite build check. No browsers. Report under 250 words.
