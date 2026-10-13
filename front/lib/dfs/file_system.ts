import type { DfsClient } from "@app/lib/dfs/client";
import { newDfsObjectId } from "@app/lib/dfs/object_id";
import { formatDfsUri, parseDfsUri } from "@app/lib/dfs/uri";
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
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { Readable } from "stream";

/** The `DfsClient` calls the file system relies on. */
export type DfsFileSystemClient = Pick<
  DfsClient,
  "apply" | "list" | "lookup" | "read" | "stat"
>;

export type DfsWriteContent = Buffer | Uint8Array | string | Readable;

/** An object's attributes with its canonical URI (`dfs://<name>--<id>`, no path). */
export interface DfsResolvedObject {
  uri: string;
  attr: DfsAttr;
}

/** A directory entry, with the child's canonical URI when the listing returned its attributes. */
export interface DfsListedEntry {
  name: string;
  object?: DfsResolvedObject;
}

// Server limit for one `Read`.
const MAX_READ_CHUNK_BYTES = 1024 * 1024;
// `Apply` requests are limited to 1 MiB encoded; keep headroom for the operation envelope.
const MAX_WRITE_CHUNK_BYTES = 1024 * 1024 - 64 * 1024;
const LIST_PAGE_LIMIT = 4096;
const MAX_REMOVALS_PER_APPLY = 512;

function isDirectory(attr: DfsAttr): boolean {
  return attr.kind === "directory";
}

function realIdOf(attr: DfsAttr): Result<DfsObjectId, DfsError> {
  return isDfsObjectId(attr.id)
    ? new Ok(attr.id)
    : new Err(new DfsError("invalid_response", "Expected a real object."));
}

