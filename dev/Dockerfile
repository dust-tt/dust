# syntax=docker/dockerfile:1.4
# Dust shared dev image — system toolchain and infra binaries only.
# Used by Cursor Cloud Agents, local docker-run, and other AI agents.
# Application source is bind-mounted or checked out at runtime; deps are built in `install`.
#
# Layer cache: keep this file stable — any ENV/RUN edit above the apt layer invalidates
# all downstream steps (apt, rust, temporal, …). Shell/terminal defaults live in
# dev/scripts/env.sh and dev/bashrc (bind-mounted at runtime).
#
# Base is Ubuntu 24.04 rather than a node:* image because Cursor's in-container screen
# recorder (/exec-daemon/polished-renderer.node) needs glibc >= 2.39 and the FFmpeg 6
# sonames (libavutil.so.58, libav{codec,format,device}.so.60, libswscale.so.7). Debian 12
# has glibc 2.36 + FFmpeg 5 and Debian 13 has FFmpeg 7, so neither can satisfy it; Node is
# installed from the official tarball below.
FROM ubuntu:24.04

ARG TARGETARCH

ENV DEBIAN_FRONTEND=noninteractive \
    LEFTHOOK_EXCLUDE=front-lint-test-filenames,front-typecheck,front-circular,front-docs-check,connectors-lint-test-filenames,connectors-typecheck,lint-staged \
    DUST_IN_CONTAINER=1 \
    RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH="/usr/local/cargo/bin:/root/.temporalio/bin:/opt/qdrant:${PATH}" \
    BASH_ENV=/tmp/dust-shell-env.sh


RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | gpg --dearmor -o /usr/share/keyrings/postgresql-keyring.gpg \
  && echo "deb [signed-by=/usr/share/keyrings/postgresql-keyring.gpg] http://apt.postgresql.org/pub/repos/apt noble-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update && apt-get install -y --no-install-recommends \
    git \
    openssh-client \
    sudo \
    python3 \
    postgresql-16 \
    postgresql-client-16 \
    redis-server \
    build-essential \
    cmake \
    pkg-config \
    libssl-dev \
    procps \
    lsof \
    netcat-openbsd \
    unzip \
    xz-utils \
    less \
    vim-tiny \
    bash-completion \
    tmux \
    ffmpeg \
    zsh \
  && rm -rf /var/lib/apt/lists/*

RUN git config --system http.version HTTP/1.1

# Node — official tarball, checksum-verified (same artifact the node:* images ship)
ARG NODE_VERSION=24.16.0
RUN set -eu \
  && case "${TARGETARCH}" in \
       amd64) node_arch="x64" ;; \
       arm64) node_arch="arm64" ;; \
       *) echo "Unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
     esac \
  && archive="node-v${NODE_VERSION}-linux-${node_arch}.tar.xz" \
  && curl -fsSLo /tmp/node.tar.xz "https://nodejs.org/dist/v${NODE_VERSION}/${archive}" \
  && curl -fsSLo /tmp/node-shasums.txt "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" \
  && expected="$(awk -v archive="$archive" '$2 == archive { print $1 }' /tmp/node-shasums.txt)" \
  && [ -n "$expected" ] \
  && echo "${expected}  /tmp/node.tar.xz" | sha256sum -c - \
  && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 --no-same-owner \
  && rm /tmp/node.tar.xz /tmp/node-shasums.txt \
  && ln -sf /usr/local/bin/node /usr/local/bin/nodejs \
  && node --version \
  && npm --version

# Rust toolchain (core-api, oauth dev)
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked \
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --default-toolchain 1.94.1

# bacon — no prebuilt binaries; install to /usr/local/bin (Cursor cloud agents replace image PATH)
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked \
    cargo install --locked bacon \
  && install -m 0755 /usr/local/cargo/bin/bacon /usr/local/bin/bacon \
  && bacon --version

# cargo-sweep — prune stale core/target artifacts on the persistent volume
ARG CARGO_SWEEP_VERSION=0.8.0
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked \
    cargo install --locked --version "${CARGO_SWEEP_VERSION}" cargo-sweep \
  && install -m 0755 /usr/local/cargo/bin/cargo-sweep /usr/local/bin/cargo-sweep \
  && cargo sweep --version

# mprocs — prebuilt binary to /usr/local/bin (same PATH reason as bacon/temporal)
ARG MPROCS_VERSION=0.9.6
RUN set -eu \
  && case "${TARGETARCH}" in \
       amd64) mprocs_arch="x86_64" ;; \
       arm64) mprocs_arch="aarch64" ;; \
       *) echo "Unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
     esac \
  && curl -fsSL "https://github.com/pvolok/mprocs/releases/download/v${MPROCS_VERSION}/mprocs-${MPROCS_VERSION}-linux-${mprocs_arch}-musl.tar.gz" \
    | tar -xz -C /usr/local/bin \
  && mprocs --version

