# Stage 1: rootfs - assemble complete filesystem
FROM ubuntu:noble-20260210.1 AS rootfs

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates curl git unzip xz-utils gnupg lsb-release netcat-openbsd \
  && rm -rf /var/lib/apt/lists/*

# Add gcsfuse repository
RUN curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
  | tee /usr/share/keyrings/cloud.google.asc > /dev/null

RUN GCSFUSE_REPO=$(lsb_release -c -s) \
  && echo "deb [signed-by=/usr/share/keyrings/cloud.google.asc] https://packages.cloud.google.com/apt gcsfuse-$GCSFUSE_REPO main" \
  > /etc/apt/sources.list.d/gcsfuse.list

# Install gcsfuse
RUN apt-get update && apt-get install -y --no-install-recommends gcsfuse \
  && rm -rf /var/lib/apt/lists/*

# Rename ubuntu -> user (keeps uid 1000, E2B expects 'user' account)
RUN usermod -l user -d /home/user -m ubuntu \
  && groupmod -n user ubuntu

# Fluent Bit for telemetry
RUN curl -fsSL https://packages.fluentbit.io/fluentbit.key | gpg --dearmor -o /usr/share/keyrings/fluentbit-keyring.gpg \
  && echo 'deb [signed-by=/usr/share/keyrings/fluentbit-keyring.gpg] https://packages.fluentbit.io/ubuntu/noble noble main' > /etc/apt/sources.list.d/fluent-bit.list \
  && apt-get update && apt-get install -y --no-install-recommends fluent-bit \
  && (getent group systemd-journal || groupadd -r systemd-journal) \
  && usermod -aG systemd-journal user \
  && rm -rf /var/lib/apt/lists/*

# Python via uv (official Astral approach)
# UV handles arch automatically
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
ENV UV_PYTHON_INSTALL_DIR=/opt/python
RUN uv python install 3.14 \
  && uv python pin 3.14 \
  && ln -s "$(uv python find 3.14)" /usr/local/bin/python3 \
  && ln -s "$(uv python find 3.14)" /usr/local/bin/python
ENV VIRTUAL_ENV=/opt/venv
RUN uv venv /opt/venv --python 3.14

# Node.js via official tarball
ARG NODE_VERSION=24.14.0
RUN ARCH=$(dpkg --print-architecture) && \
  if [ "$ARCH" = "amd64" ]; then NODE_ARCH="x64"; else NODE_ARCH="arm64"; fi && \
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" -o node.tar.xz && \
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" -o SHASUMS256.txt && \
  grep "node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz$" SHASUMS256.txt | awk '{print $1 "  node.tar.xz"}' | sha256sum -c - && \
  tar -xJf node.tar.xz -C /usr/local --strip-components=1 && \
  rm node.tar.xz SHASUMS256.txt

# Create user home directory and uv cache with proper permissions
RUN mkdir -p /home/user/.cache/uv && chmod -R 777 /home/user

# Set permissions for venv, npm global, and bin directories
RUN chmod -R 777 /opt/venv && mkdir -p /opt/npm-global /opt/bin && chmod -R 777 /opt/npm-global /opt/bin

# Set up environment via profile.d
RUN printf '%s\n' \
  'export PATH="/opt/bin:/opt/venv/bin:/opt/npm-global/bin:$PATH"' \
  'export VIRTUAL_ENV="/opt/venv"' \
  'export NPM_CONFIG_PREFIX="/opt/npm-global"' \
  > /etc/profile.d/dust-env.sh

WORKDIR /home/user
