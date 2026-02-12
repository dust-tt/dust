# Base dependencies stage (shared by front-nextjs and workers)
FROM node:22.22.0 AS base-deps

RUN apt-get update && \
  apt-get install -y libjemalloc2 libjemalloc-dev

# Only non-Next.js build args needed for base deps
ARG COMMIT_HASH
ARG COMMIT_HASH_LONG

WORKDIR /app

# Copy all package.json files and lockfile
COPY package.json package-lock.json ./
COPY sdks/js/package.json ./sdks/js/
COPY sparkle/package.json ./sparkle/
COPY front/package.json ./front/
COPY front-spa/package.json ./front-spa/

RUN --mount=type=cache,id=npm-cache,target=/root/.npm npm ci -w sdks/js -w sparkle -w front -w front-spa

# Build SDK
WORKDIR /app/sdks/js
COPY /sdks/js/ .
RUN npm run build

# Build Sparkle
WORKDIR /app/sparkle
COPY /sparkle/ .
RUN npm run build

# Copy front source
WORKDIR /app/front-spa
COPY /front-spa .

# Copy front source
WORKDIR /app/front
COPY /front .

# Generate custom models TypeScript from JSON config (downloaded by CI)
RUN npx tsx scripts/fetch-custom-models.ts

# Remove test files (shared optimization)
RUN find . -name "*.test.ts" -delete
RUN find . -name "*.test.tsx" -delete

# Next.js-specific build stage
FROM base-deps AS front-nextjs-build

# Next.js build arguments (only needed for front-nextjs build)
ARG COMMIT_HASH
ARG COMMIT_HASH_LONG
ARG DATADOG_API_KEY
ARG NEXT_PUBLIC_VIZ_URL
ARG NEXT_PUBLIC_DUST_CLIENT_FACING_URL
ARG NEXT_PUBLIC_DUST_APP_URL
ARG NEXT_PUBLIC_GTM_TRACKING_ID
ARG NEXT_PUBLIC_ENABLE_BOT_CRAWLING
ARG NEXT_PUBLIC_DATADOG_CLIENT_TOKEN
ARG NEXT_PUBLIC_DATADOG_SERVICE
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_VIRTUOSO_LICENSE_KEY
ARG NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER
ARG NEXT_PUBLIC_NOVU_API_URL
ARG NEXT_PUBLIC_NOVU_WEBSOCKET_API_URL
ARG CONTENTFUL_SPACE_ID
ARG CONTENTFUL_ACCESS_TOKEN

# Set environment variables for Next.js build
ENV NEXT_PUBLIC_COMMIT_HASH=$COMMIT_HASH
ENV NEXT_PUBLIC_VIZ_URL=$NEXT_PUBLIC_VIZ_URL
ENV NEXT_PUBLIC_DUST_CLIENT_FACING_URL=$NEXT_PUBLIC_DUST_CLIENT_FACING_URL
ENV NEXT_PUBLIC_DUST_APP_URL=$NEXT_PUBLIC_DUST_APP_URL
ENV NEXT_PUBLIC_GTM_TRACKING_ID=$NEXT_PUBLIC_GTM_TRACKING_ID
ENV NEXT_PUBLIC_ENABLE_BOT_CRAWLING=$NEXT_PUBLIC_ENABLE_BOT_CRAWLING
ENV NEXT_PUBLIC_DATADOG_CLIENT_TOKEN=$NEXT_PUBLIC_DATADOG_CLIENT_TOKEN
ENV NEXT_PUBLIC_DATADOG_SERVICE=$NEXT_PUBLIC_DATADOG_SERVICE
ENV NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY
ENV NEXT_PUBLIC_VIRTUOSO_LICENSE_KEY=$NEXT_PUBLIC_VIRTUOSO_LICENSE_KEY
ENV NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER=$NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER
ENV NEXT_PUBLIC_NOVU_API_URL=$NEXT_PUBLIC_NOVU_API_URL
ENV NEXT_PUBLIC_NOVU_WEBSOCKET_API_URL=$NEXT_PUBLIC_NOVU_WEBSOCKET_API_URL
ENV CONTENTFUL_SPACE_ID=$CONTENTFUL_SPACE_ID
ENV CONTENTFUL_ACCESS_TOKEN=$CONTENTFUL_ACCESS_TOKEN

