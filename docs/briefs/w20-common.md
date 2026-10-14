# Wave 20: common notes (read with COMMON.md and w19-common.md, whose rules all apply)

The user (2026-10-15): "Continue improving everything." Wave 19 landed crew lives (src/features/crew), the navy and storm
fronts (src/features/navy, src/features/weather/Fronts.js), walk-in interiors (src/world/interiors) and phone budgets
(docs/PERF.md). Still running while you work: 19D combat animations (owns src/player/anim/AnimDef.js, src/game/
Characters.js, public/models/roster/*.glb, src/features/weapons/WeaponPose.js, src/features/melee/MeleeData.js) and 19F navy
ship models (owns public/models/navy/**, tools/navy/**, src/features/navy/NavyModels.js, the frigate / revenue entries of
src/features/naval/ShipClasses.js). Never edit their files.

Seven workers share one tree: only your owned files; every other change is a reported patch with exact anchors. No
browsers, dev servers, npm install, commits, git stash / checkout / reset. Every new player-facing string gets en and ro
(src/i18n: the i18n test fails otherwise). Phone budgets hold (docs/PERF.md: <= 387 MB GPU at the towns). Report under
300 words: files, tests run and results, image paths if visual, patches.
