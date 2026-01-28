# Import viz dependencies from cache mount
FROM dust-viz-deps:latest AS viz-deps-cache

FROM node:20.19.2 AS viz

RUN apt-get update && apt-get install -y vim redis-tools postgresql-client htop

WORKDIR /app
COPY package.json package-lock.json ./
COPY viz/package.json ./viz/

# Use the viz-deps image as a cache mount to get node_modules
# This way, changes to other packages won't invalidate this layer
RUN --mount=type=bind,from=viz-deps-cache,source=/app/node_modules,target=/app/node_modules \
  --mount=type=bind,from=viz-deps-cache,source=/app/viz/node_modules,target=/app/viz/node_modules \
  cp -r /app/node_modules . && \
  cp -r /app/viz/node_modules ./viz/

WORKDIR /app/viz
COPY /viz .

ARG COMMIT_HASH
ENV NEXT_PUBLIC_COMMIT_HASH=${COMMIT_HASH}

RUN find . -name "*.test.ts" -delete
RUN find . -name "*.test.tsx" -delete

RUN npm run build

CMD ["npm", "--silent", "run", "start"]
