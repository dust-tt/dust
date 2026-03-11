import { vi } from "vitest";

function createMockGCSFile() {
  return {
    copy: vi.fn().mockResolvedValue(undefined),
    createReadStream: vi.fn().mockReturnValue({
      on: vi.fn().mockImplementation(function (this: any) {
        return this;
      }),
      pipe: vi.fn(),
    }),
    createWriteStream: vi.fn().mockReturnValue({
      on: vi.fn().mockImplementation(function (
        this: any,
        event: string,
        cb: any
      ) {
        if (event === "finish") {
          setImmediate(cb);
        }
        return this;
      }),
      write: vi.fn(),
      end: vi.fn(),
    }),
    delete: vi.fn().mockResolvedValue(undefined),
    getSignedUrl: vi.fn().mockResolvedValue(["https://signed-url.test"]),
    publicUrl: vi.fn().mockReturnValue("https://public-url.test"),
  };
}

function createMockFileStorage() {
  return {
    file: vi.fn(createMockGCSFile),
    getSignedUrl: vi.fn().mockResolvedValue("https://signed-url.test"),
    uploadFileToBucket: vi.fn().mockResolvedValue(undefined),
    uploadRawContentToBucket: vi.fn().mockResolvedValue(undefined),
    fetchFileContent: vi.fn().mockResolvedValue("mock content"),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Mock for @app/lib/file_storage. Call via vi.mock at the top of test files:
 *
 *   vi.mock("@app/lib/file_storage", () => mockFileStorage());
 */
export function mockFileStorage() {
  return {
    FileStorage: vi.fn().mockImplementation(createMockFileStorage),
    getPrivateUploadBucket: vi.fn(createMockFileStorage),
    getPublicUploadBucket: vi.fn(createMockFileStorage),
    getUpsertQueueBucket: vi.fn(createMockFileStorage),
  };
}
