# Install dependencies only when needed
FROM node:18 AS builder
WORKDIR /app
COPY . .
# RUN yarn install --frozen-lockfile

# If using npm with a `package-lock.json` comment out above and use below instead
RUN npm ci

ENV NEXT_TELEMETRY_DISABLED 1

# Add `ARG` instructions below if you need `NEXT_PUBLIC_` variables
# then put the value on your fly.toml
# Example:
# ARG NEXT_PUBLIC_EXAMPLE="value here"

#RUN yarn build

# If using npm comment out above and use below instead
RUN npm run build

# Production image, copy all the files and run next
FROM node:18 AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app ./

USER nextjs

# CMD ["yarn", "start"]

# If using npm comment out above and use below instead
CMD ["npm", "run", "start"]

