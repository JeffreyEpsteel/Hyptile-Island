# Wave 14A: a cockpit of its own for every airframe

Read docs/briefs/COMMON.md first, then src/features/seaplane/Cockpit.js (the whole file: the canvas face, CONTROLS,
panelSnapshot, drawPanel, the Cockpit class with its phone redraw rates and the chase-view strip), Airframes.js (the
four airframes: Jade, Petrel, Albatross (two engines), Kestrel (a land plane with wheels and brakes), their specs and
upgrades), Flight.js (GEOM.panel: where the face sits in the model; engines[], wheels), Systems.js (what the panel
shows), Model.js (read only: the GLBs; the panel quad is drawn by Cockpit), PlaneAudio.js (read only).

Owned files: src/features/seaplane/Cockpit.js, src/features/seaplane/Panels.js (new: per-airframe layouts),
src/features/seaplane/Airframes.js (additive: a `cockpit` key per airframe), test/feature-cockpit.mjs (new),
test/feature-seaplane.mjs (additive). Report any Seaplane.js / Flight.js / i18n patch under 250 words.

The user's words: "I want the cockpits to be different for every plane." Today one face (TEX 1024 x 336, the six-pack,
lamps, switches, radio) serves all four. Make each airframe's cockpit its own place:
1. A layout descriptor per airframe (Panels.js): panel colour and material (the Jade's cream enamel and brass bezels,
   the Petrel's grey crackle with white needles, the Albatross's wide dark panel with TWO engine columns (rpm, oil,
   fuel flow per engine, an engine-out lamp each, a feather / restart switch each), the Kestrel's compact tan panel
   with a gear lever and three green gear lamps, a brake lamp, a wheel-brake switch, a ground-speed readout); the
   instrument positions, sizes and fonts differ (gauge radii, a vertical tape airspeed on the Kestrel, a turn
   coordinator on the Albatross, a float-trim gauge on the seaplanes only), the warning lamp set differs (water
   rudder only on floatplanes, gear only on the Kestrel), the placard texts and the radio box differ.
2. CONTROLS become per-airframe (hitControl / rayPanel take the airframe's layout), the keys unchanged; new switches
   call existing Seaplane.act ids where they exist (engine, master, nav, landing, ap, flaps, brake if present: read
   Seaplane.act and COCKPIT_KEYS; report any new act id you need, with its exact patch).
3. The face texture size may differ per airframe (keep within 1024 x 512; phones keep the no-mips 5 / 1 Hz path).
   The chase-view strip shows the airframe's own extra items (two rpm readouts on the Albatross, GEAR on the Kestrel).
4. Night glow and hover tooltips keep working on every layout. The texture is rebuilt when the airframe changes
   (sp.af): find where Cockpit learns the airframe (constructor / update) and rebuild on change.
5. Tests: each airframe yields a distinct layout (control ids, gauge counts), hitControl maps a known px to the right
   control per airframe, drawPanel runs on a stub 2D context for all four without throwing, panelSnapshot carries the
   per-engine and gear fields. Vite build check as in COMMON.md. No browsers. Report under 250 words.
