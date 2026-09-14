# The image the harness runs in. It carries what the acceptance script expects
# from a sandbox: a JavaScript runtime, tar, and the two workload users.
FROM debian:bookworm-slim

RUN apt-get update -qq \
  && apt-get install -y -qq python3 nodejs tar mount procps coreutils util-linux \
  && rm -rf /var/lib/apt/lists/* \
  && useradd -m agent \
  && useradd -m agent-proxied
