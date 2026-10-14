# Wave 15D: climb onto anything that floats; flares that bring a rescue

Read docs/briefs/COMMON.md first, then src/player/Player.js (updateSwim: the climb-out onto ledges 0.2-2.6 m above the
water (Space / W), the pier ladders, exitVehicle / enterVehicle, the boat ladder, ashoreTarget), src/core/Colliders.js
(groundHeightAt, boxes with tags), src/features/naval (read only: ships' hull colliders / SAT boxes in Collisions.js,
ship.deck height, Wrecks.js, WaterPool.js), src/features/seaplane (read only: the floats and the cabin-roof perch of a
wreck), src/features/dressing (read only: shore debris, buoys), src/features/destruction (read only: floating
planks?), src/features/death (read only: lost at sea, respawn), src/features/agents (read only), src/game/Chandlery.js +
the firearms shop rows (read only: how a shop row sells an item), src/features/netsync (read only: riding another
player's boat: ridePose), src/materials/LocalLights.js (read only: how a feature exposes lights[]), src/features/vfx.

Owned files: src/player/Player.js, src/features/rescue/** (new feature 'rescue'), test/feature-rescue.mjs (new),
test/player-*.mjs (additive if present). Report App.js / Game.js / HudPanels.js / naval / install.js / i18n patches
under 250 words with exact anchors. Worker 15C owns pirates / boarding / naval Brains + Routes; it will call
`features.get( 'hijack' )` from the climb path: expose a hook, do not implement hijacking.

The user's words: "the ability to jump on an object when in water" and "flares that would make an ally vessel come
and take you to shore".
1. Climb onto anything that floats, from the water: your own boat anywhere along the hull (not only the ladder:
   Space at the rail pulls you up onto the deck when the freeboard is under 1.6 m, else to the ladder prompt), AI
   ships (a crippled or moored one: you land on her deck and the hijack / boarding hooks take over: emit
   `climbedAboard { ship }` and call `features.get( 'hijack' )?.onClimb?.( ship )` / boarding's offer), wrecks and
   the seaplane's floats / cabin roof, buoys, floating crates and planks (any collider box tagged floating / deck /
   hull whose top is 0.2-2.6 m above the water within 1.2 m ahead), rocks and sea stacks at the waterline. One rule
   in Player.updateSwim built on the existing climb-out (keep the ladder and ledge paths), a short pull-up animation
   (the existing climb timer), the prompt text names the thing ("Climb aboard", "Climb onto the wreck").
2. Flares (new feature 'rescue'): a flare pack (3) sold at the chandlery and the harbour agents (report the shop
   row patch: Chandlery / HudPanels like the firearms rows), fired with the F key held 0.5 s while swimming, adrift
   in a boat with no fuel / a dead engine / sunk hull, or on a wreck (touch: a Flare button in the water / vehicle
   trays: report the Touch.js / TouchControls.js patch); it rises, bursts and drifts down red for 25 s (a local light
   that lights the water, vfx smoke / sparks, a sound), visible far (a world event `flareFired { x, z }` other
   players and the host see; the universe relays it).
3. The rescue: within 60-120 s an ally vessel answers: the nearest port's harbour launch (a new AI boat 'launch'
   with a lamp and a coxswain) or a passing fisher / merchant if one is within 600 m; it comes alongside, you climb
   aboard (rule 1), it takes you to the nearest port's dock (or your boat if it is afloat and you ask: a prompt), you
   ride on deck (the camera / player on a moving deck: read how netsync's ridePose and the boat deck mode work;
   reuse the deck mode on an AI hull), it leaves. A fee at the dock by distance (free in the sandbox, free the first
   time in the campaign); a toast when the launch sets out and when it is in sight (a minimap blip). If you fire
   with no port within 2.5 km (open ocean), the response is a merchant that happens by after 120-180 s, else the
   death feature's lost-at-sea path remains. Pirates may answer instead when your notoriety is high (a hostile
   pickup: the hijack feature's problem later; just emit `rescueAnswered { by }`).
4. Tests: climb targets by kind (own hull, AI deck, wreck, float, buoy, rock), the pull-up timer, flares count /
   cooldown / conditions, the launch's route and arrival, the ride to the dock, fees, open-ocean fallback, save
   round-trip. Existing player / death / seaplane tests green. Vite build check. No browsers. Report under 250 words.