# git-spice — stacked-branch CLI (`gs` / `git-spice`); 0.31.x satisfies >= 0.30.0
ARG GIT_SPICE_VERSION=0.31.2
RUN set -eu \
  && case "${TARGETARCH}" in \
       amd64) git_spice_arch="x86_64"; git_spice_sha256="4fbaffe8b6f69d1effce3bc3050083748ee8765b71fd928a966ad480b2d5d4f0" ;; \
       arm64) git_spice_arch="aarch64"; git_spice_sha256="47492e167fa55a934e615e8e850345d8bb4c42ec6c03158896df7e5bec6559f8" ;; \
       *) echo "Unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
     esac \
  && archive="git-spice.Linux-${git_spice_arch}.tar.gz" \
  && curl -fsSLo /tmp/git-spice.tar.gz \
      "https://github.com/abhinav/git-spice/releases/download/v${GIT_SPICE_VERSION}/${archive}" \
  && echo "${git_spice_sha256}  /tmp/git-spice.tar.gz" | sha256sum -c - \
  && tar -xzf /tmp/git-spice.tar.gz -C /usr/local/bin git-spice \
  && rm /tmp/git-spice.tar.gz \
  && chmod 0755 /usr/local/bin/git-spice \
  && ln -s git-spice /usr/local/bin/gs \
  && git-spice version

# Interactive shell tools. Pin Oh My Zsh to a commit and verify the Starship
# archive so rebuilding the image is deterministic.
ARG OH_MY_ZSH_COMMIT=a5ecff7560b2e26f612032c632a12c75a3048bd0
RUN git init /root/.oh-my-zsh \
  && git -C /root/.oh-my-zsh remote add origin https://github.com/ohmyzsh/ohmyzsh.git \
  && git -C /root/.oh-my-zsh fetch --depth=1 origin "${OH_MY_ZSH_COMMIT}" \
  && git -C /root/.oh-my-zsh checkout --detach FETCH_HEAD \
  && rm -rf /root/.oh-my-zsh/.git

ARG STARSHIP_VERSION=1.26.0
RUN set -eu \
  && case "${TARGETARCH}" in \
       amd64) starship_arch="x86_64"; starship_sha256="b7c232b0e8249d8e55a40beb79c5c43a7d370f3f9408bd215deb0170daeaadf3" ;; \
       arm64) starship_arch="aarch64"; starship_sha256="dc30189378d2f2e287384e8a692d3f95ad1df64cf0e8c36aa9201516028aed6b" ;; \
       *) echo "Unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
     esac \
  && curl -fsSLo /tmp/starship.tar.gz \
      "https://github.com/starship/starship/releases/download/v${STARSHIP_VERSION}/starship-${starship_arch}-unknown-linux-musl.tar.gz" \
  && echo "${starship_sha256}  /tmp/starship.tar.gz" | sha256sum -c - \
  && tar -xzf /tmp/starship.tar.gz -C /usr/local/bin starship \
  && rm /tmp/starship.tar.gz \
  && starship --version

COPY dev/starship.toml /root/.config/starship.toml

# Temporal dev server
RUN curl -sSf https://temporal.download/cli.sh | sh \
  && install -m 0755 /root/.temporalio/bin/temporal /usr/local/bin/temporal \
  && temporal --version

# Qdrant
# The tarball has `qdrant` at the archive root. `--strip-components=1` treats
# that filename as a path component and extracts nothing.
ARG QDRANT_VERSION=1.18.3
RUN set -eu \
  && case "${TARGETARCH}" in \
       amd64) qdrant_target="x86_64-unknown-linux-gnu"; qdrant_sha256="60663a254cf421dba4db45710872895cd3a714fe1e6978f7927923b5cfae4718" ;; \
       arm64) qdrant_target="aarch64-unknown-linux-musl"; qdrant_sha256="1e738b45f90935c383b4076c30f377f390964cb5962b5bff24439812d157dc24" ;; \
       *) echo "Unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
     esac \
  && curl -fsSLo /tmp/qdrant.tar.gz \
      "https://github.com/qdrant/qdrant/releases/download/v${QDRANT_VERSION}/qdrant-${qdrant_target}.tar.gz" \
  && echo "${qdrant_sha256}  /tmp/qdrant.tar.gz" | sha256sum -c - \
  && mkdir -p /opt/qdrant \
  && tar -xzf /tmp/qdrant.tar.gz -C /opt/qdrant \
  && rm /tmp/qdrant.tar.gz

