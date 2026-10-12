# VFX set

Owned files: src/features/vfx/** (VfxSystem.js and one more file exist, ~1100 lines), new src/fx/Vfx*.js files only (do
not edit existing src/fx files), test/feature-vfx.mjs. Read but do not edit: src/fx/* (BoatSpray), src/features/naval/Effects.js,
src/features/weather/RainFX.js, src/world/Debris.js.

YOU implement: features.get( 'vfx' ).splash( x, y, z, strength ), .spray( x, y, z, strength, dirX?, dirZ? ), .smoke, .splinters,
.flash, .debris( x, y, z, strength, kind? ), .fire( id, x, y, z, strength ) / .stopFire( id ), .bubbles. Also react to events
(cannonFired -> flash + smoke at the muzzle; cannonballImpact -> splash on water / splinters on ship / dust + debris on
land/prop; explosion -> flash + smoke + debris; propDestroyed -> dust; shipSunk -> bubbles + foam; planeTookOff/planeLanded
-> spray; fishCaught -> small splash). De-duplicate a direct call plus the matching event at the same spot within ~0.1 s.

1. Pooled GPU-friendly particles: one to three instanced billboard draws with per-instance data in a storage buffer, soft
   particles if depth is available, fog and exposure consistent with the scene, additive for flashes/fire, alpha for
   smoke/dust/splash, a procedural sprite atlas (no downloads).
2. Effects: muzzle flash + smoke, splash column with foam ring, splinters with gravity, dust and debris puffs,
   burning/smoking ship when hp < 35% (naval Ship.js), sinking bubbles/foam, seaplane spray rooster tail, catch splash.
   Short point lights for flashes/fires within the local light budget.
3. Budget ~4000 live particles, no per-frame allocations; scale down on a low preset (AppUI presets).
Report root patches (install.js MODULES entry; any render-pass hook in App.js).