# Build Next.js application and sitemap (front-nextjs only)
# Fake PostgreSQL URI is needed because Sequelize validates the connection string
# during module initialization (imported by `next build`), but doesn't actually connect
# DATADOG_API_KEY is used to conditionally enable source map generation and upload to Datadog
RUN BUILD_WITH_SOURCE_MAPS=${DATADOG_API_KEY:+true} \
  FRONT_DATABASE_URI="postgres://fake:fake@localhost:5432/fake" \
  NODE_OPTIONS="--max-old-space-size=8192" \
  npm run build -- --no-lint && \
  if [ -n "$DATADOG_API_KEY" ] && [ -n "$NEXT_PUBLIC_DATADOG_SERVICE" ]; then \
  export DATADOG_SITE=datadoghq.eu DATADOG_API_KEY=$DATADOG_API_KEY; \
  npx --yes @datadog/datadog-ci sourcemaps upload ./.next/static \
  --minified-path-prefix=/_next/static/ \
  --repository-url=https://github.com/dust-tt/dust \
  --project-path=front \
  --release-version=$COMMIT_HASH \
  --service=$NEXT_PUBLIC_DATADOG_SERVICE-browser && \
  npx --yes @datadog/datadog-ci sourcemaps upload ./.next/server \
  --minified-path-prefix=/app/front/.next/server/ \
  --repository-url=https://github.com/dust-tt/dust \
  --project-path=front \
  --release-version=$COMMIT_HASH \
  --service=$NEXT_PUBLIC_DATADOG_SERVICE && \
  find .next -type f -name "*.map" -print -delete; \
  fi

RUN npm run sitemap

# Workers-specific build stage
FROM base-deps AS workers-build

# Build temporal workers and esbuild workers (workers only)
RUN FRONT_DATABASE_URI="postgres://fake:fake@localhost:5432/fake" npm run build:temporal-bundles
RUN npm run build:workers

# Frontend image (Next.js standalone) for front deployment
FROM node:22.22.0 AS front

RUN apt-get update && \
  apt-get install -y redis-tools postgresql-client libjemalloc2 && \
  rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy entire standalone output (self-contained with traced node_modules)
COPY --from=front-nextjs-build /app/front/.next/standalone ./

WORKDIR /app/front

# Copy static assets and public (not included in standalone)
COPY --from=front-nextjs-build /app/front/.next/static ./.next/static
COPY --from=front-nextjs-build /app/front/public ./public
# Copy admin directory (contains prestop.sh and other scripts)
COPY --from=base-deps /app/front/admin ./admin
# Copy scripts directory
COPY --from=base-deps /app/front/scripts ./scripts

# Re-declare build args needed at runtime
ARG NEXT_PUBLIC_DUST_CLIENT_FACING_URL
ARG NEXT_PUBLIC_DUST_APP_URL

# Set as environment variables for runtime
ENV NEXT_PUBLIC_DUST_CLIENT_FACING_URL=$NEXT_PUBLIC_DUST_CLIENT_FACING_URL
ENV NEXT_PUBLIC_DUST_APP_URL=$NEXT_PUBLIC_DUST_APP_URL

# Preload jemalloc for all processes:
ENV LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2

ARG COMMIT_HASH_LONG
ENV DD_GIT_REPOSITORY_URL=https://github.com/dust-tt/dust/
ENV DD_GIT_COMMIT_SHA=${COMMIT_HASH_LONG}

CMD ["node", "server.js"]

