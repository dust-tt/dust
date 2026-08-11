#!/opt/venv/bin/python
"""Routed FUSE passthrough with Front-owned semantic filesystem mutations.

The backing directories are hidden gcsfuse mounts. This helper deliberately
does not own object transfer, caching, or credentials; it only restores the
product semantics that are lost when sandbox programs mutate GCS paths
directly. Conversation and pod directories share this one FUSE superblock so a
cross-mount ``mv`` reaches Front as one rename instead of copy plus unlink.

Namespace operations and content commits are synchronously sent to Front over
an authenticated, idempotent endpoint. Front owns the GCS + FileResource
mutation and durably records the request before this filesystem returns success.
"""

from __future__ import annotations

import argparse
import errno
import json
import os
import stat
import tempfile
import threading
import time
import uuid
from dataclasses import dataclass
from typing import Any
from urllib import error as urllib_error
from urllib import request as urllib_request


HTTP_RETRY_TIMEOUT_SECONDS = 35


@dataclass(frozen=True)
class MountTarget:
    name: str
    source: str
    kind: str
    owner_id: str
    read_only: bool
    legacy_name: str | None

    @property
    def mount(self) -> dict[str, str]:
        return {"kind": self.kind, "id": self.owner_id}


class MutationClient:
    def __init__(self, api_url: str, token_file: str) -> None:
        self._api_url = api_url
        self._token_file = token_file

    def apply(
        self,
        mount: dict[str, str],
        operation: str,
        path: str,
        **fields: Any,
    ) -> None:
        payload = {
            "idempotencyKey": str(uuid.uuid4()),
            "mount": mount,
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
            mounts: list[MountTarget],
            mutation_client: MutationClient,
        ) -> None:
            if not mounts or len(mounts) > 2:
                raise ValueError("the Dust filesystem requires one or two mounts")
            if len({mount.name for mount in mounts}) != len(mounts):
                raise ValueError("mount names must be unique")

            self._mounts = {
                mount.name: MountTarget(
                    name=mount.name,
                    source=os.path.realpath(mount.source),
                    kind=mount.kind,
                    owner_id=mount.owner_id,
                    read_only=mount.read_only,
                    legacy_name=mount.legacy_name,
                )
                for mount in mounts
            }
            self._aliases = {
                mount.legacy_name: mount.name
                for mount in mounts
                if mount.legacy_name is not None
            }
            if set(self._mounts).intersection(self._aliases):
                raise ValueError("legacy mount names must not shadow canonical names")
            self._mutation_client = mutation_client
            self._handles: dict[int, dict[str, Any]] = {}
            self._handles_lock = threading.RLock()

        def _resolve(
            self, path: str, *, follow_final: bool = True
        ) -> tuple[MountTarget, str, str]:
            parts = path.lstrip("/").split("/", 1)
            if not parts[0]:
                raise fuse_error(errno.EBUSY)

            canonical_name = self._aliases.get(parts[0], parts[0])
            mount = self._mounts.get(canonical_name)
            if mount is None:
                raise fuse_error(errno.ENOENT)
            relative_path = parts[1] if len(parts) == 2 else ""
            candidate = os.path.abspath(os.path.join(mount.source, relative_path))
            if os.path.commonpath((mount.source, candidate)) != mount.source:
                raise fuse_error(errno.EACCES)

            if follow_final:
                resolved = os.path.realpath(candidate)
            elif candidate == mount.source:
                resolved = candidate
            else:
                parent = os.path.realpath(os.path.dirname(candidate))
                if os.path.commonpath((mount.source, parent)) != mount.source:
                    raise fuse_error(errno.EACCES)
                resolved = os.path.join(parent, os.path.basename(candidate))

            if os.path.commonpath((mount.source, resolved)) != mount.source:
                raise fuse_error(errno.EACCES)
            return mount, relative_path, resolved

        def _require_writable(self, mount: MountTarget) -> None:
            if mount.read_only:
                raise fuse_error(errno.EROFS)

        @staticmethod
        def _metadata(metadata: os.stat_result) -> dict[str, Any]:
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

        @staticmethod
        def _synthetic_metadata(mode: int, size: int = 0) -> dict[str, Any]:
            now = time.time()
            return {
                "st_atime": now,
                "st_ctime": now,
                "st_gid": os.getgid(),
                "st_mode": mode,
                "st_mtime": now,
                "st_nlink": 2,
                "st_size": size,
                "st_uid": os.getuid(),
            }

        def _remember_handle(
            self,
            file_handle: int,
            mount: MountTarget,
            path: str,
            dirty: bool,
        ) -> None:
            with self._handles_lock:
                self._handles[file_handle] = {
                    "mount": mount,
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
                mount = handle["mount"]
                path = handle["path"]
                generation = handle["generation"]
            self._mutation_client.apply(mount.mount, "content_committed", path)
            with self._handles_lock:
                handle = self._handles.get(file_handle)
                if (
                    handle is not None
                    and handle["mount"] == mount
                    and handle["path"] == path
                    and handle["generation"] == generation
                ):
                    handle["dirty"] = False

        def access(self, path: str, mode: int) -> int:
            if path == "/":
                return 0
            mount, _, resolved = self._resolve(path)
            if mode & os.W_OK and mount.read_only:
                raise fuse_error(errno.EACCES)
            if not os.access(resolved, mode):
                raise fuse_error(errno.EACCES)
            return 0

        def chmod(self, path: str, mode: int) -> int:
            mount, _, resolved = self._resolve(path, follow_final=False)
            self._require_writable(mount)
            os.chmod(resolved, mode, follow_symlinks=False)
            return 0

        def chown(self, path: str, uid: int, gid: int) -> int:
            mount, _, resolved = self._resolve(path, follow_final=False)
            self._require_writable(mount)
            os.chown(
                resolved,
                uid,
                gid,
                follow_symlinks=False,
            )
            return 0

        def getattr(self, path: str, file_handle: int | None = None) -> dict[str, Any]:
            if file_handle is not None:
                return self._metadata(os.fstat(file_handle))
            if path == "/":
                return self._synthetic_metadata(stat.S_IFDIR | 0o777)
            name = path.lstrip("/")
            if "/" not in name and name in self._aliases:
                target = self._aliases[name]
                return self._synthetic_metadata(stat.S_IFLNK | 0o777, len(target))
            _, _, resolved = self._resolve(path, follow_final=False)
            return self._metadata(os.lstat(resolved))

        def readdir(self, path: str, file_handle: int):
            del file_handle
            yield "."
            yield ".."
            if path == "/":
                yield from self._mounts
                yield from self._aliases
                return
            _, _, resolved = self._resolve(path)
            with os.scandir(resolved) as entries:
                for entry in entries:
                    yield entry.name

        def readlink(self, path: str) -> str:
            name = path.lstrip("/")
            if "/" not in name and name in self._aliases:
                return self._aliases[name]
            _, _, resolved = self._resolve(path, follow_final=False)
            return os.readlink(resolved)

        def statfs(self, path: str) -> dict[str, Any]:
            if path == "/":
                source = next(iter(self._mounts.values())).source
            else:
                _, _, source = self._resolve(path)
            metadata = os.statvfs(source)
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
            del mode
            mount, relative_path, resolved = self._resolve(path, follow_final=False)
            self._require_writable(mount)
            if not relative_path:
                raise fuse_error(errno.EBUSY)
            if os.path.lexists(resolved):
                raise fuse_error(errno.EEXIST)
            self._mutation_client.apply(mount.mount, "mkdir", relative_path)
            return 0

        def rmdir(self, path: str) -> int:
            mount, relative_path, resolved = self._resolve(path, follow_final=False)
            self._require_writable(mount)
            if not relative_path:
                raise fuse_error(errno.EBUSY)
            if os.listdir(resolved):
                raise fuse_error(errno.ENOTEMPTY)
            self._mutation_client.apply(mount.mount, "rmdir", relative_path)
            return 0

        def unlink(self, path: str) -> int:
            mount, relative_path, resolved = self._resolve(path, follow_final=False)
            self._require_writable(mount)
            if not relative_path:
                raise fuse_error(errno.EBUSY)
            if os.path.isdir(resolved):
                raise fuse_error(errno.EISDIR)
            os.lstat(resolved)
            self._mutation_client.apply(mount.mount, "unlink", relative_path)
            return 0

        def rename(self, old: str, new: str) -> int:
            old_mount, old_path, old_resolved = self._resolve(
                old, follow_final=False
            )
            new_mount, new_path, new_resolved = self._resolve(
                new, follow_final=False
            )
            self._require_writable(old_mount)
            self._require_writable(new_mount)
            if not old_path or not new_path:
                raise fuse_error(errno.EBUSY)
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
                old_mount.mount,
                "rename",
                old_path,
                destinationMount=new_mount.mount,
                destinationPath=new_path,
            )
            old_prefix = old_path.rstrip("/") + "/"
            with self._handles_lock:
                for handle in self._handles.values():
                    if handle["mount"] != old_mount:
                        continue
                    handle_path = handle["path"]
                    if handle_path == old_path:
                        handle["mount"] = new_mount
                        handle["path"] = new_path
                    elif handle_path.startswith(old_prefix):
                        handle["mount"] = new_mount
                        handle["path"] = (
                            new_path.rstrip("/") + handle_path[len(old_path) :]
                        )
            return 0

        def open(self, path: str, flags: int) -> int:
            mount, relative_path, resolved = self._resolve(path)
            if flags & os.O_TRUNC:
                self._require_writable(mount)
            file_handle = os.open(resolved, flags)
            self._remember_handle(
                file_handle, mount, relative_path, bool(flags & os.O_TRUNC)
            )
            return file_handle

        def create(self, path: str, mode: int, file_info: Any = None) -> int:
            del file_info
            mount, relative_path, resolved = self._resolve(path, follow_final=False)
            self._require_writable(mount)
            if not relative_path:
                raise fuse_error(errno.EBUSY)
            file_handle = os.open(
                resolved,
                os.O_WRONLY | os.O_CREAT | os.O_TRUNC,
                mode,
            )
            self._remember_handle(file_handle, mount, relative_path, True)
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
            with self._handles_lock:
                handle = self._handles.get(file_handle)
            if handle is None:
                raise fuse_error(errno.EBADF)
            self._require_writable(handle["mount"])
            written = os.pwrite(file_handle, data, offset)
            self._mark_dirty(file_handle)
            return written

        def truncate(
            self,
            path: str,
            length: int,
            file_handle: int | None = None,
        ) -> int:
            if file_handle is not None:
                with self._handles_lock:
                    handle = self._handles.get(file_handle)
                if handle is None:
                    raise fuse_error(errno.EBADF)
                self._require_writable(handle["mount"])
                os.ftruncate(file_handle, length)
                self._mark_dirty(file_handle)
            else:
                mount, relative_path, resolved = self._resolve(path)
                self._require_writable(mount)
                os.truncate(resolved, length)
                self._mutation_client.apply(
                    mount.mount, "content_committed", relative_path
                )
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
            mount, _, resolved = self._resolve(path, follow_final=False)
            self._require_writable(mount)
            os.utime(
                resolved,
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
        conversation_source = os.path.join(temporary_directory, "conversation")
        pod_source = os.path.join(temporary_directory, "pod")
        os.mkdir(conversation_source)
        os.mkdir(pod_source)
        mounts = [
            MountTarget(
                name="conversation-conv1",
                source=conversation_source,
                kind="conversation",
                owner_id="conv1",
                read_only=False,
                legacy_name="conversation",
            ),
            MountTarget(
                name="pod-pod1",
                source=pod_source,
                kind="pod",
                owner_id="pod1",
                read_only=False,
                legacy_name="pod",
            ),
        ]
        sources = {
            (mount.kind, mount.owner_id): mount.source for mount in mounts
        }

        class LocalMutationClient:
            def __init__(self) -> None:
                self.events: list[dict[str, Any]] = []

            def apply(
                self,
                mount: dict[str, str],
                operation: str,
                path: str,
                **fields: Any,
            ) -> None:
                self.events.append(
                    {
                        "mount": mount,
                        "operation": operation,
                        "path": path,
                        **fields,
                    }
                )
                source = sources[(mount["kind"], mount["id"])]
                resolved = os.path.join(source, path)
                if operation == "mkdir":
                    os.mkdir(resolved)
                elif operation == "rename":
                    destination_mount = fields["destinationMount"]
                    destination_source = sources[
                        (destination_mount["kind"], destination_mount["id"])
                    ]
                    os.rename(
                        resolved,
                        os.path.join(destination_source, fields["destinationPath"]),
                    )
                elif operation == "unlink":
                    os.unlink(resolved)
                elif operation == "rmdir":
                    os.rmdir(resolved)

        mutation_client = LocalMutationClient()
        operations_class = build_operations_class(object, OSError)
        operations = operations_class(mounts, mutation_client)

        assert list(operations.readdir("/", 0)) == [
            ".",
            "..",
            "conversation-conv1",
            "pod-pod1",
            "conversation",
            "pod",
        ]
        assert stat.S_IMODE(operations.getattr("/")["st_mode"]) == 0o777
        assert operations.readlink("/conversation") == "conversation-conv1"

        operations.mkdir("/conversation-conv1/folder", 0o755)
        file_handle = operations.create(
            "/conversation-conv1/folder/frame.tsx", 0o644
        )
        operations.write(
            "/conversation-conv1/folder/frame.tsx",
            b"export default 1",
            0,
            file_handle,
        )
        operations.release(
            "/conversation-conv1/folder/frame.tsx", file_handle
        )
        operations.rename(
            "/conversation-conv1/folder/frame.tsx",
            "/conversation-conv1/folder/renamed.tsx",
        )
        operations.rename(
            "/conversation-conv1/folder/renamed.tsx",
            "/pod-pod1/frame.tsx",
        )
        operations.unlink("/pod-pod1/frame.tsx")
        operations.rmdir("/conversation-conv1/folder")

        events = mutation_client.events
        assert [event["operation"] for event in events] == [
            "mkdir",
            "content_committed",
            "rename",
            "rename",
            "unlink",
            "rmdir",
        ]
        assert events[2]["destinationMount"] == {
            "kind": "conversation",
            "id": "conv1",
        }
        assert events[2]["destinationPath"] == "folder/renamed.tsx"
        assert events[3]["mount"] == {"kind": "conversation", "id": "conv1"}
        assert events[3]["destinationMount"] == {"kind": "pod", "id": "pod1"}
        assert events[3]["destinationPath"] == "frame.tsx"


def parse_mount_spec(value: str) -> MountTarget:
    try:
        spec = json.loads(value)
    except json.JSONDecodeError as error:
        raise argparse.ArgumentTypeError(f"invalid mount JSON: {error}") from error

    if not isinstance(spec, dict):
        raise argparse.ArgumentTypeError("mount spec must be a JSON object")

    required = {"name", "source", "kind", "ownerId", "readOnly", "legacyName"}
    if set(spec) != required:
        raise argparse.ArgumentTypeError(
            f"mount spec fields must be exactly: {', '.join(sorted(required))}"
        )
    if not isinstance(spec["name"], str) or not spec["name"] or "/" in spec["name"]:
        raise argparse.ArgumentTypeError("mount name must be one path segment")
    if not isinstance(spec["source"], str) or not os.path.isabs(spec["source"]):
        raise argparse.ArgumentTypeError("mount source must be an absolute path")
    if spec["kind"] not in ("conversation", "pod"):
        raise argparse.ArgumentTypeError("mount kind must be conversation or pod")
    if not isinstance(spec["ownerId"], str) or not spec["ownerId"]:
        raise argparse.ArgumentTypeError("mount ownerId must be a non-empty string")
    if not isinstance(spec["readOnly"], bool):
        raise argparse.ArgumentTypeError("mount readOnly must be a boolean")
    legacy_name = spec["legacyName"]
    if legacy_name is not None and (
        not isinstance(legacy_name, str) or not legacy_name or "/" in legacy_name
    ):
        raise argparse.ArgumentTypeError(
            "mount legacyName must be null or one path segment"
        )

    return MountTarget(
        name=spec["name"],
        source=spec["source"],
        kind=spec["kind"],
        owner_id=spec["ownerId"],
        read_only=spec["readOnly"],
        legacy_name=legacy_name,
    )


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mount-spec", action="append", type=parse_mount_spec)
    parser.add_argument("--mountpoint")
    parser.add_argument("--api-url")
    parser.add_argument("--token-file")
    parser.add_argument("--foreground", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    return parser.parse_args()


def main() -> None:
    arguments = parse_arguments()
    if arguments.self_test:
        run_self_test()
        return

    required = {
        "mount_spec": arguments.mount_spec,
        "mountpoint": arguments.mountpoint,
        "api_url": arguments.api_url,
        "token_file": arguments.token_file,
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        raise SystemExit(f"missing required arguments: {', '.join(missing)}")

    from fuse import FUSE, FuseOSError, Operations

    mutation_client = MutationClient(arguments.api_url, arguments.token_file)
    operations_class = build_operations_class(Operations, FuseOSError)
    operations = operations_class(arguments.mount_spec, mutation_client)
    FUSE(
        operations,
        arguments.mountpoint,
        foreground=arguments.foreground,
        allow_other=True,
        fsname="dust-fs-overlay",
    )


if __name__ == "__main__":
    main()
