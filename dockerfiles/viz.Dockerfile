FROM node:24.14.0 AS viz

RUN apt-get update && apt-get install -y vim redis-tools postgresql-client htop

RUN npm install -g npm@11.11.0

WORKDIR /app
COPY package.json package-lock.json ./
COPY viz/package.json ./viz/

RUN --mount=type=cache,id=npm-cache,target=/root/.npm npm ci

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
