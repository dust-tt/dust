import type { DfsFileSystemClient } from "@app/lib/dfs/file_system";
import { newDfsObjectId } from "@app/lib/dfs/object_id";
import type {
  DfsAttr,
  DfsAttrBatch,
  DfsAttrResult,
  DfsEntryPage,
  DfsErrorCode,
  DfsLookupTarget,
  DfsObjectId,
  DfsObjectKind,
  DfsObjectRef,
  DfsReadData,
} from "@app/types/dfs";
import { DfsError } from "@app/types/dfs";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

interface FakeNode {
  id: DfsObjectId;
  parentId: DfsObjectId | null;
  name: string;
  kind: DfsObjectKind;
  data: Buffer;
  mimeType: string;
  children: Map<string, DfsObjectId>;
  attrVersion: bigint;
  contentVersion: bigint;
}

class OperationError extends Error {
  constructor(readonly code: DfsErrorCode) {
    super(code);
  }
}

/**
 * In-memory stand-in for a dfs server session, implementing the calls `DfsFileSystem` uses.
 * It follows the API's filesystem rules (names, kinds, non-empty directories, version bumps,
 * sequential `Apply` operations) but has no permissions or snapshots.
 */
export class InMemoryDfs implements DfsFileSystemClient {
  readonly rootId: DfsObjectId;
  readonly readCalls: { objectId: DfsObjectId; offset: number }[] = [];
  private readonly nodes = new Map<DfsObjectId, FakeNode>();

  constructor(
    private readonly options: {
      // Runs before each `read` is served, e.g. to modify the file concurrently.
      beforeRead?: (callIndex: number) => void;
      // Caps the bytes each `read` returns, as the API allows reads shorter than requested.
      maxReadBytes?: number;
    } = {}
  ) {
    this.rootId = newDfsObjectId();
    this.nodes.set(
      this.rootId,
      this.newNode(this.rootId, null, "", "directory")
    );
  }

  private newNode(
    id: DfsObjectId,
    parentId: DfsObjectId | null,
    name: string,
    kind: DfsObjectKind,
    mimeType?: string
  ): FakeNode {
    return {
      id,
      parentId,
      name,
      kind,
      data: Buffer.alloc(0),
      mimeType:
        mimeType ??
        (kind === "directory" ? "inode/directory" : "application/octet-stream"),
      children: new Map(),
      attrVersion: BigInt(1),
      contentVersion: BigInt(1),
    };
  }

  private node(id: DfsObjectRef): FakeNode {
    const node = this.nodes.get(id);
    if (!node) {
      throw new OperationError("not_found");
    }
    return node;
  }

  private directory(id: DfsObjectRef): FakeNode {
    const node = this.node(id);
    if (node.kind !== "directory") {
      throw new OperationError("not_directory");
    }
    return node;
  }

  // The path of `node` from the root, for test assertions.
  private fullPath(node: FakeNode): string {
    const names: string[] = [];
    let current: FakeNode | undefined = node;
    while (current && current.parentId) {
      names.unshift(current.name);
      current = this.nodes.get(current.parentId);
    }
    return `/${names.join("/")}`;
  }

  private attr(node: FakeNode, includeMetadata = false): DfsAttr {
    return {
      id: node.id,
      name: node.name,
      kind: node.kind,
      size: node.kind === "directory" ? 0 : node.data.length,
      mode: 0o700,
      attrVersion: node.attrVersion,
      contentVersion: node.contentVersion,
      storeVersion: BigInt(1),
      metadata: includeMetadata
        ? { createdMs: 0, mimeType: node.mimeType, xattrs: {} }
        : undefined,
    };
  }

  private touch(node: FakeNode, { content }: { content: boolean }) {
    node.attrVersion += BigInt(1);
    if (content) {
      node.contentVersion += BigInt(1);
    }
  }