function resolved(attr: DfsAttr): Result<DfsResolvedObject, DfsError> {
  const id = realIdOf(attr);
  return id.isErr()
    ? id
    : new Ok({ uri: formatDfsUri(id.value, { name: attr.name }), attr });
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
 * `DfsError`: a `DfsError` raised by the source stream unchanged, any other `Error` raised by the
 * source stream as `invalid_input`. Only `DfsFileSystem.writeContent` MAY catch
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
 * URI-based access to dfs objects, on top of the ID-based `DfsClient`; see
 * `dfs/design-docs/URI.md`. Every method takes a URI `dfs://[<name>--]<id>[/<path>]`: without a
 * path it acts on the anchor object, with one it acts on the object at that path under the anchor.
 * Each path segment costs one `lookup`: nothing is cached.
 */
/**
 * @cc [owner:fabiencelier,label:security] paths-stay-under-anchor
 * Resolution MUST start at the URI's anchor ID, as parsed by `parseDfsUri`, and only descend
 * through `lookup` by basename, one segment at a time. An invalid URI MUST fail with
 * `invalid_input` before any dfs call.
 */
/**
 * @cc [owner:fabiencelier,label:product] canonical-uris
 * Every returned `uri` MUST be the object's canonical URI: `formatDfsUri` of its real ID and current
 * name from the returned attributes, without a path. It MUST NOT echo the URI the caller passed.
 */
/**
 * @cc [owner:fabiencelier,label:product] create-missing-parents
 * `mkdir` and `write` MUST create the missing intermediate directories of a URI's path one level at
 * a time. A directory that already exists, including one created concurrently (`already_exists`),
 * MUST be reused; a file there MUST fail with `not_directory`. `mkdir` MUST fail with
 * `already_exists` when an object exists at the URI's path, and with `invalid_input` on a URI
 * without a path. Directories created for a write are kept when the write then fails. `move` MUST
 * NOT create directories.
 */
/**
 * @cc [owner:fabiencelier,label:product] chunked-writes
 * `write` MUST keep the ObjectId of an existing file. For an existing file, caller-supplied metadata
 * (MIME type) MUST be applied in its own `Apply` before the content changes, so that an invalid
 * value leaves the file unchanged; a new file MUST be created with it. Content MUST be written with one `Apply` per chunk, in order, the first one also creating or
 * truncating the file: content fitting in one chunk is replaced atomically, larger content is not,
 * and a failure leaves the content written so far in place.
 */
/**
 * @cc [owner:fabiencelier,label:product] consistent-reads
 * Multi-chunk reads MUST check every chunk's returned `contentVersion` against the one observed when
 * resolving the file, so that a concurrent modification fails the read with `content_changed`
 * instead of mixing two versions. Since a read MAY return fewer bytes than requested, reads MUST
 * continue until the file's `size` observed when resolving it, and fail with `invalid_response` on
 * an empty read before that.
 */
export class DfsFileSystem {
  private readonly readChunkBytes: number;
  private readonly writeChunkBytes: number;

  constructor(
    private readonly client: DfsFileSystemClient,
    options: { readChunkBytes?: number; writeChunkBytes?: number } = {}
  ) {
    // At least one byte, so that every read makes progress.
    this.readChunkBytes = Math.max(
      1,
      Math.min(
        options.readChunkBytes ?? MAX_READ_CHUNK_BYTES,
        MAX_READ_CHUNK_BYTES
      )
    );
    // At least one byte, so that every write makes progress.
    this.writeChunkBytes = Math.max(
      1,
      Math.min(
        options.writeChunkBytes ?? MAX_WRITE_CHUNK_BYTES,
        MAX_WRITE_CHUNK_BYTES
      )
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
  ): Promise<Result<DfsAttr | null, DfsError>> {
    const res = await this.client.stat({
      objectIds: [objectId],
      includeMetadata,
    });
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

  /**
   * Attributes of the longest existing prefix of `segments` under `anchorId`. Fails with
   * `not_directory` when a non-final segment is a file.
   */
  private async walk(
    anchorId: DfsObjectId,
    segments: string[]
  ): Promise<Result<DfsAttr[], DfsError>> {
    const attrs: DfsAttr[] = [];
    let parentId = anchorId;
    for (const name of segments) {
      const parent = attrs.at(-1);
      if (parent && !isDirectory(parent)) {
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

  /** Attributes of the object `uri` designates, or null when nothing exists there. */
  private async resolve(
    uri: string
  ): Promise<Result<DfsAttr | null, DfsError>> {
    const parsed = parseDfsUri(uri);
    if (parsed.isErr()) {
      return parsed;
    }
    const { anchorId, segments } = parsed.value;
    if (segments.length === 0) {
      return this.statById(anchorId, false);
    }
    const attrs = await this.walk(anchorId, segments);
    if (attrs.isErr()) {
      return attrs;
    }
    return new Ok(
      attrs.value.length === segments.length
        ? (attrs.value.at(-1) ?? null)
        : null
    );
  }

  private async require(uri: string): Promise<Result<DfsAttr, DfsError>> {
    const attr = await this.resolve(uri);
    if (attr.isErr()) {
      return attr;
    }
    return attr.value
      ? new Ok(attr.value)
      : new Err(new DfsError("not_found", `Not found: ${uri}.`));
  }

  /**
   * The ID of the directory at `segments` under `anchorId`, creating the missing ones one level at a
   * time (see `create-missing-parents`).
   */
  private async ensureDirectories(
    anchorId: DfsObjectId,
    segments: string[]
  ): Promise<Result<DfsObjectId, DfsError>> {
    let parentId = anchorId;
    for (const name of segments) {
      const child = await this.ensureDirectory(parentId, name);
      if (child.isErr()) {
        return child;
      }
      parentId = child.value;
    }
    return new Ok(parentId);
  }

  private async ensureDirectory(
    parentId: DfsObjectId,
    name: string
  ): Promise<Result<DfsObjectId, DfsError>> {
    let existing = await this.lookupChild(parentId, name);
    if (existing.isErr()) {
      return existing;
    }
    if (!existing.value) {
      const objectId = newDfsObjectId();
      const created = await this.applyAll([
        { type: "create", parentId, name, objectId, kind: "directory" },
      ]);
      if (created.isOk()) {
        return new Ok(objectId);
      }
      if (created.error.code !== "already_exists") {
        return created;
      }
      // Created concurrently: reuse it.
      existing = await this.lookupChild(parentId, name);
      if (existing.isErr()) {
        return existing;
      }
      if (!existing.value) {
        return new Err(new DfsError("already_exists"));
      }
    }
    if (!isDirectory(existing.value)) {
      return new Err(new DfsError("not_directory"));
    }
    return realIdOf(existing.value);
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
  ): Promise<Result<DfsResolvedObject, DfsError>> {
    const mutations = await this.applyAll(operations);
    if (mutations.isErr()) {
      return mutations;
    }
    const object = mutations.value.at(-1)?.object;
    return object
      ? resolved(object)
      : new Err(new DfsError("invalid_response", "Missing object attributes."));
  }

  // Public API.

  /** The object at `uri`, or null when nothing exists there. */
  async stat(
    uri: string,
    { includeMetadata = false }: { includeMetadata?: boolean } = {}
  ): Promise<Result<DfsResolvedObject | null, DfsError>> {
    const attr = await this.resolve(uri);
    if (attr.isErr()) {
      return attr;
    }
    if (!attr.value) {
      return new Ok(null);
    }
    if (!includeMetadata) {
      return resolved(attr.value);
    }
    const id = realIdOf(attr.value);
    if (id.isErr()) {
      return id;
    }
    const withMetadata = await this.statById(id.value, true);
    if (withMetadata.isErr()) {
      return withMetadata;
    }
    return withMetadata.value ? resolved(withMetadata.value) : new Ok(null);
  }

  async exists(uri: string): Promise<Result<boolean, DfsError>> {
    const attr = await this.resolve(uri);
    return attr.isErr() ? attr : new Ok(attr.value !== null);
  }

  /**
   * Immediate children of the directory at `uri`, in basename order, with the canonical URIs built
   * from the attributes `List` returns.
   */
  async list(uri: string): Promise<Result<DfsListedEntry[], DfsError>> {
    const attr = await this.require(uri);
    if (attr.isErr()) {
      return attr;
    }
    if (!isDirectory(attr.value)) {
      return new Err(new DfsError("not_directory"));
    }
    const directoryId = realIdOf(attr.value);
    if (directoryId.isErr()) {
      return directoryId;
    }
    const entries = await this.listById(directoryId.value);
    if (entries.isErr()) {
      return entries;
    }
    const listed: DfsListedEntry[] = [];
    for (const { name, object } of entries.value) {
      if (!object) {
        listed.push({ name });
        continue;
      }
      const child = resolved(object);
      if (child.isErr()) {
        return child;
      }
      listed.push({ name, object: child.value });
    }
    return new Ok(listed);
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

  /** Creates the directory at `uri` and its missing parents, see `create-missing-parents`. */
  async mkdir(uri: string): Promise<Result<DfsResolvedObject, DfsError>> {
    const parsed = parseDfsUri(uri);
    if (parsed.isErr()) {
      return parsed;
    }
    const { anchorId, segments } = parsed.value;
    const name = segments.at(-1);
    if (name === undefined) {
      return new Err(new DfsError("invalid_input", "A name is required."));
    }
    const parentId = await this.ensureDirectories(
      anchorId,
      segments.slice(0, -1)
    );
    if (parentId.isErr()) {
      return parentId;
    }
    return this.applyForObject([
      {
        type: "create",
        parentId: parentId.value,
        name,
        objectId: newDfsObjectId(),
        kind: "directory",
      },
    ]);
  }

  /**
   * Reads the chunk at `offset`, before the end of the file, failing with `content_changed` if
   * `contentVersion` moved.
   */
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
    if (data.length === 0) {
      // Callers only read before the end of the file, at an unchanged version.
      return new Err(
        new DfsError(
          "invalid_response",
          "Empty read before the end of the file."
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
    { contentVersion, size }: DfsAttr
  ): AsyncGenerator<Buffer> {
    for (let offset = 0; offset < size;) {
      const chunk = await this.readChunk(objectId, offset, contentVersion);
      if (chunk.isErr()) {
        throw chunk.error;
      }
      yield chunk.value;
      offset += chunk.value.length;
    }
  }

  private async resolveFile(
    uri: string
  ): Promise<Result<{ objectId: DfsObjectId; attr: DfsAttr }, DfsError>> {
    const attr = await this.require(uri);
    if (attr.isErr()) {
      return attr;
    }
    if (isDirectory(attr.value)) {
      return new Err(new DfsError("is_directory"));
    }
    const objectId = realIdOf(attr.value);
    return objectId.isErr()
      ? objectId
      : new Ok({ objectId: objectId.value, attr: attr.value });
  }

  /**
   * Streams the file at `uri`. Read failures, including `content_changed` when the file changes
   * while streaming, are emitted as stream errors carrying a `DfsError`.
   */
  async readStream(uri: string): Promise<Result<Readable, DfsError>> {
    const file = await this.resolveFile(uri);
    if (file.isErr()) {
      return file;
    }
    const { objectId, attr } = file.value;
    return new Ok(Readable.from(this.readChunks(objectId, attr)));
  }

  async readBuffer(uri: string): Promise<Result<Buffer, DfsError>> {
    const file = await this.resolveFile(uri);
    if (file.isErr()) {
      return file;
    }
    const { objectId, attr } = file.value;
    const chunks: Buffer[] = [];
    for (let offset = 0; offset < attr.size;) {
      const chunk = await this.readChunk(objectId, offset, attr.contentVersion);
      if (chunk.isErr()) {
        return chunk;
      }
      chunks.push(chunk.value);
      offset += chunk.value.length;
    }
    return new Ok(Buffer.concat(chunks));
  }

  /**
   * Creates or replaces the file at `uri`, see `chunked-writes` and `create-missing-parents`. A
   * `Readable` content is consumed, or destroyed when the write fails before consuming it.
   */
  async write(
    uri: string,
    content: DfsWriteContent,
    options: { mimeType?: string } = {}
  ): Promise<Result<DfsResolvedObject, DfsError>> {
    if (!(content instanceof Readable)) {
      return this.writeContent(uri, content, options);
    }
    // Until `contentChunks` iterates the stream, nothing listens to its errors: an error emitted
    // while the target is being resolved would be unhandled. Iterating an errored stream rethrows
    // its error, which then fails the write.
    const ignoreUntilConsumed = () => {};
    content.on("error", ignoreUntilConsumed);
    try {
      const written = await this.writeContent(uri, content, options);
      if (!content.readableEnded) {
        content.destroy();
      }
      return written;
    } finally {
      content.off("error", ignoreUntilConsumed);
    }
  }

  private async writeContent(
    uri: string,
    content: DfsWriteContent,
    { mimeType }: { mimeType?: string }
  ): Promise<Result<DfsResolvedObject, DfsError>> {
    const parsed = parseDfsUri(uri);
    if (parsed.isErr()) {
      return parsed;
    }
    const { anchorId, segments } = parsed.value;
    const name = segments.at(-1);
    let target: { parentId: DfsObjectId; name: string } | null = null;
    let existing: DfsAttr | null;
    if (name === undefined) {
      const anchor = await this.statById(anchorId, false);
      if (anchor.isErr()) {
        return anchor;
      }
      if (!anchor.value) {
        return new Err(new DfsError("not_found", `Not found: ${uri}.`));
      }
      existing = anchor.value;
    } else {
      const parentId = await this.ensureDirectories(
        anchorId,
        segments.slice(0, -1)
      );
      if (parentId.isErr()) {
        return parentId;
      }
      const child = await this.lookupChild(parentId.value, name);
      if (child.isErr()) {
        return child;
      }
      target = { parentId: parentId.value, name };
      existing = child.value;
    }
    if (existing && isDirectory(existing)) {
      return new Err(new DfsError("is_directory"));
    }

    try {
      return await this.writeChunks({
        target,
        existing,
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

  /** Writes `chunks` to `existing`, or to a new file at `target`, see `chunked-writes`. */
  private async writeChunks({
    target,
    existing,
    chunks,
    mimeType,
  }: {
    target: { parentId: DfsObjectId; name: string } | null;
    existing: DfsAttr | null;
    chunks: AsyncGenerator<Buffer>;
    mimeType: string | undefined;
  }): Promise<Result<DfsResolvedObject, DfsError>> {
    let objectId: DfsObjectId;
    let operations: DfsOperation[];
    if (existing) {
      const existingId = realIdOf(existing);
      if (existingId.isErr()) {
        return existingId;
      }
      objectId = existingId.value;
      if (mimeType !== undefined) {
        const updated = await this.applyAll([
          { type: "update", objectId, mimeType },
        ]);
        if (updated.isErr()) {
          return updated;
        }
      }
      operations = [{ type: "update", objectId, size: 0 }];
    } else if (target) {
      // A failed create fails the following write with `not_found`.
      objectId = newDfsObjectId();
      operations = [
        {
          type: "create",
          parentId: target.parentId,
          name: target.name,
          objectId,
          kind: "file",
          mimeType,
        },
      ];
    } else {
      return new Err(new DfsError("invalid_input", "Nothing to write to."));
    }

    let written: DfsResolvedObject | null = null;
    let offset = 0;
    for await (const data of chunks) {
      operations.push({ type: "write", objectId, offset, data, append: false });
      offset += data.length;
      const applied = await this.applyForObject(operations);
      if (applied.isErr()) {
        return applied;
      }
      written = applied.value;
      operations = [];
    }
    // Empty content: only create or truncate the file.
    return written ? new Ok(written) : this.applyForObject(operations);
  }

  /** Removes the object at `uri`; non-empty directories require `recursive`. */
  async remove(
    uri: string,
    { recursive = false }: { recursive?: boolean } = {}
  ): Promise<Result<void, DfsError>> {
    const attr = await this.require(uri);
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
      kind: attr.value.kind,
    };
    if (!isDirectory(attr.value) || !recursive) {
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
    // Every object is listed in pre-order (parents before children), once; reversing that order
    // puts each object before all of its ancestors.
    const removals: DfsOperation[] = [];
    const pending: DfsObjectId[] = [directoryId];
    for (let parentId = pending.pop(); parentId; parentId = pending.pop()) {
      const entries = await this.listById(parentId);
      if (entries.isErr()) {
        return entries;
      }
      for (const entry of entries.value) {
        const attr = entry.object
          ? new Ok(entry.object)
          : await this.lookupChild(parentId, entry.name);
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
        removals.push({
          type: "remove",
          objectId: childId.value,
          kind: attr.value.kind,
        });
        if (isDirectory(attr.value)) {
          pending.push(childId.value);
        }
      }
    }
    return new Ok(removals.reverse());
  }

  /** Copies the file at `src` to `dest` (bytes and MIME type) by streaming it through front. */
  async copy(
    src: string,
    dest: string
  ): Promise<Result<DfsResolvedObject, DfsError>> {
    const file = await this.resolveFile(src);
    if (file.isErr()) {
      return file;
    }
    const { objectId, attr } = file.value;
    // Writing a file while streaming it would truncate it before it is fully read.
    const destination = await this.resolve(dest);
    if (destination.isErr()) {
      return destination;
    }
    if (destination.value?.id === objectId) {
      return new Err(
        new DfsError("invalid_input", "Cannot copy a file onto itself.")
      );
    }
    const withMetadata = await this.statById(objectId, true);
    if (withMetadata.isErr()) {
      return withMetadata;
    }
    return this.write(
      dest,
      Readable.from(this.readChunks(objectId, attr)),
      // An empty MIME type clears the destination's, as the source has none.
      { mimeType: withMetadata.value?.metadata?.mimeType ?? "" }
    );
  }

  /** Moves or renames the object at `src` to `dest`, keeping its ObjectId. */
  async move(
    src: string,
    dest: string,
    { replace = false }: { replace?: boolean } = {}
  ): Promise<Result<DfsResolvedObject, DfsError>> {
    const destination = parseDfsUri(dest);
    if (destination.isErr()) {
      return destination;
    }
    const { anchorId, segments } = destination.value;
    const name = segments.at(-1);
    if (name === undefined) {
      return new Err(
        new DfsError("invalid_input", "The destination requires a path.")
      );
    }
    const attr = await this.require(src);
    if (attr.isErr()) {
      return attr;
    }
    const objectId = realIdOf(attr.value);
    if (objectId.isErr()) {
      return objectId;
    }
    let parentId = anchorId;
    if (segments.length > 1) {
      const parent = await this.require(
        formatDfsUri(anchorId, { path: segments.slice(0, -1) })
      );
      if (parent.isErr()) {
        return parent;
      }
      if (!isDirectory(parent.value)) {
        return new Err(new DfsError("not_directory"));
      }
      const id = realIdOf(parent.value);
      if (id.isErr()) {
        return id;
      }
      parentId = id.value;
    }
    return this.applyForObject([
      {
        type: "rename",
        objectId: objectId.value,
        parentId,
        name,
        replace,
      },
    ]);
  }
}
