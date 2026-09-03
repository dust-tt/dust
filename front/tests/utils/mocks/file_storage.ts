import { Ok } from "@app/types/shared/result";
import { PassThrough, Readable } from "stream";
import { vi } from "vitest";

interface WriteStreamCall {
  filePath: string;
  contentType: string | undefined;
}

interface SaveFileCall {
  filePath: string;
  content: Buffer | string;
  contentType: string | undefined;
}

interface SignedUrlCall {
  filePath: string;
  options: Record<string, unknown> | undefined;
}

interface MockFileMetadata {
  contentType: string;
  size: string;
  contentEncoding?: string;
  contentDisposition?: string;
}

class MockGcsError extends Error {
  constructor(
    readonly code: number,
    message: string
  ) {
    super(message);
  }
}

// Minimal duck-typed stand-in for the GCS `File` objects `getSortedFileVersions` resolves to.
// Callers (e.g. FileResource.revert()) only ever call `.copy(dest)` and `.delete()` on them.
export interface MockFileVersion {
  copy: (dest: unknown) => Promise<void>;
  delete: () => Promise<void>;
}

/**
 * Mock for @app/lib/file_storage. Globally registered in vite.setup.ts.
 *
 * Uses real PassThrough streams (compatible with `pipeline`) and records every
 * `createWriteStream` call. Use `writeStreamCalls` to inspect recorded writes and `reset()`
 * to clear them between tests.
 *
 * Usage in tests:
 *   import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
 *   const writes = fileStorageMock.writeStreamCalls;
 */
class FileStorageMock {
  private _writeStreamCalls: WriteStreamCall[] = [];
  private _readStreamCalls: string[] = [];
  private _saveFileCalls: SaveFileCall[] = [];
  private _signedUrlCalls: SignedUrlCall[] = [];
  private _signedUploadUrlCalls: SignedUrlCall[] = [];
  private _metadataCalls: string[] = [];
  private _objectStore = new Map<string, string>();
  private _fetchNotFoundPredicate: (filePath: string) => boolean = () => false;
  private _existsPredicate: (filePath: string) => boolean = () => true;
  private _saveShouldFail: (filePath: string) => boolean = () => false;
  private _metadataForPath: (filePath: string) => MockFileMetadata | null =
    () => null;
  private _contentForPath: (filePath: string) => string | null = () => null;
  private _sortedFileVersions: (filePath: string) => MockFileVersion[] | null =
    () => null;
  private _copyFileShouldFail: (src: string, dest: string) => boolean = () =>
    false;
  private _filesByPrefix: (
    prefix: string
  ) => { name: string; metadata: Record<string, unknown> }[] | null = () =>
    null;
  private _subdirectoryNames: (prefix: string) => string[] | null = () => null;
  private _deletedPrefixes: string[] = [];
  private _onDeleteByPrefix: (prefix: string) => void = () => {};
  private _ignoreDeleteByPrefixInListings = false;

  get writeStreamCalls(): readonly WriteStreamCall[] {
    return this._writeStreamCalls;
  }

  get readStreamCalls(): readonly string[] {
    return this._readStreamCalls;
  }

  get saveFileCalls(): readonly SaveFileCall[] {
    return this._saveFileCalls;
  }

  get signedUrlCalls(): readonly SignedUrlCall[] {
    return this._signedUrlCalls;
  }

  get signedUploadUrlCalls(): readonly SignedUrlCall[] {
    return this._signedUploadUrlCalls;
  }

  get metadataCalls(): readonly string[] {
    return this._metadataCalls;
  }

  /**
   * Controls what `file(path).exists()` resolves to, keyed by the GCS path.
   * Defaults to always-exists. Reset between tests via `reset()`.
   */
  setFileExists(predicate: (filePath: string) => boolean): void {
    this._existsPredicate = predicate;
  }

  /**
   * Makes `file(path).save(...)` reject, and `file(path).createWriteStream(...)` emit an error,
   * for paths matching the predicate. Defaults to never failing. Reset between tests via
   * `reset()`.
   */
  setFileSaveFails(predicate: (filePath: string) => boolean): void {
    this._saveShouldFail = predicate;
  }

  /**
   * Controls what `file(path).getMetadata()` resolves to, keyed by the GCS path.
   * Return null to fall back to the default (`text/plain`, size 0). Reset between tests
   * via `reset()`.
   */
  setFileMetadata(fn: (filePath: string) => MockFileMetadata | null): void {
    this._metadataForPath = fn;
  }

