#!/usr/bin/env bash
# Run as root on Linux after building dsbx. This uses a real FUSE mount.
set -euo pipefail

DSBX_BINARY="${DSBX_BINARY:-./target/release/dsbx}"
TEST_DIR="$(mktemp -d)"
MOUNTPOINT="$TEST_DIR/files"
STATE_DIR="$TEST_DIR/state"
FS_PID=""

mkdir -p "$MOUNTPOINT" "$STATE_DIR"

stop_filesystem() {
  if grep -q " $MOUNTPOINT " /proc/mounts; then
    umount "$MOUNTPOINT"
  fi
  if [[ -n "$FS_PID" ]]; then
    wait "$FS_PID" || true
    FS_PID=""
  fi
}

cleanup() {
  stop_filesystem
  rm -rf "$TEST_DIR"
}
trap cleanup EXIT

start_filesystem() {
  "$DSBX_BINARY" filesystem mount \
    --mountpoint "$MOUNTPOINT" \
    --state-dir "$STATE_DIR" \
    >"$STATE_DIR/daemon.log" 2>&1 &
  FS_PID=$!

  for _ in {1..100}; do
    if grep -q " $MOUNTPOINT " /proc/mounts; then
      return
    fi
    sleep 0.05
  done

  cat "$STATE_DIR/daemon.log"
  echo "filesystem did not mount" >&2
  exit 1
}

node_id() {
  sed -n 's/.*"id": \([0-9][0-9]*\).*/\1/p' "$1" | head -1
}

start_filesystem

# Create, write, read, and attach a shareable Dust file.
printf old >"$MOUNTPOINT/conversation/frame.tsx"
test "$(cat "$MOUNTPOINT/conversation/frame.tsx")" = old
"$DSBX_BINARY" filesystem attach \
  --state-dir "$STATE_DIR" \
  conversation/frame.tsx \
  --file-resource-id fil_frame \
  >"$STATE_DIR/attached.json"
ATTACHED_ID="$(node_id "$STATE_DIR/attached.json")"

# Opening an existing path with truncation keeps its identity.
printf updated >"$MOUNTPOINT/conversation/frame.tsx"
"$DSBX_BINARY" filesystem show \
  --state-dir "$STATE_DIR" \
  conversation/frame.tsx \
  >"$STATE_DIR/updated.json"
test "$(node_id "$STATE_DIR/updated.json")" = "$ATTACHED_ID"
test "$(cat "$MOUNTPOINT/conversation/frame.tsx")" = updated

# Both moves are one rename. No file bytes move or copy.
mv "$MOUNTPOINT/conversation/frame.tsx" \
  "$MOUNTPOINT/conversation/renamed.tsx"
mv "$MOUNTPOINT/conversation/renamed.tsx" "$MOUNTPOINT/pod/frame.tsx"
"$DSBX_BINARY" filesystem show \
  --state-dir "$STATE_DIR" \
  pod/frame.tsx \
  >"$STATE_DIR/moved.json"
test "$(node_id "$STATE_DIR/moved.json")" = "$ATTACHED_ID"
grep -q fil_frame "$STATE_DIR/moved.json"

# An editor's temporary file becomes the new inode. The FileResource follows it.
printf new >"$MOUNTPOINT/pod/.frame.tsx.tmp"
mv -f "$MOUNTPOINT/pod/.frame.tsx.tmp" "$MOUNTPOINT/pod/frame.tsx"
test "$(cat "$MOUNTPOINT/pod/frame.tsx")" = new
"$DSBX_BINARY" filesystem show \
  --state-dir "$STATE_DIR" \
  pod/frame.tsx \
  >"$STATE_DIR/saved.json"
SAVED_ID="$(node_id "$STATE_DIR/saved.json")"
test "$SAVED_ID" != "$ATTACHED_ID"
grep -q fil_frame "$STATE_DIR/saved.json"

# A folder and all its children keep their IDs when crossing the two roots.
mkdir -p "$MOUNTPOINT/conversation/project/nested"
printf child >"$MOUNTPOINT/conversation/project/nested/file.txt"
"$DSBX_BINARY" filesystem show \
  --state-dir "$STATE_DIR" \
  conversation/project/nested/file.txt \
  >"$STATE_DIR/child-before.json"
mv "$MOUNTPOINT/conversation/project" "$MOUNTPOINT/pod/project"
"$DSBX_BINARY" filesystem show \
  --state-dir "$STATE_DIR" \
  pod/project/nested/file.txt \
  >"$STATE_DIR/child-after.json"
test "$(node_id "$STATE_DIR/child-before.json")" = \
  "$(node_id "$STATE_DIR/child-after.json")"
test "$(cat "$MOUNTPOINT/pod/project/nested/file.txt")" = child
mkdir "$MOUNTPOINT/pod/empty"
rmdir "$MOUNTPOINT/pod/empty"

# SQLite and the content folder survive a daemon restart.
printf restart >"$MOUNTPOINT/conversation/persist.txt"
stop_filesystem
start_filesystem
test "$(cat "$MOUNTPOINT/conversation/persist.txt")" = restart

# Delete records retain the FileResource ID for Front to process.
rm "$MOUNTPOINT/pod/frame.tsx"
"$DSBX_BINARY" filesystem changes \
  --state-dir "$STATE_DIR" \
  >"$STATE_DIR/changes.json"
grep -q deleted "$STATE_DIR/changes.json"
grep -q fil_frame "$STATE_DIR/changes.json"

echo "filesystem acceptance cases passed"
