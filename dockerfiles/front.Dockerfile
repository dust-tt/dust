# Build stage for types
FROM node:20.13.0-slim AS types
WORKDIR /types
COPY /types/package*.json ./
COPY /types/ .
RUN npm ci && npm run build

# Build stage for SDK
FROM node:20.13.0-slim AS sdk
WORKDIR /sdks/js
COPY /sdks/js/package*.json ./
COPY --from=types /types/dist /types/dist
COPY /sdks/js/ .
RUN npm ci && npm run build

# Build stage for front
FROM node:20.13.0-slim AS builder
WORKDIR /app
COPY /front/package*.json ./
COPY --from=types /types/dist /types/dist
COPY --from=sdk /sdks/js/dist /sdks/js/dist
COPY /front .

ARG COMMIT_HASH
ARG NEXT_PUBLIC_VIZ_URL
ARG NEXT_PUBLIC_DUST_CLIENT_FACING_URL
ARG NEXT_PUBLIC_GTM_TRACKING_ID

ENV NEXT_PUBLIC_COMMIT_HASH=$COMMIT_HASH
ENV NEXT_PUBLIC_VIZ_URL=$NEXT_PUBLIC_VIZ_URL
ENV NEXT_PUBLIC_DUST_CLIENT_FACING_URL=$NEXT_PUBLIC_DUST_CLIENT_FACING_URL
ENV NEXT_PUBLIC_GTM_TRACKING_ID=$NEXT_PUBLIC_GTM_TRACKING_ID

RUN npm ci && \
    FRONT_DATABASE_URI="sqlite:foo.sqlite" npm run build

# Production stage
FROM node:20.13.0-slim
WORKDIR /app

# Install production dependencies and required tools in a single layer
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    redis-tools=6:6.0.16-1+deb11u3 \
    postgresql-client=13+226 && \
    rm -rf /var/lib/apt/lists/* && \
    npm ci --only=production

# Copy built assets
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js ./
COPY /front/package*.json ./

CMD ["npm", "--silent", "run", "start"]