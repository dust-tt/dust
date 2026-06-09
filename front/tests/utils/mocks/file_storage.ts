import { PassThrough } from "stream";
import { vi } from "vitest";

export interface WriteStreamCall {
  filePath: string;
  contentType: string | undefined;
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
  private _existsPredicate: (filePath: string) => boolean = () => true;

  get writeStreamCalls(): readonly WriteStreamCall[] {
    return this._writeStreamCalls;
  }

  /**
   * Controls what `file(path).exists()` resolves to, keyed by the GCS path.
   * Defaults to always-exists. Reset between tests via `reset()`.
   */
  setFileExists(predicate: (filePath: string) => boolean): void {
    this._existsPredicate = predicate;
  }

  reset(): void {
    this._writeStreamCalls.length = 0;
    this._existsPredicate = () => true;
  }

  /**
   * Returns the module shape expected by `vi.mock("@app/lib/file_storage", ...)`.
   */
  mock() {
    const createStorage = () => this.createMockStorage();

    return {
      FileStorage: vi.fn().mockImplementation(createStorage),
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
      createReadStream: vi.fn().mockReturnValue(new PassThrough()),
      createWriteStream: vi
        .fn()
        .mockImplementation((opts?: { contentType?: string }) => {
          this._writeStreamCalls.push({
            filePath: filePath ?? "unknown",
            contentType: opts?.contentType,
          });
          return new PassThrough();
        }),
      delete: vi.fn().mockResolvedValue(undefined),
      download: vi.fn().mockResolvedValue([Buffer.from("", "utf-8")]),
      exists: vi.fn(() =>
        Promise.resolve([this._existsPredicate(filePath ?? "")])
      ),
      getMetadata: vi
        .fn()
        .mockResolvedValue([{ contentType: "text/plain", size: "0" }]),
      getSignedUrl: vi.fn().mockResolvedValue(["https://signed-url.test"]),
      publicUrl: vi.fn().mockReturnValue("https://public-url.test"),
      save: vi.fn().mockResolvedValue(undefined),
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
      uploadRawContentToBucket: vi.fn().mockResolvedValue(undefined),
      uploadSmallRawContentToBucketAsNewFile: vi
        .fn()
        .mockResolvedValue(undefined),
      fetchFileContent: vi.fn().mockResolvedValue("mock content"),
      copyFile: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      deleteFiles: vi.fn().mockResolvedValue(undefined),
    };
  }
}

export const fileStorageMock = new FileStorageMock();
