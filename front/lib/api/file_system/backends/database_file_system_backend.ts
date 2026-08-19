import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";

import type {
  FileSystemBackend,
  FileSystemNodeIdentity,
} from "@app/lib/api/file_system/backends/file_system_backend";
import {
  getFileSystemDownloadUrl,
  getFileSystemReadStream,
  writeFileSystemContent,
} from "@app/lib/api/file_system/file_system_content";
import { FileSystemScope } from "@app/lib/api/file_system/namespace_scope";
import { FileSystemOperationError } from "@app/lib/api/file_system/namespace_types";
import { DatabaseSandboxMountAdapter } from "@app/lib/api/file_system/sandbox/database_sandbox_mount_adapter";
import type { SandboxMountAdapter } from "@app/lib/api/file_system/sandbox/sandbox_mount_adapter";
import type { Authenticator } from "@app/lib/auth";
import { FILE_SYSTEM_CONTENT_URL_EXPIRATION_MS } from "@app/lib/file_storage/file_system_blobs";
import { FileSystemMutationResource } from "@app/lib/resources/file_system_mutation_resource";
import { FileSystemNodeResource } from "@app/lib/resources/file_system_node_resource";
import type {
  FileSystemDirectoryEntry,
  FileSystemEntry,
} from "@app/types/api/file_system/types";
import type { FileSystemMount, SandboxOnlyMount } from "@app/types/file_system";
import { DustFileSystemError } from "@app/types/file_system";
import { stripMimeParameters } from "@app/types/files";
import { TOOL_OUTPUTS_FOLDER_NAME } from "@app/types/mount_path";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

type ParsedPath = {
  mount: FileSystemMount;
  segments: string[];
};

type ResolvedPath = ParsedPath & {
  node: FileSystemNodeResource;
};

const DIRECTORY_CONTENT_TYPE = "application/x-directory";
const DEFAULT_CONTENT_TYPE = "application/octet-stream";
const DIRECTORY_PAGE_SIZE = 256;

/** PostgreSQL owns names and inodes; GCS stores only immutable file bytes. */
export class DatabaseFileSystemBackend implements FileSystemBackend {
  private readonly scope: FileSystemScope;
  private rootsPromise: Promise<FileSystemNodeResource[]> | null = null;

  constructor(
    private readonly auth: Authenticator,
    private readonly mounts: ReadonlyArray<FileSystemMount>,
    private readonly sandboxOnlyMounts: ReadonlyArray<SandboxOnlyMount> = []
  ) {
    this.scope = new FileSystemScope(
      mounts.flatMap((mount) =>
        mount.kind === "user"
          ? []
          : [
              {
                kind: mount.kind,
                id: mount.id,
                name: mount.scopedPrefix,
                permissions: mount.permissions,
              },
            ]
      )
    );
  }

  private parse(scopedPath: string): ParsedPath | null {
    const mount = this.mounts.find(
      (candidate) =>
        scopedPath === candidate.scopedPrefix ||
        scopedPath.startsWith(`${candidate.scopedPrefix}/`)
    );
    if (!mount || mount.kind === "user") {
      return null;
    }
    const relativePath = scopedPath.slice(mount.scopedPrefix.length + 1);
    return {
      mount,
      segments: relativePath ? relativePath.split("/").filter(Boolean) : [],
    };
  }

  private async roots(): Promise<FileSystemNodeResource[]> {
    this.rootsPromise ??= FileSystemNodeResource.ensureRoots(
      this.auth,
      this.scope
    );
    return this.rootsPromise;
  }

  private async rootFor(
    mount: FileSystemMount
  ): Promise<FileSystemNodeResource> {
    const root = (await this.roots()).find(
      (candidate) =>
        candidate.rootKind === mount.kind && candidate.rootId === mount.id
    );
    if (!root) {
      throw new Error(`Filesystem root was not created: ${mount.scopedPrefix}`);
    }
    return root;
  }

  private async resolve(scopedPath: string): Promise<ResolvedPath | null> {
    const parsed = this.parse(scopedPath);
    if (!parsed) {
      throw new DustFileSystemError(
        "invalid_path",
        `Unknown database filesystem path: ${scopedPath}`
      );
    }
    let node = await this.rootFor(parsed.mount);
    for (const segment of parsed.segments) {
      if (node.kind !== "directory") {
        return null;
      }
      const child = await node.lookupChild(this.auth, this.scope, segment);
      if (child.isErr()) {
        throw child.error;
      }
      if (!child.value) {
        return null;
      }
      node = child.value;
    }
    return { ...parsed, node };
  }

