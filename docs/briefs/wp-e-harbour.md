# WP-E: harbour life, tavern, crafting (docs/UNREAL_PARITY.md rows Q9, Q10, Q11, A5)

Owned files: src/world/Residents.js, src/world/residents/** (incl. ResidentData.js), src/features/harbour/** (Schedules.js, Roles.js,
Tavern.js, Dice.js, index.js), src/features/crafting/**, test/residents*.mjs, test/feature-harbour.mjs. (Nothing new existed when
the previous worker was cut off.) Do NOT build a dialogue system (the story worker owns it): expose harbour.openService( id )
and harbour.services() so story's dialogue can open your tavern/crafting; read features.get( 'story' )?.memory?.* for NPC
memory if present. Trade goods via src/features/trade's public API (WP-A worker owns it). Avatar clips from
src/game/Characters.js as they are.

Cover: resident schedules by the island clock (work, eat, tavern, sleep; they walk between places, go indoors at night),
the Unreal seven roles and craft loops, population scaled by port size (home, Pons, WORLD.ports dynamically), residents
remembering the player via story memory; a tavern near the home harbour (food/drink buffs, rumours pointing at fishing
spots or bounties) with the Unreal no-wager dice game (small panel in the menu style); a crafting service at a craft NPC
(recipes over fish and trade goods -> bait, lures, repair kits, rope; existing inventory/gear APIs; persisted); a tavern
ambience bed and crowd murmur in the existing audio style. Residents beyond the animate radius stay cheap.
Report root patches (install.js MODULES entries, Game hooks).