  private run<T>(fn: () => T): Result<T, DfsError> {
    try {
      return new Ok(fn());
    } catch (err) {
      if (err instanceof OperationError) {
        return new Err(new DfsError(err.code));
      }
      throw err;
    }
  }

  // Test helpers.

  /** Replaces the content of `objectId` outside any `apply`, advancing its content version. */
  overwrite(objectId: DfsObjectId, data: Buffer): void {
    const node = this.node(objectId);
    node.data = data;
    this.touch(node, { content: true });
  }

  /** Creates an empty directory outside any `apply`, e.g. to race a pending write. */
  createDirectory(parentId: DfsObjectId, name: string): DfsObjectId {
    const parent = this.directory(parentId);
    const id = newDfsObjectId();
    this.nodes.set(id, this.newNode(id, parent.id, name, "directory"));
    parent.children.set(name, id);
    this.touch(parent, { content: true });
    return id;
  }

  /** Creates a file outside any `apply`, to set up a test. */
  createFile(
    parentId: DfsObjectId,
    name: string,
    data: string,
    mimeType?: string
  ): DfsObjectId {
    const parent = this.directory(parentId);
    const id = newDfsObjectId();
    const node = this.newNode(id, parent.id, name, "file", mimeType);
    node.data = Buffer.from(data);
    this.nodes.set(id, node);
    parent.children.set(name, id);
    this.touch(parent, { content: true });
    return id;
  }

  /** All names currently in the tree, as full paths. */
  paths(): string[] {
    return [...this.nodes.values()]
      .filter((n) => n.parentId)
      .map((n) => this.fullPath(n))
      .sort();
  }

  // DfsFileSystemClient.

  async lookup({
    targets,
  }: {
    targets: DfsLookupTarget[];
  }): Promise<Result<DfsAttrBatch, DfsError>> {
    return new Ok({
      results: targets.map(({ parentId, name }) =>
        this.attrResult(() => {
          const childId = this.directory(parentId).children.get(name);
          if (!childId) {
            throw new OperationError("not_found");
          }
          return this.attr(this.node(childId));
        })
      ),
    });
  }

  private attrResult(fn: () => DfsAttr): DfsAttrResult {
    const res = this.run(fn);
    return res.isOk()
      ? { status: "ok", object: res.value }
      : { status: "error", errorCode: res.error.code };
  }

  async list({
    directoryId,
    after,
    limit,
  }: {
    directoryId: DfsObjectRef;
    after?: string;
    limit: number;
  }): Promise<Result<DfsEntryPage, DfsError>> {
    return this.run(() => {
      const names = [...this.directory(directoryId).children.keys()]
        .sort()
        .filter((name) => after === undefined || name > after);
      const page = names.slice(0, limit);
      return {
        entries: page.map((name) => ({
          name,
          object: this.attr(
            this.node(this.directory(directoryId).children.get(name) ?? "")
          ),
        })),
        nextAfter: names.length > limit ? page.at(-1) : undefined,
      };
    });
  }

  async read({
    objectId,
    offset,
    length,
  }: {
    objectId: DfsObjectId;
    offset: number;
    length: number;
  }): Promise<Result<DfsReadData, DfsError>> {
    const callIndex = this.readCalls.push({ objectId, offset }) - 1;
    this.options.beforeRead?.(callIndex);
    return this.run(() => {
      const node = this.node(objectId);
      if (node.kind === "directory") {
        throw new OperationError("is_directory");
      }
      return {
        data: node.data.subarray(
          offset,
          offset + Math.min(length, this.options.maxReadBytes ?? length)
        ),
        object: this.attr(node),
      };
    });
  }

  async stat({
    objectIds,
    includeMetadata,
  }: {
    objectIds: DfsObjectRef[];
    includeMetadata?: boolean;
  }): Promise<Result<DfsAttrBatch, DfsError>> {
    return new Ok({
      results: objectIds.map((objectId) =>
        this.attrResult(() => this.attr(this.node(objectId), includeMetadata))
      ),
    });
  }
}
