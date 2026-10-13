# Wave 8: a real seaplane cockpit (user feedback: "the cockpit is kind of bad, I want real working buttons and indicators, and visibility")

Owned files: src/features/seaplane/** (Seaplane.js, Pilot.js, Model.js, Panel.js, PlaneAudio.js, Flight.js, Remote.js, Site.js; add
Cockpit.js), public/models/seaplane/**, tools/seaplane/**, test/feature-seaplane.mjs, and src/player/Player.js ONLY the 'plane'
camera branch (cockpit eye point / chase). Read docs/briefs/seaplane.md for the original design, src/features/seaplane/* and
Player.js's plane camera first. Mobile: src/ui/TouchControls.js has a throttle lever and a right-drag stick for the plane (read it;
do not edit it, report patches). Blender 5.2 at D:\blender\blender.exe (headless build script tools/seaplane/build_seaplane.py:
extend it; render previews to your scratchpad and look at them).

1. Visibility: in the first-person cockpit view the pilot must see out: a wide windscreen with thin frames, side windows, the
   nose low enough to see the water ahead when level, the eye point raised to the real seat height, the glass transparent
   (alpha, slight tint) with a faint reflection streak; the chase view framed so the plane sits in the lower third and the
   horizon stays visible when pitching. Nothing of the cabin should block the view at the eye point (check with a render
   from the eye point).
2. Working instruments (3D, in the model, readable in first person; drawn with a small canvas texture atlas updated at ~10 Hz
   or with procedural WGSL dials): airspeed (m/s and knots), altimeter (m above sea), attitude indicator (artificial horizon
   with pitch ladder and bank), vertical speed, heading / compass card, RPM + throttle %, fuel (the plane has no fuel: add a
   simple tank, 100% at the ramp, ~25 min of flight at full throttle, refuel at the ramp/hangar for a small fee, free in
   sandbox; the panel shows it), stall warning lamp + beep (near the stall angle), gear/water-rudder indicator, a master
   warning lamp on damage (hull %). Night lighting: the panel glows at night (an emissive layer) with a dim red cabin light.
3. Working buttons/switches (clickable with the mouse in first person via a raycast against the panel, and with keys):
   engine start/stop (the engine must be started before taxiing: a short starter sequence + sound), master/battery switch,
   nav lights and landing light (real point/spot lights, within the local light budget), flaps (two notches: more lift and
   drag for short takeoffs and slow landings; affects Flight.js), trim (a small pitch trim wheel, key +/-), autopilot level
   hold (holds wings level + altitude, key), a radio/"map" button that opens the world map (M). A hover highlight and a tooltip
   name on the panel; the same actions in the plane's E panel on mobile (report the TouchControls rows needed).
4. The HUD: in first person none of the desktop HUD covers the windscreen except the small prompts; in chase view a slim
   instrument strip (speed, alt, heading, throttle, fuel) in the existing HUD style.
5. Sound: engine start/idle/full, flap motor, stall horn, a click for switches (synthesised, like PlaneAudio.js).
6. Keep every existing seaplane test green and add cockpit checks (flaps change lift/drag, fuel burn, engine-off means no
   thrust, autopilot levels the wings). Vite build clean. Report root patches (Game/HUD hooks, TouchControls rows) under 300 words.
