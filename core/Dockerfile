FROM rust:1.70.0 as core

WORKDIR /app

COPY . .

RUN cargo build --release

EXPOSE 3001

# Set a default command, it will start the API service if no command is provided
CMD ["cargo", "run", "--release", "--bin", "dust-api"]