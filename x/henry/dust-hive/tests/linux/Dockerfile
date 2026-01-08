# Dockerfile for testing dust-hive on Linux
# Build: docker build -t dust-hive-linux-test -f tests/linux/Dockerfile .
# Run: docker run --rm dust-hive-linux-test

FROM ubuntu:22.04

# Avoid interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install basic dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    unzip \
    lsof \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install

# Copy source code
COPY . .

# Run tests
CMD ["bun", "test"]
