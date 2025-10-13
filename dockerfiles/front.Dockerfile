FROM node:20.19.2 AS front

RUN apt-get update && \
  apt-get install -y vim redis-tools postgresql-client htop libjemalloc2 libjemalloc-dev

ARG COMMIT_HASH
ARG COMMIT_HASH_LONG
ARG DATADOG_API_KEY
ARG NEXT_PUBLIC_VIZ_URL
ARG NEXT_PUBLIC_DUST_CLIENT_FACING_URL
ARG NEXT_PUBLIC_GTM_TRACKING_ID
ARG NEXT_PUBLIC_ENABLE_BOT_CRAWLING
ARG NEXT_PUBLIC_DATADOG_CLIENT_TOKEN
ARG NEXT_PUBLIC_DATADOG_SERVICE
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_VIRTUOSO_LICENSE_KEY

ENV NEXT_PUBLIC_COMMIT_HASH=$COMMIT_HASH
ENV NEXT_PUBLIC_VIZ_URL=$NEXT_PUBLIC_VIZ_URL
ENV NEXT_PUBLIC_DUST_CLIENT_FACING_URL=$NEXT_PUBLIC_DUST_CLIENT_FACING_URL
ENV NEXT_PUBLIC_GTM_TRACKING_ID=$NEXT_PUBLIC_GTM_TRACKING_ID
ENV NEXT_PUBLIC_ENABLE_BOT_CRAWLING=$NEXT_PUBLIC_ENABLE_BOT_CRAWLING
ENV NEXT_PUBLIC_DATADOG_CLIENT_TOKEN=$NEXT_PUBLIC_DATADOG_CLIENT_TOKEN
ENV NEXT_PUBLIC_DATADOG_SERVICE=$NEXT_PUBLIC_DATADOG_SERVICE
ENV NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY
ENV NEXT_PUBLIC_VIRTUOSO_LICENSE_KEY=$NEXT_PUBLIC_VIRTUOSO_LICENSE_KEY

WORKDIR /sdks/js
COPY /sdks/js/package*.json ./
COPY /sdks/js/ .
RUN npm ci
RUN npm run build

WORKDIR /app

COPY /front/package*.json ./
RUN npm ci

COPY /front .

# Remove test files
RUN find . -name "*.test.ts" -delete
RUN find . -name "*.test.tsx" -delete

# fake database URIs are needed because Sequelize will throw if the `url` parameter
# is undefined, and `next build` imports the `models.ts` file while "Collecting page data"
# DATADOG_API_KEY is used to conditionally enable source map generation and upload to Datadog
RUN BUILD_WITH_SOURCE_MAPS=${DATADOG_API_KEY:+true} \
    FRONT_DATABASE_URI="sqlite:foo.sqlite" \
    npm run build -- --no-lint && \
    if [ -n "$DATADOG_API_KEY" ]; then \
        export DATADOG_SITE=datadoghq.eu DATADOG_API_KEY=$DATADOG_API_KEY; \
        npx --yes @datadog/datadog-ci sourcemaps upload ./.next/static \
        --minified-path-prefix=/_next/static/ \
        --repository-url=https://github.com/dust-tt/dust \
        --project-path=front \
        --release-version=$COMMIT_HASH \
        --service=$NEXT_PUBLIC_DATADOG_SERVICE-browser && \
        npx --yes @datadog/datadog-ci sourcemaps upload ./.next/server \
        --minified-path-prefix=/app/.next/server/ \
        --repository-url=https://github.com/dust-tt/dust \
        --project-path=front \
        --release-version=$COMMIT_HASH \
        --service=$NEXT_PUBLIC_DATADOG_SERVICE && \
        find .next -type f -name "*.map" -print -delete; \
    fi
RUN npm run sitemap

# Preload jemalloc for all processes:
ENV LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2

ENV DD_GIT_REPOSITORY_URL=https://github.com/dust-tt/dust/
ENV DD_GIT_COMMIT_SHA=${COMMIT_HASH_LONG}

CMD ["npm", "--silent", "run", "start"]
