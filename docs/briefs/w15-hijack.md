# Wave 15C: pirates keep their distance from the start; every vessel can be taken

Read docs/briefs/COMMON.md first, then src/features/pirates/** (Dens.js: camps on islands 5-8, SearchZones, Retaliation,
Notoriety, Roster), src/features/naval/** (Naval.js: spawn / ships / AI; Brains.js: states; Routes.js: PATROLS and
SAFE_ZONES, inSafeZone; Ship.js, ShipClasses.js: hull classes), src/features/boarding/** (Boarding.js: board a crippled
pirate, fight her crew, prisoner or plunder; Hostile.js: enemies boarding you), src/game/Boats.js + src/App.js
setBoat( id, { dock } ) (read only: the player's hull swaps by id; BOATS is the catalogue), src/features/agents (read
only: boats moored at docks), src/features/seaplane (read only: airframes, parked planes: sp.parked, takeOut), src/
features/story (read only), src/features/customs + harbour (read only: standing, bounties), src/features/netsync/NavalLink.js
+ HullLink (read only: how ships and the player's hull sync).

Owned files: src/features/pirates/**, src/features/naval/Brains.js, Routes.js, src/features/boarding/**, src/features/
hijack/** (new feature 'hijack'), test/feature-pirates.mjs, feature-boarding*.mjs, feature-naval.mjs (additive),
test/feature-hijack.mjs (new). Report App.js / Game.js / Boats.js / seaplane / install.js patches under 250 words.

The user's words: "better placement of pirates (further away than the starting point for example), NPC ships /
airplanes / all types of transport hijackable."
1. Pirates keep off the start. A calm radius of 450 m round Jade Landing and the home dock (and 250 m round every
   port's dock) where pirate ships never spawn, hunt, or fire, and retaliation never arrives (they turn back at the
   edge); the first pirate encounter happens past the reef. Spawns for hunts / retaliation come from Blackwater's
   direction (far south) or the dens, never inside 600 m of home. The notoriety hunters give a horizon warning (a
   sail on the horizon toast + minimap blip at 500 m) before they close. Keep the stronghold and den fights as they
   are. Tune SAFE_ZONES / PATROLS / Dens accordingly; the tests encode the new distances.
2. Hijack any vessel (new feature src/features/hijack): a. at sea: any NPC ship (merchant, fisher, navy cutter,
   pirate) crippled by you can be boarded (Boarding.js today: pirates only: generalise the offer) and, after the
   deck fight, a third choice "Take the ship": you take her helm, she becomes your boat (app.setBoat with a new hull
   id derived from the ship class: report the Boats.js / App.js patch: BOATS gains the AI hull classes that are not
   player hulls yet, or map each class to the nearest player hull and keep her name / livery / damage), your old
   boat stays moored where it lies (an entry the agents can recover) and her cargo becomes yours; b. moored: at
   night, a ship moored at a dock (Tidemark, Blackwater's three, merchants at anchorages) can be sneaked aboard from
   the water or the quay (climb aboard: the player's water climb reaches hulls, see wave 15D: use
   `features.get( 'hijack' )?.canTake( ship )`), the crew sleeps or is ashore (a guard roll by notoriety and time),
   E at the helm casts off: an alarm if the roll fails (guards fight, the port's standing drops, a bounty);
   c. planes: NPC-owned planes visit (a mail plane lands at the airstrip and the bay on a schedule: a Petrel with a
   pilot who walks to the tavern; src/features/seaplane's parked visual can draw it: report the patch) and can be
   taken the same way (E at the door while the pilot is away: sp.takeOut of a 'stolen' airframe entry, reported
   patch), with a bounty; d. residents' skiffs at the docks (Boats 'skiff' / 'canoe') are takeable at once with a
   small standing loss.
3. Consequences and ownership: a stolen vessel is wanted (the faction's ships hunt it: merchants' navy escort,
   pirates' retaliation, the town's guards at its home port), repainting at the yard (a fee) launders it after a
   day; the stolen ship can be sold at Blackwater's black market (BlackMarket: report the row) or kept. Standing /
   notoriety / bounty through the existing systems (pirates Notoriety, customs, harbour).
4. Multiplayer: the hull id syncs already; a hijack emits `vesselTaken { id, class, by }` (world event) so the host
   removes the AI ship and other players see your new hull; moored ships taken at Blackwater go through the host
   (StrongholdLink: report the patch).
5. Tests: calm radius (no spawn / no fire / retaliation turns back), boarding offer on a crippled merchant, take the
   ship -> player hull changes and the old boat is moored, night sneak roll, the alarm path, plane theft, wanted
   state and laundering, save round-trip. Existing pirates / boarding / naval tests green. Vite build check. No
   browsers. Report under 250 words.
