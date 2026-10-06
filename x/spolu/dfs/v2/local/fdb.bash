#!/bin/bash
set -eo pipefail

# Keep the image's cluster/volume setup and add only latency settings to its server invocation.
fdbserver() {
    exec /usr/bin/fdbserver "$@" \
        --knob-commit_transaction_batch_interval_min "${DFS_FDB_COMMIT_BATCH_MIN_SECONDS:-0.001}" \
        --knob-commit_transaction_batch_interval_from_idle "${DFS_FDB_COMMIT_BATCH_IDLE_SECONDS:-0.0005}" \
        --knob-busy_wait_threshold "${DFS_FDB_SERVER_BUSY_WAIT_SECONDS:-0}"
}

source /var/fdb/scripts/fdb.bash
