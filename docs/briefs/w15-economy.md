# Wave 15B: a better economy

Read docs/briefs/COMMON.md first, then src/features/trade/** end to end (index.js, market.js: PortMarket prices,
drift, events; goods.js; HaulContracts.js; Credit.js; Rivals.js; Smuggler.js; Operating.js; ledger.js; panel.js +
stall.js: the window), src/game/FishStand.js + Game.js sell paths (read only: fish prices, _salePort), src/game/ports/
TidemarkPort.js (read only: the fish hall and chandler), src/features/pirates/BlackMarket.js (read only: contraband
prices), src/features/agents (read only: fees), src/features/notices (read only: delivery notices), src/features/
story/Story.js (read only: priceMod( port ), discount( key ), opens( key )), src/features/harbour (read only: the
harbourmaster, port fees if any), src/features/customs (read only), test/feature-trade*.mjs.

Owned files: src/features/trade/**, src/game/FishStand.js (prices only, additive), test/feature-trade*.mjs,
test/feature-economy.mjs (new). Report Game.js / HudPanels.js / harbour / agents patches under 250 words.

The user's words: "better trades / economy". Make trading a game of its own, legible and worth the sailing:
1. Ports with an identity: each port produces some goods (cheap, restocking) and wants others (dear, demand that
   fills up as you sell): home (fish, rope, lamp oil), Pons (timber, resin), Gull Rock (salt, guano, lamp wicks),
   Saltmarsh Key (reeds, eels, dyes), West Haven (cloth, iron), the Shrine (incense, carvings), Quiet Shoal (pearls,
   shells), the Inverted Isles (glass, strange fruit), Tidemark (the big market: everything, bigger swings, luxury
   goods: wine, silk, clocks), Blackwater (contraband, powder, stolen goods cheap). Keep the existing goods, add what
   is missing; every good has a weight, a crate size, a perish rate and where it is contraband.
2. Prices you can read: the market window shows, per good, the best place to sell what you hold and the best place
   to buy for this port (margin per crate, distance, hours of sailing at your boat's speed, the risk: pirate lanes
   crossed), a trend arrow from the last day's history, and the news that explains a swing (a storm closed Pons,
   a merchant convoy landed cloth at Tidemark, a raid burned the Key's reeds). A harbourmaster price board (a panel
   row: the five best margins from here).
3. A living supply: the rival merchants' convoys (Rivals.js) actually move goods between ports and shift prices
   when they arrive (the host simulates them in a universe: read how trade syncs market snapshots); sinking or
   hijacking a merchant removes her cargo from the destination's supply; the player's bulk sales flood a market for
   a day.
4. Money sinks and progression: port fees per docking by hull size (waived at home and for beloved standing),
   cargo insurance from the harbourmaster, wages / upkeep that matter (read Operating.js: tune), warehouse rental at
   Tidemark (store crates for later), merchant licences by tier that unlock luxury and bulk contracts (Credit.js
   standing), a ledger page with profit per route and per good.
5. Fish: the fish hall pays by freshness (hours since catch, the cooler slows it) and by port demand (the species a
   port eats), with a daily "wanted" species bonus posted on the board.
6. Sandbox stays free where it is free today; the campaign is where the economy bites. Saves round-trip (toJSON)
   with migration for old saves. Multiplayer: trades relay as today; nothing new on the server unless a snapshot
   field is missing (report it).
7. Tests: port identities (produces cheap, wants dear), best-route maths, convoys move prices, fees and insurance,
   freshness pricing, migration of a wave-14 save. Existing trade tests green. Vite build check. No browsers.
Report under 250 words.
