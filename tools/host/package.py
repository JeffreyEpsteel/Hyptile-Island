"""Package a Hyptile Island release: python -I tools/host/package.py <version> (run from anywhere; needs releases/NOTES-<version>.md).
Builds dist/, copies the servers, the hosting launcher, the sources they import and node_modules/ws into
releases/hyptile-island-<version>/ and writes the launchers. The release's serve.mjs comes from 2.1 with the version renamed."""
import os, re, shutil, subprocess, sys, json
V = sys.argv[1]
R = 'D:/tidewater-hyptile'
OUT = f'{R}/releases/hyptile-island-{V}'
REF = f'{R}/releases/hyptile-island-2.1'
if os.path.exists(OUT): shutil.rmtree(OUT)
os.makedirs(OUT)
subprocess.run(['npx.cmd', 'vite', 'build', '--outDir', f'{OUT}/game', '--emptyOutDir'], cwd=R, check=True)
# servers + the sources they import (mirrored at the same relative paths so the imports resolve)
for rel in ['server/index.mjs', 'server/rooms.mjs', 'server/schema.mjs', 'server/universe.mjs', 'server/README.md', 'src/net/Protocol.js', 'src/game/Boats.js', 'src/game/Characters.js', 'src/features/firearms/FirearmsData.js',
            'tools/host/serve-universe.mjs', 'tools/host/HOST_UNIVERSE.cmd', 'tools/host/HOST_UNIVERSE_TUNNEL.cmd', 'tools/host/tunnel.mjs', 'docs/HOSTING.md']:
    src = f'{R}/{rel}'
    if not os.path.exists(src): print('skip missing', rel); continue
    dst = f'{OUT}/{rel}' if rel.startswith(('server/', 'src/')) else f'{OUT}/{os.path.basename(rel)}'
    os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.copy2(src, dst)
# any further src imports of the copied files (one level is enough for Boats/Characters/Protocol; checked by a node import below)
subprocess.run(['node', f'{R}/tools/host/pack-server-deps.mjs', OUT, '--verify'], cwd=R, check=True)
s = open(f'{REF}/serve.mjs', encoding='utf-8').read().replace('2.1', V)
open(f'{OUT}/serve.mjs', 'w', encoding='utf-8').write(s)
cmd = open(f'{REF}/PLAY_HYPTILE_ISLAND_2.1.cmd', encoding='utf-8').read().replace('2.1', V)
open(f'{OUT}/PLAY_HYPTILE_ISLAND_{V}.cmd', 'w', encoding='utf-8').write(cmd)
# the universe launcher expects game/ and server/ beside it (serve-universe.mjs resolves that itself)
print('packaged', OUT)
# smoke: the servers import cleanly from inside the release
subprocess.run(['node', '-e', f"import('file:///{OUT}/server/index.mjs').then(m=>{{console.log('server import ok', typeof m.startServer)}})"], cwd=OUT, check=True)
shutil.copy2(f'{R}/releases/NOTES-{V}.md', f'{OUT}/NOTES-{V}.md')
shutil.copy2(f'{R}/CREDITS.md', f'{OUT}/CREDITS.md')
