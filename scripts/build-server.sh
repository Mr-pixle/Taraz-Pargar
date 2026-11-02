#!/bin/bash
# Builds the server version: the web app (Parcel → web-dist, with self-hosted fonts) and the server bundle (server-dist).
set -e
cd "$(dirname "$0")/.."
rm -rf web-dist
pnpm exec parcel build index.html --dist-dir web-dist --no-source-maps --log-level warn
node scripts/fonts.mjs
node scripts/build-server.mjs
echo "web-dist/ + server-dist/main.mjs"
