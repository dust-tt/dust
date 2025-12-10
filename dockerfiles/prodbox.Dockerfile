FROM node:20.19.2 AS base

# Install system dependencies
RUN apt-get update && apt-get install -y vim redis-tools postgresql-client htop curl libpq-dev build-essential tmux

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Set the working directory to /dust
WORKDIR /dust

COPY . .

# Api client dependencies
RUN cd sdks/js && npm ci

# Connectors dependencies
RUN cd connectors && npm ci

# Front dependencies
RUN cd front && npm ci

# Now copy the rest of the code

RUN cd sdks/js && npm run build

RUN cd connectors && npm run build

RUN cd front \
  && FRONT_DATABASE_URI="sqlite:foo.sqlite" \
  NODE_OPTIONS="--max-old-space-size=8192" \
  npm run build -- --no-lint

# Set the default start directory to /dust when SSH into the container
WORKDIR /dust

# Wraning and prompt
RUN echo "echo -e \"\033[0;31mWARNING: This is a PRODUCTION system!\033[0m\"" >> /root/.bashrc

ENV GIT_SSH_COMMAND="ssh -i ~/.ssh/github-deploykey-deploybox"

# Set a default command
CMD ["/dust/prodbox/init.sh"]
