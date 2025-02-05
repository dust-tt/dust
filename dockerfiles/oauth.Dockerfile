FROM rust:1.79.0 as core

RUN apt-get update && apt-get install -y vim redis-tools postgresql-client htop cmake

WORKDIR /app

COPY . .

RUN cargo build --release --bin oauth

EXPOSE 3006

# Set a default command, it will start the oauth service if no command is provided
CMD ["cargo", "run", "--release", "--bin", "oauth"]
