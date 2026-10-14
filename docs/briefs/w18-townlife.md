# Wave 18B: way of life in the towns

Read docs/briefs/COMMON.md and w18-common.md first, then src/features/harbour/** (Roles, Schedules, Tavern: residents'
jobs and day plans), src/world/Residents.js + residents/ResidentData.js, src/world/islands/town/Folk.js + Layout.js +
Waterfront.js (Tidemark's people and streets), src/game/ports/TidemarkPort.js (the fish hall, chandler), src/world/Village.js
(the home village), src/world/islands/Blackwater.js (the pirate town: tavern, market, huts), src/world/wildlife/** (birds,
crabs), src/features/trade (read only: market cells, convoys), src/features/story (read only), src/audio/SoundScape.js +
src/features/sfx (read only: the ambience beds follow the residents' schedule), src/game/Characters.js (CLIPS: the clips
every roster GLB carries; worker 18E adds more: Sit_Chair, Lean_Wall, Drink, Eat, Carry_Box, Kneel_Work, Crouch,
Talk_Group, Clap, Point_Out, Sweep, Hammer, Fish_Net ... use a name only through a fallback: `has( name ) ? name : 'Idle_Breathe'`).

Owned files: src/features/harbour/**, src/world/Residents.js, src/world/residents/**, src/world/islands/town/Folk.js,
src/game/ports/TidemarkPort.js, src/world/wildlife/**, src/features/townlife/** (new feature 'townlife': report the install
patch), test/feature-townlife.mjs (new), test/feature-harbour.mjs (additive).

The goal: the towns feel lived in, day and night.
1. People: more residents per town within a budget (Tidemark 24 near / 60 total with distance LOD: far ones are cheap
   impostor-like animated billboards or skipped; home village 12; Blackwater 16 pirates), each with a home, a job and a day
   plan (wake, work, eat at the tavern, stroll, go home at night), walking on paths (the town Layout streets, the pier,
   the beach) with simple avoidance, sitting on benches and crates, gathering in twos and threes to talk (Talk / Chat_Gesture
   facing each other), queuing at the fish hall when fish comes in, cheering when the player lands a big catch nearby,
   reacting to cannon fire and raids (run indoors), and greeting the player (a wave, a line from their role).
2. Activity: market stalls with vendors calling out (toasts only near them), carts / wheelbarrows pushed along streets,
   fishermen mending nets on the quay, a lamplighter at dusk, children playing tag on the beach (scaled roster
   characters), dogs and cats wandering, chickens and goats by the houses, more gulls on the roofs; boats leaving and coming
   back on a schedule (read only of trade convoys: just the small local skiffs, your own simple movers).
3. Night life: windows lit (emissive), the tavern busy and loud, a few drunks swaying home, a watchman with a lantern.
4. Performance: a scheduler that updates far residents at 2 Hz, near at full rate; phones: half the people. Measure with the
   CPU scenarios harness (tools/perf).
5. Tests: day plans resolve on every town, nobody walks into the sea or through walls (path checks), the budgets per tier,
   the raid reaction, the greeting. Existing harbour / town / residents tests green. Vite build check. Report under 300
   words.
