# Wave 16B: the guide, the controls and the tips know everything built since wave 9

Read docs/briefs/COMMON.md first, then src/game/Guide.js (the welcome guide's pages: it still says fish, earn a boat,
grow the crew), src/ui/UI.js + MainMenu.js (Controls F1, "Replay the guide", the menu's three cards), src/i18n/en.js +
ro.js (every string), src/core/Touch.js + src/ui/TouchControls.js (read only: the touch buttons and their labels),
src/game/GameHUD.js (read only: how tips / toasts are shown: `game.toast`, the TIP card), src/features/Features.js
(the events), docs/PLAN.md waves 9-15 (what exists: cannons, boarding, firearms, crew, lights, planes with four airframes
and cockpits, the parachute, crashes and recovery, Tidemark and Blackwater, quests, harbour agents, the economy window,
hijacking, the calm zone, climbing, flares and rescue, the shared universe), src/features/story (read only: the journal
holds tips already: the parry tip), src/features/a11y or ui/Accessibility.js (read only: the prompt key mapping).

Owned files: src/game/Guide.js, src/i18n/en.js, src/i18n/ro.js, src/ui/UI.js (the controls overlay only),
src/game/Tips.js (new: contextual one-time tips), test/feature-guide.mjs (new), test/i18n-*.mjs (additive if present).
Report Game.js / GameHUD.js / MainMenu.js patches under 200 words with exact anchors.

The user's words: "fine tuning of every aspect implemented already". New players cannot find the new systems:
1. The welcome guide gains pages (short, with the key glyphs): sailing and the harbour agents (a replacement boat at any
   dock), combat (cannons from the helm, ramming, boarding and taking a ship, pistol and musket, the practice fight),
   crew posts, the planes (the hangar, four airframes, the airstrip at Tidemark, the parachute `'` twice, crashes and
   recovery), the islands and quests (the boards, the journal, Tidemark and Blackwater, the calm waters round home),
   trade (the harbourmaster's board, the best route, dues and insurance), in the water (climb onto anything, flares and
   the launch), multiplayer (the shared universe). Keep each page to five lines; the guide stays skippable and replayable.
2. The Controls overlay (F1) lists every bound key by context (on foot, helm, deck, cockpit, swimming, aiming, touch) and
   reads the actual bindings (the a11y prompt map) rather than hard-coded letters.
3. Contextual tips (Tips.js): one-time, dismissable, never standing: the first time you swim 20 m from any shore ("Space
   climbs onto anything that floats; a flare brings the harbour launch"), the first crippled pirate alongside ("B boards
   her; after the fight you can take her"), the first time at a foreign dock ("Roid & Co.'s agent sells and recovers
   boats here"), the first market open ("the board shows the best loads from here"), the first take-off ("' twice bails
   out above 60 m"), the first night at sea with lights off ("L lights the boat"), entering the calm waters' edge
   ("beyond the reef the pirates hunt"). Each fires once per save (toJSON), with a touch variant of the text.
4. Romanian for every new string (ro.js), and the i18n test checks both files carry the same keys.
5. Tests: the guide's pages and their key glyphs, tips fire once and save, the controls overlay reads bindings, i18n key
   parity. Vite build check. No browsers. Report under 250 words.
