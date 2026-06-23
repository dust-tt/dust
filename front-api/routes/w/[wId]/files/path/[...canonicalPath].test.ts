import { createConversation } from "@app/lib/api/assistant/conversation";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileResource } from "@app/lib/resources/file_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { PassThrough } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/lock", () => ({
  executeWithLock: vi.fn(async (_lockName: string, fn: () => unknown) => fn()),
}));

function makeReadStream() {
  return new PassThrough();
}

function makeBucket(
  overrides: Partial<{
    existingFilePathSuffixes: string[];
    getMetadata: ReturnType<typeof vi.fn>;
    createReadStream: ReturnType<typeof vi.fn>;
    copyFile: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    fileDelete: ReturnType<typeof vi.fn>;
    getAllFilesByPrefix: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  }> = {}
) {
  const existingFilePathSuffixes = overrides.existingFilePathSuffixes ?? [];
  const getMetadata =
    overrides.getMetadata ??
    vi.fn().mockResolvedValue([{ contentType: "text/plain", size: "42" }]);
  const createReadStream =
    overrides.createReadStream ?? vi.fn().mockReturnValue(makeReadStream());
  const fileDelete =
    overrides.fileDelete ?? vi.fn().mockResolvedValue(undefined);
  const save = overrides.save ?? vi.fn().mockResolvedValue(undefined);

  return {
    file: vi.fn((filePath: string) => ({
      exists: vi
        .fn()
        .mockResolvedValue([
          existingFilePathSuffixes.some((suffix) => filePath.endsWith(suffix)),
        ]),
      getMetadata,
      createReadStream,
      delete: fileDelete,
      save,
    })),
    copyFile: overrides.copyFile ?? vi.fn().mockResolvedValue(undefined),
    delete: overrides.delete ?? vi.fn().mockResolvedValue(undefined),
    getAllFilesByPrefix:
      overrides.getAllFilesByPrefix ??
      vi.fn().mockResolvedValue({ files: [], pageFetchCount: 1 }),
  };
}

async function setup() {
  const { workspace, auth } = await createPrivateApiMockRequest({
    role: "admin",
  });
  const conversation = await createConversation(auth, {
    title: null,
    visibility: "unlisted",
    spaceId: null,
  });
  return { workspace, auth, conversation };
}

function request(
  workspace: { sId: string },
  canonicalPath: string,
  init?: RequestInit
) {
  const segments = canonicalPath.split("/").map(encodeURIComponent).join("/");
  return honoApp.request(
    `/api/w/${workspace.sId}/files/path/${segments}`,
    init
  );
}

