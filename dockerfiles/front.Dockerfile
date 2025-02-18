# Stage 1: Builder
FROM node:20.13.0 AS builder

WORKDIR /app

# Copy package files
COPY types/package*.json ./types/
COPY sdks/js/package*.json ./sdks/js/
COPY front/package*.json ./front/

# Install dependencies in parallel with cache
RUN --mount=type=cache,target=/root/.npm \
    (cd types && npm ci) & \
    (cd sdks/js && npm ci) & \
    (cd front && npm ci) & \
    wait

# Copy source code
COPY types/ ./types/
COPY sdks/js/ ./sdks/js/
COPY front/ ./front/

# Build each project in order
RUN cd types && npm run build
RUN cd sdks/js && npm run build
RUN cd front && FRONT_DATABASE_URI="sqlite:foo.sqlite" npm run build

# Stage 2: Production
FROM node:20.13.0-alpine

WORKDIR /app

# Copy runtime dependencies
COPY --from=builder /app/front/package*.json ./

# Install production deps
RUN npm ci --omit=dev --ignore-scripts

# Copy built artifacts
COPY --from=builder /app/types/dist ./types/dist
COPY --from=builder /app/sdks/js/dist ./sdks/js/dist
COPY --from=builder /app/front/.next ./front/.next
COPY --from=builder /app/front/public ./front/public

ENV NODE_ENV production
CMD ["npm", "--silent", "run", "start"]