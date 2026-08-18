#!/usr/bin/env python3
"""A stand-in for Front's sandbox filesystem API, used to mount the daemon locally.

It keeps the node tree in memory and stores blob bytes on local disk, so the
FUSE daemon can be exercised without PostgreSQL or GCS.
"""

import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LOCK = threading.Lock()
NODES = {}
BLOBS = {}
NEXT_ID = [2]
NEXT_BLOB = [1]
PORT = [0]


def now_ms():
    # Real Front stores the time the write was committed. A fixed time in the
    # past would make mtime jump backwards after a commit, which makes tar warn
    # that the file changed while it was read.
    return int(time.time() * 1000)


def add_node(parent_id, name, kind, mode):
    node_id = NEXT_ID[0]
    NEXT_ID[0] += 1
    NODES[node_id] = {
        "id": node_id,
        "parentId": parent_id,
        "name": name,
        "kind": kind,
        "mode": mode,
        "size": 0,
        "contentType": None,
        "blobId": None,
        "createdAtMs": now_ms(),
        "modifiedAtMs": now_ms(),
    }
    return NODES[node_id]


def child_by_name(parent_id, name):
    for node in NODES.values():
        if node["parentId"] == parent_id and node["name"] == name:
            return node
    return None


def error(handler, code):
    body = b"{}"
    handler.send_response(409)
    handler.send_header("x-dust-filesystem-error", code)
    handler.send_header("content-length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def ok(handler, payload):
    body = json.dumps(payload).encode()
    handler.send_response(200)
    handler.send_header("content-type", "application/json")
    handler.send_header("content-length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        pass

    def do_PUT(self):
        # Stands in for the signed GCS upload URL.
        length = int(self.headers.get("content-length", 0))
        data = self.rfile.read(length)
        with LOCK:
            BLOBS[self.path.rsplit("/", 1)[-1]] = data
        self.send_response(200)
        self.send_header("content-length", "0")
        self.end_headers()

    def do_GET(self):
        # Stands in for the signed GCS download URL.
        with LOCK:
            data = BLOBS.get(self.path.rsplit("/", 1)[-1])
        if data is None:
            self.send_response(404)
            self.send_header("content-length", "0")
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        length = int(self.headers.get("content-length", 0))
        request = json.loads(self.rfile.read(length) or b"{}")
        with LOCK:
            self.dispatch(request)

    def dispatch(self, request):
        operation = request.get("operation")
        base = f"http://127.0.0.1:{PORT[0]}"

        if operation == "initialize":
            roots = [node for node in NODES.values() if node["parentId"] is None]
            return ok(self, {"roots": roots})

        if operation == "lookup":
            node = child_by_name(request["parentId"], request["name"])
            return ok(self, {"node": node})

        if operation == "getAttr":
            node = NODES.get(request["nodeId"])
            return ok(self, {"node": node})

        if operation == "readDir":
            children = [
                node
                for node in NODES.values()
                if node["parentId"] == request["nodeId"]
            ]
            children.sort(key=lambda node: node["name"])
            return ok(self, {"nodes": children, "nextAfterName": None})

        if operation == "create":
            if child_by_name(request["parentId"], request["name"]):
                return error(self, "already_exists")
            node = add_node(
                request["parentId"],
                request["name"],
                request["kind"],
                request["mode"],
            )
            return ok(self, {"node": node})

        if operation == "setExecutableBits":
            node = NODES[request["nodeId"]]
            node["mode"] = (node["mode"] & ~0o111) | request["executableBits"]
            return ok(self, {"node": node})

        if operation == "remove":
            node = child_by_name(request["parentId"], request["name"])
            if node is None:
                return error(self, "not_found")
            if any(other["parentId"] == node["id"] for other in NODES.values()):
                return error(self, "not_empty")
            del NODES[node["id"]]
            return ok(self, {})

        if operation == "rename":
            node = child_by_name(request["sourceParentId"], request["sourceName"])
            if node is None:
                return error(self, "not_found")
            existing = child_by_name(
                request["destinationParentId"], request["destinationName"]
            )
            if existing is not None:
                del NODES[existing["id"]]
            node["parentId"] = request["destinationParentId"]
            node["name"] = request["destinationName"]
            return ok(self, {"node": node})

        if operation == "getContent":
            node = NODES[request["nodeId"]]
            url = None
            if node["blobId"] is not None:
                url = f"{base}/blob/{node['blobId']}"
            return ok(
                self,
                {
                    "content": {
                        "blobId": node["blobId"],
                        "downloadUrl": url,
                        "contentType": node["contentType"],
                    }
                },
            )

        if operation == "prepareContentUpload":
            node = NODES[request["nodeId"]]
            if node["blobId"] != request.get("expectedBlobId"):
                return error(self, "stale")
            blob_id = f"blob-{NEXT_BLOB[0]}"
            NEXT_BLOB[0] += 1
            return ok(
                self,
                {
                    "upload": {
                        "blobId": blob_id,
                        "uploadUrl": f"{base}/blob/{blob_id}",
                        "contentType": request["contentType"],
                        "expectedSizeBytes": request["expectedSizeBytes"],
                        "headers": {
                            "content-length": str(request["expectedSizeBytes"]),
                            "x-goog-if-generation-match": "0",
                        },
                    }
                },
            )

        if operation == "commitContentUpload":
            node = NODES[request["nodeId"]]
            if node["blobId"] != request.get("expectedBlobId"):
                return error(self, "stale")
            stored = BLOBS.get(request["blobId"])
            if stored is None or len(stored) != request["expectedSizeBytes"]:
                return error(self, "invalid_operation")
            node["blobId"] = request["blobId"]
            node["size"] = request["expectedSizeBytes"]
            node["contentType"] = request["contentType"]
            node["modifiedAtMs"] = now_ms()
            return ok(self, {"node": node})

        return error(self, "invalid_operation")


def main():
    add_node(None, "conversation-abc", "directory", 0o755)
    add_node(None, "pod-xyz", "directory", 0o755)
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    PORT[0] = server.server_address[1]
    # The port is chosen by the operating system, so the caller learns it here.
    with open(os.environ.get("DUST_FRONT_PORT_FILE", "/tmp/front-port"), "w") as handle:
        handle.write(str(PORT[0]))
    server.serve_forever()


if __name__ == "__main__":
    main()
