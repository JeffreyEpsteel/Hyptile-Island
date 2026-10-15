# Wave 24: from "beginner dev game" to A-class (read with COMMON.md)

The user (2026-10-16): "I want improved graphics and a better in game life, I want different and real looking insides for
the car and helicopter. I want them fully working. The ships still have bad collisions, some ships are looking very bad, I'd
like a massive improvement there. I'd like everything improved as it still feels like a beginner dev game. Don't stop until
it looks at least A class."

The bar: a player comparing it with a polished indie / AA game should not feel the seams. Concretely: no placeholder boxes
where a real object belongs, materials that read as wood / steel / glass / cloth / skin, lighting with depth (contact
shadows, ambient occlusion, believable sky light), motion with weight (acceleration, inertia, secondary motion), UI that is
consistent and quiet, every interaction with feedback (sound, animation, particles), and nothing that clips, pops, jitters
or floats. Measure yourself against that with captures you READ, before and after, at the same cameras.

Six workers run at once (24A vehicle interiors, 24B ship collisions, 24C ship looks, 24D graphics, 24E life, 24F polish and
QA). Rules:
- Edit only your owned files (each brief lists them). Root-owned files (src/App.js, src/main.js, src/features/install.js,
  src/features/Features.js, src/game/Game.js, src/game/GameState.js, package.json, CREDITS.md, docs/PLAN.md) and any other
  worker's files only as patches: a script tools/<yours>/apply-patches.mjs with exact anchors, verified on a copy.
- You MAY commit your own owned files to main in small logical commits (stage only your files; never `git add -A`, never
  stash, reset, checkout, rebase or push). Messages end with a blank line and the Co-Authored-By line for your model:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` or `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- English only. Never use, ask for or store credentials; no logins, no deploys, no pushes, nothing on Fly.io or GitHub.
- Assets: original Blender work, Poly Haven / ambientCG CC0, Rocketbox MIT, BlenderKit free without login; give credit lines
  in your report. Blender headless, one job at a time per worker. ComfyUI only if your brief needs it.
- Budgets: phones <= 387 MB GPU at every town (docs/PERF.md), peak load spike < 450 MB; Medium desktop no slower than today
  at the towns (docs/PERF.md latest tables) unless the brief allows a stated trade. Phones may get a simpler path, never a
  broken one.
- Verify: node tests for logic; headless Dawn captures (tools/visuals/capture.mjs, tools/visuals/playcheck.mjs,
  tools/meridian/capture.mjs, tools/cars/capture.mjs; --dawn=C:/Users/mario/AppData/Local/Temp/dawn); READ every PNG.
  The built-in browser may be used by 24F only (others: headless).
- Before reporting run the full `npm test` and `npm run test:release` on a clean `git archive` of HEAD in the scratchpad
  (C:\Users\mario\AppData\Local\Temp\claude\D--fishing-game\dd7d4bb3-6b43-4b5c-a597-4dae567ef00f\scratchpad), junction
  node_modules from D:\tidewater-hyptile\node_modules, no npm install. Report under 350 words: what changed (commits),
  before / after image paths, measurements, tests, patches, what still falls short of A-class.
