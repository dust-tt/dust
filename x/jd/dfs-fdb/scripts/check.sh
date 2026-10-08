set -eu
cd /home/dfs/dfs-fdb
export PATH=/home/dfs/.cargo/bin:$PATH
export FDB_CLIENT_LIB_PATH=/home/dfs/dfs-fdb/runtime/fdb/bin
export LD_LIBRARY_PATH=$FDB_CLIENT_LIB_PATH
export DFS_FDB_TEST_CLUSTER_FILE=/home/dfs/dfs-fdb/runtime/fdb/fdb.cluster
export DFS_FDB_TEST_ES=${DFS_FDB_TEST_ES:-http://127.0.0.1:9200}
mkdir -p results
cargo fmt --all --check
cargo test --locked --release --tests -- --include-ignored --nocapture --test-threads=1 > results/tests.log 2>&1
cargo clippy --locked --all-targets -- -D warnings > results/clippy.log 2>&1
cargo fmt --all --check > results/fmt.log 2>&1
cargo build --locked --release --bins > results/release-build.log 2>&1
