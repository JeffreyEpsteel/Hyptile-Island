# Wave 24A: real, different, fully working car and helicopter interiors

Read w24-common.md, then src/features/cars/** (CarCockpit.js from ChatGPT's 3ba863b, CarRender, CarData: seven types:
sedan, taxi, pickup, van, sports, police, bus), public/models/cars/**, tools/cars/**, src/features/helicopter/** (Cockpit.js,
Model.js, Systems.js, HUD.js, Flight.js), the seaplane cockpits for the pattern (src/features/seaplane/Cockpit.js),
test/codex-car-cockpit.mjs, test/codex-helicopter-cockpit.mjs, test/codex-helicopter*.mjs, test/feature-cars*.mjs.

Owned: src/features/cars/** , public/models/cars/**, tools/cars/**, src/features/helicopter/**, public/models/helicopter/**
(new if needed), tools/helicopter/** (new), the car / helicopter tests above (additive).

1. Cars: each of the seven types gets its own modelled interior (Blender): sedan cloth seats and a soft dash; sports car
   bucket seats, carbon trim, a small wheel with paddles; pickup bench seat and a rubber floor; van with a bulkhead and
   cargo area; taxi with a fare meter and a partition; police with a radio, a laptop mount, a light bar switch panel and a
   cage; bus with the driver's cab, the ticket machine and passenger rows. Real-looking materials (leather / cloth / plastic
   grain, chrome, glass with reflections), interior and dash lighting at night.
2. Fully working: the steering wheel turns with the input (the driver's hands follow it), pedals move, gear selector, a
   speedometer / tachometer / fuel / temperature that read the simulation, indicators that tick, wipers in rain, headlight
   and siren switches lit, a working fare meter in the taxi, interior light, mirrors (cheap: a low-res render or a cube-map
   fake; phones a static fake), a first-person driver camera (V) with head look, plus the chase camera; sounds for each
   (indicator click, wiper, door).
3. Helicopter: a believable cockpit: instrument panel with a working six-pack (airspeed, attitude, altimeter, vertical
   speed, heading, turn) and engine / rotor gauges, warning lights, an overhead panel whose switches work (battery, fuel,
   starter, lights), cyclic, collective and pedals that move with the input and the pilot's hands and feet on them, a
   moving-map display, glass canopy with reflections and rain on it, rotor shadow flicker inside in sun, first-person view.
4. Budgets: interiors load only when you are in or next to the vehicle (LOD: a simple far interior). Verify with captures of
   every car interior (day and night) and the helicopter cockpit (day, night, in flight with gauges moving): READ them;
   tests that gauges follow the simulation and every control works.
