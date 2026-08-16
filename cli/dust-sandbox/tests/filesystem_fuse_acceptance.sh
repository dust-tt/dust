#!/usr/bin/env bash
# Run inside a Linux sandbox after the Dust filesystem is mounted at /files.
set -euo pipefail

MOUNTPOINT="${MOUNTPOINT:-/files}"
RUN_ID="dust-fs-acceptance-$$-$(date +%s)"
CONVERSATION_DIR="$MOUNTPOINT/conversation/$RUN_ID"
POD_DIR="$MOUNTPOINT/pod/$RUN_ID"

if ! mountpoint -q "$MOUNTPOINT"; then
  echo "$MOUNTPOINT is not a mountpoint" >&2
  exit 1
fi
if [[ ! -d "$MOUNTPOINT/conversation" || ! -d "$MOUNTPOINT/pod" ]]; then
  echo "the acceptance test needs both conversation and Pod roots" >&2
  exit 1
fi

cleanup() {
  rm -rf "$CONVERSATION_DIR" "$POD_DIR"
}
trap cleanup EXIT

mkdir -p "$CONVERSATION_DIR" "$POD_DIR"

# The daemon mounts as root, while agent code runs as one of these users. Both
# must be able to create and write files; Linux must still enforce +x.
for WORKLOAD_USER in agent agent-proxied; do
  id "$WORKLOAD_USER" >/dev/null
  WORKLOAD_PATH="$CONVERSATION_DIR/workload-$WORKLOAD_USER.sh"
  runuser -u "$WORKLOAD_USER" -- env WORKLOAD_PATH="$WORKLOAD_PATH" sh -eu -c '
    printf "#!/bin/sh\nprintf \"workload-ok\\n\"\n" >"$WORKLOAD_PATH"
    grep -q workload-ok "$WORKLOAD_PATH"
    chmod 0666 "$WORKLOAD_PATH"
    if "$WORKLOAD_PATH" >/dev/null 2>&1; then
      echo "a file without +x ran for the workload user" >&2
      exit 1
    fi
    chmod 0777 "$WORKLOAD_PATH"
    test "$("$WORKLOAD_PATH")" = workload-ok
  '
done

# Normal truncating writes keep the existing inode.
printf old >"$CONVERSATION_DIR/file.txt"
FILE_INODE="$(stat -c %i "$CONVERSATION_DIR/file.txt")"
printf updated >"$CONVERSATION_DIR/file.txt"
test "$(stat -c %i "$CONVERSATION_DIR/file.txt")" = "$FILE_INODE"
test "$(cat "$CONVERSATION_DIR/file.txt")" = updated

# O_TRUNC is applied to the staged handle. Repeated fsync calls must not create
# extra uploads or revisions once that handle is clean.
if [[ -x /opt/bin/bun ]]; then
  JS_RUNTIME=/opt/bin/bun
elif [[ -x /usr/bin/node ]]; then
  JS_RUNTIME=/usr/bin/node
else
  echo "the acceptance test needs Bun or Node" >&2
  exit 1
fi
export DUST_TRUNCATE_PATH="$CONVERSATION_DIR/js-truncate.txt"
printf seed >"$DUST_TRUNCATE_PATH"
"$JS_RUNTIME" -e '
  const fs = require("node:fs");
  const fd = fs.openSync(process.env.DUST_TRUNCATE_PATH, fs.constants.O_WRONLY | fs.constants.O_TRUNC);
  fs.writeSync(fd, Buffer.from("javascript"));
  fs.fsyncSync(fd);
  fs.fsyncSync(fd);
  fs.closeSync(fd);
'
test "$(cat "$DUST_TRUNCATE_PATH")" = javascript

# Flags whose remote durability or cache behavior is not implemented fail
# explicitly and must never mutate the staged copy as a side effect.
export DUST_FLAG_PATH="$CONVERSATION_DIR/open-flags.txt"
printf stable >"$DUST_FLAG_PATH"
"$JS_RUNTIME" -e '
  const fs = require("node:fs");
  const cases = [
    [fs.constants.O_RDONLY | fs.constants.O_TRUNC, ["EACCES"]],
    [fs.constants.O_WRONLY | fs.constants.O_SYNC, ["ENOTSUP", "EOPNOTSUPP"]],
  ];
  for (const [flags, expected] of cases) {
    try {
      fs.openSync(process.env.DUST_FLAG_PATH, flags);
      throw new Error(`open unexpectedly accepted flags ${flags}`);
    } catch (error) {
      if (!expected.includes(error.code)) throw error;
    }
  }
'
test "$(cat "$DUST_FLAG_PATH")" = stable

printf A >"$CONVERSATION_DIR/append.txt"
printf B >>"$CONVERSATION_DIR/append.txt"
test "$(cat "$CONVERSATION_DIR/append.txt")" = AB

