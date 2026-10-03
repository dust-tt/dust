import contextlib
import gzip
import http.client
import json
import os
import socket
import subprocess
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from hive import DEFAULTS, STATE, TOOLS

FRAMES = [b":connect\n\n", b'data: "one"\n\n', b'data: "two"\n\n', b'data: "done"\n\n']
BODY = b"".join(FRAMES)


class Fixture(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        pass

    def do_GET(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        if self.path == "/poll":
            body = json.dumps({"events": ['"one"', '"done"']}).encode()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("X-Accel-Buffering", "no")
        self.send_header("Cache-Control", "no-cache, no-transform")
        self.send_header("Connection", "close")
        if self.path == "/gzip":
            self.send_header("Content-Encoding", "gzip")
        self.end_headers()
        try:
            if self.path == "/gzip":
                self.wfile.write(gzip.compress(BODY))
            elif self.path in {"/idle", "/browser-idle"}:
                self.wfile.write(FRAMES[0])
                self.wfile.flush()
                time.sleep(5)
                self.wfile.write(FRAMES[-1])
            elif self.path == "/browser":
                self.wfile.write(FRAMES[0])
                self.wfile.flush()
                time.sleep(0.5)
                self.wfile.write(FRAMES[1] + FRAMES[-1])
                self.wfile.flush()
                time.sleep(15)
            else:
                for frame in FRAMES:
                    self.wfile.write(frame)
                    self.wfile.flush()
                    time.sleep(0.3)
        except (BrokenPipeError, ConnectionResetError):
            pass
        self.close_connection = True


@contextlib.contextmanager
def proxy(**config):
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    with (
        tempfile.TemporaryDirectory() as directory,
        open(Path(directory) / "proxy.log", "w+") as log,
    ):
        process = subprocess.Popen(
            [
                str(STATE / "venv/bin/mitmdump"),
                "-s",
                str(TOOLS / "buffering_proxy.py"),
                "--listen-host",
                "127.0.0.1",
                "--listen-port",
                str(port),
                "--set",
                f"confdir={directory}",
                "--set",
                "flow_detail=0",
            ],
            env=os.environ | DEFAULTS | {"NS_HIVE_BASE_PORT": "0"} | config,
            stdout=log,
            stderr=log,
        )
        try:
            for _ in range(100):
                if process.poll() is not None:
                    log.seek(0)
                    raise RuntimeError(log.read())
                try:
                    with socket.create_connection(("127.0.0.1", port), timeout=0.1):
                        break
                except OSError:
                    time.sleep(0.05)
            yield port
        finally:
            process.terminate()
            process.wait(timeout=10)
            log.seek(0)
            output = log.read()
            if "Addon error" in output:
                raise AssertionError(output)


class ProxyTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Fixture)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def read_stream(self, proxy_port, path="/events", headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", proxy_port, timeout=8)
        started_seconds = time.monotonic()
        connection.request(
            "GET",
            f"http://127.0.0.1:{self.server.server_port}{path}",
            headers=headers or {},
        )
        response = connection.getresponse()
        first = response.read(1)
        first_byte_seconds = time.monotonic() - started_seconds
        body = first + response.read()
        elapsed_seconds = time.monotonic() - started_seconds
        connection.close()
        return response, body, first_byte_seconds, elapsed_seconds

    def test_pass_and_full_buffering(self):
        for enabled in ("0", "1"):
            with self.subTest(buffer=enabled), proxy(NS_BUFFER=enabled) as port:
                response, body, first_seconds, _ = self.read_stream(port)
                self.assertEqual(body, BODY)
                self.assertIsNone(response.getheader("x-accel-buffering"))
                self.assertEqual(response.getheader("cache-control"), "no-cache")
                if enabled == "1":
                    self.assertGreater(first_seconds, 1)
                else:
                    self.assertLess(first_seconds, 0.6)
                print(f"buffer={enabled}: first byte {first_seconds:.3f}s", flush=True)

    def test_threshold_flushes_remainder(self):
        with proxy(NS_BUFFER_BYTES="20") as port:
            _, body, first_seconds, _ = self.read_stream(port)
            self.assertEqual(body, BODY)
            self.assertGreater(first_seconds, 0.25)
            self.assertLess(first_seconds, 0.9)
            print(
                f"threshold=20: first byte {first_seconds:.3f}s; remainder preserved",
                flush=True,
            )

    def test_idle_timeout_without_next_chunk(self):
        with proxy(NS_BUFFER="0", NS_IDLE_KILL="1") as port:
            _, body, _, elapsed_seconds = self.read_stream(port, "/idle")
            self.assertEqual(body, FRAMES[0])
            self.assertLess(elapsed_seconds, 4)
            print(f"idle disconnect: {elapsed_seconds:.3f}s", flush=True)

    def test_compressed_response_remains_decodable(self):
        with proxy() as port:
            response, body, _, _ = self.read_stream(port, "/gzip")
            self.assertEqual(response.getheader("content-encoding"), "gzip")
            self.assertEqual(gzip.decompress(body), BODY)

    def test_block_sse(self):
        with proxy(NS_BLOCK_SSE="1") as port:
            response, _, _, _ = self.read_stream(
                port, headers={"Accept": "text/event-stream"}
            )
            self.assertEqual(response.status, 403)

    def test_latency_does_not_block_other_requests(self):
        with proxy(NS_BUFFER="0", NS_LATENCY_MS="800") as port:
            started_seconds = time.monotonic()
            results = []
            workers = [
                threading.Thread(target=lambda: results.append(self.read_stream(port)))
                for _ in range(2)
            ]
            for worker in workers:
                worker.start()
            for worker in workers:
                worker.join()
            self.assertEqual(len(results), 2)
            self.assertTrue(all(result[1] == BODY for result in results))
            self.assertTrue(all(result[2] > 0.75 for result in results))
            self.assertLess(time.monotonic() - started_seconds, 1.9)


if __name__ == "__main__":
    unittest.main(verbosity=2)
