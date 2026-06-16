import { GCSFileSystemBackend } from "@app/lib/api/file_system/backends/gcs_file_system_backend";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import logger from "@app/logger/logger";
import assert from "assert";
import { Readable } from "stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/config", () => ({
  default: {
    getApiBaseUrl: vi.fn(() => "https://dust.tt"),
  },
}));

const WORKSPACE_ID = "ws123";
const BUCKET = "test-bucket";
const CONV_ID = "conv456";
const POD_ID = "pod789";

function makeBackend() {
  return new GCSFileSystemBackend(WORKSPACE_ID, BUCKET);
}

function gcsFile({
  name,
  contentType = "text/plain",
  size = 100,
  updated,
}: {
  name: string;
  contentType?: string;
  size?: number;
  updated?: string;
}) {
  return {
    name,
    metadata: {
      contentType,
      size: String(size),
      updated: updated ?? new Date().toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe("GCSFileSystemBackend.list", () => {
  let getAllFilesByPrefixMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getAllFilesByPrefixMock = vi.fn().mockResolvedValue({
      files: [],
      pageFetchCount: 1,
    });
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      getAllFilesByPrefix: getAllFilesByPrefixMock,
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("queries the correct GCS prefix for a conversation mount", async () => {
    const backend = makeBackend();
    await backend.list(`conversation-${CONV_ID}/`);

    expect(getAllFilesByPrefixMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prefix: `w/${WORKSPACE_ID}/conversations/${CONV_ID}/files/`,
      })
    );
  });

  it("queries the correct GCS prefix for a pod mount", async () => {
    const backend = makeBackend();
    await backend.list(`pod-${POD_ID}/`);

    expect(getAllFilesByPrefixMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prefix: `w/${WORKSPACE_ID}/pods/${POD_ID}/files/`,
      })
    );
  });

  it("excludes .processed. siblings by default", async () => {
    const prefix = `w/${WORKSPACE_ID}/conversations/${CONV_ID}/files/`;
    getAllFilesByPrefixMock.mockResolvedValue({
      files: [
        gcsFile({
          name: `${prefix}report.pdf`,
          contentType: "application/pdf",
        }),
        gcsFile({ name: `${prefix}report.processed.txt` }),
        gcsFile({ name: `${prefix}photo.jpg`, contentType: "image/jpeg" }),
        gcsFile({
          name: `${prefix}photo.processed.jpg`,
          contentType: "image/jpeg",
        }),
      ],
      pageFetchCount: 1,
    });

    const result = await makeBackend().list(`conversation-${CONV_ID}/`);
    assert(result.isOk());
    const entries = result.value;

    const paths = entries.filter((e) => !e.isDirectory).map((e) => e.path);
    expect(paths).toContain(`conversation-${CONV_ID}/report.pdf`);
    expect(paths).toContain(`conversation-${CONV_ID}/photo.jpg`);
    expect(paths).not.toContain(`conversation-${CONV_ID}/report.processed.txt`);
    expect(paths).not.toContain(`conversation-${CONV_ID}/photo.processed.jpg`);
  });

  it("includes .processed. siblings when includeProcessed is true", async () => {
    const prefix = `w/${WORKSPACE_ID}/conversations/${CONV_ID}/files/`;
    getAllFilesByPrefixMock.mockResolvedValue({
      files: [
        gcsFile({
          name: `${prefix}report.pdf`,
          contentType: "application/pdf",
        }),
        gcsFile({ name: `${prefix}report.processed.txt` }),
      ],
      pageFetchCount: 1,
    });

    const result = await makeBackend().list(`conversation-${CONV_ID}/`, {
      includeProcessed: true,
    });
    assert(result.isOk());
    const entries = result.value;

    const paths = entries.filter((e) => !e.isDirectory).map((e) => e.path);
    expect(paths).toContain(`conversation-${CONV_ID}/report.pdf`);
    expect(paths).toContain(`conversation-${CONV_ID}/report.processed.txt`);
  });

  it("returns canonical scoped paths in entries", async () => {
    const prefix = `w/${WORKSPACE_ID}/conversations/${CONV_ID}/files/`;
    getAllFilesByPrefixMock.mockResolvedValue({
      files: [gcsFile({ name: `${prefix}subdir/data.csv` })],
      pageFetchCount: 1,
    });

    const result = await makeBackend().list(`conversation-${CONV_ID}/`);
    assert(result.isOk());
    const entries = result.value;

    expect(entries[0].path).toBe(`conversation-${CONV_ID}/subdir/data.csv`);
    expect(entries[0].fileName).toBe("data.csv");
  });

  it("always leaves thumbnailUrl null (URL construction is a DustFileSystem concern)", async () => {
    const prefix = `w/${WORKSPACE_ID}/conversations/${CONV_ID}/files/`;
    getAllFilesByPrefixMock.mockResolvedValue({
      files: [
        gcsFile({ name: `${prefix}photo.png`, contentType: "image/png" }),
        gcsFile({ name: `${prefix}data.csv`, contentType: "text/csv" }),
      ],
      pageFetchCount: 1,
    });

    const result = await makeBackend().list(`conversation-${CONV_ID}/`);
    assert(result.isOk());

    for (const entry of result.value) {
      expect(entry.isDirectory).toBe(false);
      if (!entry.isDirectory) {
        expect(entry.thumbnailUrl).toBeNull();
      }
    }
  });

  it("separates folder placeholder entries from file entries", async () => {
    const prefix = `w/${WORKSPACE_ID}/conversations/${CONV_ID}/files/`;
    getAllFilesByPrefixMock.mockResolvedValue({
      files: [
        gcsFile({ name: `${prefix}subdir/` }),
        gcsFile({ name: `${prefix}subdir/file.txt` }),
      ],
      pageFetchCount: 1,
    });

    const result = await makeBackend().list(`conversation-${CONV_ID}/`);
    assert(result.isOk());
    const entries = result.value;

    const dirs = entries.filter((e) => e.isDirectory);
    const files = entries.filter((e) => !e.isDirectory);
    expect(dirs).toHaveLength(1);
    expect(dirs[0].fileName).toBe("subdir");
    expect(dirs[0].path).toBe(`conversation-${CONV_ID}/subdir`);
    expect(files).toHaveLength(1);
  });

  it("sets fileId to null (pre-migration)", async () => {
    const prefix = `w/${WORKSPACE_ID}/conversations/${CONV_ID}/files/`;
    getAllFilesByPrefixMock.mockResolvedValue({
      files: [
        gcsFile({
          name: `${prefix}report.pdf`,
          contentType: "application/pdf",
        }),
      ],
      pageFetchCount: 1,
    });

    const result = await makeBackend().list(`conversation-${CONV_ID}/`);
    assert(result.isOk());
    const entry = result.value[0];

    expect(entry.isDirectory).toBe(false);
    if (!entry.isDirectory) {
      expect(entry.fileId).toBeNull();
    }
  });

  it("logs a warning when GCS listing required multiple pages", async () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const prefix = `w/${WORKSPACE_ID}/conversations/${CONV_ID}/files/`;
    getAllFilesByPrefixMock.mockResolvedValue({
      files: [gcsFile({ name: `${prefix}report.pdf` })],
      pageFetchCount: 3,
    });

    await makeBackend().list(`conversation-${CONV_ID}/`);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ pageFetchCount: 3 }),
      expect.any(String)
    );
    warnSpy.mockRestore();
  });

  it("returns empty array for unrecognised scoped path prefix", async () => {
    const result = await makeBackend().list("unknown-prefix/foo");
    assert(result.isOk());
    expect(result.value).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// read
// ---------------------------------------------------------------------------

describe("GCSFileSystemBackend.read", () => {
  let existsMock: ReturnType<typeof vi.fn>;
  let createReadStreamMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    existsMock = vi.fn().mockResolvedValue([true]);
    createReadStreamMock = vi.fn(() => Readable.from(["hello"]));
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      file: vi.fn(() => ({
        exists: existsMock,
        createReadStream: createReadStreamMock,
      })),
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);
  });

  async function collectStream(stream: NodeJS.ReadableStream): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(
        Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
      );
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  it("returns a readable stream for a valid conversation path", async () => {
    const result = await makeBackend().read(
      `conversation-${CONV_ID}/report.pdf`
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value !== null) {
      expect(await collectStream(result.value)).toBe("hello");
    }
  });

  it("returns a readable stream for a valid pod path", async () => {
    const result = await makeBackend().read(`pod-${POD_ID}/data.csv`);
    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value !== null) {
      expect(await collectStream(result.value)).toBe("hello");
    }
  });

  it("opens the stream at the correct GCS path", async () => {
    const bucket = vi.mocked(getPrivateUploadBucket)();
    await makeBackend().read(`conversation-${CONV_ID}/nested/file.txt`);

    expect(bucket.file).toHaveBeenCalledWith(
      `w/${WORKSPACE_ID}/conversations/${CONV_ID}/files/nested/file.txt`
    );
  });

  it("returns Ok(null) when the file does not exist", async () => {
    existsMock.mockResolvedValue([false]);
    const result = await makeBackend().read(
      `conversation-${CONV_ID}/missing.txt`
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBeNull();
    }
  });

  it("returns Err(invalid_path) for an unrecognised scoped path", async () => {
    const result = await makeBackend().read("unknown/file.txt");
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("invalid_path");
    }
  });
});

