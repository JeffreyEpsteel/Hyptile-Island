# WP-F: saves, performance tools, gamepad, feel (docs/UNREAL_PARITY.md rows S1, S3, U9-U12, X4, P1, P2)

Owned files: src/game/SaveVault.js, src/ui/SaveManager.js, docs/SAVE_FORMAT.md, src/core/Gamepad.js, src/ui/Glyphs.js,
src/game/CameraFeel.js, src/ui/DebugPanel.js, src/core/ErrorLog.js, tools/perf/**, test/save-vault.mjs, test/perf-scenarios.mjs.
(Nothing new existed when the previous worker was cut off.) src/ui/MainMenu.js is the universe worker's (server-side saves:
your tools must handle local slots and a profile JSON from the server); src/core/Input.js, AppUI.js, PauseMenu.js are the
accessibility worker's (expose deadzone/sensitivity setters in Gamepad.js for them). Keep test/state-v2.mjs green.

Cover: (1) SaveVault.validateSave( json ) for the whole v2 save (types, ranges, known ids, size), preflight before load
with rollback to the last good backup, numbered migrations in docs/SAVE_FORMAT.md, rolling backups per slot;
(2) SaveManager panel: slots with mode/date/money, export .json, import (validated), duplicate, delete with confirm,
restore backup - root wires it into pause/main menus; (3) controller glyphs swapping on the last device used
(Xbox/PlayStation by gamepad id) with glyph( action ); rumble API (strike, cannon, hits) and deadzone/sensitivity setters;
(4) CameraFeel: recoil, broadside hit and boarding hitstop kicks, kick( type ), respecting reduce-motion; (5) sandbox-only
DebugPanel (time, XP, money, give fish, teleport to WORLD.ports, save now) on a free key; (6) ErrorLog ring buffer of
window errors/unhandled rejections with an in-game viewer and copy button (no network); (7) tools/perf: all-features
scenario runner via ?bench (naval fight, storm, night, crowd) recording frame times per scope, plus a node test for the
scenario definitions; P2 culling candidates from numbers or listed as unverified.
Report root patches.
