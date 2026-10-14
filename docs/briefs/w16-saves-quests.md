# Wave 16D: nothing is lost between sessions or between players; three more quest lines

Read docs/briefs/COMMON.md first, then src/game/GameState.js + src/ui/SaveManager.js + test/save-vault.mjs (how a save is
made, the vault, migrations), src/features/Features.js (toJSON / fromJSON of every feature: the registry gathers them:
read how), src/features/netsync/** + server/universe.mjs (what a universe keeps per captain: the profile is the
GameState JSON: does it carry every feature's toJSON? check: hijack vessel / left boats, rescue job, trade warehouse /
insurance / licences, crew posts, seaplane fleet with stolen, story chains, agents), src/features/story/** (the quest
engine and the seven wave 13 lines: StoryData.W13_CHAINS, Rules), src/features/hijack + rescue + trade + agents (the
events they emit: see the Features.js header), src/features/notices (board postings through the story).

Owned files: test/save-roundtrip.mjs (new), test/feature-quests-w16.mjs (new), src/features/story/StoryData.js +
Rules.js + Story.js (additive), src/features/notices/NoticeData.js (additive), server/universe.mjs (only if a profile
field is dropped: additive), test/universe.mjs (additive). Report Game.js / HudPanels / feature patches under 200 words.

1. A save round-trip test over a scripted session: start a sandbox and a campaign, run a script that touches every
   feature (buy a boat at an agent, hijack a merchant, fire a flare and get rescued, buy insurance and store crates in
   the warehouse, post a gunner, take out the Kestrel, start three quests, break a prop, claim a den), save, reload
   into a fresh app, and compare the state feature by feature (deep-equal of each toJSON after a reload); fix every
   field that does not survive (report the patch if the file is not yours). Then the same through a universe profile
   (server/universe.mjs sanitize / clamp: nothing new may be dropped or clamped wrongly: the anti-cheat money rate must
   allow a hijacked cargo sale and a quest payout).
2. Three quest lines in the wave 13 style (data, the existing engine, rewards once, journal lines, board notices):
   "Mayday" (the Tidemark harbourmaster): buy flares, fire one when adrift, ride the launch to the dock, then answer
   another captain's flare (a scripted NPC flare event at sea: rescue a castaway resident, a new `castawayRescued`
   event you emit from the story's own spawn: no rescue-feature change); reward: the launch comes free for a week.
   "Letters of marque" (the harbourmaster, after Rumours from Blackwater): cripple and take a pirate ship, sell her at
   the yard (hj.stolenQuote / sellStolen or the repaint), then hunt a named pirate captain (the pirates' bounty system);
   reward: a letter that makes taking pirate ships legal (no wanted state for pirate hulls).
   "The salt road" (Ethena / the trade guild): run the board's best route three times with a profit, buy a licence,
   deliver a bulk lot to Tidemark's warehouse; reward: the guild's discount on dues.
3. Tests: round-trip per feature, universe profile keeps the fields, each quest's steps on the exact events, rewards
   once, notices in the right ports. Existing story / notices / universe / save tests green. Vite build check. No
   browsers. Report under 250 words.
