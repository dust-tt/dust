# Stage 1: rust-builder - compile Rust in isolated stage
FROM debian:trixie-20260223-slim AS rust-builder

ENV DEBIAN_FRONTEND=noninteractive
ENV RUSTUP_HOME=/opt/rustup
ENV CARGO_HOME=/opt/cargo
ENV PATH="/opt/cargo/bin:$PATH"

RUN apt-get update && apt-get install -y --no-install-recommends \
  curl ca-certificates build-essential \
  && rm -rf /var/lib/apt/lists/*

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
  sh -s -- -y --default-toolchain stable --profile minimal

# Stage 2: rootfs - assemble complete filesystem
FROM debian:trixie-20260223-slim  AS rootfs

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates curl git unzip xz-utils gnupg lsb-release netcat-openbsd \
  && rm -rf /var/lib/apt/lists/*

# Add gcsfuse repository
RUN curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
  | tee /usr/share/keyrings/cloud.google.asc > /dev/null

RUN GCSFUSE_REPO=$(lsb_release -c -s) \
  && echo "deb [signed-by=/usr/share/keyrings/cloud.google.asc] https://packages.cloud.google.com/apt gcsfuse-$GCSFUSE_REPO main" \
     > /etc/apt/sources.list.d/gcsfuse.list

# Install gcsfuse
RUN apt-get update && apt-get install -y --no-install-recommends gcsfuse \
  && rm -rf /var/lib/apt/lists/*

# Python via uv (official Astral approach)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
ENV UV_PYTHON_INSTALL_DIR=/opt/python
RUN uv python install 3.14 \
  && PYTHON_BIN=$(find /opt/python -name "python3" -path "*/bin/*" | head -1) \
  && ln -s "$PYTHON_BIN" /usr/local/bin/python3 \
  && ln -s "$PYTHON_BIN" /usr/local/bin/python
ENV VIRTUAL_ENV=/opt/venv
RUN uv venv /opt/venv --python 3.14

# Rust from builder stage
COPY --from=rust-builder /opt/rustup /opt/rustup
COPY --from=rust-builder /opt/cargo /opt/cargo

# Node.js via official tarball
ARG NODE_VERSION=24.14.0
RUN ARCH=$(dpkg --print-architecture) && \
  if [ "$ARCH" = "amd64" ]; then NODE_ARCH="x64"; else NODE_ARCH="arm64"; fi && \
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" -o node.tar.xz && \
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" -o SHASUMS256.txt && \
  grep "node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz$" SHASUMS256.txt | awk '{print $1 "  node.tar.xz"}' | sha256sum -c - && \
  tar -xJf node.tar.xz -C /usr/local --strip-components=1 && \
  rm node.tar.xz SHASUMS256.txt

# Bun
ARG BUN_VERSION=1.3.7
RUN ARCH=$(dpkg --print-architecture) && \
  if [ "$ARCH" = "amd64" ]; then BUN_ARCH="x64"; else BUN_ARCH="aarch64"; fi && \
  curl -fsSL "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-${BUN_ARCH}.zip" \
  -o /tmp/bun.zip && \
  curl -fsSL "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/SHASUMS256.txt" \
  -o /tmp/SHASUMS256.txt && \
  grep "bun-linux-${BUN_ARCH}.zip$" /tmp/SHASUMS256.txt | awk '{print $1 "  /tmp/bun.zip"}' | sha256sum -c - && \
  unzip -q /tmp/bun.zip -d /tmp && \
  mv /tmp/bun-linux-${BUN_ARCH}/bun /usr/local/bin/bun && \
  chmod +x /usr/local/bin/bun && \
  rm -rf /tmp/bun.zip /tmp/SHASUMS256.txt /tmp/bun-linux-${BUN_ARCH}

WORKDIR /home/user
