import type { DfsClient } from "@app/lib/dfs/client";
import { newDfsObjectId } from "@app/lib/dfs/object_id";
import type {
  DfsAttr,
  DfsEntry,
  DfsMutation,
  DfsObjectId,
  DfsOperation,
} from "@app/types/dfs";
import { DfsError, isDfsObjectId } from "@app/types/dfs";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { Readable } from "stream";

/** The `DfsClient` calls the path layer relies on. */
export type DfsPathClient = Pick<
  DfsClient,
  "apply" | "list" | "lookup" | "read" | "stat"
>;

export type DfsWriteContent = Buffer | Uint8Array | string | Readable;

// Server limit for one `Read`.
const MAX_READ_CHUNK_BYTES = 1024 * 1024;
// `Apply` requests are limited to 1 MiB encoded; keep headroom for the operation envelope.
const MAX_WRITE_CHUNK_BYTES = 1024 * 1024 - 64 * 1024;
const LIST_PAGE_LIMIT = 4096;
const MAX_REMOVALS_PER_APPLY = 512;
const UPLOAD_NAME_PREFIX = ".dfs-upload-";

function parsePath(path: string): Result<string[], DfsError> {
  const trimmed = path.replace(/^\/+|\/+$/g, "");
  if (trimmed === "") {
    return new Ok([]);
  }
  const segments = trimmed.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) {
    return new Err(new DfsError("invalid_input", `Invalid path: ${path}.`));
  }
  return new Ok(segments);
}

function realIdOf(attr: DfsAttr): Result<DfsObjectId, DfsError> {
  return isDfsObjectId(attr.id)
    ? new Ok(attr.id)
    : new Err(new DfsError("invalid_response", "Expected a real object."));
}

function toBuffer(piece: unknown): Result<Buffer, DfsError> {
  if (Buffer.isBuffer(piece)) {
    return new Ok(piece);
  }
  if (piece instanceof Uint8Array || typeof piece === "string") {
    return new Ok(Buffer.from(piece));
  }
  return new Err(
    new DfsError("invalid_input", "Unsupported stream chunk type.")
  );
}

/**
 * Splits `content` into chunks of exactly `chunkBytes`, except the last one. Empty content yields
 * nothing.
 */
/**
 * @cc [owner:fabiencelier,label:error-handling] content-stream-errors
 * Exception to `no-catching-own-errors`: failures while consuming `content` MUST be thrown as a
 * `DfsError`: a `DfsError` raised by the source stream unchanged,
 * any other source stream error as `invalid_input`. Only `DfsPathFileSystem.writeContent` MAY catch
 * them, with an `instanceof DfsError` guard that rethrows anything else.
 */
async function* contentChunks(
  content: DfsWriteContent,
  chunkBytes: number
): AsyncGenerator<Buffer> {
  const source: AsyncIterable<unknown> | Iterable<unknown> =
    content instanceof Readable ? content : [content];
  const iterator =
    Symbol.asyncIterator in source
      ? source[Symbol.asyncIterator]()
      : source[Symbol.iterator]();
  let pending: Buffer[] = [];
  let pendingBytes = 0;
  while (true) {
    let next: IteratorResult<unknown>;
    try {
      next = await iterator.next();
    } catch (err) {
      // The caller's stream failed: an external error, except for our own read streams.
      throw err instanceof DfsError
        ? err
        : new DfsError(
            "invalid_input",
            `Content stream failed: ${normalizeError(err).message}`
          );
    }
    if (next.done) {
      break;
    }
    const piece = toBuffer(next.value);
    if (piece.isErr()) {
      throw piece.error;
    }
    pending.push(piece.value);
    pendingBytes += piece.value.length;
    if (pendingBytes >= chunkBytes) {
      // Concatenate once per chunk boundary rather than once per piece.
      let buffered = Buffer.concat(pending);
      while (buffered.length >= chunkBytes) {
        yield buffered.subarray(0, chunkBytes);
        buffered = buffered.subarray(chunkBytes);
      }
      pending = [buffered];
      pendingBytes = buffered.length;
    }
  }
  if (pendingBytes > 0) {
    yield Buffer.concat(pending);
  }
}

