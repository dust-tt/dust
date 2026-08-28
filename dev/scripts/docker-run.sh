#!/usr/bin/env bash
# Run the Dust shared dev container locally (laptop) or attach to it.
#
# Binds the repo for live edits but overlays node_modules and core/target so
# container npm install / cargo builds do not touch your Mac copies.
#
# Default: gitignored host dirs under dev/docker-volumes/ (not in the image).
# Alternative: DUST_DEV_VOLUME_MODE=docker for opaque Docker named volumes.
#
# Usage (from repo root):
#   bash dev/scripts/docker-run.sh                 # start container + up.sh (infra + mprocs)
#   bash dev/scripts/docker-run.sh --shell         # interactive shell only
#   bash dev/scripts/docker-run.sh --terminal      # alias for --shell into running container
#   bash dev/scripts/docker-run.sh --infra-only    # start container + infra, no mprocs
#   bash dev/scripts/docker-run.sh --build         # rebuild image, then default up
#   bash dev/scripts/docker-run.sh --reset-volumes --build
#   bash dev/scripts/docker-run.sh bash dev/scripts/refresh-op-env.sh
#
# Pass host secrets through the environment before running, e.g.:
#   export OP_SERVICE_ACCOUNT_TOKEN=...
#   export DEV_WORKOS_USER_EMAIL=... DEV_WORKOS_USER_ID=... DEV_WORKOS_USER_PASSWORD=...
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

IMAGE_NAME="${DUST_DEV_IMAGE:-dust-dev}"
CONTAINER_NAME="${DUST_DEV_CONTAINER:-dust-dev}"
PLATFORM="${DUST_DEV_PLATFORM:-linux/amd64}"
VOLUME_MODE="${DUST_DEV_VOLUME_MODE:-host}"
VOLUME_PREFIX="${DUST_DEV_VOLUME_PREFIX:-dust-dev}"
HOST_VOLUME_ROOT="${DUST_DEV_HOST_VOLUME_ROOT:-$REPO_ROOT/dev/docker-volumes}"
NODE_MODULES_VOLUME="${VOLUME_PREFIX}-node-modules"
CARGO_TARGET_VOLUME="${VOLUME_PREFIX}-cargo-target"

BUILD=0
RESET_VOLUMES=0
SHELL_ONLY=0
INFRA_ONLY=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --build)
      BUILD=1
      shift
      ;;
    --reset-volumes)
      RESET_VOLUMES=1
      shift
      ;;
    --terminal|--shell)
      SHELL_ONLY=1
      shift
      ;;
    --infra-only)
      INFRA_ONLY=1
      shift
      ;;
    *)
      break
      ;;
  esac
done

collect_env_args() {
  ENV_ARGS=(-e DUST_IN_CONTAINER=1)
  for var in \
    OP_SERVICE_ACCOUNT_TOKEN \
    GCP_SERVICE_ACCOUNT \
    DEV_WORKOS_USER_EMAIL \
    DEV_WORKOS_USER_ID \
    DEV_WORKOS_USER_PASSWORD; do
    if [ -n "${!var:-}" ]; then
      ENV_ARGS+=(-e "$var")
    fi
  done
}

exec_interactive() {
  local -a cmd=("$@")
  exec docker exec -it \
    -e TERM="${TERM:-xterm-256color}" \
    -e COLORTERM="${COLORTERM:-truecolor}" \
    -e SHELL=/bin/bash \
    -e LANG=C.UTF-8 \
    -e LC_ALL=C.UTF-8 \
    -e DUST_IN_CONTAINER=1 \
    "${ENV_ARGS[@]}" \
    "$CONTAINER_NAME" \
    "${cmd[@]}"
}

ensure_container_running() {
  if docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
    if [ "$(docker container inspect -f '{{.State.Running}}' "$CONTAINER_NAME")" != "true" ]; then
      echo "Starting existing container ${CONTAINER_NAME}..."
      docker start "$CONTAINER_NAME" >/dev/null
    fi
    return 0
  fi

  echo "Starting dev container ${CONTAINER_NAME}..."
  docker run -d --init --platform "$PLATFORM" \
    --name "$CONTAINER_NAME" \
    -e TERM="${TERM:-xterm-256color}" \
    -e COLORTERM="${COLORTERM:-truecolor}" \
    -e SHELL=/bin/bash \
    -e LANG=C.UTF-8 \
    -e LC_ALL=C.UTF-8 \
    -e DUST_IN_CONTAINER=1 \
    -p 3000:3000 \
    -p 3011:3011 \
    -p 3001:3001 \
    -p 3007:3007 \
    -p 7233:7233 \
    -v "$REPO_ROOT:/workspace" \
    "${VOLUME_ARGS[@]}" \
    "${ENV_ARGS[@]}" \
    "$IMAGE_NAME" \
    sleep infinity >/dev/null
}

