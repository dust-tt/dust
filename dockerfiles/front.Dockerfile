# Base dependencies stage (shared by workers and front-api)
FROM node:24.16.0-slim AS base-deps

RUN apt-get update && \
  apt-get install -y libjemalloc2 libjemalloc-dev

RUN npm install -g npm@11.11.0

WORKDIR /app

# Copy all package.json files and lockfile
COPY package.json package-lock.json ./
COPY sdks/js/package.json ./sdks/js/
COPY sparkle/package.json ./sparkle/
COPY front/package.json ./front/
COPY front-spa/package.json ./front-spa/
COPY front-api/package.json ./front-api/

RUN --mount=type=cache,id=npm-cache,target=/root/.npm npm ci -w sdks/js -w sparkle -w front -w front-spa -w front-api

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

# Copy shared migration tooling (scripts/migrate.ts imports ../../scripts/db/migration-runner)
COPY /scripts/db /app/scripts/db

# Compile migration script so all runtime images have dist/migrate.js without needing TypeScript sources
RUN npx esbuild scripts/migrate.ts --bundle --platform=node --target=node22 --alias:@app=. --packages=external --outfile=dist/migrate.js --sourcemap

# Copy front-api source (server.ts, app.ts, routes/, middleware/)
WORKDIR /app/front-api
COPY /front-api .

WORKDIR /app/front

# Workers-specific build stage
FROM base-deps AS workers-build

ARG COMMIT_HASH
ARG COMMIT_HASH_LONG
ARG DATADOG_API_KEY
ARG NEXT_PUBLIC_DATADOG_SERVICE

# Provide git metadata as env constants so `datadog-ci sourcemaps upload` does not
# try to spawn git (not installed in the slim base) for repo URL / commit lookups.
ARG DD_GIT_REPOSITORY_URL=https://github.com/dust-tt/dust
ARG DD_GIT_COMMIT_SHA=${COMMIT_HASH_LONG}
ENV DD_GIT_REPOSITORY_URL=${DD_GIT_REPOSITORY_URL}
ENV DD_GIT_COMMIT_SHA=${DD_GIT_COMMIT_SHA}

# Build temporal workers and esbuild workers (workers only)
RUN FRONT_DATABASE_URI="postgres://fake:fake@localhost:5432/fake" npm run build:temporal-bundles
RUN npm run build:workers

# Upload worker source maps to Datadog for Error Tracking (map files kept in image for --enable-source-maps)
RUN if [ -n "$DATADOG_API_KEY" ] && [ -n "$NEXT_PUBLIC_DATADOG_SERVICE" ]; then \
  DATADOG_SITE=datadoghq.eu \
  DATADOG_API_KEY=$DATADOG_API_KEY \
  npx --yes @datadog/datadog-ci sourcemaps upload ./dist \
  --minified-path-prefix=/app/front/dist/ \
  --project-path=front \
  --release-version=$COMMIT_HASH \
  --service=$NEXT_PUBLIC_DATADOG_SERVICE; \
  fi

# Workers image (Full Node.js environment) for front-workers deployment
FROM node:24.16.0-slim AS workers

RUN apt-get update && \
  apt-get install -y redis-tools postgresql-client libjemalloc2 curl && \
  rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root node_modules from base-deps (includes all hoisted dependencies)
COPY --from=base-deps /app/node_modules ./node_modules
COPY --from=base-deps /app/package.json ./package.json

WORKDIR /app/front

# Copy worker assets from workers-specific build
COPY --from=workers-build /app/front/dist ./dist
# Ensure migrate.js is present (workers-build may clean dist before building)
COPY --from=base-deps /app/front/dist/migrate.js ./dist/migrate.js
# Copy front's package.json and local node_modules (non-hoisted deps)
COPY --from=base-deps /app/front/package.json ./package.json
COPY --from=base-deps /app/front/node_modules ./node_modules
# Copy scripts directory
COPY --from=base-deps /app/front/scripts ./scripts
# Shared migration tooling lives at the repo root; front/package.json runs `node ../scripts/db/run-migrate.cjs`.
COPY --from=base-deps /app/scripts/db /app/scripts/db
# Copy built SDK
COPY --from=base-deps /app/sdks/js/dist /app/sdks/js/dist
COPY --from=base-deps /app/sdks/js/package.json /app/sdks/js/package.json
# Copy built Sparkle
COPY --from=base-deps /app/sparkle/dist /app/sparkle/dist
COPY --from=base-deps /app/sparkle/package.json /app/sparkle/package.json

# Re-declare build arg needed at runtime
ARG NEXT_PUBLIC_VIZ_URL
ARG NEXT_PUBLIC_DUST_API_URL
ARG NEXT_PUBLIC_DUST_STATIC_WEBSITE_URL
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
ENV NEXT_PUBLIC_DUST_API_URL=$NEXT_PUBLIC_DUST_API_URL
ENV NEXT_PUBLIC_DUST_STATIC_WEBSITE_URL=$NEXT_PUBLIC_DUST_STATIC_WEBSITE_URL
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

ARG COMMIT_HASH
ARG COMMIT_HASH_LONG
ARG DD_GIT_REPOSITORY_URL=https://github.com/dust-tt/dust
ARG DD_GIT_COMMIT_SHA=${COMMIT_HASH_LONG}
ENV DD_VERSION=${COMMIT_HASH}
ENV DD_GIT_REPOSITORY_URL=${DD_GIT_REPOSITORY_URL}
ENV DD_GIT_COMMIT_SHA=${DD_GIT_COMMIT_SHA}

