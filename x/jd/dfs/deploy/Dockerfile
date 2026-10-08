FROM rust:1.96-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends clang libclang-dev cmake pkg-config fuse3 libfuse3-dev python3 ripgrep util-linux ca-certificates && rm -rf /var/lib/apt/lists/*
RUN rustup component add clippy rustfmt
WORKDIR /dfs
ENV CARGO_TARGET_DIR=/dfs/target/linux
