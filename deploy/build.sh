#!/usr/bin/env bash
# Build the frontend for production and leave it ready for the systemd unit
# to run from .output/server/index.mjs. Run this from the repo root on the
# server: ./deploy/build.sh
set -euo pipefail

cd "$(dirname "$0")/.."

if ! grep -q '^VITE_API_URL=https://cemis.unza.ac.zm/api$' .env 2>/dev/null; then
  echo "VITE_API_URL=https://cemis.unza.ac.zm/api" > .env
  echo "Wrote production .env (VITE_API_URL=https://cemis.unza.ac.zm/api)"
fi

npm ci
npm run build

echo "Build complete: .output/server/index.mjs"
echo "Restart the service with: sudo systemctl restart cemis-frontend"
