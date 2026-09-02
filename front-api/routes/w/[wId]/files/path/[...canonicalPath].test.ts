import { createConversation } from "@app/lib/api/assistant/conversation";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileResource } from "@app/lib/resources/file_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import {
  DUST_FILE_CONTENT_TYPE_HEADER,
  DUST_FILE_ID_HEADER,
  frameContentType,
  frameV2ContentType,
} from "@app/types/files";
import { honoApp } from "@front-api/app";
import { PassThrough } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/lock", () => ({
  executeWithLock: vi.fn(async (_lockName: string, fn: () => unknown) => fn()),
  executeWithLockResult: vi.fn(async (_lockName: string, fn: () => unknown) =>
    fn()
  ),
}));

function makeReadStream() {
  return new PassThrough();
}

function setExistingFiles(
  suffixes: string[],
  metadata: { contentType: string; size: string } = {
    contentType: "text/plain",
    size: "42",
  }
) {
  fileStorageMock.setFileExists((filePath) =>
    suffixes.some((suffix) => filePath.endsWith(suffix))
  );
  fileStorageMock.setFileMetadata(() => metadata);
}

function getInspectablePrivateUploadBucket() {
  const bucket = getPrivateUploadBucket();
  vi.mocked(getPrivateUploadBucket).mockReturnValue(bucket);
  return bucket;
}

