# Build stage for types
FROM node:20.13.0-slim AS types
WORKDIR /types
COPY /types/package*.json ./
RUN npm ci
COPY /types/ .
RUN npm run build

# Build stage for SDK
FROM node:20.13.0-slim AS sdk
WORKDIR /sdks/js
COPY /sdks/js/package*.json ./
RUN npm ci
COPY --from=types /types/dist /app/node_modules/@dust-tt/types
COPY /sdks/js/ .
RUN npm run build

# Build stage for front
FROM node:20.13.0-slim AS builder
WORKDIR /app
COPY /front/package*.json ./
RUN npm ci
COPY --from=types /types/dist /app/node_modules/@dust-tt/types
COPY --from=sdk /sdks/js/dist /app/node_modules/@dust-tt/client
COPY /front .

ARG COMMIT_HASH
ARG NEXT_PUBLIC_VIZ_URL
ARG NEXT_PUBLIC_DUST_CLIENT_FACING_URL
ARG NEXT_PUBLIC_GTM_TRACKING_ID

ENV NEXT_PUBLIC_COMMIT_HASH=$COMMIT_HASH
ENV NEXT_PUBLIC_VIZ_URL=$NEXT_PUBLIC_VIZ_URL
ENV NEXT_PUBLIC_DUST_CLIENT_FACING_URL=$NEXT_PUBLIC_DUST_CLIENT_FACING_URL
ENV NEXT_PUBLIC_GTM_TRACKING_ID=$NEXT_PUBLIC_GTM_TRACKING_ID

RUN NODE_ENV=production FRONT_DATABASE_URI="sqlite:foo.sqlite" npm run build

# Production stage
FROM node:20.13.0-slim
WORKDIR /app

COPY /front/package*.json ./
RUN npm ci --only=production --ignore-scripts && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
    redis-tools=5:7.0.15-1~deb12u2 \
    postgresql-client-15=15.10-0+deb12u1 && \
    rm -rf /var/lib/apt/lists/*

# Copy built assets
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js ./

CMD ["npm", "--silent", "run", "start"]