describe("GET /api/w/:wId/files/path/:canonicalPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when path has only one segment", async () => {
    const { workspace } = await setup();

    const response = await request(workspace, "conversation-abc");

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("returns 404 when conversation does not exist", async () => {
    const { workspace } = await setup();

    const bucket = makeBucket();
    vi.mocked(getPrivateUploadBucket).mockReturnValue(bucket as any);

    const response = await request(
      workspace,
      "conversation-doesnotexist/file.txt"
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("file_not_found");
  });

  it("returns 404 when file does not exist in GCS", async () => {
    const { workspace, conversation } = await setup();

    const bucket = makeBucket();
    vi.mocked(getPrivateUploadBucket).mockReturnValue(bucket as any);

    const response = await request(
      workspace,
      `conversation-${conversation.sId}/missing.txt`
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("file_not_found");
  });

  it("streams the file with the correct content type", async () => {
    const { workspace, conversation } = await setup();

    const bucket = makeBucket({
      existingFilePathSuffixes: ["/files/report.pdf"],
      getMetadata: vi
        .fn()
        .mockResolvedValue([{ contentType: "application/pdf", size: "1024" }]),
    });
    vi.mocked(getPrivateUploadBucket).mockReturnValue(bucket as any);

    const response = await request(
      workspace,
      `conversation-${conversation.sId}/report.pdf`
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBeNull();
  });

  it("sets Content-Disposition when ?download=1", async () => {
    const { workspace, conversation } = await setup();

    const bucket = makeBucket({
      existingFilePathSuffixes: ["/files/report.txt"],
    });
    vi.mocked(getPrivateUploadBucket).mockReturnValue(bucket as any);

    const segments = `conversation-${conversation.sId}/report.txt`
      .split("/")
      .map(encodeURIComponent)
      .join("/");
    const response = await honoApp.request(
      `/api/w/${workspace.sId}/files/path/${segments}?download=1`
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toMatch(
      /attachment; filename=/
    );
  });
});

describe("GET /api/w/:wId/files/path/:canonicalPath?thumbnail=1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("streams the thumbnail from FileResource when one is linked", async () => {
    const { workspace, auth, conversation } = await setup();

    const bucket = makeBucket({
      existingFilePathSuffixes: ["/files/photo.png"],
      getMetadata: vi
        .fn()
        .mockResolvedValue([{ contentType: "image/png", size: "2048" }]),
    });
    vi.mocked(getPrivateUploadBucket).mockReturnValue(bucket as any);

    const file = await FileFactory.create(auth, auth.getNonNullableUser(), {
      contentType: "image/png",
      fileName: "photo.png",
      fileSize: 2048,
      status: "ready",
      useCase: "conversation",
    });
    await file.setUseCaseMetadata(auth, { conversationId: conversation.sId });

    const spy = vi
      .spyOn(FileResource.prototype, "getContentReadStream")
      .mockReturnValue(makeReadStream() as any);

    const segments = `conversation-${conversation.sId}/photo.png`
      .split("/")
      .map(encodeURIComponent)
      .join("/");
    const response = await honoApp.request(
      `/api/w/${workspace.sId}/files/path/${segments}?thumbnail=1`
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=3600");
    expect(spy).toHaveBeenCalled();
  });

  it("returns 400 for a non-image file", async () => {
    const { workspace, conversation } = await setup();

    const bucket = makeBucket({
      existingFilePathSuffixes: ["/files/data.csv"],
      getMetadata: vi
        .fn()
        .mockResolvedValue([{ contentType: "text/plain", size: "100" }]),
    });
    vi.mocked(getPrivateUploadBucket).mockReturnValue(bucket as any);

    const segments = `conversation-${conversation.sId}/data.csv`
      .split("/")
      .map(encodeURIComponent)
      .join("/");
    const response = await honoApp.request(
      `/api/w/${workspace.sId}/files/path/${segments}?thumbnail=1`
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });
});

describe("HEAD /api/w/:wId/files/path/:canonicalPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns metadata headers without a body", async () => {
    const { workspace, conversation } = await setup();

    const bucket = makeBucket({
      existingFilePathSuffixes: ["/files/data.csv"],
      getMetadata: vi
        .fn()
        .mockResolvedValue([{ contentType: "text/csv", size: "512" }]),
    });
    vi.mocked(getPrivateUploadBucket).mockReturnValue(bucket as any);

    const segments = `conversation-${conversation.sId}/data.csv`
      .split("/")
      .map(encodeURIComponent)
      .join("/");
    const response = await honoApp.request(
      `/api/w/${workspace.sId}/files/path/${segments}`,
      { method: "HEAD" }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv");
  });

  it("returns 404 when file does not exist", async () => {
    const { workspace, conversation } = await setup();

    const bucket = makeBucket();
    vi.mocked(getPrivateUploadBucket).mockReturnValue(bucket as any);

    const segments = `conversation-${conversation.sId}/missing.txt`
      .split("/")
      .map(encodeURIComponent)
      .join("/");
    const response = await honoApp.request(
      `/api/w/${workspace.sId}/files/path/${segments}`,
      { method: "HEAD" }
    );

    expect(response.status).toBe(404);
  });
});

describe("PATCH /api/w/:wId/files/path/:canonicalPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for an invalid body", async () => {
    const { workspace, conversation } = await setup();

    const response = await request(
      workspace,
      `conversation-${conversation.sId}/file.txt`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unknown" }),
      }
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("renames a file", async () => {
    const { workspace, conversation } = await setup();

    const bucket = makeBucket({
      existingFilePathSuffixes: ["/files/old.txt"],
    });
    vi.mocked(getPrivateUploadBucket).mockReturnValue(bucket as any);

    const response = await request(
      workspace,
      `conversation-${conversation.sId}/old.txt`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename", fileName: "new.txt" }),
      }
    );

    expect(response.status).toBe(200);
    expect(bucket.copyFile).toHaveBeenCalledOnce();
  });

  it("moves a file to another path", async () => {
    const { workspace, conversation } = await setup();

    const bucket = makeBucket({
      existingFilePathSuffixes: ["/files/old.txt"],
    });
    vi.mocked(getPrivateUploadBucket).mockReturnValue(bucket as any);

    const dest = `conversation-${conversation.sId}/archive/old.txt`;

    const response = await request(
      workspace,
      `conversation-${conversation.sId}/old.txt`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "move", dest }),
      }
    );

    expect(response.status).toBe(200);
    expect(bucket.copyFile).toHaveBeenCalledOnce();
  });

  it("returns 200 immediately when source and dest are identical", async () => {
    const { workspace, conversation } = await setup();

    const src = `conversation-${conversation.sId}/file.txt`;

    const response = await request(workspace, src, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "move", dest: src }),
    });

    expect(response.status).toBe(200);
  });
});

