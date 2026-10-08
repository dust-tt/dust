import hashlib
import json
import secrets
import socket
import subprocess
import time
from pathlib import Path


class DFS:
    def __init__(self, binaries, root, timeout_seconds=60):
        self.binaries = Path(binaries).resolve()
        self.root = root
        self.timeout_seconds = timeout_seconds
        self.process = None
        self.log = None
        self.credentials = root / "credentials"
        self.credentials.mkdir(mode=0o700)
        subprocess.run(
            [
                str(self.binaries / "dfsctl"),
                "provision",
                "--directory",
                str(self.credentials),
                "--tenants",
                "2",
            ],
            check=True,
            capture_output=True,
            timeout=timeout_seconds,
        )
        self.identities = json.loads(
            (self.credentials / "credentials.json").read_text()
        )
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            self.port = sock.getsockname()[1]
        self.endpoint = f"http://127.0.0.1:{self.port}"

    def start(self):
        self.log = (self.root / "server.log").open("a")
        self.process = subprocess.Popen(
            [
                str(self.binaries / "dfsd"),
                "--listen",
                f"127.0.0.1:{self.port}",
                "--db",
                str(self.root / "db"),
                "--credentials",
                str(self.credentials / "credentials.json"),
            ],
            stdout=self.log,
            stderr=self.log,
        )
        deadline_seconds = time.monotonic() + 20
        while time.monotonic() < deadline_seconds:
            if self.process.poll() is not None:
                raise RuntimeError(
                    "DFS exited during startup; inspect private server.log"
                )
            with socket.socket() as sock:
                sock.settimeout(0.1)
                if sock.connect_ex(("127.0.0.1", self.port)) == 0:
                    return
            time.sleep(0.05)
        raise TimeoutError("DFS startup timed out")

    def stop(self):
        if self.process is not None and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=20)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()
                raise TimeoutError("DFS failed to shut down cleanly")
        if self.log is not None:
            self.log.close()

    def execute(self, identity, args):
        result = subprocess.run(
            [
                str(self.binaries / "dfsctl"),
                "--endpoint",
                self.endpoint,
                "--token-file",
                str(self.credentials / f"{identity}.token"),
                *args,
            ],
            check=False,
            capture_output=True,
            text=True,
            timeout=self.timeout_seconds,
        )
        if result.returncode:
            raise RuntimeError(
                f"DFS operation failed for {identity}: {result.stderr.strip()}"
            )
        return json.loads(result.stdout)

    def view(self, identity):
        return self.execute(identity, ["view"])

    def call(self, identity, value, command="call"):
        path = self.root / f"request-{secrets.token_hex(8)}.json"
        try:
            path.write_text(json.dumps(value))
            return self.execute(identity, [command, "--json", str(path)])
        finally:
            path.unlink(missing_ok=True)

    def mutate(self, kind, value):
        return self.call("admin", {kind: value}, "mutate")

    def grant(self, node, subject, verbs):
        return self.mutate("Grant", {"node": node, "subject": subject, "verbs": verbs})

    def member(self, principal, present):
        return self.mutate(
            "Member",
            {"group": "search-team", "principal": principal, "present": present},
        )

    def import_tree(self, source, identity="admin"):
        return self.execute(
            identity, ["import", "--source", str(source), "--name", "corpus"]
        )

    def scoped_identity(self, scope):
        alice = self.identities[1]
        token = secrets.token_hex(32)
        path = self.credentials / "scoped.token"
        with path.open("x") as stream:
            path.chmod(0o600)
            stream.write(token)
        self.identities = [
            *self.identities,
            {
                **alice,
                "token_hash": hashlib.sha256(token.encode()).hexdigest(),
                "scope": scope,
            },
        ]
        (self.credentials / "credentials.json").write_text(json.dumps(self.identities))

    def additional_identity(self, name, expires_ms=None):
        token = secrets.token_hex(32)
        path = self.credentials / f"{name}.token"
        with path.open("x") as stream:
            path.chmod(0o600)
            stream.write(token)
        template = self.identities[1]
        self.identities = [
            *self.identities,
            {
                **template,
                "subject": name,
                "principal": secrets.token_hex(16),
                "token_hash": hashlib.sha256(token.encode()).hexdigest(),
                "expires_ms": template["expires_ms"]
                if expires_ms is None
                else expires_ms,
            },
        ]
        (self.credentials / "credentials.json").write_text(json.dumps(self.identities))


def paths_from_view(view):
    nodes = {row["node"]["id"]: row for row in view["nodes"]}
    paths = {}
    for node_id, row in nodes.items():
        parts = [row["visible_name"]]
        parent = row["visible_parent"]
        while parent is not None:
            ancestor = nodes[parent]
            parts.append(ancestor["visible_name"])
            parent = ancestor["visible_parent"]
        path = "/".join(reversed(parts))
        paths[node_id] = "/" + (path if parts[-1] == "files" else "shared/" + path)
    return paths
