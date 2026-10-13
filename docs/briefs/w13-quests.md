# Wave 13B: quest lines that tie the new content together

Read docs/briefs/COMMON.md first, then src/features/story/** (Story.js, StoryData.js, Dialogue.js, Rules.js, Memory.js:
the quest / dialogue engine, how a quest advances on events), src/features/notices/** (the boards, bounties, delivery
contracts), src/game/Game.js (read only: PoorGoat's quests, discoverPort, the journal if any), src/features/Features.js
(events: strongholdDiscovered / Alarm / Claimed, batterySilenced, shipCrippled, planeBailedOut, chuteLanded,
seaplaneUpgraded, crewPosted, practiceEnded, fishCaught, propBroken ...), src/features/pirates/Stronghold.js +
BlackMarket.js, src/game/ports/TidemarkPort.js (the town's vendors), src/features/seaplane/Airframes.js + Panel.js (the
hangars), src/features/crew, src/features/harbour (tavern rumours), src/world/islands/stronghold/Panel.js.

Owned files: src/features/story/**, src/features/notices/NoticeData.js + Sites.js (additive), test/feature-story.mjs,
test/feature-notices.mjs (additive), test/feature-quests-w13.mjs (new). Report Game.js / HudPanels patches under 250 words.

Write the quests as data in StoryData with the existing engine (no new engine unless a rule is missing: then add it in
Rules.js). Each quest: a giver, dialogue lines in the vendors' voice (PoorGoat, Ethena Prosper, Captain Roid, the
Tidemark tavern keeper, the Blackwater black-market dealer), steps that advance on real events, a reward, a journal
line, and a notice on the board where it fits. Keep the sandbox free of gating (sandbox plays everything).
1. "A ferry to Tidemark" (PoorGoat): sail to Tidemark (discoverPort), sell 5 fish at its fish hall, talk to the tavern
   keeper; reward: the Tidemark market cell opens for delivery contracts and the chandler's prices drop 10 % there.
2. "Wings" (Captain Roid, after the ferry): buy or take out the seaplane, land in Tidemark's bay, taxi to the pier;
   reward: the airstrip hangar sells the Kestrel at 20 % off and the hangar lists the engine upgrade.
3. "The long way round" (Tidemark tavern keeper): fly the Kestrel from the airstrip to the home island and back without
   a crash; reward: a livery and the radio upgrade free.
4. "Rumours from Blackwater" (tavern rumours -> the board): scout the cove from the sea without raising the alarm
   (strongholdDiscovered without strongholdAlarm within 2 min), then silence one battery (batterySilenced), then claim
   the island (strongholdClaimed); three steps, three payouts, notoriety consequences from the pirates feature; failing
   the alarm step is allowed (the quest continues).
5. "The black flag" (black-market dealer, needs corsair standing): buy the flag, sell 3 contraband crates at the black
   market, smuggle one past customs at home (customs feature events); reward: cheaper powder at Blackwater, a journal
   entry, merchant standing loss.
6. "Hold the line" (Tidemark harbour master): a timed event the quest arms: a pirate sloop raids Tidemark's bay
   (naval.spawn near the bay with a hostile brain targeting the town's pier props); sink or cripple it before it
   breaks 6 props (destruction propBroken with port 'tidemark'); reward: the town repairs itself at once and the crew
   gunner post fee is waived; the event can recur from the board.
7. "Learn to fight" (Ethena): finish a practice fight (practiceEnded with result 'won') and land a pistol hit on the
   training post; reward: a pouch of cartridges and the parry tip in the journal.
Tests: each quest's steps advance on the exact events, rewards apply once, saves round-trip mid-quest, the board shows
the notices in the right ports. Vite build check as in COMMON.md.
