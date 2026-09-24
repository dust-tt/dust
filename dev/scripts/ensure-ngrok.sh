#!/usr/bin/env bash
# Ensure ngrok HTTPS tunnels to front-api (:3000) and viz (:3007), and persist
# their public URLs for SBX_DEV_FRONT_URL / SBX_DEV_VIZ_URL (sandbox → local).
#
# Starts both endpoints via an agent config with distinct *.ngrok.app URLs.
# Bare `ngrok http` would reuse a sticky *.ngrok-free.dev hostname for every
# tunnel, which breaks sandbox viz (front and viz share one host → Next 404s).
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
NGROK_CONFIG_FILE="${NGROK_CONFIG_FILE:-${DUST_INFRA_LOG_DIR}/ngrok-dust-dev.yml}"
NGROK_DEV_ID_FILE="${NGROK_DEV_ID_FILE:-${DUST_INFRA_LOG_DIR}/ngrok-dev-id}"
# Paid / team accounts get *.ngrok.app; override only if you need a different pool.
NGROK_DOMAIN_SUFFIX="${NGROK_DOMAIN_SUFFIX:-ngrok.app}"

mkdir -p "${DUST_INFRA_LOG_DIR}"

ngrok_agent_up() {
  curl -sf "${NGROK_API_URL}/api/tunnels" >/dev/null 2>&1
}

# Stable per-container id so restarts keep the same endpoint names when possible.
ngrok_dev_id() {
  if [ -f "${NGROK_DEV_ID_FILE}" ]; then
    local existing
    existing="$(tr -d '[:space:]' <"${NGROK_DEV_ID_FILE}")"
    if [ -n "${existing}" ]; then
      printf '%s' "${existing}"
      return 0
    fi
  fi
  local id
  id="$(openssl rand -hex 4)"
  printf '%s\n' "${id}" >"${NGROK_DEV_ID_FILE}"
  chmod 644 "${NGROK_DEV_ID_FILE}"
  printf '%s' "${id}"
}

rotate_ngrok_dev_id() {
  rm -f "${NGROK_DEV_ID_FILE}"
  ngrok_dev_id >/dev/null
}

front_endpoint_url() {
  printf 'https://dust-dev-front-%s.%s' "$1" "${NGROK_DOMAIN_SUFFIX}"
}

viz_endpoint_url() {
  printf 'https://dust-dev-viz-%s.%s' "$1" "${NGROK_DOMAIN_SUFFIX}"
}

