# Dockerfile for the front-api deployment — the Hono server with Next.js fallback
# (strangler shim). The runtime entry is front-api/dist/server.js (bundled by esbuild
# from server.ts), which calls next({ dir: "../front" }) + nextApp.prepare() and
# therefore needs the full Next.js install + .next build (NOT the standalone subset).
#
# This Dockerfile intentionally does NOT upload source maps. The front.Dockerfile
# build uploads them once for the same source SHA, so we avoid duplication and
# never write .map files into the runtime image.

# Base dependencies stage — installs workspace deps and builds shared libs.
FROM node:24.14.0 AS base-deps

RUN apt-get update && \
  apt-get install -y libjemalloc2 libjemalloc-dev

ARG COMMIT_HASH
ARG COMMIT_HASH_LONG

RUN npm install -g npm@11.11.0

WORKDIR /app

# Copy package manifests for the workspaces this image needs at build or runtime.
# front-spa is intentionally excluded — the front-api runtime does not reference it.
COPY package.json package-lock.json ./
COPY sdks/js/package.json ./sdks/js/
COPY sparkle/package.json ./sparkle/
COPY front/package.json ./front/
COPY front-api/package.json ./front-api/

RUN --mount=type=cache,id=npm-cache,target=/root/.npm \
    npm ci -w sdks/js -w sparkle -w front -w front-api

# Build SDK
WORKDIR /app/sdks/js
COPY /sdks/js/ .
RUN npm run build

# Build Sparkle
WORKDIR /app/sparkle
COPY /sparkle/ .
RUN npm run build

# Copy front source
WORKDIR /app/front
COPY /front .

# Generate custom models TypeScript from JSON config (downloaded by CI)
RUN npx tsx scripts/fetch-custom-models.ts

# Remove test files
RUN find . -name "*.test.ts" -delete
RUN find . -name "*.test.tsx" -delete

# Copy front-api source (server.ts, app.ts, routes/, middleware/)
WORKDIR /app/front-api
COPY /front-api .

# Next.js build stage — produces /app/front/.next used at runtime by Next handler.
FROM base-deps AS front-build

ARG COMMIT_HASH
ARG COMMIT_HASH_LONG
ARG NEXT_PUBLIC_VIZ_URL
ARG NEXT_PUBLIC_DUST_API_URL
ARG NEXT_PUBLIC_DUST_STATIC_WEBSITE_URL
ARG NEXT_PUBLIC_DUST_APP_URL
ARG NEXT_PUBLIC_GTM_TRACKING_ID
ARG NEXT_PUBLIC_ENABLE_BOT_CRAWLING
ARG NEXT_PUBLIC_DATADOG_CLIENT_TOKEN
ARG NEXT_PUBLIC_DATADOG_SERVICE
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_VIRTUOSO_LICENSE_KEY
ARG NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER
ARG NEXT_PUBLIC_NOVU_API_URL
ARG NEXT_PUBLIC_NOVU_WEBSOCKET_API_URL
ARG NEXT_PUBLIC_BUILD_DATE
ARG CONTENTFUL_SPACE_ID
ARG CONTENTFUL_ACCESS_TOKEN

ENV NEXT_PUBLIC_COMMIT_HASH=$COMMIT_HASH
ENV NEXT_PUBLIC_BUILD_DATE=$NEXT_PUBLIC_BUILD_DATE
ENV NEXT_PUBLIC_VIZ_URL=$NEXT_PUBLIC_VIZ_URL
ENV NEXT_PUBLIC_DUST_API_URL=$NEXT_PUBLIC_DUST_API_URL
ENV NEXT_PUBLIC_DUST_STATIC_WEBSITE_URL=$NEXT_PUBLIC_DUST_STATIC_WEBSITE_URL
ENV NEXT_PUBLIC_DUST_APP_URL=$NEXT_PUBLIC_DUST_APP_URL
ENV NEXT_PUBLIC_GTM_TRACKING_ID=$NEXT_PUBLIC_GTM_TRACKING_ID
ENV NEXT_PUBLIC_ENABLE_BOT_CRAWLING=$NEXT_PUBLIC_ENABLE_BOT_CRAWLING
ENV NEXT_PUBLIC_DATADOG_CLIENT_TOKEN=$NEXT_PUBLIC_DATADOG_CLIENT_TOKEN
ENV NEXT_PUBLIC_DATADOG_SERVICE=$NEXT_PUBLIC_DATADOG_SERVICE
ENV NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_VIRTUOSO_LICENSE_KEY=$NEXT_PUBLIC_VIRTUOSO_LICENSE_KEY
ENV NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER=$NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER
ENV NEXT_PUBLIC_NOVU_API_URL=$NEXT_PUBLIC_NOVU_API_URL
ENV NEXT_PUBLIC_NOVU_WEBSOCKET_API_URL=$NEXT_PUBLIC_NOVU_WEBSOCKET_API_URL
ENV CONTENTFUL_SPACE_ID=$CONTENTFUL_SPACE_ID
ENV CONTENTFUL_ACCESS_TOKEN=$CONTENTFUL_ACCESS_TOKEN

