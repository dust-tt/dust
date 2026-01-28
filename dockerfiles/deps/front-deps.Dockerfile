################################################################################
# Front Dependencies Image
#
# PURPOSE:
#   Pre-install all npm dependencies for the front package and its workspace
#   dependencies (sparkle, sdks/js). This image is used as a bind mount source
#   in the main front.Dockerfile to avoid re-running npm ci on every build.
#
# PROBLEM SOLVED:
#   Without this approach, any change to package-lock.json (even for other
#   packages like connectors) would invalidate the npm install layer for front,
#   causing unnecessary rebuilds.
#
# HOW IT'S USED:
#   In front.Dockerfile:
#     FROM dust-front-deps:latest AS front-deps-cache
#     RUN --mount=type=bind,from=front-deps-cache,source=/app/node_modules,...
#         cp -r /app/node_modules .
#
# CACHING:
#   - BuildKit cache mount (--mount=type=cache) speeds up npm downloads
#   - Docker layer cache reuses this layer if package-lock.json unchanged
#   - Content-based hash tagging (by build-deps.sh) enables cache hits across runs
#
# OUTPUT:
#   /app/node_modules (root monorepo node_modules)
#   /app/sdks/js/node_modules
#   /app/sparkle/node_modules
#   /app/front/node_modules
################################################################################

FROM node:20.19.2 AS front-deps

WORKDIR /app

# Copy dependency manifests
# These files determine what gets installed, so they're copied first to
# maximize Docker layer caching (if these don't change, npm ci layer is cached)
COPY package.json package-lock.json ./
COPY sdks/js/package.json ./sdks/js/
COPY sparkle/package.json ./sparkle/
COPY front/package.json ./front/

# Install dependencies for front and its workspace dependencies
#
# --mount=type=cache,target=/root/.npm:
#   Creates a persistent cache volume for npm downloads. When this image is
#   rebuilt (e.g., after package-lock.json changes), npm checks this cache
#   first before downloading from the registry, significantly speeding up builds.
#
# npm ci -w sdks/js -w sparkle -w front:
#   Installs dependencies for multiple workspaces in a single command.
#   This is more efficient than installing each workspace separately.
RUN --mount=type=cache,target=/root/.npm \
  npm ci -w sdks/js -w sparkle -w front

# At this point, the image contains:
# - /app/node_modules (hoisted dependencies for the entire monorepo)
# - /app/sdks/js/node_modules (sdks/js-specific dependencies)
# - /app/sparkle/node_modules (sparkle-specific dependencies)
# - /app/front/node_modules (front-specific dependencies)
#
# These node_modules directories will be mounted into the main front.Dockerfile
# to avoid re-running npm ci during service builds.
