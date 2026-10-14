# Wave 15A: a persistent universe for everyone, the default when you click Multiplayer

Read docs/briefs/COMMON.md first, then server/README.md, server/index.mjs (startServer, --universe, --data, PORT env,
/health), server/universe.mjs (what persists on disk: universe.json, profiles/, backups), docs/HOSTING.md (today: the
player hosts on their own PC, a Cloudflare quick tunnel gives a changing address), tools/host/serve-universe.mjs and
HOST_UNIVERSE*.cmd, src/net/Universe.js (normalizeUniverseUrl, universeToken, probeUniverse, SERVER_KEY = the address
typed last), src/net/NetClient.js (DEFAULT_PORT, the ?server= query, universe errors), the multiplayer panel (grep
"Join the universe" under src/ui or src/features: the Universe tab with the address box), .github/workflows/pages.yml
(the game deploys to GitHub Pages on every push to main; the server must match the game's release: same commit).

Owned files: server/**, Dockerfile, .dockerignore, fly.toml, deploy/** (new), .github/workflows/deploy-universe.yml
(new), docs/HOSTING.md, src/net/Universe.js, src/net/NetClient.js, src/ui/MainMenu.js (the multiplayer panel lives there: the Universe tab, 'Join the universe'), test/universe.mjs
and test/net-*.mjs (additive), test/deploy-config.mjs (new). Report patches for src/main.js / App.js / the main menu.

The user's words: "we need a solution for a persistent server for our players, that would stay as default when
clicking multiplayer." GitHub Pages hosts the game; the universe needs a host that keeps a Node process and a disk.
Choose Fly.io (a shared-cpu-1x machine with a 1 GB volume: the cheapest always-on option with persistent disk and
wss on a fixed hostname, no sleeping like Render's free tier) and make everything else ready so the user only has to
create the account, run `fly launch --copy-config --yes` once and add FLY_API_TOKEN to the repository secrets:
1. Dockerfile (node:22-alpine, `npm ci --omit=dev` is wrong: the server needs colyseus from dependencies; copy
   server/, src/net, src/game/Boats.js, Characters.js, src/features/firearms/FirearmsData.js and whatever
   tools/host/pack-server-deps.mjs finds (reuse its closure or install the production deps), run
   `node server/index.mjs --universe hyptile --data /data --max-players 24 --reconnect-seconds 120` with PORT 8080),
   .dockerignore, fly.toml (app name hyptile-universe, region closest to Europe (the user is in Bucharest: fra or
   ams), internal port 8080, a [mounts] volume `universe_data` at /data, http_service with force_https and
   auto_stop_machines = false, min_machines_running = 1, a health check on /health). The server must bind 0.0.0.0 and
   read PORT (it does: verify) and must accept wss through Fly's TLS termination (ws on 8080 inside).
2. The deploy workflow: on push to main (after a successful build), `flyctl deploy --remote-only` with the secret;
   it writes the game's commit hash into the server's /health `version` and the client checks it against its own
   build hash (define `__BUILD_HASH__` in vite.config.js from `git rev-parse --short HEAD`: report that patch) and
   says "the universe is updating, try again in a minute" instead of a cryptic refusal when they differ.
3. The client default: `DEFAULT_UNIVERSE` = 'wss://hyptile-universe.fly.dev/universe' (overridable at build by
   VITE_UNIVERSE_URL and at runtime by ?server=). The multiplayer panel opens on the Universe tab with that address
   filled in, probes /health on open and shows "Online · 3 captains aboard" or "Offline" with the reason, and the
   captain name box; "Join the universe" is one click. The address box stays editable (friends' own servers) and a
   "default" link restores it. The main menu's Multiplayer button goes straight to that tab (report the menu patch
   if the file is root-owned).
4. Persistence hardening for a shared public server: backups keep working on the volume (--backup-days), the
   admin console is off when stdin is not a TTY (no hang), a `--admin-token` env (ADMIN_TOKEN) protects any admin
   HTTP route you add (`/admin/save`, `/admin/stats`), rate limits already exist (check), and a graceful shutdown on
   SIGTERM saves (Fly sends SIGTERM on deploys). The 13D note "the fort state does not survive a universe server
   restart": persist it in universe.json now (StrongholdLink writes the schema `fort`; store it like `moored`).
5. docs/HOSTING.md: a new first section "The shared universe" (what the default is, how to run your own instead,
   the exact Fly steps for the owner: `fly auth signup`, `fly launch --copy-config --yes --no-deploy`,
   `fly volumes create universe_data --size 1 --region fra`, `fly deploy`, `fly secrets set ADMIN_TOKEN=...`,
   `fly tokens create deploy` -> repository secret FLY_API_TOKEN, cost estimate), and the old PC-hosting sections kept.
6. Tests: the Dockerfile copies every file the server imports (resolve the import graph in a test and compare with
   the COPY list), fly.toml parses with the expected port / mount / health check, the client's default resolves and
   normalizes, the version mismatch message, the fort state round-trips through universe.json. Existing universe /
   colyseus / net tests stay green. Vite build check as in COMMON.md. No browsers, no deploys, no network.
Report under 300 words: what exists, the exact steps left for the owner, patches for root.
