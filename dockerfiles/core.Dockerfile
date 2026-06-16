# Build stage — full Rust toolchain + cmake (needed for sentencepiece)
FROM rust:1.85.0 AS builder

RUN apt-get update && apt-get install -y cmake && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY /core/ .

RUN --mount=type=cache,id=core-cargo-registry,target=/usr/local/cargo/registry \
    --mount=type=cache,id=core-cargo-git,target=/usr/local/cargo/git \
    cargo build --release --bin core-api --bin sqlite-worker --bin check_table

# Runtime stage — only the compiled binaries + minimal system libs
FROM debian:bookworm-slim AS core

# libstdc++6: required by V8 (via deno_core) C++ runtime
# ca-certificates: required for TLS connections to GCS, Elasticsearch, Qdrant, etc.
RUN apt-get update && \
  apt-get install -y libstdc++6 ca-certificates && \
  rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/core-api /usr/local/bin/core-api
COPY --from=builder /app/target/release/sqlite-worker /usr/local/bin/sqlite-worker
COPY --from=builder /app/target/release/check_table /usr/local/bin/check_table

ARG COMMIT_HASH
ARG COMMIT_HASH_LONG
ARG DD_GIT_REPOSITORY_URL=https://github.com/dust-tt/dust
ARG DD_GIT_COMMIT_SHA=${COMMIT_HASH_LONG}
ENV DD_GIT_REPOSITORY_URL=${DD_GIT_REPOSITORY_URL}
ENV DD_GIT_COMMIT_SHA=${DD_GIT_COMMIT_SHA}

EXPOSE 3001

CMD ["core-api"]
