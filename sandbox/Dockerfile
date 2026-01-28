# ============================================================
# Stage 1: Builder - compile Python packages with C extensions
# ============================================================
FROM ubuntu:24.04 AS builder

# Avoid interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# System build dependencies (cached layer)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3-dev \
    python3-pip \
    python3-venv \
    libfreetype6-dev \
    libpng-dev \
    libjpeg-dev \
    && rm -rf /var/lib/apt/lists/*

# Create venv and install Python deps
COPY requirements.txt /tmp/
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.txt

# ============================================================
# Stage 2: Runtime
# ============================================================
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# System runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    unzip \
    git \
    ca-certificates \
    python3 \
    python3-venv \
    libfreetype6 \
    libpng16-16t64 \
    libjpeg8 \
    && rm -rf /var/lib/apt/lists/*

# Install Bun (pinned version, direct binary download)
ARG BUN_VERSION=1.3.7
RUN ARCH=$(dpkg --print-architecture) && \
    if [ "$ARCH" = "amd64" ]; then BUN_ARCH="x64"; else BUN_ARCH="aarch64"; fi && \
    curl -fsSL "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-${BUN_ARCH}.zip" -o /tmp/bun.zip && \
    unzip -q /tmp/bun.zip -d /tmp && \
    mv /tmp/bun-linux-${BUN_ARCH}/bun /usr/local/bin/bun && \
    chmod +x /usr/local/bin/bun && \
    rm -rf /tmp/bun.zip /tmp/bun-linux-${BUN_ARCH} && \
    ln -s /usr/local/bin/bun /usr/local/bin/node
ENV PATH="/root/.bun/bin:/usr/local/bin:$PATH"

# Install tsgo (TypeScript native Go compiler) and Biome
RUN bun install -g @typescript/native-preview @biomejs/biome

# Copy Python venv from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy and install TypeScript dependencies
WORKDIR /workspace
COPY package.json ./
RUN bun install

# Default shell for exec commands
SHELL ["/bin/bash", "-c"]

CMD ["/bin/bash"]
