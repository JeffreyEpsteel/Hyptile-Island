# Wave 12E: combat you can feel - attacks, blocks, shooting

Read docs/briefs/COMMON.md first (rules, root-owned files, style, no browsers / dev servers / npm install), then
docs/briefs/w4-combat.md (what wave 4 built: lock-on, telegraphs, dodge, parry, tokens, hitstop), src/features/melee/**
(index.js, PlayerCombat.js, Raider.js, Dummy.js, LockOn.js, Telegraph.js, MeleeHud.js, MeleeData.js, Peace.js),
src/features/firearms/** (wave 9B: Firearms.js _input / fire / _apply, Hitscan.js, FirearmsData.js), src/game/Game.js
(read only: how the left / right buttons reach melee, firearms and the rod; `playerAction`), src/core/Input.js (read
only: mouseDown / rightDown; the pointer lock), src/player/Avatar.js (read only: montages), src/features/vfx (flash,
splinters, blood? no: this game has no blood; use sparks / dust).

Owned files: src/features/melee/**, src/features/firearms/**, test/feature-melee.mjs, test/feature-combat.mjs,
test/feature-firearms.mjs, test/feature-combat-play.mjs (new). Report patches for Game.js / Input.js / HUD / Touch under 250 words.

User feedback (verbatim, after playing waves 9-11): "I need you to also fix combat. Attacks, blocks, shooting." Earlier:
"combat is still unpracticable / unplayable". Root checked the engine paths in the browser: a left click does start a
swing (PlayerCombat state 'swing'), a right click does raise the guard (`guarding` true, the block montage plays), and the
pistol fires once the peace-zone gate was relaxed (root did that: a shot at the sky / sand / props is allowed on the home
island, only a shot at a person who is not a raider is refused). So the inputs reach the code; what the player feels is
the problem. Make it feel like a fight:

1. A node playthrough harness (test/feature-combat-play.mjs): the player (scripted inputs: approach, swing, guard at the
   telegraph, dodge, shoot) against 1, 2 and 3 raiders of tiers 1-3, 60 Hz, with assertions: a tier-1 raider dies in
   3-4 swings; a tier-3 in 6-8; a guard held during the telegraph blocks the blow (no damage, 0.15 stamina); a dodge
   during the last 0.25 s of the wind-up takes no damage; a parry (guard raised within 0.2 s before the blow) staggers
   the raider for 1 s; an unguarded tier-1 blow costs ~12 % health; the player beats 3 tier-1 raiders with a scripted
   "block then swing twice" loop without dropping under 40 % health; the pistol kills a tier-1 raider in 2 body shots or
   1 head shot at 10 m and the musket in 1 body shot. Tune MeleeData / FirearmsData until these hold and keep them as
   the regression gate. Fix whatever the harness exposes (a swing that whiffs at 1.8 m, a block that drops, tokens
   that let three attack at once, a telegraph too short to read).
2. Feel: every swing that connects gets hitstop (freeze both 60-90 ms), a camera kick, a damage number, a hit sound and
   a spark / dust puff at the contact; a whiff gets a swish and a short recovery; the lock-on reticle shows the locked
   raider's health and his telegraph as a ring that fills up to the blow (so the block timing is readable); the guard
   stance is always visible while the right button is held with the rod stowed (even with no enemy near), and the block
   shows a shield flash on a blocked blow; the parry gets a slow-motion 0.3 s at 0.4 speed and a distinct sound;
   getting hit staggers the camera and flashes the screen edge; low health pulses the edge; the player can cancel the
   swing recovery into a dodge.
3. Shooting: a crosshair whenever a firearm is drawn (thin, grows with spread, tightens when aiming), a hit marker on a
   hit (and a different one on a head shot), a kill confirmation, slight aim magnetism (within 2.5 deg of a raider's
   chest at 25 m the shot snaps to it), a reload progress ring and an "R to reload" cue when empty, the pistol usable
   while walking (small spread penalty) and the musket shouldered (walk speed x0.7), hitstop on a kill.
4. Enemies: raiders that are hit while winding up are interrupted (tier 1-2 always, tier 3+ only by a parry or a shot),
   they space themselves (no stacking inside each other), one of three hangs back and throws a rock (a telegraphed
   ranged attack the guard blocks) so guarding matters at range, and a downed raider stays down 2.5 s before getting
   up. Pirate boarding crews use the same.
5. Practice: at the training post E offers "Spar" (today) and "Practice fight": two tier-1 practice raiders spawn on the
   beach (wooden swords, no death: they yield at 1 health, the player at 10 %: a toast "You're down - try again"),
   so the home island stays peaceful but the fight can be learned.
6. Touch: report the context buttons (dodge / guard / fire / aim exist) and anything new.
Tests: the harness above plus the existing melee / combat / firearms tests green. Vite build check as in COMMON.md.
Report under 300 words: the tuning table before / after and what the harness caught.
