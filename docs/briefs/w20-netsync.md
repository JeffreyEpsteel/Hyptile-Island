# Wave 20E: multiplayer for wave 19

Read w20-common.md, then src/features/netsync/** (NavalLink: the host runs AI ships; world events; the universe clock;
replication of boats, wrecks, crew), server/** or the universe server (universe.mjs, Dockerfile, deploy config),
src/features/navy/** (host-run navy, world events navyWanted / navyHail), src/features/weather/Fronts.js (seeded from the
universe clock), src/features/crew/** (crew state, banter), src/world/interiors/** (nothing networked yet), the netsync
tests (feature-netsync*.mjs, net-protocol.mjs, deploy-config).

Owned: src/features/netsync/**, the server / universe files, test/feature-netsync-w20.mjs (new), test/net-protocol.mjs
(additive). Report patches to navy / crew / interiors / weather (hooks only).

1. Audit with two and three simulated clients (the existing in-process harness): the navy's hails and fines for the right
   player only, a navy ship fighting a pirate seen identically by all, navy bounties shared by assist, standing per player;
   storm fronts and lightning identical on every client and after a late join; crew members visible on other players'
   boats doing their activities (cheap: activity id + seat, no per-frame bones), banter bubbles optional; other players
   seen entering / inside interiors (their avatar placed in the room when you are in it too, hidden from outside), tavern
   hands hired by one player not offered to another; hijacked navy ships.
2. Fix what diverges; keep bandwidth within the existing budget (measure bytes / s per client before / after in a busy
   scene) and the server's rate limits; the universe server must still package (tools/host/package.py copy list: report
   any new file it needs) and pass deploy-config.
3. Tests for each item above, late join, and a reconnect mid-hail.
