#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() { printf '\n[phase20-init] %s\n' "$*"; }
fail() { printf '\n[phase20-init] ERROR: %s\n' "$*" >&2; exit 1; }

if [[ "$(uname -s)" != "Linux" ]]; then
  fail "This initializer is for the Ubuntu VPS only."
fi
if [[ ! -x "$ROOT_DIR/.venv/bin/python" ]]; then
  fail "Run scripts/phase20-vps-bootstrap.sh first."
fi
if ! command -v systemctl >/dev/null 2>&1; then
  fail "systemd is required for the VPS service mode."
fi

SUDO=""
if [[ "$(id -u)" -ne 0 ]]; then
  command -v sudo >/dev/null 2>&1 || fail "Run as root or as a sudo-enabled user."
  SUDO="sudo"
fi

SERVICE_USER="$(id -un)"
NPM_BIN="$(command -v npx)"
NODE_BIN_DIR="$(dirname "$(command -v node)")"
PYTHON_BIN="$ROOT_DIR/.venv/bin/python"
ENV_FILE="$ROOT_DIR/.env.phase20-vps"
API_SERVICE="/etc/systemd/system/shalcon-phase20-api.service"
RUNNER_SERVICE="/etc/systemd/system/shalcon-phase20-runner.service"

if [[ ! -f "$ENV_FILE" ]]; then
  command -v openssl >/dev/null 2>&1 || $SUDO apt-get install -y openssl
  TOKEN="phase20-$(openssl rand -hex 24)"
  cat >"$ENV_FILE" <<EOF
SHALCON_API_BASE_URL=http://127.0.0.1:8787
SHALCON_RUNNER_TOKEN=$TOKEN
SHALCON_OLLAMA_URL=http://127.0.0.1:11434
SHALCON_OLLAMA_MODEL=qwen3:4b
SHALCON_OLLAMA_TIMEOUT_SECONDS=120
PYTHONPATH=$ROOT_DIR/apps/local-runner/src
EOF
  chmod 600 "$ENV_FILE"
  log "Created a new private Phase 20 runner token in $ENV_FILE"
else
  chmod 600 "$ENV_FILE"
  log "Reusing existing $ENV_FILE"
fi

log "Applying local D1 migrations without deleting existing Phase 20 state"
(
  cd "$ROOT_DIR/apps/api"
  "$NPM_BIN" wrangler d1 migrations apply DB --local --persist-to ../../.wrangler/phase20-operator
)

log "Installing systemd service definitions"
tmp_api="$(mktemp)"
cat >"$tmp_api" <<EOF
[Unit]
Description=Shalcon Phase 20 Local Operator API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$ROOT_DIR/apps/api
Environment=PATH=$NODE_BIN_DIR:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=$NPM_BIN wrangler dev src/phase20-operator.integration.ts --local --port 8787 --persist-to ../../.wrangler/phase20-operator
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
$SUDO install -m 644 "$tmp_api" "$API_SERVICE"
rm -f "$tmp_api"

tmp_runner="$(mktemp)"
cat >"$tmp_runner" <<EOF
[Unit]
Description=Shalcon Phase 20 Local Runner
After=network-online.target ollama.service shalcon-phase20-api.service
Wants=network-online.target
Requires=shalcon-phase20-api.service

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$ROOT_DIR
EnvironmentFile=$ENV_FILE
Environment=PATH=$NODE_BIN_DIR:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=$PYTHON_BIN -m shalcon_runner run
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
$SUDO install -m 644 "$tmp_runner" "$RUNNER_SERVICE"
rm -f "$tmp_runner"

$SUDO systemctl daemon-reload
$SUDO systemctl enable shalcon-phase20-api.service shalcon-phase20-runner.service >/dev/null
$SUDO systemctl restart shalcon-phase20-api.service

log "Waiting for the local operator API"
for _ in $(seq 1 45); do
  if curl -fsS http://127.0.0.1:8787/phase20/operator-health >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
curl -fsS http://127.0.0.1:8787/phase20/operator-health >/dev/null || {
  $SUDO systemctl status --no-pager shalcon-phase20-api.service || true
  fail "Phase 20 operator API did not become healthy."
}

prospect_count="$(curl -fsS http://127.0.0.1:8787/api/v1/prospects | python3 -c 'import json,sys; print(len(json.load(sys.stdin).get("prospects", [])))')"
if [[ "$prospect_count" == "0" ]]; then
  log "Seeding the locked 20-prospect cohort"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  node scripts/phase20-operator-seed.mjs
else
  log "Operator D1 already contains $prospect_count prospect(s); preserving it and skipping seed"
fi

log "Starting the Phase 20 runner"
$SUDO systemctl restart shalcon-phase20-runner.service
sleep 2
$SUDO systemctl is-active --quiet shalcon-phase20-api.service || fail "Phase 20 API service is not active."
$SUDO systemctl is-active --quiet shalcon-phase20-runner.service || {
  $SUDO systemctl status --no-pager shalcon-phase20-runner.service || true
  fail "Phase 20 runner service is not active."
}

log "Current Phase 20 status"
curl -fsS http://127.0.0.1:8787/phase20/status | python3 -m json.tool

log "Phase 20 VPS services are running"
printf '%s\n' \
  "API:    shalcon-phase20-api.service" \
  "Runner: shalcon-phase20-runner.service" \
  "Health: http://127.0.0.1:8787/phase20/operator-health" \
  "Logs:   sudo journalctl -u shalcon-phase20-runner.service -f"
