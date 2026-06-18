FROM node:24.16.0 AS base

# Install system dependencies needed for building
RUN apt-get update && apt-get install -y postgresql-client curl libpq-dev build-essential

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Set the working directory to /dust
WORKDIR /dust

RUN npm install -g npm@11.11.0

COPY . .

# Install dependencies
RUN --mount=type=cache,id=npm-cache,target=/root/.npm npm ci

RUN cd sdks/js && npm run build

RUN cd sparkle && npm run build

RUN cd connectors && npm run build

RUN cd front \
  && FRONT_DATABASE_URI="postgres://fake:fake@localhost:5432/fake" \
  NODE_OPTIONS="--max-old-space-size=8192" \
  npm run build -- --no-lint

WORKDIR /dust

# Ephemeral target: headless job runner for k8s Jobs.
# The entrypoint pulls the latest code from `main` (using the mounted GitHub
# deploy key) then execs the command the k8s Job spec passes as `args`
# (e.g. `npm run migration:apply:pre-deploy --workspace front`).
FROM base AS ephemeral
ENV GIT_SSH_COMMAND="ssh -i ~/.ssh/github-deploykey-deploybox"
ENTRYPOINT ["/bin/bash", "/dust/prodbox/ephemeral-entrypoint.sh"]
CMD ["/bin/bash"]

# Prodbox target: interactive debug environment (default / last stage).
FROM base AS prodbox
RUN apt-get update && apt-get install -y vim redis-tools htop tmux

# Warning and prompt
RUN echo "echo -e \"\033[0;31mWARNING: This is a PRODUCTION system!\033[0m\"" >> /root/.bashrc

ENV GIT_SSH_COMMAND="ssh -i ~/.ssh/github-deploykey-deploybox"

CMD ["/dust/prodbox/init.sh"]