/**
 * Path-based access to a dfs directory tree, on top of the ID-based `DfsClient`. Paths are relative
 * to `rootId` (e.g. `reports/q3.pdf`); leading and trailing slashes are ignored and the empty path
 * is the root itself. Each path segment costs one `lookup`: nothing is cached.
 */
/**
 * @cc [owner:fabiencelier,label:security] paths-stay-under-root
 * Path resolution MUST start at `rootId` and only descend through `lookup` by basename. Empty, `.`
 * and `..` segments MUST be rejected with `invalid_input`, and the root itself MUST NOT be removed
 * or moved.
 */
/**
 * @cc [owner:fabiencelier,label:product] atomic-writes
 * `write` MUST make new content visible atomically. Since `Apply` commits the operations that pass
 * validation even when others fail, an `Apply` touching visible content MUST only combine
 * operations on the same object that cannot fail independently: caller-supplied metadata (MIME
 * type) MUST be applied in its own `Apply` before the content changes. Content fitting in one chunk
 * MUST be written in a single `Apply`, keeping the ObjectId of an existing file. Larger content MUST
 * be uploaded to a temporary sibling, then moved over the target by an `Apply` holding only the
 * replacing rename (the file then gets a new ObjectId).
 */
/**
 * @cc [owner:fabiencelier,label:product] upload-cleanup
 * A failed upload's temporary file MUST be removed on a best-effort basis, unless the final rename
 * may have committed: after a request-wide failure of the rename `Apply` (e.g. `unavailable`), the
 * temporary file, possibly now the target, MUST be left in place.
 */
/**
 * @cc [owner:fabiencelier,label:product] consistent-reads
 * Multi-chunk reads MUST check every chunk's returned `contentVersion` against the one observed when
 * resolving the file, so that a concurrent modification fails the read with `content_changed`
 * instead of mixing two versions.
 */
export class DfsPathFileSystem {
  private readonly readChunkBytes: number;
  private readonly writeChunkBytes: number;

  constructor(
    private readonly client: DfsPathClient,
    private readonly rootId: DfsObjectId,
    options: { readChunkBytes?: number; writeChunkBytes?: number } = {}
  ) {
    this.readChunkBytes = Math.min(
      options.readChunkBytes ?? MAX_READ_CHUNK_BYTES,
      MAX_READ_CHUNK_BYTES
    );
    this.writeChunkBytes = Math.min(
      options.writeChunkBytes ?? MAX_WRITE_CHUNK_BYTES,
      MAX_WRITE_CHUNK_BYTES
    );
  }

  // Resolution.

  private async lookupChild(
    parentId: DfsObjectId,
    name: string
  ): Promise<Result<DfsAttr | null, DfsError>> {
    const res = await this.client.lookup({ targets: [{ parentId, name }] });
    if (res.isErr()) {
      return res;
    }
    const [result] = res.value.results;
    if (result.status === "ok") {
      return new Ok(result.object);
    }
    return result.errorCode === "not_found"
      ? new Ok(null)
      : new Err(new DfsError(result.errorCode));
  }

  private async statById(
    objectId: DfsObjectId,
    includeMetadata: boolean
  ): Promise<Result<DfsAttr, DfsError>> {
    const res = await this.client.stat({
      objectIds: [objectId],
      includeMetadata,
    });
    if (res.isErr()) {
      return res;
    }
    const [result] = res.value.results;
    return result.status === "ok"
      ? new Ok(result.object)
      : new Err(new DfsError(result.errorCode));
  }

  /**
   * Attributes of the longest existing prefix of `segments`. Fails with `not_directory` when a
   * non-final segment is a file.
   */
  private async walk(segments: string[]): Promise<Result<DfsAttr[], DfsError>> {
    const attrs: DfsAttr[] = [];
    let parentId = this.rootId;
    for (const name of segments) {
      const parent = attrs.at(-1);
      if (parent && !parent.directory) {
        return new Err(new DfsError("not_directory"));
      }
      const child = await this.lookupChild(parentId, name);
      if (child.isErr()) {
        return child;
      }
      if (!child.value) {
        break;
      }
      const childId = realIdOf(child.value);
      if (childId.isErr()) {
        return childId;
      }
      attrs.push(child.value);
      parentId = childId.value;
    }
    return new Ok(attrs);
  }

