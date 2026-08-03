FROM rust:1.85.0 AS egress-proxy

RUN apt-get update && apt-get install -y cmake

WORKDIR /app

COPY /egress-proxy/ .

# TODO(sandbox-egress): Switch to a smaller runtime image once the service deployment path
# is stable. Existing Rust service Dockerfiles currently run from the Rust image.
RUN cargo build --release --bin egress-proxy

ARG COMMIT_HASH
ARG COMMIT_HASH_LONG
ARG DD_GIT_REPOSITORY_URL=https://github.com/dust-tt/dust
ARG DD_GIT_COMMIT_SHA=${COMMIT_HASH_LONG}
ENV DD_GIT_REPOSITORY_URL=${DD_GIT_REPOSITORY_URL}
ENV DD_GIT_COMMIT_SHA=${DD_GIT_COMMIT_SHA}

EXPOSE 8080

# Set a default command, it will start the egress proxy service if no command is provided.
CMD ["cargo", "run", "--release", "--bin", "egress-proxy"]
