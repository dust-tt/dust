
# start installing poppler tools for pdf text extraction
FROM node:18.15.0 as build
 
WORKDIR /tmp/
COPY ./admin/docker_build/install_poppler_tools.sh ./
RUN chmod +x ./install_poppler_tools.sh
RUN ./install_poppler_tools.sh
# end installing poppler tools

FROM node:18.15.0 as connectors

ENV LD_LIBRARY_PATH=/usr/local/lib
COPY --from=build /tmp/poppler-23.07.0/build/utils/pdftotext /usr/bin/pdftotext
COPY --from=build /tmp/poppler-23.07.0/build/libpoppler.so.130 /usr/lib/libpoppler.so.130

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build


EXPOSE 3002

# Set a default command, it will start the API service if no command is provided
CMD ["npm", "run", "start:web"]