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

  get writeStreamCalls(): readonly WriteStreamCall[] {
    return this._writeStreamCalls;
  }

  reset(): void {
    this._writeStreamCalls.length = 0;
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
      getSignedUrl: vi.fn().mockResolvedValue(["https://signed-url.test"]),
      publicUrl: vi.fn().mockReturnValue("https://public-url.test"),
    };
  }

  private createMockStorage() {
    return {
      file: vi.fn((path: string) => this.createMockGCSFile(path)),
      name: "mock-bucket",
      getSignedUrl: vi.fn().mockResolvedValue("https://signed-url.test"),
      uploadFileToBucket: vi.fn().mockResolvedValue(undefined),
      uploadRawContentToBucket: vi.fn().mockResolvedValue(undefined),
      fetchFileContent: vi.fn().mockResolvedValue("mock content"),
      delete: vi.fn().mockResolvedValue(undefined),
      deleteFiles: vi.fn().mockResolvedValue(undefined),
    };
  }
}

export const fileStorageMock = new FileStorageMock();
