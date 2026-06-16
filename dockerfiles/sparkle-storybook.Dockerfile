FROM node:24.14.0 AS builder

RUN npm install -g npm@11.11.0

WORKDIR /app

# Install root workspace deps (covers sparkle devDeps: storybook, vite, etc.)
COPY package.json package-lock.json ./
COPY sparkle/package.json ./sparkle/
RUN --mount=type=cache,id=npm-cache,target=/root/.npm npm ci

# Copy sparkle source (includes .storybook/ and playground/)
COPY sparkle/ ./sparkle/
# staticDirs in .storybook/main.ts references this path
COPY front/public/static/ ./front/public/static/

# Build storybook static site → sparkle/storybook-static/
RUN npm -w sparkle run build-storybook

# Install playground deps (standalone package, not a root workspace)
WORKDIR /app/sparkle/playground
RUN --mount=type=cache,id=npm-cache,target=/root/.npm npm ci
# Build playground at /playground/ base path so assets resolve correctly under that prefix
RUN npm run build -- --base /playground/

FROM nginx:1.27-alpine

COPY --from=builder /app/sparkle/storybook-static/ /usr/share/nginx/html/storybook/
COPY --from=builder /app/sparkle/playground/dist/ /usr/share/nginx/html/playground/
COPY dockerfiles/sparkle/sparkle-storybook-nginx.conf /etc/nginx/conf.d/default.conf

ARG COMMIT_HASH
ARG COMMIT_HASH_LONG
ARG DD_GIT_REPOSITORY_URL=https://github.com/dust-tt/dust
ARG DD_GIT_COMMIT_SHA=${COMMIT_HASH_LONG}
ENV DD_GIT_REPOSITORY_URL=${DD_GIT_REPOSITORY_URL}
ENV DD_GIT_COMMIT_SHA=${DD_GIT_COMMIT_SHA}

EXPOSE 80
