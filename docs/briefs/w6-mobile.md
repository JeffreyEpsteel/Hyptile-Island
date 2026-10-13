# Wave 6: a mobile version (phones and iPads)

The game is deployed on GitHub Pages (https://jeffreyepsteel.github.io/Hyptile-Island/, built from main by
.github/workflows/pages.yml) and must work on phones and tablets: Chrome on Android (WebGPU since Chrome 121) and
Safari on iOS / iPadOS 26+ (WebGPU). Today everything assumes a keyboard, a mouse with pointer lock and a wide screen.

Owned files: src/core/Input.js (touch -> the same virtual key / button state the game already reads, so no game code
changes), src/core/Touch.js (new), src/ui/TouchControls.js (new), src/ui/ui.css and src/ui/UI.js (responsive HUD and
panels only), src/ui/AppUI.js (a Mobile section in settings), src/core/Quality.js (a mobile tier and detection),
src/core/Gamepad.js (nothing unless needed), index.html (viewport meta, apple-mobile-web-app tags, a manifest link),
public/manifest.webmanifest + public/icons/* (new; make icons from public/ui/keyart with Pillow or Blender headless),
public/sw.js (optional, see 6), src/player/Player.js ONLY for touch-look input (camera yaw/pitch from a drag) and
src/game/Minimap.js / src/ui/WorldMap.js ONLY for pinch-zoom and touch pan, test/feature-mobile.mjs (new).
Root-owned as in COMMON.md; report patches there with anchors.

1. Detection and messaging: on load, if navigator.gpu is missing show a clear page (not a crash) saying which browsers
   work (Chrome 121+ on Android, Safari on iOS/iPadOS 26+, Chrome/Edge on desktop) and a link to the desktop download;
   detect touch devices (pointer: coarse) and small screens separately (a touch laptop keeps its keyboard).
2. Touch controls (src/ui/TouchControls.js): a left virtual stick (move; the outer ring = sprint), right-half drag to
   look (Player camera yaw/pitch; invertible, sensitivity in settings), context-sensitive action buttons on the right
   (Interact E / Rod R / Cast-Reel (tap, hold) / Jump / Dodge Q / Guard (hold) / Fire Z-X at the helm / Board B / Map M /
   Journal J / Menu), with the prompts the game already shows turned into tappable buttons (features.interactable
   prompts, p.prompt). Boat and seaplane: throttle slider + steer from the stick; seaplane pitch/roll from the right
   drag, throttle slider. All of it feeds Input's existing key/button state (input.down('KeyW') etc.) so Game, melee,
   naval, seaplane and panels keep working unchanged. Hide the controls when a hardware keyboard/gamepad is used.
   No standing text prompts: the buttons themselves are the prompts.
3. Responsive UI: HUD scale by viewport (safe-area insets for notches, env(safe-area-inset-*)), panels that fit a
   phone in landscape and an iPad in both orientations, scrollable panel bodies, bigger tap targets (44 px), the
   settings panel and main/pause menus usable by touch, the F1 sheet replaced by a touch help card, the world map
   with pinch-zoom and drag, the minimap tap to open the map, text inputs that don't zoom the page (font-size >= 16 px).
   Landscape is the play orientation: in portrait show a rotate hint over the game (keep running).
4. Performance on mobile: Quality.js gets a 'mobile' probe path (default tier Low on phones, Medium on iPads with
   an M-series, auto stays on), render scale <= 0.75 on phones, reduced shadow cascades, particle and resident budgets,
   lower water query count, fewer concurrent audio voices; cap devicePixelRatio at 2; check GPU memory: the roster
   characters are ~60k tris each with 2k textures (look at what the engine uploads; downscale textures on mobile if
   there is a cheap switch, else report it as a follow-up with numbers).
5. Audio: iOS needs a user gesture to start AudioContext: resume it on the first touch (the start overlay tap).
6. Installability: a web app manifest (name Hyptile Island, icons, display standalone, orientation landscape,
   theme colour jade) so "Add to Home Screen" works on iPad/Android; a minimal service worker is optional (only if it
   does not break Vite's hashed assets or the Pages sub-path: use relative scope './'); respect the base './'.
7. Test: a node test for Touch.js's stick/drag maths and for the key-state mapping; manual check in the desktop
   browser pane with the mobile viewport emulation (the root will do the device emulation; write a short checklist
   docs/MOBILE.md with what to tap). Keep every existing test green and the vite build clean.
Report root patches (App.js hooks for the touch overlay / rotate hint / audio resume, main.js for the no-WebGPU page)
and what you verified. Under 350 words.
