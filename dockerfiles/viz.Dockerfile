FROM node:20.19.2 AS viz

RUN apt-get update && apt-get install -y vim redis-tools postgresql-client htop

COPY /package*.json /
COPY /viz/package*.json /viz
RUN npm ci

WORKDIR /viz
COPY /viz .

ARG COMMIT_HASH
ENV NEXT_PUBLIC_COMMIT_HASH=${COMMIT_HASH}

# Remove test files
RUN find . -name "*.test.ts" -delete
RUN find . -name "*.test.tsx" -delete

RUN npm run build

CMD ["npm", "--silent", "run", "start"]
