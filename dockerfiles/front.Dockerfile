FROM node:20.19.2 AS front

RUN apt-get update && \
  apt-get install -y vim redis-tools postgresql-client htop libjemalloc2 libjemalloc-dev

ARG COMMIT_HASH
ARG COMMIT_HASH_LONG
ARG NEXT_PUBLIC_VIZ_URL
ARG NEXT_PUBLIC_DUST_CLIENT_FACING_URL
ARG NEXT_PUBLIC_GTM_TRACKING_ID
ARG NEXT_PUBLIC_ENABLE_BOT_CRAWLING
ARG NEXT_PUBLIC_DATADOG_CLIENT_TOKEN
ARG NEXT_PUBLIC_DATADOG_SERVICE

ENV NEXT_PUBLIC_COMMIT_HASH=$COMMIT_HASH
ENV NEXT_PUBLIC_VIZ_URL=$NEXT_PUBLIC_VIZ_URL
ENV NEXT_PUBLIC_DUST_CLIENT_FACING_URL=$NEXT_PUBLIC_DUST_CLIENT_FACING_URL
ENV NEXT_PUBLIC_GTM_TRACKING_ID=$NEXT_PUBLIC_GTM_TRACKING_ID
ENV NEXT_PUBLIC_ENABLE_BOT_CRAWLING=$NEXT_PUBLIC_ENABLE_BOT_CRAWLING
ENV NEXT_PUBLIC_DATADOG_CLIENT_TOKEN=$NEXT_PUBLIC_DATADOG_CLIENT_TOKEN
ENV NEXT_PUBLIC_DATADOG_SERVICE=$NEXT_PUBLIC_DATADOG_SERVICE

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
RUN FRONT_DATABASE_URI="sqlite:foo.sqlite" npm run build

# Preload jemalloc for all processes:
ENV LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2

ENV DD_GIT_REPOSITORY_URL=https://github.com/dust-tt/dust/
ENV DD_GIT_COMMIT_SHA=${COMMIT_HASH_LONG}

CMD ["npm", "--silent", "run", "start"]
