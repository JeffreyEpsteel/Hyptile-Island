# Wave 10E: a clean mobile HUD for the seaplane (and everywhere): the side rail toggles, the controls fold away

Read docs/briefs/COMMON.md first (rules, root-owned files, style, no browsers / dev servers / npm install), then
docs/briefs/w9-settings-lights.md (what wave 9C did to the panel and the touch buttons), src/ui/TouchControls.js
(the stick, look drag, the two action rows rowA / rowB, the lever, the TOP row with fullscreen / cockpit...),
src/core/Touch.js (contextButtons: which buttons each mode shows), src/ui/UI.js around `tw-rail` (the vertical icon rail
top-right: settings, controls, photo, ...: the "top right bar" the user means) and `tw-tl`, src/ui/ui.css, and the
seaplane's cockpit strip / tips in src/features/seaplane/Cockpit.js (read only: the seaplane worker owns it; report
patches).

Owned files: src/ui/TouchControls.js, src/core/Touch.js, src/ui/ui.css, src/ui/UI.js (the rail and tl code only),
src/i18n/en.js + ro.js (append), test/feature-mobile.mjs, test/ui-settings.mjs.

User feedback (verbatim): "I want the plane UI cleaned up as on mobile we have a lot of worthless options. the top right
bar should be a toggle and the lower part should be under some options via toggle and drag, but mostly hidden unless
brought up."

1. The rail (top right) on touch: collapsed to a single round toggle button (the sliders icon) that expands the rail
   on tap and collapses it again on tap or after 6 s idle; while the settings panel is open the rail stays expanded.
   Desktop keeps the rail as it is. The HUD's `tw-tl` chips (title, mode, weather) shrink to the mode chip only on
   phones in landscape under 420 px of height.
2. The lower part on touch: the primary controls stay (stick, look area, the interact button, the lever at the helm /
   in the plane, the cast / reel in fishing). Everything else (camera, lights, nav / landing, cockpit, deck, rod, jump,
   dive, dodge / guard, gun draw / aim, port / starboard) goes into a **fold**: a slim handle at the bottom edge
   (a grab bar, 44 px tall, with a chevron) that opens a tray on tap or on an upward drag (pointer events with
   `setPointerCapture`, like the lever), closes on tap / downward drag / after 5 s without a press; the tray lays its
   buttons out in a row that wraps. A button that is `hold`-type (jump, dive) works from the tray too. Nothing of the
   tray is visible when closed except the handle, and the handle hides while a fight is on (melee / boarding: the
   dodge / guard buttons come up in rowA instead, as today) so the fight stays playable. Remember the open state per
   mode for the session only (not persisted).
3. In the plane specifically (mode 'plane'): visible = stick (the yoke), look area, the throttle lever, the interact
   button; the tray = camera, cockpit (switch panel), nav, landing. Report to the seaplane worker (via your report)
   that the chase-view instrument strip (`.sp-strip`) should sit at the top centre at 0.8 scale on touch (it already
   does; if it collides with the collapsed rail move it left) and that the cockpit tips should not stack with the fold.
4. Tests: contextButtons split into { primary, tray } per mode (export a `splitButtons( set, mode )` helper), the fold
   state machine (open on drag / tap, auto-close timer, fight hides the handle) as a pure helper with fake time. Vite
   build check as in COMMON.md. Report under 250 words.
