#!/usr/bin/env bash
set -euo pipefail
run_name="${1:?run name required}"
documents="${2:?document count required}"
[[ "$run_name" =~ ^[a-z0-9-]+$ ]]
[[ "$documents" =~ ^[0-9]+$ ]]
workers="${3:-1}"
[[ "$workers" =~ ^[1-4]$ ]]
base=/opt/gcs-dfs
runtime="$base/$run_name"
test ! -e "$runtime"
python3 "$base/dfs-fdb/experiments/gcs-sync-20261008/setup-runtime.py" "$runtime"
python3 - "$runtime/worker.json" "$run_name" "$workers" <<'PY'
import json,pathlib,sys
path=pathlib.Path(sys.argv[1])
settings=json.loads(path.read_text())
settings['concurrency']=min(64, 128//int(sys.argv[3]))
settings['subscription']='projects/dfs-sim/subscriptions/'+sys.argv[2]
path.write_text(json.dumps(settings))
PY
systemd-run --unit="gcs-dfs-$run_name-server" --setenv=LD_LIBRARY_PATH="$base/fdb/bin" "$base/dfs-fdb/target/release/dfsd-fdb" --cluster-file "$base/fdb/fdb.cluster" --namespace "gcs-dfs-$run_name" --credentials "$runtime/credentials.json" --listen 127.0.0.1:7543 --import-token-hashes "$(cat "$runtime/importers.txt")"
for ((worker=0; worker<workers; worker++)); do
  systemd-run --unit="gcs-dfs-$run_name-worker-$worker" --setenv=NODE_ENV=production --setenv=LOG_LEVEL=warn /usr/local/bin/node "$base/app/simulate.js" --mode worker --config "$runtime/worker.json" --directory "$runtime" --documents "$documents" --workers "$workers" --worker-id "$worker"
done
systemd-run --unit="gcs-dfs-$run_name-publish" /usr/local/bin/node "$base/app/simulate.js" --mode publish --config "$runtime/worker.json" --directory "$runtime" --documents "$documents" --workers "$workers"
