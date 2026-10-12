# Wave 5 (alpha feedback): keys that fight the browser, and a stuck guard

User reports: (a) "I pressed right click and the character locked into the block animation" (the melee guard on RMB
stayed up and never released); (b) Ctrl+S opened the browser's save dialog; (c) Ctrl+W closed the tab (the seaplane
uses Ctrl for throttle-down with W/S for pitch, so Ctrl+W is inevitable; Ctrl+W cannot be intercepted by a page unless
the page is fullscreen with the Keyboard Lock API).

Owned files: src/core/Input.js, src/features/melee/PlayerCombat.js, src/features/melee/index.js (guard handling only),
src/features/seaplane/Pilot.js, src/features/seaplane/Seaplane.js (its KEYS list), src/ui/Accessibility.js (action list and
labels), src/i18n/en.js + ro.js (new keys), src/ui/UI.js (the F1 controls sheet entries and a fullscreen tip), test/feature-a11y.mjs,
test/feature-melee.mjs, test/feature-seaplane.mjs.

1. Guard: RMB guard must be a hold (released on mouseup, on pointer-lock loss, on window blur, when the rod comes out,
   when a panel opens, when the fight ends and after 3 s with no enemy in range); the accessibility hold/toggle option
   must apply correctly (toggle mode: a second press lowers it). Outside combat (no enemy or training post within reach)
   RMB does nothing (no guard pose). Check Input's mouse button state tracking for a missed mouseup under pointer lock
   and after the context menu, and prevent the context menu on the canvas.
2. Ctrl+S: preventDefault in Input for Ctrl/Cmd + S, P, D, O, U, F, G, H and plain F1/F3/F5-with-care (only while the game
   canvas has focus and no text field is focused), and map Ctrl+S to a quick save (the game's save: GameState.save +
   a short toast; in multiplayer universe it sends a snapshot). Keep Ctrl+Shift+I/J (devtools) untouched.
3. Ctrl+W: move the seaplane's throttle-down off Ctrl (choose free keys: check every input.hit/down and claimKey use; e.g.
   Shift = throttle up, X or C = throttle down, with the gamepad triggers unchanged) and make sure no mode combines
   Ctrl with W/S/T/N/R. Then add Keyboard Lock: when the document is fullscreen call navigator.keyboard.lock() (if present)
   so Ctrl+W/Ctrl+T/etc. reach the game, release on exit; add an F11-style fullscreen toggle in the game (a key that is
   free, plus a button in settings) and a one-time tip "Press F11 for fullscreen: it keeps Ctrl shortcuts in the game".
4. Update the Controls tab, glyphs, F1 sheet and tests. Report root patches (App.js if a fullscreen hook is needed).
