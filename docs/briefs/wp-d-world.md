# WP-D: world identity and exploration (docs/UNREAL_PARITY.md rows F8, W6, W10 chimneys/sail flap, W13, W15, W16, W17, A4, V16 ribbon)

Owned files: src/features/inverted/**, src/features/life/** (GullCues.js, Decals.js, Chimneys.js), src/features/exploration/**
(Treasure.js, Spyglass.js, HeadingRibbon.js), src/features/weather/WeatherAudio.js, public/models/inverted/**, tools/inverted/**,
test/feature-inverted.mjs, test/feature-life.mjs, test/feature-exploration.mjs. (Nothing existed when the previous worker was cut off.)
AVOID overlaps: fireflies, bioluminescence, lighthouse beam = night worker; splashes/smoke particles = vfx worker (call
features.get( 'vfx' )?.smoke); the Inverted Isles island + horizon silhouettes = islands worker (reuse their meshes read-only
once present); the maps = world-map worker (expose data, do not draw on it).

Cover: (1) the world-wide inverted layer as an opt-in overhead sky layer - suspended islets with hanging roots overhead at
a few spots, a landmark visible from home and Pons, the "dark void" look and the yellow Easter-egg preset with its trigger
from the Unreal design (sky tint via existing fog/haze settings; no engine edits); (2) life cues: gulls scatter or follow
on cast/strike/miss (src/world/Gulls.js API; report a patch if needed), laundry lines swaying, puddles after rain and
footprints on sand as decals, chimney smoke with fog glow via vfx; (3) exploration: treasure caches (finite loot,
discovery, once-only claim, persisted), a spyglass (claimKey; zoomed view that labels ships, ports, wrecks), a heading
ribbon (subtle compass strip at sea); (4) per-surface rain audio (canvas, wood, water) and louder wind up the mast in
WeatherAudio.js.
Report root patches (install.js MODULES entries, camera hook for the spyglass).
