# start installing poppler tools for pdf text extraction
FROM node:20.19.2 AS build

RUN apt-get update && apt-get install -y vim redis-tools postgresql-client htop

ARG COMMIT_HASH_LONG
ARG COMMIT_HASH

WORKDIR /tmp/
COPY /connectors/admin/docker_build/install_poppler_tools.sh ./
RUN chmod +x ./install_poppler_tools.sh
RUN ./install_poppler_tools.sh
# end installing poppler tools

FROM node:20.19.2 as connectors

ENV LD_LIBRARY_PATH=/usr/local/lib
COPY --from=build /tmp/poppler-23.07.0/build/utils/pdftotext /usr/bin/pdftotext
COPY --from=build /tmp/poppler-23.07.0/build/libpoppler.so.130 /usr/lib/libpoppler.so.130

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

# Build all components (server, worker, cli) with esbuild
RUN npm run build

EXPOSE 3002

ENV DD_GIT_REPOSITORY_URL=https://github.com/dust-tt/dust/
ENV DD_GIT_COMMIT_SHA=${COMMIT_HASH_LONG}
ENV DD_VERSION=${COMMIT_HASH}

# Set a default command, it will start the API service if no command is provided
CMD ["npm", "run", "start:web"]
