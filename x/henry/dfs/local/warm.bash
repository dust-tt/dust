#!/usr/bin/env bash
# Warm-row microbenchmark: first run and median of RUNS repeats of jd's metadata and rg workloads
# on one mount, plus the mount's per-operation counts. The tenant (DFS_PREFIX=warm/) is populated
# once from TAR and reused across invocations; POPULATE=1 rebuilds it.
set -euo pipefail

BIN=/target/release
PORT=${PORT:-7403}
export DFS_PREFIX=warm/
STATE=/tmp/dfs-warm
TAR=${TAR:-/tmp/vfs-3/corpus.tar}
MNT=$STATE/mnt
mkdir -p "$MNT"
PIDS=()

cleanup() {
    set +e
    for pid in "${PIDS[@]}"; do kill "$pid"; wait "$pid"; done
    fusermount3 -u "$MNT" 2>/dev/null || umount "$MNT" 2>/dev/null
}
trap cleanup EXIT

if [[ ${POPULATE:-0} == 1 || ! -f $STATE/token ]]; then
    "$BIN/dfs-server" wipe
    "$BIN/dfs-server" provision --grant owner:write --token-for owner |
        python3 -c 'import json, sys; print(json.load(sys.stdin)["tokens"]["owner"])' >"$STATE/token"
    rm -f "$STATE/populated"
fi
"$BIN/dfs-server" serve --listen "127.0.0.1:$PORT" >"$STATE/server.log" 2>&1 &
PIDS=($!)
until grep -q listening "$STATE/server.log"; do sleep 0.1; done

mount_it() {
    DFS_TOKEN=$(cat "$STATE/token") "$BIN/dfs-mount" --max-delay-ms "${DFS_MAX_DELAY_MS:-1000}" --addr "127.0.0.1:$PORT" "$MNT" >"$STATE/mount.log" 2>&1 &
    MOUNT_PID=$!
    until grep -q mounted "$STATE/mount.log"; do sleep 0.1; done
}
mount_it
if [[ ! -f $STATE/populated ]]; then
    mkdir "$MNT/work"
    tar --no-same-owner -xf "$TAR" -C "$MNT/work"
    python3 -c "import os, sys; os.fsync(os.open(sys.argv[1], os.O_RDONLY))" "$MNT/work"
    touch "$STATE/populated"
    kill "$MOUNT_PID"; wait "$MOUNT_PID" || true
    mount_it
fi
PIDS+=("$MOUNT_PID")

python3 - "$MNT/work/docs" "${RUNS:-20}" <<'EOF'
import os, random, statistics, subprocess, sys, time
docs, runs = sys.argv[1], int(sys.argv[2])
paths = sorted(os.path.relpath(os.path.join(d, f), docs) for d, _, fs in os.walk(docs) for f in fs)
selected = [paths[i] for i in sorted(random.Random(42).sample(range(len(paths)), 256))]
def rg(*args):
    subprocess.run(['rg', '--no-config', '--no-ignore', '--color', 'never', *args, '.'], cwd=docs, capture_output=True)
def missing():
    for i, p in enumerate(selected):
        try:
            os.stat(os.path.join(docs, os.path.dirname(p), f'missing_{i:05d}.txt'))
        except FileNotFoundError:
            pass
def fstat_all():
    for p in paths:
        fd = os.open(os.path.join(docs, p), os.O_RDONLY)
        os.fstat(fd)
        os.close(fd)
work = [('rg --files', lambda: rg('--files')), ('stat missing', missing),
        ('open+fstat+close', fstat_all), ('rg no-match', lambda: rg('-l', '-F', 'BENCH_ABSENT_TOKEN'))]
for name, fn in work:
    times = []
    for _ in range(runs + 1):
        t = time.perf_counter(); fn(); times.append((time.perf_counter() - t) * 1000)
    q = statistics.quantiles(times[1:], n=4)
    print(f'{name:18} first {times[0]:9.2f} ms   warm median {q[1]:8.2f} ms   p25 {q[0]:8.2f}   p75 {q[2]:8.2f}   min {min(times[1:]):8.2f}')
EOF
kill "$MOUNT_PID"; wait "$MOUNT_PID" || true
PIDS=("${PIDS[0]}")
tail -n 1 "$STATE/mount.log"