// ---------------------------------------------------------------------------
// write
// ---------------------------------------------------------------------------

describe("GCSFileSystemBackend.write", () => {
  let saveMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    saveMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      file: vi.fn(() => ({ save: saveMock })),
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);
  });

  it("writes to the correct GCS path for a conversation", async () => {
    const content = Buffer.from("data");
    const bucket = vi.mocked(getPrivateUploadBucket)();

    await makeBackend().write(
      `conversation-${CONV_ID}/report.txt`,
      content,
      "text/plain"
    );

    expect(bucket.file).toHaveBeenCalledWith(
      `w/${WORKSPACE_ID}/conversations/${CONV_ID}/files/report.txt`
    );
    expect(saveMock).toHaveBeenCalledWith(content, {
      contentType: "text/plain",
    });
  });

  it("writes to the correct GCS path for a pod", async () => {
    const content = Buffer.from("csv data");
    const bucket = vi.mocked(getPrivateUploadBucket)();

    await makeBackend().write(`pod-${POD_ID}/data.csv`, content, "text/csv");

    expect(bucket.file).toHaveBeenCalledWith(
      `w/${WORKSPACE_ID}/pods/${POD_ID}/files/data.csv`
    );
    expect(saveMock).toHaveBeenCalledWith(content, { contentType: "text/csv" });
  });

  it("converts string content to a Buffer", async () => {
    await makeBackend().write(
      `conversation-${CONV_ID}/notes.txt`,
      "hello",
      "text/plain"
    );
    expect(saveMock).toHaveBeenCalledWith(Buffer.from("hello"), {
      contentType: "text/plain",
    });
  });

  it("returns Err(invalid_path) for an unrecognised scoped path", async () => {
    const result = await makeBackend().write(
      "unknown/file.txt",
      Buffer.from("x"),
      "text/plain"
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("invalid_path");
    }
  });
});

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

