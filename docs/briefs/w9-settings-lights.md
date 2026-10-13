# Wave 9C: the settings panel you can actually use, light buttons on touch

Read docs/briefs/COMMON.md first (rules, root-owned files, style, no browsers / dev servers / npm install).
Owned files: src/ui/UI.js (the settings panel: head, tab strip `.tw-tabs`, `.tw-pages`, `.tw-page`, foot - nothing else
in that file), src/ui/ui.css, src/ui/TouchControls.js, src/core/Touch.js, src/i18n/en.js and ro.js (append keys only),
test/feature-mobile.mjs, test/ui-settings.mjs (new, plain node: jsdom is NOT installed - test the pure helpers you
extract, e.g. the tab layout maths and the context-button sets).

User feedback (verbatim): "fix the settings UI for mobile and desktop as you can't really reach the performance tab and
on mobile it's not fixed and can move up/down." And: "Give me light options on mobile like boat lights on and plane
lights on."

1. Settings panel layout. Today the tab strip is a horizontally scrolling row (`.tw-tabs` with overflow) inside a panel
   that itself scrolls; on a phone in landscape the strip drifts while you scroll and the Performance tab (last) is off
   the end. Make the panel a fixed-height flex column: header, tab strip, pages (the ONLY scrolling region: flex 1 1
   auto, min-height 0, overflow-y auto, overscroll-behavior contain), footer. The tab strip never scrolls: it wraps
   onto two rows of chips when the width is short (desktop narrow windows too), every tab always visible and tappable
   (min 40 px high on touch). On touch the panel is position fixed with max-height calc(100dvh - safe insets) and
   must not move with page scroll or the on-screen keyboard; body scroll stays locked while it is open (check how the
   root does it; if nothing does, add touch-action none on the backdrop and overscroll-behavior contain). The
   sticky rule added earlier (`.tw-tabs { position: sticky }`) can go once the strip is outside the scroll region.
   Keep the existing look (glass panel, chips). Desktop: the panel keeps its width; make sure the strip wraps there
   when the window is under ~900 px wide too. The settings panel is opened from the HUD side bar (gear) - keep that.
2. Light buttons on touch (src/core/Touch.js contextButtons + TouchControls BUTTONS):
   - boat mode (mode === 'boat'): a 'lights' button (label 'Lights', code 'KeyL'; root wires L to toggle the boat's
     lights for every hull: report nothing, root does it).
   - plane mode: 'navLights' (label 'Nav', code 'KeyN') and 'landing' (label 'Landing', code 'Semicolon'): these keys
     already work in the cockpit (src/features/seaplane/Seaplane.js COCKPIT_KEYS).
   - the buttons show an "on" state when the snapshot says so: add `boatLights` and `planeNav` / `planeLanding` booleans
     to the snapshot in TouchControls (read app.boatLightsOn and app.features.get('seaplane')?.systems?.nav /
     .landing with optional chaining) and an `.is-on` class on the button.
   Tests: contextButtons sets for boat / plane with and without the flags.
3. While there: the top row's fullscreen / cockpit buttons exist; do not restyle them. Report any Game.js / App.js patch
   you need (expected: none beyond root's L key). Vite build check as in COMMON.md. Report under 250 words.
