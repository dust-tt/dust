FROM rust:1.85.0 AS core

RUN apt-get update && apt-get install -y vim redis-tools postgresql-client htop cmake

WORKDIR /app

COPY /core/ .

RUN cargo build --release --bin core-api --bin sqlite-worker --bin check_table

EXPOSE 3001

# Set a default command, it will start the API service if no command is provided
CMD ["cargo", "run", "--release", "--bin", "core-api"]
