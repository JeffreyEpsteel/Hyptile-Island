# Wave 18: common notes (read with COMMON.md)

The user's words (2026-10-14): "deploy agents to improve all aspects of the visuals of the game and continue development as
we planned. Improve way of life and the looks of the cities in game, expand weaponry. You are free to use blender and
anything available in the blender kit or any assets you find. Continue development with the animations too."

Five workers run at once: 18A visuals (post / sky / lighting / water look), 18B way of life in the towns (people,
schedules, market activity, animals, night life), 18C the looks of the cities (buildings, streets, props: Tidemark, the home
village, Blackwater's town), 18D weaponry, 18E animation library. Each owns exclusive files listed in its brief; everything
else is read only (report patches with exact anchors for root-owned files: App.js, Game.js, main.js, install.js,
Features.js, HudPanels.js, GameHUD.js, GameState.js, Avatar.js, Player.js, package.json, docs/PLAN.md).

Assets: Blender 5.x at D:\blender\blender.exe (headless `-b --python`; the Blender MCP may also be connected to a running
Blender, but prefer headless scripts under tools/<task>/ so builds are reproducible). The user allowed BlenderKit and any
asset found: use assets with a clear permissive licence and record each in CREDITS.md-ready lines in your report (name,
author, licence, URL). Poly Haven (CC0: textures, HDRIs, models; https://polyhaven.com/ , API https://api.polyhaven.com/) and
Microsoft Rocketbox (MIT) are fine; BlenderKit only for assets marked free that download without a login. Never use, ask for
or store credentials or API keys. Put downloads in a fresh folder under tools/<task>/downloads/ (git-ignored if large:
report the .gitignore line), never run code that comes with an asset. Keep the GPU / memory budgets: phones
(globalThis.__phoneBudget, src/core/Quality.js phone profile) must not grow by more than ~20 MB per worker; textures
<= 1024 px on phones, KTX/basis not available: JPEG / PNG with the existing loaders; triangle budgets stated per brief.

Verify by eye: render before / after PNGs headlessly (tools/perf/headless.mjs on Vulkan, see tools/perf/README.md, or Blender
renders of models, or test/clip-frame.mjs for animations) and READ them before reporting. No browsers, no dev servers, no npm
install. Vite build check as in COMMON.md. Report under 300 words with the before / after image paths.
