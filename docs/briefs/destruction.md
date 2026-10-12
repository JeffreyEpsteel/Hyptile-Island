# Destructible environment with three-avbd (or Rapier)

Owned files: src/physics/** (new), src/features/destruction/** (new), public/models/destructible/**, tools/destruction/**,
test/feature-destruction.mjs. (Nothing of this existed when the previous worker was cut off.)

1. Read node_modules/three-avbd (source, README, LICENSE) and decide: if its solver runs without a three renderer
   (bodies/contacts/joints on three math), wrap it; if it is tied to rendering or too slow on CPU, use Rapier
   (@dimforge/rapier3d-compat, WASM, `await RAPIER.init()`). Explain the choice in src/physics/README.md. Put the engine
   behind an adapter (src/physics/World.js facade; backends in src/physics/avbd/ and/or src/physics/rapier/): addBody
   (box/sphere/convex approx), joints with a break force for jointed assemblies, contacts vs a terrain heightfield
   (heights from app.terrainData - read how Player.js queries ground), buoyancy + drag against an ocean height callback
   so debris floats, sleeping, fixed 1/60 step; <= 300 bodies; target < 2 ms CPU for 100 awake bodies.
2. src/features/destruction: destructible props around the home harbour, Pons Cove (WORLD.pons), the raider camp at
   (127, -71) and the ports (src/world/WorldLayout.js, src/game/ports/Ports.js; keep clear of docks/stalls/paths):
   crates, barrels, fish racks, fences, lean-to huts and dock railings as jointed plank assemblies that break apart, plus
   breakable rock stacks. Draw through the engine with instanced meshes per piece type (see src/world/Props.js, Debris.js,
   src/features/dressing). Each intact prop registers a collider (src/world/Colliders.js) removed/updated when it breaks.
3. Damage: cannonballImpact and explosion events (radius/energy), melee hits (src/features/melee; report a hook if
   needed), the player's boat ramming at speed, the seaplane crashing. Emit propDestroyed { id, kind, x, y, z, by }.
   vfx debris/splinters via optional chaining. Pieces settle, sleep, fade after ~60 s; props respawn after a few in-game
   hours in campaign (sandbox: reset). Persist destroyed ids + respawn times in toJSON/fromJSON.
4. Multiplayer: on local destruction app.netsync?.sendWorldEvent?.( 'propDestroyed', {...} ); on 'remoteWorldEvent'
   kind 'propDestroyed' break the same prop (deterministic ids) without re-broadcasting.
5. Expose raycastSegment( ax, ay, az, bx, by, bz ) -> { t, id, x, y, z } | null and impulse( x, y, z, radius, energy ).
6. Test: stacking stability, a box resting on a heightfield, joint breaking above threshold, raycastSegment hits, sleep.
Report root patches: install.js MODULES entry, awaiting physics init in App, any Game hooks.
