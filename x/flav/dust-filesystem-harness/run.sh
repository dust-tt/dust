#!/usr/bin/env bash
# Runs one harness script inside a container, which is how to use this on a Mac.
# It builds the image if needed, builds the daemon for Linux, and mounts inside
# the container. On a Linux machine with /dev/fuse you can skip this and run the
# scripts directly as root.
#
#   x/flav/dust-filesystem-harness/run.sh mount_checks.sh
#   x/flav/dust-filesystem-harness/run.sh acceptance.sh
#   x/flav/dust-filesystem-harness/run.sh staging_checks.sh
#   x/flav/dust-filesystem-harness/run.sh time_probe.sh
#   x/flav/dust-filesystem-harness/run.sh space_probe.sh
#
# Pass RELEASE=1 to build and test an optimised daemon instead of a plain one.
set -euo pipefail

SCRIPT="${1:-mount_checks.sh}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../../.." && pwd)"
SANDBOX_DIR="$REPO_ROOT/cli/dust-sandbox"
IMAGE=dust-filesystem-harness
PLATFORM="linux/$(uname -m | sed 's/x86_64/amd64/; s/aarch64/arm64/')"
CARGO_VOLUME=dust-filesystem-harness-cargo
TARGET_VOLUME=dust-filesystem-harness-target
PROFILE_FLAG=""
PROFILE_DIR=debug
if [[ -n "${RELEASE:-}" ]]; then
  PROFILE_FLAG=--release
  PROFILE_DIR=release
fi

if [[ ! -f "$HERE/$SCRIPT" ]]; then
  echo "no such harness script: $SCRIPT" >&2
  exit 1
fi

# The daemon embeds this generated bundle, and the build stops without it.
if [[ ! -f "$SANDBOX_DIR/functions-runner/runner.js" ]]; then
  echo "the functions runner bundle is missing. Build it first with:" >&2
  echo "  (cd cli/dust-sandbox/functions-runner && bun install && bun run build)" >&2
  exit 1
fi

echo "[harness] building the image"
docker build --platform "$PLATFORM" -q -t "$IMAGE" "$HERE" >/dev/null

echo "[harness] building the daemon for Linux"
docker run --rm \
  -v "$SANDBOX_DIR:/work" \
  -v "$CARGO_VOLUME:/usr/local/cargo/registry" \
  -v "$TARGET_VOLUME:/work/target" \
  -w /work \
  rust:1.85 cargo build ${PROFILE_FLAG:+"$PROFILE_FLAG"} --bin dsbx

# The build output lives in a volume so it does not land in the working tree.
# The harness reads the daemon from there.
echo "[harness] running $SCRIPT"
docker run --rm \
  --platform "$PLATFORM" \
  --device /dev/fuse --cap-add SYS_ADMIN --security-opt apparmor:unconfined \
  -v "$REPO_ROOT:/repo" \
  -v "$TARGET_VOLUME:/target" \
  -e "DAEMON=/target/$PROFILE_DIR/dsbx" \
  -w /repo \
  "$IMAGE" bash "/repo/x/flav/dust-filesystem-harness/$SCRIPT"
