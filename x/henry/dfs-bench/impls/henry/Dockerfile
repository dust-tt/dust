# Builds Henry's DFS (x/henry/dfs is the build context). The image runs dfs-server; dfs-mount is
# copied out of it by impls/henry/build for the sandboxes, which run the same Debian 12.
FROM rust:1-bookworm AS build
ARG FDB_VERSION
RUN apt-get update && apt-get install -y --no-install-recommends clang libclang-dev \
  && rm -rf /var/lib/apt/lists/*
RUN curl -fsSLo /tmp/fdb.deb \
    "https://github.com/apple/foundationdb/releases/download/${FDB_VERSION}/foundationdb-clients_${FDB_VERSION}-1_amd64.deb" \
  && dpkg -i /tmp/fdb.deb && rm /tmp/fdb.deb
WORKDIR /src
COPY . .
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/target \
    cargo build --release --locked -p dfs-server -p dfs-mount \
  && cp target/release/dfs-server target/release/dfs-mount /usr/local/bin/

FROM debian:bookworm-slim
COPY --from=build /usr/lib/libfdb_c.so /usr/lib/libfdb_c.so
COPY --from=build /usr/local/bin/dfs-server /usr/local/bin/dfs-mount /usr/local/bin/
ENTRYPOINT ["/usr/local/bin/dfs-server"]
