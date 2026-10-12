import type { DfsClient } from "@app/lib/dfs/client";
import { formatDfsUri, parseDfsUri } from "@app/lib/dfs/uri";
import type { DfsAttr, DfsEntry, DfsObjectId } from "@app/types/dfs";
import { DfsError, isDfsObjectId } from "@app/types/dfs";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { Readable } from "stream";

/** The `DfsClient` calls the file system relies on. */
export type DfsFileSystemClient = Pick<
  DfsClient,
  "list" | "lookup" | "read" | "stat"
>;

/** An object's attributes with its canonical URI (`dfs://<name>--<id>`, no path). */
export interface DfsResolvedObject {
  uri: string;
  attr: DfsAttr;
}

// Server limit for one `Read`.
const MAX_READ_CHUNK_BYTES = 1024 * 1024;
const LIST_PAGE_LIMIT = 4096;

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
 * @cc [owner:fabiencelier,label:product] consistent-reads
 * Multi-chunk reads MUST check every chunk's returned `contentVersion` against the one observed when
 * resolving the file, so that a concurrent modification fails the read with `content_changed`
 * instead of mixing two versions.
 */
export class DfsFileSystem {
  private readonly readChunkBytes: number;

  constructor(
    private readonly client: DfsFileSystemClient,
    options: { readChunkBytes?: number } = {}
  ) {
    this.readChunkBytes = Math.min(
      options.readChunkBytes ?? MAX_READ_CHUNK_BYTES,
      MAX_READ_CHUNK_BYTES
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

  /** Immediate children of the directory at `uri`, in basename order. */
  async list(uri: string): Promise<Result<DfsEntry[], DfsError>> {
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
   * `DfsError` returned by `readChunk` (`Readable.from` then emits them as stream errors).
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
    return new Ok(
      Readable.from(this.readChunks(objectId, attr.contentVersion))
    );
  }

  async readBuffer(uri: string): Promise<Result<Buffer, DfsError>> {
    const file = await this.resolveFile(uri);
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
}
