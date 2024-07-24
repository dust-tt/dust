FROM node:20.13.0 as viz

RUN apt-get update && apt-get install -y vim redis-tools postgresql-client htop

WORKDIR /types
COPY /types/package*.json ./
COPY /types/ .
RUN npm ci
RUN npm run build

WORKDIR /app

COPY /viz/package*.json ./
RUN npm ci

COPY /viz .

ARG COMMIT_HASH
ENV NEXT_PUBLIC_COMMIT_HASH=${COMMIT_HASH}


RUN npm run build

CMD ["npm", "--silent", "run", "start"]
