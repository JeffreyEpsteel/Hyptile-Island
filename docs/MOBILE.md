# Mobile check (phones and tablets)

What wave 6 added: `src/core/Touch.js` (detection and touch maths), `src/ui/TouchControls.js` (the controls, created by
`ui/AppUI.js`), touch input in `src/core/Input.js`, the mobile tier in `src/core/Quality.js`, responsive rules at the end
of `src/ui/ui.css`, the no-WebGPU page and the touch help card in `src/ui/UI.js`, pinch-zoom in `src/ui/WorldMap.js`,
minimap tap in `src/game/Minimap.js`, `public/manifest.webmanifest` + `public/icons/` (made by
`tools/mobile/make_icons.py`). Node test: `node test/feature-mobile.mjs`.

## Desktop browser pane, mobile emulation (phone 844 x 390 landscape, iPad 1180 x 820 and 820 x 1180)

Use device emulation with touch on (the controls show for `pointer: coarse`, or after the first touch). `?nomenu` works.

1. Load: the loader card fits (no tips on a short screen). Main menu: every button is reachable and tappable.
2. Start overlay says "Tap to explore"; tapping it starts the game (sound starts on the first touches).
3. Left third of the screen: a stick appears under the thumb, the walker moves; drag past the outer ring: sprint (ring
   turns gold). Right side: drag to look. Release: the stick goes back to its faint resting place.
4. Walk to the water: Rod button appears; tap it (rod out), hold Cast to wind up, release to cast; Reel in while floating;
   when the bobber goes under the big button turns gold "Strike!"; in the fight it says Reel (red when the tension is high).
5. Near a boat / NPC: the wide aqua button shows the game's prompt ("Board boat", "Talk to ..."); tapping it acts.
   There is no text prompt pill on touch.
6. At the helm: the lever on the right (Astern / Stop / Ahead / Full), the stick steers, View (V), Port / Starboard
   when the boat has a gun, the wide button leaves the helm. Boat gauges sit small at the bottom centre.
7. Seaplane: the lever is the throttle (0-100 %), the right-side drag is the stick (up = nose down), the left stick taxis.
8. Top right: Map, Journal, Cooler, Crew, Menu. Menu closes an open panel, otherwise opens the pause menu.
9. Tap the minimap (top left): the world map opens; one finger pans, two fingers pinch-zoom, a tap sets a waypoint.
10. Pause menu > Settings: Game tab > "Touch and mobile" (mode, look sensitivity, invert, button size, vibration);
    sliders, toggles and tabs are finger-sized; Performance tab shows "Phone · Auto · Low 75%".
11. Pause menu > Controls: the touch help card (not the keyboard sheet).
12. Rotate a phone to portrait: a "Turn your device sideways" hint over the game, which keeps running.
13. Press a hardware key: the touch controls hide; touch the screen again: they come back (Settings mode Auto).
14. Panels (the stand, the chandlery, trade, notices, dialogue) fit inside 390 px height and scroll.
15. A browser without WebGPU (or `navigator.gpu` deleted before load): the "This browser cannot run the game" page
    with the browser list and the desktop download link, no crash.

## On devices (not verified yet)

- Chrome on Android 121+, Safari on iOS / iPadOS 26+: Add to Home Screen gives the Hyptile icon, opens standalone in
  landscape. Notch and home bar: the HUD stays inside the safe area.
- Text fields (chat, crew code, slot names) do not zoom the page on focus.
- Frame rate on a mid phone at Low 75 %; GPU memory with the roster textures capped at 1024 px (`?tex=full` disables).
