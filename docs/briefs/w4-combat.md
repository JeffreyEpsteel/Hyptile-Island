# Wave 4: combat done right, a peaceful start island

Owned files: src/features/melee/**, src/features/pirates/**, src/features/boarding/**, src/features/naval/Brains.js, Hud.js,
Ballistics.js, src/features/naval/AimAssist.js (new), src/game/CameraFeel.js (combat kicks only), test/feature-melee.mjs,
test/feature-pirates.mjs, test/feature-boarding*.mjs, test/feature-combat.mjs (new). The death worker owns Naval.js /
Ship.js / Projectiles.js (report patches). The animation worker owns src/player/Avatar.js and adds an animation graph:
avatar.playMontage( name, { blendIn, blendOut, rate, slot: 'upper' | 'full', onEvent } ) and
avatar.setLocomotion( { speed, strafe, turn } ) — call them with optional chaining and keep the old action API as a fallback.

1. No NPC attacks on the start island: the raider camp at (127, -71) is on the main island next to spawn. Move the raiders
   off the home island: their camp becomes an abandoned camp (props only) and raiders live at the pirate dens on the outer
   islands (pirates/Dens.js) plus the shoals. A `peaceful` zone covers the whole home island and its harbour (melee
   setPeaceful, no retaliation raids there, pirates never enter the home bay, hostile boarding only beyond the reef).
   Keep the melee tutorial reachable: a sparring dummy / "training post" at the harbour where you can practise safely.
2. Melee done right: soft lock-on to the nearest enemy in the facing cone (camera-assisted strafing, a subtle reticle),
   readable telegraphs (wind-up flash + sound) with reaction windows, a dodge with i-frames and a stamina cost, a block
   that parries on a well-timed press (stagger the enemy) and chips on a late one, hit reactions and hitstop (CameraFeel
   kick + avatar montage), damage numbers already exist (keep), a player health bar that only shows in combat, enemies
   that circle and flank instead of stacking (separation + token system: at most 2 attack at once), a difficulty curve by
   enemy tier, controller mapping (triggers/bumpers), a clear defeat (emit playerDied { cause: 'melee', x, y, z } and
   let the death feature respawn you; keep the old pier wake-up only when no death feature is present).
3. Naval done right: an aim assist (lead + arc preview as a faint line of dots over the water when at the helm, a ranging
   readout, hit/miss feedback), a clearer reload and battery state in Hud.js, pirate brains that keep their broadside
   bearing and run when outgunned, boarding fights that use the new melee (tokens, parry) on the deck.
4. Tests for lock-on, token limit, parry windows, peaceful zone, aim lead.
Report root patches (Game.js if the player action routing changes, HUD hooks). Under 400 words.
