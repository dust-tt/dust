import type { DfsFileSystemClient } from "@app/lib/dfs/file_system";
import { DfsWireFactory } from "@app/tests/utils/dfs/DfsWireFactory";
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
  DfsOperation,
  DfsOperationBatch,
  DfsOperationResult,
  DfsReadData,
} from "@app/types/dfs";
import { DfsError } from "@app/types/dfs";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

interface FakeNode {
  id: DfsObjectId;
  parentId: DfsObjectId | null;
  name: string;
  kind: DfsObjectKind;
  data: Buffer;
  // Undefined once cleared with an empty MIME type.
  mimeType: string | undefined;
  children: Map<string, DfsObjectId>;
  attrVersion: bigint;
  contentVersion: bigint;
}

class OperationError extends Error {
  constructor(readonly code: DfsErrorCode) {
    super(code);
  }
}

function checkName(name: string) {
  if (Buffer.byteLength(name) > 255) {
    throw new OperationError("name_too_long");
  }
}

// A simplified version of the API's "valid and at most 255 bytes" MIME type rule. An empty MIME
// type is valid: it clears the stored one.
function checkMimeType(mimeType: string | undefined) {
  if (
    mimeType !== undefined &&
    mimeType !== "" &&
    (!/^[^/\s]+\/[^/\s]+$/.test(mimeType) || Buffer.byteLength(mimeType) > 255)
  ) {
    throw new OperationError("invalid_input");
  }
}

/**
 * In-memory stand-in for a dfs server session, implementing the calls `DfsFileSystem` uses.
 * It follows the API's filesystem rules (names, kinds, non-empty directories, version bumps,
 * sequential `Apply` operations) but has no permissions or snapshots.
 */
export class InMemoryDfs implements DfsFileSystemClient {
  readonly rootId: DfsObjectId;
  readonly applyCalls: DfsOperation[][] = [];
  readonly readCalls: { objectId: DfsObjectId; offset: number }[] = [];
  private readonly nodes = new Map<DfsObjectId, FakeNode>();