# Workers image (Full Node.js environment) for front-workers deployment
FROM node:22.22.0 AS workers

RUN apt-get update && \
  apt-get install -y redis-tools postgresql-client libjemalloc2 && \
  rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root node_modules from base-deps (includes all hoisted dependencies)
COPY --from=base-deps /app/node_modules ./node_modules
COPY --from=base-deps /app/package.json ./package.json

WORKDIR /app/front

# Copy worker assets from workers-specific build
COPY --from=workers-build /app/front/dist ./dist
# Copy front's package.json and local node_modules (non-hoisted deps)
COPY --from=base-deps /app/front/package.json ./package.json
COPY --from=base-deps /app/front/node_modules ./node_modules
# Copy scripts directory
COPY --from=base-deps /app/front/scripts ./scripts
# Copy built SDK
COPY --from=base-deps /app/sdks/js/dist /app/sdks/js/dist
COPY --from=base-deps /app/sdks/js/package.json /app/sdks/js/package.json
# Copy built Sparkle
COPY --from=base-deps /app/sparkle/dist /app/sparkle/dist
COPY --from=base-deps /app/sparkle/package.json /app/sparkle/package.json

# Re-declare build arg needed at runtime
ARG NEXT_PUBLIC_VIZ_URL
ARG NEXT_PUBLIC_DUST_CLIENT_FACING_URL
ARG NEXT_PUBLIC_DUST_APP_URL
ARG NEXT_PUBLIC_GTM_TRACKING_ID
ARG NEXT_PUBLIC_ENABLE_BOT_CRAWLING
ARG NEXT_PUBLIC_DATADOG_CLIENT_TOKEN
ARG NEXT_PUBLIC_DATADOG_SERVICE
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_VIRTUOSO_LICENSE_KEY
ARG NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER
ARG NEXT_PUBLIC_NOVU_API_URL
ARG NEXT_PUBLIC_NOVU_WEBSOCKET_API_URL

# Set as environment variable for runtime
ENV NEXT_PUBLIC_COMMIT_HASH=$COMMIT_HASH
ENV NEXT_PUBLIC_VIZ_URL=$NEXT_PUBLIC_VIZ_URL
ENV NEXT_PUBLIC_DUST_CLIENT_FACING_URL=$NEXT_PUBLIC_DUST_CLIENT_FACING_URL
ENV NEXT_PUBLIC_DUST_APP_URL=$NEXT_PUBLIC_DUST_APP_URL
ENV NEXT_PUBLIC_GTM_TRACKING_ID=$NEXT_PUBLIC_GTM_TRACKING_ID
ENV NEXT_PUBLIC_ENABLE_BOT_CRAWLING=$NEXT_PUBLIC_ENABLE_BOT_CRAWLING
ENV NEXT_PUBLIC_DATADOG_CLIENT_TOKEN=$NEXT_PUBLIC_DATADOG_CLIENT_TOKEN
ENV NEXT_PUBLIC_DATADOG_SERVICE=$NEXT_PUBLIC_DATADOG_SERVICE
ENV NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY
ENV NEXT_PUBLIC_VIRTUOSO_LICENSE_KEY=$NEXT_PUBLIC_VIRTUOSO_LICENSE_KEY
ENV NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER=$NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER
ENV NEXT_PUBLIC_NOVU_API_URL=$NEXT_PUBLIC_NOVU_API_URL
ENV NEXT_PUBLIC_NOVU_WEBSOCKET_API_URL=$NEXT_PUBLIC_NOVU_WEBSOCKET_API_URL

# Preload jemalloc for all processes:
ENV LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2

ARG COMMIT_HASH_LONG
ENV DD_GIT_REPOSITORY_URL=https://github.com/dust-tt/dust/
ENV DD_GIT_COMMIT_SHA=${COMMIT_HASH_LONG}

CMD ["node", "dist/start_worker.js"]
