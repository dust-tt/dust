# syntax=docker/dockerfile:1.7

# Stage 1: build dsbx (Linux glibc target).
FROM rust:1-bookworm AS builder
WORKDIR /build
COPY cli/dust-sandbox/Cargo.toml cli/dust-sandbox/Cargo.lock cli/dust-sandbox/
COPY cli/dust-sandbox/src cli/dust-sandbox/src
RUN cargo build --release --manifest-path cli/dust-sandbox/Cargo.toml --bin dsbx

# Stage 2: runtime with iptables + bun.
FROM oven/bun:1-debian

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       iptables \
       ca-certificates \
       procps \
       util-linux \
  && rm -rf /var/lib/apt/lists/*

# iptables-legacy is more portable across container hosts than iptables-nft.
RUN update-alternatives --set iptables /usr/sbin/iptables-legacy || true

# Dedicated uid/gid for outbound test traffic so iptables can match the owner.
RUN groupadd --gid 3000 dust-fwd \
  && useradd --no-create-home --shell /usr/sbin/nologin --uid 3000 --gid 3000 dust-fwd

COPY --from=builder /build/cli/dust-sandbox/target/release/dsbx /usr/local/bin/dsbx

WORKDIR /app
COPY cli/dust-sandbox/e2e/package.json cli/dust-sandbox/e2e/bun.lock ./
# Not --frozen-lockfile: the container's bun version may drift from whichever
# host generated bun.lock, and the resulting format bump would fail the freeze.
# We still COPY the lockfile so resolution is deterministic within a version.
RUN bun install

COPY cli/dust-sandbox/e2e/entrypoint.sh cli/dust-sandbox/e2e/smoke.ts cli/dust-sandbox/e2e/case.ts ./
RUN chmod +x /app/entrypoint.sh && chmod -R a+rX /app

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["all"]
