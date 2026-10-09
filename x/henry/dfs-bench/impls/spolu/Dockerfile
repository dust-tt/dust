# Builds spolu's DFS v5 (x/spolu/dfs/v5 is the build context), like its local/Dockerfile but on
# Debian 12, whose glibc the sandboxes' Ubuntu 24.04 also runs. The image runs dfs-server-v5 and
# carries the `dfs` admin CLI; dfs-fuse is copied out of it by impls/spolu/build for the sandboxes.
FROM rust:1.98.1-bookworm AS build
ARG FDB_VERSION
RUN apt-get update && apt-get install -y --no-install-recommends clang libclang-dev pkg-config \
    protobuf-compiler \
  && rm -rf /var/lib/apt/lists/*
RUN curl -fsSLo /tmp/fdb.deb \
    "https://github.com/apple/foundationdb/releases/download/${FDB_VERSION}/foundationdb-clients_${FDB_VERSION}-1_amd64.deb" \
  && dpkg -i /tmp/fdb.deb && rm /tmp/fdb.deb
WORKDIR /src
COPY . .
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/target \
    cargo build --release --locked -p dfs-server-v5 -p dfs-fuse -p dfs-client \
  && cp target/release/dfs-server-v5 target/release/dfs-fuse target/release/dfs /usr/local/bin/

FROM debian:bookworm-slim
COPY --from=build /usr/lib/libfdb_c.so /usr/lib/libfdb_c.so
COPY --from=build /usr/local/bin/dfs-server-v5 /usr/local/bin/dfs-fuse /usr/local/bin/dfs /usr/local/bin/
ENTRYPOINT ["/usr/local/bin/dfs-server-v5"]
