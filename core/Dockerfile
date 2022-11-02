FROM rust:1.64.0

WORKDIR /dust-api
COPY . .

# todo, split deps and dust build per
# https://stackoverflow.com/questions/58473606/cache-rust-dependencies-with-docker-build

RUN cargo build --release

EXPOSE 3001

CMD ["target/release/dust-api"]
