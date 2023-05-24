FROM node:18.15.0 as connectors

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build


EXPOSE 3002

# Set a default command, it will start the API service if no command is provided
CMD ["npm", "run", "start:web"]