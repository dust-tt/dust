FROM node:24.16.0 AS viz

RUN apt-get update && apt-get install -y vim redis-tools postgresql-client htop

RUN npm install -g npm@11.11.0

WORKDIR /app
COPY package.json package-lock.json ./
COPY sparkle/package.json ./sparkle/
COPY viz/package.json ./viz/

RUN --mount=type=cache,id=npm-cache,target=/root/.npm npm ci -w sparkle -w viz

# Sparkle's package entries point at dist/, which Viz needs for both its build and runtime types.
WORKDIR /app/sparkle
COPY /sparkle .
RUN npm run build

WORKDIR /app/viz
COPY /viz .

ARG COMMIT_HASH
ARG COMMIT_HASH_LONG
ARG DD_GIT_REPOSITORY_URL=https://github.com/dust-tt/dust
ARG DD_GIT_COMMIT_SHA=${COMMIT_HASH_LONG}
ENV NEXT_PUBLIC_COMMIT_HASH=${COMMIT_HASH}
ENV DD_GIT_REPOSITORY_URL=${DD_GIT_REPOSITORY_URL}
ENV DD_GIT_COMMIT_SHA=${DD_GIT_COMMIT_SHA}

RUN find . -name "*.test.ts" -delete
RUN find . -name "*.test.tsx" -delete

RUN npm run build

CMD ["npm", "--silent", "run", "start"]
