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
  private _objectStore = new Map<string, string>();
  private _fetchNotFoundPredicate: (filePath: string) => boolean = () => false;
  private _existsPredicate: (filePath: string) => boolean = () => true;
  private _saveShouldFail: (filePath: string) => boolean = () => false;
  private _metadataForPath: (
    filePath: string
  ) => { contentType: string; size: string } | null = () => null;
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

  get writeStreamCalls(): readonly WriteStreamCall[] {
    return this._writeStreamCalls;
  }

  get readStreamCalls(): readonly string[] {
    return this._readStreamCalls;
  }

  get saveFileCalls(): readonly SaveFileCall[] {
    return this._saveFileCalls;
  }

  /**
   * Controls what `file(path).exists()` resolves to, keyed by the GCS path.
   * Defaults to always-exists. Reset between tests via `reset()`.
   */
  setFileExists(predicate: (filePath: string) => boolean): void {
    this._existsPredicate = predicate;
  }

  /**
   * Makes `file(path).save(...)` reject for paths matching the predicate.
   * Defaults to never failing. Reset between tests via `reset()`.
   */
  setFileSaveFails(predicate: (filePath: string) => boolean): void {
    this._saveShouldFail = predicate;
  }

  /**
   * Controls what `file(path).getMetadata()` resolves to, keyed by the GCS path.
   * Return null to fall back to the default (`text/plain`, size 0). Reset between tests
   * via `reset()`.
   */
  setFileMetadata(
    fn: (filePath: string) => { contentType: string; size: string } | null
  ): void {
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

  reset(): void {
    this._writeStreamCalls.length = 0;
    this._readStreamCalls.length = 0;
    this._saveFileCalls.length = 0;
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
      getDustDataSourcesBucket: vi.fn(createStorage),
      getWebhookRequestsBucket: vi.fn(createStorage),
      getLLMTracesBucket: vi.fn(createStorage),
    };
  }

  private createMockGCSFile(filePath?: string) {
    return {
      copy: vi.fn().mockResolvedValue(undefined),
      createReadStream: vi.fn(() => {
        this._readStreamCalls.push(filePath ?? "unknown");
        const content = this._contentForPath(filePath ?? "");
        if (content !== null) {
          return Readable.from([Buffer.from(content, "utf8")]);
        }
        return new PassThrough();
      }),
      createWriteStream: vi
        .fn()
        .mockImplementation((opts?: { contentType?: string }) => {
          this._writeStreamCalls.push({
            filePath: filePath ?? "unknown",
            contentType: opts?.contentType,
          });
          return new PassThrough();
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
      getMetadata: vi.fn(() =>
        Promise.resolve([
          this._metadataForPath(filePath ?? "") ?? {
            contentType: "text/plain",
            size: "0",
          },
        ])
      ),
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
      getSignedUrl: vi.fn().mockResolvedValue("https://signed-url.test"),
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
      uploadSmallRawContentToBucketAsNewFile: vi
        .fn()
        .mockResolvedValue(undefined),
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
            Object.assign(new Error(`No such object: ${filePath}`), {
              code: 404,
            })
          );
        }
        return Promise.resolve("mock content");
      }),
      fetchFileBuffer: vi.fn().mockResolvedValue(new Uint8Array()),
      copyFile: vi.fn((src: string, dest: string) => {
        if (this._copyFileShouldFail(src, dest)) {
          return Promise.reject(
            new Error(`Simulated GCS copy failure: ${src} -> ${dest}`)
          );
        }
        return Promise.resolve(undefined);
      }),
      delete: vi.fn((filePath: string) => {
        this._objectStore.delete(filePath);
        return Promise.resolve(undefined);
      }),
      deleteByPrefix: vi.fn(async (prefix: string) => {
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
      listSubdirectoryNames: vi.fn(({ prefix }: { prefix: string }) =>
        Promise.resolve(this._subdirectoryNames(prefix) ?? [])
      ),
      getSortedFileVersions: vi.fn(({ filePath }: { filePath: string }) =>
        Promise.resolve(new Ok(this._sortedFileVersions(filePath) ?? []))
      ),
    };
  }
}

export const fileStorageMock = new FileStorageMock();
