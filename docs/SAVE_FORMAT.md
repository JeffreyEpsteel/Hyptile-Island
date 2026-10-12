# Hyptile Island save format

Owner code: `src/game/GameState.js` (shape: `toJSON` / `fromJSON`), `src/game/SaveVault.js` (validation,
migrations, backups, preflight), `src/ui/SaveManager.js` (the player's tools). Tests: `node test/save-vault.mjs`,
`node test/state-v2.mjs`.

## Where saves live

| Key (localStorage) | What |
|---|---|
| `hyptile-island.save.v2` | campaign slot 0 |
| `hyptile-island.save.v2.slotN` | campaign slot N (1..3) |
| `sandbox.<key>` / `multiplayer.<key>` | the same four slots of the sandbox and of local multiplayer |
| `<slot key>.bak1` .. `.bak3` | rolling backups of that slot, newest first (SaveVault) |
| `<slot key>.corrupt` | the last stored save that failed its preflight (kept for a look, never loaded) |
| `tidewater.save.v1` | a Tidewater save; read by campaign slot 0 when it is empty |

The persistent universe (multiplayer with a server) keeps the captain's game on the server
(`<dir>/profiles/<hash>.json` = `{ schema, captain, savedAt, profile }`, `profile` being this same JSON). The client
only validates it; the server sanitises it (`server/universe.mjs sanitizeProfile`) and keeps daily backups.

## The save object (v 2)

```
{ v: 2, savedAt, mode, name,
  money, xp, rep: { portId: 0..100 }, discovered: [ portId ],
  inventory: [ { id, species, kg, cm, value, caughtAt, record } ], log: { species: { count, bestKg, bestCm } },
  upgrades: { track: level }, fuel: litres | null, nextId,
  character, unlocked: [ id ], boat: id | null,
  quests: { ... Contracts.js }, career: { caught, kg, records, species, night, reef, deep, aboard, sold, earned, boats, playSeconds },
  world: { player: { x, y, z, yaw, mode }, boat: { x, z, heading, moored } | null, timeOfDay } | null,
  features: { <feature name>: its toJSON() } }
```

Limits (also the server's): 256 KB, 400 fish, 300 log species, money 0..1e9, xp 0..1e9.

## Validation (`validateSave`)

Errors block a load (the preflight then rolls back): not JSON, not an object, unknown `v`, over 256 KB, money / xp
not a number, negative or over the cap, fuel negative, inventory not a list or over 400, a fish with a bad weight or
value, log entries with bad counts, an upgrade level outside its track, career counters that are not numbers,
`quests` / `features` / `log` / `career` of the wrong type.

Warnings are what GameState drops or clamps by itself: unknown species, characters, boats, upgrade tracks or ports
(ports are read from `Progression.PORTS` plus every `WORLD.ports` / `WORLD.islands` id at validation time), rep
outside 0..100, an unreadable world position, a name over 24 characters, duplicate fish ids, a save over 128 KB.

## Load and save

- **Preflight** (`attachVault( state )` wraps `state.load`): the stored save is validated after migration. If it
  fails, the newest backup that passes is loaded instead (`source: 'backup'`), the bad save is kept as `.corrupt`
  and the slot is rewritten with what was loaded. No good backup: a repaired copy (`repairSave`: clamped numbers,
  dropped junk) loads (`source: 'repaired'`). Unreadable JSON loads nothing (a fresh islander).
- **Rollback**: if `fromJSON` throws, the state is put back as it was and the next good backup is tried.
- **Backups** (wraps `state.save`): before a write the stored save is copied to `.bak1` (the others move down,
  `.bak3` drops off) on the first write of a slot in a page session and then at most every 5 minutes. A save
  that fails validation is never copied. When the browser refuses a write (storage full), the slot's backups are
  removed and the write retried.
- Delete, import, duplicate onto and restore all back up the slot they overwrite first, so each can be undone with
  **Restore backup**.

## Exported file

```
{ format: 'hyptile-island-save', version: 1, schema, game: 'Hyptile Island', exportedAt, mode, slot, captain, save }
```

Import takes this file, a server profile file (`{ schema, captain, savedAt, profile }`) or a bare save object. It
is validated (and migrated) before anything is written.

## Migrations

Numbered, applied in order, each idempotent (it only fills in what its era of saves lacks; `needs( d )` decides).
The current schema is the highest number: `SAVE_SCHEMA = 6`. A new field that older saves lack gets the next number
here and in `MIGRATIONS` (SaveVault.js); `test/save-vault.mjs` checks the two lists match.

| n | Since | What it does |
|---|---|---|
| 1 | Hyptile Island 1.0 | Tidewater v1 save to v2: `v: 2`, the lobster boat, Hyptile alone in the crew, empty quests |
| 2 | 1.1 | fish lengths: `cm` on fish in the hold, `bestCm` on log records (from the length-weight relation) |
| 3 | phase 2 | progression: `xp: 0`, `rep` for every port at 0, `discovered: []` |
| 4 | 1.3 | game modes and the world snapshot: `mode: 'campaign'`, `world: null` |
| 5 | 2.0 | feature data: `features: {}` |
| 6 | 2.1 | career stats complete: every `defaultStats()` counter present (0) |
