"""Exercise the real HTTP server and its Unix shutdown signals."""

import argparse
import json
import os
from pathlib import Path
import select
import signal
import subprocess
import time
import urllib.request


def check_server(binary: Path, stop_signal: signal.Signals) -> None:
    environment = {
        key: value
        for key, value in os.environ.items()
        if key not in {"DFS_GCS_BUCKET", "DFS_GCS_PREFIX", "DFS_SERVER_KEY"}
    }
    process = subprocess.Popen(
        [str(binary), "--listen", "127.0.0.1:0"],
        env={**environment, "RUST_LOG": "info"},
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    try:
        assert process.stderr is not None
        deadline = time.monotonic() + 10
        startup = b""
        while b"\n" not in startup:
            remaining_seconds = deadline - time.monotonic()
            if remaining_seconds <= 0 or not select.select(
                [process.stderr], [], [], remaining_seconds
            )[0]:
                raise TimeoutError("Server did not start within 10 seconds")
            chunk = os.read(process.stderr.fileno(), 65536)
            if not chunk:
                raise RuntimeError(f"Server exited before startup: {startup.decode()}")
            startup += chunk

        address = json.loads(startup.splitlines()[0])["fields"]["address"]
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(f"http://{address}/health", timeout=5) as response:
            assert response.status == 200, response.status
            assert response.headers.get_content_type() == "application/json"
            assert json.load(response) == {"status": "ok"}

        process.send_signal(stop_signal)
        _, stderr = process.communicate(timeout=10)
        assert process.returncode == 0, stderr.decode()
        print(f"PASS: /health and graceful {stop_signal.name}")
    finally:
        if process.poll() is None:
            process.kill()
        process.communicate(timeout=10)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--binary",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "target/debug/dfs-server",
        help="Path to the compiled dfs-server executable.",
    )
    args = parser.parse_args()
    for shutdown_signal in (signal.SIGINT, signal.SIGTERM):
        check_server(args.binary.resolve(), shutdown_signal)
