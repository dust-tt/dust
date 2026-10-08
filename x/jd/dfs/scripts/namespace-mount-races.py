#!/usr/bin/env python3
import argparse
import collections
import math
import concurrent.futures
import errno
import json
import os
import pathlib
import threading
import time
import uuid


CASES = (
    "move_open_write", "move_rename", "move_delete", "delete_open_write",
    "replace_open_write", "same_version_writes",
)


def wait_for(check, timeout=10):
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        try:
            value = check()
            if value:
                return
        except OSError as error:
            last = error
        time.sleep(0.02)
    raise AssertionError(f"mount convergence deadline exceeded: {last}")


def snapshot(path):
    return {entry.name: entry.read_bytes() for entry in path.iterdir()}


def attempt(operation, barrier=None):
    if barrier:
        barrier.wait(timeout=10)
    started = time.monotonic_ns()
    try:
        operation()
        code = 0
    except OSError as error:
        code = error.errno
    return {"errno": code, "latency_us": (time.monotonic_ns() - started) // 1000}


def trial(a_root, b_root, case, schedule, sample):
    name = f"mount-race-{uuid.uuid4().hex}"
    a, b = a_root / name, b_root / name
    record = {"case": case, "schedule": schedule, "sample": sample, "directory": name, "passed": False}
    handles = []
    try:
        a.mkdir()
        (a / "src").write_bytes(b"seed")
        initial = {"src": b"seed"}
        if case == "replace_open_write":
            (a / "dest").write_bytes(b"dest")
            initial["dest"] = b"dest"
        wait_for(lambda: snapshot(b) == initial)
        fd = None
        if case in ("move_open_write", "delete_open_write", "replace_open_write", "same_version_writes"):
            fd = os.open(b / ("dest" if case == "replace_open_write" else "src"), os.O_RDWR)
            handles.append(fd)
            original_inode = os.fstat(fd).st_ino

        def write(fd, data):
            written = os.pwrite(fd, data, 0)
            if written != len(data):
                raise AssertionError(f"short write: {written}")
            os.fsync(fd)

        if case == "same_version_writes":
            fa = os.open(a / "src", os.O_RDWR)
            handles.append(fa)
            op_a = lambda: write(fa, b"AAAA")
        elif case == "delete_open_write":
            op_a = lambda: os.unlink(a / "src")
        else:
            op_a = lambda: os.rename(a / "src", a / "dest")
        if case == "move_rename":
            op_b = lambda: os.rename(b / "src", b / "other")
        elif case == "move_delete":
            op_b = lambda: os.unlink(b / "src")
        else:
            op_b = lambda: write(fd, b"BBBB")
        if schedule == "a_then_b":
            ra, rb = attempt(op_a), attempt(op_b)
        elif schedule == "b_then_a":
            rb, ra = attempt(op_b), attempt(op_a)
        else:
            barrier = threading.Barrier(2)
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                af, bf = pool.submit(attempt, op_a, barrier), pool.submit(attempt, op_b, barrier)
                ra, rb = af.result(timeout=30), bf.result(timeout=30)
        record.update(a=ra, b=rb)
        pair = ra["errno"], rb["errno"]
        if case in ("move_open_write", "delete_open_write", "replace_open_write"):
            assert pair == (0, 0), pair
            expected = {"dest": b"BBBB"} if case == "move_open_write" else {"dest": b"seed"} if case == "replace_open_write" else {}
            assert os.fstat(fd).st_ino == original_inode
            assert os.pread(fd, 4, 0) == b"BBBB"
        else:
            failure = errno.ESTALE if case == "same_version_writes" else errno.ENOENT
            assert pair in ((0, failure), (failure, 0)), pair
            if schedule == "a_then_b":
                assert pair[0] == 0, pair
            if schedule == "b_then_a":
                assert pair[1] == 0, pair
            if case == "same_version_writes":
                expected = {"src": b"AAAA" if pair[0] == 0 else b"BBBB"}
            elif case == "move_rename":
                expected = {"dest" if pair[0] == 0 else "other": b"seed"}
            else:
                expected = {"dest": b"seed"} if pair[0] == 0 else {}
        settled = time.monotonic_ns()
        wait_for(lambda: snapshot(a) == expected and snapshot(b) == expected)
        record["convergence_us"] = (time.monotonic_ns() - settled) // 1000
        record["final_contents"] = {name: value.decode("ascii") for name, value in expected.items()}
        if case == "replace_open_write":
            assert (b / "dest").stat().st_ino != original_inode
        record["passed"] = True
    except Exception as error:
        record["validation_error"] = repr(error)
    finally:
        close_errors = []
        for fd in handles:
            try:
                os.close(fd)
            except OSError as error:
                close_errors.append(error.errno)
        record["close_errors"] = close_errors
        if close_errors and (case != "same_version_writes" or any(code != errno.ESTALE for code in close_errors)):
            record["passed"] = False
            record["validation_error"] = f"unexpected close errors: {close_errors}"
    return record


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mount-a", type=pathlib.Path, required=True)
    parser.add_argument("--mount-b", type=pathlib.Path, required=True)
    parser.add_argument("--samples", type=int, default=10)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    args = parser.parse_args()
    if not 1 <= args.samples <= 1000:
        parser.error("samples must be 1..1000")
    if args.mount_a.resolve() == args.mount_b.resolve():
        parser.error("two independent mounts required")
    for path in (args.mount_a, args.mount_b):
        if not os.path.ismount(path):
            parser.error(f"not a mountpoint: {path}")
    count = 0
    latencies = collections.defaultdict(list)
    with args.output.open("x") as output:
        for case in CASES:
            for schedule, repetitions in (("a_then_b", 1), ("b_then_a", 1), ("concurrent", args.samples)):
                for sample in range(repetitions):
                    record = trial(args.mount_a / "files", args.mount_b / "files", case, schedule, sample)
                    output.write(json.dumps(record) + "\n")
                    output.flush()
                    if not record["passed"]:
                        raise SystemExit(f"mounted race failed: {record}")
                    count += 1
                    for side in ("a", "b"):
                        result = record[side]
                        latencies[f"{case}/{schedule}/{side}/errno-{result['errno']}"].append(result["latency_us"])
                    latencies[f"{case}/{schedule}/convergence"].append(record["convergence_us"])
        summary = {}
        for key, values in latencies.items():
            values.sort()
            summary[key] = {"count": len(values), **{f"p{p}_us": values[math.ceil((len(values) - 1) * p / 100)] for p in (50, 95, 99)}}
        output.write(json.dumps({"summary": True, "passed": True, "trials": count, "cases": len(CASES), "mode": "default_direct_writes_publication_only_sync", "latency": summary}) + "\n")
    print(f"{count} mounted concurrency trials passed; {args.output}")


if __name__ == "__main__":
    main()