  private async resolveSegments(
    segments: string[]
  ): Promise<Result<DfsAttr | null, DfsError>> {
    if (segments.length === 0) {
      return this.statById(this.rootId, false);
    }
    const attrs = await this.walk(segments);
    if (attrs.isErr()) {
      return attrs;
    }
    return new Ok(
      attrs.value.length === segments.length
        ? (attrs.value.at(-1) ?? null)
        : null
    );
  }

  private async requireSegments(
    segments: string[]
  ): Promise<Result<DfsAttr, DfsError>> {
    const attr = await this.resolveSegments(segments);
    if (attr.isErr()) {
      return attr;
    }
    return attr.value
      ? new Ok(attr.value)
      : new Err(new DfsError("not_found", `Not found: ${segments.join("/")}.`));
  }

  private async requireDirectoryId(
    segments: string[],
    { create }: { create: boolean }
  ): Promise<Result<DfsObjectId, DfsError>> {
    if (segments.length === 0) {
      return new Ok(this.rootId);
    }
    const attr = create
      ? await this.mkdirSegments(segments, { recursive: true })
      : await this.requireSegments(segments);
    if (attr.isErr()) {
      return attr;
    }
    if (!attr.value.directory) {
      return new Err(new DfsError("not_directory"));
    }
    return realIdOf(attr.value);
  }

  // Mutations.

  /** Applies `operations` in one request, failing with the first per-operation error. */
  private async applyAll(
    operations: DfsOperation[]
  ): Promise<Result<DfsMutation[], DfsError>> {
    const res = await this.client.apply({ operations });
    if (res.isErr()) {
      return res;
    }
    const mutations: DfsMutation[] = [];
    for (const [i, result] of res.value.results.entries()) {
      if (result.status === "error") {
        return new Err(
          new DfsError(
            result.errorCode,
            `Operation ${i} (${operations[i].type}) failed.`
          )
        );
      }
      mutations.push(result.mutation);
    }
    return new Ok(mutations);
  }

  private async applyForObject(
    operations: DfsOperation[]
  ): Promise<Result<DfsAttr, DfsError>> {
    const mutations = await this.applyAll(operations);
    if (mutations.isErr()) {
      return mutations;
    }
    const object = mutations.value.at(-1)?.object;
    return object
      ? new Ok(object)
      : new Err(new DfsError("invalid_response", "Missing object attributes."));
  }

  private async mkdirSegments(
    segments: string[],
    { recursive }: { recursive: boolean }
  ): Promise<Result<DfsAttr, DfsError>> {
    if (segments.length === 0) {
      return recursive
        ? this.statById(this.rootId, false)
        : new Err(new DfsError("already_exists"));
    }
    const attrs = await this.walk(segments);
    if (attrs.isErr()) {
      return attrs;
    }
    const existing = attrs.value;
    const deepest = existing.at(-1);
    if (existing.length === segments.length && deepest) {
      return recursive && deepest.directory
        ? new Ok(deepest)
        : new Err(new DfsError("already_exists"));
    }
    if (deepest && !deepest.directory) {
      return new Err(new DfsError("not_directory"));
    }
    if (!recursive && existing.length < segments.length - 1) {
      return new Err(new DfsError("not_found"));
    }

    let parentId = this.rootId;
    if (deepest) {
      const deepestId = realIdOf(deepest);
      if (deepestId.isErr()) {
        return deepestId;
      }
      parentId = deepestId.value;
    }
    const operations: DfsOperation[] = [];
    for (const name of segments.slice(existing.length)) {
      const objectId = newDfsObjectId();
      operations.push({
        type: "create",
        parentId,
        name,
        objectId,
        directory: true,
      });
      parentId = objectId;
    }
    return this.applyForObject(operations);
  }