if [ "$SHELL_ONLY" = 1 ]; then
  if [ "$#" -gt 0 ]; then
    echo "--shell/--terminal opens an interactive shell; omit the command." >&2
    exit 1
  fi
  if ! docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
    echo "Container ${CONTAINER_NAME} is not running." >&2
    echo "Start it with: bash dev/scripts/docker-run.sh" >&2
    exit 1
  fi
  if [ "$(docker container inspect -f '{{.State.Running}}' "$CONTAINER_NAME")" != "true" ]; then
    echo "Container ${CONTAINER_NAME} exists but is not running." >&2
    echo "Start it with: bash dev/scripts/docker-run.sh" >&2
    exit 1
  fi
  collect_env_args
  exec_interactive bash -l
fi

if [ "$BUILD" = 1 ] || ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
  echo "Building ${IMAGE_NAME} from dev/Dockerfile..."
  docker build --platform "$PLATFORM" -f "$REPO_ROOT/dev/Dockerfile" -t "$IMAGE_NAME" "$REPO_ROOT"
fi

if [ "$BUILD" = 1 ] && docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  echo "Removing container ${CONTAINER_NAME} to use rebuilt image..."
  docker rm -f "$CONTAINER_NAME" >/dev/null
fi

if [ "$RESET_VOLUMES" = 1 ] && docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  echo "Removing container ${CONTAINER_NAME} before resetting volumes..."
  docker rm -f "$CONTAINER_NAME" >/dev/null
fi

VOLUME_ARGS=()
case "$VOLUME_MODE" in
  host)
    NODE_MODULES_MOUNT="$HOST_VOLUME_ROOT/node_modules"
    CARGO_TARGET_MOUNT="$HOST_VOLUME_ROOT/core-target"
    if [ "$RESET_VOLUMES" = 1 ]; then
      echo "Resetting host dev volumes under ${HOST_VOLUME_ROOT}..."
      rm -rf "$NODE_MODULES_MOUNT" "$CARGO_TARGET_MOUNT"
    fi
    mkdir -p "$NODE_MODULES_MOUNT" "$CARGO_TARGET_MOUNT"
    VOLUME_ARGS+=(
      -v "$NODE_MODULES_MOUNT:/workspace/node_modules"
      -v "$CARGO_TARGET_MOUNT:/workspace/core/target"
    )
    echo "Using host-isolated deps: ${NODE_MODULES_MOUNT}"
    ;;
  docker)
    if [ "$RESET_VOLUMES" = 1 ]; then
      echo "Removing Docker volumes ${NODE_MODULES_VOLUME} and ${CARGO_TARGET_VOLUME}..."
      docker volume rm "$NODE_MODULES_VOLUME" "$CARGO_TARGET_VOLUME" >/dev/null 2>&1 || true
    fi
    docker volume create "$NODE_MODULES_VOLUME" >/dev/null
    docker volume create "$CARGO_TARGET_VOLUME" >/dev/null
    VOLUME_ARGS+=(
      -v "$NODE_MODULES_VOLUME:/workspace/node_modules"
      -v "$CARGO_TARGET_VOLUME:/workspace/core/target"
    )
    echo "Using Docker volumes: ${NODE_MODULES_VOLUME}, ${CARGO_TARGET_VOLUME}"
    ;;
  *)
    echo "Unknown DUST_DEV_VOLUME_MODE=${VOLUME_MODE} (expected host or docker)" >&2
    exit 1
    ;;
esac

collect_env_args

if [ "$#" -eq 0 ]; then
  if [ "$INFRA_ONLY" = 1 ]; then
    set -- bash /workspace/dev/scripts/up.sh --install --infra-only
  else
    set -- bash /workspace/dev/scripts/up.sh --install
  fi
fi

ensure_container_running
exec_interactive "$@"
