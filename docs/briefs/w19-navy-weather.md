# Wave 19B: a navy and weather at sea

Read COMMON.md, w19-common.md, then src/features/naval/** (Naval.js public API: spawn, ships, launchFrom, igniteShip, Brains,
Routes (CALM, PATROLS, SAFE_ZONES), ShipClasses (sloop, trawler, brigantine, launch), Sections, Fire, Flood), src/features/
pirates/** (notoriety, retaliation, bounties, the stronghold), src/features/hijack (wanted hulls, laundering), src/features/
customs (contraband), src/features/trade (rivals' convoys), src/features/weather/** (today's weather states, wind, rain,
storms), src/ocean/** (read only: wave heights from weather), src/features/seaplane (read only: flight in wind),
src/features/netsync/NavalLink.js (read only: the host runs AI ships).

Owned files: src/features/navy/** (new feature 'navy'), src/features/weather/**, src/features/naval/Brains.js + Routes.js +
ShipClasses.js (additive: navy classes and states), test/feature-navy.mjs (new), test/feature-weather*.mjs (additive). Report
install / Features.js / naval Naval.js / HudPanels patches. Worker 19C owns crew; 19D owns AnimDef and the GLBs.

1. The navy: a faction at Tidemark (a naval jetty, a frigate class: two gun decks, slower to turn, heavy hull; cutters for
   patrol) that patrols the trade lanes, escorts the rival convoys, hunts pirates (fights them: AI vs AI broadsides through
   naval's existing combat) and hunts the player when wanted (hijack's wanted hull, notoriety, customs offences): hails
   first ("Heave to!" toast), boards or fires if you run; sinks or chases off pirates you can watch or join; pays navy
   bounties at Tidemark's harbourmaster (a board notice kind). Navy standing (+ for pirates sunk, - for crimes) gates the
   naval jetty's chandler (better cannon, chain shot cheaper). Keep the calm radius (no fights inside it).
2. Sea events: a convoy attacked by pirates on the horizon (help for a reward), a navy press gang at port when standing is
   low (comic: they "invite" you to sign on: refuse costs a fine), a man overboard to rescue (ties to the rescue feature's
   castaway).
3. Weather at sea: storm fronts that move across the map (a front line visible as a dark cloud bank and rain curtain from
   afar), squalls with gusts that heel boats and push planes, waves that grow under the front (the ocean's wave inputs:
   report a patch if the ocean reads weather through a file you do not own), lightning with thunder delay by distance,
   waterspouts rarely, calm after; the forecast at the harbourmaster and on the plane's radio. Phones: the same logic,
   cheaper visuals.
4. Multiplayer: the host runs the navy like the other AI ships (NavalLink), weather fronts are seeded from the universe
   clock so every client agrees.
5. Tests: patrol / escort / hunt states, the hail-then-fire sequence, AI vs AI battles resolve, bounties, standing gates,
   fronts move deterministically, gust forces bounded, lightning timing. Report under 300 words.
