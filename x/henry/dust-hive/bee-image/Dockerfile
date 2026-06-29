# Bee image — a warm dust-hive environment baked for a Blaxel sandbox.
#
# A "bee" runs the full Dust stack in-bee on its own localhost (base port 10000)
# behind a Blaxel preview URL. This image is the worktree: the dust repo is baked
# in with node_modules installed and cargo target prebuilt, so `dust-hive bee-init`
# can skip worktree/symlink/sync and go straight to warming services.
#
# Build context = the dust repo root. Build with the bee-image/ Makefile (buildx),
# push with `bl push`. NEVER `bl deploy` / `make run` / SandboxInstance.create —
# those create a sandbox (we are quota-limited).
#
# Base: debian (glibc). Dust's Rust (rust:1.85.0) and Node (node:24.16.0-slim)
# builds are glibc; Blaxel's stock blaxel/docker-in-sandbox is alpine/musl, so we
# do NOT inherit from it — we replicate its dockerd bring-up on a glibc base
# (see entrypoint.sh) and pull in the sandbox-api binary directly.

FROM node:24.16.0 AS bee

# ── Blaxel sandbox API ──────────────────────────────────────────────────────
# Required in every Blaxel sandbox image (process management, file ops, exec).
# Started by entrypoint.sh; clients reach it on :8080.
COPY --from=ghcr.io/blaxel-ai/sandbox:latest /sandbox-api /usr/local/bin/sandbox-api

