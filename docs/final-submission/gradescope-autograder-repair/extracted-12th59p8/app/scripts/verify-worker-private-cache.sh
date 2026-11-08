#!/bin/sh
# Test-only: fresh checkpoint in this container's writable layer avoids relying
# on model pages already cached/charged to another container on the Docker host.
set -eu
cp -R /opt/models /tmp/unframe-test-models
export OPENCLIP_CACHE_DIR=/tmp/unframe-test-models
exec node --import ./scripts/verify-worker-limits.mjs worker/start.js
