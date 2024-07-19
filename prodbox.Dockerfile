FROM node:20.13.0 as base

# Install system dependencies
RUN apt-get update && apt-get install -y vim redis-tools postgresql-client htop curl libpq-dev build-essential

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Install Poppler tools
WORKDIR /tmp/
COPY ./connectors/admin/docker_build/install_poppler_tools.sh ./
RUN chmod +x ./install_poppler_tools.sh && \
    ./install_poppler_tools.sh && \
    ldconfig

# Set library path for Poppler
ENV LD_LIBRARY_PATH=/usr/local/lib

# Set the working directory to /dust
WORKDIR /dust

COPY . .

# Types dependencies
RUN cd types && npm ci

# Connectors dependencies
RUN cd connectors && npm ci

# Front dependencies
RUN cd front && npm ci

# Now copy the rest of the code
RUN cd types && npm run build

RUN cd connectors && npm run build

RUN cd front && FRONT_DATABASE_URI="sqlite:foo.sqlite" npm run build

# Set the default start directory to /dust when SSH into the container
WORKDIR /dust

# Wraning and prompt
RUN echo "echo -e \"\033[0;31mWARNING: This is a PRODUCTION system!\033[0m\"" >> /root/.bashrc
RUN echo "export PS1='\[\e[0;31m\]prodbox\[\e[0m\]:\w\$ '" >> /root/.bashrc

ENV GIT_SSH_COMMAND="ssh -i ~/.ssh/github-deploykey-deploybox"

# Set a default command
CMD ["/dust/prodbox/init.sh"]
