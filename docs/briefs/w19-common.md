# Wave 19: common notes (read with COMMON.md and w18-common.md)

The user (2026-10-15): "Continue your job." after waves 17-18 (no A-pose, animation library, visuals, city looks, town life,
weapons). Five workers at once, exclusive files each (listed per brief); everything else read only; root-owned files only as
reported patches with exact anchors (App.js, Game.js, main.js, install.js, Features.js, HudPanels.js, GameHUD.js,
GameState.js, Avatar.js, Player.js, package.json, docs/PLAN.md, CREDITS.md: give credit lines in the report).

Same rules as wave 18: Blender headless scripts under tools/<task>/, one Blender job at a time per worker (Blender is shared),
permissive assets only (Poly Haven CC0, Rocketbox MIT, BlenderKit free without login), no logins or credentials, phone
budgets (globalThis.__phoneBudget; +15 MB GPU max per worker), verify by eye (tools/visuals/capture.mjs for scenes,
test/clip-frame.mjs for clips, Blender renders for models: READ the PNGs), no browsers, no dev servers, no npm install, no
commits (root commits). Vite build check as in COMMON.md. Report under 300 words with image paths.

Workers share one working tree: never revert, reformat or stage another worker's files. If a test you did not touch fails
because another worker is mid-edit, say so and move on.