  // Public API.

  /** Attributes at `path`, or null when nothing exists there. */
  async stat(
    path: string,
    { includeMetadata = false }: { includeMetadata?: boolean } = {}
  ): Promise<Result<DfsAttr | null, DfsError>> {
    const segments = parsePath(path);
    if (segments.isErr()) {
      return segments;
    }
    const attr = await this.resolveSegments(segments.value);
    if (attr.isErr() || !attr.value || !includeMetadata) {
      return attr;
    }
    const id = realIdOf(attr.value);
    if (id.isErr()) {
      return id;
    }
    return this.statById(id.value, true);
  }

  async exists(path: string): Promise<Result<boolean, DfsError>> {
    const attr = await this.stat(path);
    return attr.isErr() ? attr : new Ok(attr.value !== null);
  }

  /** Immediate children of the directory at `path`, in basename order. */
  async list(path: string): Promise<Result<DfsEntry[], DfsError>> {
    const segments = parsePath(path);
    if (segments.isErr()) {
      return segments;
    }
    const directoryId = await this.requireDirectoryId(segments.value, {
      create: false,
    });
    if (directoryId.isErr()) {
      return directoryId;
    }
    return this.listById(directoryId.value);
  }

  private async listById(
    directoryId: DfsObjectId
  ): Promise<Result<DfsEntry[], DfsError>> {
    const entries: DfsEntry[] = [];
    let after: string | undefined;
    do {
      const page = await this.client.list({
        directoryId,
        after,
        limit: LIST_PAGE_LIMIT,
      });
      if (page.isErr()) {
        return page;
      }
      entries.push(...page.value.entries);
      after = page.value.nextAfter;
    } while (after !== undefined);
    return new Ok(entries);
  }

  async mkdir(
    path: string,
    { recursive = false }: { recursive?: boolean } = {}
  ): Promise<Result<DfsAttr, DfsError>> {
    const segments = parsePath(path);
    if (segments.isErr()) {
      return segments;
    }
    return this.mkdirSegments(segments.value, { recursive });
  }

  /** Reads the chunk at `offset`, failing with `content_changed` if `contentVersion` moved. */
  private async readChunk(
    objectId: DfsObjectId,
    offset: number,
    contentVersion: bigint
  ): Promise<Result<Buffer, DfsError>> {
    const res = await this.client.read({
      objectId,
      offset,
      length: this.readChunkBytes,
    });
    if (res.isErr()) {
      return res;
    }
    const { data, object } = res.value;
    if (object.contentVersion !== contentVersion) {
      return new Err(
        new DfsError(
          "content_changed",
          "The file changed while it was being read."
        )
      );
    }
    return new Ok(Buffer.from(data));
  }

  /**
   * @cc [owner:fabiencelier,label:error-handling] read-stream-errors
   * Exception to `no-catching-own-errors`, which requires expected failures to be returned as `Err`:
   * an async generator can only report failures by throwing, so read failures MUST be thrown as the
   * `DfsError` returned by `readChunk` (`Readable.from` then emits them as stream errors). Within
   * this class they are only caught by `writeContent`, when `copy` writes a read stream (see
   * `content-stream-errors`).
   */
  private async *readChunks(
    objectId: DfsObjectId,
    contentVersion: bigint
  ): AsyncGenerator<Buffer> {
    let offset = 0;
    while (true) {
      const chunk = await this.readChunk(objectId, offset, contentVersion);
      if (chunk.isErr()) {
        throw chunk.error;
      }
      if (chunk.value.length > 0) {
        yield chunk.value;
      }
      if (chunk.value.length < this.readChunkBytes) {
        return;
      }
      offset += chunk.value.length;
    }
  }

  private async resolveFile(
    path: string
  ): Promise<Result<{ objectId: DfsObjectId; attr: DfsAttr }, DfsError>> {
    const segments = parsePath(path);
    if (segments.isErr()) {
      return segments;
    }
    const attr = await this.requireSegments(segments.value);
    if (attr.isErr()) {
      return attr;
    }
    if (attr.value.directory) {
      return new Err(new DfsError("is_directory"));
    }
    const objectId = realIdOf(attr.value);
    return objectId.isErr()
      ? objectId
      : new Ok({ objectId: objectId.value, attr: attr.value });
  }

