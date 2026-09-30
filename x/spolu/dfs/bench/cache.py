#!/usr/bin/env python3
"""Compare synchronous/cached FUSE on an isolated prefix, with foreground and drain timings."""
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
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tests"))
from fuse_e2e import api, cleanup_gcs, mounted, secret_file, session, timed


def digest(source):
    value = hashlib.sha256()
    while chunk := source.read(1024 * 1024):
        value.update(chunk)
    return value.hexdigest()


def exercise(args):
    state = json.loads((args.work / "state.json").read_text())
    owner = session(args.endpoint, state, ["owner"])
    reader = session(args.endpoint, state, ["owner"])
    results = {}
    with tempfile.TemporaryDirectory(prefix="dfs-bench-") as temporary:
        base = Path(temporary)
        archive = base / "corpus.tar.gz"
        shutil.copyfile(args.archive, archive)
        with tarfile.open(archive) as tar:
            expected = {item.name: (item.size, digest(tar.extractfile(item)))
                        for item in tar if item.isfile()}
        with mounted(args.binary, args.endpoint, owner["session_key"], base / "writer") as writer, \
             mounted(args.binary, args.endpoint, reader["session_key"], base / "reader") as reader:
            target, observed = writer / "work", reader / "work"
            timed(results, "untar_seconds", lambda: subprocess.run(
                ["tar", "--no-same-owner", "-xzf", str(archive), "-C", str(target)], check=True))
            timed(results, "ls_seconds", lambda: subprocess.run(
                ["ls", "-lR", str(observed)], stdout=subprocess.DEVNULL, check=True))
            timed(results, "find_seconds", lambda: subprocess.run(
                ["find", str(observed)], stdout=subprocess.DEVNULL, check=True))
            def verify():
                for name, (size, checksum) in expected.items():
                    path = observed / name
                    assert path.stat().st_size == size
                    with path.open("rb") as source:
                        assert digest(source) == checksum, name
            timed(results, "read_verify_seconds", verify)
            path = target / next(iter(expected))
            with path.open("r+b", buffering=0) as edit:
                timed(results, "edit_4KiB_fsync_seconds", lambda: (edit.write(b"Z"*4096), os.fsync(edit.fileno())))
            with (observed / next(iter(expected))).open("rb") as source:
                assert source.read(4096) == b"Z"*4096
        results.update(files=len(expected), content_bytes=sum(size for size, _ in expected.values()))
    (args.work / "results.json").write_text(json.dumps(results, indent=2)+"\n")