# A truncate with no following write is still published when its final handle
# closes, even though an earlier flush from a duplicated shell fd is deferred.
printf non-empty >"$CONVERSATION_DIR/truncate-only.txt"
: >"$CONVERSATION_DIR/truncate-only.txt"
test ! -s "$CONVERSATION_DIR/truncate-only.txt"

# A conversation-to-Pod move changes only the name and parent, not identity.
mv "$CONVERSATION_DIR/file.txt" "$POD_DIR/file.txt"
test "$(stat -c %i "$POD_DIR/file.txt")" = "$FILE_INODE"

# An editor's temporary-file rename replaces the destination inode.
printf saved >"$POD_DIR/.file.txt.tmp"
TEMP_INODE="$(stat -c %i "$POD_DIR/.file.txt.tmp")"
mv -f "$POD_DIR/.file.txt.tmp" "$POD_DIR/file.txt"
test "$(stat -c %i "$POD_DIR/file.txt")" = "$TEMP_INODE"
test "$(cat "$POD_DIR/file.txt")" = saved

# Open handles continue to work after rename and unlink.
printf open-handle >"$CONVERSATION_DIR/open.txt"
exec 6<>"$CONVERSATION_DIR/open.txt"
mv "$CONVERSATION_DIR/open.txt" "$CONVERSATION_DIR/renamed.txt"
printf X >&6
exec 6>&-
test -f "$CONVERSATION_DIR/renamed.txt"

printf unlinked >"$CONVERSATION_DIR/unlinked.txt"
exec 6<>"$CONVERSATION_DIR/unlinked.txt"
rm "$CONVERSATION_DIR/unlinked.txt"
printf Y >&6
test ! -e "$CONVERSATION_DIR/unlinked.txt"
exec 6>&-
test ! -e "$CONVERSATION_DIR/unlinked.txt"

# Replacing an open destination keeps its old descriptor alive while the new
# source inode becomes visible at the destination path.
printf old-destination >"$CONVERSATION_DIR/destination.txt"
printf new-source >"$CONVERSATION_DIR/source.txt"
exec 6<"$CONVERSATION_DIR/destination.txt"
mv -f "$CONVERSATION_DIR/source.txt" "$CONVERSATION_DIR/destination.txt"
OLD_CONTENT=""
IFS= read -r -N 15 -u 6 OLD_CONTENT
exec 6<&-
test "$OLD_CONTENT" = old-destination
test "$(cat "$CONVERSATION_DIR/destination.txt")" = new-source

# A populated directory tree moves across roots without changing any inode.
mkdir -p "$CONVERSATION_DIR/project/nested"
printf child >"$CONVERSATION_DIR/project/nested/child.txt"
DIRECTORY_INODE="$(stat -c %i "$CONVERSATION_DIR/project")"
CHILD_INODE="$(stat -c %i "$CONVERSATION_DIR/project/nested/child.txt")"
mv "$CONVERSATION_DIR/project" "$POD_DIR/project"
test "$(stat -c %i "$POD_DIR/project")" = "$DIRECTORY_INODE"
test "$(stat -c %i "$POD_DIR/project/nested/child.txt")" = "$CHILD_INODE"
test "$(cat "$POD_DIR/project/nested/child.txt")" = child

# Dust stores executable bits for sandbox tools. Read/write bits stay at the
# normal file defaults because per-user Unix permissions are not an auth rule.
chmod +x "$POD_DIR/project/nested/child.txt"
test "$(stat -c %a "$POD_DIR/project/nested/child.txt")" = 777
chmod -x "$POD_DIR/project/nested/child.txt"
test "$(stat -c %a "$POD_DIR/project/nested/child.txt")" = 666
if touch "$POD_DIR/project/nested/child.txt" >/dev/null 2>&1; then
  echo "touch reported a timestamp change that Dust does not store" >&2
  exit 1
fi
if chmod 0600 "$POD_DIR/project/nested/child.txt" >/dev/null 2>&1; then
  echo "chmod changed non-executable permission bits" >&2
  exit 1
fi
test "$(stat -c %a "$POD_DIR/project/nested/child.txt")" = 666

# Linux must enforce the executable bit, not only display it through stat.
EXECUTABLE="$POD_DIR/project/nested/executable-bit.sh"
printf '#!/bin/sh\nprintf "dust-executable-ok\\n"\n' >"$EXECUTABLE"
chmod 0666 "$EXECUTABLE"
if "$EXECUTABLE" >/dev/null 2>&1; then
  echo "a file without an executable bit was executed" >&2
  exit 1
fi
chmod 0777 "$EXECUTABLE"
test "$("$EXECUTABLE")" = dust-executable-ok

truncate -s 2 "$POD_DIR/project/nested/child.txt"
test "$(stat -c %s "$POD_DIR/project/nested/child.txt")" = 2
test "$(stat -f -c %s "$MOUNTPOINT")" -gt 0

echo "Dust filesystem acceptance cases passed"