  /**
   * Streams the file at `path`. Read failures, including `content_changed` when the file changes
   * while streaming, are emitted as stream errors carrying a `DfsError`.
   */
  async readStream(path: string): Promise<Result<Readable, DfsError>> {
    const file = await this.resolveFile(path);
    if (file.isErr()) {
      return file;
    }
    const { objectId, attr } = file.value;
    return new Ok(
      Readable.from(this.readChunks(objectId, attr.contentVersion))
    );
  }

  async readBuffer(path: string): Promise<Result<Buffer, DfsError>> {
    const file = await this.resolveFile(path);
    if (file.isErr()) {
      return file;
    }
    const { objectId, attr } = file.value;
    const chunks: Buffer[] = [];
    let offset = 0;
    while (true) {
      const chunk = await this.readChunk(objectId, offset, attr.contentVersion);
      if (chunk.isErr()) {
        return chunk;
      }
      chunks.push(chunk.value);
      if (chunk.value.length < this.readChunkBytes) {
        return new Ok(Buffer.concat(chunks));
      }
      offset += chunk.value.length;
    }
  }

  /**
   * Creates or replaces the file at `path`, see `atomic-writes`. Returns its final attributes. A
   * `Readable` content is consumed, or destroyed when the write fails before consuming it.
   */
  async write(
    path: string,
    content: DfsWriteContent,
    options: { mimeType?: string; createParents?: boolean } = {}
  ): Promise<Result<DfsAttr, DfsError>> {
    const written = await this.writeContent(path, content, options);
    if (content instanceof Readable && !content.readableEnded) {
      content.destroy();
    }
    return written;
  }

  private async writeContent(
    path: string,
    content: DfsWriteContent,
    {
      mimeType,
      createParents = false,
    }: { mimeType?: string; createParents?: boolean }
  ): Promise<Result<DfsAttr, DfsError>> {
    const segments = parsePath(path);
    if (segments.isErr()) {
      return segments;
    }
    const name = segments.value.at(-1);
    if (name === undefined) {
      return new Err(new DfsError("is_directory", "Cannot write the root."));
    }
    const parentId = await this.requireDirectoryId(
      segments.value.slice(0, -1),
      {
        create: createParents,
      }
    );
    if (parentId.isErr()) {
      return parentId;
    }
    const existing = await this.lookupChild(parentId.value, name);
    if (existing.isErr()) {
      return existing;
    }
    if (existing.value?.directory) {
      return new Err(new DfsError("is_directory"));
    }

    try {
      return await this.writeChunks({
        parentId: parentId.value,
        name,
        existing: existing.value,
        chunks: contentChunks(content, this.writeChunkBytes),
        mimeType,
      });
    } catch (err) {
      // See `content-stream-errors`.
      if (err instanceof DfsError) {
        return new Err(err);
      }
      throw err;
    }
  }

  private async writeChunks({
    parentId,
    name,
    existing,
    chunks,
    mimeType,
  }: {
    parentId: DfsObjectId;
    name: string;
    existing: DfsAttr | null;
    chunks: AsyncGenerator<Buffer>;
    mimeType: string | undefined;
  }): Promise<Result<DfsAttr, DfsError>> {
    const first = await chunks.next();
    const second = first.done ? first : await chunks.next();
    if (second.done) {
      return this.writeSingleChunk({
        parentId,
        name,
        existing,
        data: first.done ? null : first.value,
        mimeType,
      });
    }

    const uploadId = newDfsObjectId();
    let uploaded: Result<void, DfsError>;
    try {
      uploaded = await this.upload({
        parentId,
        uploadId,
        chunks: [first.value, second.value],
        rest: chunks,
        mimeType,
      });
    } catch (err) {
      // The content stream failed (see `content-stream-errors`): clean up, then propagate as is.
      await this.removeUpload(uploadId);
      throw err;
    }
    if (uploaded.isErr()) {
      await this.removeUpload(uploadId);
      return uploaded;
    }

    const renamed = await this.client.apply({
      operations: [
        { type: "rename", objectId: uploadId, parentId, name, replace: true },
      ],
    });
    if (renamed.isErr()) {
      // The rename may have committed: leave the upload in place (see `upload-cleanup`).
      return renamed;
    }
    const [result] = renamed.value.results;
    switch (result.status) {
      case "ok":
        return result.mutation.object
          ? new Ok(result.mutation.object)
          : new Err(
              new DfsError("invalid_response", "Missing object attributes.")
            );
      case "error":
        // A per-operation failure did not change any state.
        await this.removeUpload(uploadId);
        return new Err(new DfsError(result.errorCode, "Final rename failed."));
      default:
        assertNever(result);
    }
  }

