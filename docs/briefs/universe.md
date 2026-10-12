# Persistent universe, self-hosted by the user

Owned files: server/** (index.mjs edited, universe.mjs exists), src/net/** (Universe.js ~500 lines exists),
src/features/netsync/**, src/ui/MainMenu.js, src/game/GameMode.js, docs/HOSTING.md (new), tools/host/** (new),
test/universe.mjs (new). Reference: releases/hyptile-island-2.1/serve.mjs serves the built game on 5190 and starts the
relay on 8765. Today: relay with rooms and crew codes, each browser simulates its own world, the first player in a crew
runs the pirates (host authority), 15 Hz state.

YOU implement the shared API: app.netsync.sendWorldEvent( kind, data ) to everyone in the universe/crew (the server
persists known kinds, e.g. 'propDestroyed'); remote ones arrive as features.emit( 'remoteWorldEvent', { kind, data, from } );
persisted events replay on join. Keep netsync.decorateState extensible and pass unknown per-player fields (e.g. out.plane)
through to remote players.

1. Server: `node server/index.mjs --universe <name> --data <dir>` (default server-data/<name>/) keeps one always-running
   universe besides the crew rooms (keep those working; bump the protocol version compatibly). The universe clock runs
   with nobody online. Atomic JSON writes (tmp + rename), flush every ~10 s and on SIGINT/SIGTERM, daily backup, schema
   version field.
2. Identity without passwords: captain name + a random 128-bit token in localStorage per server; the server stores
   name -> sha256(token) on first join and refuses the name to another token. Name sanitisation, max players, per-socket
   rate and size limits (e.g. 256 KB saves), ping/timeout. Admin commands (kick, ban, save, announce, list) from the
   server console (stdin) only.
3. Server-side profiles: on join the server sends the stored GameState JSON (or none); the client plays multiplayer with
   it and sends snapshots every ~30 s and on important events through a small client API (app.universe); report the root
   patch where App/GameState saving calls it instead of the local slot. Validate shape, clamp absurd values (documented
   simple anti-cheat: bounded money change between snapshots unless a server event explains it).
4. Shared world state: world events (destroyed props with respawn timers), offline players' moored boats (shown to
   others), the trade market snapshot (trade exposes marketSnapshot()/adoptMarketSnapshot( snap )/onMarketChange( cb )
   - call them with optional chaining), a shared bounty seed, chat log (last 100). Pirates: host authority handed to the
   next player when the simulator leaves; persist pirate hulls/positions across restarts.
5. Client: MainMenu's multiplayer step gets a "Universe" choice: server address (remembered), captain name, Join;
   connection status, reconnect with backoff, readable errors (server down, name taken). Keep the crew-code flow.
6. Hosting: docs/HOSTING.md for a non-expert on Windows: tools/host/HOST_UNIVERSE.cmd (serves the built game on 5190 and
   starts the universe server on 8765 with the data dir), LAN joining, Windows Firewall rule commands for the user to
   run, router port forwarding, no-port-forward options (Tailscale, Cloudflare Tunnel, playit.gg), wss behind Caddy when
   the page is https, backups/restore, admin console, updating. tools/host/serve-universe.mjs for root to copy into
   releases.
7. test/universe.mjs: server in-process on a random port with a temp data dir under your scratchpad, two ws clients,
   join, profile stored, world event relay + persistence, restart -> profile and destroyed prop survive, name theft
   refused, oversize message refused. Run it and the existing net tests.
Report root patches.
