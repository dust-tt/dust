FROM node:20.13.0 AS build

ARG COMMIT_HASH
ARG NEXT_PUBLIC_VIZ_URL
ARG NEXT_PUBLIC_DUST_CLIENT_FACING_URL
ARG NEXT_PUBLIC_GTM_TRACKING_ID

ENV NEXT_PUBLIC_COMMIT_HASH=$COMMIT_HASH
ENV NEXT_PUBLIC_VIZ_URL=$NEXT_PUBLIC_VIZ_URL
ENV NEXT_PUBLIC_DUST_CLIENT_FACING_URL=$NEXT_PUBLIC_DUST_CLIENT_FACING_URL
ENV NEXT_PUBLIC_GTM_TRACKING_ID=$NEXT_PUBLIC_GTM_TRACKING_ID

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

# Production
FROM node:20.13.0-alpine
ENV HUSKY=0
WORKDIR /app

COPY --from=build /app/.next .next
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev

CMD ["npm", "--silent", "run", "start"]