describe("GCSFileSystemBackend.delete", () => {
  let existsMock: ReturnType<typeof vi.fn>;
  let deleteMock: ReturnType<typeof vi.fn>;
  let deleteByPrefixMock: ReturnType<typeof vi.fn>;
  let getAllFilesByPrefixMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    existsMock = vi.fn().mockResolvedValue([true]);
    deleteMock = vi.fn().mockResolvedValue(undefined);
    deleteByPrefixMock = vi.fn().mockResolvedValue(undefined);
    getAllFilesByPrefixMock = vi
      .fn()
      .mockResolvedValue({ files: [], pageFetchCount: 1 });
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      file: vi.fn(() => ({ exists: existsMock })),
      delete: deleteMock,
      deleteByPrefix: deleteByPrefixMock,
      getAllFilesByPrefix: getAllFilesByPrefixMock,
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);
  });

  it("deletes a regular file at the correct GCS path", async () => {
    await makeBackend().delete(`conversation-${CONV_ID}/report.txt`);

    expect(deleteMock).toHaveBeenCalledWith(
      `w/${WORKSPACE_ID}/conversations/${CONV_ID}/files/report.txt`,
      { ignoreNotFound: false }
    );
  });

  it("deletes a directory via deleteByPrefix when no direct file exists but dir entries do", async () => {
    existsMock
      .mockResolvedValueOnce([false]) // file itself does not exist
      .mockResolvedValueOnce([false]); // dir placeholder does not exist either
    getAllFilesByPrefixMock.mockResolvedValue({
      files: [
        gcsFile({
          name: `w/${WORKSPACE_ID}/conversations/${CONV_ID}/files/subdir/file.txt`,
        }),
      ],
      pageFetchCount: 1,
    });

    await makeBackend().delete(`conversation-${CONV_ID}/subdir`);

    expect(deleteByPrefixMock).toHaveBeenCalledWith(
      `w/${WORKSPACE_ID}/conversations/${CONV_ID}/files/subdir/`
    );
  });

  it("returns Ok when ignoreNotFound is true and path is missing", async () => {
    existsMock.mockResolvedValue([false]);
    getAllFilesByPrefixMock.mockResolvedValue({ files: [], pageFetchCount: 1 });

    const result = await makeBackend().delete(
      `conversation-${CONV_ID}/missing.txt`,
      {
        ignoreNotFound: true,
      }
    );
    expect(result.isOk()).toBe(true);
  });

  it("returns Err(not_found) when path is missing and ignoreNotFound is false", async () => {
    existsMock.mockResolvedValue([false]);
    getAllFilesByPrefixMock.mockResolvedValue({ files: [], pageFetchCount: 1 });

    const result = await makeBackend().delete(
      `conversation-${CONV_ID}/missing.txt`
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("not_found");
    }
  });
});

