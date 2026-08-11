#!/opt/venv/bin/python
"""Thin FUSE passthrough with Front-owned semantic filesystem mutations.

The backing directory is a hidden gcsfuse mount. This helper deliberately does
not own object transfer, caching, or credentials; it only restores the product
semantics that are lost when sandbox programs mutate GCS paths directly.

Namespace operations and content commits are synchronously sent to Front over
an authenticated, idempotent endpoint. Front owns the GCS + FileResource
mutation and durably records the request before this filesystem returns success.
"""

from __future__ import annotations

import argparse
import errno
import json
import os
import tempfile
import threading
import time
import uuid
from typing import Any
from urllib import error as urllib_error
from urllib import request as urllib_request


HTTP_RETRY_TIMEOUT_SECONDS = 35


class MutationClient:
    def __init__(
        self,
        api_url: str,
        token_file: str,
        mount_kind: str,
        mount_owner_id: str,
    ) -> None:
        self._api_url = api_url
        self._token_file = token_file
        self._mount = {"kind": mount_kind, "id": mount_owner_id}

    def apply(self, operation: str, path: str, **fields: Any) -> None:
        payload = {
            "idempotencyKey": str(uuid.uuid4()),
            "mount": self._mount,
            "operation": operation,
            "path": path.lstrip("/"),
            **fields,
        }
        encoded = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        started_at = time.monotonic()
        delay_seconds = 0.1

        while True:
            try:
                with open(self._token_file, "r", encoding="utf-8") as token_input:
                    token = token_input.read().strip()
                request = urllib_request.Request(
                    self._api_url,
                    data=encoded,
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                    },
                    method="POST",
                )
                with urllib_request.urlopen(request, timeout=10) as response:
                    if response.status == 200:
                        return
                    raise OSError(errno.EIO, f"mutation HTTP {response.status}")
            except urllib_error.HTTPError as http_error:
                if http_error.code in (400, 401, 403, 404):
                    error_number = {
                        400: errno.EINVAL,
                        401: errno.EACCES,
                        403: errno.EACCES,
                        404: errno.ENOENT,
                    }[http_error.code]
                    raise OSError(error_number, self._http_error_message(http_error))
                last_error: Exception = http_error
            except (OSError, urllib_error.URLError) as request_error:
                last_error = request_error

            if time.monotonic() - started_at >= HTTP_RETRY_TIMEOUT_SECONDS:
                raise OSError(errno.EIO, f"filesystem mutation failed: {last_error}")
            time.sleep(delay_seconds)
            delay_seconds = min(delay_seconds * 2, 1.0)

    @staticmethod
    def _http_error_message(http_error: urllib_error.HTTPError) -> str:
        try:
            body = json.loads(http_error.read().decode("utf-8"))
            message = body.get("error", {}).get("message")
            if isinstance(message, str):
                return message
        except (UnicodeDecodeError, json.JSONDecodeError):
            pass
        return f"filesystem mutation HTTP {http_error.code}"


