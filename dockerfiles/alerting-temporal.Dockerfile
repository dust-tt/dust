FROM node:22-alpine

WORKDIR /app
COPY /alerting/temporal/ .
RUN npm install
CMD ["npm", "run", "start"]