  constructor(
    private readonly options: {
      // Fails any `apply` whose written bytes exceed this, like the 1 MiB request budget.
      maxWriteBytesPerApply?: number;
      // Returning an error fails that `apply` call as a whole (e.g. a transport failure).
      failApply?: (callIndex: number) => DfsError | null;
      // Runs before each `apply` is served, e.g. to modify the tree concurrently.
      beforeApply?: (callIndex: number) => void;
      // Runs before each `read` is served, e.g. to modify the file concurrently.
      beforeRead?: (callIndex: number) => void;
      // Caps the bytes each `read` returns, as the API allows reads shorter than requested.
      maxReadBytes?: number;
    } = {}
  ) {
    this.rootId = DfsWireFactory.newObjectId();
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
        mimeType === ""
          ? undefined
          : (mimeType ??
            (kind === "directory"
              ? "inode/directory"
              : "application/octet-stream")),
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
      grantsVersion: BigInt(1),
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
    const id = DfsWireFactory.newObjectId();
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
    const id = DfsWireFactory.newObjectId();
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

  async apply({
    operations,
  }: {
    operations: DfsOperation[];
  }): Promise<Result<DfsOperationBatch, DfsError>> {
    const callIndex = this.applyCalls.push(operations) - 1;
    this.options.beforeApply?.(callIndex);
    const failure = this.options.failApply?.(callIndex);
    if (failure) {
      return new Err(failure);
    }
    const writtenBytes = operations.reduce(
      (sum, op) => sum + (op.type === "write" ? op.data.length : 0),
      0
    );
    const { maxWriteBytesPerApply } = this.options;
    if (
      maxWriteBytesPerApply !== undefined &&
      writtenBytes > maxWriteBytesPerApply
    ) {
      return new Err(new DfsError("capacity", "Apply request too large."));
    }

    const outcomes = operations.map((op) => this.run(() => this.applyOne(op)));
    const results: DfsOperationResult[] = outcomes.map((outcome) => {
      if (outcome.isErr()) {
        return { status: "error", errorCode: outcome.error.code };
      }
      // Attributes reflect the final state of the whole batch.
      const node = outcome.value ? this.nodes.get(outcome.value) : undefined;
      return {
        status: "ok",
        mutation: { object: node ? this.attr(node) : undefined, related: [] },
      };
    });
    return new Ok({ results });
  }

  /** Applies one operation and returns the primary object's id, or null for a removal. */
  private applyOne(op: DfsOperation): DfsObjectId | null {
    switch (op.type) {
      case "create": {
        checkName(op.name);
        checkMimeType(op.mimeType);
        const parent = this.directory(op.parentId);
        if (parent.children.has(op.name)) {
          throw new OperationError("already_exists");
        }
        const objectId = DfsWireFactory.newObjectId();
        this.nodes.set(
          objectId,
          this.newNode(objectId, parent.id, op.name, op.kind, op.mimeType)
        );
        parent.children.set(op.name, objectId);
        this.touch(parent, { content: true });
        return objectId;
      }
      case "update": {
        // Validate the whole patch before applying any of it.
        checkMimeType(op.mimeType);
        const node = this.node(op.objectId);
        if (op.size !== undefined && node.kind === "directory") {
          throw new OperationError("is_directory");
        }
        if (op.mimeType !== undefined) {
          node.mimeType = op.mimeType === "" ? undefined : op.mimeType;
        }
        if (op.size !== undefined) {
          const resized = Buffer.alloc(op.size);
          node.data.copy(resized, 0, 0, op.size);
          node.data = resized;
        }
        this.touch(node, { content: op.size !== undefined });
        return node.id;
      }
      case "write": {
        const node = this.node(op.objectId);
        if (node.kind === "directory") {
          throw new OperationError("is_directory");
        }
        const offset = op.append ? node.data.length : op.offset;
        const end = offset + op.data.length;
        const data = Buffer.alloc(Math.max(node.data.length, end));
        node.data.copy(data);
        Buffer.from(op.data).copy(data, offset);
        node.data = data;
        this.touch(node, { content: op.data.length > 0 });
        return node.id;
      }
      case "rename": {
        checkName(op.name);
        const node = this.node(op.objectId);
        const destination = this.directory(op.parentId);
        for (
          let ancestor: FakeNode | undefined = destination;
          ancestor;
          ancestor = ancestor.parentId
            ? this.nodes.get(ancestor.parentId)
            : undefined
        ) {
          if (ancestor.id === node.id) {
            throw new OperationError("invalid_input");
          }
        }
        const replacedId = destination.children.get(op.name);
        if (replacedId && replacedId !== node.id) {
          const replaced = this.node(replacedId);
          if (!op.replace) {
            throw new OperationError("already_exists");
          }
          if (replaced.kind !== node.kind) {
            throw new OperationError(
              replaced.kind === "directory" ? "is_directory" : "not_directory"
            );
          }
          if (replaced.children.size > 0) {
            throw new OperationError("not_empty");
          }
          this.nodes.delete(replacedId);
        }
        if (node.parentId) {
          const source = this.node(node.parentId);
          source.children.delete(node.name);
          this.touch(source, { content: true });
        }
        destination.children.set(op.name, node.id);
        this.touch(destination, { content: true });
        node.parentId = destination.id;
        node.name = op.name;
        this.touch(node, { content: false });
        return node.id;
      }
      case "remove": {
        const node = this.node(op.objectId);
        if (node.kind !== op.kind) {
          throw new OperationError(
            node.kind === "directory" ? "is_directory" : "not_directory"
          );
        }
        if (node.children.size > 0) {
          throw new OperationError("not_empty");
        }
        if (node.parentId) {
          const parent = this.node(node.parentId);
          parent.children.delete(node.name);
          this.touch(parent, { content: true });
        }
        this.nodes.delete(node.id);
        return null;
      }
      default:
        assertNever(op);
    }
  }
}
