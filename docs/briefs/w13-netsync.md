# Wave 13D: multiplayer parity for wave 12 (planes, stronghold, the town)

Read docs/briefs/COMMON.md first, then the project skill .claude/skills/colyseus/SKILL.md (MANDATORY before any room /
schema / client code; Colyseus 0.18, @colyseus/sdk), docs/briefs/w11-netsync.md and src/features/netsync/** (HullLink,
WreckLink, CrewLink, NavalLink, NetSync), server/** (rooms, schema, universe), src/features/seaplane/Remote.js + Chute.js
+ Airframes.js + Wreck.js (what a remote plane shows today; the chute and the abandoned plane are local only), the
stronghold (src/features/pirates/Stronghold.js, Batteries.js: alarm, batteries, claim, moored ships), Tidemark's
destructible props (src/features/destruction: propBroken / propRespawned are world events already: check they carry
the port and reach other clients), src/features/emotes (synced), src/features/firearms (gunshot synced).

Owned files: src/features/netsync/**, server/**, src/net/Protocol.js, test/feature-netsync*.mjs, test/server-*.mjs.
Report patches for seaplane / pirates / destruction under 250 words. Local node tests only; never expose a server.

1. Planes: a remote player's airframe id, livery and upgrades ride in the decorated state (Remote.js shows the right
   model and paint); a bail-out puts the remote pilot under a chute others can see (position + heading in the state
   while `chute`), and the abandoned plane keeps flying on every client (the owner keeps simulating it and streams its
   pose as a `stray` plane entry until it wrecks: then the wreck entry from wave 11 takes over); the Kestrel on the
   airstrip pad is visible to all (a parked entry per airframe the owner has taken out).
2. Stronghold: host-authoritative. The alarm state, each battery's platform / silenced state, the powder stores, the
   claim (who, until when) and the moored ships' cast-off live in the room schema; the batteries fire on the host only
   (balls already sync through NavalLink); guards are host-driven like den raiders (check how dens sync their guards and
   do the same); a claim by any player applies to the room and the claimant gets the loot; restock timers run on the
   host.
3. Tidemark: broken props sync (verify propBroken carries { id, port } and the respawn too); the "Hold the line" raid
   event (wave 13B spawns a sloop through naval.spawn) runs on the host only.
4. Reconnect keeps all of it. Rate limits for the new events.
5. Tests: two-client headless room: remote chute visible, stray plane entry then wreck, battery silenced on the host
   reaches the guest, claim applies once, props broken on the guest reach the host and back. Existing netsync and server
   tests stay green. Vite build check as in COMMON.md.
