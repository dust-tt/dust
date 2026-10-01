#!/usr/bin/env python3
"""Real Linux mounts, optionally driven from macOS through Docker; no FUSE or database mocks."""
import argparse
import concurrent.futures
import contextlib
import errno
import fcntl
import io
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import socket
import subprocess
import tarfile
import tempfile
import time
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]


def api(endpoint, key, path, body=None, method=None):
    request = urllib.request.Request(
        endpoint + path,
        data=None if body is None else json.dumps(body).encode(),
        headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
        method=method or ("GET" if body is None else "POST"),
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            data = response.read()
            return json.loads(data) if data else None
    except urllib.error.HTTPError as error:
        # Print only the status/code, never the request headers or credentials.
        code = json.loads(error.read())["error"]["code"]
        raise RuntimeError(f"{path}: {error.code} {code}") from None


def secret_file(path, contents):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as out:
        out.write(contents)


def timed(results, label, call):
    start = time.monotonic()
    value = call()
    results[label] = round(time.monotonic() - start, 3)
    print(f"{label}: {results[label]:.3f}s", flush=True)
    return value


@contextlib.contextmanager
def mounted(binary, endpoint, key, directory, read_only=False):
    directory.mkdir()
    key_path = directory.parent / (directory.name + ".key")
    secret_file(key_path, key)
    log = open(directory.parent / (directory.name + ".log"), "w+")
    args = [str(binary), "--endpoint", endpoint, "--session-key-file", str(key_path), str(directory)]
    if read_only:
        args.append("--read-only")
    process = subprocess.Popen(args, stdout=log, stderr=log)
    try:
        deadline = time.monotonic() + 30
        while not os.path.ismount(directory):
            if process.poll() is not None or time.monotonic() > deadline:
                log.seek(0)
                raise RuntimeError("mount failed: " + log.read())
            time.sleep(0.05)
        yield directory
    finally:
        if process.poll() is None:
            process.send_signal(signal.SIGTERM)
            try:
                process.wait(timeout=30)
            except subprocess.TimeoutExpired:
                subprocess.run(["fusermount3", "-uz", str(directory)], check=False)
                process.kill()
                process.wait()
        log.close()
        key_path.unlink(missing_ok=True)
        if process.returncode != 0:
            raise RuntimeError(f"mount exited {process.returncode}; see {directory.name}.log")


def expect_errno(codes, operation):
    try:
        operation()
    except OSError as error:
        assert error.errno in codes, (error.errno, codes)
    else:
        raise AssertionError("operation unexpectedly succeeded")


def eventually(operation):
    """Other mounts may retain metadata for up to one second."""
    deadline = time.monotonic() + 1.2
    while True:
        try:
            assert operation() is not False
            return
        except (AssertionError, OSError):
            if time.monotonic() >= deadline:
                raise
            time.sleep(0.01)


def session(endpoint, state, grants):
    return api(endpoint, state["workspace_key"], "/sessions", {"workspace_id": state["workspace_id"], "grants": grants})


def grant(endpoint, state, object_id, value):
    current = api(endpoint, state["workspace_key"], "/objects/grants/list", {
        "workspace_id": state["workspace_id"], "object_id": object_id})
    api(endpoint, state["workspace_key"], "/objects/grants/update", {
        "workspace_id": state["workspace_id"], "object_id": object_id,
        "expected_metadata_revision": current["metadata_revision"], "grants": {"reader": value}})


def exercise(args):
    state_path = args.work / "state.json"
    results = {}
    if args.phase == "exercise":
        server_key = (args.work / "server.key").read_text()
        state = api(args.endpoint, server_key, "/workspaces", {
            "workspace_id": "fuse-" + uuid.uuid4().hex, "root_grants": ["owner"]})
    else:
        state = json.loads(state_path.read_text())
        try:
            api(args.endpoint, state["old_session"], "/sessions/current")
        except RuntimeError as error:
            assert "401 unauthenticated" in str(error)
        else:
            raise AssertionError("old session survived restart")
    owner = session(args.endpoint, state, ["owner"])
    reader = session(args.endpoint, state, ["reader"])
    if args.phase == "exercise":
        work = api(args.endpoint, owner["session_key"], "/objects/mkdir", {"parent_id": state["root_id"], "name": "work"})
        shared = api(args.endpoint, owner["session_key"], "/objects/mkdir", {"parent_id": work["object_id"], "name": "visible"})
        state["shared_id"] = shared["object_id"]
        grant(args.endpoint, state, shared["object_id"], True)
    alias = "visible--" + state["shared_id"]
    with tempfile.TemporaryDirectory(prefix="dfs-mounts-") as temporary:
        base = Path(temporary)
        with mounted(args.binary, args.endpoint, owner["session_key"], base / "owner") as a, \
             mounted(args.binary, args.endpoint, reader["session_key"], base / "reader") as b:
            assert sorted(p.name for p in b.iterdir()) == ["shared"]
            assert sorted(p.name for p in (b / "shared").iterdir()) == [alias]
            shared_a, shared_b = a / "work" / "visible", b / "shared" / alias
            if args.phase == "exercise":
                # Read-only mounting, synthetic parents, unsupported operations, and hidden ancestry.
                with mounted(args.binary, args.endpoint, reader["session_key"], base / "readonly", True) as ro:
                    assert (ro / "shared" / alias).is_dir()
                    expect_errno({errno.EROFS}, lambda: (ro / "shared" / alias / "denied").touch())
                expect_errno({errno.EROFS}, lambda: (b / "shared" / "new").mkdir())
                expect_errno({errno.EROFS}, lambda: shared_b.rename(b / "shared" / "renamed"))
                expect_errno({errno.ENOENT}, lambda: (b / "work").stat())
                expect_errno({errno.EOPNOTSUPP}, lambda: (shared_a / "symlink").symlink_to("target"))
                file_a, file_b = shared_a / "file", shared_b / "file"
                # Negative dentries must allow local creates immediately and remote creates soon.
                expect_errno({errno.ENOENT}, lambda: file_a.stat())
                expect_errno({errno.ENOENT}, lambda: file_b.stat())
                file_a.write_bytes(b"hello world")
                assert file_a.read_bytes() == b"hello world"
                eventually(lambda: file_b.read_bytes() == b"hello world")
                with open(file_a, "r+b", buffering=0) as locked:
                    expect_errno({errno.EOPNOTSUPP}, lambda: fcntl.flock(locked, fcntl.LOCK_EX | fcntl.LOCK_NB))
                    expect_errno({errno.EOPNOTSUPP}, lambda: fcntl.lockf(locked, fcntl.LOCK_EX | fcntl.LOCK_NB))
                failed = os.open(file_a, os.O_WRONLY)
                expect_errno({errno.ENOSPC}, lambda: os.ftruncate(failed, 1024**3 + 1))
                expect_errno({errno.ENOSPC}, lambda: os.fsync(failed))
                expect_errno({errno.ENOSPC}, lambda: os.write(failed, b"must not publish"))
                expect_errno({errno.ENOSPC}, lambda: os.close(failed))
                eventually(lambda: file_b.read_bytes() == b"hello world")
                with open(file_b, "rb", buffering=0) as open_reader:
                    assert open_reader.read() == b"hello world"
                    with open(file_a, "r+b", buffering=0) as writer:
                        writer.seek(6)
                        writer.write(b"DFS")
                        os.fsync(writer.fileno())
                    eventually(lambda: (open_reader.seek(0), open_reader.read())[1] == b"hello DFSld")
                    file_a.write_bytes(b"new")
                    eventually(lambda: (open_reader.seek(0), open_reader.read())[1] == b"new")
                ino = file_b.stat().st_ino
                file_b.rename(shared_b / "moved")
                assert (shared_b / "moved").stat().st_ino == ino
                file_a, file_b = shared_a / "moved", shared_b / "moved"
                with open(file_a, "r+b", buffering=0) as writer:
                    writer.truncate(8)
                    os.fsync(writer.fileno())
                eventually(lambda: file_b.read_bytes() == b"new" + bytes(5))
                file_a.write_bytes(b"")
                def append(path, byte):
                    with open(path, "ab", buffering=0) as writer:
                        writer.write(byte * 16)
                        os.fsync(writer.fileno())
                with concurrent.futures.ThreadPoolExecutor(2) as pool:
                    futures = [pool.submit(append, file_a, b"A"), pool.submit(append, file_b, b"B")]
                    for future in futures:
                        future.result()
                eventually(lambda: file_a.read_bytes() in (b"A"*16+b"B"*16, b"B"*16+b"A"*16))
                os.setxattr(file_b, "user.test", b"\x00binary\xff", flags=os.XATTR_CREATE)
                eventually(lambda: os.getxattr(file_a, "user.test") == b"\x00binary\xff")
                assert "user.test" in os.listxattr(file_a)
                expect_errno({errno.EEXIST}, lambda: os.setxattr(file_a, "user.test", b"x", flags=os.XATTR_CREATE))
                os.removexattr(file_b, "user.test")
                eventually(lambda: expect_errno({errno.ENODATA}, lambda: os.getxattr(file_a, "user.test")))
                file_b.chmod(0o640)
                eventually(lambda: file_a.stat().st_mode & 0o777 == 0o640)
                os.utime(file_b, ns=(1_234_000_000_012, 2_345_000_000_067))
                eventually(lambda: file_a.stat().st_mtime_ns == 2_345_000_000_067)
                (shared_b / "sub").mkdir()
                with open(file_a, "rb", buffering=0) as opened:
                    file_a.rename(shared_a / "sub" / "moved")
                    assert opened.read() in (b"A"*16+b"B"*16, b"B"*16+b"A"*16)
                subfd = os.open(shared_b / "sub", os.O_RDONLY | os.O_DIRECTORY)
                parentfd = os.open("..", os.O_RDONLY | os.O_DIRECTORY, dir_fd=subfd)
                assert os.fstat(parentfd).st_ino == shared_b.stat().st_ino
                os.close(parentfd)
                os.close(subfd)
                expect_errno({errno.ENOTEMPTY}, lambda: (shared_b / "sub").rmdir())
                (shared_b / "sub" / "moved").unlink()
                (shared_b / "sub").rmdir()
                # Revocation must affect warmed inodes and open handles within the cache freshness bound.
                secret = shared_a / "revoked"
                secret.write_bytes(b"secret")
                fd = os.open(shared_b / "revoked", os.O_RDONLY)
                assert os.read(fd, 6) == b"secret"
                grant(args.endpoint, state, state["shared_id"], False)
                eventually(lambda: expect_errno({errno.ENOENT}, lambda: (shared_b / "revoked").stat()))
                os.lseek(fd, 0, os.SEEK_SET)
                expect_errno({errno.ENOENT}, lambda: os.read(fd, 6))
                expect_errno({errno.ENOENT}, lambda: os.fsync(fd))
                try:
                    os.close(fd)
                except OSError:
                    pass
                assert list((b / "shared").iterdir()) == []
                grant(args.endpoint, state, state["shared_id"], True)
                eventually(lambda: (shared_b / "revoked").read_bytes() == b"secret")
                if args.pagination:
                    many = shared_a / "many"
                    many.mkdir()
                    names = [f"{i:03d}-" + "n" * 220 for i in range(80)]
                    for name in names:
                        (many / name).mkdir()
                    eventually(lambda: sorted(os.listdir(shared_b / "many")) == names)
                    eventually(lambda: sorted(os.listdir(shared_b / "many")) == names)
                    for name in names:
                        (many / name).rmdir()
                    many.rmdir()
                    print("pagination across partial buffers and server pages: passed", flush=True)
                # A real tar extraction exercises create/write/chmod/timestamps/close.
                archive = base / "small.tar"
                with tarfile.open(archive, "w") as tar:
                    for index in range(12):
                        contents = bytes([65 + index]) * 4096
                        info = tarfile.TarInfo(f"small/{index:04d}.txt")
                        info.size, info.mode, info.mtime = len(contents), 0o644, 1_700_000_000
                        tar.addfile(info, io.BytesIO(contents))
                timed(results, "untar_12x4KiB", lambda: subprocess.run(
                    ["tar", "--no-same-owner", "-xf", str(archive), "-C", str(shared_a)], check=True))
                with open(shared_b / "small" / "0000.txt", "r+b", buffering=0) as edit:
                    timed(results, "edit_4KiB_fsync", lambda: (edit.write(b"Z" * 4096), os.fsync(edit.fileno())))
            timed(results, "ls", lambda: subprocess.run(["ls", "-la", str(shared_b / "small")], check=True, stdout=subprocess.DEVNULL))
            timed(results, "find", lambda: subprocess.run(["find", str(shared_b)], check=True, stdout=subprocess.DEVNULL))
            content = timed(results, "cat_4KiB", lambda: subprocess.check_output(["cat", str(shared_b / "small" / "0000.txt")]))
            assert content == b"Z" * 4096
            assert sorted(p.name for p in (shared_b / "small").iterdir()) == [f"{i:04d}.txt" for i in range(12)]
            if args.phase == "exercise":
                # Closure invalidates existing handles, too; unmount still frees local bookkeeping.
                fd = os.open(shared_b / "small" / "0000.txt", os.O_RDONLY)
                api(args.endpoint, reader["session_key"], "/sessions/" + reader["session_id"], method="DELETE")
                eventually(lambda: expect_errno({errno.EACCES}, lambda: os.pread(fd, 1, 0)))
                try:
                    os.close(fd)
                except OSError:
                    pass
        state["old_session"] = owner["session_key"]
    secret_file(state_path, json.dumps(state))
    (args.work / (args.phase + "-results.json")).write_text(json.dumps(results, indent=2) + "\n")
    print(args.phase + ": all mounted checks passed", flush=True)


def cleanup_gcs(bucket, prefix, work):
    # Use the same ADC identity as the Rust server, not gcloud's separate account login.
    token = subprocess.run(["gcloud", "auth", "application-default", "print-access-token"],
                           check=True, capture_output=True, text=True).stdout.strip()
    token_path = work / "cleanup-token"
    secret_file(token_path, token)
    try:
        subprocess.run(["gcloud", "storage", "rm", "--recursive", "--access-token-file", str(token_path),
                        f"gs://{bucket}/{prefix}/"], check=True, stdout=subprocess.DEVNULL,
                       stderr=subprocess.PIPE)
    finally:
        token_path.unlink(missing_ok=True)


def host(args):
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    work = Path(tempfile.mkdtemp(prefix="dfs-fuse-e2e-"))
    server_key = secrets.token_hex(32)
    secret_file(work / "server.key", server_key)
    env = dict(os.environ, DFS_SERVER_KEY=server_key)
    for name in list(env):
        if name.startswith("DFS_") and name != "DFS_SERVER_KEY":
            del env[name]
    if args.bucket:
        prefix = args.prefix.rstrip("/") + "/tests/fuse-" + uuid.uuid4().hex
        command = [str(ROOT / "target/debug/dfs-server"), "--listen", f"0.0.0.0:{port}",
                   "--gcs-bucket", args.bucket, "--gcs-prefix", prefix]
        print(f"GCS fixture: gs://{args.bucket}/{prefix}", flush=True)
    else:
        prefix = None
        command = [str(ROOT / "target/debug/examples/local_server"), "--listen", f"0.0.0.0:{port}", "--store", str(work / "object-store")]
    command += ["--write-mode", args.write_mode, "--cache-dir", str(work)]
    server = None
    container_name = "dfs-fuse-test-" + uuid.uuid4().hex
    success = False
    try:
        for phase in ["exercise", "restart"]:
            scratch = work / ("scratch-" + phase)
            scratch.mkdir()
            env["DFS_SCRATCH_DIR"] = str(scratch)
            log = open(work / (phase + "-server.log"), "w")
            server = subprocess.Popen(command, env=env, stdout=log, stderr=log)
            log.close()
            deadline = time.monotonic() + 60
            while True:
                if server.poll() is not None:
                    raise RuntimeError(f"server startup failed; logs in {work}")
                try:
                    urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=1).close()
                    break
                except (OSError, urllib.error.URLError):
                    if time.monotonic() > deadline:
                        raise RuntimeError("server did not become healthy") from None
                    time.sleep(0.1)
            subprocess.run([
                "docker", "run", "--rm", "--name", container_name, "--device", "/dev/fuse", "--cap-add", "SYS_ADMIN", "--security-opt", "apparmor=unconfined",
                "--mount", f"type=bind,src={ROOT},dst=/dfs,readonly",
                "--mount", "type=volume,src=dfs-linux-target,dst=/dfs/target-linux,readonly",
                "--mount", f"type=bind,src={work},dst=/run/dfs",
                "dfs-fuse-dev", "python3", "/dfs/tests/fuse_e2e.py", "--phase", phase,
                "--endpoint", f"http://host.docker.internal:{port}", "--binary", "/dfs/target-linux/debug/dfs-fuse", "--work", "/run/dfs",
                *([] if args.bucket else ["--pagination"]),
            ], check=True, timeout=900)
            if phase == "exercise":
                if args.write_mode == "cached":
                    # Cached acknowledgements promise visibility; explicitly drain before this check.
                    server.send_signal(signal.SIGTERM)
                    server.wait(timeout=70)
                    assert server.returncode == 0
                else:
                    server.kill()
                    server.wait(timeout=10)
                server = None
                shutil.rmtree(scratch)
            else:
                server.send_signal(signal.SIGTERM)
                server.wait(timeout=30)
                assert server.returncode == 0
                server = None
        print("Results: " + str(work), flush=True)
        success = True
    finally:
        subprocess.run(["docker", "rm", "--force", container_name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if server is not None and server.poll() is None:
            server.kill()
            server.wait()
        # No credentials remain in retained reports, including after a failed run.
        (work / "server.key").unlink(missing_ok=True)
        (work / "state.json").unlink(missing_ok=True)
        if prefix and success:
            cleanup_gcs(args.bucket, prefix, work)
        elif prefix:
            print(f"Failed fixture retained: gs://{args.bucket}/{prefix}/", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write-mode", choices=["sync", "cached"], default="sync")
    parser.add_argument("--bucket", help="Use real GCS; otherwise use a local filesystem object store")
    parser.add_argument("--prefix", default="dfs-dev/spolu")
    parser.add_argument("--phase", choices=["exercise", "restart"])
    parser.add_argument("--endpoint")
    parser.add_argument("--binary", type=Path)
    parser.add_argument("--work", type=Path)
    parser.add_argument("--pagination", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.phase:
        exercise(args)
    else:
        host(args)
