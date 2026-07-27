#!/usr/bin/python3
"""Serve root-owned, per-mount GCS tokens to trusted gcsfuse processes."""

import http.server
import socketserver


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/healthz":
            body = b'{"status":"ok"}'
        elif self.path == "/token/mount-0":
            token_path = "/run/dust-gcs/mount-0.json"
            body = self._read_token(token_path)
        elif self.path == "/token/mount-1":
            token_path = "/run/dust-gcs/mount-1.json"
            body = self._read_token(token_path)
        elif self.path == "/token/mount-2":
            token_path = "/run/dust-gcs/mount-2.json"
            body = self._read_token(token_path)
        elif self.path == "/token/mount-3":
            token_path = "/run/dust-gcs/mount-3.json"
            body = self._read_token(token_path)
        else:
            self.send_error(404)
            return

        if body is None:
            self.send_error(404)
            return

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_token(self, token_path):
        try:
            with open(token_path, "rb") as token_file:
                return token_file.read()
        except OSError:
            return None

    def log_message(self, *args):
        # Token URLs and request metadata must not enter sandbox logs.
        pass


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


Server(("127.0.0.1", 987), Handler).serve_forever()