  /** Creates `uploadId` as a hidden sibling and writes every chunk to it, one `Apply` per chunk. */
  private async upload({
    parentId,
    uploadId,
    chunks,
    rest,
    mimeType,
  }: {
    parentId: DfsObjectId;
    uploadId: DfsObjectId;
    chunks: Buffer[];
    rest: AsyncGenerator<Buffer>;
    mimeType: string | undefined;
  }): Promise<Result<void, DfsError>> {
    // A failed create fails the following write with `not_found`, so nothing is left behind.
    let operations: DfsOperation[] = [
      {
        type: "create",
        parentId,
        name: `${UPLOAD_NAME_PREFIX}${uploadId}`,
        objectId: uploadId,
        directory: false,
        mimeType,
      },
    ];
    let offset = 0;
    const write = async (data: Buffer) => {
      operations.push({
        type: "write",
        objectId: uploadId,
        offset,
        data,
        append: false,
      });
      offset += data.length;
      const applied = await this.applyAll(operations);
      operations = [];
      return applied;
    };
    for (const chunk of chunks) {
      const applied = await write(chunk);
      if (applied.isErr()) {
        return applied;
      }
    }
    for await (const chunk of rest) {
      const applied = await write(chunk);
      if (applied.isErr()) {
        return applied;
      }
    }
    return new Ok(undefined);
  }

  /** Best effort: the upload is a hidden file that never replaced the target. */
  private async removeUpload(uploadId: DfsObjectId): Promise<void> {
    await this.client.apply({
      operations: [{ type: "remove", objectId: uploadId, directory: false }],
    });
  }

  private async writeSingleChunk({
    parentId,
    name,
    existing,
    data,
    mimeType,
  }: {
    parentId: DfsObjectId;
    name: string;
    existing: DfsAttr | null;
    data: Buffer | null;
    mimeType: string | undefined;
  }): Promise<Result<DfsAttr, DfsError>> {
    let objectId: DfsObjectId;
    const operations: DfsOperation[] = [];
    if (existing) {
      const existingId = realIdOf(existing);
      if (existingId.isErr()) {
        return existingId;
      }
      objectId = existingId.value;
      if (mimeType !== undefined) {
        // An invalid MIME type must not let the content change go through (see `atomic-writes`).
        const updated = await this.applyAll([
          { type: "update", objectId, mimeType },
        ]);
        if (updated.isErr()) {
          return updated;
        }
      }
      operations.push({ type: "update", objectId, size: 0 });
    } else {
      // A failed create fails the following write with `not_found`.
      objectId = newDfsObjectId();
      operations.push({
        type: "create",
        parentId,
        name,
        objectId,
        directory: false,
        mimeType,
      });
    }
    if (data) {
      operations.push({
        type: "write",
        objectId,
        offset: 0,
        data,
        append: false,
      });
    }
    return this.applyForObject(operations);
  }

