FROM node:18.15.0 as base

RUN apt-get update && apt-get install -y vim redis-tools postgresql-client htop

# Install poppler tools
WORKDIR /tmp/
COPY ./connectors/admin/docker_build/install_poppler_tools.sh ./
RUN chmod +x ./install_poppler_tools.sh
RUN ./install_poppler_tools.sh /usr/local

# Set library path
ENV LD_LIBRARY_PATH=/usr/local/lib

# Build types
WORKDIR /types
COPY /types/package*.json ./
COPY /types/ .
RUN npm ci
RUN npm run build

# Build connectors
WORKDIR /connectors
COPY ./connectors/package*.json ./
RUN npm ci
COPY ./connectors/ .
RUN npm run build

# Build front
WORKDIR /front
COPY /front/package*.json ./
RUN npm ci
COPY /front .
RUN FRONT_DATABASE_URI="sqlite:foo.sqlite" npm run build

# Install Rust and build core
WORKDIR /core
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
RUN source $HOME/.cargo/env
COPY /core .
RUN cargo build --release

# Set a default command
CMD ["bash"]
