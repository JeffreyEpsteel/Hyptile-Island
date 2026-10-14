# Wave 21C: the destructible city

Read w21-common.md first (the hard rule on the two towers; the plan and the building handles: setStage, fireAnchors,
colliders, onStage), then src/features/destruction/** (Sites, Kinds, stages, repair over time, the Tidemark buildings and
stalls), src/features/naval (cannon hits on shore: launchFrom, splash / impact events), src/features/weapons (bombs, fire
bottles), src/features/seaplane crash events, src/features/stronghold (the shore batteries' destruction), src/world/Debris.js
+ debris/**, the VFX (fire, smoke, dust), src/world/interiors (a destroyed building ejects: the same contract).

Owned: src/features/citywreck/** (new feature 'citywreck'), public/models/meridian/wreck/** (new), tools/citywreck/**
(new), test/feature-citywreck.mjs (new). Report patches for install.js, Features.js, destruction, naval, weapons, the
meridian builder (21A: the onStage hook only), cars (21B: road-blocked events), sfx (20B), netsync (20E: the host owns
building stages).

1. Damage model per building (from the plan: kind, size, floors): hit points by kind, hits from cannon (ships offshore,
   the shore batteries if any), bombs, fire bottles, car explosions, plane crashes (low and midrise only), stages 1-3:
   scarred (scorch decals, broken windows), gutted (fire through the floors, a facade breached, smoke columns), collapsed
   (a progressive collapse of low and midrises into a rubble heap with dust, falling debris that damages what it hits,
   debris spilling onto the road: publish a road-blocked event with the edges). Highrises: partial damage (upper floors
   breached, fire), no full collapse. The two towers: per w21-common.md: never collapse, never burn, no structural damage
   from aircraft; only cosmetic marks on the lower facade from cannon / bombs that mend.
2. Fire spreads between adjacent low buildings in dry weather, rain from the fronts (weather) slows it; fire crews and a
   fire engine (a 21B car kind if they add one: report the patch) answer, repairs over in-game days with scaffolding.
3. Consequences: the city's mood (shops close, notoriety or a city wanted level like the navy's; the law answers with the
   police cars and the navy offshore), insurance / repair costs posted on the notice board, interiors and townlife seats
   of a destroyed building gone until rebuilt.
4. Performance: collapse animations as baked vertex animation or a few rigid chunks, rubble merged, at most two collapses
   animating at once, phones simpler dust; budgets in w21-common.md.
5. Tests: the stages and HP, the towers' rule (no structural damage from any aircraft, never collapse), spread and rain,
   repair, road-blocked events, save round trip (damaged city restored), the host-authoritative stage stream. Captures of a
   street before / during / after (READ them). Before 21A's builder exists, test against stub handles. Report under 300
   words.
