# Dust

Generative Models App Specification and Execution Engine.

## Command-line Client Quick Start

- [Install Rust](https://www.rust-lang.org/tools/install)
- Clone this repository (`$DUST_PATH` represents the path to the `dust` repository).
- `cd $DUST_PATH/core`
- `cargo build --release --bin dust`
- `alias dust="$DUST_PATH/core/target/release/dust"`
- `dust init new_test_project`
- `cd new_test_project`
- `dust help`

See the [video demo](https://demo.dust.tt) for an explanation of the commands.

## Hosted Dust Quick Start

- [Install Rust](https://www.rust-lang.org/tools/install)
- [Install Node](https://nodejs.org/en/download/)
- Clone this repository (`$DUST_PATH` represents the path to the `dust` repository).
- Run the internal API:
  - `cd $DUST_PATH/code`
  - `cargo run --bin dust-api`
- Setup the Frontend app:
  - `cd $DUST_PATH/front`
  - `npm install`
  - create [`.env.local`](https://discord.com/channels/1021427834230673428/1021427834725609516/1029374475378098227)
- Run the Frontend app:
  - `npm run dev`

## Questions / Help

https://discord.gg/8NJR3zQU5X
