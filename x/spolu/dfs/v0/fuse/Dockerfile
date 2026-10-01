FROM rust:1.98.1-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    fuse3 python3 ca-certificates pkg-config && rm -rf /var/lib/apt/lists/*
RUN rustup component add clippy rustfmt
WORKDIR /dfs
