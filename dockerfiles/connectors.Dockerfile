# start installing poppler tools for pdf text extraction
FROM node:20.19.2 AS build

RUN apt-get update && apt-get install -y vim redis-tools postgresql-client htop

ARG COMMIT_HASH_LONG

WORKDIR /tmp/
COPY /connectors/admin/docker_build/install_poppler_tools.sh ./
RUN chmod +x ./install_poppler_tools.sh
RUN ./install_poppler_tools.sh
# end installing poppler tools

FROM node:20.19.2 as connectors

ENV LD_LIBRARY_PATH=/usr/local/lib
COPY --from=build /tmp/poppler-23.07.0/build/utils/pdftotext /usr/bin/pdftotext
COPY --from=build /tmp/poppler-23.07.0/build/libpoppler.so.130 /usr/lib/libpoppler.so.130

WORKDIR /sdks/js
COPY /sdks/js/package*.json ./
COPY /sdks/js/ .
RUN npm ci
RUN npm run build

WORKDIR /app

COPY /connectors/package*.json ./
RUN npm ci
COPY /connectors/ .

# Remove test files
RUN find . -name "*.test.ts" -delete
RUN find . -name "*.test.tsx" -delete

RUN npm run build


EXPOSE 3002

ENV DD_GIT_REPOSITORY_URL=https://github.com/dust-tt/dust/
ENV DD_GIT_COMMIT_SHA=${COMMIT_HASH_LONG}

# Set a default command, it will start the API service if no command is provided
CMD ["npm", "run", "start:web"]
