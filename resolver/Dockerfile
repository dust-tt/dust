FROM node:20.13.0 AS front

RUN apt-get update && apt-get install -y vim htop

WORKDIR /types
COPY /types/package*.json ./
COPY /types/ .
RUN npm ci
RUN npm run build

WORKDIR /app

COPY /resolver/package*.json ./
RUN npm ci

COPY /resolver .

CMD ["npm", "--silent", "run", "start"]
