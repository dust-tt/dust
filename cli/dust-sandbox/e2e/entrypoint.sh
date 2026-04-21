#!/usr/bin/env bash
set -euo pipefail

# Run as root inside the e2e container. Sets up the iptables REDIRECT rules
# that send outbound HTTP(S) from the `dust-fwd` uid to the local `dsbx forward`
# listener, then hands off to the bun orchestrator which will spawn `dsbx forward`
# and drop to `dust-fwd` for the actual HTTPS test calls.

if [ "$(id -u)" -ne 0 ]; then
  echo "entrypoint.sh must run as root (need NET_ADMIN for iptables)" >&2
  exit 2
fi

if ! iptables -t nat -L >/dev/null 2>&1; then
  cat >&2 <<'EOF'
iptables/nat is not available in this container. Start it with:
  docker run --cap-add=NET_ADMIN ...
EOF
  exit 2
fi

DUST_FWD_UID="$(id -u dust-fwd)"
LISTEN_PORT="${DSBX_LISTEN_PORT:-9990}"

# Idempotent REDIRECT rules: 80/443 from dust-fwd -> dsbx forward on localhost:9990.
# dsbx forward runs as root, so its own outbound (to the proxy on :4443) is not
# matched by --uid-owner dust-fwd and passes through untouched.
for DPORT in 80 443; do
  if ! iptables -t nat -C OUTPUT -m owner --uid-owner "${DUST_FWD_UID}" \
        -p tcp --dport "${DPORT}" -j REDIRECT --to-ports "${LISTEN_PORT}" 2>/dev/null; then
    iptables -t nat -A OUTPUT -m owner --uid-owner "${DUST_FWD_UID}" \
      -p tcp --dport "${DPORT}" -j REDIRECT --to-ports "${LISTEN_PORT}"
  fi
done

exec bun /app/smoke.ts "$@"
