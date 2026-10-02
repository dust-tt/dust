#!/bin/bash
set -eo pipefail

# Keep the image's cluster/volume setup and add only latency settings to its server invocation.
fdbserver() {
    exec /usr/bin/fdbserver "$@" \
        --knob-commit_transaction_batch_interval_min 0.00001 \
        --knob-commit_transaction_batch_interval_from_idle 0.00001 \
        --knob-busy_wait_threshold 0.0001
}

source /var/fdb/scripts/fdb.bash
