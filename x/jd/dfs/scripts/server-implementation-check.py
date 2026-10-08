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
parser.add_argument("--output", required=True, type=pathlib.Path)
args = parser.parse_args()
project = subprocess.check_output(
    [
        "curl", "--connect-timeout", "3", "--max-time", "5", "-fsS",
        "-H", "Metadata-Flavor: Google",
        "http://metadata.google.internal/computeMetadata/v1/project/project-id",
    ],
    text=True,
).strip()
if project != "dust-dev":
    raise SystemExit("checks require a GCP VM in dust-dev")
output = args.output.resolve()
if not output.is_relative_to(root / "results"):
    raise SystemExit("output must be beneath this checkout's results directory")
output.mkdir(parents=True, exist_ok=False)
environment = dict(os.environ)
environment["PATH"] = str(pathlib.Path.home() / ".cargo/bin") + os.pathsep + environment["PATH"]
summary = {
    "project": project,
    "started": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "status": "running",
    "steps": [],
}


def save():
    temporary = output / "summary.json.tmp"
    temporary.write_text(json.dumps(summary, indent=2) + "\n")
    temporary.replace(output / "summary.json")


def run(name, command):
    print(name, flush=True)
    started = time.monotonic()
    with (output / f"{name}.log").open("wb") as log:
        result = subprocess.run(command, cwd=root, env=environment, stdout=log, stderr=subprocess.STDOUT, timeout=3600)
    summary["steps"].append({
        "name": name,
        "command": command,
        "exit_code": result.returncode,
        "elapsed_seconds": time.monotonic() - started,
    })
    save()
    if result.returncode:
        raise RuntimeError(f"{name} failed; inspect {name}.log")


save()
try:
    run("source-before", ["python3", "scripts/fingerprint.py"])
    run("rustc", ["rustc", "-Vv"])
    run("kernel", ["uname", "-a"])
    run("cpu", ["lscpu"])
    run("format", ["cargo", "fmt", "--all", "--", "--check"])
    run("tests-default", ["cargo", "test", "--locked", "--release"])
    run("tests-search", ["cargo", "test", "--locked", "--release", "--features", "lexical-search"])
    run("clippy", ["cargo", "clippy", "--locked", "--release", "--all-targets", "--features", "lexical-search", "--", "-D", "warnings"])
    run("build", ["cargo", "build", "--locked", "--release", "--all-targets", "--features", "lexical-search"])
    checker = shutil.which("cc-check", path=environment["PATH"])
    if not checker:
        raise RuntimeError("cc-check must be installed on the cloud VM")
    for index, path in enumerate(["CONTRACTS", "src/lexical/CONTRACTS", "scripts/CONTRACTS"]):
        run(f"contracts-format-{index}", [checker, "format", path])
    for index, path in enumerate([
        "src/memory.rs", "src/store.rs", "src/lexical/ingest.rs",
        "src/lexical/membership.rs", "src/lexical/projection.rs", "src/lexical/ranking.rs",
        "tests/support/namespace_races.rs", "tests/namespace_races.rs", "src/bin/dfs-race-bench.rs", "src/rpc.rs",
    ]):
        run(f"contracts-list-{index}", [checker, "list", path])
    run("source-after", ["python3", "scripts/fingerprint.py"])
    if (output / "source-before.log").read_bytes() != (output / "source-after.log").read_bytes():
        raise RuntimeError("source changed during validation")
    target = pathlib.Path(environment.get("CARGO_TARGET_DIR", root / "target"))
    if not target.is_absolute():
        target = root / target
    summary["binaries"] = {
        name: hashlib.sha256((target / "release" / name).read_bytes()).hexdigest()
        for name in ["dfsd", "dfsctl", "dfs-mount", "dfs-load", "dfs-race-bench"]
    }
    summary["status"] = "passed"
finally:
    if summary["status"] != "passed":
        summary["status"] = "failed"
    summary["finished"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    save()