# Build Next.js (no standalone output is required — server.ts loads Next.js as a library).
# Fake PostgreSQL URI is needed because Sequelize validates the connection string during
# module initialization (imported by `next build`), but doesn't actually connect.
WORKDIR /app/front

# front-api only serves /api/* traffic; remove marketing/landing pages so they
# aren't compiled into .next/ (smaller image, faster build).
RUN rm -rf pages/blog pages/customers pages/home pages/landing \
           pages/academy pages/integrations \
        && rm -f pages/index.tsx

RUN --mount=type=cache,id=next-cache,target=/app/front/.next/cache \
    FRONT_DATABASE_URI="postgres://fake:fake@localhost:5432/fake" \
    NODE_OPTIONS="--max-old-space-size=8192" \
    npm run build -- --no-lint && \
    npm run sitemap

# Bundle the front-api server (Hono + Next.js handler) with esbuild.
# Produces /app/front-api/dist/server.js, which becomes the runtime entry.
WORKDIR /app/front-api
RUN npm run build

# Final runtime image — assembled from front-build.
FROM node:24.14.0 AS front-api

RUN apt-get update && \
  apt-get install -y redis-tools postgresql-client libjemalloc2 && \
  rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Hoisted root node_modules + package manifests.
COPY --from=front-build /app/node_modules ./node_modules
COPY --from=front-build /app/package.json ./package.json
COPY --from=front-build /app/package-lock.json ./package-lock.json

# Full front workspace including source + .next build (needed at runtime by Next.js).
COPY --from=front-build /app/front ./front

# front-api workspace (server.ts, app.ts, routes/, middleware/).
COPY --from=front-build /app/front-api ./front-api

# Sibling workspaces resolved via @app aliases or transitive imports.
COPY --from=front-build /app/sdks/js ./sdks/js
COPY --from=front-build /app/sparkle ./sparkle

WORKDIR /app/front-api

# Re-declare build args needed at runtime (mirrors the front stage).
ARG NEXT_PUBLIC_DUST_API_URL
ARG NEXT_PUBLIC_DUST_STATIC_WEBSITE_URL
ARG NEXT_PUBLIC_DUST_APP_URL
ENV NEXT_PUBLIC_DUST_API_URL=$NEXT_PUBLIC_DUST_API_URL
ENV NEXT_PUBLIC_DUST_STATIC_WEBSITE_URL=$NEXT_PUBLIC_DUST_STATIC_WEBSITE_URL
ENV NEXT_PUBLIC_DUST_APP_URL=$NEXT_PUBLIC_DUST_APP_URL

# Front's transitive runtime deps (e.g. hot-shots) may live in
# /app/front/node_modules rather than the hoisted /app/node_modules, and node's
# walk-up from /app/front-api/dist/server.js never visits them. Add it to
# NODE_PATH so externalized requires from the esbuild bundle resolve at runtime.
ENV NODE_PATH=/app/front/node_modules

# Preload jemalloc for all processes:
ENV LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2

ARG COMMIT_HASH
ARG COMMIT_HASH_LONG
ENV DD_VERSION=${COMMIT_HASH}
ENV DD_GIT_REPOSITORY_URL=https://github.com/dust-tt/dust/
ENV DD_GIT_COMMIT_SHA=${COMMIT_HASH_LONG}

CMD ["node", "--require", "dd-trace/init", "dist/server.js"]
