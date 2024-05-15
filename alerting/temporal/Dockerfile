# syntax=docker/dockerfile:1

FROM node:20-alpine
WORKDIR /src
COPY . .
RUN npm install
CMD ["npm", "run", "start"]
