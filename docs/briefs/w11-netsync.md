# Wave 11B: multiplayer parity for waves 9-10 (collisions, wrecks, crew, guns, plane wrecks)

Read docs/briefs/COMMON.md first, then the project skill .claude/skills/colyseus/SKILL.md (MANDATORY for any room /
schema / client code: Colyseus 0.18, @colyseus/sdk client; check the installed versions in package.json), then
src/features/netsync/** (NetSync.js, NavalLink.js: how naval combat is shared through the room's host), src/net/**
(NetClient, Protocol, Universe), server/rooms.mjs + schema.mjs + universe.mjs, src/features/Features.js (events:
hullsCollided, shipCrippled, gunshot, crewPosted, fishCaught, cannonFired), src/features/naval/Collisions.js,
src/features/seaplane/Wreck.js + Crash.js, src/features/crew/Deck.js, src/features/firearms/Firearms.js (_remote).

Owned files: src/features/netsync/**, server/** (rooms, schema, universe; keep the admin console working), src/net/Protocol.js,
test/feature-netsync*.mjs, test/server-*.mjs. Report patches for naval / seaplane / crew / firearms (not yours) and
root files under 300 words. Never run the server against the internet; local node tests only (the existing server tests
show how a room is exercised headless).

What must be true for two players in one room (the host is authoritative where the naval link already is):
1. Remote players' boats are solid: the host runs hull collisions between every player boat and every ship (the local
   Collisions world only knows the local boat today: add the remote boats as bodies on the host, send the resulting
   impulse + damage to the owner, who applies it through naval.damagePlayer / BoatController.applyCollision; clients
   predict the push-apart locally so boats never visibly overlap). Damage to a remote player's hull is theirs to apply.
2. Wrecks: a player boat sinking, a wreck on the sea floor, a seaplane wreck (fuselage + parts) are visible to everyone:
   a compact state entry per wreck (kind, x, y, z, yaw, t, parts bitmask) on the room schema, created by the owner,
   removed on salvage / recovery / sinking; remote clients render through the same Wreck / Planks code in a passive mode
   (report the API you need on seaplane / naval: e.g. `wreck.renderRemote( entry )`).
3. Crew figures on remote boats: the posts list (character id + post) rides in the player's decorated state; remote
   boats show the same deck figures (crew.Deck in passive mode; report the hook).
4. Gunshots and cannon fire from other players: the 'gunshot' world event already exists; make sure cannon fire,
   hits, splinters and the aim-less muzzle flash are shown on every client, with rate limits (schema sanity: ignore
   events faster than the weapon's reload).
5. Reconnect keeps all of it (the room's reconnection flow from wave 4).
6. Tests: a headless room with two fake clients: collision impulse delivered to the right owner, wreck entries added /
   removed, crew posts replicated, event rate limit. Existing netsync and server tests stay green. Vite build check.
