#!/usr/bin/env bash
# Ensure an ngrok HTTPS tunnel to front-api (:3000) and persist its public URL
# for SBX_DEV_FRONT_URL (sandbox → local API). Soft-fails when auth is missing.
set -euo pipefail

DUST_DEV_SCRIPT_NAME=ensure-ngrok
# shellcheck source=dev/scripts/common.sh
source "$(dirname "$0")/common.sh"
# shellcheck source=dev/scripts/env.sh
source "$(dirname "$0")/env.sh"

NGROK_API_URL="${NGROK_API_URL:-http://127.0.0.1:4040}"
NGROK_FRONT_ADDR="${NGROK_FRONT_ADDR:-http://localhost:3000}"
SBX_DEV_FRONT_URL_FILE="${SBX_DEV_FRONT_URL_FILE:-${DUST_INFRA_LOG_DIR}/sbx-dev-front-url}"
NGROK_LOG_FILE="${DUST_INFRA_LOG_DIR}/ngrok.log"
NGROK_PID_FILE="${DUST_INFRA_LOG_DIR}/ngrok.pid"

mkdir -p "${DUST_INFRA_LOG_DIR}"

ngrok_agent_up() {
  curl -sf "${NGROK_API_URL}/api/tunnels" >/dev/null 2>&1
}

# Print the https public_url for a tunnel whose config.addr targets front-api, or
# any https tunnel if none match. Empty stdout when the agent has no tunnels yet.
ngrok_front_public_url() {
  python3 - "${NGROK_API_URL}" "${NGROK_FRONT_ADDR}" <<'PY'
import json, sys, urllib.error, urllib.request

api, want_addr = sys.argv[1], sys.argv[2]
want_port = want_addr.rsplit(":", 1)[-1]

try:
    with urllib.request.urlopen(f"{api}/api/tunnels", timeout=2) as resp:
        tunnels = json.load(resp).get("tunnels") or []
except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
    sys.exit(0)

https = [t for t in tunnels if t.get("proto") == "https" and t.get("public_url")]
if not https:
    sys.exit(0)

def addr_matches(t: dict) -> bool:
    addr = (t.get("config") or {}).get("addr") or ""
    return addr.rstrip("/").endswith(f":{want_port}") or addr.rstrip("/") == want_addr.rstrip("/")

matched = next((t for t in https if addr_matches(t)), None)
print((matched or https[0])["public_url"].rstrip("/"))
PY
}

request_front_tunnel() {
  # Agent already running (e.g. Slack named tunnel) — ask it for :3000 as well.
  curl -sf -X POST "${NGROK_API_URL}/api/tunnels" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"front-api\",\"addr\":\"${NGROK_FRONT_ADDR}\",\"proto\":\"http\"}" \
    >/dev/null 2>&1 || true
}

start_ngrok_agent() {
  if ! command -v ngrok >/dev/null 2>&1; then
    log "ngrok not found; rebuild the dev/Dockerfile image"
    return 1
  fi
  if [ -z "${NGROK_AUTHTOKEN:-}" ]; then
    log "NGROK_AUTHTOKEN not set (add it to the 1Password Environment); skipping sandbox tunnel"
    return 1
  fi

  log "Starting ngrok http tunnel to ${NGROK_FRONT_ADDR}..."
  # NGROK_AUTHTOKEN is read from the environment by the ngrok agent.
  nohup ngrok http --log=stdout "${NGROK_FRONT_ADDR}" \
    >>"${NGROK_LOG_FILE}" 2>&1 &
  echo $! >"${NGROK_PID_FILE}"
}

wait_for_front_url() {
  local attempt=0
  local max_attempts="${DUST_NGROK_WAIT_SECONDS:-30}"
  local url=""

  until url="$(ngrok_front_public_url)" && [ -n "${url}" ]; do
    attempt=$((attempt + 1))
    if [ "$attempt" -gt "$max_attempts" ]; then
      log "ngrok did not publish a public URL in time (see ${NGROK_LOG_FILE})"
      if [ -f "${NGROK_LOG_FILE}" ]; then
        tail -40 "${NGROK_LOG_FILE}"
      fi
      return 1
    fi
    if [ "$attempt" -eq 1 ] || [ $((attempt % 5)) -eq 0 ]; then
      log "Waiting for ngrok public URL (${attempt}s)..."
    fi
    # If an agent is up without a :3000 tunnel, request one once early.
    if [ "$attempt" -eq 2 ] && ngrok_agent_up; then
      request_front_tunnel
    fi
    sleep 1
  done

  printf '%s\n' "${url}" >"${SBX_DEV_FRONT_URL_FILE}"
  chmod 644 "${SBX_DEV_FRONT_URL_FILE}"
  log "Sandbox front tunnel: ${url} (SBX_DEV_FRONT_URL -> ${SBX_DEV_FRONT_URL_FILE})"
}

persist_existing_url() {
  local url
  url="$(ngrok_front_public_url)"
  if [ -z "${url}" ]; then
    return 1
  fi
  printf '%s\n' "${url}" >"${SBX_DEV_FRONT_URL_FILE}"
  chmod 644 "${SBX_DEV_FRONT_URL_FILE}"
  log "Reusing ngrok tunnel: ${url} (SBX_DEV_FRONT_URL -> ${SBX_DEV_FRONT_URL_FILE})"
}

if persist_existing_url; then
  exit 0
fi

if ngrok_agent_up; then
  log "ngrok agent is up but has no :3000 tunnel; requesting front-api tunnel"
  request_front_tunnel
  wait_for_front_url
  exit 0
fi

if ! start_ngrok_agent; then
  rm -f "${SBX_DEV_FRONT_URL_FILE}"
  exit 0
fi

wait_for_front_url
