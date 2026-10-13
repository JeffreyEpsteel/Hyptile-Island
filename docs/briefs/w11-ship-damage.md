# Wave 11A: ammunition, per-section ship damage, fire and flooding

Read docs/briefs/COMMON.md first (rules, root-owned files, style, no browsers / dev servers / npm install), then
docs/UNREAL_PARITY.md rows V3, V4, V5 (what the Unreal game had), the headers of src/features/naval/Naval.js, Ship.js,
Collisions.js, Brains.js, Hud.js, Models.js, src/features/crew/Crew.js (gunners fire through naval.crewFire),
src/features/trade/goods.js (the 'powder' good exists), src/game/HudPanels.js (Captain Roid's yard rows: yardExtras,
root-owned: report patches), src/features/vfx (fire / stopFire / smoke / splash / bubbles), src/features/boarding (crew
counts), src/features/seaplane/Crash.js (how wave 10 split a model into flying parts: copy the pattern for a falling mast).

Owned files: src/features/naval/** (new files Ammo.js, Sections.js, Fire.js, Flood.js), test/feature-naval*.mjs,
test/feature-shipdamage.mjs (new). Report patches for HudPanels (yard rows), Game.js hooks, GameState keys, crew, under 300 words.

Design (follow it):
1. Ammunition. Powder and shot are a finite stock aboard: `naval.ammo { rounds, max }` per hull (skiff / canoe 0, cutter 12,
   launch 12, lobster 16, trawler 24, sloop 40, brigantine 60), bought at the yard ("Powder and shot x12, $60"; a 'powder'
   crate from the trade hold refills 24 rounds), free in the sandbox but still finite (refill at the ramp / yard). Every
   broadside spends one round per gun fired; the crew's gunners spend the same stock; at zero the guns click, the HUD says
   "Out of shot", the crew gunners stop. AI ships carry their own finite rounds too (class-sized) and fall back to ramming
   / fleeing when dry (Brains). Persist in naval.toJSON.
2. Sections. Each Ship (and the player's hull) gets sections with their own points: hull (the existing hp), rudder, sails
   (rigging), mast, guns-port / guns-starboard. A ball's hit location picks the section by where it strikes (above the
   sheer: sails / mast / guns by z; below: hull; astern: rudder 30 %). Effects: rudder < 40 % halves the turn rate, 0 =
   no steering (drifts straight); sails < 50 % halve the top speed, 0 = adrift (motor boats: the engine section instead);
   a mast at 0 falls (the mast node detaches and drops over the side like Crash.js parts, with splinters) and the sails go
   to 0; a gun section at 0 silences that broadside. The yard repairs sections with the hull ("Rigging and rudder repairs").
   The HUD target bar shows the sections as small pips when a pirate is in range. Pirates (Brains) prefer the player's
   sails when running away and the hull when closing; the player gets an aim option: while aiming, Tab cycles hull /
   sails / rudder and the lead adjusts the elevation (report the key through claimKey).
3. Fire. A hit from a brigantine's big guns (10 %) or a ramming crash (speed > 7) can start a fire at the contact: a fire
   source on the hull that grows (0 -> 1 over 40 s), burns hull points (0.5/s at full), spreads to sails (sails lose 2x),
   shows vfx.fire + smoke, and goes out by itself after 90 s unless it reaches the magazine (ammo > 0 and fire > 0.8 for 10 s:
   an explosion vfx.flash + splinters + heavy hull damage + the ammo is gone). The player douses it: an E interactable
   "Douse the fire" at the rail when on deck (3 s channel, bucket; repeatable) or by heading into the wind at speed (wind
   over the deck slows the growth). AI crews douse their own after 20-40 s by crew count.
4. Flooding. Below 35 % hull water comes in: `flood` 0..1 rises 0.01/s per 10 % under the line, slowing the ship (speed
   x (1 - 0.5 flood)) and lowering her in the water (pose offset); at 1 she sinks through the existing sinking flow even
   with hull points left. Pumping: an E interactable "Man the pump" on deck (channel: -0.04/s while held), the crew's
   posted members pump when no enemy is in range; repairs at the yard drain it.
5. Tests: ammo spend / dry / refill, section pick by hit point, rudder and sail effects on turn / speed, mast fall once,
   fire growth / magazine / dousing, flood rise / pump / sink, AI dry-gun behaviour, save round trip. All existing naval,
   collisions, crew, boarding tests stay green. Vite build check as in COMMON.md.
