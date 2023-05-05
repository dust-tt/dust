#!/bin/sh

export $(cat .env.local | xargs)

until cargo run --release --bin dust-api
do
    echo "[DUST-CORE-CRASH] Restarting dust-api in 1 second..."
    sleep 1
done