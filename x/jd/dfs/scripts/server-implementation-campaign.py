#!/usr/bin/env python3
import argparse
import datetime
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import time


root = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--checks", type=pathlib.Path, required=True)
parser.add_argument("--bin", type=pathlib.Path, required=True)
parser.add_argument("--output", type=pathlib.Path, required=True)
args = parser.parse_args()
project = subprocess.check_output([
    "curl", "--connect-timeout", "3", "--max-time", "5", "-fsS", "-H", "Metadata-Flavor: Google",
    "http://metadata.google.internal/computeMetadata/v1/project/project-id",
], text=True).strip()
if project != "dust-dev":
    raise SystemExit("campaign requires a dust-dev VM")
checks = json.loads(args.checks.read_text())
if checks["status"] != "passed":
    raise SystemExit("successful compiler/test/contract checks required")
output = args.output.resolve()
if not output.is_relative_to(root / "results"):
    raise SystemExit("output must be beneath this checkout's results")
output.mkdir(parents=True, exist_ok=False)
binary = output / "bin"
binary.mkdir()
for name, expected in checks["binaries"].items():
    source = args.bin / name
    if hashlib.sha256(source.read_bytes()).hexdigest() != expected:
        raise SystemExit(f"binary changed since checks: {name}")
    shutil.copy2(source, binary / name)
environment = {**os.environ, "DFS_BIN": str(binary), "DFS_CHECK_OUTPUT": str(output / "mounted")}
summary = {"project": project, "started": datetime.datetime.now(datetime.timezone.utc).isoformat(), "status": "running", "checks": str(args.checks), "binaries": checks["binaries"], "steps": []}


def save():
    temporary = output / "summary.json.tmp"
    temporary.write_text(json.dumps(summary, indent=2) + "\n")
    temporary.replace(output / "summary.json")


def run(name, command):
    print(name, flush=True)
    started = time.monotonic()
    with (output / f"{name}.log").open("wb") as log:
        result = subprocess.run(command, cwd=root, env=environment, stdout=log, stderr=subprocess.STDOUT, timeout=3600)
    summary["steps"].append({"name": name, "command": command, "exit_code": result.returncode, "elapsed_seconds": time.monotonic() - started})
    save()
    if result.returncode:
        raise RuntimeError(f"{name} failed; inspect {name}.log")


save()
try:
    run("source-before", ["python3", "scripts/fingerprint.py"])
    checked_source = args.checks.parent / "source-after.log"
    if checked_source.read_bytes() != (output / "source-before.log").read_bytes():
        raise RuntimeError("source changed since checks")
    run("mounted", ["bash", "scripts/client-cache-mounted.sh"])
    failure_path = root / "runtime" / f"server-failures-{output.name}"
    run("failures", ["python3", "scripts/failure-scenarios.py", "--bin", str(binary), "--run", str(failure_path)])
    run("failure-export", ["python3", "scripts/collect-run.py", str(failure_path), str(output / "failures")])
    run("benchmark", ["bash", "scripts/benchmark-local.sh"])
    benchmark_path = (root / "results/latest-benchmark.txt").read_text().strip()
    run("benchmark-export", ["python3", "scripts/collect-run.py", benchmark_path, str(output / "benchmark")])
    run("source-after", ["python3", "scripts/fingerprint.py"])
    if (output / "source-before.log").read_bytes() != (output / "source-after.log").read_bytes():
        raise RuntimeError("source changed during campaign")
    summary["status"] = "passed"
finally:
    if summary["status"] != "passed":
        summary["status"] = "failed"
    summary["finished"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    save()
