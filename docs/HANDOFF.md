# Hyptile Island: project handoff

Last updated: 2026-10-16 (root: Claude Code, Opus). Keep this file current; it is the first thing a new session reads.

## What it is

A browser game (WebGPU / WGSL, vite, no framework engine: the repo's own `src/engine/**`) about a tropical island
archipelago: fishing, boats and ships, seaplanes, a WW2-style air combat mode, a helicopter, cars in a city, naval combat
with pirates and a navy, towns with daily life, quests, crew, interiors, a destructible city (Meridian), and a persistent
shared multiplayer universe. Theme: a playful **parody of the cryptosphere** (meme characters Pepe, Doge, Bonk, Pengu...;
hodl / rug-pull / "wen moon" humour), with no real crypto, tokens or trading. English only. Goal set by the owner:
an **A-class** game (no amateur seams), and hosting / budget are not limits (propose services; the owner creates accounts).

- Repo: https://github.com/JeffreyEpsteel/Hyptile-Island (public), local `D:\tidewater-hyptile`, branch `main`.
- Live game: https://jeffreyepsteel.github.io/Hyptile-Island/ (GitHub Pages).
- Multiplayer server: Fly.io app `hyptile-universe` (owner's personal org, shown as ia-l@ingura.ro; region fra; volume
  `universe_data` 1 GB at /data; always-on shared-cpu-1x 256 MB): `wss://hyptile-universe.fly.dev/universe`,
  health at `/health` (reports the deployed build hash). flyctl is installed at `%USERPROFILE%\.fly\bin` and logged in.
- Experimental fork "Alpha Astra City Lab" (ChatGPT's neon-city experiment): `D:\fishing game\Forks\Hyptile_CityLab_20261015`,
  repo JeffreyEpsteel/alpha-astra-city-lab, https://jeffreyepsteel.github.io/alpha-astra-city-lab/ (own Pages; never the
  production Fly server).

## How to run, test, release

- `npm test`: the full suite (~100 node test files, no browser; the list is in package.json "test").
- `npm run test:release`: ChatGPT's release gate (codex tests, migrations, deployment config, universe, save round trip).
- Headless visual checks on Dawn (Vulkan): `node tools/visuals/capture.mjs --dawn=<dawn dir>` (views, profiles
  medium|low|high|phone), `tools/visuals/playcheck.mjs` (takeoff, flash, carexit), `tools/meridian/capture.mjs`,
  `tools/cars/capture.mjs`. The Dawn runtime lives at `C:\Users\mario\AppData\Local\Temp\dawn` (backup:
  `D:\hyptile-backup\dawn`). Captures must be looked at, not only generated.
- Browser check: `npx vite build --outDir <dir>` then serve it (python -m http.server) and play; `window.__app` is the app.
- **Release = push to `main`.** GitHub Actions: `pages.yml` runs `npm run test:release` then builds and deploys Pages;
  `deploy-universe.yml` then deploys the same commit to Fly (secret FLY_API_TOKEN, set by the owner) and checks `/health`
  reports that build. The game warns "universe updating" while the two differ.
- Root's release rule: before pushing, `git fetch` (ChatGPT also pushes to main), then on a clean `git archive` of the exact
  commit (junction node_modules) run `npm test`, `npm run test:release` and the playcheck; push only if all pass; then
  confirm Pages + Fly succeeded and `/health` shows the hash.

## How the work is organised

- Root (the orchestrating session) plans waves, writes briefs in `docs/briefs/` (w24-common.md holds the current rules:
  owned files only, root files by patch scripts, small commits, no push, credentials never, budgets, READ every capture),
  launches workers with exclusive files, applies their `tools/<x>/apply-patches.mjs`, fixes test fallout, releases.
- Models: Sonnet (medium / high effort) for routine areas, Opus for hard engine / art, Fable only when really needed
  (hard debugging, final QA) — the owner's instruction to preserve usage.
- Root-owned files: src/App.js, src/main.js, src/features/install.js, src/features/Features.js, src/game/Game.js,
  src/game/GameState.js, package.json, CREDITS.md, docs/PLAN.md.
- `docs/A-CLASS.md` is the gap list (areas, owners by file, P1/P2/P3, screenshots); each wave closes rows.
- `docs/PERF.md` holds the budgets and measurements: phones <= 387 MB GPU at every town (peak load < 450), Medium no
  slower than the latest table; `docs/VISUALS.md` the rendering notes.

## Owner preferences (standing)

- English only, no translations. Spawn on the home island (Jade Landing). New players start with $100,000
  (`START_MONEY` in src/net/Protocol.js, shared with the server). No standing HUD buttons (contextual only).
- Assets: BlenderKit (owner's add-on), any free site with a licence for a public free game (credit in CREDITS.md);
  ElevenLabs for voices (eleven_v4), sound effects and music (the full connector was added 2026-10-16); downloads allowed;
  if a site needs an account, tell the owner (never log in or handle credentials).
- Meridian has eight fictional destructible skyscrapers (the old twin towers were replaced at the owner's request).
- PvP only between consenting armed players (dogfights: "arm guns" toggle).

## State at this handoff (2026-10-16)

Live: build 56e400a (wave 24 + $100k start). Local main ahead with waves 25B/25D/25F parts, the minimap icons, the
multiplayer alt-tab keep-alive fix (af324bc). Waves in progress when this was written (see their briefs and the
"Running" list below): 25A load time / shadows / LOD / shore (Opus), 25C camera and movement + free vehicle camera
(Sonnet), 25E realistic vehicles + realistic helicopter handling and aerobatics (Opus), 25F life details (Sonnet,
committed), 26A WW2 dogfights (Opus), 26B ElevenLabs voices / sfx / music (Sonnet).

Wave history in one line each (details: docs/PLAN.md and git log):
- 1-18: the base game, islands (Tidemark, Blackwater), seaplanes, naval combat, pirates, quests, multiplayer universe,
  weapons, town life, Kimodo animations.
- 19: crew lives, navy and storm fronts, interiors, phone budgets, navy ship models.
- 20: phones, audio, quests and balance, UI / touch, multiplayer for wave 19.
- 21: Meridian city island, cars, destructible city. 22: capsize minigame and drowning, cars multiplayer / touch.
- 23: Meridian skyline. 24: interiors of cars and helicopter, ship collisions, ship looks, graphics, life, polish.
- 25 / 26: see above.

## Next steps (in order)

1. Integrate the running waves' reports (apply each apply-patches.mjs, fix test fallout, look at captures), release.
2. Re-run the A-class audit (a Fable QA pass playing the first 30 minutes in a browser) and update docs/A-CLASS.md.
3. Close the remaining P1/P2 rows; then a real-phone pass (the owner) and a listening pass for the mix.
4. Hosting when assets outgrow GitHub Pages (1 GB site / 100 MB file): a CDN bucket (e.g. Cloudflare R2) for audio and
   large models; the owner creates the account.

## Running (update when it changes)

- 25A, 25C, 25E, 26A, 26B (see above). Workers commit their own files to main; root applies their patch scripts.

## OPEN BLOCKER before the next release (2026-10-16)

- tools/visuals/playcheck.mjs --only=takeoff FAILS on a0b2495 (plane reaches 22 m/s but stays 1 m up after 60 s). It PASSES on ebdb47b and bf70b34 (25C's first camera commit), so the regression is later: suspects 83c69c7 (25C vehicle chase cameras), e872c95 / 8be7d51 (25E helicopter), 25A boot order (55d99e9..f474a47), 26B Samples. Bisect with git archive + playcheck --only=takeoff (about 1 min each).
- test/feature-netsync-w22 'police chase, 0 pursuers' is flaky; a Sonnet worker was fixing it.
- Local main is ahead of the live build 56e400a and NOT pushed: do not push until the takeoff check passes, then run npm test + npm run test:release + playcheck on a clean archive.
- Still running at the limit: 25E (vehicles + realistic helicopter, uncommitted edits in src/features/cars/**), 26A (WW2 fighters + 2-4 seat bombers), 26C (music director for public/audio/music/*.mp3, ElevenLabs Music v2.5), the flaky-test fixer. Resume them with SendMessage or re-brief from docs/briefs/w25.md / w26.md.
- Music: six tracks in public/audio/music (untracked until 26C commits); ElevenLabs flow 'Hyptile Island soundtrack'.


## Update 2026-10-16 (later): blocker resolved, waves 25 + 26 released

- The takeoff regression was d96ba34 (25A surf sets put a crest at the propeller); fixed in d952634 (water-strike margin 0.3 m). The flaky police test was a test bug (954fff9).
- Released db545f1: waves 25A-F (load time, shadows, LOD, shore, one UI language, feedback and mix, camera and free vehicle camera, life details, realistic cars, avatar driver / pilot, live mirrors, realistic helicopter with aerobatics), 26A (three fighters + three crewed warbirds, consent-armed PvP), 26B (69 ElevenLabs v4 voice lines, sampled effects), 26C (ElevenLabs Music soundtrack + music director), the multiplayer keep-alive.
- Next: a fresh A-class audit (docs/A-CLASS.md rows left: helicopter stunt leaderboard, avatar hand grips, car proportions, cockpit interiors of warbirds, Tidemark warbird line in tall grass, Inverted Isles domes, phone touch for dogfights, music vocals check by ear, real-phone pass).


## Update 2026-10-16 (end of session): wave 27

- 27A Fable re-audit: docs/A-CLASS.md rewritten from a 30-minute play (screenshots tools/polish/out/w27a/); P1 fix eb047b8 (the rod spring diverged at the 0.1 s dt clamp and filled the screen). Root: Play with an empty name keeps the islander's name (90255c5).
- 27B: the Tidemark warbird line on the shoulder with the grass cleared, a phone dogfight cluster (numeric layout tests only), the Inverted Isles' far look (sandstone strata, day fill), a helicopter stunt leaderboard (Paper Hands ... Satoshi of the Skies) in the trick toast and the pause menu.
- 27C: the start overlay never overlaps the title card (d8e52bb); Meridian at night lit (NightLight.js one additive mesh: 483 lamp pools, apron and airstrip floods, 61 shop spills; lit shop glass; runway lights; CarBeams.js headlight cones).
- **Investigate first next session (P1 for phones):** tools/perf/headless.mjs at meridianDowntown / meridianDrive reported ~563 / 566 MB on 27C's run, against 357-369 MB measured in wave 22A (docs/PERF.md). Either the harness flags differ or waves 25-26 (car bodies, warbirds, interiors, music, voices) added GPU memory at Meridian. Re-measure with the 22A command line; cut until <= 387 MB.
- Open A-class rows (docs/A-CLASS.md): HUD collisions at 800 px, camera inside the avatar at the fish stand, subtitles stacking 3 deep (Roid two lines at once), helicopter / engineer readouts look like debug boxes, flat green Meridian minimap, blown-out car gauges at night, warbird full throttle from the Meridian line ditches in 8 s, bare warbird cockpits, runway light bands every 20 m, two tabs autosaving one slot, Longreach price vs a first session, music vocals check by ear, a real-phone pass, avatar hand grips, car proportions.
- Usage at the end: weekly ~90 %. Workers all finished; nothing running.


- Resolved (adedbd4): phone memory at Meridian is 360.0 / 363.4 MB with the 22A command line (--mobile --real-sizes --quality=low --size=852x393). The 563 MB reading was a run without --mobile (desktop Low tier). Always quote --mobile --real-sizes for phone numbers.