  /**
   * Controls what `file(path).createReadStream()` streams, keyed by the GCS path.
   * Return null to fall back to the default empty stream. Reset between tests via `reset()`.
   */
  setFileContent(fn: (filePath: string) => string | null): void {
    this._contentForPath = fn;
  }

  /**
   * Controls what `bucket.getSortedFileVersions({ filePath })` resolves to (newest first),
   * keyed by the file path. Return null (the default) to resolve an empty list, matching "no
   * previous version available". Reset between tests via `reset()`.
   */
  setSortedFileVersions(
    fn: (filePath: string) => MockFileVersion[] | null
  ): void {
    this._sortedFileVersions = fn;
  }

  /**
   * Makes `bucket.copyFile(src, dest)` reject for (src, dest) pairs matching the predicate.
   * Defaults to never failing. Reset between tests via `reset()`.
   */
  setCopyFileFails(predicate: (src: string, dest: string) => boolean): void {
    this._copyFileShouldFail = predicate;
  }

  /**
   * Controls what `bucket.getAllFilesByPrefix({ prefix })` resolves to, keyed by the prefix. Return
   * null (the default) to resolve an empty list. Reset between tests via `reset()`.
   */
  setFilesByPrefix(
    fn: (
      prefix: string
    ) => { name: string; metadata: Record<string, unknown> }[] | null
  ): void {
    this._filesByPrefix = fn;
  }

  /**
   * Controls what `bucket.listSubdirectoryNames({ prefix })` resolves to, keyed by the prefix.
   * Return null (the default) to resolve an empty list. Reset between tests via `reset()`.
   */
  setSubdirectoryNames(fn: (prefix: string) => string[] | null): void {
    this._subdirectoryNames = fn;
  }

  /**
   * Observe every `bucket.deleteByPrefix(prefix)` call, e.g. to assert the order of a delete
   * sequence. Reset between tests via `reset()`.
   */
  setOnDeleteByPrefix(fn: (prefix: string) => void): void {
    this._onDeleteByPrefix = fn;
  }

  /**
   * Make `listSubdirectoryNames` ignore prior `deleteByPrefix` calls, so a prefix keeps being listed
   * after it was deleted. Simulates a silently-failed prefix wipe. Reset between tests via `reset()`.
   */
  setIgnoreDeleteByPrefixInListings(ignore: boolean): void {
    this._ignoreDeleteByPrefixInListings = ignore;
  }

  /**
   * Makes `fetchFileContent(path)` throw a GCS-shaped not-found error
   * (`{ code: 404 }`) for matching paths that were not previously written via
   * `uploadRawContentToBucket` and have no `setFileContent` override. Enables
   * write-then-read round-trips against the in-memory object store. Defaults
   * to never throwing (legacy `"mock content"` fallback). Reset between tests
   * via `reset()`.
   */
  setFetchFileContentNotFound(predicate: (filePath: string) => boolean): void {
    this._fetchNotFoundPredicate = predicate;
  }

  /**
   * Returns the content last written to `filePath` via
   * `uploadRawContentToBucket`, or undefined if absent (never written or
   * deleted).
   */
  getObject(filePath: string): string | undefined {
    return this._objectStore.get(filePath);
  }

  // Seed the in-memory object store directly (no write path).
  setObject(filePath: string, content: string): void {
    this._objectStore.set(filePath, content);
  }

  reset(): void {
    this._writeStreamCalls.length = 0;
    this._readStreamCalls.length = 0;
    this._saveFileCalls.length = 0;
    this._signedUrlCalls.length = 0;
    this._signedUploadUrlCalls.length = 0;
    this._metadataCalls.length = 0;
    this._objectStore.clear();
    this._fetchNotFoundPredicate = () => false;
    this._existsPredicate = () => true;
    this._saveShouldFail = () => false;
    this._metadataForPath = () => null;
    this._contentForPath = () => null;
    this._sortedFileVersions = () => null;
    this._copyFileShouldFail = () => false;
    this._filesByPrefix = () => null;
    this._subdirectoryNames = () => null;
    this._deletedPrefixes.length = 0;
    this._onDeleteByPrefix = () => {};
    this._ignoreDeleteByPrefixInListings = false;
  }

