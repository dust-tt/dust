################################################################################
# Connectors Dependencies Image
#
# PURPOSE:
#   Pre-install all npm dependencies for the connectors package and its
#   workspace dependency (sdks/js). Used as a bind mount source in
#   connectors.Dockerfile.
#
# ISOLATION:
#   This image is completely independent from front-deps and viz-deps.
#   Changes to connectors dependencies only trigger a rebuild of this image,
#   not front or viz dependency images.
#
# HOW IT'S USED:
#   In connectors.Dockerfile:
#     FROM dust-connectors-deps:latest AS connectors-deps-cache
#     RUN --mount=type=bind,from=connectors-deps-cache,...
#         cp -r /app/node_modules .
#
# OUTPUT:
#   /app/node_modules
#   /app/sdks/js/node_modules
#   /app/connectors/node_modules
################################################################################

FROM node:20.19.2 AS connectors-deps

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./
COPY connectors/package.json ./connectors/
COPY sdks/js/package.json ./sdks/js/

# Install dependencies with npm cache mount for faster rebuilds
RUN --mount=type=cache,target=/root/.npm \
  npm ci -w sdks/js -w connectors
