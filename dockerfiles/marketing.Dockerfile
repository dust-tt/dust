# Marketing image — Next.js backend (no SPA, no workers, no front-api).
#
# Currently builds from the existing `front/` workspace so we can deploy the
# marketing component without waiting for the dedicated `marketing/` workspace
# to exist. When that workspace lands, swap the `COPY /front .` line(s) below
# to `COPY /marketing .` (and adjust WORKDIRs / artifact paths accordingly).
FROM node:24.14.0-slim AS base-deps

RUN apt-get update && \
  apt-get install -y libjemalloc2 libjemalloc-dev

RUN npm install -g npm@11.11.0

WORKDIR /app

# Copy all package.json files and lockfile (front has cross-workspace imports
# into sdks/js, sparkle, front-spa, front-api — keep the install graph identical
# to front.Dockerfile so the same source compiles).
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

# Copy front-spa source (imported by front)
WORKDIR /app/front-spa
COPY /front-spa .

# Copy front source — swap to /marketing once the workspace exists
WORKDIR /app/front
COPY /front .

# Remove test files (shared optimization)
RUN find . -name "*.test.ts" -delete
RUN find . -name "*.test.tsx" -delete

WORKDIR /app/front

# Next.js build stage
FROM base-deps AS marketing-build

ARG COMMIT_HASH
ARG COMMIT_HASH_LONG
ARG NEXT_PUBLIC_VIZ_URL
ARG NEXT_PUBLIC_DUST_API_URL
ARG NEXT_PUBLIC_DUST_STATIC_WEBSITE_URL
ARG NEXT_PUBLIC_DUST_APP_URL
ARG NEXT_PUBLIC_GTM_TRACKING_ID
ARG NEXT_PUBLIC_ENABLE_BOT_CRAWLING
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
ENV NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_VIRTUOSO_LICENSE_KEY=$NEXT_PUBLIC_VIRTUOSO_LICENSE_KEY
ENV NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER=$NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER
ENV NEXT_PUBLIC_NOVU_API_URL=$NEXT_PUBLIC_NOVU_API_URL
ENV NEXT_PUBLIC_NOVU_WEBSOCKET_API_URL=$NEXT_PUBLIC_NOVU_WEBSOCKET_API_URL
ENV CONTENTFUL_SPACE_ID=$CONTENTFUL_SPACE_ID
ENV CONTENTFUL_ACCESS_TOKEN=$CONTENTFUL_ACCESS_TOKEN

# Fake PostgreSQL URI is needed because Sequelize validates the connection string
# during module initialization (imported by `next build`), but doesn't actually
# connect.
RUN --mount=type=cache,id=marketing-next-cache,target=/app/front/.next/cache \
  FRONT_DATABASE_URI="postgres://fake:fake@localhost:5432/fake" \
  NODE_OPTIONS="--max-old-space-size=8192" \
  npm run build -- --no-lint && \
  if [ ! -d .next/standalone ]; then \
  echo "ERROR: next build did not emit .next/standalone (output:standalone). Likely a corrupt next-cache mount; bump the --mount id to reset it."; \
  exit 1; \
  fi

# Runtime image
FROM node:24.14.0-slim AS marketing

RUN apt-get update && \
  apt-get install -y libjemalloc2 curl && \
  rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy entire standalone output (self-contained with traced node_modules)
COPY --from=marketing-build /app/front/.next/standalone ./

WORKDIR /app/front

# Copy static assets and public (not included in standalone)
COPY --from=marketing-build /app/front/.next/static ./.next/static
COPY --from=marketing-build /app/front/public ./public

ARG NEXT_PUBLIC_DUST_API_URL
ARG NEXT_PUBLIC_DUST_STATIC_WEBSITE_URL
ARG NEXT_PUBLIC_DUST_APP_URL

ENV NEXT_PUBLIC_DUST_API_URL=$NEXT_PUBLIC_DUST_API_URL
ENV NEXT_PUBLIC_DUST_STATIC_WEBSITE_URL=$NEXT_PUBLIC_DUST_STATIC_WEBSITE_URL
ENV NEXT_PUBLIC_DUST_APP_URL=$NEXT_PUBLIC_DUST_APP_URL

ENV LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2

ARG COMMIT_HASH
ARG COMMIT_HASH_LONG
ENV DD_VERSION=${COMMIT_HASH}
ENV DD_GIT_REPOSITORY_URL=https://github.com/dust-tt/dust/
ENV DD_GIT_COMMIT_SHA=${COMMIT_HASH_LONG}

CMD ["node", "--require", "dd-trace/init", "server.js"]
