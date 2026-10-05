#!/usr/bin/env bash
# End-to-end smoke test inside the dev container: provision, serve, mount, POSIX ops, untar, verify.
set -euo pipefail

BIN=/target/release
PORT=${PORT:-7401}
export DFS_PREFIX=smoke/
WORK=$(mktemp -d)
MNT=$WORK/mnt
mkdir -p "$MNT"

cleanup() {
    set +e
    [[ -n ${MOUNT_PID:-} ]] && kill "$MOUNT_PID" && wait "$MOUNT_PID"
    [[ -n ${SERVER_PID:-} ]] && kill "$SERVER_PID" && wait "$SERVER_PID"
    fusermount3 -u "$MNT" 2>/dev/null || umount "$MNT" 2>/dev/null
    echo "--- server"; tail -n 3 "$WORK/server.log"
    echo "--- mount"; tail -n 3 "$WORK/mount.log"
}
trap cleanup EXIT

"$BIN/dfs-server" wipe
TOKEN=$("$BIN/dfs-server" provision --grant alice:write --token-for alice |
    python3 -c 'import json, sys; print(json.load(sys.stdin)["tokens"]["alice"])')
"$BIN/dfs-server" serve --listen "127.0.0.1:$PORT" >"$WORK/server.log" 2>&1 &
SERVER_PID=$!
until grep -q listening "$WORK/server.log"; do sleep 0.1; done
DFS_TOKEN=$TOKEN "$BIN/dfs-mount" --profile "${PROFILE:-strict}" --addr "127.0.0.1:$PORT" "$MNT" >"$WORK/mount.log" 2>&1 &
MOUNT_PID=$!
until grep -q mounted "$WORK/mount.log"; do sleep 0.1; done

cd "$MNT"
echo hello >a.txt
[[ $(cat a.txt) == hello ]]
mkdir -p d/e
echo world >d/e/b.txt
mv d/e/b.txt d/c.txt
[[ $(cat d/c.txt) == world ]]
[[ ! -e d/e/b.txt ]]
ln -s ../a.txt d/link
[[ $(cat d/link) == hello ]]
touch -d '2001-02-03 04:05:06' a.txt
[[ $(stat -c %Y a.txt) == 981173106 ]]
echo more >>a.txt
[[ $(wc -l <a.txt) == 2 ]]
: >a.txt
[[ $(stat -c %s a.txt) == 0 ]]
rm a.txt
rmdir d/e
[[ $(ls d | tr '\n' ' ') == "c.txt link " ]]
if rmdir d 2>/dev/null; then echo "rmdir of a non-empty directory succeeded"; exit 1; fi
head -c 3000000 /dev/urandom >big
[[ $(stat -c %s big) == 3000000 ]]
cmp big <(cat big)
cd /

# Small untar with content verification.
SRC=$WORK/src
mkdir -p "$SRC"
for i in $(seq 1 200); do
    mkdir -p "$SRC/dir-$((i % 7))"
    head -c $((i * 97)) /dev/urandom >"$SRC/dir-$((i % 7))/file-$i"
done
tar -C "$SRC" -cf "$WORK/small.tar" .
mkdir "$MNT/untar"
tar --no-same-owner -C "$MNT/untar" -xf "$WORK/small.tar"
(cd "$SRC" && find . -type f -exec sha256sum {} + | sort) >"$WORK/want"
(cd "$MNT/untar" && find . -type f -exec sha256sum {} + | sort) >"$WORK/got"
diff "$WORK/want" "$WORK/got"
echo "smoke ok"