CMD ["node", "--enable-source-maps", "--require", "dd-trace/init", "dist/start_worker.js"]

# Front-api build stage — produces the esbuild-bundled Hono server at
# /app/front-api/dist/server.js. Uploads source maps for that bundle to Datadog
# under <service>-api so prod stack traces symbolicate.
FROM base-deps AS front-api-build

ARG COMMIT_HASH
ARG COMMIT_HASH_LONG
ARG DATADOG_API_KEY
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

# Provide git metadata as env constants so `datadog-ci sourcemaps upload` does not
# try to spawn git (not installed in the slim base) for repo URL / commit lookups.
ARG DD_GIT_REPOSITORY_URL=https://github.com/dust-tt/dust
ARG DD_GIT_COMMIT_SHA=${COMMIT_HASH_LONG}
ENV DD_GIT_REPOSITORY_URL=${DD_GIT_REPOSITORY_URL}
ENV DD_GIT_COMMIT_SHA=${DD_GIT_COMMIT_SHA}

WORKDIR /app/front-api

# Build the Hono server bundle and upload its source maps to Datadog so prod stack
# traces from /app/front-api/dist/server.js symbolicate. Map files are kept in the
# runtime image and consumed via --enable-source-maps in the runtime CMD.
RUN npm run build && \
  if [ -n "$DATADOG_API_KEY" ] && [ -n "$NEXT_PUBLIC_DATADOG_SERVICE" ]; then \
  DATADOG_SITE=datadoghq.eu \
  DATADOG_API_KEY=$DATADOG_API_KEY \
  npx --yes @datadog/datadog-ci sourcemaps upload ./dist \
  --minified-path-prefix=/app/front-api/dist/ \
  --project-path=front-api \
  --release-version=$COMMIT_HASH \
  --service=$NEXT_PUBLIC_DATADOG_SERVICE-api; \
  fi

# Front-api runtime image — Hono server.
FROM node:24.16.0-slim AS front-api

RUN apt-get update && \
  apt-get install -y redis-tools postgresql-client libjemalloc2 curl && \
  rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Hoisted root node_modules + package manifests.
COPY --from=front-api-build /app/node_modules ./node_modules
COPY --from=front-api-build /app/package.json ./package.json
COPY --from=front-api-build /app/package-lock.json ./package-lock.json

COPY --from=front-api-build /app/front ./front
# Ensure migrate.js is present explicitly
COPY --from=base-deps /app/front/dist/migrate.js ./front/dist/migrate.js
# Shared migration tooling lives at the repo root; front-api/package.json runs `node ../scripts/db/run-migrate.cjs`.
COPY --from=base-deps /app/scripts/db /app/scripts/db

# front-api workspace (server.ts, app.ts, routes/, middleware/).
COPY --from=front-api-build /app/front-api ./front-api

# Sibling workspaces resolved via @app aliases or transitive imports.
COPY --from=base-deps /app/sdks/js ./sdks/js
COPY --from=base-deps /app/sparkle ./sparkle

WORKDIR /app/front-api

ARG NEXT_PUBLIC_DUST_API_URL
ARG NEXT_PUBLIC_DUST_STATIC_WEBSITE_URL
ARG NEXT_PUBLIC_DUST_APP_URL
ENV NEXT_PUBLIC_DUST_API_URL=$NEXT_PUBLIC_DUST_API_URL
ENV NEXT_PUBLIC_DUST_STATIC_WEBSITE_URL=$NEXT_PUBLIC_DUST_STATIC_WEBSITE_URL
ENV NEXT_PUBLIC_DUST_APP_URL=$NEXT_PUBLIC_DUST_APP_URL

# Server is esbuild-bundled, so `NEXT_PUBLIC_*` references are NOT inlined at
# build time — they remain runtime `process.env` lookups and must be provided
# as runtime env (same as the workers image).
ARG NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER
ARG NEXT_PUBLIC_NOVU_API_URL
ARG NEXT_PUBLIC_NOVU_WEBSOCKET_API_URL
ENV NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER=$NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER
ENV NEXT_PUBLIC_NOVU_API_URL=$NEXT_PUBLIC_NOVU_API_URL
ENV NEXT_PUBLIC_NOVU_WEBSOCKET_API_URL=$NEXT_PUBLIC_NOVU_WEBSOCKET_API_URL

# Front's transitive runtime deps (e.g. hot-shots) may live in
# /app/front/node_modules rather than the hoisted /app/node_modules, and node's
# walk-up from /app/front-api/dist/server.js never visits them. Add it to
# NODE_PATH so externalized requires from the esbuild bundle resolve at runtime.
ENV NODE_PATH=/app/front/node_modules

ENV LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2

ARG COMMIT_HASH
ARG COMMIT_HASH_LONG
ARG DD_GIT_REPOSITORY_URL=https://github.com/dust-tt/dust
ARG DD_GIT_COMMIT_SHA=${COMMIT_HASH_LONG}
ENV DD_VERSION=${COMMIT_HASH}
ENV DD_GIT_REPOSITORY_URL=${DD_GIT_REPOSITORY_URL}
ENV DD_GIT_COMMIT_SHA=${DD_GIT_COMMIT_SHA}

CMD ["node", "--enable-source-maps", "--require", "dd-trace/init", "dist/server.js"]
