# Wave 20D: the interface for everything new (desktop and touch)

Read w20-common.md, then src/game/HudPanels.js + GameHUD.js (root-owned: granted to you for this wave, nobody else edits
them), src/ui/** + src/AppUI.js (settings, prompts, toasts), src/features/touch/** or TouchControls (the touch layout),
src/i18n/**, the guide pages and Tips (src/game/Tips.js, the guide data), and the features whose panels you polish:
crew (lifeHtml, handsHtml, tavernHtml), navy (NavyPanel, standingName, hails), interiors (door prompts, E on keepers),
weather (forecastText), weapons (quick slots), harbour TavernPanel (the Hands tab).

Owned: src/game/HudPanels.js, src/game/GameHUD.js, src/ui/**, src/AppUI.js, src/features/touch/** (or wherever
TouchControls lives), src/i18n/**, the guide data and src/game/Tips.js, test/feature-ui-w20.mjs (new). Report patches
to crew / navy / interiors / weather / harbour for text or markup inside their own files.

1. Audit every panel and prompt added in waves 13-19 on desktop (1280x720, 1920x1080) and phone (390x844 portrait,
   844x390 landscape) using the headless capture harness with the panels opened by script (tools/visuals/capture.mjs
   eval hooks): overflow, clipping, tiny tap targets (< 44 px), unreadable contrast, English-only strings, stale key
   glyphs on touch. Fix them.
2. Touch: the navy hail answer (heave to / run), interior doors and keepers, crew orders, the forecast, weapons quick slots
   reachable with thumbs; no new always-on buttons (the user dislikes standing HUD prompts: contextual only).
3. Guide pages and one-time tips for crew lives, the navy, storm fronts, interiors; ro translations for every new string of
   wave 19 (crew banter lines included if they are player-facing).
4. Captures before / after (READ them), tests: every panel renders in both languages without overflow at the four
   sizes, tap targets >= 44 px on touch, the i18n test green.