  /**
   * Returns the module shape expected by `vi.mock("@app/lib/file_storage", ...)`.
   */
  mock() {
    const createStorage = () => this.createMockStorage();

    return {
      FileStorage: vi.fn().mockImplementation(createStorage),
      // Passthrough: run the operation once, without retry or backoff.
      withRetryOnTransientGCSError: vi.fn(
        async (operation: () => Promise<unknown>) => operation()
      ),
      getBucketInstance: vi.fn(createStorage),
      getPrivateUploadBucket: vi.fn(createStorage),
      getPublicUploadBucket: vi.fn(createStorage),
      getUpsertQueueBucket: vi.fn(createStorage),
      getTmpWorkloadsBucket: vi.fn(createStorage),
      getDustDataSourcesBucket: vi.fn(createStorage),
      getWebhookRequestsBucket: vi.fn(createStorage),
      getLLMTracesBucket: vi.fn(createStorage),
      getPokeUserConfigBucket: vi.fn(createStorage),
    };
  }

  private createMockGCSFile(filePath?: string) {
    return {
      copy: vi.fn().mockResolvedValue(undefined),
      createReadStream: vi.fn(() => {
        const path = filePath ?? "unknown";
        this._readStreamCalls.push(path);
        const content =
          this._objectStore.get(path) ?? this._contentForPath(path);
        if (content !== null && content !== undefined) {
          return Readable.from([Buffer.from(content, "utf8")]);
        }
        return new PassThrough();
      }),
      createWriteStream: vi
        .fn()
        .mockImplementation((opts?: { contentType?: string }) => {
          const path = filePath ?? "unknown";
          this._writeStreamCalls.push({
            filePath: path,
            contentType: opts?.contentType,
          });
          const stream = new PassThrough();
          if (this._saveShouldFail(path)) {
            // Deferred so `pipeline()` has already attached its error listeners
            queueMicrotask(() =>
              stream.destroy(new Error(`Simulated GCS write failure: ${path}`))
            );
          }
          return stream;
        }),
      delete: vi.fn().mockImplementation(() => {
        this._objectStore.delete(filePath ?? "unknown");
        return Promise.resolve(undefined);
      }),
      download: vi.fn().mockImplementation(() => {
        const content = this._objectStore.get(filePath ?? "unknown") ?? "";
        return Promise.resolve([Buffer.from(content, "utf-8")]);
      }),
      exists: vi.fn(() =>
        Promise.resolve([this._existsPredicate(filePath ?? "")])
      ),
      getMetadata: vi.fn(() => {
        const path = filePath ?? "";
        this._metadataCalls.push(path);
        return Promise.resolve([
          this._metadataForPath(path) ?? {
            contentType: "text/plain",
            size: "0",
          },
        ]);
      }),
      getSignedUrl: vi.fn().mockResolvedValue(["https://signed-url.test"]),
      publicUrl: vi.fn().mockReturnValue("https://public-url.test"),
      save: vi
        .fn()
        .mockImplementation(
          (content: Buffer | string, opts?: { contentType?: string }) => {
            const path = filePath ?? "unknown";
            if (this._saveShouldFail(path)) {
              return Promise.reject(
                new Error(`Simulated GCS write failure: ${path}`)
              );
            }
            this._saveFileCalls.push({
              filePath: path,
              content,
              contentType: opts?.contentType,
            });
            this._objectStore.set(path, content.toString());
            return Promise.resolve(undefined);
          }
        ),
    };
  }

