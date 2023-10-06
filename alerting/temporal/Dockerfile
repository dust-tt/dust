# syntax=docker/dockerfile:1

FROM node:18-alpine
WORKDIR /src
COPY . .
RUN npm install
CMD ["npm", "run", "start"]