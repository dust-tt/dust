FROM foundationdb/foundationdb:7.3.69 AS fdb
FROM rust:1.98.1-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    fuse3 python3 ripgrep ca-certificates pkg-config protobuf-compiler clang libclang-dev curl \
    git less bash-completion openssh-client \
    && rm -rf /var/lib/apt/lists/*
COPY --from=fdb /usr/lib/libfdb_c.so /usr/lib/libfdb_c.so
COPY --from=fdb /usr/bin/fdbcli /usr/bin/fdbcli
RUN rustup component add clippy rustfmt
COPY bashrc /root/.bashrc
WORKDIR /dfs/v5