// ---------------------------------------------------------------------------
// copy
// ---------------------------------------------------------------------------

describe("GCSFileSystemBackend.copy", () => {
  let copyFileMock: ReturnType<typeof vi.fn>;
  let existsMock: ReturnType<typeof vi.fn>;
  let getAllFilesByPrefixMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    copyFileMock = vi.fn().mockResolvedValue(undefined);
    // By default, the source resolves as a regular file.
    existsMock = vi.fn().mockResolvedValue([true]);
    getAllFilesByPrefixMock = vi
      .fn()
      .mockResolvedValue({ files: [], pageFetchCount: 1 });
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      copyFile: copyFileMock,
      file: vi.fn().mockReturnValue({ exists: existsMock }),
      getAllFilesByPrefix: getAllFilesByPrefixMock,
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);
  });

  it("copies a file from conversation to conversation with correct GCS paths", async () => {
    const destConvId = "conv-dest";
    await makeBackend().copy({
      src: `conversation-${CONV_ID}/report.pdf`,
      dest: `conversation-${destConvId}/report.pdf`,
    });

    expect(copyFileMock).toHaveBeenCalledWith(
      `w/${WORKSPACE_ID}/conversations/${CONV_ID}/files/report.pdf`,
      `w/${WORKSPACE_ID}/conversations/${destConvId}/files/report.pdf`
    );
  });

  it("copies a file from conversation to pod with correct GCS paths", async () => {
    await makeBackend().copy({
      src: `conversation-${CONV_ID}/report.pdf`,
      dest: `pod-${POD_ID}/report.pdf`,
    });

    expect(copyFileMock).toHaveBeenCalledWith(
      `w/${WORKSPACE_ID}/conversations/${CONV_ID}/files/report.pdf`,
      `w/${WORKSPACE_ID}/pods/${POD_ID}/files/report.pdf`
    );
  });

  it("copies all files under a directory prefix when source is a directory", async () => {
    existsMock.mockResolvedValue([false]); // not a direct file
    getAllFilesByPrefixMock.mockResolvedValue({
      files: [
        gcsFile({
          name: `w/${WORKSPACE_ID}/pods/${POD_ID}/files/reports/q1.pdf`,
        }),
        gcsFile({
          name: `w/${WORKSPACE_ID}/pods/${POD_ID}/files/reports/q2.pdf`,
        }),
      ],
      pageFetchCount: 1,
    });

    await makeBackend().copy({
      src: `pod-${POD_ID}/reports`,
      dest: `pod-${POD_ID}/renamed-reports`,
    });

    expect(copyFileMock).toHaveBeenCalledWith(
      `w/${WORKSPACE_ID}/pods/${POD_ID}/files/reports/q1.pdf`,
      `w/${WORKSPACE_ID}/pods/${POD_ID}/files/renamed-reports/q1.pdf`
    );
    expect(copyFileMock).toHaveBeenCalledWith(
      `w/${WORKSPACE_ID}/pods/${POD_ID}/files/reports/q2.pdf`,
      `w/${WORKSPACE_ID}/pods/${POD_ID}/files/renamed-reports/q2.pdf`
    );
  });

  it("returns Err(not_found) when source is neither a file nor a directory", async () => {
    existsMock.mockResolvedValue([false]);
    getAllFilesByPrefixMock.mockResolvedValue({ files: [], pageFetchCount: 1 });

    const result = await makeBackend().copy({
      src: `pod-${POD_ID}/missing`,
      dest: `pod-${POD_ID}/dest`,
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("not_found");
    }
  });

  it("returns Err(invalid_path) for unrecognised source path", async () => {
    const result = await makeBackend().copy({
      src: "unknown/src.pdf",
      dest: `conversation-${CONV_ID}/dest.pdf`,
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("invalid_path");
    }
  });

  it("returns Err(invalid_path) for unrecognised destination path", async () => {
    const result = await makeBackend().copy({
      src: `conversation-${CONV_ID}/src.pdf`,
      dest: "unknown/dest.pdf",
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("invalid_path");
    }
  });
});

// ---------------------------------------------------------------------------
// getDownloadUrl
// ---------------------------------------------------------------------------

describe("GCSFileSystemBackend.getDownloadUrl", () => {
  let getSignedUrlMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getSignedUrlMock = vi
      .fn()
      .mockResolvedValue("https://signed.example.com/file.pdf");
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      getSignedUrl: getSignedUrlMock,
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);
  });

  it("returns Ok with the signed URL for a conversation file", async () => {
    const result = await makeBackend().getDownloadUrl(
      `conversation-${CONV_ID}/report.pdf`
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("https://signed.example.com/file.pdf");
    }
    expect(getSignedUrlMock).toHaveBeenCalledWith(
      `w/${WORKSPACE_ID}/conversations/${CONV_ID}/files/report.pdf`
    );
  });

  it("returns Ok with the signed URL for a pod file", async () => {
    const result = await makeBackend().getDownloadUrl(`pod-${POD_ID}/data.csv`);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("https://signed.example.com/file.pdf");
    }
    expect(getSignedUrlMock).toHaveBeenCalledWith(
      `w/${WORKSPACE_ID}/pods/${POD_ID}/files/data.csv`
    );
  });

  it("returns Err(invalid_path) for an unrecognised scoped path", async () => {
    const result = await makeBackend().getDownloadUrl("unknown/file.pdf");
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("invalid_path");
    }
  });
});
