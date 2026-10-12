# Hyptile Island

The $HYPTILE game: an island fishing adventure that runs in your browser. You play one of the eight Hyptile-family
characters. Wake up at Jade Landing with a rod, earn a boat from Captain Roid, take PoorGoat's quests out past the
reef, sail eight islands, fight pirates, fly a seaplane, run a trading route and meet your crew on a universe server.

**Play now:** https://jeffreyepsteel.github.io/Hyptile-Island/ (Chrome or Edge with WebGPU, nothing to install).

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

Hyptile Island is built on **[Tidewater](https://github.com/dgreenheck/tidewater)** by DRG Software Solutions LLC
(dgreenheck): its tropical island, FFT ocean, sky, village and fishing are the foundation, and its own WebGPU / WGSL
engine still draws everything. The game's design comes from the owner's Unreal project *Upside-Down Fishing* and its
naval fork, including Captain Roid's model and click-voice; the Hyptile family characters and the key art are the
owner's. Third-party work: three.js (MIT), Rapier (Apache-2.0), Colyseus, @colyseus/sdk and @colyseus/schema (MIT),
ws (MIT), Vite (MIT), the webgpu / Dawn package used by the tests, Microsoft Rocketbox motion capture for the
character animation, Google Fonts (Inter, Caveat Brush, Kalam, Permanent Marker), and the Colyseus agent skill (MIT).
three-avbd (MIT) was evaluated for the destructible world and not shipped. Every entry with its licence text is in
[CREDITS.md](CREDITS.md) and under Credits in the game's menus.
