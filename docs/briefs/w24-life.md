# Wave 24E: a world that lives

Read w24-common.md, then src/features/townlife/** (townsfolk, homes, jobs, day plans, animals, skiffs), src/features/
harbour/** (residents, the tavern), src/world/Residents.js + residents/**, src/world/wildlife/**, src/world/Gulls.js,
src/world/islands/meridian/TownLife.js (city pedestrians), src/features/cars/Traffic.js (read only: the city's traffic),
src/features/crew/** (read only), src/features/navy/** + naval (read only: ships at sea), the roster clips
(src/game/Characters.js CLIPS: sit, eat, drink, talk, work, dance...), src/features/sfx (read only: ambience cues).

Owned: src/features/townlife/**, src/features/harbour/** (life only, not the panels' markup), src/world/Residents.js,
src/world/residents/**, src/world/wildlife/**, src/world/Gulls.js, src/world/islands/meridian/TownLife.js,
test/feature-townlife*.mjs, test/feature-life*.mjs, test/feature-harbour.mjs (additive). Report patches for cars traffic,
the sfx cues and anything else.

1. People with purpose: daily routines that read from afar (open the shop, sweep, carry crates from boats, haggle at the
   market, eat at noon, siesta, children to school and playing after, the evening walk, the tavern at night, lights off),
   groups that talk with gestures and turn to face each other, reactions to weather (run for cover, umbrellas, oilskins),
   to the player (greet, step aside, stare at a drawn weapon, flee gunfire), and to events (a ship arriving: people gather
   on the quay; a fire: a bucket chain).
2. Places that breathe: fishing boats leaving at dawn and returning with a catch that is unloaded and sold, gulls following
   them, a fish auction, market stalls that fill and empty, washing lines, smoke from chimneys, dogs, cats, chickens, goats,
   birds in flocks, fish jumping, dolphins sometimes; Meridian with pedestrians at crossings that obey the lights, bus stops
   with people boarding (patch to cars' Traffic for the bus stops), delivery vans unloading, street vendors, a busker.
3. Occasional events: a market day, a wedding procession, a festival night with lanterns and music at Tidemark, a regatta.
4. Budgets: the townlife CPU and skinned-draw budgets per tier (docs/PERF.md 20A); far people as cheap instanced crowds.
   Verify: captures of each town morning / noon / evening / night (READ them), CPU numbers before / after, tests for the
   routines and reactions.