  private async resolveParent(scopedPath: string): Promise<{
    parsed: ParsedPath;
    parent: FileSystemNodeResource;
    name: string;
    existing: FileSystemNodeResource | null;
  }> {
    const parsed = this.parse(scopedPath);
    if (!parsed || parsed.segments.length === 0) {
      throw new DustFileSystemError(
        "invalid_path",
        `A filesystem root cannot be modified: ${scopedPath}`
      );
    }
    const name = parsed.segments.at(-1);
    if (!name) {
      throw new DustFileSystemError("invalid_path", "A file name is required.");
    }
    const parentPath = [
      parsed.mount.scopedPrefix,
      ...parsed.segments.slice(0, -1),
    ].join("/");
    const parent = await this.resolve(parentPath);
    if (!parent || parent.node.kind !== "directory") {
      throw new FileSystemOperationError(
        "not_found",
        "The parent directory was not found."
      );
    }
    const existing = await parent.node.lookupChild(this.auth, this.scope, name);
    if (existing.isErr()) {
      throw existing.error;
    }
    return { parsed, parent: parent.node, name, existing: existing.value };
  }

  private error(error: unknown): DustFileSystemError {
    if (error instanceof DustFileSystemError) {
      return error;
    }
    if (error instanceof FileSystemOperationError) {
      switch (error.code) {
        case "already_exists":
          return new DustFileSystemError("already_exists", error.message);
        case "not_found":
          return new DustFileSystemError("not_found", error.message);
        case "unauthorized":
          return new DustFileSystemError("unauthorized", error.message);
        case "is_directory":
        case "not_directory":
        case "invalid_operation":
        case "not_empty":
        case "stale":
          return new DustFileSystemError("internal", error.message);
      }
    }
    return new DustFileSystemError("internal", normalizeError(error).message);
  }

  private entry(
    node: FileSystemNodeResource,
    scopedPath: string
  ): FileSystemEntry {
    if (node.kind === "directory") {
      return {
        isDirectory: true,
        fileName: node.name,
        path: scopedPath,
        sizeBytes: 0,
        lastModifiedMs: node.updatedAt.getTime(),
      };
    }
    return {
      isDirectory: false,
      fileName: node.name,
      path: scopedPath,
      sizeBytes: node.size,
      contentType: stripMimeParameters(
        node.contentType ?? DEFAULT_CONTENT_TYPE
      ),
      lastModifiedMs: node.updatedAt.getTime(),
      fileId: null,
      thumbnailUrl: null,
    };
  }

  private async children(
    node: FileSystemNodeResource
  ): Promise<FileSystemNodeResource[]> {
    const children: FileSystemNodeResource[] = [];
    let afterName: string | null = null;
    do {
      const page = await node.readDir(this.auth, this.scope, {
        afterName,
        limit: DIRECTORY_PAGE_SIZE,
      });
      if (page.isErr()) {
        throw page.error;
      }
      children.push(...page.value.nodes);
      afterName = page.value.nextAfterName;
    } while (afterName !== null);
    return children;
  }

  async list(
    scopedPath: string,
    {
      maxFiles,
      includeProcessed = false,
    }: { maxFiles?: number; includeProcessed?: boolean } = {}
  ): Promise<Result<FileSystemEntry[], DustFileSystemError>> {
    try {
      const resolved = await this.resolve(scopedPath.replace(/\/$/, ""));
      if (!resolved || resolved.node.kind !== "directory") {
        return new Ok([]);
      }
      const entries: FileSystemEntry[] = [];
      const pending: Array<{ node: FileSystemNodeResource; path: string }> = [
        { node: resolved.node, path: scopedPath.replace(/\/$/, "") },
      ];
      while (
        pending.length > 0 &&
        (maxFiles === undefined || entries.length < maxFiles)
      ) {
        const current = pending.pop();
        if (!current) {
          break;
        }
        for (const child of await this.children(current.node)) {
          const childPath = `${current.path}/${child.name}`;
          const hidden =
            child.name.startsWith(".") &&
            child.name !== TOOL_OUTPUTS_FOLDER_NAME;
          const processed =
            child.kind === "file" && child.name.includes(".processed.");
          if (!hidden && (includeProcessed || !processed)) {
            entries.push(this.entry(child, childPath));
          }
          if (child.kind === "directory" && !hidden) {
            pending.push({ node: child, path: childPath });
          }
          if (maxFiles !== undefined && entries.length >= maxFiles) {
            break;
          }
        }
      }
      return new Ok(entries);
    } catch (error) {
      return new Err(this.error(error));
    }
  }

