#!/usr/bin/env bash
#
# Build the @dust/sandbox runtime package and push it to an e2b sandbox.
#
# @dust/sandbox is vendored into the sandbox image at build time (see
# front/lib/api/sandbox/image/sandbox_package.ts), and published function bundles keep it as an
# external import, so neither republishing a function nor pushing a new dsbx picks up a change
# to it. This script is the dev loop for iterating on it without rebuilding the image.
#
# Usage:
#   ./upsert_pod_package_to_sandbox.sh              # interactive sandbox picker (requires fzf)
#   ./upsert_pod_package_to_sandbox.sh <sandbox-id> # push directly to a specific sandbox
#   ./upsert_pod_package_to_sandbox.sh --no-build <sandbox-id>  # skip build, just push
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE="$SCRIPT_DIR/pod/dist/index.js"
# Push through the legacy path so this works before and after dust-base 0.8.102;
# new images symlink it to the canonical @dust/sandbox package.
REMOTE_PATH="/opt/npm-global/lib/node_modules/@dust/pod/index.js"
# $HOME of the agent-proxied user, where warm servers keep their sockets (warm_dir in
# src/commands/function/warm.rs).
WARM_DIR="/home/agent-proxied/.dust-fn"

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
      echo "Build the @dust/sandbox package and push it to a running e2b sandbox."
      echo ""
      echo "Options:"
      echo "  --no-build    Skip the build step (use existing bundle)"
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
  if ! command -v bun &>/dev/null; then
    echo "Error: 'bun' is not installed (needed to build the @dust/sandbox bundle)."
    echo "Install it from https://bun.com/ (or: curl -fsSL https://bun.sh/install | bash)"
    exit 1
  fi
  # Same bun flags the image build uses (buildSandboxPackage), so what lands here is byte-identical
  # to what a rebuilt image would ship.
  echo "==> Building @dust/sandbox bundle..."
  (cd "$SCRIPT_DIR/pod" && bun install --frozen-lockfile && bun run build)
  echo "==> Build complete: $BUNDLE"
else
  echo "==> Skipping build (--no-build)"
fi

if [[ ! -f "$BUNDLE" ]]; then
  echo "Error: Bundle not found at $BUNDLE"
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

echo "==> Pushing @dust/sandbox to sandbox $SANDBOX_ID at $REMOTE_PATH..."

BUNDLE_SIZE=$(wc -c < "$BUNDLE" | tr -d ' ')
echo "    Bundle size: $(( BUNDLE_SIZE / 1024 ))KB"

# 644 root:root, matching what the image's root-owned copy leaves behind: the workload users must
# be able to import it and must not be able to rewrite it.
e2b sandbox exec "$SANDBOX_ID" -u root "mkdir -p '$(dirname "$REMOTE_PATH")'"
base64 -i "$BUNDLE" | e2b sandbox exec "$SANDBOX_ID" -u root \
  "base64 -d > '$REMOTE_PATH' && chown root:root '$REMOTE_PATH' && chmod 644 '$REMOTE_PATH'"

# A resident warm server imported the old module at startup, so replacing the file on disk does
# nothing for it (see the warm path in src/commands/function/warm.rs). Drop the servers and their
# sockets; the next invocation takes the cold path and re-imports.
echo "==> Restarting warm function servers..."
e2b sandbox exec "$SANDBOX_ID" -u root \
  "pkill -f '$WARM_DIR/' || true; rm -f '$WARM_DIR'/*.sock"

echo "==> Verifying..."
LOCAL_SHA=$(shasum -a 256 "$BUNDLE" | cut -d' ' -f1)
e2b sandbox exec "$SANDBOX_ID" -u root \
  "echo '$LOCAL_SHA  $REMOTE_PATH' | sha256sum -c -" 2>&1 || true

echo "==> Done! @dust/sandbox deployed to sandbox $SANDBOX_ID"
