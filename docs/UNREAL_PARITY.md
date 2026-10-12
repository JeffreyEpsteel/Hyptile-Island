# Unreal parity audit

Audit of 2026-10-12 (read-only). Compares what the Unreal fishing game planned or built against what the browser game has. Statuses come from reading
source headers and grepping the browser tree; nothing was run in a browser. **done** = a module with an integration hook (and usually a test) exists;
it is not proof the feature plays well. **partial**, **missing**, **n/a** (engine-specific or user-rejected), **v3 in progress** (a task in the
`docs/PLAN.md` v3 wave table, which gained the Unreal fish set and islands 5-8 rows while this audit ran; none of the v3 folders existed when checked).
Sizes: S under a day, M a few days, L a week or more (as in `docs/HYPTILE_ISLAND.md`). Unreal items are *planned or built*; many of the fork's rows are only
"partial" there too (its own coverage matrix marks all 29 brief IDs partial and the 60 fps floor failing), so parity means feature presence, not polish.

Path prefixes (all paths are checked to exist):
`U:` = `D:\fishing game\UpsideDownFishing\Source\UpsideDownFishing\` (original), `N:` = same tree in the naval fork (`D:\fishing game\Forks\Fishing_Naval_20261007\UpsideDownFishing\Source\UpsideDownFishing\`, superset of `U:`),
`Ud:` = `D:\fishing game\UpsideDownFishing\` (DESIGN.md, README.md, TASKS.md, Data/*.csv), `Nd:` = `D:\fishing game\Forks\Fishing_Naval_20261007\` (docs/, reports/),
`R:` = `D:\fishing game\reports\`, `B:` = `D:\tidewater-hyptile\`. Brief IDs: `NB` = `Nd:docs/NAVAL_BRIEF.md`, `WTP` = `Nd:docs/WORLD_TRADE_PIRATES_BRIEF.md`.

## Summary

| Status | Rows |
|---|---:|
| done | 43 |
| partial | 36 |
| missing | 18 |
| v3 in progress | 17 |
| n/a (separate table, not counted above) | 3 |

Browser-only v3 tasks with **no Unreal counterpart** (user requests, not parity): seaplane, destructible environment, new starting point and loader art.
Biggest gaps: customs / contraband / credit / hauling (economy), pirate dens and persistent consequences, ship sections / fire / flooding / wrecks / ammo, the
upside-down world scenery and its Easter egg, resident schedules + dialogue + tavern, spyglass and treasure, save preflight / export, gamepad glyphs and rumble.

## 1. Fishing and fish

| ID | Feature | Unreal evidence | Browser | Browser evidence | Gap brief (files; size) |
|---|---|---|---|---|---|
| F1 | Strike / fight minigame with difficulty, failure, cooldown (Unreal: three-strike moving pockets, strain, timeout) | `N:Fishing/FishingComponent.h`; `N:UI/FishingMinigameWidget.h` | v3 in progress (Unreal fish set + marker-timing minigame); today a line-tension fight, losable (snap, escape, hook pulls free) | `B:src/game/CatchMinigame.js`; `B:src/game/Game.js` | v3 |
| F2 | Fish eligibility by period, region, equipment, rarity weight | `N:Data/FishDataAsset.h`; `Ud:Data/Fish.csv` | done | `B:src/game/FishTable.js`; `B:src/game/Bites.js`; `B:src/features/weather/Climate.js` | none |
| F3 | Unreal fish set: Silver Minnow, Rootfin, Lantern Carp, Upside-Down Eel, Glass Perch, Crooked Cod (size, XP, cargo footprint) | `Ud:Data/Fish.csv`; `Ud:DESIGN.md` | v3 in progress (Unreal fish set); today 18 real species | `B:src/game/FishTable.js` | v3 |
| F4 | Catch card, size and value spread, records, full hold leaves the catch uncollected | `N:Fishing/FishingComponent.h` | done | `B:src/game/CatchDisplay.js`; `B:src/game/GameState.js` | none |
| F5 | Rectangular cargo grid: place, move, rotate, reject overlap, serialised | `N:Inventory/GridInventoryComponent.h`; `N:UI/CargoGridWidget.h` | partial: drag view over the weight hold; no rotate, no overlap rejection, layout kept in localStorage | `B:src/game/GameHUD.js` | S: R rotate, overlap check, layout into the save. GameHUD.js is a shared root file: not packaged |
| F6 | Upgrade gating by quest, level, reputation, price; Reinforced Fishing Line | `N:Data/UpgradeDataAsset.h`; `Ud:Data/Upgrades.csv` | partial: eight gear tracks bought with money only | `B:src/game/Gear.js`; `B:src/game/Chandlery.js` | S WP-A: level / reputation gates in Gear.js |
| F7 | Line-tension creak, thwack on strike versus thud on miss | `N:Audio/FishingAudioSubsystem.h` | done | `B:src/features/sfx/FishingSfx.js`; `B:test/feature-sfx.mjs` | none |
| F8 | Life cues: gulls scatter or follow on cast, strike, miss; fish shadows ripple on strike | `N:Fishing/FishingLifeCue.h`; `N:World/MarineLifePatch.h` | partial: kelp, bait schools, dolphins, whale, ambient gulls; gulls ignore casting | `B:src/features/dressing/Marine.js`; `B:src/world/Gulls.js` | S/M WP-D: `src/features/life/GullCues.js` listening to game events |
| F9 | Cast splash and ripple ring, catch burst distinct from miss | `N:Fishing/FishingActivityEffects.h` | partial: splash audio, spray, camera kicks | `B:src/game/Game.js`; `B:src/fx/Spray.js` | S: ask the v3 VFX owner whether "splashes" includes it; else WP-D `life/` |
| F10 | Dawn / day / dusk / night clock, night-only fish, period events | `N:Time/WorldTimeSubsystem.h` | done | `B:src/App.js`; `B:src/game/FishTable.js` | none |
| F11 | Rod in hand: cast, hold, reel, strike, celebrate clips | `N:Character/HyptileCharacter.h` | done | `B:src/player/Avatar.js`; `B:src/game/FishingRod.js` | none |

## 2. Characters, animation, IK

| ID | Feature | Unreal evidence | Browser | Browser evidence | Gap brief (files; size) |
|---|---|---|---|---|---|
| C1 | Roster of Hyptile-family characters (Unreal also has a native Manny comparison model) | `N:Character/HyptileCharacter.h`; `N:Character/MannequinComparison.h` | done: 8 characters, 49 clips; Manny is n/a (UE mannequin) | `B:src/game/Characters.js`; `B:public/models/roster` | none |
| C2 | Blink and gaze morphs, conversation look-at | `N:Character/HyptileEyeComponent.h` | done: six morphs kept by the roster converter (Roid has none, as in Unreal) | `B:tools/roster/convert-character.py`; `B:test/feature-eyes.mjs` | none |
| C3 | Ragdoll knockdown and recovery | `N:Editor/HyptilePhysicsAuthoring.h` | done: verlet chain; get-up plays Knockdown reversed | `B:src/player/Avatar.js` | polish only |
| C4 | Foot IK, hand IK (rod, wheel, cannon), helm hand contact | `N:Character/HyptileHandContact.h`; `N:Character/HyptileFootstepEffects.h` | v3 in progress (IK) | none yet | v3 |
| C5 | Transition blending, seat family, rowing / paddling clips | `N:Character/HyptileTransitionAnimInstance.h` | partial: seat, row, paddle, helm clips and upper-body rod layer exist; speed blend, turn-in-place, idle variety (PLAN section 5.3) unverified | `B:src/player/Avatar.js`; `B:src/game/Characters.js` | S/M after v3 IK lands (Avatar.js is IK-owned): not packaged |
| C6 | Walk / run toggle, sprint stamina, swim, jump | `Ud:README.md` | done | `B:src/player/Player.js` | none |
| C7 | Player melee with fishing tools, block, dodge, stamina | `Ud:README.md`; `N:Character/HyptileMeleeAudio.h` | done | `B:src/features/melee/index.js`; `B:test/feature-melee.mjs` | none |
| C8 | Emote key (K) and appearance switch (V) | `Ud:README.md` | partial: roster panel only; wave / dance clips exist, no emote key | `B:src/game/GameHUD.js`; `B:src/game/Characters.js` | S: unassigned (touches shared Game.js) |

## 3. NPCs, quests, dialogue

| ID | Feature | Unreal evidence | Browser | Browser evidence | Gap brief (files; size) |
|---|---|---|---|---|---|
| Q1 | Data-driven quest chain, rewards once, unlocks (Pons minnows) | `N:Quests/QuestSubsystem.h`; `Ud:Data/Quests.csv` | done: PoorGoat's story quests unlock characters, rolling orders | `B:src/game/Contracts.js`; `B:test/contracts.mjs` | none |
| Q2 | 30+ mini-quests over 12 objective families (Catch, Deliver, Trade, Escort, Investigate, BountyHunt, BoardAction, Discover, Craft, Wait, Reputation, Survive) | `N:Data/PlayerQuestCatalogDataAsset.h`; `N:World/PlayerQuestStateComponent.h` | v3 in progress (quests / NPC memory); browser has nine notice types | `B:src/features/notices/NoticeData.js` | v3 |
| Q3 | Notice boards: daily postings, expiry timers, standing | `N:UI/WorldNoticeBoardWidget.h` | done | `B:src/features/notices/Notices.js`; `B:src/features/notices/NoticeUI.js` | none |
| Q4 | Bounty hunting: five tiers, search zones, informants, capture proof, failure states, rival hunters | `Nd:docs/WORLD_TRADE_PIRATES_BRIEF.md`; `N:Data/PirateRuntimeStateTypes.h` | partial: three tiers, captain ship spawn, sink or capture x1.5, expiry, beaten | `B:src/features/notices/NoticeData.js`; `B:src/features/boarding/Boarding.js` | M WP-B: tiers 4-5, search zones, patrol-sourced bounties |
| Q5 | NPC memory and consequences (greetings, witnesses, refusals) | `N:World/ResidentMemoryPresentation.h`; `Nd:docs/SAVE_FORMAT.md` | v3 in progress; today board keepers remember abandoned types, Roid has a met flag | `B:src/features/notices/Notices.js` | v3 |
| Q6 | Dialogue with quest-state conditions and actions (AcceptQuest, Advance, TurnIn, OpenService) | `N:UI/DialogueWidget.h`; `N:Data/DialogueNodeRow.h`; `Ud:Data/Dialogue.csv` | missing: vendor panels, resident line lists, Roid's five fixed topics | `B:src/audio/Clicks.js`; `B:src/world/residents/ResidentData.js` | M WP-E: `src/features/dialogue/` (node data, runner, panel); consumes story/ state when present |
| Q7 | Captain Roid: click speech, subtitles, first and repeat encounter | `N:Character/CaptainRoidCharacter.h`; `Nd:docs/CAPTAIN_ROID_BRIEF.md` | done (also sells boats) | `B:src/game/CaptainRoid.js`; `B:src/audio/RoidVoice.js`; `B:test/roid.mjs` | none |
| Q8 | Named residents with gestures, patrols, look-at, clown prank | `Ud:README.md` | done: 10 residents | `B:src/world/Residents.js`; `B:test/residents.mjs` | none |
| Q9 | Resident schedules by clock, seven roles, craft loops, population by port size, memory of the player | `N:World/HarbourLifeActor.h`; `N:World/HarbourCargoWorkComponent.h`; `Nd:docs/WORLD_TRADE_PIRATES_BRIEF.md` | missing: residents idle or patrol around the clock | `B:src/world/residents/ResidentData.js` | M/L WP-E: schedules and roles in `ResidentData.js`, `src/features/harbour/` |
| Q10 | Tavern service and no-wager dice game | `N:UI/TavernDiceFaceWidget.h`; `N:Boat/BoatServiceComponent.h` | missing | none | S/M WP-E: `src/features/harbour/Tavern.js`, `Dice.js` |
| Q11 | World crafting service (recipes at a craft NPC) | `N:World/WorldCraftingServiceComponent.h`; `N:Data/WorldCraftingRecipesDataAsset.h` | missing | none | M WP-E: `src/features/crafting/` (recipes over trade goods) |
| Q12 | Escort quests (walk an NPC home) | `N:World/WorldEscortComponent.h` | v3 in progress (quest families) | none | v3 |

## 4. Economy, ports, progression

| ID | Feature | Unreal evidence | Browser | Browser evidence | Gap brief (files; size) |
|---|---|---|---|---|---|
| E1 | Sell fish at ports, price by weight | `N:UI/PortMenuWidget.h` | done | `B:src/game/Vendor.js`; `B:src/game/FishStand.js` | none |
| E2 | General trade goods: categories, mass, perish rate, legality, tags, origin / demand regions | `N:Data/TradeGoodDataAsset.h`; `N:Trade/TradeCargoComponent.h` | partial: 8 goods with crates, spoilage; no categories, legality, tags | `B:src/features/trade/goods.js` | M WP-A: extend `goods.js` to 12+ non-fish goods (as Unreal) with category and `legal` |
| E3 | Regional supply / demand markets (Demand/Supply^elasticity), price chart, ledger | `N:Trade/TradeMarketComponent.h`; `N:UI/TradeMarketComparisonWidget.h` | partial: log-price market with sparkline, ledger; two ports only | `B:src/features/trade/market.js`; `B:src/features/trade/ledger.js` | S WP-A: add Gull Rock, Saltmarsh Key (and v3 islands) as markets |
| E4 | Market events from world causes (storm closes a shoal, smuggler dies, festival, rival undercuts) | `N:Data/MarketEventCatalogDataAsset.h`; `N:Trade/MarketEventComponent.h` | partial: timed random events, no causal hooks | `B:src/features/trade/goods.js`; `B:src/features/trade/index.js` | S WP-A: react to `shipSunk`, `weatherChanged` |
| E5 | Hauling contracts and merchant licence | `N:Trade/TradeContractComponent.h`; `N:Data/TradeContractTypes.h` | missing | none | M WP-A: `src/features/trade/HaulContracts.js` |
| E6 | Merchant credit and debt per port | `N:Trade/MerchantCreditComponent.h`; `N:Data/MerchantCreditTypes.h` | missing | none | M WP-A: `src/features/trade/Credit.js` |
| E7 | Rival merchants whose voyages move port stock | `N:Trade/RivalMerchantComponent.h`; `N:Data/RivalMerchantTypes.h` | partial: AI trawlers sail Home to Pons but move no stock | `B:src/features/naval/Routes.js` | M WP-A: `src/features/trade/Rivals.js` reading naval ships by events |
| E8 | Smuggler trade, contraband, customs inspection, guard justice | `N:Trade/SmugglerTradeComponent.h`; `N:World/HarbourInspectionComponent.h`; `N:World/HarbourJusticeComponent.h` | missing | none | L WP-A: `src/features/customs/` and `trade/Smuggler.js` |
| E9 | Operating costs: fuel, bait, repairs, ammo, crew wages | `N:Trade/BoatOperatingCostsComponent.h`; `N:Trade/CrewPayrollComponent.h` | partial: diesel and hull repair exist; no bait, ammo, wages | `B:src/game/Gear.js`; `B:src/features/naval/Naval.js` | M WP-A: bait and wages (`trade/Operating.js`); ammo is WP-C |
| E10 | XP, levels, ranks, port reputation, discovery XP once per port | `N:Progression/ExperienceComponent.h`; `N:Progression/PortReputationComponent.h` | done | `B:src/game/Progression.js`; `B:test/progression.mjs` | none |
| E11 | Reputation axes MerchantStanding / CorsairStanding with trade tension | `Nd:docs/WORLD_TRADE_PIRATES_BRIEF.md` (B4) | partial: per-port rep and board standing only | `B:src/game/Progression.js`; `B:src/features/notices/NoticeData.js` | S/M: merchant axis in WP-A (credit and rates), corsair axis in WP-B; consequences of rep are v3 |
| E12 | Boat purchase, fleet ownership, boat yard | `N:Boat/BoatFleetComponent.h` | done: five hulls, trade-in, Captain Roid's yard | `B:src/game/Boats.js`; `B:src/game/BoatYard.js` | none |
| E13 | Boat modules in eight slots with tiers, visible mesh change, stat preview | `N:Boat/BoatModuleComponent.h`; `N:Data/BoatModuleTypes.h` | v3 in progress (ship modules); `Gear.js` covers fishing / propulsion / cargo | `B:src/game/Gear.js` | v3 |
| E14 | Boat services: refuel, repair | `N:Boat/BoatServiceComponent.h` | done | `B:src/game/Chandlery.js`; `B:src/features/naval/Naval.js` | none |

## 5. Naval combat and pirates

| ID | Feature | Unreal evidence | Browser | Browser evidence | Gap brief (files; size) |
|---|---|---|---|---|---|
| V1 | Ship-class hulls: trawler, sloop, brigantine; boardable, multi-deck, gun stations | `N:Boat/FishingBoatPawn.h`; `N:Naval/ShipDeckClearance.h` | done | `B:src/features/naval/ShipClasses.js`; `B:src/world/boat/ShipDecks.js` | none |
| V2 | Broadside cannons: mounts, traverse, reload, ballistic arc, lead aim | `N:Naval/ShipCannonComponent.h`; `N:Naval/NavalCannonball.h` | done (no wind drift or material falloff) | `B:src/features/naval/Ballistics.js`; `B:src/features/naval/Projectiles.js` | none |
| V3 | Ammunition as a finite cargo item | `N:Data/TradeTypes.h` (naval supplies) | missing: guns never run dry | none | S/M WP-C: `src/features/shipdamage/Ammo.js` plus powder / shot goods in WP-A |
| V4 | Per-section damage: hull, rigging, sails, rudder; function loss | `N:Naval/ShipDamageComponent.h`; `N:Naval/ShipDamageTypes.h` | partial: hull and rigging only | `B:src/features/naval/Ship.js` | M WP-C: `src/features/shipdamage/Sections.js` (rudder, sails) |
| V5 | Fire spread, extinguish by bucket, progressive flooding | `N:Naval/ShipFirefightingComponent.h` | missing | none | L WP-C: `Fire.js`, `Flood.js`, bucket interactable |
| V6 | Sinking then persistent wreck, salvage | `N:Naval/WreckSalvageComponent.h`; `N:Naval/WreckSalvageAnchor.h` | partial: 8 s sinking and floating loot crates, no wreck | `B:src/features/naval/Ship.js`; `B:src/features/naval/Loot.js` | M WP-C: `Wrecks.js` |
| V7 | AI vessel states: patrol, detect, pursue, flee, broadside, close to board, regroup | `N:Naval/PirateVesselPawn.h` | partial: patrol, chase, broadside, flee; merchants sail, dock, flee | `B:src/features/naval/Brains.js` | M WP-B: close-to-board and regroup as external states (Brains ignore unknown states) |
| V8 | 16 named pirate identities, 12-20 active vessels, 64 crew | `N:World/PiratePopulationComponent.h`; `N:Data/PirateRouteCatalogDataAsset.h` | partial: 10 captain / ship names, MAX_SHIPS 8, ambient spawns | `B:src/features/naval/Naval.js`; `B:src/features/naval/ShipClasses.js` | M WP-B: `src/features/pirates/Roster.js` calling `naval.spawn` |
| V9 | Pirate dens and camps with moorings, loot, retaliation | `N:World/PirateDenComponent.h`; `N:Naval/PirateDenLootComponent.h`; `N:Naval/PirateRetaliationComponent.h` | missing: only a shore raider camp | `B:src/features/melee/MeleeData.js` | L WP-B: `Dens.js`, `Retaliation.js` (needs v3 islands 5-8 for sites) |
| V10 | Persistent world state: a corsair killed stays dead, bounties, expiries, discoveries | `N:World/FishingWorldStateComponent.h`; `N:Data/FishingWorldStateTypes.h` | partial: only the player's hull, gun, stats and prisoners are saved; pirates respawn | `B:src/features/naval/Naval.js` | M WP-B: `Ledger.js` (kills, notoriety) saved through the feature registry; universe persistence is v3 |
| V11 | Boarding: cross, fight crew on deck, capture, plunder, ransom | `N:Naval/PirateBoardingComponent.h`; `N:Naval/PirateCaptureComponent.h`; `N:Naval/PirateRansomComponent.h` | done (simplified: fade plank, 2-3 crew, ransom at harbour rail) | `B:src/features/boarding/Boarding.js`; `B:test/feature-boarding.mjs` | none |
| V12 | Hostile boarding: pirates board the player's ship; repel or ransom | `Nd:docs/WORLD_TRADE_PIRATES_BRIEF.md` (D5) | missing | none | M WP-B: `src/features/boarding/Hostile.js` |
| V13 | Ship handling: turn inertia, wind-driven sail power, heel | `N:Naval/ShipHandling.h` | partial: AI ship accel / turn limits, player hull mass and thrust; no sail-wind coupling | `B:src/player/BoatController.js`; `B:src/features/naval/Ship.js` | M WP-C: `src/player/SailModel.js`, `sailData.js` |
| V14 | Crew helm: heading hold, faster reload, paid crew | `N:Naval/ShipCrewHelmComponent.h`; `N:Trade/CrewPayrollComponent.h` | v3 in progress (ship modules, Crew slot); wages are E9 | none | v3 |
| V15 | Combat feedback: muzzle flash, splinters, plumes, smoke, sinking groan | `N:Editor/ShipDamageFxAuthoring.h`; `Nd:docs/NAVAL_BRIEF.md` (C6) | partial: muzzle, plume, splinter, smoke pools and audio exist; v3 VFX in progress | `B:src/features/naval/Effects.js`; `B:src/features/naval/NavalAudio.js` | v3 (VFX) |
| V16 | Naval HUD: hull, reload, offscreen arrows, hit markers, damage wedge | `N:UI/NavalStatusWidget.h`; `N:UI/DamageDirectionWidget.h` | partial: hull bar, reload, arrows, hit marker, wedge; no section health, ammo, heading, wind | `B:src/features/naval/Hud.js`; `B:src/features/weather/WeatherHUD.js` | S in WP-C (section / ammo rows, as a second HUD strip) and WP-D heading ribbon |
| V17 | Player-versus-player naval combat and boarding | `Nd:docs/NAVAL_BRIEF.md` (C1) | missing; ships are shared through the room host only | `B:src/features/netsync/NavalLink.js` | L: after v3 persistent universe; not packaged |
| V18 | Notoriety indicator and wanted pressure | `Nd:docs/WORLD_TRADE_PIRATES_BRIEF.md` (E) | missing | none | S WP-B: `Notoriety.js` HUD pip |

## 6. World, weather, night, identity

| ID | Feature | Unreal evidence | Browser | Browser evidence | Gap brief (files; size) |
|---|---|---|---|---|---|
| W1 | Ocean: waves, depth colour, shore foam, underwater volume, wake, splash rings | `N:Water/FishingOceanPresentation.h`; `N:Water/FishingWaterInteractions.h` | done (Tidewater's FFT ocean) | `B:src/ocean/OceanFFT.js`; `B:src/post/Underwater.js`; `B:src/ocean/WakeSim.js` | none |
| W2 | Weather: six states coupling wind, clouds, waves, rain, audio | `N:World/FishingWeatherSubsystem.h`; `N:World/FishingWeatherDirector.h` | done | `B:src/features/weather/index.js`; `B:test/feature-weather.mjs` | none |
| W3 | Weather changes sail power and fishing difficulty | `Nd:docs/WORLD_TRADE_PIRATES_BRIEF.md` (A2) | partial: bite modifier and storm pirates; no sail coupling | `B:src/features/weather/Climate.js` | covered by V13 (WP-C) |
| W4 | Sky: stars, moon, dusk and night fog and grading | `N:World/NightSkyPresentation.h`; `N:Time/WorldLightingController.h` | done | `B:src/sky/Sky.js`; `B:src/App.js` | none |
| W5 | Night identity: moonlight readability, lamp pools, flicker, ship lanterns, window silhouettes, bioluminescence, lighthouse beam | `Nd:docs/NAVAL_BRIEF.md` (A5); `N:World/NightSkyPresentation.h` | v3 in progress (night); today lamps, lit windows, ship nav lights exist | `B:src/materials/LocalLights.js`; `B:src/world/islands/GullRock.js` | v3 |
| W6 | Harbour dressing: coils, nets, bunting, stalls, boards, laundry, puddles, footprints | `N:World/HarbourWindDetailComponent.h`; `Nd:docs/WORLD_TRADE_PIRATES_BRIEF.md` (A4) | partial: coils, nets, bunting, bowls, trays, stalls, boards; no laundry, puddles, footprints | `B:src/features/dressing/Harbour.js` | S WP-D: `src/features/life/Decals.js`, laundry sway |
| W7 | Island ground scenery families (meadow, grove, pine outcrop, rocky shelf) | `N:World/IslandSceneryComponent.h` | done | `B:src/world/vegetation/Scatter.js`; `B:src/world/Vegetation.js` | none |
| W8 | Marine life: kelp, schools, dolphins, whale | `N:World/MarineLifePatch.h` | done | `B:src/features/dressing/Marine.js`; `B:src/world/marine/Whale.js` | none |
| W9 | Shore wildlife: birds, crabs, critters | `Nd:docs/WORLD_TRADE_PIRATES_BRIEF.md` (A3) | done | `B:src/world/wildlife/Wildlife.js`; `B:src/world/Gulls.js` | none |
| W10 | Fireflies, chimney smoke with fog glow, sail flap | `Nd:docs/NAVAL_BRIEF.md` (A4) | missing | none | S/M WP-D: `src/features/life/Fireflies.js`, `Chimneys.js` (not in v3 VFX or night rows) |
| W11 | Eight saved island landings with docks, ports, discovery; two host pirate camps (Copper Cove, Reed Hideaway) | `N:World/IslandLanding.h`; `Ud:Data/Ports.csv`; `Ud:TASKS.md` | v3 in progress (islands 5-8); done for four: Home, Pons Cove, Gull Rock, Saltmarsh Key | `B:src/world/WorldLayout.js`; `B:src/game/ports/Ports.js` | v3 |
| W12 | Inverted Isles: suspended landmass, hanging roots, upward waterfalls as playable islands | `Ud:DESIGN.md`; `R:game-audit-2026-10-04.html` | v3 in progress (islands 5-8 incl. the Inverted Isles) | none yet | v3 |
| W13 | Treasure caches: finite loot, discovery, once-only claim | `N:World/TreasureCacheComponent.h`; `N:UI/TreasureLootWidget.h` | missing | none | M WP-D: `src/features/exploration/Treasure.js` |
| W14 | World chart / map screen with ports, shoals, dens, contracts, wind | `N:UI/WorldChartWidget.h` | v3 in progress (world map); only the round minimap exists | `B:src/game/Minimap.js` | v3 |
| W15 | Spyglass: zoom, identify ships, ports, wrecks | `N:Navigation/SpyglassComponent.h`; `N:UI/SpyglassWidget.h` | missing (v3 modules add a Navigation tier, not the optic) | none | M WP-D: `src/features/exploration/Spyglass.js` |
| W16 | Compass and heading at sea | `Nd:docs/NAVAL_BRIEF.md` (B4) | partial: minimap rotates with view, compass card in photo mode only | `B:src/game/Minimap.js`; `B:src/ui/UI.js` | S WP-D: `src/features/exploration/HeadingRibbon.js` |
| W17 | World-wide inverted layer: suspended islets and hanging roots overhead, inverted horizon silhouettes, a landmark visible from both ports, the dark void, yellow Easter-egg preset with a trigger | `Ud:DESIGN.md`; `R:game-audit-2026-10-04.html` | missing | none | M WP-D: `src/features/inverted/` (opt-in; sky tint via existing fog and haze settings; reads the Inverted Isles look from v3) |

## 7. Audio

| ID | Feature | Unreal evidence | Browser | Browser evidence | Gap brief (files; size) |
|---|---|---|---|---|---|
| A1 | Layered ocean, surf, wind, gulls, ambience | `N:Audio/FishingAudioSubsystem.h` | done | `B:src/audio/SoundScape.js` | none |
| A2 | Footsteps by surface (sand, timber, stone, grass, planking) | `N:Character/HyptileFootstepEffects.h` | done: six step sets | `B:public/audio/step_wood.ogg`; `B:src/audio/SoundScape.js` | none |
| A3 | Ship ambience: rigging, hull creak, luffing, reload, splinters | `N:Boat/FishingBoatAudio.h` | done | `B:src/features/sfx/ShipSfx.js` | none |
| A4 | Rain by surface (canvas, wood, water), wind louder up the mast | `Nd:docs/WORLD_TRADE_PIRATES_BRIEF.md` (A6) | partial: rain and storm layers; no per-surface rain or mast wind | `B:src/features/weather/WeatherAudio.js` | S WP-D (files: `weather/WeatherAudio.js` only) |
| A5 | Workshop, tavern, resident, clown activity sound | `N:Character/HyptileActivityEffects.h`; `N:World/HarbourAmbience.h` | partial: workshop lines and clown prank line; no tavern or crowd bed | `B:src/features/sfx/FolkSfx.js` | S WP-E (tavern bed with `harbour/Tavern.js`) |
| A6 | Combat audio: cannon, melee voices, whistle, sinking groan | `N:Character/HyptileMeleeAudio.h` | done | `B:src/features/naval/NavalAudio.js`; `B:src/features/melee/CombatAudio.js` | none |
| A7 | Master / music / SFX / ambience sliders | `N:UI/SettingsPanelWidget.h` | done (music gain reserved: nothing plays, as in Unreal) | `B:src/ui/AppUI.js`; `B:src/audio/SoundScape.js` | none |

## 8. UI, input, accessibility, localization

| ID | Feature | Unreal evidence | Browser | Browser evidence | Gap brief (files; size) |
|---|---|---|---|---|---|
| U1 | Illustrated main menu; new / continue; slots; modes | `N:UI/MainMenuWidget.h` | done | `B:src/ui/MainMenu.js`; `B:public/ui/menu` | none |
| U2 | Pause menu: resume, save, load, settings | `N:UI/PauseMenuWidget.h` | done | `B:src/ui/PauseMenu.js` | none |
| U3 | HUD: clock, money, level / XP, location, stamina, radar | `N:UI/UpsideDownHUDWidget.h` | done | `B:src/game/GameHUD.js`; `B:src/game/Minimap.js` | none |
| U4 | Port and vendor panels with service gating | `N:UI/PortMenuWidget.h` | done | `B:src/game/HudPanels.js`; `B:src/game/Vendor.js` | none |
| U5 | Trade window: chart, projected profit, spoilage, legality, contract cards | `N:UI/TradeOfferWidget.h`; `N:UI/TradeContractOfferWidget.h` | partial: chart, profit, spoilage; no legality or contracts | `B:src/features/trade/panel.js` | folded into WP-A |
| U6 | Ransom, cargo loot, den loot, smuggler, craft offer panels | `N:UI/PirateRansomWidget.h`; `N:UI/SmugglerTradeWidget.h`; `N:UI/WorldCraftOfferWidget.h` | partial: ransom hand-over at the harbour rail; plunder automatic | `B:src/features/boarding/BoardingHud.js` | folded into WP-A / WP-B / WP-E |
| U7 | Photo mode | `N:Presentation/PhotoModeComponent.h`; `N:UI/PhotoModeWidget.h` | done (P) | `B:src/ui/UI.js` | none |
| U8 | Persistent controls hints (F1) | `Ud:README.md` | done | `B:src/ui/UI.js` | none |
| U9 | Controller glyphs that swap on device change | `Nd:docs/NAVAL_BRIEF.md` (B4) | missing: prompts print key names; gamepad maps to key codes | `B:src/core/Gamepad.js` | S/M WP-F: `src/ui/Glyphs.js` |
| U10 | Gamepad support and rumble in the feel layer | `Ud:README.md`; `N:Presentation/FishingFeelCameraManager.h` | partial: full mapping, no rumble | `B:src/core/Gamepad.js` | S WP-F: rumble API in `Gamepad.js` |
| U11 | Debug / cheat tools (time, XP, money, fish, teleports, save) | `N:Debug/UpsideDownCheatManager.h`; `Ud:DESIGN.md` | partial: sandbox world controls, debug views, `window.__app` | `B:src/game/GameMode.js`; `B:src/core/DebugViews.js` | S WP-F: `src/ui/DebugPanel.js`, sandbox only |
| U12 | Onboarding, performance overlay, crash reporting | `Nd:docs/NAVAL_BRIEF.md` (D4) | partial: F1 sheet, `?profile`; no error log | `B:src/core/Profiler.js` | S WP-F: `src/core/ErrorLog.js` |
| X1 | Input remapping with conflict detection, deadzone, sensitivity | `N:Input/FishingControlSettings.h`; `N:Input/FishingControlSettingsSubsystem.h` | v3 in progress (accessibility, key remapping) | `B:src/core/Input.js` | v3 |
| X2 | Accessibility: captions, UI scale, colourblind, hold-or-toggle, aim assist, reduced motion | `Nd:docs/NAVAL_BRIEF.md` (D4) | v3 in progress; today reduce-motion and Roid subtitles | `B:src/ui/AppUI.js` | v3 |
| X3 | Localization (String Tables) | `Nd:docs/NAVAL_BRIEF.md` (D4) | v3 in progress (EN / RO) | none yet | v3 |
| X4 | Camera feel: shake, FOV kick, hitstop, pulses; combat feel (recoil, broadside hit, boarding hitstop) | `N:Presentation/FishingFeelCameraManager.h` | partial: cast, strike, catch, snap, sailing FOV, near-miss shake; no recoil or hit kicks | `B:src/game/CameraFeel.js` | S WP-F: new kick types in `CameraFeel.js` |

## 9. Saves, multiplayer, performance

| ID | Feature | Unreal evidence | Browser | Browser evidence | Gap brief (files; size) |
|---|---|---|---|---|---|
| S1 | Versioned save, preflight before mutation, documented migrations | `N:Save/SaveGameSubsystem.h`; `Nd:docs/SAVE_FORMAT.md` | partial: v2 plus v1 fallback; per-field sanitising, no whole-save validation or rollback, no migration doc | `B:src/game/GameState.js` | M WP-F: `src/game/SaveVault.js` (`validateSave`), `docs/SAVE_FORMAT.md` |
| S2 | Save slots, continue, boat and player position restored | `N:Save/UpsideDownSaveGame.h` | done: four slots per mode | `B:src/game/GameState.js`; `B:src/ui/MainMenu.js` | none |
| S3 | Save backup, delete, export | `Nd:docs/NAVAL_BRIEF.md` (D4) | partial: delete only | `B:src/ui/MainMenu.js` | S WP-F: `src/ui/SaveManager.js` |
| S4 | Feature data inside the save (market, bounties, hull) | `N:Save/SaveGameSubsystem.h` | done | `B:src/features/Features.js`; `B:src/game/GameState.js` | none |
| M1 | Authoritative dedicated server (movement, crew, fishing, cargo, purchases) | `N:Multiplayer/FishingGameState.h`; `Ud:README.md` | v3 in progress (persistent universe); relay only today, scope of authority unverified | `B:server/index.mjs`; `B:src/net/NetClient.js` | v3: confirm sales and purchases are validated |
| M2 | Matchmaking, server directory, `server_full` admission, late-join snapshot | `N:Multiplayer/FishingMatchmakingSubsystem.h`; `N:Multiplayer/FishingServerDirectory.h` | v3 in progress; today room cap with `full` refusal, `/health`, host ship list to late joiners | `B:server/index.mjs` | v3 |
| M3 | Crew codes, passengers on another player's boat | `N:Boat/FishingBoatPawn.h` | done | `B:src/features/netsync/NetSync.js`; `B:src/features/netsync/CrewPanel.js` | none |
| M4 | Names, name tags, chat | `Ud:README.md` | done | `B:src/net/RemotePlayers.js`; `B:src/net/ChatInput.js` | none |
| P1 | Frame-time floor measured on every frame, per-system cost scopes | `Nd:reports/alpha-roid/FABLE_COMPLETION_PLAN.md` (Phase 4); `Nd:docs/WORLD_TRADE_PIRATES_AMENDMENTS.md` | partial: GPU profiler and an eight-view bench; no all-features scenario, no CPU scopes | `B:src/core/Profiler.js`; `B:src/core/Bench.js` | M WP-F: `tools/perf/`, `test/perf-scenarios.mjs` (naval fight, storm, night, crowd) |
| P2 | LOD and distance culling for vessels, projectiles, residents | `Nd:docs/WORLD_TRADE_PIRATES_BRIEF.md` (F4) | partial: far ships sleep, model LOD, vegetation LOD, resident animate radius | `B:src/features/naval/Models.js`; `B:src/world/Residents.js` | covered by P1 numbers; fix by attribution |
| P3 | Quality presets, render scale | `Ud:Config/DefaultScalability.ini` | done | `B:src/App.js`; `B:src/ui/AppUI.js` | none |

## v3 coverage map (rows closed by tasks in the PLAN.md wave table)

| v3 task | Rows |
|---|---|
| Unreal fish set + marker-timing minigame (`world/fish`, `FishTable.js`, `Bites.js`, `CatchMinigame.js`, `FishPortrait.js`, `FishStand.js`) | F1, F3 |
| Foot / hand IK (Avatar.js, Skinning.js, player/ik) | C4 (C5 waits on it) |
| Quests, NPC memory, consequences (notices, Contracts.js, story/) | Q2, Q5, Q12, part of E11 |
| Ship modules and upgrades (Boats.js, world/boat, naval) | E13, V14 |
| VFX set (features/vfx) | V15, maybe F9 |
| Night identity (features/night) | W5 |
| Islands 5-8 incl. the Inverted Isles (`world/islands`, `game/ports`, `TerrainData`, `world/terrain`, `WorldLayout` islands) | W11, W12 |
| World map (Minimap.js, WorldMap.js) | W14 |
| Persistent universe (server, net, netsync, MainMenu, GameMode) | M1, M2 |
| Accessibility, remapping, i18n | X1, X2, X3 |
| Seaplane, destruction, new start and loader art | v3 in progress; browser-only, no Unreal counterpart |

## Engine-specific or rejected (n/a)

| Item | Why |
|---|---|
| Lumen / Substrate / virtual shadow maps, Niagara, MetaHuman, UE automation and CSV capture (NB A8) | engine tooling; the browser has its own renderer, particles and node tests |
| Native Manny comparison character, Unreal packaging and launchers | UE-specific |
| Unreal's "no walkable cities" and "no multiple saves" scope limits | superseded: the browser already has both |

## Work packages for the remaining gaps (none in v3)

Each package gets **exclusive files** that are not in any v3 owner list: seaplane (`src/features/seaplane`, Player.js passthrough), destruction (`src/physics`,
`src/features/destruction`), new start (`src/world/start`, WorldLayout.js start fields, `index.html`, `public/ui/keyart*`), world map (`Minimap.js`, `WorldMap.js`),
persistent universe (`server/*`, `src/net/*`, `src/features/netsync/*`, `MainMenu.js`, `GameMode.js`, `docs/HOSTING.md`, `tools/host`), IK (`Avatar.js`, `Skinning.js`,
`src/player/ik`), ship modules (`Boats.js`, `src/world/boat/*`, `src/features/naval/*`, `public/models/modules`), VFX (`src/features/vfx`), night (`src/features/night`),
accessibility (`Accessibility.js`, `src/core/Input.js`, `AppUI.js`, `src/i18n`), quests (`src/features/notices/*`, `src/game/Contracts.js`, `src/features/story`), fish set (`src/world/fish`, `Fish.js`, `FishTable.js`, `Bites.js`, `CatchMinigame.js`, `FishPortrait.js`, `FishStand.js`), islands (`src/world/islands`, `src/game/ports`, `TerrainData`, `src/world/terrain`, WorldLayout islands / ports).
Packages read those areas through public APIs and events only (cross-worker APIs listed at the end of PLAN.md: `vfx.*`, `app.netsync.sendWorldEvent`). PLAN also allows three.js, Rapier and three-avbd after phase 2; no package installs a dependency itself, root does. Where a package needs a hook inside a v3-owned file, it ships an adapter and the root adds
the hook line after that owner lands. Root also adds each new module to `MODULES` in `src/features/install.js` and its tests to the `npm test` script.
Every package keeps the feature-module contract (`install( app, features )`, `update`, `toJSON` / `fromJSON`, `reset`, `dispose`), a headless node test, and a scratch build.

| WP | Name | Exclusive files | Rows | Size | Needs from others |
|---|---|---|---|---|---|
| A | Economy, customs, operating costs | `src/features/trade/*` (adds `HaulContracts.js`, `Credit.js`, `Rivals.js`, `Smuggler.js`, `Operating.js`), new `src/features/customs/*`, `src/game/Gear.js`, `src/game/Chandlery.js`, `test/feature-trade.mjs`, `test/feature-customs.mjs` | F6, E2-E9, E11 (merchant axis), U5 | L | ports from `WorldLayout.js` (read only); islands 5-8 ports when they land |
| B | Pirates, dens, consequences | new `src/features/pirates/*` (`Roster.js`, `Dens.js`, `Retaliation.js`, `Ledger.js`, `Notoriety.js`, `SearchZones.js`), `src/features/boarding/*` (adds `Hostile.js`), `test/feature-pirates.mjs`, `test/feature-boarding.mjs` | Q4, V7-V10, V12, V18, E11 (corsair axis), U6 | L | `naval.spawn` and ship events (read only; custom ship states are ignored by the brains); den sites on islands 5-8 |
| C | Ship systems | new `src/features/shipdamage/*` (`Sections.js`, `Fire.js`, `Flood.js`, `Wrecks.js`, `Ammo.js`), new `src/player/SailModel.js`, `src/player/sailData.js`, `test/feature-shipdamage.mjs`, `test/sail-model.mjs` | V3-V6, V13, V16, W3 | L | start against today's `Ship` API through an adapter; rebase after the v3 ship-modules owner lands; fire and smoke through `vfx.fire` / `stopFire` / `smoke` once `features/vfx` exists; powder and shot goods from WP-A |
| D | World identity and exploration | new `src/features/inverted/*`, `src/features/life/*` (`GullCues.js`, `Decals.js`, `Fireflies.js`, `Chimneys.js`), `src/features/exploration/*` (`Treasure.js`, `Spyglass.js`, `HeadingRibbon.js`), `src/features/weather/WeatherAudio.js`, `public/models/inverted`, `tools/inverted`, `test/feature-inverted.mjs`, `test/feature-life.mjs`, `test/feature-exploration.mjs` | F8, F9, W6, W10, W13, W15, W16, W17, A4, V16 (ribbon) | L (M each) | sky tint through existing fog / haze settings, no engine edits; ask night and VFX owners about overlap |
| E | Harbour life, dialogue, crafting | `src/world/Residents.js`, `src/world/residents/ResidentData.js`, new `src/features/harbour/*` (`Schedules.js`, `Roles.js`, `Tavern.js`, `Dice.js`), `src/features/dialogue/*`, `src/features/crafting/*`, `test/residents.mjs`, `test/feature-dialogue.mjs`, `test/feature-harbour.mjs` | Q6, Q9, Q10, Q11, A5 | L | story/ for NPC memory and quest state (optional, read only); Avatar clips as they are |
| F | Platform: saves, perf, gamepad, feel | new `src/game/SaveVault.js`, `src/ui/SaveManager.js`, `docs/SAVE_FORMAT.md`, `src/core/Gamepad.js`, new `src/ui/Glyphs.js`, `src/game/CameraFeel.js`, new `src/ui/DebugPanel.js`, `src/core/ErrorLog.js`, `tools/perf/*`, `test/perf-scenarios.mjs`, `test/save-vault.mjs` | S1, S3, U9-U12, X4, P1, P2 | M | deadzone and sensitivity sliders live in `AppUI.js` (v3 accessibility owner); root wires the Save button into `PauseMenu.js` |

Run order that avoids rework: F and E first (no dependency on v3), then D, A and B in parallel, C after the ship-modules owner has landed. B's den sites and A's extra
ports wait for islands 5-8; both can start with Home, Pons, Gull Rock and Saltmarsh Key.

Not packaged: F5 hold-grid rotate / overlap (shared GameHUD.js), C5 animation blending and C8 emote key (Avatar.js is IK-owned, Game.js is root), V17 player-versus-player
(needs the v3 universe), F1 / F3 / W11 / W12 (v3).
