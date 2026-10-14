# Wave 18C: the cities look like places (buildings, streets, props)

Read docs/briefs/COMMON.md and w18-common.md first, then src/world/islands/town/Buildings.js + Layout.js + Waterfront.js +
Damage.js + Airstrip.js (Tidemark: building shells from parameters, the destruction hooks), src/world/islands/Tidemark.js,
src/world/village/** + src/world/Village.js (the home village: GeoBuilder, TextureBaker, VillageMaterials), src/world/islands/
Blackwater.js + stronghold/** (the pirate town and fort), src/features/destruction (read only: Kinds / Sites: every
destructible building and prop must keep its id, collider and break behaviour), src/world/boat/GeoKit.js (the procedural
mesh kit), src/game/GameMaterials.js (createPropMaterial: vertex colour + aux), public/models/props (existing GLB props).

Owned files: src/world/islands/town/Buildings.js, Waterfront.js, Airstrip.js (looks only), src/world/village/**,
src/world/Village.js (looks only), src/world/islands/Blackwater.js (looks only), src/world/islands/stronghold/Layout.js (looks
only), public/models/town/** (new), tools/town/** (new: Blender scripts), test/feature-town.mjs (additive),
test/feature-citylooks.mjs (new). Worker 18B owns people and animals (Folk.js, Residents.js, harbour/**): do not add people.

The goal: Tidemark reads as a prosperous harbour town, the home village as a cosy fishing village, Blackwater as a ramshackle
pirate den, at every distance.
1. Buildings: a modular kit built in Blender (tools/town/*.py, headless, exported to public/models/town/*.glb, instanced):
   walls with timber framing / clapboard / stone, roofs with tiles / shingles / thatch / tin, chimneys with smoke, porches,
   balconies, shutters, signboards (the chandler, the fish hall, the tavern, the harbourmaster), awnings over market
   stalls, lit windows at night (emissive, a per-building night mask), plus Poly Haven CC0 textures where they help
   (plaster, wood planks, roof tiles, cobbles; <= 1024 px on phones). Replace the procedural shells where the kit is better;
   keep every destructible's id, footprint, collider and Damage / smoke hooks working (the feature-destruction tests).
2. Streets and squares: cobbles or packed earth along the Layout streets, kerbs, a fountain or a well in Tidemark's square,
   street lamps (their lights through the existing LocalLights, a budget), fences, barrels, crates, carts, nets on racks,
   flower boxes, washing lines, benches (18B seats people on them: export their positions in a list `seats` per town),
   a lighthouse light on Gull Rock if it lacks one.
3. Distance: an LOD per building (merged far meshes per block) so the skyline stays cheap; phones use the far LOD past 60 m.
   Budget: Tidemark <= 120k triangles near, <= 25k far; textures <= 24 MB desktop, <= 10 MB phone.
4. Tests: every destructible id still registers with its collider, the seats list, LOD switching, the budgets. Before / after
   renders (Blender of the kit; the headless harness of the towns at day and night) READ before reporting. Report under 300
   words with the asset credits.
