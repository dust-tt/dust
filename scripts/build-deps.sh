#!/bin/bash
set -e

################################################################################
# Smart Dependency Builder
#
# PURPOSE:
#   Build dedicated dependency images for each JS package in the monorepo with
#   content-based caching to prevent unnecessary rebuilds when dependencies
#   haven't changed.
#
# PROBLEM SOLVED:
#   In a monorepo, all packages share the same package-lock.json. When one
#   package (e.g., connectors) updates its dependencies, Docker would normally
#   invalidate the cache for ALL packages (front, viz, etc.) even if their
#   dependencies didn't change.
#
# SOLUTION:
#   - Create separate dependency images for each package (front, connectors, viz)
#   - Tag each image with a content-based hash of its dependencies
#   - Only rebuild when the hash changes (dependencies actually changed)
#   - Service Dockerfiles mount these images to copy pre-installed node_modules
#
# CACHING STRATEGY (3 levels):
#   1. Hash-based image caching: If image with hash exists, skip build entirely (~2s)
#   2. Docker layer cache: Reuse layers from previous build when possible (~30s)
#   3. npm cache mount: Only download changed packages from npm registry (~1-2min)
#
# USAGE:
#   ./scripts/build-deps.sh
#
# OUTPUT:
#   - dust-front-deps:latest and dust-front-deps:<hash>
#   - dust-connectors-deps:latest and dust-connectors-deps:<hash>
#   - dust-viz-deps:latest and dust-viz-deps:<hash>
################################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

################################################################################
# compute_deps_hash - Calculate content-based hash for a workspace's dependencies
#
# ARGUMENTS:
#   $1: workspace name (e.g., "front", "connectors")
#   $@: list of packages that contribute to this workspace's dependencies
#
# RETURNS:
#   12-character hash based on package-lock.json + relevant package.json files
#
# HOW IT WORKS:
#   1. Concatenate package-lock.json (monorepo root) with all relevant package.json files
#   2. Compute MD5 hash of the combined content
#   3. Take first 12 characters as the image tag
#
# WHY THIS WORKS:
#   - If dependencies haven't changed, hash stays the same → image exists → skip build
#   - If any dependency changes, hash changes → new image needed → rebuild
################################################################################
compute_deps_hash() {
  local workspace=$1
  shift
  local packages=("$@")

  # Combine all relevant package.json files into a temporary file
  local temp_file=$(mktemp)
  cat package-lock.json > "$temp_file"
  for pkg in "${packages[@]}"; do
    if [ -f "$pkg/package.json" ]; then
      cat "$pkg/package.json" >> "$temp_file"
    fi
  done

  # Compute hash (platform-specific MD5 command)
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS uses 'md5 -q'
    local hash=$(md5 -q "$temp_file" | cut -c1-12)
  else
    # Linux uses 'md5sum'
    local hash=$(md5sum "$temp_file" | cut -d' ' -f1 | cut -c1-12)
  fi

  rm "$temp_file"
  echo "$hash"
}

################################################################################
# build_deps_if_needed - Build dependency image only if it doesn't exist
#
# ARGUMENTS:
#   $1: package name (e.g., "front")
#   $2: path to Dockerfile (e.g., "dockerfiles/deps/front-deps.Dockerfile")
#   $@: list of packages this depends on (e.g., "front" "sparkle" "sdks/js")
#
# BEHAVIOR:
#   1. Compute content hash for this package's dependencies
#   2. Check if image with this hash already exists
#      - YES → Tag it as :latest and skip build (instant!)
#      - NO  → Build new image, tag with hash and :latest
#   3. After building, clean up old hash-tagged images to save disk space
#
# OPTIMIZATION:
#   Uses --cache-from to reuse Docker layers from the previous :latest image.
#   This speeds up builds when package.json changes but package-lock.json doesn't.
#
# CLEANUP:
#   After a successful build, removes old hash-tagged images that have a different
#   Image ID than the one just built. This prevents disk bloat while preserving
#   the current hash-tagged image for caching between CI runs.
################################################################################
build_deps_if_needed() {
  local name=$1
  local dockerfile=$2
  shift 2
  local packages=("$@")

  # Generate content-based hash
  local hash=$(compute_deps_hash "$name" "${packages[@]}")
  local image_name="dust-${name}-deps:${hash}"
  local image_latest="dust-${name}-deps:latest"

  echo "📦 ${name}: hash ${hash}"

  # STEP 1: Check if image with this hash already exists
  # This is the fastest path - no Docker build needed at all
  if docker image inspect "${image_name}" > /dev/null 2>&1; then
    echo "   ✅ Already exists, skipping build"
    # Ensure :latest points to this hash-tagged image
    docker tag "${image_name}" "${image_latest}" 2>/dev/null || true
    return 0
  fi

  # STEP 2: Image doesn't exist, we need to build it
  echo "   🔨 Building..."
  export DOCKER_BUILDKIT=1

  # OPTIMIZATION: Use previous :latest image as cache source
  # This allows Docker to reuse layers when only package.json changed
  # but package-lock.json stayed the same (e.g., metadata updates)
  CACHE_FROM_ARG=""
  if docker image inspect "${image_latest}" > /dev/null 2>&1; then
    CACHE_FROM_ARG="--cache-from ${image_latest}"
    echo "      Using ${image_latest} as build cache"
  fi

  # Build the image with both hash and latest tags
  docker build \
    -f "$dockerfile" \
    -t "${image_name}" \
    -t "${image_latest}" \
    ${CACHE_FROM_ARG} \
    . > /dev/null 2>&1

  echo "   ✅ Built successfully"

  # STEP 3: Clean up old hash-tagged images to prevent disk bloat
  # We keep:
  #   - The image we just built (identified by Image ID)
  #   - The :latest tag (excluded by grep)
  # We remove:
  #   - Old hash-tagged images with different Image IDs
  #
  # WHY THIS IS SAFE:
  #   - The hash-tagged image is what enables caching between CI runs
  #   - We only remove hashes that are no longer current
  #   - The current hash is preserved for future cache hits
  CURRENT_IMAGE_ID=$(docker image inspect "${image_name}" --format '{{.Id}}' 2>/dev/null)

  echo "   🧹 Cleaning up old hash-tagged images..."
  docker images --filter "reference=dust-${name}-deps" --format "{{.Repository}}:{{.Tag}} {{.ID}}" | \
    grep -v ":latest " | \
    grep -v " ${CURRENT_IMAGE_ID#sha256:}" | \
    awk '{print $1}' | \
    xargs -r docker rmi 2>/dev/null || true
}

################################################################################
# MAIN EXECUTION
################################################################################

echo "🚀 Smart Dependency Builder"
echo "============================"
echo ""

# Build dependency image for front (includes sparkle and sdks/js)
# These packages form a dependency chain: front depends on sparkle and sdks/js
build_deps_if_needed "front" "dockerfiles/deps/front-deps.Dockerfile" \
  "front" "sparkle" "sdks/js"

# Build dependency image for connectors (includes sdks/js)
# Connectors depends on sdks/js
build_deps_if_needed "connectors" "dockerfiles/deps/connectors-deps.Dockerfile" \
  "connectors" "sdks/js"

# Build dependency image for viz (standalone)
# Viz has no internal dependencies
build_deps_if_needed "viz" "dockerfiles/deps/viz-deps.Dockerfile" \
  "viz"

echo ""
echo "============================"
echo "✅ All dependency images ready!"
echo ""
echo "Images are tagged with content hashes and will only rebuild when dependencies change."
