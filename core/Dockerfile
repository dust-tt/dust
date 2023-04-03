FROM rust:1.68 AS builder
COPY . .
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install --no-install-recommends -y wget unzip
RUN wget https://github.com/protocolbuffers/protobuf/releases/download/v22.2/protoc-22.2-linux-x86_64.zip
RUN unzip protoc-22.2-linux-x86_64.zip
RUN cp bin/protoc /usr/local/bin/protoc
RUN cp -r include/google /usr/local/include/
RUN protoc --version
RUN cargo fetch
RUN cargo build --release --bin dust-api

FROM debian:11
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt install -y openssl ca-certificates\
    && update-ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /
COPY --from=builder ./target/release/dust-api /dust-api

ENV CORE_DATABASE_URI ""
ENV KEY_JSON_BASE64 ""
EXPOSE 3001
CMD ["/bin/bash", "-c", "echo $KEY_JSON_BASE64 | base64 -d > /key.json && /dust-api"]