beforeEach(() => {
  fileStorageMock.setFileExists(() => false);
});

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

    const response = await request(
      workspace,
      "conversation-doesnotexist/file.txt"
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("file_not_found");
  });

  it("returns 404 when file does not exist in GCS", async () => {
    const { workspace, conversation } = await setup();

    const response = await request(
      workspace,
      `conversation-${conversation.sId}/missing.txt`
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("file_not_found");
  });

  it("streams the file with the correct content type", async () => {
    const { workspace, conversation } = await setup();

    setExistingFiles(["/files/report.pdf"], {
      contentType: "application/pdf",
      size: "1024",
    });

    const response = await request(
      workspace,
      `conversation-${conversation.sId}/report.pdf`
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBeNull();
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it.each([
    { fileName: "page.html", contentType: "text/html" },
    { fileName: "logo.svg", contentType: "image/svg+xml" },
    {
      fileName: "blob.bin",
      contentType: "application/x-something-unknown",
    },
    { fileName: "mixed.html", contentType: "TEXT/HTML; Charset=UTF-8" },
  ])("forces unsafe content type $contentType to download as an attachment", async ({
    fileName,
    contentType,
  }) => {
    const { workspace, conversation } = await setup();

    setExistingFiles([`/files/${fileName}`], { contentType, size: "42" });

    const response = await request(
      workspace,
      `conversation-${conversation.sId}/${fileName}`
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename=/
    );
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("sets Content-Disposition when ?download=1", async () => {
    const { workspace, conversation } = await setup();

    setExistingFiles(["/files/report.txt"]);

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
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});

describe("GET /api/w/:wId/files/path/:canonicalPath?thumbnail=1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("streams the thumbnail from FileResource when one is linked", async () => {
    const { workspace, auth, conversation } = await setup();

    setExistingFiles(["/files/photo.png"], {
      contentType: "image/png",
      size: "2048",
    });

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
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(spy).toHaveBeenCalled();
  });

  it("returns 400 for a non-image file", async () => {
    const { workspace, conversation } = await setup();

    setExistingFiles(["/files/data.csv"], {
      contentType: "text/plain",
      size: "100",
    });

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
    setExistingFiles(["/files/data.csv"], {
      contentType: "text/csv",
      size: "512",
    });

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
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(fileStorageMock.readStreamCalls).toHaveLength(0);
  });

  it("returns linked FileResource metadata without replacing raw metadata", async () => {
    const { workspace, auth, conversation } = await setup();

    setExistingFiles(["/files/frame.tsx"], {
      contentType: "text/plain",
      size: "2048",
    });

    const file = await FileFactory.create(auth, auth.getNonNullableUser(), {
      contentType: frameV2ContentType,
      fileName: "frame.tsx",
      fileSize: 2048,
      status: "ready",
      useCase: "conversation",
    });
    await file.setUseCaseMetadata(auth, { conversationId: conversation.sId });
    const linkedFile = await FileResource.fetchById(auth, file.sId);
    expect(linkedFile?.mountFilePath).toBe(
      `w/${workspace.sId}/conversations/${conversation.sId}/files/frame.tsx`
    );

    const segments = `conversation-${conversation.sId}/frame.tsx`
      .split("/")
      .map(encodeURIComponent)
      .join("/");
    const response = await honoApp.request(
      `/api/w/${workspace.sId}/files/path/${segments}`,
      { method: "HEAD" }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain");
    expect(response.headers.get(DUST_FILE_ID_HEADER)).toBe(file.sId);
    expect(response.headers.get(DUST_FILE_CONTENT_TYPE_HEADER)).toBe(
      frameV2ContentType
    );
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("returns 404 when file does not exist", async () => {
    const { workspace, conversation } = await setup();

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
    setExistingFiles(["/files/old.txt"]);
    const bucket = getInspectablePrivateUploadBucket();

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
    setExistingFiles(["/files/old.txt"]);
    const bucket = getInspectablePrivateUploadBucket();

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

  it("rejects a pending-conversion Frame rename before moving source bytes", async () => {
    const { workspace, auth, conversation } = await setup();
    const sourceDirectoryPath = `conversation-${conversation.sId}/Status`;
    const manifestPath = `${sourceDirectoryPath}/${FRAME_MANIFEST_FILE}`;
    const manifestMountFilePath = `w/${workspace.sId}/conversations/${conversation.sId}/files/Status/${FRAME_MANIFEST_FILE}`;
    const frame = await FileFactory.create(auth, null, {
      contentType: frameV2ContentType,
      fileName: FRAME_MANIFEST_FILE,
      fileSize: 42,
      status: "created",
      useCase: "conversation",
      useCaseMetadata: {
        conversationId: conversation.sId,
        pendingFrameV2Conversion: {
          legacyContentType: frameContentType,
          legacyFileName: "Legacy.tsx",
          legacyFileSize: 42,
          legacyMountFilePath: `w/${workspace.sId}/conversations/${conversation.sId}/files/Legacy.tsx`,
          legacyRenderableVersion: "original",
          legacyUseCase: "conversation",
          legacyUseCaseMetadata: { conversationId: conversation.sId },
          manifestMountFilePath,
          manifestPath,
          sourcePath: `conversation-${conversation.sId}/Legacy.tsx`,
        },
      },
      mountFilePath: manifestMountFilePath,
    });
    setExistingFiles([`/files/Status/${FRAME_MANIFEST_FILE}`], {
      contentType: frameV2ContentType,
      size: "42",
    });
    const bucket = getInspectablePrivateUploadBucket();

    const response = await request(workspace, manifestPath, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rename", fileName: "renamed.json" }),
    });

    expect(response.status).toBe(400);
    expect(bucket.copyFile).not.toHaveBeenCalled();
    const reloaded = await FileResource.fetchById(auth, frame.sId);
    expect(reloaded?.fileName).toBe(FRAME_MANIFEST_FILE);
    expect(reloaded?.mountFilePath).toBe(manifestMountFilePath);
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
    expect(fileStorageMock.saveFileCalls).toContainEqual({
      filePath: `w/${workspace.sId}/conversations/${conversation.sId}/files/notes.md`,
      content: Buffer.from("# Hello"),
      contentType: "text/markdown",
    });
  });

  it("updates an existing file and returns 200", async () => {
    const { workspace, conversation } = await setup();
    setExistingFiles(["/files/notes.md"], {
      contentType: "text/markdown",
      size: "7",
    });

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
    expect(fileStorageMock.saveFileCalls).toContainEqual({
      filePath: `w/${workspace.sId}/conversations/${conversation.sId}/files/notes.md`,
      content: Buffer.from("# Updated"),
      contentType: "text/markdown",
    });
  });

  it("returns 400 when updating a binary file type", async () => {
    const { workspace, conversation } = await setup();
    setExistingFiles(["/files/report.pdf"], {
      contentType: "application/pdf",
      size: "1024",
    });

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
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("returns 413 when content exceeds the size limit", async () => {
    const { workspace, conversation } = await setup();

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
    setExistingFiles(["/files/file.txt"]);
    const bucket = getInspectablePrivateUploadBucket();

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

    const response = await request(
      workspace,
      `conversation-${conversation.sId}/missing.txt`,
      { method: "DELETE" }
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("file_not_found");
  });
});
