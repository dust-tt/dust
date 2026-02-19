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
# Stage 2: RootFS (will be copied into final image as a single layer)
# ============================================================
FROM ubuntu:24.04 AS rootfs

ENV DEBIAN_FRONTEND=noninteractive

# System runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    unzip \
    git \
    ca-certificates \
    python3 \
    python3-venv \
    fuse3 \
    libfreetype6 \
    libpng16-16t64 \
    libjpeg8 \
    && rm -rf /var/lib/apt/lists/*

# Install gcsfuse (Google Cloud Storage FUSE)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gnupg \
    && curl -fsSL "https://packages.cloud.google.com/apt/doc/apt-key.gpg" -o /tmp/cloud.google.gpg \
    && gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg /tmp/cloud.google.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt gcsfuse-noble main" \
      > /etc/apt/sources.list.d/gcsfuse.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends gcsfuse \
    && apt-get purge -y --auto-remove gnupg \
    && rm -rf /var/lib/apt/lists/* /tmp/cloud.google.gpg

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

# Install tsgo (TypeScript native Go compiler) and Biome (pinned versions)
ARG TYPESCRIPT_NATIVE_PREVIEW_VERSION=7.0.0-dev.20260128.1
ARG BIOME_VERSION=2.3.13
RUN bun install -g \
    @typescript/native-preview@${TYPESCRIPT_NATIVE_PREVIEW_VERSION} \
    @biomejs/biome@${BIOME_VERSION}

# Copy Python venv from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy and install TypeScript dependencies
WORKDIR /workspace
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Ensure the container starts in /workspace even though the final image is flattened.
RUN printf '%s\n' \
    '#!/bin/bash' \
    'set -euo pipefail' \
    'cd /workspace' \
    'exec "$@"' \
    > /usr/local/bin/dust-sandbox-entrypoint \
    && chmod +x /usr/local/bin/dust-sandbox-entrypoint

# ============================================================
# Stage 3: Final (flattened to a single filesystem layer)
# ============================================================
FROM scratch
COPY --from=rootfs / /

ENV DEBIAN_FRONTEND=noninteractive
ENV PATH="/opt/venv/bin:/root/.bun/bin:/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin"

# Default shell for exec commands
SHELL ["/bin/bash", "-c"]

ENTRYPOINT ["/usr/local/bin/dust-sandbox-entrypoint"]
CMD ["/bin/bash"]
