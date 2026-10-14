# Wave 14B: planes you can see and find; bailing out you can discover; a plane delivered where you ask

Read docs/briefs/COMMON.md first, then src/features/seaplane/Seaplane.js (owned, the airframe fleet: this.fleet,
this.af, owns / available / buy / takeOut / recall / base(), the interactables near line 195: door, ramp hangar, strip
hangar, cargo; bail() near line 1020 and COCKPIT_KEYS Quote), Model.js (PlaneModels.create( airframe, livery ):
a PlaneVisual with setPose / setVisible / setLivery / dispose), Site.js (SITE.berth at the home ramp; findAirstrip /
stripPad / stripOffice on Tidemark), Airframes.js, Panel.js (the hangar window, scope 'ramp' | 'strip'), Remote.js
(how a remote parked / stray plane is drawn: wave 13D), src/features/netsync/PlaneLink.js (read only: `parked`
entries), src/ui/AppUI.js lines ~515-545 (read only: the plane HUD mode line), src/core/Touch.js (read only: the
`bail` touch button exists), src/i18n/en.js + ro.js (owned: seaplane.* and hud.* keys you add).

Owned files: src/features/seaplane/Seaplane.js, Model.js, Site.js, Panel.js, Remote.js, index.js, src/i18n/en.js,
src/i18n/ro.js, test/feature-seaplane.mjs (additive), test/feature-parked-planes.mjs (new). Report App.js / AppUI.js /
HudPanels.js patches under 250 words. Worker 14A owns Cockpit.js and Airframes.js (do not edit them; Airframes.js
additive needs go in your report). Worker 14C owns src/features/agents/** and src/game/ports/**.

The user's words: "I can't find any planes on the new airport"; "I want the possibility to PARACHUTE" (it exists:
Quote twice, the touch `bail` button, but nobody can find it); "the possibility to get a new ship / replacement at
every dock and landing dock / airport".
1. Parked airframes are visible. At the airstrip's apron (stripPad) a Kestrel stands whenever the airframe out is not
   the Kestrel: for sale (not owned: prompt "Kestrel for sale · ask at the airstrip hangar") or owned and parked
   (prompt "Fly the Kestrel": E takes it out there, stashing the current one at its own base). At the home ramp a
   parked seaplane shows when the Kestrel is out (the last seaplane airframe owned, or the Jade for sale). A parked
   model is a PlaneVisual with brakes set and no spin; it is removed / replaced when the fleet changes. The remote
   `parked` entries of wave 13D already draw other players' parked planes: share the visual code.
2. The E interaction on a parked plane opens the right hangar scope when it is not owned, boards it when it is.
   The strip hangar's office spot must be easy to find: a prompt radius of 4 m and, on arriving at the airstrip
   (onStrip or within 60 m of the pad) once per session, a toast "The airstrip hangar sells the Kestrel · E at the
   office by the shed" (no standing prompt).
3. Bailing out is discoverable: while flying above CHUTE.minAgl the chase-view strip and the cockpit placard show
   "' ' bail out (press twice)"; the first press toasts "Press ' again to bail out" (it already arms: check); add a
   second binding KeyJ? NO: J is the journal. Use KeyX while in the plane (naval's X is claimed for boat mode only:
   claimKey( 'KeyX', 'seaplane' ) may fail; if it does, keep Quote only and say so). The touch `bail` button is in
   the plane tray: confirm it calls bail() twice-armed the same way.
4. Delivery: `sp.recall( { at } )` and `sp.takeOut( af, { at } )` accept `at: 'home' | 'strip' | { x, z, heading, water: true }`
   so a replacement / recovered plane appears where it was asked for (the strip pad for the Kestrel, the home berth,
   or a port's seaplane anchorage: worker 14C's harbour agents call these with the port's bay / dock). A plane put in
   a bay floats moored there (no drift beyond 15 m) until boarded. Panel.js: the strip hangar's recover row says
   "towed here".
5. Tests: parked visuals appear / disappear with the fleet state, E on a parked plane does the right thing, recall at
   the strip puts the plane on the pad, takeOut at a bay moors it there, bail-out arming toasts. Existing seaplane
   tests stay green. Vite build check as in COMMON.md. No browsers. Report under 250 words.
