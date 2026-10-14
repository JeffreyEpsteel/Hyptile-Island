# The shared Hyptile Island universe: server/index.mjs (Colyseus) on Fly.io, see fly.toml, docs/HOSTING.md and
# .github/workflows/deploy-universe.yml (which builds this on every push to main once the game is built, with
# --build-arg BUILD_HASH=<the game's commit> so /health can say which game it serves).
#
# Stage 1 installs the repository's production dependencies (colyseus, @colyseus/schema, ws ... are `dependencies`;
# only vite and webgpu are dev) and keeps just the server's own closure: tools/host/pack-server-deps.mjs starts the
# server once, records every package it loads and copies those (~10 MB), then starts the copy (--verify) and fails the
# build if it does not answer /health. Stage 2 is that folder on a clean node:22-alpine.
#
# Every source file the server imports is COPY'd below by name (test/deploy-config.mjs walks the import graph of
# server/index.mjs and fails when one is missing here or in .dockerignore's allow-list).

FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server/ server/
COPY src/net/ src/net/
COPY src/game/Boats.js src/game/Characters.js src/game/
COPY src/features/firearms/FirearmsData.js src/features/firearms/
COPY src/features/hijack/Fence.js src/features/hijack/
COPY tools/host/pack-server-deps.mjs tools/host/
RUN mkdir -p /app \
	&& cp -r server src /app/ \
	&& node tools/host/pack-server-deps.mjs /app --verify

FROM node:22-alpine
WORKDIR /app
ARG BUILD_HASH=dev
ENV NODE_ENV=production \
	PORT=8080 \
	HOST=0.0.0.0 \
	BUILD_HASH=${BUILD_HASH}
COPY --from=deps /app/ ./
# /data is the Fly volume `universe_data` (fly.toml [mounts]): universe.json, profiles/, backups/
RUN mkdir -p /data
EXPOSE 8080
# Fly sends SIGTERM on a deploy or a restart: the server says goodbye (4001), moors the captains' boats and writes the
# universe before it exits (stopOnSignals); fly.toml gives it kill_timeout = 30 s.
STOPSIGNAL SIGTERM
CMD [ "node", "server/index.mjs", "--universe", "hyptile", "--data", "/data", "--max-players", "24", "--reconnect-seconds", "120", "--backup-days", "14", "--no-console" ]
