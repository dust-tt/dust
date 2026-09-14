#!/usr/bin/env bash
# Checks the behaviour that is easy to get wrong in a FUSE filesystem: the two
# short root paths, writing through them, times a caller asks for, one writer at
# a time, and identity across a move.
set -uo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

harness_start

echo "== the short root names are links with an inode of their own =="
ls -la "$MOUNTPOINT"
CONVERSATION_ROOT="$(readlink "$MOUNTPOINT/conversation")"
[[ -n "$CONVERSATION_ROOT" ]]
harness_check "the link points at a root name" $?
[[ "$(stat -c %F "$MOUNTPOINT/conversation")" == "symbolic link" ]]
harness_check "Linux sees a symbolic link" $?
[[ "$(stat -c %i "$MOUNTPOINT/conversation")" != "$(stat -c %i "$MOUNTPOINT/$CONVERSATION_ROOT")" ]]
harness_check "the link has an inode of its own" $?
[[ -d "$MOUNTPOINT/conversation" ]]
harness_check "the link leads to a directory" $?
[[ "$(readlink "$MOUNTPOINT/pod")" == pod-* ]]
harness_check "the pod link points at a root name" $?

echo "== using both names in turn leaves both working =="
# A directory that reports one inode under two names gets moved between them, so
# this is the check that the links are real rather than a second name.
both_names_keep_working() {
  for _ in 1 2 3 4 5; do
    [[ -d "$MOUNTPOINT/conversation" ]] || return 1
    [[ -d "$MOUNTPOINT/$CONVERSATION_ROOT" ]] || return 1
    [[ "$(cd "$MOUNTPOINT/conversation" && pwd -P)" == "$MOUNTPOINT/$CONVERSATION_ROOT" ]] || return 1
    [[ "$(cd "$MOUNTPOINT/$CONVERSATION_ROOT" && pwd -P)" == "$MOUNTPOINT/$CONVERSATION_ROOT" ]] || return 1
  done
  return 0
}
both_names_keep_working
harness_check "both paths keep resolving to the same directory" $?
! rm "$MOUNTPOINT/conversation" 2>/dev/null
harness_check "removing a link is refused" $?

echo "== writing and reading through the link =="
WORK="$MOUNTPOINT/conversation/mount-checks"
mkdir -p "$WORK"
harness_check "a directory can be created" $?
printf hello >"$WORK/file.txt"
harness_check "a file can be written" $?
[[ "$(cat "$MOUNTPOINT/$CONVERSATION_ROOT/mount-checks/file.txt")" == hello ]]
harness_check "the bytes come back through the real path" $?
[[ "$(stat -c %s "$WORK/file.txt")" == 5 ]]
harness_check "the size is reported" $?

echo "== times and owners a caller asks for =="
touch "$WORK/file.txt"
harness_check "touch succeeds" $?
cp -p "$WORK/file.txt" "$WORK/copied.txt"
harness_check "copying with preserved attributes succeeds" $?
mkdir -p "$WORK/unpacked"
tar -cf /tmp/harness-archive.tar -C "$WORK" file.txt
harness_check "an archive can be created from a file just written" $?
tar -xf /tmp/harness-archive.tar -C "$WORK/unpacked"
harness_check "an archive can be unpacked" $?
[[ "$(cat "$WORK/unpacked/file.txt")" == hello ]]
harness_check "the unpacked bytes match" $?

echo "== one writer at a time =="
python3 - "$WORK/single.txt" <<'PY'
import os, sys

path = sys.argv[1]
with open(path, "w") as handle:
    handle.write("seed")
first = os.open(path, os.O_RDWR)
try:
    os.open(path, os.O_RDWR)
except OSError as error:
    if error.errno != 16:
        sys.exit(f"expected a busy error, got {error}")
else:
    sys.exit("a second writer was accepted")
os.close(os.open(path, os.O_RDONLY))
os.close(first)
os.close(os.open(path, os.O_RDWR))
PY
harness_check "a second writer is refused while a reader is not" $?

echo "== a move keeps the file's identity =="
INODE_BEFORE="$(stat -c %i "$WORK/file.txt")"
mv "$WORK/file.txt" "$MOUNTPOINT/pod/moved.txt"
harness_check "a file moves across roots" $?
[[ "$(stat -c %i "$MOUNTPOINT/pod/moved.txt")" == "$INODE_BEFORE" ]]
harness_check "the inode survives the move" $?
[[ "$(cat "$MOUNTPOINT/pod/moved.txt")" == hello ]]
harness_check "the moved bytes are intact" $?

harness_report
