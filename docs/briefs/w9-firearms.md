# Wave 9B: a pistol and a musket

Read docs/briefs/COMMON.md first (rules, root-owned files, style, no browsers / dev servers / npm install).
Owned files: src/features/firearms/** (new), test/feature-firearms.mjs (new). Read, do not edit: src/features/melee/**
(the raiders, hit API, lock-on, Peace.js), src/features/boarding/** (crew on deck), src/game/Game.js (how the rod,
melee and the naval guns claim the mouse and keys: `wantsMouse`, `inp.mouseDown`), src/player/Avatar.js (montages,
attachment of the fishing rod: mirror how the rod is held), src/game/HudPanels.js (Ethena Prosper's chandlery rows:
`gearGate`, `data-rodfix`) and src/game/GameState.js (money: state.spend / earn, `free` in sandbox). Everything you
need there: report exact patches (file, anchor text, replacement) under 300 words; root integrates and plays it.

User request (verbatim): "I also want a pistol and a musket that I can buy and fight them." Combat is "still
unpracticable"; firearms must make pirate crews and raiders beatable without being a free win.

Design to follow:
- Two weapons: flintlock pistol (price ~$180; one shot, 1.4 s reload, ~22 m effective, 35 damage, falloff past 15 m,
  spread 2.5 deg, 1.0 deg when aiming) and musket (~$420; one shot, 3.2 s reload, ~70 m, 70 damage, spread 1.2 / 0.4 deg,
  slower draw, slows walking a little while shouldered). Powder and shot are consumables: a "cartridge pouch" row at
  the chandlery, 12 per purchase ($30), sandbox free; GameState keys you need: report them (firearms: { owned: {},
  shots: n }), serialise through your own toJSON/fromJSON on the feature and ask root to call them from the save.
- Flow: G draws / holsters the weapon in hand (claimKey 'KeyG', 'firearms'); drawn: left button fires (claim the mouse
  through the same convention melee uses so the rod does not cast), right button aims (narrower spread, a 1.3x zoom
  through app.camera.fov if the camera module allows it, else just the spread; restore on release), R reloads when
  empty (the rod's R is only live when the rod is equipped: check Game.js). A hit is a hitscan along the camera ray with
  the spread: first test raiders / boarding crew (melee exposes its enemies: read Raider.js / index.js for the list and
  the damage entry point; use it, do not re-implement health), then pirate ships' crew on deck (naval ships in range:
  a hit on the deck box kills one crew member if the ship exposes crew, else 2 hull damage), then destruction props
  (features.get('destruction')?.raycastSegment ...), then the water (vfx.splash) / ground (vfx.debris 'dust' if it exists).
  Headshot x1.6 on humanoids if the melee data gives a head height, else none.
- Feel: muzzle flash (vfx.flash), smoke puff (vfx.smoke), a sharp synthesised report through the project's audio
  (see src/features/melee/CombatAudio.js for how cues are built; make your own small module), a camera kick
  (app.cameraFeel?.kick), a reload clack sequence; avatar: avatar.playMontage?.( 'shoot' | 'reload', { slot: 'upper' } )
  with optional chaining and a plain pose fallback (right arm raised: look at how the rod sets an arm pose).
- The weapon in hand: a simple procedural mesh (barrel, stock, lock) from engine primitives with the project's standard
  material, attached like the fishing rod. Keep it under 600 triangles.
- Enemies react: raiders already have hit reactions; a shot interrupts a wind-up like a parry would (call the same
  stagger if exposed). Pirates on a boarded deck stay melee; the player's gun is the edge.
- Peace: no firing inside the peaceful home island zone except at the training dummy (melee/Peace.js tells you the
  zone); a toast "Not here" otherwise.
- Touch: report two context buttons for the owner of TouchControls: 'fire' (left button) and 'aim' (right button) shown
  when the weapon is drawn (expose `firearms.drawn` for the snapshot), plus 'draw' (KeyG) when a weapon is owned.
- Tests (plain node, no DOM): damage falloff, spread cone, reload timing, ammo bookkeeping, peace zone refusal, save
  round trip. Vite build check as in COMMON.md. Report under 300 words with the HudPanels / Game.js / GameState patches.
