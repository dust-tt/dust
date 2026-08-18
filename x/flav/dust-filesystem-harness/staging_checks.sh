#!/usr/bin/env bash
# Mounts the daemon several times over to check what startup does with the local
# staging directory: a fresh one, one it already claimed, one left mid-claim by a
# crash, and one that belongs to something else and must be left alone.
#
# The mid-claim case fails until the staging recovery change lands, because
# startup refuses a directory holding the file a half-written marker leaves. That
# failure is the bug, not a broken check.
set -uo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

MARKER=".dust-filesystem-cache-v1"
MARKER_TEMPORARY=".dust-filesystem-cache-v1.tmp"
MARKER_CONTENT="Dust filesystem staging directory"

harness_require_daemon
trap harness_cleanup EXIT
harness_start_front
harness_write_token

fresh_staging_directory() {
  rm -rf "$STAGING_DIR"
  mkdir -p "$STAGING_DIR"
  chmod 0700 "$STAGING_DIR"
}

echo "== a staging directory that does not exist yet =="
rm -rf "$STAGING_DIR"
harness_mount
harness_check "the mount comes up" $?
printf hello >"$MOUNTPOINT/conversation/staged.txt"
harness_check "a file can be written" $?
[[ -f "$STAGING_DIR/$MARKER" ]]
harness_check "the marker was written" $?
harness_unmount

echo "== a staging directory it already claimed =="
printf stale >"$STAGING_DIR/inode-999"
harness_mount
harness_check "the mount comes up again" $?
[[ ! -e "$STAGING_DIR/inode-999" ]]
harness_check "content left by the previous run was removed" $?
harness_unmount

echo "== a crash while the marker was being written =="
# Startup writes the marker under a second name and renames it into place. This
# is the file left behind if the daemon dies in between.
fresh_staging_directory
printf '%s\n' "$MARKER_CONTENT" >"$STAGING_DIR/$MARKER_TEMPORARY"
harness_mount
harness_check "the mount recovers rather than failing for good" $?
[[ -f "$STAGING_DIR/$MARKER" ]]
harness_check "the marker is now in place" $?
[[ ! -e "$STAGING_DIR/$MARKER_TEMPORARY" ]]
harness_check "the half-written file was removed" $?
harness_unmount

echo "== a directory that belongs to something else =="
fresh_staging_directory
printf secret >"$STAGING_DIR/important-key"
if harness_mount; then
  harness_check "an unmarked directory holding a foreign file is refused" 1
  harness_unmount
else
  harness_check "an unmarked directory holding a foreign file is refused" 0
  MOUNT_PID=""
fi
[[ "$(cat "$STAGING_DIR/important-key")" == secret ]]
harness_check "the foreign file was left alone" $?

harness_report