write_ngrok_config() {
  local id="$1"
  cat >"${NGROK_CONFIG_FILE}" <<EOF
version: 3
agent:
  web_addr: 127.0.0.1:4040
  log: stdout
endpoints:
  - name: front-api
    url: $(front_endpoint_url "${id}")
    upstream:
      url: ${NGROK_FRONT_ADDR}
  - name: viz
    url: $(viz_endpoint_url "${id}")
    upstream:
      url: ${NGROK_VIZ_ADDR}
EOF
  chmod 644 "${NGROK_CONFIG_FILE}"
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

# True when front and viz both exist but share one public hostname (broken).
tunnels_share_public_url() {
  local front_url viz_url
  front_url="$(ngrok_public_url_for_addr "${NGROK_FRONT_ADDR}")"
  viz_url="$(ngrok_public_url_for_addr "${NGROK_VIZ_ADDR}")"
  [ -n "${front_url}" ] && [ -n "${viz_url}" ] && [ "${front_url}" = "${viz_url}" ]
}

request_tunnel() {
  local name="$1"
  local addr="$2"
  local url="${3:-}"
  local body
  if [ -n "${url}" ]; then
    body="$(printf '{"name":"%s","addr":"%s","proto":"http","url":"%s"}' \
      "${name}" "${addr}" "${url}")"
  else
    body="$(printf '{"name":"%s","addr":"%s","proto":"http"}' "${name}" "${addr}")"
  fi
  curl -sf -X POST "${NGROK_API_URL}/api/tunnels" \
    -H "Content-Type: application/json" \
    -d "${body}" \
    >/dev/null 2>&1 || true
}

stop_ngrok_agent() {
  local pid=""
  if [ -f "${NGROK_PID_FILE}" ]; then
    pid="$(tr -d '[:space:]' <"${NGROK_PID_FILE}")"
  fi
  if [ -n "${pid}" ] && kill -0 "${pid}" 2>/dev/null; then
    log "Stopping existing ngrok agent (pid ${pid})..."
    kill "${pid}" 2>/dev/null || true
    # Wait briefly for the API port to free.
    local i=0
    while [ "$i" -lt 10 ] && ngrok_agent_up; do
      sleep 0.3
      i=$((i + 1))
    done
    kill -9 "${pid}" 2>/dev/null || true
  elif ngrok_agent_up; then
    # Agent up without our pid file (manual start / prior session).
    local orphan
    orphan="$(pgrep -x ngrok | head -1 || true)"
    if [ -n "${orphan}" ]; then
      log "Stopping orphan ngrok agent (pid ${orphan})..."
      kill "${orphan}" 2>/dev/null || true
      sleep 0.5
      kill -9 "${orphan}" 2>/dev/null || true
    fi
  fi
  rm -f "${NGROK_PID_FILE}"
  # Clear log for the new session so failures are easy to read.
  : >"${NGROK_LOG_FILE}"
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

  local id front_url viz_url
  id="$(ngrok_dev_id)"
  front_url="$(front_endpoint_url "${id}")"
  viz_url="$(viz_endpoint_url "${id}")"
  write_ngrok_config "${id}"

  log "Starting ngrok endpoints front=${front_url} viz=${viz_url}..."
  # NGROK_AUTHTOKEN is read from the environment by the ngrok agent.
  nohup ngrok start --all --config="${NGROK_CONFIG_FILE}" --log=stdout \
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
  local preferred_url="${5:-}"
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
      request_tunnel "${tunnel_name}" "${addr}" "${preferred_url}"
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
  local preferred_url="${5:-}"
  local url

  url="$(ngrok_public_url_for_addr "${addr}")"
  if [ -n "${url}" ]; then
    persist_url "${url}" "${file}" "Reusing ${label}"
    return 0
  fi

  wait_for_url "${addr}" "${file}" "${label}" "${tunnel_name}" "${preferred_url}"
}

ensure_distinct_tunnels_or_restart() {
  if ! ngrok_agent_up; then
    return 0
  fi
  if tunnels_share_public_url; then
    log "front and viz share one public URL; restarting ngrok with distinct endpoints"
    stop_ngrok_agent
    return 0
  fi
  local front_url viz_url
  front_url="$(ngrok_public_url_for_addr "${NGROK_FRONT_ADDR}")"
  viz_url="$(ngrok_public_url_for_addr "${NGROK_VIZ_ADDR}")"
  # Agent up with only front (old script) — leave it; ensure_tunnel will add viz
  # with an explicit URL below.
  if [ -n "${front_url}" ] && [ -z "${viz_url}" ]; then
    log "ngrok agent up with front only; will add a distinct viz endpoint"
  fi
}

# --- main ---

ensure_distinct_tunnels_or_restart

if ! ngrok_agent_up; then
  if ! start_ngrok_agent; then
    rm -f "${SBX_DEV_FRONT_URL_FILE}" "${SBX_DEV_VIZ_URL_FILE}"
    exit 0
  fi
fi

DEV_ID="$(ngrok_dev_id)"
PREFERRED_FRONT_URL="$(front_endpoint_url "${DEV_ID}")"
PREFERRED_VIZ_URL="$(viz_endpoint_url "${DEV_ID}")"

# Front-api is required for sandbox API callbacks.
if ! ensure_tunnel "${NGROK_FRONT_ADDR}" "${SBX_DEV_FRONT_URL_FILE}" \
  "Sandbox front tunnel (SBX_DEV_FRONT_URL)" "front-api" "${PREFERRED_FRONT_URL}"; then
  # Endpoint name may already be claimed on the shared account — rotate and retry once.
  log "front tunnel failed; rotating endpoint id and retrying once"
  stop_ngrok_agent
  rotate_ngrok_dev_id
  DEV_ID="$(ngrok_dev_id)"
  PREFERRED_FRONT_URL="$(front_endpoint_url "${DEV_ID}")"
  PREFERRED_VIZ_URL="$(viz_endpoint_url "${DEV_ID}")"
  if ! start_ngrok_agent || ! ensure_tunnel "${NGROK_FRONT_ADDR}" "${SBX_DEV_FRONT_URL_FILE}" \
    "Sandbox front tunnel (SBX_DEV_FRONT_URL)" "front-api" "${PREFERRED_FRONT_URL}"; then
    rm -f "${SBX_DEV_FRONT_URL_FILE}" "${SBX_DEV_VIZ_URL_FILE}"
    exit 0
  fi
fi

# Viz so sandboxes can fetch frame-runtime from local viz (:3007).
# Soft-fail: some plans may not allow a second concurrent tunnel.
if ! ensure_tunnel "${NGROK_VIZ_ADDR}" "${SBX_DEV_VIZ_URL_FILE}" \
  "Sandbox viz tunnel (SBX_DEV_VIZ_URL)" "viz" "${PREFERRED_VIZ_URL}"; then
  log "viz tunnel (:3007) not available; sandboxes will fall back to VIZ_PUBLIC_URL"
  rm -f "${SBX_DEV_VIZ_URL_FILE}"
elif tunnels_share_public_url; then
  log "viz tunnel collided with front URL; dropping viz URL file (sandboxes use VIZ_PUBLIC_URL)"
  rm -f "${SBX_DEV_VIZ_URL_FILE}"
fi