  /** Removes the file or directory at `path`; non-empty directories require `recursive`. */
  async remove(
    path: string,
    { recursive = false }: { recursive?: boolean } = {}
  ): Promise<Result<void, DfsError>> {
    const segments = parsePath(path);
    if (segments.isErr()) {
      return segments;
    }
    if (segments.value.length === 0) {
      return new Err(new DfsError("invalid_input", "Cannot remove the root."));
    }
    const attr = await this.requireSegments(segments.value);
    if (attr.isErr()) {
      return attr;
    }
    const objectId = realIdOf(attr.value);
    if (objectId.isErr()) {
      return objectId;
    }
    const self: DfsOperation = {
      type: "remove",
      objectId: objectId.value,
      directory: attr.value.directory,
    };
    if (!attr.value.directory || !recursive) {
      const removed = await this.applyAll([self]);
      return removed.isErr() ? removed : new Ok(undefined);
    }

    const removals = await this.collectRemovals(objectId.value);
    if (removals.isErr()) {
      return removals;
    }
    // Children always precede their parent, so sequential batches never hit `not_empty`.
    const operations = [...removals.value, self];
    for (let i = 0; i < operations.length; i += MAX_REMOVALS_PER_APPLY) {
      const removed = await this.applyAll(
        operations.slice(i, i + MAX_REMOVALS_PER_APPLY)
      );
      if (removed.isErr()) {
        return removed;
      }
    }
    return new Ok(undefined);
  }

  /** Remove operations for every descendant of `directoryId`, children before parents. */
  private async collectRemovals(
    directoryId: DfsObjectId
  ): Promise<Result<DfsOperation[], DfsError>> {
    const entries = await this.listById(directoryId);
    if (entries.isErr()) {
      return entries;
    }
    const removals: DfsOperation[] = [];
    for (const entry of entries.value) {
      const attr = entry.object
        ? new Ok(entry.object)
        : await this.lookupChild(directoryId, entry.name);
      if (attr.isErr()) {
        return attr;
      }
      if (!attr.value) {
        // Removed concurrently.
        continue;
      }
      const childId = realIdOf(attr.value);
      if (childId.isErr()) {
        return childId;
      }
      if (attr.value.directory) {
        const nested = await this.collectRemovals(childId.value);
        if (nested.isErr()) {
          return nested;
        }
        removals.push(...nested.value);
      }
      removals.push({
        type: "remove",
        objectId: childId.value,
        directory: attr.value.directory,
      });
    }
    return new Ok(removals);
  }

  /** Copies the file at `src` to `dest` (bytes and MIME type) by streaming it through front. */
  async copy(
    src: string,
    dest: string,
    { createParents = false }: { createParents?: boolean } = {}
  ): Promise<Result<DfsAttr, DfsError>> {
    const file = await this.resolveFile(src);
    if (file.isErr()) {
      return file;
    }
    const { objectId, attr } = file.value;
    const withMetadata = await this.statById(objectId, true);
    if (withMetadata.isErr()) {
      return withMetadata;
    }
    return this.write(
      dest,
      Readable.from(this.readChunks(objectId, attr.contentVersion)),
      { mimeType: withMetadata.value.metadata?.mimeType, createParents }
    );
  }

  /** Moves or renames `src` to `dest`, keeping its ObjectId. */
  async move(
    src: string,
    dest: string,
    { replace = false }: { replace?: boolean } = {}
  ): Promise<Result<DfsAttr, DfsError>> {
    const srcSegments = parsePath(src);
    if (srcSegments.isErr()) {
      return srcSegments;
    }
    const destSegments = parsePath(dest);
    if (destSegments.isErr()) {
      return destSegments;
    }
    const name = destSegments.value.at(-1);
    if (srcSegments.value.length === 0 || name === undefined) {
      return new Err(new DfsError("invalid_input", "Cannot move the root."));
    }
    const attr = await this.requireSegments(srcSegments.value);
    if (attr.isErr()) {
      return attr;
    }
    const objectId = realIdOf(attr.value);
    if (objectId.isErr()) {
      return objectId;
    }
    const parentId = await this.requireDirectoryId(
      destSegments.value.slice(0, -1),
      { create: false }
    );
    if (parentId.isErr()) {
      return parentId;
    }
    return this.applyForObject([
      {
        type: "rename",
        objectId: objectId.value,
        parentId: parentId.value,
        name,
        replace,
      },
    ]);
  }
}
