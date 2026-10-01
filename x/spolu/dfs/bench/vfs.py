#!/usr/bin/env python3
"""Run jd's unchanged VFS workloads on local Linux storage and cached DFS backed by GCS."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent.parent / "jd/filesystem-benchmark"
MANIFEST_SHA256 = "67fdf87da1a1b94bc1f6482f00b912c1010d512a907846e5747ba9c893d8a3c1"
sys.path.insert(0, str(ROOT / "tests"))
from fuse_e2e import api, cleanup_gcs, mounted, secret_file, session


def benchmark(corpus, work, label):
    """@cc [owner:spolu,label:testing;performance] preserve-vfs-measurements
    Run the original workloads and validation unchanged. Progress reporting and result snapshots
    MUST happen outside the original measured intervals; failed validation MUST fail the run.
    """
    sys.path.insert(0, "/benchmark")
    import benchmark as original

    class Progress(original.Benchmark):
        def measure(self, *args, **kwargs):
            print(f"Starting: {args[1]} ({args[2]})", file=sys.stderr, flush=True)
            result = super().measure(*args, **kwargs)
            print(" | ".join(self.rows[-1]), file=sys.stderr, flush=True)
            (work / f"{label}.json").write_text(json.dumps(self.rows, indent=2) + "\n")
            return result

    original.Benchmark = Progress
    sys.argv = ["benchmark.py", str(corpus), "--warm-runs", "1"]
    if original.main() != 0:
        raise RuntimeError("VFS benchmark failed validation")


def inside(args):
    work = args.work
    if args.phase == "local":
        with tempfile.TemporaryDirectory(prefix="dfs-vfs-local-") as temporary:
            corpus = Path(temporary) / "corpus"
            shutil.copytree(work / "corpus", corpus)
            benchmark(corpus, work, "local")
        return
    state = json.loads((work / "state.json").read_text())
    owner = session(args.endpoint, state, ["owner"])
    with tempfile.TemporaryDirectory(prefix="dfs-vfs-mount-") as temporary:
        with mounted(Path("/dfs/target-linux/release/dfs-fuse"), args.endpoint,
                     owner["session_key"], Path(temporary) / "dfs") as mount:
            corpus = mount / "work"
            if args.phase == "populate":
                start = time.monotonic()
                subprocess.run(["tar", "--no-same-owner", "-xf", str(work / "corpus.tar"),
                                "-C", str(corpus)], check=True)
                (work / "populate.json").write_text(json.dumps({
                    "untar_seconds": time.monotonic() - start,
                }, indent=2) + "\n")
            else:
                check = hashlib.sha256((corpus / "manifest.json").read_bytes()).hexdigest()
                if check != MANIFEST_SHA256:
                    raise RuntimeError("mounted manifest differs from jd's reference corpus")
                benchmark(corpus, work, "dfs")


def host(args):
    """@cc [owner:spolu,label:testing;security] isolated-vfs-fixture
    Create a fresh GCS prefix and workspace for each run. Never reuse or delete another fixture.
    Drain and cold-start the server before DFS measurements; never reuse local disk cache data.
    Always stop owned processes and remove credentials from retained reports; remote cleanup MUST
    be limited to a successful run's prefix.
    """
    work = args.work or Path(tempfile.mkdtemp(prefix="dfs-jd-vfs-"))
    work.mkdir(parents=True, exist_ok=True)
    if (work / "state.json").exists() or (work / "run.json").exists():
        raise RuntimeError("report directory already contains a run")
    corpus = work / "corpus"
    if not corpus.exists():
        subprocess.run([sys.executable, str(SOURCE / "generate.py"), str(corpus), "--seed", "42"],
                       check=True)
    if hashlib.sha256((corpus / "manifest.json").read_bytes()).hexdigest() != MANIFEST_SHA256:
        raise RuntimeError("manifest differs from jd's reference corpus")
    with tarfile.open(work / "corpus.tar", "w") as archive:
        archive.add(corpus / "docs", arcname="docs")
        archive.add(corpus / "manifest.json", arcname="manifest.json")
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    endpoint = f"http://127.0.0.1:{port}"
    key = secrets.token_hex(32)
    env = {name: value for name, value in os.environ.items() if not name.startswith("DFS_")}
    env["DFS_SERVER_KEY"] = key
    prefix = "dfs-dev/spolu/tests/jd-vfs-" + uuid.uuid4().hex
    container = "dfs-jd-vfs-" + uuid.uuid4().hex
    command = [str(ROOT / "target/release/dfs-server"), "--listen", f"0.0.0.0:{port}",
               "--gcs-bucket", args.bucket, "--gcs-prefix", prefix, "--write-mode", "cached",
               "--persist-drain-timeout-seconds", "600",
               "--metadata-cache-disk-bytes", str(args.metadata_cache_disk_bytes),
               "--read-cache-disk-bytes", str(args.read_cache_disk_bytes)]
    run = {"bucket": args.bucket, "prefix": prefix, "manifest_sha256": MANIFEST_SHA256,
           "write_mode": "cached", "profile": "release", "warm_runs": 1,
           "server_restarted_before_measurement": True,
           "metadata_cache_disk_bytes": args.metadata_cache_disk_bytes,
           "read_cache_disk_bytes": args.read_cache_disk_bytes,
           "read_cache_directory_retained_on_restart": False}
    (work / "run.json").write_text(json.dumps(run, indent=2) + "\n")
    print(f"Reports: {work}\nFixture: gs://{args.bucket}/{prefix}/", flush=True)

    def docker(phase):
        with open(work / f"{phase}.txt", "w") as output:
            subprocess.run([
                "docker", "run", "--rm", "--name", container, "--device", "/dev/fuse",
                "--cap-add", "SYS_ADMIN", "--security-opt", "apparmor=unconfined",
                "--mount", f"type=bind,src={ROOT},dst=/dfs,readonly",
                "--mount", f"type=bind,src={SOURCE},dst=/benchmark,readonly",
                "--mount", "type=volume,src=dfs-linux-target,dst=/dfs/target-linux,readonly",
                "--mount", f"type=bind,src={work},dst=/run/dfs",
                args.image, "python3", "-u", "/dfs/bench/vfs.py", "--phase", phase,
                "--endpoint", f"http://host.docker.internal:{port}", "--work", "/run/dfs",
            ], stdout=output, check=True, timeout=args.timeout_seconds)

    def start_server(phase):
        with open(work / f"{phase}-server.log", "w") as log:
            process = subprocess.Popen(
                command + ["--cache-dir", str(work / f"{phase}-cache")],
                env=env, stdout=log, stderr=log)
        return process

    def healthy(process):
        deadline = time.monotonic() + 90
        while True:
            if process.poll() is not None:
                raise RuntimeError("server exited; see report logs")
            try:
                urllib.request.urlopen(endpoint + "/health", timeout=1).close()
                return
            except OSError:
                if time.monotonic() > deadline:
                    raise RuntimeError("server startup timed out") from None
                time.sleep(.1)

    def drain(process, phase):
        start = time.monotonic()
        process.send_signal(signal.SIGTERM)
        process.wait(timeout=620)
        if process.returncode != 0:
            raise RuntimeError("server did not complete persistence drain")
        run[f"{phase}_drain_seconds"] = time.monotonic() - start
        (work / "run.json").write_text(json.dumps(run, indent=2) + "\n")

    server = None
    success = False
    try:
        docker("local")
        server = start_server("populate")
        healthy(server)
        state = api(endpoint, key, "/workspaces", {"workspace_id": "jd-vfs", "root_grants": ["owner"]})
        owner = session(endpoint, state, ["owner"])
        api(endpoint, owner["session_key"], "/objects/mkdir",
            {"parent_id": state["root_id"], "name": "work"})
        secret_file(work / "state.json", json.dumps(state))
        docker("populate")
        drain(server, "populate")
        server = start_server("benchmark")
        healthy(server)
        docker("benchmark")
        drain(server, "benchmark")
        success = True
    finally:
        subprocess.run(["docker", "rm", "-f", container], stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL)
        if server is not None and server.poll() is None:
            server.kill()
            server.wait()
        (work / "state.json").unlink(missing_ok=True)
        if success:
            cleanup_gcs(args.bucket, prefix, work)
            print("All workloads validated; fixture cleaned.", flush=True)
        else:
            print(f"Failed fixture retained: gs://{args.bucket}/{prefix}/", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work", type=Path)
    parser.add_argument("--bucket", default="dust-dev-dfs-poc-spolu-20260930")
    parser.add_argument("--image", default="dfs-vfs-bench")
    parser.add_argument("--timeout-seconds", type=int, default=3000)
    parser.add_argument("--metadata-cache-disk-bytes", type=int, default=256 * 1024 * 1024,
                        help="Server SST cache target; zero disables it.")
    parser.add_argument("--read-cache-disk-bytes", type=int, default=512 * 1024 * 1024,
                        help="Server immutable-content disk cache; zero disables it.")
    parser.add_argument("--phase", choices=["local", "populate", "benchmark"])
    parser.add_argument("--endpoint")
    arguments = parser.parse_args()
    inside(arguments) if arguments.phase else host(arguments)
