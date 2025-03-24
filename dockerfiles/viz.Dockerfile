FROM node:20.13.0 AS viz

RUN apt-get update && apt-get install -y vim redis-tools postgresql-client htop

WORKDIR /app

COPY /viz/package*.json ./
RUN npm ci

COPY /viz .

ARG COMMIT_HASH
ENV NEXT_PUBLIC_COMMIT_HASH=${COMMIT_HASH}


RUN npm run build

CMD ["npm", "--silent", "run", "start"]
