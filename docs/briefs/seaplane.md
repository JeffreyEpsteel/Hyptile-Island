# Seaplane: takes off from and lands on water

Owned files: src/features/seaplane/** (Flight.js exists, ~600 lines), public/models/seaplane/**, tools/seaplane/**,
test/feature-seaplane.mjs, and src/player/Player.js ONLY for a minimal 'plane' mode passthrough (seated pilot pose,
camera handoff; keep the other modes untouched).

- Model: stylised high-wing single-engine floatplane (Beaver-like), jade green and cream, propeller as its own node
  (spun in code); under ~15k tris; procedural Blender build exported GLB. See how boats load/draw models
  (src/world/BoatModel.js, src/world/boat/*, loadGLB in src/engine).
- Flight model (Flight.js, pure logic, node-testable): rigid body, lift 0.5*rho*v^2*S*CL(alpha) with stall past ~15 deg,
  induced + parasitic drag, throttle thrust, pitch/roll/yaw moments with damping, gravity. On water: float probes from the
  ocean height (src/ocean/WaterQuery.js, how BoatController.js samples water; 128 queries shared, use <= 4), buoyancy,
  hydrodynamic drag that drops once on the step so takeoff needs ~25-30 m/s, water rudder for taxiing. Touchdown with
  sink < ~3 m/s is fine, harder bounces and damages; terrain contact (app.terrainData, see Player/BoatController) or a
  hard water hit is a crash: toast, plane back at its ramp, repair cost in campaign (free in sandbox).
  Emit planeTookOff / planeLanded { id, onWater }.
- Controls via features.claimKey (existing claims: E interact, R rod, Z/X broadside, B board, J journal, M world map,
  Caps walk): throttle Shift/Ctrl, W/S pitch, A/D roll (water rudder when taxiing), yaw on free keys, gamepad
  sticks/triggers (src/core/Gamepad.js). E at the plane boards as pilot; exit only when slow on water or at the ramp.
- Camera: chase spring arm (reuse Player's approach), first-person cockpit when Player's view is first person.
- Purchase: a seaplane ramp + small hangar at the water's edge near the home harbour (clear of WORLD.boatDock berths,
  stalls and the yard; keep coordinates in your module). Panel at the ramp (E): $18,000 campaign, free sandbox;
  ownership in toJSON/fromJSON. Hangar colliders via src/world/Colliders.js.
- Audio: synthesized engine drone with throttle pitch and prop wash (src/audio patterns; respect mute).
- Multiplayer: decorateState( out ) adds out.plane = { p:[x,y,z], q:[x,y,z,w], thr } while flying/taxiing;
  updateRemote( peers ) draws other players' planes (read src/net/RemotePlayers.js, src/features/netsync/*).
- marker() for the maps; vfx spray on takeoff/landing (optional chaining).
Report root patches: install.js MODULES entry, App/Game hooks (routing input while flying, suspending walk/boat controls).