def build_operations_class(operations_base: type, fuse_error: type[Exception]):
    class DustFsOverlay(operations_base):
        def __init__(
            self,
            source: str,
            mutation_client: MutationClient,
            read_only: bool = False,
        ) -> None:
            self._source = os.path.realpath(source)
            self._mutation_client = mutation_client
            self._read_only = read_only
            self._handles: dict[int, dict[str, Any]] = {}
            self._handles_lock = threading.RLock()

        def _path(self, path: str, *, follow_final: bool = True) -> str:
            candidate = os.path.abspath(
                os.path.join(self._source, path.lstrip("/"))
            )
            if os.path.commonpath((self._source, candidate)) != self._source:
                raise fuse_error(errno.EACCES)

            if follow_final:
                resolved = os.path.realpath(candidate)
            elif candidate == self._source:
                resolved = candidate
            else:
                parent = os.path.realpath(os.path.dirname(candidate))
                if os.path.commonpath((self._source, parent)) != self._source:
                    raise fuse_error(errno.EACCES)
                resolved = os.path.join(parent, os.path.basename(candidate))

            if os.path.commonpath((self._source, resolved)) != self._source:
                raise fuse_error(errno.EACCES)
            return resolved

        def _require_writable(self) -> None:
            if self._read_only:
                raise fuse_error(errno.EROFS)

        def _remember_handle(self, file_handle: int, path: str, dirty: bool) -> None:
            with self._handles_lock:
                self._handles[file_handle] = {
                    "path": path,
                    "dirty": dirty,
                    "generation": 1 if dirty else 0,
                }

        def _mark_dirty(self, file_handle: int) -> None:
            with self._handles_lock:
                handle = self._handles.get(file_handle)
                if handle is not None:
                    handle["dirty"] = True
                    handle["generation"] += 1

        def _commit_handle(self, file_handle: int) -> None:
            with self._handles_lock:
                handle = self._handles.get(file_handle)
                if handle is None or not handle["dirty"]:
                    return
                path = handle["path"]
                generation = handle["generation"]
            self._mutation_client.apply("content_committed", path)
            with self._handles_lock:
                handle = self._handles.get(file_handle)
                if (
                    handle is not None
                    and handle["path"] == path
                    and handle["generation"] == generation
                ):
                    handle["dirty"] = False

        def access(self, path: str, mode: int) -> int:
            if not os.access(self._path(path), mode):
                raise fuse_error(errno.EACCES)
            return 0

        def chmod(self, path: str, mode: int) -> int:
            self._require_writable()
            os.chmod(self._path(path, follow_final=False), mode, follow_symlinks=False)
            return 0

        def chown(self, path: str, uid: int, gid: int) -> int:
            self._require_writable()
            os.chown(
                self._path(path, follow_final=False),
                uid,
                gid,
                follow_symlinks=False,
            )
            return 0

        def getattr(self, path: str, file_handle: int | None = None) -> dict[str, Any]:
            metadata = (
                os.fstat(file_handle)
                if file_handle is not None
                else os.lstat(self._path(path, follow_final=False))
            )
            return {
                key: getattr(metadata, key)
                for key in (
                    "st_atime",
                    "st_ctime",
                    "st_gid",
                    "st_mode",
                    "st_mtime",
                    "st_nlink",
                    "st_size",
                    "st_uid",
                )
            }

        def readdir(self, path: str, file_handle: int):
            del file_handle
            yield "."
            yield ".."
            with os.scandir(self._path(path)) as entries:
                for entry in entries:
                    yield entry.name

        def readlink(self, path: str) -> str:
            return os.readlink(self._path(path, follow_final=False))

        def statfs(self, path: str) -> dict[str, Any]:
            metadata = os.statvfs(self._path(path))
            return {
                key: getattr(metadata, key)
                for key in (
                    "f_bavail",
                    "f_bfree",
                    "f_blocks",
                    "f_bsize",
                    "f_favail",
                    "f_ffree",
                    "f_files",
                    "f_flag",
                    "f_frsize",
                    "f_namemax",
                )
            }

        def mkdir(self, path: str, mode: int) -> int:
            self._require_writable()
            del mode
            if os.path.lexists(self._path(path, follow_final=False)):
                raise fuse_error(errno.EEXIST)
            self._mutation_client.apply("mkdir", path)
            return 0

        def rmdir(self, path: str) -> int:
            self._require_writable()
            resolved = self._path(path, follow_final=False)
            if os.listdir(resolved):
                raise fuse_error(errno.ENOTEMPTY)
            self._mutation_client.apply("rmdir", path)
            return 0

        def unlink(self, path: str) -> int:
            self._require_writable()
            resolved = self._path(path, follow_final=False)
            if os.path.isdir(resolved):
                raise fuse_error(errno.EISDIR)
            os.lstat(resolved)
            self._mutation_client.apply("unlink", path)
            return 0

        def rename(self, old: str, new: str) -> int:
            self._require_writable()
            old_resolved = self._path(old, follow_final=False)
            new_resolved = self._path(new, follow_final=False)
            old_stat = os.lstat(old_resolved)
            if os.path.lexists(new_resolved):
                new_stat = os.lstat(new_resolved)
                old_is_directory = os.path.isdir(old_resolved)
                new_is_directory = os.path.isdir(new_resolved)
                if old_is_directory and not new_is_directory:
                    raise fuse_error(errno.ENOTDIR)
                if not old_is_directory and new_is_directory:
                    raise fuse_error(errno.EISDIR)
                if old_is_directory and os.listdir(new_resolved):
                    raise fuse_error(errno.ENOTEMPTY)
                del old_stat, new_stat
            self._mutation_client.apply(
                "rename", old, destinationPath=new.lstrip("/")
            )
            old_prefix = old.rstrip("/") + "/"
            with self._handles_lock:
                for handle in self._handles.values():
                    handle_path = handle["path"]
                    if handle_path == old:
                        handle["path"] = new
                    elif handle_path.startswith(old_prefix):
                        handle["path"] = new.rstrip("/") + handle_path[len(old) :]
            return 0

        def open(self, path: str, flags: int) -> int:
            file_handle = os.open(self._path(path), flags)
            self._remember_handle(file_handle, path, bool(flags & os.O_TRUNC))
            return file_handle

        def create(self, path: str, mode: int, file_info: Any = None) -> int:
            del file_info
            self._require_writable()
            file_handle = os.open(
                self._path(path, follow_final=False),
                os.O_WRONLY | os.O_CREAT | os.O_TRUNC,
                mode,
            )
            self._remember_handle(file_handle, path, True)
            return file_handle

        def read(self, path: str, size: int, offset: int, file_handle: int) -> bytes:
            del path
            return os.pread(file_handle, size, offset)

        def write(
            self,
            path: str,
            data: bytes,
            offset: int,
            file_handle: int,
        ) -> int:
            del path
            self._require_writable()
            written = os.pwrite(file_handle, data, offset)
            self._mark_dirty(file_handle)
            return written

        def truncate(
            self,
            path: str,
            length: int,
            file_handle: int | None = None,
        ) -> int:
            self._require_writable()
            if file_handle is not None:
                os.ftruncate(file_handle, length)
                self._mark_dirty(file_handle)
            else:
                os.truncate(self._path(path), length)
                self._mutation_client.apply("content_committed", path)
            return 0

        def flush(self, path: str, file_handle: int) -> int:
            del path
            os.fsync(file_handle)
            return 0

        def fsync(self, path: str, data_sync: bool, file_handle: int) -> int:
            del path, data_sync
            os.fsync(file_handle)
            self._commit_handle(file_handle)
            return 0

        def release(self, path: str, file_handle: int) -> int:
            del path
            os.close(file_handle)
            self._commit_handle(file_handle)
            with self._handles_lock:
                self._handles.pop(file_handle, None)
            return 0

        def utimens(self, path: str, times: Any = None) -> int:
            self._require_writable()
            os.utime(
                self._path(path, follow_final=False),
                times,
                follow_symlinks=False,
            )
            return 0

        def link(self, target: str, source: str) -> int:
            del target, source
            raise fuse_error(errno.ENOTSUP)

        def mknod(self, path: str, mode: int, device: int) -> int:
            del path, mode, device
            raise fuse_error(errno.ENOTSUP)

        def symlink(self, target: str, source: str) -> int:
            del target, source
            raise fuse_error(errno.ENOTSUP)

        def getxattr(self, path: str, name: str, position: int = 0) -> bytes:
            del path, name, position
            raise fuse_error(errno.ENOTSUP)

        def listxattr(self, path: str) -> list[str]:
            del path
            return []

        def removexattr(self, path: str, name: str) -> int:
            del path, name
            raise fuse_error(errno.ENOTSUP)

        def setxattr(
            self,
            path: str,
            name: str,
            value: bytes,
            options: int,
            position: int = 0,
        ) -> int:
            del path, name, value, options, position
            raise fuse_error(errno.ENOTSUP)

    return DustFsOverlay