describe("PUT /api/w/:wId/files/path/:canonicalPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new file and returns 201", async () => {
    const { workspace, conversation } = await setup();

    const save = vi.fn().mockResolvedValue(undefined);
    const bucket = makeBucket({ save });
    vi.mocked(getPrivateUploadBucket).mockReturnValue(bucket as any);

    const response = await request(
      workspace,
      `conversation-${conversation.sId}/notes.md`,
      {
        method: "PUT",
        headers: { "Content-Type": "text/markdown" },
        body: "# Hello",
      }
    );

    expect(response.status).toBe(201);
    expect(save).toHaveBeenCalledWith(Buffer.from("# Hello"), {
      contentType: "text/markdown",
    });
  });

  it("updates an existing file and returns 200", async () => {
    const { workspace, conversation } = await setup();

    const save = vi.fn().mockResolvedValue(undefined);
    const bucket = makeBucket({
      existingFilePathSuffixes: ["/files/notes.md"],
      getMetadata: vi
        .fn()
        .mockResolvedValue([{ contentType: "text/markdown", size: "7" }]),
      save,
    });
    vi.mocked(getPrivateUploadBucket).mockReturnValue(bucket as any);

    const response = await request(
      workspace,
      `conversation-${conversation.sId}/notes.md`,
      {
        method: "PUT",
        headers: { "Content-Type": "text/markdown" },
        body: "# Updated",
      }
    );

    expect(response.status).toBe(200);
    expect(save).toHaveBeenCalledWith(Buffer.from("# Updated"), {
      contentType: "text/markdown",
    });
  });

  it("returns 400 when updating a binary file type", async () => {
    const { workspace, conversation } = await setup();

    const save = vi.fn().mockResolvedValue(undefined);
    const bucket = makeBucket({
      existingFilePathSuffixes: ["/files/report.pdf"],
      getMetadata: vi
        .fn()
        .mockResolvedValue([{ contentType: "application/pdf", size: "1024" }]),
      save,
    });
    vi.mocked(getPrivateUploadBucket).mockReturnValue(bucket as any);

    const response = await request(
      workspace,
      `conversation-${conversation.sId}/report.pdf`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: "not a real pdf",
      }
    );

    expect(response.status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });

  it("returns 413 when content exceeds the size limit", async () => {
    const { workspace, conversation } = await setup();

    const bucket = makeBucket();
    vi.mocked(getPrivateUploadBucket).mockReturnValue(bucket as any);

    const response = await request(
      workspace,
      `conversation-${conversation.sId}/large.txt`,
      {
        method: "PUT",
        headers: { "Content-Type": "text/plain" },
        body: "x".repeat(512 * 1024 + 1),
      }
    );

    expect(response.status).toBe(413);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("returns 413 when Content-Length exceeds the size limit", async () => {
    const { workspace, conversation } = await setup();

    const bucket = makeBucket();
    vi.mocked(getPrivateUploadBucket).mockReturnValue(bucket as any);

    const response = await request(
      workspace,
      `conversation-${conversation.sId}/large.txt`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "text/plain",
          "Content-Length": String(512 * 1024 + 1),
        },
        body: "small",
      }
    );

    expect(response.status).toBe(413);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });
});

describe("DELETE /api/w/:wId/files/path/:canonicalPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes a file and returns 204", async () => {
    const { workspace, conversation } = await setup();

    const bucket = makeBucket({
      existingFilePathSuffixes: ["/files/file.txt"],
    });
    vi.mocked(getPrivateUploadBucket).mockReturnValue(bucket as any);

    const response = await request(
      workspace,
      `conversation-${conversation.sId}/file.txt`,
      { method: "DELETE" }
    );

    expect(response.status).toBe(204);
    expect(bucket.delete).toHaveBeenCalledOnce();
  });

  it("deletes the linked FileResource when one exists", async () => {
    const { workspace, auth, conversation } = await setup();

    const bucket = makeBucket();
    vi.mocked(getPrivateUploadBucket).mockReturnValue(bucket as any);

    const file = await FileFactory.create(auth, auth.getNonNullableUser(), {
      contentType: "text/plain",
      fileName: "linked.txt",
      fileSize: 42,
      status: "ready",
      useCase: "tool_output",
    });
    await file.setUseCaseMetadata(auth, { conversationId: conversation.sId });

    const response = await request(
      workspace,
      `conversation-${conversation.sId}/linked.txt`,
      { method: "DELETE" }
    );

    expect(response.status).toBe(204);
    await expect(FileResource.fetchById(auth, file.sId)).resolves.toBeNull();
  });

  it("returns 404 when file does not exist", async () => {
    const { workspace, conversation } = await setup();

    const bucket = makeBucket({
      getAllFilesByPrefix: vi
        .fn()
        .mockResolvedValue({ files: [], pageFetchCount: 1 }),
    });
    vi.mocked(getPrivateUploadBucket).mockReturnValue(bucket as any);

    const response = await request(
      workspace,
      `conversation-${conversation.sId}/missing.txt`,
      { method: "DELETE" }
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("file_not_found");
  });
});
