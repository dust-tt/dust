#!/usr/bin/env bash
# Shows whether the time a file reports settles when the file is saved.
#
# A file's size and time come from the local copy while it is being written, and
# Linux keeps that answer for a second. Saving the file gives it the time Front
# recorded. If nothing tells Linux to ask again, a program that reads the file
# just after writing it sees the time change underneath it, which is what makes
# tar and rsync report that a file changed while they read it.
set -uo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

harness_start
WORK="$MOUNTPOINT/conversation/time-probe"
mkdir -p "$WORK"

echo "== the time reported after each step of a write =="
python3 - "$WORK/steps.txt" <<'PY'
import os, sys, time

path = sys.argv[1]
first = None


def show(step):
    global first
    value = os.stat(path).st_mtime_ns
    if first is None:
        first = value
    print(f"  {step:<24} {value}  {(value - first) / 1e6:+.1f} ms")


fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644)
show("after create")
os.write(fd, b"hello")
show("after write")
# Looking at the file before closing it is what cp and tar do.
show("before close")
os.close(fd)
show("after close")
time.sleep(2)
show("two seconds later")
PY

echo
echo "== does the time stay put for each way of writing a file =="
probe() {
  local label="$1"
  local path="$2"
  local first last
  first="$(stat -c %.9Y "$path")"
  sleep 2
  last="$(stat -c %.9Y "$path")"
  if [[ "$first" == "$last" ]]; then
    echo "  stable   $label"
    return 0
  fi
  echo "  MOVED    $label ($first then $last)"
  return 1
}

printf hello >"$WORK/redirect.txt"
probe "a shell redirect" "$WORK/redirect.txt"
harness_check "a shell redirect settles" $?

printf hello >"$WORK/source.txt"
sleep 2
cp -p "$WORK/source.txt" "$WORK/preserved.txt"
probe "copying with preserved attributes" "$WORK/preserved.txt"
harness_check "copying with preserved attributes settles" $?

cp "$WORK/source.txt" "$WORK/plain.txt"
probe "a plain copy" "$WORK/plain.txt"
harness_check "a plain copy settles" $?

echo
echo "== can tar read a directory of files that were just written =="
tar -cf /tmp/harness-time-probe.tar -C "$WORK" . 2>&1 | sed 's/^/  /'
harness_check "tar reads them without reporting a change" "${PIPESTATUS[0]}"

harness_report
