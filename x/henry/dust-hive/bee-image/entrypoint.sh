#!/usr/bin/env bash
# Bee entrypoint. Brings up the always-on infrastructure a single-tenant bee
# needs, then idles. The per-bee boot (`dust-hive bee-init <name> --warm`) is
# driven by the control plane over the sandbox exec API — not here — so the
# image stays bee-name-agnostic.
#
# The dockerd bring-up mirrors Blaxel's blaxel/docker-in-sandbox, whose kernel
# workarounds are not distro-specific: vfs storage driver, no raw iptables,
# explicit cgroup2 mount, ip_forward. See:
# https://github.com/blaxel-ai/sandbox/tree/main/hub/docker-in-sandbox
set -euo pipefail

export PATH=/usr/local/cargo/bin:/usr/local/bun/bin:$PATH
# Blaxel sandbox kernels reject raw iptables; tell dockerd not to use it.
export DOCKER_INSECURE_NO_IPTABLES_RAW=1

# 1. Blaxel sandbox API — must be up for process/file/exec operations (:8080).
/usr/local/bin/sandbox-api &
until (exec 3<>/dev/tcp/127.0.0.1/8080) 2>/dev/null; do sleep 0.1; done

# 2. dockerd — for the bee's stateful services (PG/Redis/Qdrant/ES/Tika) via
#    docker compose. Mirrors Blaxel's proven blaxel/docker-in-sandbox setup
#    exactly: vfs storage driver (overlayfs unavailable in the microVM), raw
#    iptables disabled via the env var above, ip_forward on. Blaxel runs the
#    daemon in foreground; we background it so temporal can also start.
echo 1 > /proc/sys/net/ipv4/ip_forward || true
mkdir -p /sys/fs/cgroup
mount -t cgroup2 none /sys/fs/cgroup 2>/dev/null || true
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'JSON'
{
  "storage-driver": "vfs"
}
JSON
dockerd --config-file=/etc/docker/daemon.json --host=unix:///run/docker.sock \
  >/var/log/dockerd.log 2>&1 &
until docker info >/dev/null 2>&1; do sleep 0.2; done

# 2b. Load the baked Elasticsearch image (stock ES + analysis-icu) into dockerd
#     so `docker compose up` finds it and skips building — the bee has no buildx,
#     and building ES on every cold boot is the wrong model. The tag matches
#     docker-compose.yml `elasticsearch.image`. The other DB images pull at warm.
docker load -i /opt/es-image.tar >/var/log/es-load.log 2>&1

# 3. Temporal dev server — workers connect here and bee-init/warm creates
#    namespaces against it. Single-tenant, so the default port 7233 is fine.
#    Wait for the frontend port before idling so warm's isTemporalRunning probe
#    (and namespace creation) don't race a not-yet-listening server.
temporal server start-dev --db-filename /root/.dust-hive/temporal.db \
  --ip 0.0.0.0 >/var/log/temporal.log 2>&1 &
until (exec 3<>/dev/tcp/127.0.0.1/7233) 2>/dev/null; do sleep 0.1; done

# 4. Idle. bee-init + warm + the coding agent all arrive via the exec API.
#    Keep PID 1 alive for the lifetime of the sandbox.
tail -f /dev/null
