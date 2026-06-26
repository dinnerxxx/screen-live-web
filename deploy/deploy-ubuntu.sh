#!/usr/bin/env bash
set -euo pipefail

if [ ! -f .env.production ]; then
  echo "Missing .env.production. Copy deploy/.env.production.example to .env.production and edit it first."
  exit 1
fi

mkdir -p deploy/generated

render_template() {
  local input="$1"
  local output="$2"
  python3 - "$input" "$output" <<'PY'
import os, re, sys
src, dst = sys.argv[1], sys.argv[2]
env = {}
with open(".env.production", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k] = v
def repl(match):
    key = match.group(1)
    if key not in env or not env[key]:
        raise SystemExit(f"Missing value for {key}")
    return env[key]
text = open(src, encoding="utf-8").read()
text = re.sub(r"\$\{([A-Z0-9_]+)\}", repl, text)
open(dst, "w", encoding="utf-8").write(text)
PY
}

render_template deploy/Caddyfile.template deploy/generated/Caddyfile
render_template deploy/livekit.yaml.template deploy/generated/livekit.yaml

docker compose -f deploy/docker-compose.production.yml up -d

echo "Done."
echo "Check logs with:"
echo "docker compose -f deploy/docker-compose.production.yml logs -f"