def host(args):
    work = Path(tempfile.mkdtemp(prefix="dfs-cache-bench-"))
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    endpoint = f"http://127.0.0.1:{port}"
    key = secrets.token_hex(32)
    env = {name: value for name, value in os.environ.items() if not name.startswith("DFS_")}
    env["DFS_SERVER_KEY"] = key
    prefix = "dfs-dev/spolu/tests/bench-" + uuid.uuid4().hex
    executable = ROOT / "target" / args.profile / "dfs-server"
    command = [str(executable), "--listen", f"0.0.0.0:{port}", "--gcs-bucket", args.bucket,
               "--gcs-prefix", prefix, "--write-mode", args.write_mode, "--cache-dir", str(work),
               "--cache-memory-bytes", str(args.memory_bytes), "--cache-disk-bytes", str(args.disk_bytes),
               "--persist-drain-timeout-seconds", str(args.drain_timeout_seconds)]
    name = "dfs-cache-bench-" + uuid.uuid4().hex
    print(f"Fixture: gs://{args.bucket}/{prefix}/", flush=True)
    print(f"Reports: {work}", flush=True)
    log = open(work / "server.log", "w")
    server = subprocess.Popen(command, env=env, stdout=log, stderr=log)
    success = False
    try:
        import urllib.request
        deadline = time.monotonic()+60
        while True:
            if server.poll() is not None:
                raise RuntimeError("server failed; see report log")
            try:
                urllib.request.urlopen(endpoint+"/health", timeout=1).close()
                break
            except OSError:
                if time.monotonic() > deadline:
                    raise RuntimeError("server startup timeout") from None
                time.sleep(.1)
        state = api(endpoint, key, "/workspaces", {"workspace_id":"bench", "root_grants":["owner"]})
        owner = session(endpoint, state, ["owner"])
        api(endpoint, owner["session_key"], "/objects/mkdir", {"parent_id":state["root_id"], "name":"work"})
        secret_file(work / "state.json", json.dumps(state))
        subprocess.run(["docker", "run", "--rm", "--name", name, "--device", "/dev/fuse", "--cap-add", "SYS_ADMIN", "--security-opt", "apparmor=unconfined",
                        "--mount", f"type=bind,src={ROOT},dst=/dfs,readonly",
                        "--mount", "type=volume,src=dfs-linux-target,dst=/dfs/target-linux,readonly",
                        "--mount", f"type=bind,src={work},dst=/run/dfs",
                        "dfs-fuse-dev", "python3", "/dfs/bench/cache.py", "--inside", "--work", "/run/dfs",
                        "--endpoint", f"http://host.docker.internal:{port}", "--binary", "/dfs/target-linux/debug/dfs-fuse",
                        "--archive", "/dfs/"+str(args.archive.resolve().relative_to(ROOT))], check=True, timeout=args.timeout_seconds)
        results = json.loads((work / "results.json").read_text())
        start = time.monotonic()
        server.send_signal(signal.SIGTERM)
        server.wait(timeout=args.drain_timeout_seconds+10)
        results["drain_seconds"] = round(time.monotonic()-start, 3)
        results["drain_completed"] = server.returncode == 0
        results["write_mode"] = args.write_mode
        results["profile"] = args.profile
        progress = []
        for line in (work / "server.log").read_text().splitlines():
            try:
                fields = json.loads(line).get("fields", {})
            except json.JSONDecodeError:
                continue
            if fields.get("message") == "dfs persistence progress":
                progress.append(fields)
        if progress:
            results["uploaded_versions"] = sum(row.get("uploaded_versions", 0) for row in progress)
            results["coalesced_versions"] = sum(row.get("coalesced_versions", 0) for row in progress)
            results["uploaded_content_bytes"] = sum(row.get("uploaded_bytes", 0) for row in progress)
            results["content_upload_amplification"] = round(results["uploaded_content_bytes"] / (results["content_bytes"] + 4096), 3)
            results["sampled_peak_memory_bytes"] = max(row["memory_bytes"] for row in progress)
            results["sampled_peak_disk_bytes"] = max(row["disk_bytes"] for row in progress)
            results["last_persistence_progress"] = progress[-1]
        (work / "results.json").write_text(json.dumps(results, indent=2)+"\n")
        print(json.dumps(results, indent=2), flush=True)
        success = True
    finally:
        subprocess.run(["docker", "rm", "-f", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if server.poll() is None:
            server.kill()
            server.wait()
        log.close()
        (work / "state.json").unlink(missing_ok=True)
        if success:
            cleanup_gcs(args.bucket, prefix, work)
        else:
            print("Failed fixture retained: " + prefix, flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inside", action="store_true")
    parser.add_argument("--bucket", default="dust-dev-dfs-poc-spolu-20260930")
    parser.add_argument("--write-mode", choices=["sync", "cached"], default="cached")
    parser.add_argument("--profile", choices=["debug", "release"], default="debug")
    parser.add_argument("--archive", type=Path, default=ROOT / "bench/corpus-100.tar.gz")
    parser.add_argument("--memory-bytes", type=int, default=256*1024**2)
    parser.add_argument("--disk-bytes", type=int, default=4*1024**3)
    parser.add_argument("--timeout-seconds", type=int, default=900)
    parser.add_argument("--drain-timeout-seconds", type=int, default=300)
    parser.add_argument("--work", type=Path)
    parser.add_argument("--endpoint")
    parser.add_argument("--binary", type=Path)
    args = parser.parse_args()
    exercise(args) if args.inside else host(args)
