# Wave 24F: polish, feel and the A-class gap list (Fable)

Read w24-common.md, then play the game in the built-in browser pane (build with `npx vite build --outDir
"C:/Users/mario/AppData/Local/Temp/claude/D--fishing-game/d00ad1bf-1c9e-459e-a4dd-f6b4c8f6fe92/scratchpad/build-root"
--emptyOutDir`; a static server may already serve it at http://127.0.0.1:5191/ (if not, start `python -m http.server 5191
--bind 127.0.0.1` there in the background); window.__app; the start overlay reads 'Click to explore') and headless.

Owned: src/ui/** , src/AppUI.js, src/game/HudPanels.js, src/game/GameHUD.js, src/game/Guide.js, src/game/Tips.js, index.html,
the main menu / loading screen / pause menu code you find (name it), the camera and character-feel code in src/player/
Player.js and src/player/Camera* (camera, acceleration, turning, footsteps feedback only: the other workers do not own
Player.js; keep edits surgical), src/features/sfx/** (mix levels and new cues only), test/feature-ui*.mjs.

1. Play the first 20 minutes as a new player and list everything that feels amateur: menus, fonts, spacing, icon style,
   transitions, loading, the HUD's density and consistency, prompts, camera (smoothing, collision, FOV, shake), movement
   (acceleration, turning, slopes, stairs, jumping), feedback (hit stop, particles, sounds), the sound mix, text tone.
2. Fix what is yours to fix, highest impact first: a coherent visual language for every panel (one type scale, spacing,
   colours, icons), smooth transitions, a loading screen and main menu worth screenshotting, a camera with weight and no
   clipping, movement that feels good, juicy but tasteful feedback, a balanced mix.
3. Write docs/A-CLASS.md: the gap list for the whole game (every area, owner by file, priority, a screenshot path each),
   updated at the end of your run with what wave 24 closed; root plans the next wave from it.
4. Verify with before / after captures and browser screenshots (READ them); tests for what you changed.
