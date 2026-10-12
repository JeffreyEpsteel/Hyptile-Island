# Ship modules, v3 combat events, pirates that fight every player

Owned files: src/game/Boats.js (edited), src/world/boat/**, src/features/naval/** (Modules.js exists), public/models/modules/**
(10 SM_Module_*.glb exist), tools/modules/** (build.ps1, convert.py exist), test/feature-modules.mjs. Read all of
src/features/naval/* first (Naval.js, Projectiles.js, Ballistics.js, Ship.js, ShipClasses.js, Brains.js, Hud.js, Loot.js, index.js).
Keep test/feature-naval*.mjs, test/feature-ships.mjs, test/state-v2.mjs, test/feature-trade*.mjs green.

1. The fork's module design: D:\fishing game\Forks\Fishing_Naval_20261007 (grep Source/ for NavalModule / Module /
   Upgrade / Slot, reports/**). Per-hull module slots (by boat id in Boats.js); modules: armour plating (hull hp),
   heavier guns (damage/range), quick reload, reinforced rigging/engine (speed), extra hold (expose holdBonus() -> crate
   multiplier; the trade worker reads it), fish well, lantern rig (night bite bonus; expose a getter), the swivel gun path
   folded in. Prices; state in naval's toJSON/fromJSON; effects through speedFactor, playerHull, playerGun. Fitted module
   meshes on the hulls from public/models/modules where cheap.
2. Yard API for Roid's panel: nv.moduleRows( state ) -> rows { id, label, desc, price, owned, fitted, canBuy },
   nv.buyModule( id ), nv.fitModule( id, slot ), nv.removeModule( id ); report the HudPanels.js "Modules" section as code.
3. Events for all guns (player broadside, swivel, pirates, remote): cannonFired { x, y, z, dir, side, by } and
   cannonballImpact { x, y, z, vx, vy, vz, energy, hit: 'water'|'ship'|'land'|'prop', target }; each projectile step
   call features.get( 'destruction' )?.raycastSegment(...) for props and test terrain height for 'land'; explosion
   { x, y, z, radius, energy } for powder hits if added. Call features.get( 'vfx' )?.* at fire/impact/sinking with
   Effects.js as the fallback.
4. Pirates target the nearest hostile player boat they can see (local or remote via app.remotePlayers / NavalLink),
   host authority kept. A pirates package (src/features/pirates) will spawn named captains through your spawn API:
   keep spawn( classId, opts ) public and document it in a header comment.
5. Sinking: hulls at 0 hp list, settle and sink with a short animation before removal (emit shipSunk as before).
Report root patches.
