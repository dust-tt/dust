#!/usr/bin/env bash
# Shared setup for the scripts in this directory. Each of them starts the
# stand-in Front, mounts the daemon, runs its checks and cleans up. Source this
# file and call harness_start.
#
# DAEMON, MOUNTPOINT, STAGING_DIR and TOKEN_FILE can be set to override the
# defaults below.

HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HARNESS_DIR/../../.." && pwd)"
DAEMON="${DAEMON:-$REPO_ROOT/cli/dust-sandbox/target/debug/dsbx}"
MOUNTPOINT="${MOUNTPOINT:-/files}"
STAGING_DIR="${STAGING_DIR:-/run/dust/staging}"
TOKEN_FILE="${TOKEN_FILE:-/run/dust/token}"
ACCEPTANCE_SCRIPT="$REPO_ROOT/cli/dust-sandbox/tests/filesystem_fuse_acceptance.sh"
DAEMON_LOG=/tmp/dust-filesystem-daemon.log

FRONT_PID=""
FRONT_PORT=""
FRONT_PORT_FILE=""
MOUNT_PID=""
HARNESS_FAILURES=0

harness_cleanup() {
  harness_unmount
  if [[ -n "$FRONT_PID" ]]; then
    kill "$FRONT_PID" 2>/dev/null
  fi
  if [[ -n "$FRONT_PORT_FILE" ]]; then
    rm -f "$FRONT_PORT_FILE"
  fi
  return 0
}

harness_require_daemon() {
  if [[ -x "$DAEMON" ]]; then
    return 0
  fi
  echo "no daemon at $DAEMON" >&2
  echo "build one with: cargo build --manifest-path cli/dust-sandbox/Cargo.toml --bin dsbx" >&2
  exit 1
}

harness_start_front() {
  FRONT_PORT_FILE="$(mktemp)"
  DUST_FRONT_PORT_FILE="$FRONT_PORT_FILE" python3 "$HARNESS_DIR/fake_front.py" &
  FRONT_PID=$!
  for _ in $(seq 1 50); do
    [[ -s "$FRONT_PORT_FILE" ]] && break
    sleep 0.1
  done
  FRONT_PORT="$(cat "$FRONT_PORT_FILE")"
  if [[ -z "$FRONT_PORT" ]]; then
    echo "the stand-in Front never reported a port" >&2
    exit 1
  fi
}

harness_write_token() {
  mkdir -p "$(dirname "$TOKEN_FILE")" "$MOUNTPOINT"
  chmod 0755 "$(dirname "$TOKEN_FILE")"
  printf 'stand-in-token' >"$TOKEN_FILE"
  chmod 0600 "$TOKEN_FILE"
}

# Starts one mount in the background. Returns non-zero if it never appears,
# which is what a daemon that fails at startup looks like.
harness_mount() {
  "$DAEMON" filesystem mount \
    --mountpoint "$MOUNTPOINT" \
    --staging-dir "$STAGING_DIR" \
    --api-url "http://127.0.0.1:$FRONT_PORT" \
    --workspace-id w_local \
    --token-file "$TOKEN_FILE" \
    >"$DAEMON_LOG" 2>&1 &
  MOUNT_PID=$!
  for _ in $(seq 1 100); do
    mountpoint -q "$MOUNTPOINT" && return 0
    sleep 0.1
  done
  return 1
}

harness_unmount() {
  umount -l "$MOUNTPOINT" 2>/dev/null || true
  if [[ -n "$MOUNT_PID" ]]; then
    kill "$MOUNT_PID" 2>/dev/null
    wait "$MOUNT_PID" 2>/dev/null
    MOUNT_PID=""
  fi
}

# The usual opening for a script here: a stand-in Front and one live mount.
harness_start() {
  harness_require_daemon
  trap harness_cleanup EXIT
  harness_start_front
  harness_write_token
  if ! harness_mount; then
    echo "the mount never appeared. The daemon said:" >&2
    head -20 "$DAEMON_LOG" >&2
    exit 1
  fi
}

# Records one result. Pass the exit status of the command just run.
harness_check() {
  if [[ "$2" == "0" ]]; then
    echo "  ok   $1"
  else
    echo "  FAIL $1"
    HARNESS_FAILURES=$((HARNESS_FAILURES + 1))
  fi
}

harness_report() {
  echo
  if [[ "$HARNESS_FAILURES" -eq 0 ]]; then
    echo "ALL CHECKS PASSED"
    return 0
  fi
  echo "$HARNESS_FAILURES CHECK(S) FAILED"
  return 1
}
