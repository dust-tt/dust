FROM rust:1.85.0 AS egress-proxy

RUN apt-get update && apt-get install -y vim htop cmake

WORKDIR /app

COPY /egress-proxy/ .

# TODO(sandbox-egress): Switch to a smaller runtime image once the service deployment path
# is stable. Existing Rust service Dockerfiles currently run from the Rust image.
RUN cargo build --release --bin egress-proxy

EXPOSE 4443
EXPOSE 8080

# Set a default command, it will start the egress proxy service if no command is provided.
CMD ["cargo", "run", "--release", "--bin", "egress-proxy"]
