#!/usr/bin/env bash
# Run the Dust shared dev container locally (laptop) or attach to it.
#
# Binds the repo for live edits but overlays node_modules and core/target with
# named Docker volumes so container npm install / cargo builds stay on the
# Linux VM disk (persist across relaunch, not visible on the Mac checkout).
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
VOLUME_PREFIX="${DUST_DEV_VOLUME_PREFIX:-dust-dev}"

# Build for Docker's native architecture by default. Set DUST_DEV_PLATFORM
# (for example linux/amd64) to opt into a different platform explicitly.
if [ -n "${DUST_DEV_PLATFORM:-}" ]; then
  PLATFORM="$DUST_DEV_PLATFORM"
else
  docker_arch="$(docker info --format '{{.Architecture}}')"
  case "$docker_arch" in
    amd64|x86_64) PLATFORM="linux/amd64" ;;
    arm64|aarch64) PLATFORM="linux/arm64" ;;
    *)
      echo "Unsupported Docker architecture: ${docker_arch}" >&2
      exit 1
      ;;
  esac
fi
case "$PLATFORM" in
  linux/amd64|linux/arm64) ;;
  *)
    echo "Unsupported DUST_DEV_PLATFORM: ${PLATFORM}" >&2
    echo "Supported values: linux/amd64, linux/arm64" >&2
    exit 1
    ;;
esac

# Dependency trees, build outputs and dev-server caches, as `volume:target`
# pairs. These are rewritten constantly and only ever read from inside the
# container, so they stay on the Linux VM disk instead of the virtiofs repo
# bind (where per-file latency dominates). Keep in sync with
# .devcontainer/devcontainer.json.
DEV_VOLUMES=(
  "${VOLUME_PREFIX}-node-modules:/workspace/node_modules"
  "${VOLUME_PREFIX}-cargo-target:/workspace/core/target"
  # Only the caches under CARGO_HOME: /usr/local/cargo/bin holds the rustup
  # shims, so a volume there would shadow toolchain upgrades from the image.
  "${VOLUME_PREFIX}-cargo-registry:/usr/local/cargo/registry"
  "${VOLUME_PREFIX}-cargo-git:/usr/local/cargo/git"
  "${VOLUME_PREFIX}-front-spa-vite:/workspace/front-spa/.vite"
  "${VOLUME_PREFIX}-front-api-cache:/workspace/front-api/.cache"
  "${VOLUME_PREFIX}-front-api-dist:/workspace/front-api/dist"
  "${VOLUME_PREFIX}-sparkle-dist:/workspace/sparkle/dist"
  # Postgres/Redis/Elasticsearch/Temporal/Qdrant state, relocated under one root
  # by init-data-dirs.sh — otherwise it lives in the container layer and is lost
  # on every rebuild.
  "${VOLUME_PREFIX}-data:/var/lib/dust-dev"
  "${VOLUME_PREFIX}-gcloud-config:/root/.config/gcloud"
  "${VOLUME_PREFIX}-git-spice-config:/root/.config/git-spice"
)

# Host SSH agent via Docker Desktop / OrbStack virtual socket (not a real Mac
# path). Keep in sync with .devcontainer/devcontainer.json.
SSH_AUTH_SOCK_MOUNT_SRC="/run/host-services/ssh-auth.sock"
SSH_AUTH_SOCK_MOUNT_DST="/ssh-agent"

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
  ENV_ARGS=(-e DUST_IN_CONTAINER=1 -e "SSH_AUTH_SOCK=${SSH_AUTH_SOCK_MOUNT_DST}")
  for var in \
    OP_SERVICE_ACCOUNT_TOKEN \
    OP_ENVIRONMENT_ID \
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
    -e SHELL=/bin/zsh \
    -e LANG=C.UTF-8 \
    -e LC_ALL=C.UTF-8 \
    -e DUST_IN_CONTAINER=1 \
    -e "SSH_AUTH_SOCK=${SSH_AUTH_SOCK_MOUNT_DST}" \
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
    -e SHELL=/bin/zsh \
    -e LANG=C.UTF-8 \
    -e LC_ALL=C.UTF-8 \
    -e DUST_IN_CONTAINER=1 \
    -e "SSH_AUTH_SOCK=${SSH_AUTH_SOCK_MOUNT_DST}" \
    -p 3000:3000 \
    -p 3010:3010 \
    -p 3011:3011 \
    -p 3001:3001 \
    -p 3007:3007 \
    -p 6333:6333 \
    -p 7233:7233 \
    -p 8233:8233 \
    -v "$REPO_ROOT:/workspace" \
    -v "${SSH_AUTH_SOCK_MOUNT_SRC}:${SSH_AUTH_SOCK_MOUNT_DST}" \
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
  # Interactive zsh reads ~/.zshrc (not BASH_ENV). Login (-l) also reads .zprofile.
  exec_interactive zsh -il
fi

IMAGE_PLATFORM=""
if docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
  IMAGE_PLATFORM="$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$IMAGE_NAME")"
fi
if [ "$BUILD" = 1 ] || [ -z "$IMAGE_PLATFORM" ] || [ "$IMAGE_PLATFORM" != "$PLATFORM" ]; then
  if [ -n "$IMAGE_PLATFORM" ] && [ "$IMAGE_PLATFORM" != "$PLATFORM" ]; then
    echo "Rebuilding ${IMAGE_NAME}: existing image is ${IMAGE_PLATFORM}, requested ${PLATFORM}."
    BUILD=1
  else
    echo "Building ${IMAGE_NAME} for ${PLATFORM} from dev/Dockerfile..."
  fi
  docker build --platform "$PLATFORM" -f "$REPO_ROOT/dev/Dockerfile" -t "$IMAGE_NAME" "$REPO_ROOT"
fi

if [ "$BUILD" = 1 ] && docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  echo "Removing container ${CONTAINER_NAME} to use rebuilt image..."
  docker rm -f "$CONTAINER_NAME" >/dev/null
fi

if docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  container_image="$(docker container inspect --format '{{.Image}}' "$CONTAINER_NAME")"
  container_platform="$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$container_image")"
  if [ "$container_platform" != "$PLATFORM" ]; then
    echo "Removing ${CONTAINER_NAME}: existing container is ${container_platform}, requested ${PLATFORM}."
    docker rm -f "$CONTAINER_NAME" >/dev/null
  fi
fi

if [ "$RESET_VOLUMES" = 1 ] && docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  echo "Removing container ${CONTAINER_NAME} before resetting volumes..."
  docker rm -f "$CONTAINER_NAME" >/dev/null
fi

VOLUME_ARGS=()
VOLUME_NAMES=()
for spec in "${DEV_VOLUMES[@]}"; do
  VOLUME_NAMES+=("${spec%%:*}")
  VOLUME_ARGS+=(-v "$spec")
done

if [ "$RESET_VOLUMES" = 1 ]; then
  echo "Removing Docker volumes: ${VOLUME_NAMES[*]}..."
  docker volume rm "${VOLUME_NAMES[@]}" >/dev/null 2>&1 || true
fi
for name in "${VOLUME_NAMES[@]}"; do
  docker volume create "$name" >/dev/null
done
echo "Using Docker volumes: ${VOLUME_NAMES[*]}"

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
