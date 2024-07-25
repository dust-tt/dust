FROM node:20.13.0 as front

RUN apt-get update && apt-get install -y vim redis-tools postgresql-client htop

WORKDIR /types
COPY /types/package*.json ./
COPY /types/ .
RUN npm ci
RUN npm run build

WORKDIR /app

COPY /front/package*.json ./
RUN npm ci

COPY /front .

ARG COMMIT_HASH
ARG NEXT_PUBLIC_VIZ_URL

ENV NEXT_PUBLIC_COMMIT_HASH=$COMMIT_HASH
ENV NEXT_PUBLIC_VIZ_URL=$NEXT_PUBLIC_VIZ_URL

# fake database URIs are needed because Sequelize will throw if the `url` parameter
# is undefined, and `next build` imports the `models.ts` file while "Collecting page data"
RUN FRONT_DATABASE_URI="sqlite:foo.sqlite" npm run build

CMD ["npm", "--silent", "run", "start"]
