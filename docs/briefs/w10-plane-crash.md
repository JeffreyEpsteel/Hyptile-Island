# Wave 10D: seaplane crashes you can see, and sometimes walk away from

Read docs/briefs/COMMON.md first (rules, root-owned files, style, no browsers / dev servers / npm install), then
docs/briefs/w8-cockpit.md and the headers of src/features/seaplane/Seaplane.js (today: a strike -> `_crash( cause )`:
stats.crashes++, the pilot is killed through the death feature or "rescued", the plane is towed back to the ramp with a
repair bill), Flight.js (STRIKE parts, KEELS, the strike / crash events and their speeds), Model.js (the GLB parts:
public/models/seaplane/Seaplane.glb built by tools/seaplane/build_seaplane.py, Blender 5.2 at D:\blender\blender.exe),
src/features/vfx (splash, debris, smoke, fire / stopFire, flash, splinters), src/features/naval/Planks.js (floating
pieces: copy the approach), src/features/destruction (impulse), src/features/death (playerDied).

Owned files: src/features/seaplane/** (Cockpit.js and Panel.js included), tools/seaplane/**, public/models/seaplane/**,
test/feature-seaplane.mjs. Report exact patches for root-owned files (Player.js exitVehicle use, App hooks) under 250 words.

User feedback (verbatim): "I also want the crash to actually happen with the planes and see the destruction, also I want
the possibility of our character to survive and make it out of the crashed plane, if it's not a direct collision."

1. Crash severity from the physics, not a coin flip. From the strike event (part, closing speed, what was hit: water /
   ground / prop / a ship or prop collider): 
   - a hard water arrival (floats or keel, vertical speed 2.5-6 m/s, or a wingtip dipping below ~12 m/s): a **rough
     landing**: hull damage, a float "sprung" (list + extra water drag until repaired), a splash, a bang, no wreck;
   - a **wreck** (water impact faster than that, a nose / prop dig-in above ~8 m/s, a wingtip into water above 12 m/s,
     a ground / terrain strike): the plane breaks: wings shear off, the tail or a float separates, the fuselage stays
     afloat for 60-120 s then sinks; the pilot is **thrown clear** (exitVehicle into the water / onto the ground a few
     metres from the wreck in 'swim' or 'walk', a stun (black-out 0.8 s via the death feature's fade if it exposes one,
     else a quick fade of your own), hull / health damage proportional to the impact; no death) UNLESS the impact was
     a **direct collision**: a nose-first terrain / cliff / ship hit above ~25 m/s, or any strike above ~40 m/s: then
     playerDied { cause: 'seaplane' } as today.
   The thresholds live in one exported table (CRASH) so the tests pin them.
2. Seeing it. Pieces: split the GLB by its nodes (wingL / wingR / tail / floatL / floatR / fuselage / prop; if the model
   is one mesh, rebuild it in build_seaplane.py as named parts - keep the look and the panel UVs) so a wreck can detach
   parts: each detached part becomes a free body for a few seconds (simple ballistic + water drag, your own code or the
   destruction feature's bodies if it takes arbitrary meshes), then floats (planks-style bob) or sinks. Effects: a big
   splash (water) or a dust / debris burst (ground), splinters / 'wood' debris, smoke from the engine for ~40 s, fire
   on a ground wreck for ~20 s then smoke, the camera kick, a crunch + the engine dying (PlaneAudio). The fuselage wreck
   stays as a world object (sp.wreck { x, y, z, yaw, t, parts }) until it sinks or is recalled; the world map / minimap
   marker may show it (features.get( 'worldmap' )?: report the hook you need).
3. After the crash. The plane is gone until Captain Roid's hangar recalls it ("Recover the wreck": the existing repair
   bill plus a recovery fee; free in the sandbox): sp.recall() exists - route it. The pilot in the water near the wreck
   can climb onto the floating fuselage (E: a 'deck'-like perch so you are not treading water for a minute) - optional
   if the Player API makes it cheap (report the patch), else skip and say so.
4. Tests: severity table (rough landing / wreck / death from part + speed + what was hit), the thrown-clear position
   is outside the hull and in water or on ground, parts detach once, the wreck sinks after its time, recall restores the
   plane, a rough landing damages but keeps the pilot aboard. Keep every existing seaplane test green (the crash counts
   must still increment). Vite build check as in COMMON.md.