  async read(
    scopedPath: string
  ): Promise<Result<Readable | null, DustFileSystemError>> {
    try {
      const resolved = await this.resolve(scopedPath);
      if (!resolved) {
        return new Ok(null);
      }
      const stream = await getFileSystemReadStream(
        this.auth,
        this.scope,
        resolved.node.id
      );
      return stream.isErr()
        ? new Err(this.error(stream.error))
        : new Ok(stream.value);
    } catch (error) {
      return new Err(this.error(error));
    }
  }

  async stat(
    scopedPath: string
  ): Promise<
    Result<
      { contentType: string; sizeBytes: number } | null,
      DustFileSystemError
    >
  > {
    try {
      const resolved = await this.resolve(scopedPath);
      if (!resolved) {
        return new Ok(null);
      }
      return new Ok({
        contentType:
          resolved.node.kind === "directory"
            ? DIRECTORY_CONTENT_TYPE
            : stripMimeParameters(
                resolved.node.contentType ?? DEFAULT_CONTENT_TYPE
              ),
        sizeBytes: resolved.node.size,
      });
    } catch (error) {
      return new Err(this.error(error));
    }
  }

  async exists(
    scopedPath: string
  ): Promise<Result<boolean, DustFileSystemError>> {
    try {
      return new Ok((await this.resolve(scopedPath)) !== null);
    } catch (error) {
      return new Err(this.error(error));
    }
  }

  async write(
    scopedPath: string,
    content: Buffer | string | Readable,
    contentType: string
  ): Promise<Result<FileSystemNodeIdentity, DustFileSystemError>> {
    try {
      const destination = await this.resolveParent(scopedPath);
      let node = destination.existing;
      if (!node) {
        const created = await FileSystemMutationResource.createNode(
          this.auth,
          this.scope,
          {
            operation: "create",
            requestId: randomUUID(),
            parentId: destination.parent.id,
            name: destination.name,
            kind: "file",
            mode: 0o644,
          }
        );
        if (created.isErr()) {
          throw created.error;
        }
        node = created.value;
      }
      if (node.kind !== "file") {
        throw new FileSystemOperationError(
          "invalid_operation",
          "A directory cannot be overwritten with file content."
        );
      }
      const written = await writeFileSystemContent(this.auth, this.scope, {
        nodeId: node.id,
        expectedBlobId: node.blobId,
        content,
        contentType,
      });
      if (written.isErr()) {
        throw written.error;
      }
      return new Ok({ nodeId: node.id });
    } catch (error) {
      return new Err(this.error(error));
    }
  }

  async mkdir(
    scopedPath: string
  ): Promise<
    Result<
      { entry: FileSystemDirectoryEntry } & FileSystemNodeIdentity,
      DustFileSystemError
    >
  > {
    try {
      const destination = await this.resolveParent(scopedPath);
      if (destination.existing) {
        return new Err(
          new DustFileSystemError(
            "already_exists",
            "A file or directory already exists at this path."
          )
        );
      }
      const created = await FileSystemMutationResource.createNode(
        this.auth,
        this.scope,
        {
          operation: "create",
          requestId: randomUUID(),
          parentId: destination.parent.id,
          name: destination.name,
          kind: "directory",
          mode: 0o755,
        }
      );
      if (created.isErr()) {
        throw created.error;
      }
      const entry = this.entry(created.value, scopedPath);
      if (!entry.isDirectory) {
        throw new Error("Created directory rendered as a file.");
      }
      return new Ok({ entry, nodeId: created.value.id });
    } catch (error) {
      return new Err(this.error(error));
    }
  }

  private async removeNode(
    parentId: number,
    node: FileSystemNodeResource
  ): Promise<void> {
    if (node.kind === "directory") {
      for (const child of await this.children(node)) {
        await this.removeNode(node.id, child);
      }
    }
    const removed = await FileSystemMutationResource.removeNode(
      this.auth,
      this.scope,
      {
        operation: "remove",
        requestId: randomUUID(),
        parentId,
        name: node.name,
        kind: node.kind,
      }
    );
    if (removed.isErr()) {
      throw removed.error;
    }
  }

