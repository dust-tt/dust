FROM node:22.22.0 as connectors

WORKDIR /app

# Copy all package.json files and lockfile
COPY package.json package-lock.json ./
COPY connectors/package.json ./connectors/
COPY sdks/js/package.json ./sdks/js/

RUN --mount=type=cache,id=npm-cache,target=/root/.npm npm ci -w sdks/js -w connectors

# Build SDK
WORKDIR /app/sdks/js
COPY /sdks/js/ .
RUN npm run build

# Build connectors
WORKDIR /app/connectors
COPY /connectors/ .

# Remove test files
RUN find . -name "*.test.ts" -delete
RUN find . -name "*.test.tsx" -delete

# Build temporal workers
RUN CONNECTORS_DATABASE_URI="postgres://fake:fake@localhost:5432/fake" npm run build:temporal-bundles
# Build all components (server, worker, cli) with esbuild
RUN npm run build

ARG DATADOG_API_KEY
ARG COMMIT_HASH

# Upload source maps to Datadog and then remove them from the image
RUN if [ -n "$DATADOG_API_KEY" ]; then \
  export DATADOG_SITE=datadoghq.eu DATADOG_API_KEY=$DATADOG_API_KEY; \
  npx --yes @datadog/datadog-ci sourcemaps upload ./dist \
  --minified-path-prefix=/app/connectors/dist/ \
  --repository-url=https://github.com/dust-tt/dust \
  --project-path=connectors \
  --release-version=$COMMIT_HASH \
  --service=connectors \
  --disable-git; \
  fi

EXPOSE 3002

ARG COMMIT_HASH_LONG
ENV DD_GIT_REPOSITORY_URL=https://github.com/dust-tt/dust/
ENV DD_GIT_COMMIT_SHA=${COMMIT_HASH_LONG}
ENV DD_VERSION=${COMMIT_HASH}

# Set a default command, it will start the API service if no command is provided
CMD ["npm", "run", "start:web"]
