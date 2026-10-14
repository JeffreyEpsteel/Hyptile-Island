# Wave 18D: more weapons

Read docs/briefs/COMMON.md and w18-common.md first, then src/features/firearms/** (pistol and musket: FirearmsData,
Firearms, Hitscan, WeaponMesh, GunPose (wave 17B: aim / kick / reload pose clips), GunHud, GunAudio, the shop rows, the peace
zone), src/features/melee/** (PlayerCombat: swing / block / parry / dodge with the paddle; MeleeData; Raider; Practice),
src/features/naval (read only: ship cannons, Ammo, the swivel guns if any, boarding), src/features/netsync (read only: the
gunshot world event), src/player/anim/AnimDef.js + ClipTools.poseClip (read only: pose clips from a base frame + deltas;
worker 18E owns AnimDef), src/features/hijack + pirates (read only: enemies and loot), src/features/trade (read only).

Owned files: src/features/firearms/**, src/features/melee/** (except Raider.js clip choices are 18E-safe: keep its API),
src/features/weapons/** (new if a shared registry helps), public/models/weapons/** (new), tools/weapons/** (new: Blender
scripts), test/feature-firearms.mjs, test/feature-melee.mjs, test/feature-combat.mjs (additive), test/feature-weapons.mjs
(new). Report the HudPanels shop patch, any install / Touch / TouchControls patch, and AnimDef patches for 18E/root.

The user's words: "expand weaponry". Build an arsenal that fits the age of sail world:
1. Melee: cutlass (fast, parry-friendly), boarding axe (slow, breaks guards and doors / props), the paddle stays as the
   free starter, a belaying pin (cheap club), a harpoon (thrust, long reach, can be thrown and pulled back).
2. Firearms: flintlock pistol (exists), musket (exists), blunderbuss (short range spread, knocks back), a long rifle (slow,
   accurate, a scoped-like aim zoom), a double-barrel coach gun? (no: keep to period) a pair of duelling pistols (two quick
   shots), a harpoon gun (fish and boats: pull a small boat or a big fish closer).
3. Throwables: powder bombs / grenades (fuse, arc preview, damage and destruction of props through the destruction
   feature), fire bottles (set a ship's fire through naval's Fire), smoke pots.
4. Boat weapons: a swivel gun on the rail of small boats (aim from the deck, uses powder and shot), chain shot for cannons
   (sails / masts damage), grape shot (crew damage). Through naval's public API only (report patches).
5. Each weapon: a Blender model (low poly, <= 2.5k tris, hand-held socket weapon_r / weapon_l of the roster rig, a 512 px
   texture or vertex colours; Poly Haven CC0 textures allowed), stats in data, a shop row (chandlery for the legal ones,
   Blackwater's black market for the rest, prices in the economy's range), ammo, sounds (synth like GunAudio), hit effects
   through vfx, the hold / aim / attack poses as pose clips in your files (the GunPose.js pattern) so they never A-pose,
   touch buttons (weapon wheel or cycle), keyboard (1-4 quick slots: check claimKey conflicts with emotes' Digit5).
6. Raiders and pirates use some of them (a cutlass guard, a blunderbuss pirate) through Raider's existing weapon hooks.
7. Tests: data, damage and ranges, ammo, shop, a throwable arc and its explosion hitting a prop, melee combos with the new
   reach and guard break, the swivel gun firing through naval. Blender renders of each model READ before reporting.
   Existing combat tests green. Vite build check. Report under 300 words with asset credits.
