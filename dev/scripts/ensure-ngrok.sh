#!/usr/bin/env bash
# Ensure ngrok HTTPS tunnels to front-api (:3000) and viz (:3007), and persist
# their public URLs for SBX_DEV_FRONT_URL / SBX_DEV_VIZ_URL (sandbox → local).
# Soft-fails when auth is missing.
set -euo pipefail

DUST_DEV_SCRIPT_NAME=ensure-ngrok
# shellcheck source=dev/scripts/common.sh
source "$(dirname "$0")/common.sh"
# shellcheck source=dev/scripts/env.sh
source "$(dirname "$0")/env.sh"

NGROK_API_URL="${NGROK_API_URL:-http://127.0.0.1:4040}"
NGROK_FRONT_ADDR="${NGROK_FRONT_ADDR:-http://localhost:3000}"
NGROK_VIZ_ADDR="${NGROK_VIZ_ADDR:-http://localhost:3007}"
SBX_DEV_FRONT_URL_FILE="${SBX_DEV_FRONT_URL_FILE:-${DUST_INFRA_LOG_DIR}/sbx-dev-front-url}"
SBX_DEV_VIZ_URL_FILE="${SBX_DEV_VIZ_URL_FILE:-${DUST_INFRA_LOG_DIR}/sbx-dev-viz-url}"
NGROK_LOG_FILE="${DUST_INFRA_LOG_DIR}/ngrok.log"
NGROK_PID_FILE="${DUST_INFRA_LOG_DIR}/ngrok.pid"

mkdir -p "${DUST_INFRA_LOG_DIR}"

ngrok_agent_up() {
  curl -sf "${NGROK_API_URL}/api/tunnels" >/dev/null 2>&1
}

# Print the https public_url for a tunnel whose config.addr matches want_addr, or
# empty stdout when none match / the agent has no tunnels yet.
ngrok_public_url_for_addr() {
  local want_addr="$1"
  python3 - "${NGROK_API_URL}" "${want_addr}" <<'PY'
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
if matched:
    print(matched["public_url"].rstrip("/"))
PY
}

request_tunnel() {
  local name="$1"
  local addr="$2"
  curl -sf -X POST "${NGROK_API_URL}/api/tunnels" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"${name}\",\"addr\":\"${addr}\",\"proto\":\"http\"}" \
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
  # Viz (:3007) is added via the local agent API once this tunnel is up.
  nohup ngrok http --log=stdout "${NGROK_FRONT_ADDR}" \
    >>"${NGROK_LOG_FILE}" 2>&1 &
  echo $! >"${NGROK_PID_FILE}"
}

persist_url() {
  local url="$1"
  local file="$2"
  local label="$3"
  printf '%s\n' "${url}" >"${file}"
  chmod 644 "${file}"
  log "${label}: ${url} (-> ${file})"
}

wait_for_url() {
  local addr="$1"
  local file="$2"
  local label="$3"
  local tunnel_name="$4"
  local attempt=0
  local max_attempts="${DUST_NGROK_WAIT_SECONDS:-30}"
  local url=""

  until url="$(ngrok_public_url_for_addr "${addr}")" && [ -n "${url}" ]; do
    attempt=$((attempt + 1))
    if [ "$attempt" -gt "$max_attempts" ]; then
      log "ngrok did not publish a public URL for ${addr} in time (see ${NGROK_LOG_FILE})"
      if [ -f "${NGROK_LOG_FILE}" ]; then
        tail -40 "${NGROK_LOG_FILE}"
      fi
      return 1
    fi
    if [ "$attempt" -eq 1 ] || [ $((attempt % 5)) -eq 0 ]; then
      log "Waiting for ngrok public URL for ${addr} (${attempt}s)..."
    fi
    # If an agent is up without this tunnel, request one once early.
    if [ "$attempt" -eq 2 ] && ngrok_agent_up; then
      request_tunnel "${tunnel_name}" "${addr}"
    fi
    sleep 1
  done

  persist_url "${url}" "${file}" "${label}"
}

ensure_tunnel() {
  local addr="$1"
  local file="$2"
  local label="$3"
  local tunnel_name="$4"
  local url

  url="$(ngrok_public_url_for_addr "${addr}")"
  if [ -n "${url}" ]; then
    persist_url "${url}" "${file}" "Reusing ${label}"
    return 0
  fi

  wait_for_url "${addr}" "${file}" "${label}" "${tunnel_name}"
}

# --- main ---

if ! ngrok_agent_up; then
  if ! start_ngrok_agent; then
    rm -f "${SBX_DEV_FRONT_URL_FILE}" "${SBX_DEV_VIZ_URL_FILE}"
    exit 0
  fi
fi

# Front-api is required for sandbox API callbacks.
ensure_tunnel "${NGROK_FRONT_ADDR}" "${SBX_DEV_FRONT_URL_FILE}" \
  "Sandbox front tunnel (SBX_DEV_FRONT_URL)" "front-api"

# Viz so sandboxes can fetch frame-runtime from local viz (:3007).
# Soft-fail: free ngrok plans may only allow one concurrent tunnel.
if ! ensure_tunnel "${NGROK_VIZ_ADDR}" "${SBX_DEV_VIZ_URL_FILE}" \
  "Sandbox viz tunnel (SBX_DEV_VIZ_URL)" "viz"; then
  log "viz tunnel (:3007) not available; sandboxes will fall back to VIZ_PUBLIC_URL"
  rm -f "${SBX_DEV_VIZ_URL_FILE}"
fi
