# Wave 12B: a full pirate island

Read docs/briefs/COMMON.md first (rules, root-owned files, style, no browsers / dev servers / npm install), then
docs/briefs/islands.md and src/world/islands/*.js (the island module pattern), src/features/pirates/** (Dens.js: camps
with guards and a keeper's ship; Roster.js captains; Notoriety.js; Retaliation.js; SearchZones.js), src/features/naval
(Ship.js, Brains.js, Projectiles.js: how a ball is launched and lands; Ballistics.js; naval.spawn), src/features/melee
(Raider.js: the guards), src/features/boarding, src/features/trade (goods, contraband, customs: a black market belongs
here), src/features/destruction (Kinds / Sites: walls and batteries that can be broken), src/world/WorldLayout.js.

Owned files: src/world/islands/Blackwater.js (new; use a pirate-island name from D:\fishing game\knowledge if the Unreal
sources name one), src/world/islands/stronghold/** (new), the new entries in WorldLayout.js and terrain/IslandShape.js
(additive, re-read before editing; the other worker 12A adds another island at the same time: pick coordinates that keep
400 m of water from everything, re-read WorldLayout before writing), src/features/pirates/Stronghold.js + Batteries.js +
BlackMarket.js (new), test/feature-stronghold.mjs (new), test/feature-pirates.mjs. Report patches for naval (a shore
battery needs to fire balls through Projectiles: ask for `naval.launchFrom( x, y, z, dir, opts )` if nothing public
exists), App / Game / HudPanels / Ports under 300 words.

The user asked (verbatim): "also a full pirate island".

1. The island: a jagged volcanic island (radius ~260 m) far from the home island on the pirates' side of the map (their
   patrols in naval/Routes.js), a hidden cove entrance between cliffs, a crescent beach inside with the pirate town, a
   fort on the headland above the entrance.
2. The stronghold: the fort has 2 shore batteries (3 guns each) that fire at any player boat inside ~220 m that is not
   flying the black flag (see 4), with the naval ballistics and reload (slow: 9 s), wooden palisade walls and gun
   platforms that are destructible (Kinds: 'palisade', 'gunPlatform': a battery silenced when its platform breaks),
   powder stores that explode when hit (big splinters, fire), a watchtower with a bell (the bell raises the alarm:
   guards wake, the keeper's ships cast off). On the beach: a pirate town of huts, a tavern ("the Rum Hole"), a
   black market, docks with 2-3 pirate ships moored (naval.spawn with state 'moored', their brains hunt once alarmed).
   Guards: 6-10 raiders (melee Raider, tiers 2-4) on patrols around the town and fort, more at night.
3. Taking it: sink or cripple the moored ships, silence the batteries, beat the guards, then E at the fort's flag to
   claim the island for a while (it restocks like a den after DEN_RULES.restock); claiming pays a big loot (coins,
   contraband cargo, a captain's ransom if one is caught) and raises notoriety / standing per the pirates feature; the
   pirates retake it after the restock and retaliation follows.
4. The other way in: a player with enough corsair standing (Notoriety.js: pick the threshold) or who buys a "black flag"
   at the black market ($800) is let in: the batteries hold fire, the town trades: the black market buys contraband at a
   premium and sells powder and shot cheap, pirate crew for hire (through the crew feature: report the hook), charts to
   treasure (exploration feature if it has a hook). Customs at the home harbour care what you bring back (the customs
   feature already inspects: make sure contraband bought here is flagged).
5. World map: the island appears as "?" until discovered, then named; the batteries' reach drawn when discovered.
6. Tests: battery fire decisions (range, flag, platform broken), alarm state machine, claim / restock timeline, black
   market prices and standing gate, world-extent / clearance checks. Vite build check as in COMMON.md.
