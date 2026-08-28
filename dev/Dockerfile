# syntax=docker/dockerfile:1.4
# Dust shared dev image — system toolchain and infra binaries only.
# Used by Cursor Cloud Agents, local docker-run, and other AI agents.
# Application source is bind-mounted or checked out at runtime; deps are built in `install`.
#
# Layer cache: keep this file stable — any ENV/RUN edit above the apt layer invalidates
# all downstream steps (apt, rust, temporal, …). Shell/terminal defaults live in
# dev/scripts/env.sh and dev/bashrc (bind-mounted at runtime).
FROM node:24.16.0-bookworm

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
  && echo "deb [signed-by=/usr/share/keyrings/postgresql-keyring.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update && apt-get install -y --no-install-recommends \
    git \
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
    less \
    vim-tiny \
    bash-completion \
    tmux \
  && rm -rf /var/lib/apt/lists/*

# Rust (core-api, oauth) + dev process runners (bacon, mprocs)
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked \
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --default-toolchain 1.94.1 \
  && cargo install bacon mprocs

# Temporal dev server
RUN curl -sSf https://temporal.download/cli.sh | sh \
  && install -m 0755 /root/.temporalio/bin/temporal /usr/local/bin/temporal \
  && temporal --version

# Qdrant
RUN mkdir -p /opt/qdrant \
  && curl -fsSL https://github.com/qdrant/qdrant/releases/download/v1.18.3/qdrant-x86_64-unknown-linux-gnu.tar.gz \
    | tar -xz -C /opt/qdrant --strip-components=1

# Elasticsearch 8.x + ICU plugin
ARG ES_VERSION=8.11.3
RUN curl -fsSL "https://artifacts.elastic.co/downloads/elasticsearch/elasticsearch-${ES_VERSION}-linux-x86_64.tar.gz" \
    | tar -xz -C /opt \
  && mv "/opt/elasticsearch-${ES_VERSION}" /opt/es \
  && /opt/es/bin/elasticsearch-plugin install --batch analysis-icu \
  && groupadd -r elasticsearch \
  && useradd -r -g elasticsearch -d /opt/es -s /usr/sbin/nologin elasticsearch \
  && mkdir -p /opt/es/data /opt/es/logs \
  && chown -R elasticsearch:elasticsearch /opt/es

# 1Password CLI beta — `op environment read` requires >= 2.33.0-beta.02 (stable apt pkg lacks it)
ARG OP_CLI_VERSION=2.39.1-beta.01
RUN curl -sSfLo /tmp/op.zip \
      "https://cache.agilebits.com/dist/1P/op2/pkg/v${OP_CLI_VERSION}/op_linux_amd64_v${OP_CLI_VERSION}.zip" \
  && unzip -q /tmp/op.zip -d /usr/local/bin \
  && rm /tmp/op.zip \
  && op --version

# Postgres dev user (databases are created at agent start by init-databases.sh)
RUN service postgresql start \
  && sudo -u postgres psql -v ON_ERROR_STOP=1 -c "DO $$ BEGIN CREATE USER dev WITH PASSWORD 'dev' SUPERUSER; EXCEPTION WHEN duplicate_object THEN NULL; END $$;" \
  && sudo -u postgres psql -c "ALTER USER dev WITH SUPERUSER;" \
  && service postgresql stop

RUN mkdir -p /tmp/dust-infra /opt/temporal /root/.config/mprocs \
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
    > /root/.bash_profile

WORKDIR /workspace
