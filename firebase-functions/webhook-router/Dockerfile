FROM node:20

# Install Java 21 (required for Firebase storage/database emulators)
# Add Adoptium repo
RUN wget -qO - https://packages.adoptium.net/artifactory/api/gpg/key/public | apt-key add - \
    && echo "deb https://packages.adoptium.net/artifactory/deb bookworm main" \
       > /etc/apt/sources.list.d/adoptium.list

# Install Temurin JDK 21
RUN apt-get update && apt-get install -y temurin-21-jdk

# Install Firebase tools globally
RUN npm install -g firebase-tools

WORKDIR /app
