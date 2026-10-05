#!/usr/bin/env bash
# Two mounts of one tenant: every change made through A is visible through B immediately, even
# though B holds lease-covered caches of what changed (positive, negative, listing, content).
set -euo pipefail

BIN=/target/release
PORT=${PORT:-7402}
export DFS_PREFIX=coherence/
WORK=$(mktemp -d)
A=$WORK/a
B=$WORK/b
mkdir -p "$A" "$B"
PIDS=()

cleanup() {
    set +e
    for pid in "${PIDS[@]}"; do kill "$pid"; wait "$pid"; done
    for m in "$A" "$B"; do fusermount3 -u "$m" 2>/dev/null || umount "$m" 2>/dev/null; done
    echo "--- server"; tail -n 2 "$WORK/server.log"
    echo "--- mounts"; tail -n 1 "$WORK/a.log"; tail -n 1 "$WORK/b.log"
}
trap cleanup EXIT

"$BIN/dfs-server" wipe
CREATED=$("$BIN/dfs-server" provision --grant team:write --token-for alice --token-for bob)
token() { python3 -c "import json, sys; print(json.loads(sys.argv[1])['$1'])" "$CREATED"; }
ADMIN=$(token admin)
ALICE=$(python3 -c "import json, sys; print(json.loads(sys.argv[1])['tokens']['alice'])" "$CREATED")
BOB=$(python3 -c "import json, sys; print(json.loads(sys.argv[1])['tokens']['bob'])" "$CREATED")
"$BIN/dfs-server" serve --listen "127.0.0.1:$PORT" >"$WORK/server.log" 2>&1 &
PIDS=($!)
until grep -q listening "$WORK/server.log"; do sleep 0.1; done
admin() { "$BIN/dfs-server" admin --addr "127.0.0.1:$PORT" --token "$ADMIN" "$@" >/dev/null; }
admin members team alice bob
mount_as() {
    DFS_TOKEN=$1 "$BIN/dfs-mount" --addr "127.0.0.1:$PORT" "$2" >"$WORK/$(basename "$2").log" 2>&1 &
    PIDS+=($!)
    until grep -q mounted "$WORK/$(basename "$2").log"; do sleep 0.1; done
}
mount_as "$ALICE" "$A"
mount_as "$BOB" "$B"

expect() { if [[ "$1" != "$2" ]]; then echo "FAIL: $3: got '$1', want '$2'"; exit 1; fi; }

mkdir "$A/d"
expect "$(ls "$B/d" | wc -l)" 0 "B lists the empty directory (caches a complete listing)"
[[ ! -e $B/d/x ]]                     # B caches a negative entry
echo one >"$A/d/x"
expect "$(cat "$B/d/x")" one "B sees A's new file"
expect "$(ls "$B/d")" x "B's cached listing was invalidated"
echo two >"$A/d/x"
expect "$(cat "$B/d/x")" two "B sees A's overwrite (page cache purged)"
expect "$(stat -c %s "$B/d/x")" 4 "B sees the new size"
mv "$A/d/x" "$A/d/y"
[[ ! -e $B/d/x ]] || { echo "FAIL: stale positive entry after rename"; exit 1; }
expect "$(cat "$B/d/y")" two "B sees the rename target"
chmod 600 "$A/d/y"
expect "$(stat -c %a "$B/d/y")" 600 "B sees A's chmod"
rm "$A/d/y"
[[ ! -e $B/d/y ]] || { echo "FAIL: stale entry after unlink"; exit 1; }
mkdir "$A/d/e"
echo z >"$B/d/e/z"
expect "$(cat "$A/d/e/z")" z "A sees B's file in a directory A created"

# Authorization changes invalidate everything: revoking bob's write stops him at once.
D=$(stat -c %i "$A/d")
admin boundary "$D"
admin grant "$D" alice write
if (echo nope >"$B/d/e/w") 2>/dev/null; then echo "FAIL: bob wrote below a boundary"; exit 1; fi
echo yes >"$A/d/e/w"
expect "$(cat "$B/d/e/w")" yes "bob can still read below the boundary"
echo "coherence ok"
