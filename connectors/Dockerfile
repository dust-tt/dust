FROM node:18.15.0 as connectors


RUN  apt-get update && apt-get \
 
 install -y \
 # needed for pdf-to-text npm package
 poppler-utils 

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build


EXPOSE 3002

# Set a default command, it will start the API service if no command is provided
CMD ["npm", "run", "start:web"]