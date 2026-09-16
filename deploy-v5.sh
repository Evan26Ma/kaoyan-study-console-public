#!/usr/bin/env bash
set -euo pipefail

# Stop the service before running this script, then start it with your normal supervisor.
root=$(cd "$(dirname "$0")/.." && pwd)
node "$root/scripts/migrate-v5.js"
node "$root/scripts/migrate-v5.js"
