#!/usr/bin/env bash
# Full deterministic validation suite — everything CI would gate on.
# Run from the project root (x/henry/spreadsheet-engine).
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }

step "cargo fmt --check"
cargo fmt --check

step "cargo clippy (deny warnings)"
cargo clippy --workspace --all-targets -- -D warnings

step "forbidden-API grep (determinism)"
# engine-core must not use clocks or randomness (float formatting goes
# through ryu/serde_json; pinned by the determinism gate below).
! grep -rnE 'std::time::|SystemTime|Instant::now|rand::|thread_rng' crates/engine-core/src \
  || { echo "forbidden API in engine-core"; exit 1; }

step "cargo test (unit + golden + property + differential + evil)"
cargo test --workspace

step "corpus freshness (committed corpus == generator output)"
cargo test -p engine-core --test golden committed_corpus_matches_generator

step "engine-cli release build"
cargo build -p engine-cli --release

step "criterion benches (one validation pass; record numbers with: cargo bench -p engine-core --bench engine)"
# Non-gating on numbers (no baseline yet); --test runs each bench body once,
# so a bench that stops compiling or panics on the corpus fails here.
cargo bench -p engine-core --bench engine -- --test

step "wasm builds (web + nodejs)"
PATH="$PWD/node_modules/.bin:$PATH" npm run build:wasm --silent

step "wasm size gate (warn 1.5 MB gz, fail 2 MB gz)"
node scripts/check-wasm-size.mjs

step "determinism gate (native x2 + wasm, hash compare)"
node scripts/check-determinism.mjs

step "SheetJS differential"
node scripts/diff-sheetjs.mjs

step "generated TS boundary types freshness (ts-rs)"
# Wipe before regenerating so removed Rust types show up as deletions, and
# use --porcelain (not diff) so NEW untracked files also fail the gate.
rm -rf ts/client/src/generated
TS_RS_EXPORT_DIR="$PWD/ts/client/src/generated" \
  cargo test -p engine-core --features ts-rs --lib export_bindings --quiet
generated_count=$(ls ts/client/src/generated | wc -l)
[ "$generated_count" -ge 20 ] \
  || { echo "ts-rs export produced only $generated_count files — the export tests stopped running"; exit 1; }
[ -z "$(git status --porcelain -- ts/client/src/generated)" ] \
  || { git status --porcelain -- ts/client/src/generated; echo "ts/client/src/generated drifted from the Rust types — review and commit"; exit 1; }

step "numfmt golden table freshness"
node scripts/gen-numfmt-table.mjs
git diff --exit-code -- corpus/numfmt_cases.tsv \
  || { echo "numfmt_cases.tsv drifted — review and commit the regenerated table"; exit 1; }

step "TypeScript typecheck"
npx tsc --noEmit

step "vitest (RPC client + worker + kit integration)"
npx vitest run

step "demo app production build (vite)"
npm run app:build --silent

printf '\n\033[1;32mALL CHECKS GREEN\033[0m\n'
