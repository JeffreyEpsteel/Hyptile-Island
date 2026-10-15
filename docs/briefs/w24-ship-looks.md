# Wave 24C: ships that look like ships

Read w24-common.md, then every ship and boat the player sees: public/models/ships/** (brigantine_v2, sloop_v2,
trawler_v2), public/models/navy/** (frigate, revenue cutter), public/models/fleet/** (the player's hulls), the procedural
launch (src/world/boat/Launch.js), the seaplane floats only as a style reference, the scripts that built them (tools/navy,
tools/roster, tools/modules, tools/dressing ...), src/features/naval/Models.js (ModelSet: node names it relies on: sails,
flags, wheel, guns, wrecks), src/world/BoatModel.js, the ship materials, and the wave 18 visuals work (docs/VISUALS.md).

Owned: public/models/ships/**, public/models/navy/**, public/models/fleet/**, tools/ships/** (new), tools/navy/**,
src/world/boat/Launch.js (looks only), src/features/naval/Models.js and src/features/navy/NavyModels.js (loading / material
code only), ship material code you find (name it), test/feature-ship-looks.mjs (new). 24B owns collision shapes: keep each
hull's length / beam / draft / deck heights and node names stable, or update the class data in the same commit and tell
24B by naming it in the commit message.

1. Audit: capture every ship and boat from three angles at noon and golden hour, rank them by how bad they look, and say
   why (blocky hulls, flat colours, missing rigging, sails like boards, floating props, wrong scale, z-fighting...).
2. Rebuild the worst first, all of them if you can: fair hull lines with planking (or plating) and a proper waterline,
   believable rigging and sails (cloth shading, billow, reef points), deck furniture (hatches, capstans, rails, guns, boats),
   wear (paint chips, grime, rope tar), the right scale for people aboard, PBR materials (CC0 wood / metal / canvas), LODs
   (three levels) and impostors far away; the navy ships, merchants and pirate ships each with a distinct look; animated
   sails and flags that react to the wind.
3. Budgets: per-ship triangles and textures sized for a fleet of 12 on screen (phones: the far LODs early); captures before /
   after at the same cameras; tests that every class loads with its nodes and LODs.
