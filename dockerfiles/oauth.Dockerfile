# Build stage — full Rust toolchain + cmake (needed for sentencepiece)
FROM rust:1.85.0 AS builder

RUN apt-get update && apt-get install -y cmake && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY /core/ .

RUN --mount=type=cache,id=oauth-cargo-registry,target=/usr/local/cargo/registry \
    --mount=type=cache,id=oauth-cargo-git,target=/usr/local/cargo/git \
    cargo build --release --bin oauth

# Runtime stage — only the compiled binary + minimal system libs
FROM debian:bookworm-slim AS oauth

# libstdc++6: C++ runtime, required by any C++ transitive dependencies
# ca-certificates: required for TLS connections to external OAuth providers
RUN apt-get update && \
  apt-get install -y libstdc++6 ca-certificates && \
  rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/oauth /usr/local/bin/oauth

EXPOSE 3006

CMD ["oauth"]
