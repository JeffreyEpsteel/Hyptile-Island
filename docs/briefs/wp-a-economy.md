# WP-A: economy, customs, operating costs (docs/UNREAL_PARITY.md rows F6, E2-E9, E11 merchant axis, U5)

Owned files: src/features/trade/** (add HaulContracts.js, Credit.js, Rivals.js, Smuggler.js, Operating.js), src/features/customs/**
(new), src/game/Gear.js, src/game/Chandlery.js, test/feature-trade*.mjs, test/feature-customs.mjs. The previous worker reached
"tests, Gear, Chandlery, WORLD.ports": check src/features/trade for new files. Keep test/feature-trade*.mjs and state-v2 green.

Hooks inside YOUR files (so root needs no later patch): hold crates x features.get( 'naval' )?.holdBonus?.() (default 1);
prices x features.get( 'story' )?.priceMod?.( portId ) (default 1); trade.marketSnapshot() / adoptMarketSnapshot( snap ) /
onMarketChange( cb ) for the universe server; markets for every entry in WORLD.ports (read dynamically).

Cover: 12+ goods with legality per port, markets at all ports with supply/demand drift, contraband with a smuggler
contact and customs inspections at ports (fines/confiscation, avoidable), hauling contracts and a hauling licence,
merchant credit (loans with interest and due dates), rival merchant voyages that move prices, operating costs (bait, crew
wages, fuel/upkeep) - campaign stays challenging, sandbox free. Panels in the menu style. Emit cargoBought/cargoSold as
today plus new events (customsInspected, contrabandSeized, loanTaken, loanRepaid ...) and list them in the report.
Report root patches (install.js MODULES entries, events for Features.js).
