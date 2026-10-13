# Wave 12C: seaplane variants and upgrades

Read docs/briefs/COMMON.md first (rules, root-owned files, style, no browsers / dev servers / npm install), then
docs/briefs/seaplane.md, w8-cockpit.md, w10-plane-crash.md and every file in src/features/seaplane (Flight.js SPEC,
Systems.js, Panel.js (the hangar window), Model.js, Crash.js, Wreck.js), tools/seaplane/build_seaplane.py (Blender 5.2
headless at D:\blender\blender.exe; render previews to your scratchpad and look at them), src/game/GameState.js (money,
free in sandbox: read only), src/features/trade (cargo crates: a cargo pod carries them).

Owned files: src/features/seaplane/**, tools/seaplane/**, public/models/seaplane/**, test/feature-seaplane*.mjs. Report
patches for root files (HudPanels / Game hooks, the trade hold API if the cargo pod needs one) under 250 words.

The user asked (verbatim): "I would also want more airplane options and upgradeability."

1. Three airframes, bought at the hangar (the current one stays the first):
   - "Jade" high-wing floatplane (today's): the all-rounder;
   - "Petrel" light bush floatplane: cheaper ($11,000), slower (max ~34 m/s), takes off in half the run, tight turning,
     2 seats, small tank, fragile floats;
   - "Albatross" twin-engine flying boat: expensive ($42,000), fast cruise (~55 m/s), long run, heavy, a hull instead of
     floats (lands rougher water: rough-landing thresholds x1.5), a cargo bay (6 crates), 4 seats, big tank, two engines
     (one can fail: asymmetric thrust in Flight: yaw moment).
   Each is a SPEC variant (mass, inertia, thrust, wing areas, floats / hull sections, tank, seats, cargo) and a model
   variant from build_seaplane.py (same panel UVs and part nodes so the cockpit and the crash parts keep working); the
   chase instrument strip and cockpit read the variant. Owning several: the hangar lists them, "Take out" picks the
   one on the ramp. Saves: toJSON per airframe (hp, fuel, upgrades, switches).
2. Upgrades per airframe (hangar rows, prices by airframe class, free in the sandbox but still fitted explicitly):
   - engine: 3 tiers (+15 % / +30 % thrust, faster spool, more fuel burn);
   - floats / hull: 2 tiers (rough-water: raises the rough-landing and wreck thresholds, less water drag at the hump);
   - long-range tank: +60 % fuel;
   - flaps: a third notch (STOL: shorter takeoff, slower approach);
   - cargo pod (Jade / Petrel): 2 crates under the fuselage (drag +8 %); the Albatross has its bay;
   - armour (hull points +50 %, mass +6 %);
   - lights: a landing-light pair (brighter, wider) and a searchlight (a steerable spot from the cockpit at night, key
     ; held: report the key through claimKey);
   - radio: the world map from the cockpit shows ships / wrecks within 600 m;
   - livery: 4 paint schemes (material colours; no new textures).
   Effects live in Flight / Systems through a `spec()` that composes the base SPEC with the fitted upgrades (pure,
   testable). The panel shows what is fitted; the HUD strip shows the airframe name.
3. Cargo: crates from the trade hold can be loaded at a dock (E at the plane with crates aboard the boat / at a port
   warehouse: report the hook you need from trade), unloaded at any port; the plane's weight and CG shift with the load
   (Flight: mass and a small pitch trim change).
4. Tests: spec composition per airframe / upgrade, takeoff run and speeds per airframe (fly() harness), the twin's
   engine-out yaw, cargo mass effects, save round trip of several airframes. Keep all existing seaplane tests green.
   Vite build check as in COMMON.md.