# ── System + dev toolchain (the dust-hive `doctor` prerequisites) ───────────
# - docker.io + docker-compose-plugin: nested Docker for PG/Redis/Qdrant/ES/Tika
# - cmake + protobuf-compiler + pkg-config + libssl-dev: core (Rust) build deps
#   (cmake is required by sentencepiece, per dockerfiles/core.Dockerfile)
# - libjemalloc2/-dev: front runtime (per dockerfiles/front.Dockerfile)
# - tmux: bees default to tmux (passive multiplexer, attach over exec)
# - postgresql-client: `psql` (DB creation in init) + `pg_isready`; host-side,
#   since `docker exec` does not work in the sandbox
# - direnv, lsof, git, curl, ca-certificates, build-essential, iptables: misc
RUN apt-get update && apt-get install -y --no-install-recommends \
      docker.io \
      cmake protobuf-compiler pkg-config libssl-dev build-essential \
      libjemalloc2 libjemalloc-dev \
      postgresql-client \
      tmux direnv lsof git curl ca-certificates iptables \
    && rm -rf /var/lib/apt/lists/*

# docker.io ships dockerd + the docker CLI, but the Compose v2 plugin
# (`docker compose`, which dust-hive uses) is not in debian's repos — it comes
# from Docker's own apt repo. Drop the plugin binary into the CLI plugins dir.
# Built --platform linux/amd64, so the x86_64 asset is correct.
RUN mkdir -p /usr/local/lib/docker/cli-plugins \
    && curl -fsSL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
         -o /usr/local/lib/docker/cli-plugins/docker-compose \
    && chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# Blaxel's microVM kernel programs NAT via the legacy iptables backend — the
# stock blaxel/docker-in-sandbox image ships iptables-legacy. Debian defaults to
# the nft backend, which dockerd cannot set up here, so select legacy explicitly.
RUN update-alternatives --set iptables /usr/sbin/iptables-legacy \
    && update-alternatives --set ip6tables /usr/sbin/ip6tables-legacy

RUN npm install -g npm@11.11.0

# ── Rust 1.85.0 (core + oauth) ──────────────────────────────────────────────
ENV RUSTUP_HOME=/usr/local/rustup CARGO_HOME=/usr/local/cargo PATH=/usr/local/cargo/bin:$PATH
RUN curl -fsSL https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.85.0 --profile minimal

# ── Bun (dust-hive CLI runtime) ─────────────────────────────────────────────
ENV BUN_INSTALL=/usr/local/bun PATH=/usr/local/bun/bin:$PATH
RUN curl -fsSL https://bun.sh/install | bash

# ── Temporal CLI (workers + namespaces; `temporal server start-dev`) ────────
# The binary is ~550 MB (it bundles the dev server). `mv` it out and drop the
# installer dir so we keep ONE copy, not two — `cp` would leave a 550 MB dupe.
RUN curl -fsSL https://temporal.download/cli.sh | sh \
    && mv "$HOME/.temporalio/bin/temporal" /usr/local/bin/temporal \
    && rm -rf "$HOME/.temporalio"

# ── Bake the dust repo as the worktree ──────────────────────────────────────
ENV BEE_REPO=/workspace/dust
WORKDIR ${BEE_REPO}
COPY . ${BEE_REPO}

# Install the dust-hive CLI globally so `dust-hive` is on PATH in the bee.
RUN cd ${BEE_REPO}/x/henry/dust-hive/cli && bun install && bun link

# Default the bee to tmux (config flip; the adapter already exists).
RUN mkdir -p /root/.dust-hive && printf '{\n  "multiplexer": "tmux"\n}\n' > /root/.dust-hive/settings.json

# Warm-bake dependencies + binaries so first `warm` is fast and bee-init needs no
# main repo to symlink from. node_modules live in place (not shallow-copied), and
# cargo target/ is built in place — exactly what single-worktree bee mode expects.
# Scope npm ci to the workspaces a bee actually runs (mirrors front.Dockerfile).
# A bare root `npm ci` also builds cli/dust-cli, whose native `keytar` dependency
# needs libsecret and fails in this image — and the bee never runs that workspace.
# The cache mount keeps the npm download cache across rebuilds.
RUN --mount=type=cache,id=npm-cache,target=/root/.npm \
    npm ci -w sdks/js -w sparkle -w front -w front-spa -w front-api \
           -w marketing -w connectors -w viz
RUN cd ${BEE_REPO}/sdks/js && npm run build
RUN cd ${BEE_REPO}/sparkle && npm run build
# Prebuild only the Rust binaries dust-hive runs — its own ALL_BINARIES list
# (cli/src/lib/cache.ts): 3 service bins + 3 init bins, all in the core crate
# (there is no separate oauth/ crate). A bare `cargo build` links all ~15 of
# core's bins, several in parallel, and OOM-kills the linker under emulation.
# Dev profile (target/debug) matches what `warm` expects.
#
# Two memory levers keep the build inside the ~8 GB Docker VM under amd64
# emulation, where rustc/ld run much heavier than native:
#   CARGO_PROFILE_DEV_DEBUG=0 — drop debug info. core-api statically links a huge
#     graph (deno_core/V8, swc); full DWARF makes `ld` hold multiple GB at once
#     and OOM-kills the link. A bee runs the binaries, it does not debug them at
#     the Rust source level. Also shrinks the baked target/.
#   CARGO_BUILD_JOBS=1 — compile one crate at a time. The default fans out one
#     rustc per core, and several giant crates compiling at once blow past the
#     ceiling (this is what killed the init_db compile). Slower, but deterministic.
# The registry cache mount persists crate downloads across rebuilds; target/ is a
# real layer so the binaries bake in (a cache mount would not survive the image).
# Drop target/debug/incremental afterward: it's the dust crate's incremental
# state, not needed to run the binaries, and it regenerates on the first in-hive
# rebuild (~90 s, once). The dep rlibs in target/debug/deps stay, so rebuilds are
# still fast. Saves ~0.5 GB from the image.
RUN --mount=type=cache,id=cargo-registry,target=/usr/local/cargo/registry \
    cd ${BEE_REPO}/core && CARGO_PROFILE_DEV_DEBUG=0 CARGO_BUILD_JOBS=1 cargo build \
      --bin core-api --bin oauth --bin sqlite-worker \
      --bin init_db --bin elasticsearch_create_index --bin qdrant_create_collection \
    && rm -rf ${BEE_REPO}/core/target/debug/incremental

# dust-hive wraps every node service command with `nvm use` (needsNvm:true in the
# registry), but this image bakes node directly — there is no nvm. The wrapper is
# `set -e && ... && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm use && <cmd>`,
# so with no nvm.sh the `&&` chain short-circuits and bash exits 1 *before* <cmd>
# ("process exited immediately" — every node service fails to start). A no-op nvm
# shim satisfies the wrapper and falls through to the baked node, which is already
# the correct version. Placed after the cargo layer so it doesn't bust that cache.
RUN mkdir -p /root/.nvm && printf 'nvm() { :; }\n' > /root/.nvm/nvm.sh

# ── In-bee developer tools ──────────────────────────────────────────────────
# A bee is where a coding agent develops a feature and opens a PR, so the image
# ships the agent and the GitHub CLI. Placed after the cargo layer so they don't
# bust that cache. Creds (ANTHROPIC_API_KEY, a GitHub token) are injected per-bee
# at connect time, not baked.
#
# Claude Code — the in-bee coding agent (node 24 already present).
RUN npm install -g @anthropic-ai/claude-code
# GitHub CLI — branch/commit/push then `gh pr create`. Installed from GitHub's
# own apt repo (the binary is not in Debian's). arch=amd64 matches the image.
RUN mkdir -p -m 755 /etc/apt/keyrings \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
         -o /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
         > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

# Bake the prebuilt Elasticsearch image (stock ES + analysis-icu), built on the
# host by the Makefile (`make es-image`). A bee must NOT build ES in-place:
# compose's `build:` needs buildx (not installed) and would rebuild on every cold
# boot. entrypoint.sh `docker load`s this once dockerd is up, and compose `up`
# then finds the tagged image and skips the build (see docker-compose.yml
# `elasticsearch.image`). Placed after the cargo layer so it doesn't bust it.
COPY x/henry/dust-hive/bee-image/es-image.tar /opt/es-image.tar

COPY x/henry/dust-hive/bee-image/entrypoint.sh /usr/local/bin/bee-entrypoint.sh
RUN chmod +x /usr/local/bin/bee-entrypoint.sh

EXPOSE 10000
ENTRYPOINT ["/usr/local/bin/bee-entrypoint.sh"]
