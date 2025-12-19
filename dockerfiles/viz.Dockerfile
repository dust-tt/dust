FROM node:20.19.2 AS viz

RUN apt-get update && apt-get install -y vim redis-tools postgresql-client htop

# Set up workspace structure
WORKDIR /app
COPY /package*.json ./
COPY /viz/package*.json ./viz/
COPY /sdks/js/package*.json ./sdks/js/
COPY /connectors/package*.json ./connectors/
COPY /sparkle/package*.json ./sparkle/
COPY /front/package*.json ./front/
COPY /cli/package*.json ./cli/
COPY /extension/package*.json ./extension/
COPY /common/package*.json ./common/
COPY /eslint-plugin-dust/package*.json ./eslint-plugin-dust/
RUN npm ci --legacy-peer-deps

# Copy viz source
WORKDIR /app/viz
COPY /viz .

ARG COMMIT_HASH
ENV NEXT_PUBLIC_COMMIT_HASH=${COMMIT_HASH}

# Remove test files
RUN find . -name "*.test.ts" -delete
RUN find . -name "*.test.tsx" -delete

RUN npm run build

CMD ["npm", "--silent", "run", "start"]
