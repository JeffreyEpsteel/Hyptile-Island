# Hosting a Hyptile Island universe (Windows)

A **universe** is one island world that keeps running on your PC: destroyed docks stay broken until they respawn, boats
stay where their captains left them, the market and the pirates carry on, and every captain's game is kept by your PC
instead of in their browser. Friends join from their own browser (Chrome or Edge, for WebGPU).

## 1. Start it

You need [Node.js 22 LTS](https://nodejs.org) (install it with the defaults).

- **From a release folder:** double-click `HOST_UNIVERSE.cmd`. (The release carries the server's `node_modules`
  folder: keep it next to `server\`.)
- **From the source repository:** run `npm install` once and build the game (`npx vite build` in the repository folder),
  then double-click `tools\host\HOST_UNIVERSE.cmd`.

The server runs on [Colyseus](https://colyseus.io) (since the alpha): the same ports and steps as before, but the game
and the server must come from the same release.

A black window opens and prints the addresses, for example:

```
  On this PC:   http://localhost:5190/   (Multiplayer > Universe, server localhost:8765)
  On your LAN:  http://192.168.1.20:5190/   (server 192.168.1.20:8765)
```

Leave the window open while people play. Typing `stop` (or Ctrl+C, or closing the window) saves everything first.

Options (add them after the file name, e.g. in a shortcut): `--universe myisland` (another world, its own saves),
`--max-players 8`, `--port 5190` (the game page), `--ws-port 8765` (the universe), `--data D:\islands\myisland`
(where the saves go), `--no-game` (only the universe; players use their own copy of the game).

## 2. Join

In the game: **Multiplayer > Universe**, type the server address and a captain name, press **Join the universe**.

- On the hosting PC: `localhost`.
- On the same home network: the LAN address the window printed, e.g. `192.168.1.20`.
- From the internet: see sections 4 and 5.

The address is remembered. `:8765` and `/universe` are added for you. The old crew codes are still under
**Multiplayer > Island / crew**.

**Captain names have no password.** The first browser to join with a name owns it on your server (the browser keeps a
random secret for it). If a friend clears their browser data or changes PC, their name is locked; type
`release <name>` in the server window and their next join takes the name back, with the game.

## 3. Allow it through Windows Firewall

The first start may show a Windows Firewall question: tick **Private networks** and allow. If friends on your network
still cannot connect, open PowerShell **as administrator** (Start, type PowerShell, right-click, Run as administrator)
and run:

```powershell
New-NetFirewallRule -DisplayName "Hyptile Island game" -Direction Inbound -Protocol TCP -LocalPort 5190 -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "Hyptile Island universe" -Direction Inbound -Protocol TCP -LocalPort 8765 -Action Allow -Profile Private
```

To remove them later: `Remove-NetFirewallRule -DisplayName "Hyptile Island game"` (and the same for "universe").
If your network is marked Public, use `-Profile Any` or set the network to Private in Windows Settings.

## 4. Friends over the internet: port forwarding

1. Give the hosting PC a fixed LAN address (your router's "DHCP reservation" page, or Windows network settings).
2. In the router (usually http://192.168.1.1 or http://192.168.0.1, the login is on its label), find **Port
   forwarding** / **Virtual server** / **NAT** and forward **TCP 5190** and **TCP 8765** to that LAN address.
3. Find your public address (search "what is my IP"). Friends open `http://<public address>:5190/` and type
   `<public address>` as the universe address.
4. Add the firewall rules above with `-Profile Any`.

Your public address may change every few days; a free dynamic DNS name (DuckDNS, No-IP) keeps one name for it.
Some providers (CGNAT, many mobile connections) do not allow port forwarding at all: use section 5.

## 5. Without port forwarding

- **Tailscale** (easiest, private): install [Tailscale](https://tailscale.com) on your PC and on each friend's PC, invite
  them to your tailnet. The server window does not show the Tailscale address; Tailscale's tray icon does (100.x.y.z).
  Friends open `http://100.x.y.z:5190/` and use `100.x.y.z` as the universe address.
- **playit.gg**: install the playit agent, create two **TCP** tunnels to local ports 5190 and 8765. Friends open
  `http://<tunnel for 5190>/` and type the 8765 tunnel's `address:port` as the universe address.
- **Cloudflare Tunnel** (gives https): install `cloudflared`, then in two windows:
  `cloudflared tunnel --url http://localhost:5190` and `cloudflared tunnel --url http://localhost:8765`.
  Friends open the first `https://....trycloudflare.com` address and type the second one's host name
  (`xxxx.trycloudflare.com`) as the universe address. From an https page the game uses `wss://` on port 443 by itself.
  Quick tunnels get new names every start; a named tunnel on your own domain keeps them.

## 6. https pages need wss (Caddy)

A browser on an `https://` page may only connect to `wss://`. If you put the game on your own domain with
[Caddy](https://caddyserver.com) (automatic certificates), let Caddy forward the universe too. The game talks to the
universe server in two ways on the same port: HTTP requests to `/matchmake/...` (which room) and a WebSocket. The
simplest `Caddyfile` sends the server its own folder:

```
island.example.com {
	handle_path /net/* {
		reverse_proxy localhost:8765
	}
	reverse_proxy localhost:5190
}
```

Players open `https://island.example.com/` and type `island.example.com/net` as the universe address (the game turns
it into `wss://island.example.com/net/universe` and talks to `https://island.example.com/net/matchmake/...`).
If you would rather keep the plain `island.example.com` address, forward the matchmaking path and every WebSocket:

```
island.example.com {
	@universe path /matchmake/* /health
	@socket header Connection *Upgrade*
	reverse_proxy @universe localhost:8765
	reverse_proxy @socket localhost:8765
	reverse_proxy localhost:5190
}
```

Forward ports 80 and 443 to the PC instead of 5190 / 8765.

## 7. The server window (admin console)

Only the person at the server window can run these; nothing in the game can.

| Command | What it does |
|---|---|
| `help` | the list |
| `list` | who is online (universe and rooms) |
| `captains` | every captain, last seen, money, bans |
| `kick <name>` | disconnect (they can come back) |
| `ban <name> [reason]` / `unban <name>` | keep a captain out (a ban also reserves an unknown name) |
| `release <name>` | free a name whose browser was lost: the next to join with it owns the name and its game |
| `announce <text>` | a "Server" line in everybody's chat |
| `save` / `backup` | write now / make an extra backup copy now |
| `stop` | save and shut down |

## 8. Saves, backups and restoring

Everything is in `server-data\<universe>\` next to the launcher (or your `--data` folder):

- `universe.json`: the world (captains, destroyed props with their respawn times, moored boats, market, bounty and
  weather seeds, the last 100 chat lines, the pirate ships). `schema` says its format version.
- `profiles\*.json`: one file per captain (their whole game).
- `backups\YYYY-MM-DD\`: a copy of both, made once a day; the last 14 days are kept (`--backup-days`).

Files are written safely (to a `.tmp` file, then renamed), every ~10 seconds while something changed and on `stop`.
**To restore:** `stop` the server, copy `universe.json` and `profiles\` from the backup day over the ones in
`server-data\<universe>\`, start again. If `universe.json` is ever unreadable the server restores the newest backup by
itself. To move the universe to another PC, copy the whole `server-data\<universe>\` folder.

## 9. Dropped connections

If a player's network hiccups, the server keeps their place for 60 seconds (`--reconnect-seconds 60` on
`server\index.mjs`): their captain stays in the world, the game reconnects by itself and carries on with nothing lost;
the others see no "left" and "came ashore". Someone who closes the page leaves at once. After the 60 seconds a captain
who was aboard leaves the boat moored, as with a normal leave.

## 10. Fair play (what the server checks)

The game runs in each player's browser, so the server can only keep things plausible:

- A saved game is checked field by field (types, sizes, ranges); anything odd is dropped or clamped. Saves are at most
  256 KB and one per 2 seconds.
- **Money** may rise by at most $5,000 plus $50 per online second since the last accepted save, plus the rewards of
  world events the server relayed for that captain (each at most $10,000). **XP** likewise (2,000 + 10 per second).
  Above that the save is clamped and the player's game adopts the server's number. Spending is never limited.
- Messages are rate-limited per connection (chat 2/s, events 10/s, everything 120/s); oversized frames are refused.
- Five new captain names per hour per address.

It is a friends' server: a determined cheater can still fake slow, plausible progress. Ban them.

## 11. Updating

Stop the server, replace the game files (the release folder, or rebuild with `npx vite build`), keep `server-data\`,
start again. A newer server keeps older universes; if the save format ever changes the old file is kept as
`universe.old.json`. Players with an older game see "That server runs another version of the game"; they reload the page.
The alpha moved the server to Colyseus: a 3.0-pre game (or server) cannot talk to an alpha one at all (the game says no
universe server answers); update both. The saves (`server-data\`) carry over unchanged.

## 12. More players than one PC can take

One PC hosts one universe for its 16 (up to 64) captains; that needs nothing extra. Colyseus can spread rooms over
several processes with Redis (`@colyseus/redis-presence` and `@colyseus/redis-driver`), but this server does not use
that: the universe keeps its world in plain files for one process, so run one server per universe.

## Troubleshooting

- *"No universe server answers"*: the window is closed, the address is wrong, or the firewall / router blocks 8765.
- *"That captain name belongs to someone else"*: another browser owns it; pick another, or `release` it at the server.
- *"Port 5190 is busy"*: another copy is running (close it) or start with `--port 5191`.
- The page loads but Join fails from an https address: see section 6 (wss and the `/net` address).
- *"The universe server could not start ... Cannot find package '@colyseus/core'"*: the server's `node_modules` folder is
  missing (a release: copy the whole folder again; the repository: `npm install`).
