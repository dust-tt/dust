#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test "$(curl -fsS -H 'Metadata-Flavor: Google' http://metadata.google.internal/computeMetadata/v1/project/project-id)" = dust-dev
: "${DFS_RENAME_GCS_PREFIX:?Set a disposable GCS prefix}"
: "${DFS_RENAME_BEFORE_ENGINE:?Set the saved baseline engine source path}"
case "$DFS_RENAME_GCS_PREFIX" in gs://*) ;; *) exit 1 ;; esac
run_id="$(date -u +%Y%m%dT%H%M%S)-$$"
out="$PWD/results/rename-optimization-$run_id"
private="$PWD/runtime/rename-optimization-$run_id"
mkdir -p "$out" "$private" results
printf '%s\n' "$out" > results/latest-rename-optimization-path
cp src/engine.rs "$private/after-engine.rs"
cp tests/core.rs "$private/after-core.rs"
cp tests/core/rename.rs "$private/after-rename.rs"
cp "$DFS_RENAME_BEFORE_ENGINE" "$private/before-engine.rs"
cp "$private/before-engine.rs" src/engine.rs
server_pid=
cleanup() {
  if test -n "$server_pid"; then kill -TERM "$server_pid" 2>/dev/null || true; wait "$server_pid" || true; fi
  cp "$private/after-engine.rs" src/engine.rs
  cp "$private/after-core.rs" tests/core.rs
  cp "$private/after-rename.rs" tests/core/rename.rs
}
trap cleanup EXIT
for variant in before after; do
  cp "$private/$variant-engine.rs" src/engine.rs
  test_source="$private"
  test_variant=after
  if test "$variant" = before && test -n "${DFS_RENAME_BEFORE_TESTS:-}"; then
    test_source="$DFS_RENAME_BEFORE_TESTS"
    test_variant=before
  fi
  cp "$test_source/$test_variant-core.rs" tests/core.rs
  cp "$test_source/$test_variant-rename.rs" tests/core/rename.rs
  cp tests/core.rs "$out/$variant-core.rs"
  cp tests/core/rename.rs "$out/$variant-rename.rs"
  rustfmt --edition 2024 --config skip_children=true src/engine.rs tests/core/rename.rs ../dfs-slate/src/bin/dfs-rename-bench.rs
  cp src/engine.rs "$private/$variant-engine.rs"
  cp src/engine.rs "$out/$variant-engine.rs"
  for backend in rocks slate; do
    package="$PWD"
    if test "$backend" = slate; then package="$PWD/../dfs-slate"; fi
    binaries="$out/binaries/$backend-$variant"
    mkdir -p "$binaries"
    (
      cd "$package"
      cargo fmt --all -- --check > "$out/$backend-$variant-format.log" 2>&1
      cargo test --locked --release > "$out/$backend-$variant-tests.log" 2>&1
      cp target/release/dfsd target/release/dfsctl target/release/dfs-rename-bench "$binaries/"
      if test "$variant" = after; then
        if ! cargo clippy --locked --release --all-targets -- -D warnings > "$out/$backend-clippy-strict.log" 2>&1; then
          cargo clippy --locked --release --all-targets -- -D warnings -A clippy::result_large_err --check-cfg 'cfg(feature, values("lexical-search"))' > "$out/$backend-clippy.log" 2>&1
        fi
      fi
    )
    sha256sum "$binaries"/* >> "$out/binaries.sha256"
  done
done
(
  cd ../dfs-slate
  DFS_TEST_GCS_PREFIX="$DFS_RENAME_GCS_PREFIX/recovery-$run_id" cargo test --locked --release --test recovery gcs_crash_boundaries_and_prefix -- --ignored > "$out/gcs-recovery.log" 2>&1
)
rustc --version > "$out/rustc.txt"
client="$out/binaries/rocks-before"
"$client/dfsctl" provision --directory "$private/credentials" --tenants 2
start_server() {
  RUST_LOG=warn,dfs_rename_bench=info,dfsd=info,dfs_poc::store=info "$server" --db "$database" --credentials "$private/credentials/credentials.json" > "$cell/$1-server.log" 2>&1 &
  server_pid=$!
  for attempt in $(seq 1 600); do
    if "$client/dfsctl" --token-file "$private/credentials/admin.token" metrics > "$cell/$1-metrics.json" 2>/dev/null; then return; fi
    kill -0 "$server_pid"
    sleep 0.2
  done
  return 1
}
for round in 1 2 3; do
  variants="before after"
  if test "$round" = 2; then variants="after before"; fi
  for backend in rocks slate; do
    for variant in $variants; do
      for shape in lateral deeper; do
        name="$backend-$variant-$shape-round-$round"
        cell="$out/cells/$name"
        mkdir -p "$cell"
        server="$out/binaries/$backend-$variant/dfsd"
        database="$private/$name"
        if test "$backend" = slate; then database="$DFS_RENAME_GCS_PREFIX/$run_id/$name"; fi
        sizes=0,100,1000,10000
        depth=0
        if test "$shape" = deeper; then sizes=10000; depth=1; fi
        start_server benchmark
        "$client/dfs-rename-bench" --token-file "$private/credentials/admin.token" --probe-token-file "$private/credentials/admin-1.token" --output "$cell/samples.json" --rounds 1 --sizes "$sizes" --destination-depth-offset "$depth" > "$cell/benchmark.log" 2>&1
        kill -TERM "$server_pid"
        wait "$server_pid"
        server_pid=
        start_server recovery
        "$client/dfsctl" --token-file "$private/credentials/admin.token" view > "$cell/recovered-view.json"
        kill -TERM "$server_pid"
        wait "$server_pid"
        server_pid=
        python3 ../dfs-slate/scripts/report-renames.py "$cell" > "$cell/report.log"
        touch "$cell/complete"
        printf '%s\n' "$name passed"
      done
    done
  done
done
touch "$out/complete"
printf '%s\n' "$out"
