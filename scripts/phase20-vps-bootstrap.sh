#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() { printf '\n[phase20-vps] %s\n' "$*"; }
fail() { printf '\n[phase20-vps] ERROR: %s\n' "$*" >&2; exit 1; }

if [[ "$(uname -s)" != "Linux" ]]; then
  fail "This bootstrap is for the Ubuntu VPS only."
fi

if ! command -v sudo >/dev/null 2>&1 && [[ "$(id -u)" -ne 0 ]]; then
  fail "Run as root or as a sudo-enabled user."
fi

SUDO=""
if [[ "$(id -u)" -ne 0 ]]; then
  SUDO="sudo"
fi

log "Installing base packages"
$SUDO apt-get update
$SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ca-certificates curl git build-essential python3 python3-venv python3-pip

need_node=1
if command -v node >/dev/null 2>&1; then
  node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
  if [[ "$node_major" -ge 22 ]]; then
    need_node=0
  fi
fi

if [[ "$need_node" -eq 1 ]]; then
  log "Installing Node.js 22"
  if [[ -n "$SUDO" ]]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  else
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  fi
  $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
fi

log "Installing JavaScript dependencies"
npm ci

log "Preparing Python virtual environment"
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip setuptools wheel
.venv/bin/python -m pip install -e 'apps/local-runner[dev]'

log "Installing Playwright Chromium and OS dependencies"
.venv/bin/python -m playwright install --with-deps chromium

if ! command -v ollama >/dev/null 2>&1; then
  log "Installing Ollama"
  curl -fsSL https://ollama.com/install.sh | sh
fi

if command -v systemctl >/dev/null 2>&1; then
  $SUDO systemctl enable --now ollama >/dev/null 2>&1 || true
fi

log "Waiting for Ollama"
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
curl -fsS http://127.0.0.1:11434/api/tags >/dev/null || fail "Ollama did not become ready on 127.0.0.1:11434."

log "Pulling qwen3:4b"
ollama pull qwen3:4b

export PYTHONPATH="$ROOT_DIR/apps/local-runner/src"
export SHALCON_OLLAMA_URL="http://127.0.0.1:11434"
export SHALCON_OLLAMA_MODEL="qwen3:4b"
export SHALCON_OLLAMA_TIMEOUT_SECONDS="120"

log "Running local-runner unit tests"
.venv/bin/python -m pytest apps/local-runner/tests -q

log "Running real Ollama structured-output smoke test"
.venv/bin/python -m shalcon_runner ai-smoke

log "Bootstrap complete"
printf '%s\n' \
  "Node: $(node --version)" \
  "Python: $(.venv/bin/python --version 2>&1)" \
  "Ollama model: qwen3:4b" \
  "Next: initialize the Phase 20 operator D1, seed the locked cohort, then start the API and runner."
