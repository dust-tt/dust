FROM node:18.15.0 as base

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

# types
WORKDIR /types
COPY /types/package*.json ./
COPY /types/ .
RUN npm ci && \
    npm run build

# connectors
WORKDIR /connectors
COPY ./connectors/package*.json ./
RUN npm ci
COPY ./connectors/ .
RUN npm run build

# front
WORKDIR /front
COPY /front/package*.json ./
RUN npm ci
COPY /front .
RUN FRONT_DATABASE_URI="sqlite:foo.sqlite" npm run build

# core
WORKDIR /core
COPY /core .
RUN cargo build --release

# Set a default command
CMD ["bash"]
