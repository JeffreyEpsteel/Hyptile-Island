# Full-screen world map in the minimap's style

Owned files: src/game/Minimap.js (already refactored by the previous worker), src/ui/WorldMap.js (~1100 lines exist),
src/features/worldmap/** (index.js, MapLogic.js exist), test/feature-worldmap.mjs.

1. The minimap must look and behave exactly as before; both share one drawing core.
2. The world map: full-screen overlay in the same style with all islands and ports (WORLD.islands / WORLD.ports /
   app.ports.markers, read dynamically), the player and heading, the player's boat when moored elsewhere, the seaplane
   (features.get( 'seaplane' )?.marker()), remote players with names (app.remotePlayers), the home stall, Captain Roid's
   yard, Pons, notice boards, active bounty targets and pirate ships (src/features/naval), pirate search zones
   (features.get( 'pirates' )?.searchZones?.()), the raider camp (127, -71). Undiscovered islands as faint silhouettes
   with "?" until GameState's discovered includes them. A coarse explored-area fog (grid cells revealed around the
   player, persisted via toJSON/fromJSON; sandbox fully revealed). Legend, scale bar, compass rose, cursor coordinates.
3. M opens/closes (Esc closes too); drag pans, wheel zooms (clamped), gamepad sticks pan/zoom; click places a waypoint
   (marker on the minimap plus an edge chevron; click again clears). Opening frees the mouse like other panels
   (wantsMouse/panelOpen) and does not pause the world in multiplayer.
4. Root already moved mute to Shift+M in App.js, so plain M is free for the map.
Report root patches (install.js MODULES entry, HUD needs).
