# Wave 9A: ship collisions with damage and destruction, cannons you can aim, cripple-then-board

Read docs/briefs/COMMON.md first (rules, root-owned files, style, no browsers / dev servers / npm install).
Owned files: src/features/naval/** , the player's boat controller (find it: `app.boatCtl`, its class lives under
src/world/boat/ or src/boat/; you own its collision response only), test/feature-naval*.mjs,
test/feature-collisions.mjs (new). Everything else: report exact patches (file, anchor, replacement) under 300 words.
Root (me) integrates, builds, plays it in the browser and ships. Pure logic must run headless in node (the naval
feature already does: test/feature-naval.mjs shows the harness).

User feedback this fixes (verbatim): "Collisions between boats don't happen, they just clip through each other. I want
collisions with damage and I wanna see the destruction." "I can't control the cannons to shoot pirates, I want it
possible to damage them and then board them."

1. Collisions (the big one). Ship.js already has `yawBox( ... )` hull boxes (hullBox / deck). Each frame test the player's
   boat (BOATS[id].length / beam from src/game/Boats.js, app.boatCtl position / yaw / velocity) against every alive Ship,
   and ships against each other (O(n^2) over < 20 ships is fine; skip pairs further than length sums apart). Use a
   2-D oriented-box overlap (SAT on the water plane, the hulls are near the same height) with the penetration depth and
   axis. Resolve: push the two apart along the axis by inverse-mass ratio (Boats.js mass; ship classes have a mass or
   derive one from hp), then apply a relative-velocity impulse (restitution ~0.15, tangential friction ~0.3) so they
   bounce and rub instead of passing through; the player boat's controller gets the impulse as a velocity change (own
   that code path in its file) and a yaw-rate kick; ships get it in Ship.js. A grounded / moored ship still blocks.
   Damage: on a new contact (not every frame while rubbing) both take hull damage from the closing speed along the
   normal: dmg = k * m_other / (m_self + m_other) * v_closing^2, tuned so a brigantine ramming a skiff at 8 m/s
   nearly sinks it while a 2 m/s nudge is a scratch (~2 % hull); a bow-on hit does x1.5 to the other hull, the rammer
   takes x0.6. Route player damage through naval.damagePlayer( amount, 'ramming' ) and ships through their damage
   path (ship.hit / takeDamage, whichever exists; keep the loot / sinking flow). Minimum 0.4 s between damage events per
   pair. Pirate brains: ramming is a real tactic for them when their guns are reloading and they are heavier than the
   target; merchants avoid it (a short avoidance steer when a closing contact is predicted within 3 s).
2. Seeing the destruction: at every damaging contact call features.get('vfx')?.splinters( x, y, z, strength ),
   ?.debris( x, y, z, strength, 'wood' ) and ?.splash; a camera kick through app.cameraFeel?.kick?.( ... ) if present
   (src/game/CameraFeel.js, read its API), NavalAudio crunch / creak (synthesised, like its existing cues). A ship past
   50 % damage shows it: use the existing damage decoration if Ship / Models.js has one, else add a listing roll and a
   smoke source via vfx.smoke at the hull; at 0 hp the existing sinking plays (keep it) plus a burst of floating planks
   (vfx.debris 'wood' x6) and splinters. If features.get('destruction') exposes impulse( x, y, z, radius, energy ), call
   it so dock props near a crash fly.
3. Cannons you can aim. Keep Z / X. Add direct aiming at the helm: while the right mouse button (or the touch 'aim'
   state: `app.input.aimHeld` if the touch layer sets it, read with optional chaining) is held, the gun elevation and
   the chosen side follow the camera look direction (the side whose arc contains the look direction; elevation from the
   camera pitch clamped to the gun's range), the AimAssist dots show that arc instead of the auto-lead, and the left
   button fires that side. Without aiming, the current auto-aim stays. A crosshair / ranging readout in Hud.js while
   aiming. Make sure a swivel gun is always available in the sandbox (naval.playerGun.owned = true there) and the yard
   module remains the campaign path; say in the HUD when you have no gun ("No gun - Captain Roid sells a swivel gun").
4. Damage then board. Time-to-cripple must be playable: a sloop should take ~4-6 swivel hits to reach the boarding
   threshold (RULES.cripple 0.25 in src/features/boarding/BoardingData.js; you do not own boarding - report any change
   you need). Show the target's hull as a bar with the 25 % mark in Hud.js while a pirate is in range, and emit
   `shipCrippled { id }` when it crosses (boarding listens or will). Pirates that are crippled stop shooting.
5. Tests: SAT overlap + impulse (two boxes closing at 5 m/s separate and both lose hull), damage scaling by mass and
   speed, no damage while rubbing, aim side/elevation from a look vector, cripple threshold event. Run the naval and
   boarding tests. Vite build check as in COMMON.md.
