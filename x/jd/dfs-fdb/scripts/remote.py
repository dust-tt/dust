import argparse
import json
import os
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument("node", choices=["a", "b", "f", "client"])
parser.add_argument("command")
parser.add_argument("--fleet", choices=["original", "isolated", "smart-cache"], default="smart-cache")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
runtime = root / "runtime"
runtime.mkdir(exist_ok=True)
prefix = {"original": "dfs-rawkv-jd-20261005", "isolated": "dfs-fdb-independent-20261006", "smart-cache": "dfs-fdb-cache-20261006"}[args.fleet]
instance = f"{prefix}-{args.node}"
machine = json.loads(subprocess.check_output([
    "gcloud", "compute", "instances", "describe", instance,
    "--project", "dust-dev", "--zone", "us-central1-" + ("a" if args.node == "client" else args.node), "--format=json",
]))
if machine["status"] != "RUNNING":
    raise SystemExit(f"{instance} is not running")
address = machine["networkInterfaces"][0]["accessConfigs"][0]["natIP"]
key = Path(os.environ.get("DFS_FDB_SSH_KEY", root.parent / "dfs/cloud/ssh-key"))
command = [
    "ssh", "-i", str(key), "-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
    "-o", "StrictHostKeyChecking=accept-new", "-o", f"UserKnownHostsFile={runtime / 'smart-cache-known_hosts'}",
    f"dfs@{address}", args.command,
]
raise SystemExit(subprocess.call(command))
