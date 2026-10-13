# Wave 11D: life cues on the water, an emote key, cast and catch feedback

Read docs/briefs/COMMON.md first, then docs/UNREAL_PARITY.md rows F8, F9, C8, src/features/life/** (GullCues.js, Decals,
Laundry, Chimneys: what exists), src/world/Gulls.js, src/features/vfx (splash / spray / flash / bubbles APIs),
src/features/Features.js (events: fishCaught, strikeMissed, cast events: find the exact names in Game.js),
src/player/Avatar.js (montage API: playMontage( name, { slot } ); the roster clips include Wave / Dance: check the clip
list in tools/roster), src/core/Touch.js + src/ui/TouchControls.js (the fold tray from wave 10E: where an emote button
goes), src/ui/Glyphs.js and Accessibility.js (key tables; pick a free key through features.claimKey).

Owned files: src/features/life/**, src/features/emotes/** (new), test/feature-life.mjs, test/feature-emotes.mjs (new).
Report patches (install.js registration, Touch.js tray entry, Game.js hooks, help rows) under 250 words.

1. F8: gulls react to fishing: on a cast near them they scatter from the splash; on a strike / fight 2-3 wheel in over
   the line and dive at a miss; on a catch landed one tries to steal (a swoop, a squawk) and leaves. Read what GullCues
   already does and complete it; cheap (no new meshes).
2. F9: a cast makes a splash and an expanding ripple ring where the lure lands (vfx.splash + a ring decal through
   life/Decals if it supports water, else a small vfx ring), a strike makes a fish-shadow ripple burst, a landed catch a
   bigger burst distinct from a miss (miss: a small plop). Keep the budget: at most one ring per cast.
3. C8: emotes. A new feature src/features/emotes: a key (claim a free one: check Glyphs / Accessibility; propose X on
   foot, since X is only the starboard guns at the helm) opens a tiny radial / row of 4 (wave, dance, point, cheer: use
   the clips that exist in the roster GLBs; check names and fall back to a procedural arm wave through the avatar's
   upper-body montage API), plays the montage as an upper-body (walking) or full-body (standing) montage, syncs to other
   players as a world event ('emote' { id }) with a 2 s rate limit, and shows a touch button in the fold tray. Residents
   near you answer a wave with a wave (harbour Roles have idle lines: an optional small hook, report it).
4. Tests: gull cue state machine on events, ring budget, emote key / rate limit / clip fallback. Vite build check as in
   COMMON.md. Report under 250 words.
