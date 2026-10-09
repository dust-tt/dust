import hashlib
import json
import pathlib
import secrets
import sys
import time

base = pathlib.Path(sys.argv[1])
base.mkdir(mode=0o700, parents=True, exist_ok=True)
credentials = []
bindings = []
importers = []
for index in range(64):
    tenant = f"tenant-{index}"
    for role in ["admin", "reader"]:
        token = secrets.token_urlsafe(32)
        digest = hashlib.sha256(token.encode()).hexdigest()
        path = base / f"{role}-{index}.token"
        path.write_text(token)
        path.chmod(0o600)
        credentials.append({"token_hash": digest, "tenant": tenant, "issuer": "simulation", "subject": role, "principal": role, "admin": role == "admin", "scope": None, "expires_ms": int(time.time() * 1000) + 24 * 3600_000})
        if role == "admin":
            importers.append(digest)
            bindings.append({"bucket": "simulated-gcs", "prefix": f"w/{tenant}/", "tenant": tenant, "endpoint": "http://127.0.0.1:7543", "tokenFile": str(path), "readers": ["reader"], "notificationConfigs": ["simulation"]})
(base / "credentials.json").write_text(json.dumps(credentials))
(base / "credentials.json").chmod(0o600)
(base / "importers.txt").write_text(",".join(importers))
(base / "worker.json").write_text(json.dumps({"subscription": "projects/dfs-sim/subscriptions/objects", "pubsubEmulatorHost": "127.0.0.1:8085", "concurrency": 64, "requestTimeoutMs": 30000, "bindings": bindings}))
(base / "phase.json").write_text(json.dumps({"phase": 0}))
