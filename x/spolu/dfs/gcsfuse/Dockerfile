FROM ubuntu:noble-20260210.1

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl ripgrep \
  && rm -rf /var/lib/apt/lists/*

# Install Google's official package, as in dockerfiles/sandbox-bedrock.Dockerfile.
RUN curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
    -o /usr/share/keyrings/cloud.google.asc \
  && printf '%s\n' \
    'deb [signed-by=/usr/share/keyrings/cloud.google.asc] https://packages.cloud.google.com/apt gcsfuse-noble main' \
    > /etc/apt/sources.list.d/gcsfuse.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends gcsfuse \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /mnt/gcs

WORKDIR /root

CMD ["/bin/bash"]
