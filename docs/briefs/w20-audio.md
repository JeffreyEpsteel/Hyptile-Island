# Wave 20B: the sound of everything new

Read w20-common.md, then src/features/sfx/** (the feature, its banks and procedural voices), tools/audio/** (how sounds
were made: synthesis or CC0 sources), public/audio/** (what exists), src/ocean audio hooks, src/features/weapons/**,
src/features/firearms/**, src/features/naval/** (cannons, fire, flooding), src/features/navy/**, src/features/weather/**
(Fronts.js: gusts, lightning, thunder timing), src/world/interiors/** (indoor muffle), src/features/crew/** (banter,
bucket runs), src/features/townlife/**, CREDITS.md (root: give credit lines).

Owned: src/features/sfx/**, tools/audio/**, public/audio/** (new files), test/feature-sfx*.mjs. Report patches to the
features that should call new sounds (one-line hooks with exact anchors), or better, listen to their existing events in sfx.

1. Inventory: list every action from waves 13-19 with no sound or a borrowed one (the 18D weapons: cutlass / axe swings and
   hits, pin, harpoon gun, bombs, fire bottles, smoke pots, swivel gun, blunderbuss, rifle, reloads; the navy: hails ("Heave
   to!" a bosun's call), frigate broadsides at distance, drums to quarters; storm fronts: wind gusts, rain on the deck /
   on a roof indoors, thunder by distance, waterspout roar; interiors: tavern murmur, hearth crackle, creaking boards, a door;
   crew: buckets, pumps, dice, snoring at night; townlife: market chatter, gulls at the quay, dogs; wet sand footsteps).
2. Make them (procedural Web Audio voices like the existing sfx, or CC0 samples with credits; small files, OGG / MP3 like
   today), mixed against the existing levels, distance-attenuated and occluded indoors, rate-limited so battles do not
   clip; phones: the same set, fewer simultaneous voices.
3. Tests: every inventoried event has a sound, voice limits hold, the indoor occlusion applies. Report the inventory as a
   short table (event, sound, source).
