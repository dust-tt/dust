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

# The short names are links to the roots that carry a Dust identifier. Linux
# needs one inode per name: a directory reporting the same inode under two names
# is moved from one to the other instead of appearing under both.
CONVERSATION_ROOT="$(readlink "$MOUNTPOINT/conversation")"
test -n "$CONVERSATION_ROOT"
test "$(stat -c %F "$MOUNTPOINT/conversation")" = "symbolic link"
test "$(stat -c %i "$MOUNTPOINT/conversation")" != "$(stat -c %i "$MOUNTPOINT/$CONVERSATION_ROOT")"

# Using both names in turn must leave both of them working.
for _ in 1 2 3; do
  test -d "$MOUNTPOINT/conversation"
  test -d "$MOUNTPOINT/$CONVERSATION_ROOT"
  test "$(cd "$MOUNTPOINT/conversation" && pwd -P)" = "$MOUNTPOINT/$CONVERSATION_ROOT"
done

# The links belong to the mount layout and are not sandbox files.
if rm "$MOUNTPOINT/conversation" >/dev/null 2>&1; then
  echo "the conversation link was removed" >&2
  exit 1
fi

# O_TRUNC applies to the staged copy. Repeated fsync calls on a handle that has
# nothing left to save must keep the file readable and unchanged. How many
# revisions Front stored is not checked here.
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

# Dirty descriptors remain usable after unlink or rename-over, but fsync must
# never publish their bytes back into a path that now names another inode.
export DUST_DIRTY_UNLINK_PATH="$CONVERSATION_DIR/dirty-unlink.txt"
export DUST_DIRTY_DESTINATION_PATH="$CONVERSATION_DIR/dirty-destination.txt"
export DUST_DIRTY_SOURCE_PATH="$CONVERSATION_DIR/dirty-source.txt"
printf committed >"$DUST_DIRTY_UNLINK_PATH"
printf old-destination >"$DUST_DIRTY_DESTINATION_PATH"
printf new-source >"$DUST_DIRTY_SOURCE_PATH"
"$JS_RUNTIME" -e '
  const fs = require("node:fs");

  const unlinked = fs.openSync(process.env.DUST_DIRTY_UNLINK_PATH, "r+");
  fs.writeSync(unlinked, Buffer.from("dirty"), 0, 5, 0);
  fs.unlinkSync(process.env.DUST_DIRTY_UNLINK_PATH);
  fs.fsyncSync(unlinked);
  fs.closeSync(unlinked);

  const replaced = fs.openSync(process.env.DUST_DIRTY_DESTINATION_PATH, "r+");
  fs.writeSync(replaced, Buffer.from("dirty"), 0, 5, 0);
  fs.renameSync(
    process.env.DUST_DIRTY_SOURCE_PATH,
    process.env.DUST_DIRTY_DESTINATION_PATH,
  );
  fs.fsyncSync(replaced);
  fs.closeSync(replaced);
'
test ! -e "$DUST_DIRTY_UNLINK_PATH"
test "$(cat "$DUST_DIRTY_DESTINATION_PATH")" = new-source

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
# Dust records when contents last changed and ignores a time chosen by the
# caller. These commands still have to succeed, because `tar -x`, `cp -p` and
# `touch` set a time on every file they write and would stop on the first one.
touch "$POD_DIR/project/nested/child.txt"
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

# Agents unpack archives here, and tar sets a time and a mode on every entry it
# writes. The whole round trip has to work, not only the file contents.
command -v tar >/dev/null
mkdir -p "$POD_DIR/packed" "$POD_DIR/unpacked"
printf archived >"$POD_DIR/packed/archived.txt"
cp -p "$POD_DIR/packed/archived.txt" "$POD_DIR/packed/copied.txt"
tar -cf "$POD_DIR/archive.tar" -C "$POD_DIR/packed" .
tar -xf "$POD_DIR/archive.tar" -C "$POD_DIR/unpacked"
test "$(cat "$POD_DIR/unpacked/archived.txt")" = archived
test "$(cat "$POD_DIR/unpacked/copied.txt")" = archived

# Dust saves one writer's version at a time, so a second writer is refused
# instead of one of the two versions being lost.
export DUST_SINGLE_WRITER_PATH="$CONVERSATION_DIR/single-writer.txt"
printf seed >"$DUST_SINGLE_WRITER_PATH"
"$JS_RUNTIME" -e '
  const fs = require("node:fs");
  const first = fs.openSync(process.env.DUST_SINGLE_WRITER_PATH, "r+");
  try {
    fs.openSync(process.env.DUST_SINGLE_WRITER_PATH, "r+");
    throw new Error("a second writer was accepted");
  } catch (error) {
    if (error.code !== "EBUSY") throw error;
  }
  // Reading the same file alongside the writer stays allowed.
  fs.closeSync(fs.openSync(process.env.DUST_SINGLE_WRITER_PATH, "r"));
  fs.closeSync(first);
  fs.closeSync(fs.openSync(process.env.DUST_SINGLE_WRITER_PATH, "r+"));
'

# Saving a file to Front can take a while, and the program that owns the file
# often keeps writing during that time. Those writes must wait for the upload
# and then succeed, rather than report "try again" to a program that will not.
export DUST_CONCURRENT_PATH="$CONVERSATION_DIR/write-during-save.txt"
export DUST_JS_RUNTIME="$JS_RUNTIME"
"$JS_RUNTIME" -e '
  const fs = require("node:fs");
  const { spawn, spawnSync } = require("node:child_process");

  const runtime = process.env.DUST_JS_RUNTIME;
  const chunk = Buffer.alloc(1024 * 1024, "a");
  const fd = fs.openSync(process.env.DUST_CONCURRENT_PATH, "w");
  for (let index = 0; index < 8; index++) {
    fs.writeSync(fd, chunk);
  }

  // The child has to receive this file as its own file descriptor 3, so that
  // its fsync saves the file this process keeps writing to. A runtime that
  // passes no extra descriptor cannot set up the case at all.
  const probe = spawnSync(runtime, ["-e", "require(\"node:fs\").fstatSync(3)"], {
    stdio: ["ignore", "ignore", "ignore", fd],
  });
  const saving =
    probe.status === 0
      ? spawn(runtime, ["-e", "require(\"node:fs\").fsyncSync(3)"], {
          stdio: ["ignore", "ignore", "inherit", fd],
        })
      : null;
  if (saving === null) {
    process.stderr.write(
      "[acceptance] skipped writing during a save: this runtime passes no extra file descriptor\n",
    );
  }

  // These writes run while the child is saving the first half of the file.
  for (let index = 0; index < 8; index++) {
    fs.writeSync(fd, chunk);
  }
  fs.closeSync(fd);
  if (saving !== null) {
    saving.on("exit", (code) => {
      if (code !== 0) {
        process.stderr.write(`saving the file failed with status ${code}\n`);
        process.exitCode = 1;
      }
    });
  }
'
test "$(stat -c %s "$DUST_CONCURRENT_PATH")" = "$((16 * 1024 * 1024))"

echo "Dust filesystem acceptance cases passed"
