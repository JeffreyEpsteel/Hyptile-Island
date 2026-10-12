# Quest chains, dialogue trees, NPC memory, consequences

Owned files: src/features/notices/**, src/game/Contracts.js, src/features/story/** (Memory.js, StoryData.js exist, ~800 lines),
test/feature-story.mjs. Read src/features/notices/*, src/game/Contracts.js, Progression.js, CaptainRoid.js (root-owned),
src/audio/RoidVoice.js, src/world/residents/* (the harbour worker owns Residents.js/residents/*; they expose
harbour.openService( id ) / harbour.services() for your dialogue to open tavern/crafting services) and GameState.js.
Fish ids from the fish worker: 'silverminnow', 'rootfin', 'lanterncarp', 'upsidedowneel', 'glassperch', 'crookedcod'.

1. Mine D:\fishing game\UpsideDownFishing (TASKS.md, Content/Config data, Source/**/*Quest*, *Dialogue*, *Port*,
   *Reputation*), the naval fork (quests, Roid lines, notices, reports/**) and D:\fishing game\knowledge. Port the quest
   chains (e.g. Pons minnows), port dialogue, reputation gating, discovery XP.
2. A data-driven quest engine: chains of steps driven by the event bus (fishCaught with species/habitat/weight, fishSold,
   cargoSold, portVisited, shipSunk, bountyClaimed, propDestroyed, planeLanded, enemyDefeated, noticeCompleted, denRaided,
   customsInspected ...), rewards (money, xp, per-port rep, character unlocks via features.emit( 'rewardUnlock',
   { character } ), items), 30+ mini-quests across home, Pons, Gull Rock, Saltmarsh Key, new ports (WORLD.ports
   dynamically) and the open sea; existing quest-unlock characters still reachable. Journal (J) shows chains.
3. Dialogue.js: nodes, choices, conditions on state/memory, effects; a panel in the menu style for residents and quest
   givers via features.interactable; story.roidTopics() for Roid's Talk tab (report the HudPanels patch).
4. NPC memory per NPC in toJSON/fromJSON (met, talked, gifts, purchases, debts, rescues, last seen day) used by conditions.
5. Consequences: per-port reputation shifts; gates some quests; story.priceMod( portId ) (trade reads it).
Report root patches (install.js MODULES entry for story).
