FROM foundationdb/foundationdb:7.3.69 AS fdb
FROM rust:1.98.1-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    fuse3 python3 ca-certificates pkg-config protobuf-compiler clang libclang-dev curl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=fdb /usr/lib/libfdb_c.so /usr/lib/libfdb_c.so
COPY --from=fdb /usr/bin/fdbcli /usr/bin/fdbcli
RUN rustup component add clippy rustfmt
WORKDIR /dfs/v2
