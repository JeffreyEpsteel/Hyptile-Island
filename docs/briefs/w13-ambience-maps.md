# Wave 13C: the new places sound like places; the maps explain themselves

Read docs/briefs/COMMON.md first, then src/audio/SoundScape.js (ambience beds per place, events, the gull call),
src/features/sfx/** (synthesised cues), src/features/seaplane/PlaneAudio.js (read only: the plane's engine; the
Albatross has two engines and the Kestrel wheels: report what PlaneAudio should add), src/ui/WorldMap.js and
src/game/Minimap.js (markers, discovery, the legend if any), src/features/worldmap/**, src/world/islands/Tidemark.js +
town/** and Blackwater.js + stronghold/** (what exists to be heard: market, tavern, bell tower, fort bell, drums?).

Owned files: src/audio/**, src/features/sfx/**, src/ui/WorldMap.js, src/game/Minimap.js, src/features/worldmap/**,
test/feature-sfx.mjs, test/feature-worldmap.mjs (additive), test/feature-ambience.mjs (new). Report patches elsewhere.

1. Ambience beds (synthesised like the rest, no new audio files): Tidemark town (market murmur that follows the
   residents' schedule, a chapel / tower bell on the hour, gulls over the quay, the windsock and a distant engine at the
   airstrip when a plane runs up, hammering from the boatyard shed by day); Blackwater (drums and a rowdy tavern at
   night, the fort bell on the alarm, the batteries' reports echoing in the caldera, parrots or frigatebirds, surf on
   the cliffs); the Inverted Isles' upward waterfalls if they are silent today. Beds fade by distance like the surf bed.
2. Cues: the shore batteries firing (a deeper report than a swivel gun), a powder store exploding, the fort bell, the
   watchtower's alarm call, the black-flag purchase, a claim; the practice fight's wooden-sword clack; the parachute's
   canopy snap and the lines creaking; the Kestrel's wheels rolling / braking; the Albatross's second engine (report
   the PlaneAudio hook: two engine voices with a slight beat).
3. Maps: a legend row on the world map (ports, airstrip, pirate island with its battery reach once discovered, wrecks,
   the sea chest, crew), the Blackwater "?" until discovered then named, the airstrip icon on the minimap, the
   Kestrel / plane markers for parked airframes, and the journal entries' positions as pins when a quest step names
   a place (the story feature emits what it needs: read docs/briefs/w13-quests.md for the events it will raise:
   `questPin { id, x, z, label }` / `questPinClear { id }` - support them).
4. Tests: bed selection by position and time, cue triggers on events with rate limits, legend rows per marker kind,
   discovery states. Vite build check as in COMMON.md. Report under 250 words.
