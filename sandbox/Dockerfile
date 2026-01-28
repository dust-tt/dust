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

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# Create symlink for node (bun provides node compatibility)
RUN ln -s /root/.bun/bin/bun /usr/local/bin/node

# Install tsgo (TypeScript native Go compiler)
RUN bun install -g @typescript/native-preview

# Install Biome
RUN bun install -g @biomejs/biome

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
