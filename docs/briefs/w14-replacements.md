# Wave 14C: a replacement boat at every dock, a replacement plane at every landing place

Read docs/briefs/COMMON.md first, then src/game/ports/Ports.js (every port's dock { position, heading, start, end },
_spots, markers, vendors), src/world/WorldLayout.js (read only: WORLD.ports, WORLD[ id ].dock, WORLD.tidemark.bay and
.airstrip.pad, WORLD.blackwater.dock: not a port, pirates), src/game/Game.js (read only: buyBoat -> app.setBoat( id ),
the yard vendor kind 'yard', HudPanels.renderYard rows: boats, recover the seaplane wreck, salvage, powder, rigging),
src/game/HudPanels.js (read only: renderYard / roidClicks / _keepScroll), src/App.js (read only: setBoat( id ) moors
the boat at WORLD.boatDock; boatCtl.reset), src/features/naval (read only: salvage: the sunk player boat), src/features/
seaplane/Seaplane.js (read only; worker 14B is adding sp.recall( { at } ) / sp.takeOut( af, { at } ) with
at: 'home' | 'strip' | { x, z, heading, water: true }: call them with optional chaining), src/features/harbour (the
harbourmaster per port), src/features/story (read only: priceMod( port )).

Owned files: src/features/agents/** (new feature 'agents'), src/game/ports/Ports.js (additive: agent spots per port),
test/feature-agents.mjs (new), test/feature-ports.mjs (additive if it exists). Report Game.js / HudPanels.js / App.js /
install.js patches under 250 words with exact anchors. Worker 14B owns the seaplane files.

The user's words: "the possibility to get a new ship / replacement at every dock and landing dock / airport".
1. A harbour agent at every port's dock head (Captain Roid's agents: a small lectern with a ledger and a lantern, a
   placard "Roid & Co. · boats and recoveries", built with the engine's GeoKit like the ports' stands; the home yard
   stays Captain Roid himself). Ports: pons, gull, key, haven, shrine, shoal, inverted, tidemark (read WORLD.ports
   dynamically). The agent is a vendor of kind 'yard' so E opens the existing yard window (HudPanels.renderYard) with
   `hud.yardPort = port` (report the HudPanels patch: the heading says "Roid & Co. · <port name>" and prices carry
   story.priceMod( port ) and a 15 % agent fee outside home; the sandbox is free).
2. Delivery there: buying / taking a boat at an agent moors it at THAT port's dock (report the Game.buyBoat / App.setBoat
   patch: `app.setBoat( id, { dock: WORLD.ports.find( p => p.id === port ).dock } )` and the toast says where). A sunk
   boat's salvage at an agent brings the boat to that dock. Recovering the seaplane wreck at an agent delivers the
   plane to that port's water: Tidemark's bay anchorage (WORLD.tidemark.bay) or 40 m off the dock head for the others
   (`sp.recall( { at: { x, z, heading, water: true } } )`); at Tidemark the airstrip hangar handles the Kestrel
   (worker 14B), so the Tidemark agent offers "Recover the seaplane to the bay" and "The Kestrel: ask at the airstrip".
3. On foot with no boat and no plane, far from home (> 150 m from the home dock), the nearest agent is pinned on the
   minimap and the world map (features.emit( 'questPin', { id: 'agent', x, z, label: 'Harbour agent' } ) and
   questPinClear when a boat is owned again); a toast once per session: "No boat? Roid's agent at the dock sells and
   recovers". Death / lost-at-sea respawn at a port's dock already exists: check src/features/death and make the
   agent the respawn hint there (report the patch).
4. Multiplayer: an agent purchase is local state (the yard's rules); nothing to sync beyond the boat change already
   synced.
5. Tests: an agent per port with the right dock, a purchase at an agent moors at that dock (stub app.setBoat), fees
   and priceMod apply, the sandbox is free, the pin appears / clears. Vite build check as in COMMON.md. No browsers.
   Report under 250 words.
