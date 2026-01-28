################################################################################
# Viz Dependencies Image
#
# PURPOSE:
#   Pre-install all npm dependencies for the viz package. Viz is standalone
#   and doesn't depend on other internal packages like sdks/js or sparkle.
#
# ISOLATION:
#   This image is completely independent from front-deps and connectors-deps.
#   Changes to viz dependencies only trigger a rebuild of this image.
#
# HOW IT'S USED:
#   In viz.Dockerfile:
#     FROM dust-viz-deps:latest AS viz-deps-cache
#     RUN --mount=type=bind,from=viz-deps-cache,...
#         cp -r /app/node_modules .
#
# OUTPUT:
#   /app/node_modules
#   /app/viz/node_modules
################################################################################

FROM node:20.19.2 AS viz-deps

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./
COPY viz/package.json ./viz/

# Install dependencies with npm cache mount for faster rebuilds
RUN --mount=type=cache,target=/root/.npm \
  npm ci -w viz
