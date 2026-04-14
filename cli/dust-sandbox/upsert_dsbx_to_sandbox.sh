#!/usr/bin/env bash
#
# Build dsbx for Linux x86_64 and push it to an e2b sandbox.
#
# Usage:
#   ./upsert_dsbx_to_sandbox.sh              # interactive sandbox picker (requires fzf)
#   ./upsert_dsbx_to_sandbox.sh <sandbox-id> # push directly to a specific sandbox
#   ./upsert_dsbx_to_sandbox.sh --no-build <sandbox-id>  # skip build, just push
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="x86_64-unknown-linux-musl"
BINARY="$SCRIPT_DIR/target/$TARGET/release/dsbx"
REMOTE_PATH="/opt/bin/dsbx"

NO_BUILD=false

# Parse flags.
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build)
      NO_BUILD=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--no-build] [sandbox-id]"
      echo ""
      echo "Build dsbx and push it to a running e2b sandbox."
      echo ""
      echo "Options:"
      echo "  --no-build    Skip the build step (use existing binary)"
      echo "  -h, --help    Show this help"
      echo ""
      echo "If no sandbox-id is given, an interactive picker is shown (requires fzf)."
      exit 0
      ;;
    *)
      SANDBOX_ID="$1"
      shift
      ;;
  esac
done

# --- Build ---
if [[ "$NO_BUILD" == false ]]; then
  echo "==> Building dsbx for $TARGET..."
  if ! command -v cross &>/dev/null; then
    echo "Error: 'cross' is not installed."
    echo "Install it with: cargo install cross --git https://github.com/cross-rs/cross"
    echo "(Requires Docker running)"
    exit 1
  fi
  (cd "$SCRIPT_DIR" && cross build --release --target "$TARGET")
  echo "==> Build complete: $BINARY"
else
  echo "==> Skipping build (--no-build)"
fi

if [[ ! -f "$BINARY" ]]; then
  echo "Error: Binary not found at $BINARY"
  echo "Run without --no-build to build it first."
  exit 1
fi

# --- Select sandbox ---
if [[ -z "${SANDBOX_ID:-}" ]]; then
  if ! command -v fzf &>/dev/null; then
    echo "Error: fzf is required for interactive sandbox selection."
    echo "Install it with: brew install fzf"
    echo "Or pass a sandbox ID directly: $0 <sandbox-id>"
    exit 1
  fi

  echo "==> Fetching running sandboxes..."
  SANDBOXES_JSON=$(e2b sandbox list -f json 2>/dev/null)
  COUNT=$(echo "$SANDBOXES_JSON" | jq length)

  if [[ "$COUNT" -eq 0 ]]; then
    echo "No running sandboxes found."
    exit 1
  fi

  # Format for fzf: "sandboxId | name | startedAt | cpus | ram"
  SANDBOX_ID=$(echo "$SANDBOXES_JSON" | jq -r '.[] | "\(.sandboxId)\t\(.name)\tstarted: \(.startedAt)\tcpus: \(.cpuCount)\tram: \(.memoryMB)MB"' \
    | fzf --prompt="Select sandbox> " \
           --header="ID                     TEMPLATE            STARTED                   RESOURCES" \
           --delimiter=$'\t' \
           --with-nth=1.. \
    | cut -f1)

  if [[ -z "$SANDBOX_ID" ]]; then
    echo "No sandbox selected."
    exit 1
  fi
fi

echo "==> Pushing dsbx to sandbox $SANDBOX_ID at $REMOTE_PATH..."

BINARY_SIZE=$(wc -c < "$BINARY" | tr -d ' ')
echo "    Binary size: $(( BINARY_SIZE / 1024 / 1024 ))MB ($(( BINARY_SIZE / 1024 ))KB)"

e2b sandbox exec "$SANDBOX_ID" "mkdir -p $(dirname $REMOTE_PATH) && rm -f $REMOTE_PATH"
base64 -i "$BINARY" | e2b sandbox exec "$SANDBOX_ID" "base64 -d > $REMOTE_PATH && chmod +x $REMOTE_PATH"

echo "==> Verifying..."
e2b sandbox exec "$SANDBOX_ID" "$REMOTE_PATH --version" 2>&1 || true

echo "==> Done! dsbx deployed to sandbox $SANDBOX_ID"
