#!/usr/bin/env bash
# Counts mount RPCs for one command run on a fresh mount over a small populated tree.
# Usage: probe.bash 'command run inside the mount' [files]
set -euo pipefail

BIN=/target/release
PORT=${PORT:-7403}
export DFS_PREFIX=probe/
WORK=$(mktemp -d)
MNT=$WORK/mnt
mkdir -p "$MNT"
FILES=${2:-20}

start() {
    "$BIN/dfs-server" serve --listen "127.0.0.1:$PORT" >"$WORK/server.log" 2>&1 &
    SERVER_PID=$!
    until grep -q listening "$WORK/server.log"; do sleep 0.1; done
    DFS_TOKEN=$TOKEN "$BIN/dfs-mount" --profile "${PROFILE:-strict}" --addr "127.0.0.1:$PORT" "$MNT" >"$WORK/mount.log" 2>&1 &
    MOUNT_PID=$!
    until grep -q mounted "$WORK/mount.log"; do sleep 0.1; done
}
stop() {
    kill "$MOUNT_PID"; wait "$MOUNT_PID" || true
    kill "$SERVER_PID"; wait "$SERVER_PID" || true
}

"$BIN/dfs-server" wipe
TOKEN=$("$BIN/dfs-server" provision --grant alice:write --token-for alice |
    python3 -c 'import json, sys; print(json.load(sys.stdin)["tokens"]["alice"])')
start
mkdir "$MNT/d"
for i in $(seq 1 "$FILES"); do head -c 18000 /dev/urandom | base64 >"$MNT/d/f$i.txt"; done
stop
start
(cd "$MNT/d" && eval "$1" >/dev/null) || true
stop
tail -n 1 "$WORK/mount.log"
