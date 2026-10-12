# Wave 5 (alpha feedback): rename Marta -> Ethena Prosper, Joe -> PoorGoat; credits

1. Renames, everywhere a player can see or a test checks: the chandlery keeper Marta becomes **Ethena Prosper**
   (first name "Ethena" where a short form is used, e.g. "Ethena's chandlery"), the fish-stand keeper Joe becomes
   **PoorGoat** (one word; "PoorGoat's quests", "PoorGoat buys the fish"). Files that mention them (grep -w Marta / Joe):
   src/App.js (only the strings), src/features/boarding/Boarding.js, melee/MeleeData.js, notices/NoticeData.js, notices/Sites.js,
   story/Story.js, story/StoryData.js, trade/index.js, trade/Operating.js, trade/stall.js, src/game/Boats.js, BoatYard.js,
   CaptainRoid.js (lines only; the Roid worker owns its logic: coordinate by touching only the name strings), Chandlery.js,
   Characters.js, Contracts.js, FishStand.js, Game.js (strings), GameMode.js, Guide.js, HudPanels.js (strings), Minimap.js,
   PonsPort.js, ports/HavenPort.js, ports/KeyPort.js, src/ui/UI.js, src/world/residents/ResidentData.js, src/world/start/Landing.js
   + README.md, src/world/Village.js, src/world/WorldLayout.js, index.html, docs/HYPTILE_ISLAND.md, src/i18n/en.js + ro.js,
   the tests listed by the grep. Keep ids/keys stable where they are data keys (e.g. a vendor id 'marta' may stay as an
   internal id; only displayed names change) unless a test checks the id. Root-owned files (App.js, Game.js, HudPanels.js,
   Features.js, install.js) you may edit ONLY for these name strings. Run the whole npm test afterwards.
2. Credits: write CREDITS.md at the project root and an in-game Credits panel (src/ui/Credits.js, opened from the main
   menu — src/ui/MainMenu.js is free to edit for a Credits button — and from the pause menu via a small hook you report).
   List every third-party thing with author and licence, verified from the actual files and package.json: Tidewater
   (D:\tidewater-main\tidewater-main: read its README.md, CREDITS.md and LICENSE and carry over every entry they credit),
   three.js (MIT), @dimforge/rapier3d-compat (Apache-2.0), three-avbd (MIT, github.com/sbobyn/three-avbd; evaluated, not
   shipped — say so), Colyseus + @colyseus/sdk + schema (MIT), ws (MIT), Vite (MIT), the webgpu/Dawn node package used
   for tests, the Microsoft Rocketbox motion-capture clips (tools/roster/README.md: find their licence terms and cite
   them exactly), the JadeFisher character art and the menu/loader key art (the user's own ComfyUI work: credit as
   "Hyptile Island art: <user>" with a placeholder the user can fill), fonts (check index.html / ui.css for Google Fonts
   or bundled fonts), any sound sources (grep src/audio and public for samples; synthesised ones need no credit), the
   Unreal game "Upside-Down Fishing" and its naval fork as the design source (the user's own project), Captain Roid's
   model and voice (D:\fishing game\Forks\Fishing_Naval_20261007 — the user's), and the Colyseus agent skill
   (.claude/skills/colyseus, MIT). Where a licence requires the text (Apache-2.0 NOTICE, MIT copyright lines), include
   it in CREDITS.md. Do not invent authors: if unknown, write "unknown - to confirm".
3. Put CREDITS.md into the release recipe: report that root must copy it into the release folder.
Report under 300 words.
