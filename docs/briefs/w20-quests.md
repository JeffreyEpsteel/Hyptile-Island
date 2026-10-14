# Wave 20C: quests and balance that use the new systems

Read w20-common.md, then src/features/story/** (story quests, steps, postings), src/features/notices/** (the boards, kinds,
bounties), src/features/quests* if any, src/features/trade/** (economy, Operating wages, HaulContracts), src/features/
economy or market code, src/features/crew/** (Life.js: traits, morale, tavern hands), src/features/navy/** (standing,
bounties, sea events), src/features/hijack, src/features/pirates, src/world/interiors/** (rooms, keepers, seats),
src/features/harbour/** (tavern rumours, dice), test/feature-quests-w13.mjs + w16.

Owned: src/features/story/**, src/features/notices/NoticeData.js (new kinds and story postings), new quest data files you
create under src/features/story/, test/feature-quests-w20.mjs (new), test/feature-balance.mjs (new). Report patches to
crew / navy / harbour / trade / interiors (hooks only, exact anchors).

1. A quest line per new system, 3-5 steps each, voiced by the people already there: the navy's lieutenant at the naval
   jetty (escort a convoy, hunt a named pirate, deliver dispatches by seaplane, a court-martial choice: hand over a
   deserter or help him slip away: affects navy standing and pirate notoriety); the Tide & Tankard keeper (find a crew
   member gone missing after a dice night, a tavern brawl inside the interior, a storm-night smuggling run past the
   cutters); a sailor for hire with a past (a crew personal quest that unlocks a trait or skill cap); the storm chaser
   (photograph / survive a waterspout, a lightning strike near the plane: weather fronts).
2. Rumours in the tavern point to them; the notice boards post their follow-ups; quest pins on the maps.
3. Balance pass: earnings per hour by activity (fishing, trade runs, bounties, navy bounties, hijack fencing, haul
   contracts) at early / mid / late game; wages (crew + tavern hands) vs income; prices of the 18D weapons and the navy
   chandler; flag outliers and tune constants you own, report patches for the others. Write the table into
   docs/briefs/w20-balance-table.md (new, yours).
4. Tests: each quest line completes in a scripted run, choices branch, saves round-trip mid-quest, the balance table's
   invariants (no activity > 3x the median, wages < 40% of a mid-game income).
