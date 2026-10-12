# Common rules for v3 workers (Hyptile Island, D:\tidewater-hyptile)

Project: a browser game forked from Tidewater. Own WebGPU/WGSL engine in src/engine (a THREE-style math
namespace from the engine; follow existing imports). Node 22, Vite. Read docs/PLAN.md (v3 tables and the
cross-worker APIs at the end) and src/features/Features.js (event vocabulary in its header) first.
Feature modules under src/features/* follow `export function install( app, features )` returning an object
with optional update(dt), toJSON()/fromJSON()/reset()/dispose(), lights[], panel methods; use
features.interactable (E prompts), features.claimKey (keys), features.on/emit (events),
features.panelOpen/closePanels/wantsMouse (UI panels), features.mode / features.sandbox (sandbox, campaign,
multiplayer; sandbox is free).

Libraries: three@0.186.1, three-avbd@0.3.0 (MIT), @dimforge/rapier3d-compat@0.21.0, ws, colyseus@0.18.9, colyseus.js@0.16.22,
@colyseus/schema@5.0.39 are installed and allowed. Any Colyseus work MUST follow the project skill
.claude/skills/colyseus/SKILL.md (0.18 APIs; check the installed version first; its references/ hold the current docs). Drawing goes through the project's engine (no second canvas). Never run npm install (parallel
workers would corrupt node_modules); name any package you need in your report.

Many workers run at once with EXCLUSIVE files. Never edit files you do not own. Root-owned (never edit;
put the exact patch - file, anchor text, replacement - in your report): src/App.js, src/game/Game.js,
src/main.js, src/features/install.js, src/features/Features.js, src/game/HudPanels.js, src/game/GameHUD.js,
src/game/GameState.js, package.json, docs/PLAN.md, releases/.

Cross-worker APIs (call others with optional chaining; they may not exist yet):
- app.netsync?.sendWorldEvent?.( kind, data ) -> everyone; remote arrive as features.emit( 'remoteWorldEvent', { kind, data, from } )
- features.get( 'destruction' )?.raycastSegment( ax, ay, az, bx, by, bz ) -> { t, id, x, y, z } | null; .impulse( x, y, z, radius, energy )
- features.get( 'vfx' )?.splash / spray / smoke / splinters / flash / debris / fire( id, ... ) / stopFire( id ) / bubbles( x, y, z, strength )
- features.get( 'seaplane' )?.marker() -> { x, z, heading } | null; .decorateState( out ); .updateRemote( peers )
- features.get( 'naval' )?.holdBonus?.() (default 1); features.get( 'story' )?.priceMod?.( portId ) (default 1)
- src/i18n/index.js t( key, fallback ) if present, else plain English
- WORLD.ports / WORLD.islands (src/world/WorldLayout.js) grow: read them dynamically, never hard-code the list.

Style: tabs, `fn( a, b )` spacing, short why-comments, match the surrounding file. No standing on-screen
prompts: brief tips/toasts only. Fishing must stay losable. D:\fishing game and D:\tidewater-main are
read-only sources. No credentials. Blender 5.2: D:\blender\blender.exe (headless python scripts under
tools/<task>/, GLBs under public/models/<task>/; render a preview PNG to your scratchpad and look at it).

Do not start dev servers or browsers. Build-check with
`npx vite build --outDir <your scratchpad>\build-<task>` (re-run once if it fails on another worker's
half-written file). Write a plain-node test test/<name>.mjs in the style of test/state-v2.mjs and run it;
run the existing tests that touch your area.

Wave 4 (alpha polish, 2026-10-13): the v3 wave shipped as releases/hyptile-island-3.0-pre; read docs/PLAN.md's
integration log. Read every file you own first (other waves wrote them), keep what is good, change what the brief asks. Report under 400 words: what exists and
works, what you verified, the exact root patches (install.js MODULES entry, App/Game hooks, HudPanels rows,
new event names), and anything unverified.
