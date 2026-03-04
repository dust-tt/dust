# Stage 1: rust-builder - compile Rust in isolated stage
FROM debian:bookworm-slim AS rust-builder

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
FROM debian:bookworm-slim AS rootfs

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git unzip xz-utils \
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
ARG NODE_VERSION=22.12.0
RUN ARCH=$(dpkg --print-architecture) && \
    if [ "$ARCH" = "amd64" ]; then NODE_ARCH="x64"; else NODE_ARCH="arm64"; fi && \
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" \
    | tar -xJ -C /usr/local --strip-components=1

# Bun
ARG BUN_VERSION=1.3.7
RUN ARCH=$(dpkg --print-architecture) && \
    if [ "$ARCH" = "amd64" ]; then BUN_ARCH="x64"; else BUN_ARCH="aarch64"; fi && \
    curl -fsSL "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-${BUN_ARCH}.zip" \
    -o /tmp/bun.zip && \
    unzip -q /tmp/bun.zip -d /tmp && \
    mv /tmp/bun-linux-${BUN_ARCH}/bun /usr/local/bin/bun && \
    chmod +x /usr/local/bin/bun && \
    rm -rf /tmp/bun.zip /tmp/bun-linux-${BUN_ARCH}

WORKDIR /home/user

# Cleanup unnecessary files to reduce image size
RUN rm -rf /usr/local/include \
    && rm -rf /usr/local/lib/node_modules \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    && rm -rf /usr/share/doc /usr/share/man /usr/share/info

# Persist PATH to /etc/profile.d/ so it's available at runtime in E2B sandbox
RUN printf '%s\n' \
    'export PATH="/opt/venv/bin:/opt/cargo/bin:$PATH"' \
    'export VIRTUAL_ENV="/opt/venv"' \
    'export RUSTUP_HOME="/opt/rustup"' \
    'export CARGO_HOME="/opt/cargo"' \
    > /etc/profile.d/sandbox-env.sh

# Stage 3: final - flatten to single layer
FROM scratch
COPY --from=rootfs / /

ENV PATH="/opt/venv/bin:/opt/cargo/bin:/usr/local/bin:/usr/bin:/bin"
ENV VIRTUAL_ENV="/opt/venv"
ENV RUSTUP_HOME="/opt/rustup"
ENV CARGO_HOME="/opt/cargo"

WORKDIR /home/user