def run_self_test() -> None:
    with tempfile.TemporaryDirectory() as temporary_directory:
        source = os.path.join(temporary_directory, "source")
        os.mkdir(source)

        class LocalMutationClient:
            def __init__(self) -> None:
                self.events: list[dict[str, Any]] = []

            def apply(self, operation: str, path: str, **fields: Any) -> None:
                self.events.append({"operation": operation, "path": path, **fields})
                resolved = os.path.join(source, path.lstrip("/"))
                if operation == "mkdir":
                    os.mkdir(resolved)
                elif operation == "rename":
                    os.rename(
                        resolved,
                        os.path.join(source, fields["destinationPath"]),
                    )
                elif operation == "unlink":
                    os.unlink(resolved)
                elif operation == "rmdir":
                    os.rmdir(resolved)

        mutation_client = LocalMutationClient()
        operations_class = build_operations_class(object, OSError)
        operations = operations_class(source, mutation_client)

        operations.mkdir("/folder", 0o755)
        file_handle = operations.create("/folder/frame.tsx", 0o644)
        operations.write("/folder/frame.tsx", b"export default 1", 0, file_handle)
        operations.release("/folder/frame.tsx", file_handle)
        operations.rename("/folder/frame.tsx", "/folder/renamed.tsx")
        operations.unlink("/folder/renamed.tsx")
        operations.rmdir("/folder")

        events = mutation_client.events
        assert [event["operation"] for event in events] == [
            "mkdir",
            "content_committed",
            "rename",
            "unlink",
            "rmdir",
        ]
        assert events[2]["destinationPath"] == "folder/renamed.tsx"


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source")
    parser.add_argument("--mountpoint")
    parser.add_argument("--api-url")
    parser.add_argument("--token-file")
    parser.add_argument("--mount-kind", choices=("conversation", "pod"))
    parser.add_argument("--mount-owner-id")
    parser.add_argument("--read-only", action="store_true")
    parser.add_argument("--foreground", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    return parser.parse_args()


def main() -> None:
    arguments = parse_arguments()
    if arguments.self_test:
        run_self_test()
        return

    required = {
        "source": arguments.source,
        "mountpoint": arguments.mountpoint,
        "api_url": arguments.api_url,
        "token_file": arguments.token_file,
        "mount_kind": arguments.mount_kind,
        "mount_owner_id": arguments.mount_owner_id,
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        raise SystemExit(f"missing required arguments: {', '.join(missing)}")

    from fuse import FUSE, FuseOSError, Operations

    mutation_client = MutationClient(
        arguments.api_url,
        arguments.token_file,
        arguments.mount_kind,
        arguments.mount_owner_id,
    )
    operations_class = build_operations_class(Operations, FuseOSError)
    operations = operations_class(
        arguments.source,
        mutation_client,
        read_only=arguments.read_only,
    )
    FUSE(
        operations,
        arguments.mountpoint,
        foreground=arguments.foreground,
        allow_other=True,
        fsname="dust-fs-overlay",
    )


if __name__ == "__main__":
    main()