  async delete(
    scopedPath: string,
    { ignoreNotFound = false }: { ignoreNotFound?: boolean } = {}
  ): Promise<Result<void, DustFileSystemError>> {
    try {
      const destination = await this.resolveParent(scopedPath);
      if (!destination.existing) {
        return ignoreNotFound
          ? new Ok(undefined)
          : new Err(
              new DustFileSystemError(
                "not_found",
                `Path not found: ${scopedPath}`
              )
            );
      }
      await this.removeNode(destination.parent.id, destination.existing);
      return new Ok(undefined);
    } catch (error) {
      return new Err(this.error(error));
    }
  }

  private async copyNode(
    source: FileSystemNodeResource,
    destinationParent: FileSystemNodeResource,
    destinationName: string
  ): Promise<void> {
    const created = await FileSystemMutationResource.createNode(
      this.auth,
      this.scope,
      {
        operation: "create",
        requestId: randomUUID(),
        parentId: destinationParent.id,
        name: destinationName,
        kind: source.kind,
        mode: source.mode,
      }
    );
    if (created.isErr()) {
      throw created.error;
    }
    if (source.kind === "file") {
      const stream = await getFileSystemReadStream(
        this.auth,
        this.scope,
        source.id
      );
      if (stream.isErr()) {
        throw stream.error;
      }
      const written = await writeFileSystemContent(this.auth, this.scope, {
        nodeId: created.value.id,
        expectedBlobId: null,
        content: stream.value,
        contentType: source.contentType ?? DEFAULT_CONTENT_TYPE,
      });
      if (written.isErr()) {
        throw written.error;
      }
      return;
    }
    for (const child of await this.children(source)) {
      await this.copyNode(child, created.value, child.name);
    }
  }

  async copy({
    src,
    dest,
  }: {
    src: string;
    dest: string;
  }): Promise<Result<void, DustFileSystemError>> {
    try {
      const source = await this.resolve(src);
      if (!source) {
        return new Err(
          new DustFileSystemError("not_found", `Path not found: ${src}`)
        );
      }
      const destination = await this.resolveParent(dest);
      if (destination.existing) {
        return new Err(
          new DustFileSystemError(
            "already_exists",
            "A file or directory already exists at the destination."
          )
        );
      }
      await this.copyNode(source.node, destination.parent, destination.name);
      return new Ok(undefined);
    } catch (error) {
      return new Err(this.error(error));
    }
  }

  async move({
    src,
    dest,
  }: {
    src: string;
    dest: string;
  }): Promise<Result<{ sourceDeletionFailed: boolean }, DustFileSystemError>> {
    try {
      const source = await this.resolveParent(src);
      if (!source.existing) {
        return new Err(
          new DustFileSystemError("not_found", `Path not found: ${src}`)
        );
      }
      const destination = await this.resolveParent(dest);
      if (destination.existing) {
        return new Err(
          new DustFileSystemError(
            "already_exists",
            "A file or directory already exists at the destination."
          )
        );
      }
      const moved = await FileSystemMutationResource.renameNode(
        this.auth,
        this.scope,
        {
          operation: "rename",
          requestId: randomUUID(),
          sourceParentId: source.parent.id,
          sourceName: source.name,
          destinationParentId: destination.parent.id,
          destinationName: destination.name,
        }
      );
      if (moved.isErr()) {
        throw moved.error;
      }
      return new Ok({ sourceDeletionFailed: false });
    } catch (error) {
      return new Err(this.error(error));
    }
  }

  async getDownloadUrl(
    scopedPath: string,
    opts?: { expiresInMs?: number; fileName?: string }
  ): Promise<Result<string, DustFileSystemError>> {
    try {
      const resolved = await this.resolve(scopedPath);
      if (!resolved) {
        return new Err(
          new DustFileSystemError("not_found", `Path not found: ${scopedPath}`)
        );
      }
      const result = await getFileSystemDownloadUrl(
        this.auth,
        this.scope,
        resolved.node.id,
        opts?.expiresInMs ?? FILE_SYSTEM_CONTENT_URL_EXPIRATION_MS,
        opts?.fileName
      );
      return result.isErr()
        ? new Err(this.error(result.error))
        : new Ok(result.value);
    } catch (error) {
      return new Err(this.error(error));
    }
  }

  createSandboxAdapter(): SandboxMountAdapter {
    return new DatabaseSandboxMountAdapter(this.mounts, this.sandboxOnlyMounts);
  }
}
