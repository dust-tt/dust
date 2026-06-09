# Marketing image — Next.js standalone build out of the `marketing/` workspace.
FROM node:24.14.0-slim AS base-deps

RUN apt-get update && \
  apt-get install -y libjemalloc2 libjemalloc-dev

RUN npm install -g npm@11.11.0

WORKDIR /app

# Workspace dep graph: marketing depends only on @dust-tt/sparkle.
COPY package.json package-lock.json ./
COPY sparkle/package.json ./sparkle/
COPY marketing/package.json ./marketing/

RUN --mount=type=cache,id=npm-cache,target=/root/.npm npm ci -w sparkle -w marketing

# Build Sparkle (its package entries point at dist/, so it must be built before
# marketing's next build can resolve @dust-tt/sparkle).
WORKDIR /app/sparkle
COPY /sparkle/ .
RUN npm run build

# Copy marketing source
WORKDIR /app/marketing
COPY /marketing .

# Remove test files (shared optimization)
RUN find . -name "*.test.ts" -delete
RUN find . -name "*.test.tsx" -delete

WORKDIR /app/marketing

# Next.js build stage
FROM base-deps AS marketing-build

ARG COMMIT_HASH
ARG NEXT_PUBLIC_BUILD_DATE
ARG NEXT_PUBLIC_DUST_API_URL
ARG NEXT_PUBLIC_DUST_APP_URL
ARG NEXT_PUBLIC_ENABLE_BOT_CRAWLING
ARG NEXT_PUBLIC_GTM_TRACKING_ID
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_DATADOG_CLIENT_TOKEN
ARG NEXT_PUBLIC_DATADOG_SERVICE
ARG CONTENTFUL_SPACE_ID
ARG CONTENTFUL_ACCESS_TOKEN

ENV NEXT_PUBLIC_COMMIT_HASH=$COMMIT_HASH
ENV NEXT_PUBLIC_BUILD_DATE=$NEXT_PUBLIC_BUILD_DATE
ENV NEXT_PUBLIC_DUST_API_URL=$NEXT_PUBLIC_DUST_API_URL
ENV NEXT_PUBLIC_DUST_APP_URL=$NEXT_PUBLIC_DUST_APP_URL
ENV NEXT_PUBLIC_ENABLE_BOT_CRAWLING=$NEXT_PUBLIC_ENABLE_BOT_CRAWLING
ENV NEXT_PUBLIC_GTM_TRACKING_ID=$NEXT_PUBLIC_GTM_TRACKING_ID
ENV NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY
ENV NEXT_PUBLIC_DATADOG_CLIENT_TOKEN=$NEXT_PUBLIC_DATADOG_CLIENT_TOKEN
ENV NEXT_PUBLIC_DATADOG_SERVICE=$NEXT_PUBLIC_DATADOG_SERVICE
ENV CONTENTFUL_SPACE_ID=$CONTENTFUL_SPACE_ID
ENV CONTENTFUL_ACCESS_TOKEN=$CONTENTFUL_ACCESS_TOKEN

RUN --mount=type=cache,id=marketing-next-cache-v2,target=/app/marketing/.next/cache \
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
COPY --from=marketing-build /app/marketing/.next/standalone ./

WORKDIR /app/marketing

# Copy static assets and public (not included in standalone)
COPY --from=marketing-build /app/marketing/.next/static ./.next/static
COPY --from=marketing-build /app/marketing/public ./public

ENV LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2

CMD ["node", "server.js"]