  private createMockStorage() {
    return {
      file: vi.fn((path: string) => this.createMockGCSFile(path)),
      name: "mock-bucket",
      getFileContentType: vi
        .fn()
        .mockResolvedValue({ isOk: () => false, isErr: () => true }),
      getSignedUrl: vi.fn(
        (filePath: string, options?: Record<string, unknown>) => {
          this._signedUrlCalls.push({ filePath, options });
          return Promise.resolve("https://signed-url.test");
        }
      ),
      getSignedUploadUrl: vi.fn(
        (filePath: string, options?: Record<string, unknown>) => {
          this._signedUploadUrlCalls.push({ filePath, options });
          return Promise.resolve("https://signed-upload-url.test");
        }
      ),
      uploadFileToBucket: vi.fn().mockResolvedValue(undefined),
      uploadBufferToBucket: vi.fn(
        (args: { buffer: Buffer; contentType: string; filePath: string }) => {
          if (this._saveShouldFail(args.filePath)) {
            return Promise.reject(
              new Error(`Simulated GCS write failure: ${args.filePath}`)
            );
          }
          this._objectStore.set(args.filePath, args.buffer.toString());
          this._saveFileCalls.push({
            filePath: args.filePath,
            content: args.buffer,
            contentType: args.contentType,
          });
          return Promise.resolve(undefined);
        }
      ),
      uploadRawContentToBucket: vi.fn(
        (args: { content: string; contentType: string; filePath: string }) => {
          this._objectStore.set(args.filePath, args.content);
          this._saveFileCalls.push({
            filePath: args.filePath,
            content: args.content,
            contentType: args.contentType,
          });
          return Promise.resolve(undefined);
        }
      ),
      uploadSmallRawContentToBucketAsNewFile: vi.fn(
        (args: { content: string; contentType: string; filePath: string }) => {
          if (this._objectStore.has(args.filePath)) {
            return Promise.reject(
              new MockGcsError(412, `Object already exists: ${args.filePath}`)
            );
          }
          if (this._saveShouldFail(args.filePath)) {
            return Promise.reject(
              new Error(`Simulated GCS write failure: ${args.filePath}`)
            );
          }
          this._objectStore.set(args.filePath, args.content);
          this._saveFileCalls.push({
            filePath: args.filePath,
            content: args.content,
            contentType: args.contentType,
          });
          return Promise.resolve(undefined);
        }
      ),
      fetchFileContent: vi.fn((filePath: string) => {
        const stored = this._objectStore.get(filePath);
        if (stored !== undefined) {
          return Promise.resolve(stored);
        }
        const content = this._contentForPath(filePath);
        if (content !== null) {
          return Promise.resolve(content);
        }
        if (this._fetchNotFoundPredicate(filePath)) {
          // Same shape isGCSNotFoundError matches on real GCS ApiErrors.
          return Promise.reject(
            new MockGcsError(404, `No such object: ${filePath}`)
          );
        }
        return Promise.resolve("mock content");
      }),
      fetchFileBuffer: vi.fn((filePath: string) => {
        const stored = this._objectStore.get(filePath);
        if (stored !== undefined) {
          return Promise.resolve(Uint8Array.from(Buffer.from(stored)));
        }
        if (this._fetchNotFoundPredicate(filePath)) {
          return Promise.reject(
            new MockGcsError(404, `No such object: ${filePath}`)
          );
        }
        return Promise.resolve(new Uint8Array());
      }),
      copyFile: vi.fn((src: string, dest: string) => {
        if (this._copyFileShouldFail(src, dest)) {
          return Promise.reject(
            new Error(`Simulated GCS copy failure: ${src} -> ${dest}`)
          );
        }
        const content = this._objectStore.get(src) ?? this._contentForPath(src);
        if (content !== null && content !== undefined) {
          this._objectStore.set(dest, content);
        }
        return Promise.resolve(undefined);
      }),
      // Mirrors real GCS compose: concatenates each source's stored content, in order,
      // into the destination object.
      composeFiles: vi.fn((sourcePaths: string[], destinationPath: string) => {
        const combined = sourcePaths
          .map((path) => this._objectStore.get(path) ?? "")
          .join("");
        this._objectStore.set(destinationPath, combined);
        this._saveFileCalls.push({
          filePath: destinationPath,
          content: combined,
          contentType: destinationPath.endsWith(".csv")
            ? "text/csv"
            : undefined,
        });
        return Promise.resolve(undefined);
      }),
      delete: vi.fn((filePath: string) => {
        this._objectStore.delete(filePath);
        return Promise.resolve(undefined);
      }),
      deleteByPrefix: vi.fn(async (prefix: string) => {
        this._deletedPrefixes.push(prefix);
        this._onDeleteByPrefix(prefix);
        for (const path of [...this._objectStore.keys()]) {
          if (path.startsWith(prefix)) {
            this._objectStore.delete(path);
          }
        }
      }),
      deleteFiles: vi.fn().mockResolvedValue(undefined),
      getAllFilesByPrefix: vi.fn(({ prefix }: { prefix: string }) =>
        Promise.resolve({
          files: this._filesByPrefix(prefix) ?? [],
          pageFetchCount: 1,
        })
      ),
      getFiles: vi.fn(
        ({ prefix, maxResults }: { prefix: string; maxResults: number }) =>
          Promise.resolve(
            (this._filesByPrefix(prefix) ?? []).slice(0, maxResults)
          )
      ),
      listSubdirectoryNames: vi.fn(({ prefix }: { prefix: string }) => {
        const normalized = prefix.endsWith("/") ? prefix : `${prefix}/`;
        const names = (this._subdirectoryNames(prefix) ?? []).filter(
          (name) =>
            this._ignoreDeleteByPrefixInListings ||
            (!this._deletedPrefixes.includes(`${normalized}${name}/`) &&
              !this._deletedPrefixes.includes(normalized))
        );
        return Promise.resolve(names);
      }),
      getSortedFileVersions: vi.fn(({ filePath }: { filePath: string }) =>
        Promise.resolve(new Ok(this._sortedFileVersions(filePath) ?? []))
      ),
    };
  }
}

export const fileStorageMock = new FileStorageMock();
