# Wave 4: Colyseus multiplayer (alpha)

Owned files: server/**, src/net/**, src/features/netsync/**, src/ui/MainMenu.js, tools/host/**, docs/HOSTING.md, test/universe.mjs,
test/net-protocol.mjs, test/feature-netsync.mjs, test/colyseus.mjs (new). Installed (root): colyseus@0.18.9, colyseus.js@0.16.22,
@colyseus/schema@5.0.39, ws. Do not npm install.

Today: a hand-rolled ws relay (server/index.mjs) with crew rooms + one persistent universe (server/universe.mjs: profiles by
captain name + token hash, world events with replay, moored boats, market snapshot, pirate hand-off, chat log, atomic JSON,
backups, admin console), the client in src/net/NetClient.js + RemotePlayers.js + src/features/netsync (sendWorldEvent,
remoteWorldEvent, decorateState passthrough, NavalLink host-authority puppets, CrewPanel, ride).

Goal: move the transport and room model onto Colyseus while keeping every behaviour and the persistence:
1. Server: a Colyseus Server (WebSocketTransport) with two room types: CrewRoom (crew codes, cap 16, host authority for
   pirates with hand-off) and UniverseRoom (one persistent instance per universe name, keeps server/universe.mjs for
   storage; survives restarts; clock runs with nobody online). State via @colyseus/schema (players: id, name, character,
   boat, pos/quat/vel, mode, extra passthrough as a JSON string or MapSchema; moored boats; pirates; clock) at 15 Hz
   patch rate, plus messages for chat, world events, saves, market, fx/hits (keep the semantics of src/net/Protocol.js;
   the sanitisers stay and run server-side). Rate/size limits, name sanitisation, token identity, reconnection
   (allowReconnection ~60 s), admin console commands unchanged. The /health endpoint stays. `node server/index.mjs`
   keeps its CLI (--port, --universe, --data, --room-cap ...). Colyseus' monitor/playground are not needed.
2. Client: NetClient on colyseus.js (Client.joinOrCreate / joinById by crew code; universe join with name + token), the
   same public API to the rest of the game (RemotePlayers, netsync, MainMenu) so nothing outside your files changes;
   interpolation, shared clock, readable errors, reconnect with backoff; `?server=` still works (ws(s)://host:port).
3. Hosting: serve-universe.mjs, HOST_UNIVERSE.cmd and HOSTING.md updated (same ports, same steps); a note on scaling
   (Colyseus presence/redis not needed for one PC).
4. Tests: port test/universe.mjs and feature-netsync to the new transport (in-process server on a random port, two
   colyseus.js clients, join, state patches, chat, world event relay + replay, save persistence across a restart, name
   theft refused, reconnection) and add test/colyseus.mjs for the rooms. Keep net-protocol green.
5. Release: list the server's runtime dependencies (colyseus, @colyseus/schema, @colyseus/ws-transport and their deps) so
   root can copy node_modules subtrees into the release; better: write tools/host/pack-server-deps.mjs that resolves the
   full dependency closure of server/index.mjs into <release>/node_modules.
Report the exact root patches (expect none outside your files) and what you verified. Under 400 words.
