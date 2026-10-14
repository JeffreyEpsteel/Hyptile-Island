# Wave 19E: walk into the tavern and the shops

Read COMMON.md, w19-common.md, then src/world/islands/town/Buildings.js + Waterfront.js (Tidemark's buildings and the wave 18C
kit), src/world/village/** (the home village; TownKit.js), src/world/islands/Blackwater.js (the Rum Hole, the black market),
src/features/harbour/Tavern.js + TavernPanel.js (the tavern window today: dice, rumours), src/game/ports/TidemarkPort.js +
src/game/Chandlery.js + FishStand.js (the vendors), src/features/townlife/** (read only: townsfolk sit in the tavern at
night), src/core/Colliders.js, src/materials/LocalLights.js (light budget), src/features/destruction (read only: a building
that is destroyed must not leave a floating interior).

Owned files: src/world/interiors/** (new), public/models/interiors/** (new), tools/interiors/** (new Blender scripts),
src/world/islands/town/Buildings.js + Waterfront.js (doors and the interior hooks only), src/world/village/Buildings.js (doors
only), src/world/islands/Blackwater.js (doors only), test/feature-interiors.mjs (new). Report patches for the tavern / vendor
panels, Player.js (indoor camera), App.js and townlife (people inside).

1. Interiors (Blender kit, low poly, baked-looking vertex colour + a few CC0 textures, warm lights): The Tide & Tankard
   (Tidemark: bar, tables, stools, hearth, stairs, kegs, a dice table), the Rum Hole (Blackwater: rough, candle-lit), the home
   village tavern if one exists (else the fish stand's back room), Marlow's chandlery and Ethena's chandlery (shelves of
   rope, lanterns, the firearms rack, the counter), the harbourmaster's office (charts, the notice board).
2. Entering: walk through the door (an open door frame on the facade; the interior is placed inside the shell, sized to
   fit; or a seamless separate cell under the town with a fade if the shell is too small: pick what keeps colliders
   simple). The camera pulls in (a closer third person indoors, no clipping through walls: a collision probe), the sky /
   sea sounds muffle, the interior lights are local lights inside the light budget.
3. People: townsfolk seats inside (stools, the bar) published like 18C's seats lists so townlife can sit them (report the
   townlife patch), the tavern keeper behind the bar (E opens the existing tavern panel), the vendor behind the counter
   (E opens the shop).
4. Destruction: a destroyed building hides its interior and ejects the player; respawn restores both.
5. Phones: interiors load on approach and unload after; budget +10 MB GPU. Tests: doors and colliders, enter / leave,
   seats lists, the vendor interactions, destruction ejects. Renders of each interior (Blender and the headless harness)
   READ before reporting. Report under 300 words with credits.