# Elasticsearch 8.x + ICU plugin
ARG ES_VERSION=8.11.3
RUN set -eu \
  && case "${TARGETARCH}" in \
       amd64) es_arch="x86_64" ;; \
       arm64) es_arch="aarch64" ;; \
       *) echo "Unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
     esac \
  && curl -fsSL "https://artifacts.elastic.co/downloads/elasticsearch/elasticsearch-${ES_VERSION}-linux-${es_arch}.tar.gz" \
    | tar -xz -C /opt \
  && mv "/opt/elasticsearch-${ES_VERSION}" /opt/es \
  && /opt/es/bin/elasticsearch-plugin install --batch analysis-icu \
  && groupadd -r elasticsearch \
  && useradd -r -g elasticsearch -d /opt/es -s /usr/sbin/nologin elasticsearch \
  && mkdir -p /opt/es/data /opt/es/logs \
  && chown -R elasticsearch:elasticsearch /opt/es

# 1Password CLI beta — `op environment read` requires >= 2.33.0-beta.02 (stable apt pkg lacks it)
ARG OP_CLI_VERSION=2.39.1-beta.01
RUN set -eu \
  && case "${TARGETARCH}" in \
       amd64) op_arch="amd64" ;; \
       arm64) op_arch="arm64" ;; \
       *) echo "Unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
     esac \
  && curl -sSfLo /tmp/op.zip \
      "https://cache.agilebits.com/dist/1P/op2/pkg/v${OP_CLI_VERSION}/op_linux_${op_arch}_v${OP_CLI_VERSION}.zip" \
  && unzip -q /tmp/op.zip -d /usr/local/bin \
  && rm /tmp/op.zip \
  && op --version

# Google Cloud SDK — gcloud + GKE plugin + kubectl (dust-us / dust-eu aliases)
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
      | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg \
  && echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
    > /etc/apt/sources.list.d/google-cloud-sdk.list \
  && apt-get update && apt-get install -y --no-install-recommends \
    google-cloud-cli \
    google-cloud-cli-gke-gcloud-auth-plugin \
    kubectl \
  && rm -rf /var/lib/apt/lists/* \
  && gcloud version \
  && gke-gcloud-auth-plugin --version \
  && kubectl version --client

# Postgres dev user (databases are created at agent start by init-databases.sh)
RUN service postgresql start \
  && (sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='dev'" | grep -q 1 \
      || sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE USER dev WITH PASSWORD 'dev' SUPERUSER;") \
  && sudo -u postgres psql -c "ALTER USER dev WITH SUPERUSER;" \
  && service postgresql stop

RUN mkdir -p /tmp/dust-infra /opt/temporal /var/lib/dust-dev /root/.config/mprocs \
  && printf '%s\n' \
    '# Sourced via BASH_ENV until infra.sh materializes 1Password + local-dev env.' \
    'return 0 2>/dev/null || true' \
    > /tmp/dust-shell-env.sh \
  && printf '%s\n' \
    '# Dust shared dev container — refreshed by materialize_dev_environment at runtime.' \
    'export BASH_ENV=/tmp/dust-shell-env.sh' \
    '' \
    '# Interactive shells skip BASH_ENV; load materialized secrets here.' \
    'if [ -f /tmp/dust-shell-env.sh ]; then' \
    '  # shellcheck disable=SC1091' \
    '  . /tmp/dust-shell-env.sh' \
    'fi' \
    '' \
    'if [ -f /workspace/dev/bashrc ]; then' \
    '  # shellcheck disable=SC1091' \
    '  . /workspace/dev/bashrc' \
    'fi' \
    > /root/.bashrc \
  && printf '%s\n' \
    'if [ -f ~/.bashrc ]; then' \
    '  # shellcheck disable=SC1091' \
    '  . ~/.bashrc' \
    'fi' \
    > /root/.bash_profile \
  && printf '%s\n' \
    '# Dust shared dev container — refreshed by materialize_dev_environment at runtime.' \
    'export SHELL=/bin/zsh' \
    '' \
    'if [ -f /tmp/dust-shell-env.sh ]; then' \
    '  # shellcheck disable=SC1091' \
    '  . /tmp/dust-shell-env.sh' \
    'fi' \
    '' \
    'if [ -f /workspace/dev/zshrc ]; then' \
    '  # shellcheck disable=SC1091' \
    '  . /workspace/dev/zshrc' \
    'fi' \
    > /root/.zshrc \
  && chsh -s /bin/zsh root

ENV SHELL=/bin/zsh

WORKDIR /workspace
