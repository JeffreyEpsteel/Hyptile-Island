# Hyptile Island

The $HYPTILE game: an island fishing adventure that runs in your browser. It is our own creation, grown out of our
Unreal game *Upside-Down Fishing* and its naval fork, rebuilt for the web with a lot of AI help and a long list of
open-source projects that we credit below. You play one of the eight Hyptile-family characters. Wake up at Jade
Landing with a rod, earn a boat from Captain Roid, take PoorGoat's quests out past the reef, sail eight islands,
fight pirates, fly a seaplane, run a trading route and meet your crew on a universe server.

**Play now:** https://jeffreyepsteel.github.io/Hyptile-Island/ (nothing to install). Desktop: Chrome or Edge. Phones and
tablets: Chrome on Android, Safari on iOS / iPadOS 26+, in landscape, with touch controls; "Add to Home Screen"
installs it.

**Host a universe or play offline:** download the alpha from [Releases](https://github.com/JeffreyEpsteel/Hyptile-Island/releases),
install [Node.js 22](https://nodejs.org/), then run `PLAY_HYPTILE_ISLAND_3.0-alpha.cmd` or `HOST_UNIVERSE.cmd`
(see `HOSTING.md` in the download).

![Fishing off the pier at golden hour](docs/screenshot.jpg)

## What's in the alpha (3.0)

- **Fishing**: shore, pier, reef and deep water with their own species, plus the six Upside-Down fish (Silver Minnow,
  Rootfin, Lantern Carp after dark, Upside-Down Eel, Glass Perch, Crooked Cod); a tension fight and a marker-timing
  fight, both losable.
- **Boats and ships**: skiff, canoe, cutter, launch, lobster boat, trawler, sloop and brigantine from Captain Roid's
  yard, with modules (armour, guns, reload, rigging, hold, fish well, lantern rig). Boats sink at zero hull and leave a
  wreck you can salvage.
- **Seaplane**: a jade floatplane from the hangar west of the pier; it takes off from water and lands on the Inverted
  Isles lagoon.
- **Eight islands**: Hyptile, Pons Cove, Gull Rock, Saltmarsh Key, West Haven, The Shrine, Quiet Shoal and the Inverted
  Isles, where upside-down rocks float over a lagoon with roots and upward waterfalls.
- **Pirates and combat**: sixteen named captains with dens on the outer islands, broadsides with an aim assist,
  boarding fights, lock-on melee with parries and dodges, a peaceful home island with a training post.
- **Trade**: sixteen goods with per-port legality, customs inspections, hauling contracts, loans, rival traders, crew
  wages and bait; markets at every port.
- **Quests and people**: thirty-nine quest chains with conversations and NPC memory; residents with daily routines;
  a tavern with rumours and a dice game; a crafting bench. PoorGoat buys the fish, Ethena Prosper runs the chandlery.
- **Death**: you wake at Jade Landing; your sea chest with the fish, cargo and money stays where you fell, marked on your
  map until you claim it.
- **Destructible world** on Rapier physics; a full-screen **world map** (M) in the minimap's style; **night** with
  bioluminescent wakes, lanterns and the Gull Rock beam; a UE5-style **animation graph** with contact IK.
- **Multiplayer** on Colyseus: crew rooms by code, or a persistent universe you host (server-side saves, wrecks,
  markets and pirates persist).
- **Mobile**: touch controls (a stick, look by dragging, context buttons, a throttle lever), responsive HUD and panels,
  a mobile quality tier, installable as a web app. See `docs/MOBILE.md`.
- **Accessibility**: key remapping, UI scale, captions, colour-blind palettes, hold or toggle, a fishing assist (off by
  default), English and Romanian. Auto quality picks a tier for your GPU.

Full notes per build: `releases/NOTES-*.md`. The continuation plan for contributors is `docs/PLAN.md`; the feature
briefs are in `docs/briefs/`.

## Controls

| | |
|---|---|
| On foot | W A S D move · Shift sprint · Caps walk · Space jump · E interact · R rod · left click cast, hook, reel · K crew |
| Fight | left click swing · right click guard (hold; time it to parry) · Q dodge |
| Boat | E board, then the helm · W S throttle · A D steer · Z / X port / starboard broadside · B board a struck pirate |
| Seaplane | Shift throttle up · C throttle down · W S pitch · A D roll · , . rudder |
| Panels | M map · J journal · I cooler · G spyglass · Esc menu · H settings · F1 all controls · Ctrl+S quick save · F11 fullscreen |

## Running from source

```
npm install
npm run dev          # http://127.0.0.1:5189
npm run server       # the Colyseus relay / universe on 8765 (see server/README.md)
npm test             # the headless test suite
npx vite build       # dist/
```

Pushes to `main` build and deploy to GitHub Pages (`.github/workflows/pages.yml`).

## Credits

Hyptile Island is the project owner's game, converted from the owner's Unreal project *Upside-Down Fishing* (UE 5.8)
and its naval fork: the characters, Captain Roid, the ships and modules, the authored animations, the key art and
the design are ours. Everyone and everything that helped the conversion, in no particular order:

**Made with**
- Claude Code by Anthropic (Fable, Opus and Sonnet agents): root integration and most of the browser code.
- OpenAI Codex / ChatGPT (GPT-6.1 workers) and OpenCode (free catalog models: MiMo, Space Bunny) during the Unreal
  and naval-fork phases; JEV game-dev assistance through OpenRouter.
- Unreal Engine 5.8 (the original game), Blender 5.2 (models, rigs, retargeting), ComfyUI with TRELLIS.2 (character
  and prop generation), ElevenLabs (text-to-sound effects and Captain Roid's clicks).

**Open source we built with**
- [Tidewater](https://github.com/dgreenheck/tidewater) by DRG Software Solutions LLC (dgreenheck), MIT: the WebGPU /
  WGSL engine, the FFT ocean, sky and shore shaders we started from. Most of the game above it is new, but the engine
  still draws it.
- [three.js](https://github.com/mrdoob/three.js) (MIT): the SMAA / FXAA ports and lookup textures; installed for math.
- [Rapier](https://github.com/dimforge/rapier) by Dimforge (Apache-2.0): the destructible-world physics.
- [Colyseus](https://github.com/colyseus/colyseus), [@colyseus/sdk](https://github.com/colyseus/colyseus.js),
  [@colyseus/schema](https://github.com/colyseus/schema) and the [Colyseus agent skill](https://github.com/colyseus/skill)
  by Endel Dreyer (MIT): the multiplayer server and client.
- [three-avbd](https://github.com/sbobyn/three-avbd) by Steven Bobyn (MIT), with Chris Giles' AVBD demos: evaluated
  for the destruction physics; not shipped.
- [ws](https://github.com/websockets/ws) (MIT), [Vite](https://github.com/vitejs/vite) (MIT),
  [node-webgpu / Dawn](https://github.com/dawn-gpu/node-webgpu) (MIT / BSD-3-Clause, tests only).
- Microsoft Rocketbox Avatar Library (MIT): motion-capture clips retargeted onto our rig; Poly Haven (CC0) scans and
  textures; Freesound recordists (CC0) field recordings; Google Fonts (Inter, JetBrains Mono, Caveat Brush, Kalam,
  Permanent Marker, Cabin Sketch, Oswald; OFL / Apache-2.0).
- The papers and techniques behind the ocean, sky, anti-aliasing and the AVBD solver are listed in
  [CREDITS.md](CREDITS.md), which also carries every licence text and the same list in full. The game's menus have
  a Credits panel with the same entries.
