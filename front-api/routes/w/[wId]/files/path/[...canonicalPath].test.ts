// @vitest-environment node: ZIP inspection requires Node builtins.

import assert from "node:assert";
import { createConversation } from "@app/lib/api/assistant/conversation";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileResource } from "@app/lib/resources/file_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import {
  DUST_FILE_CAN_WRITE_HEADER,
  DUST_FILE_CONTENT_TYPE_HEADER,
  DUST_FILE_ID_HEADER,
  frameV2ContentType,
} from "@app/types/files";
import { honoApp } from "@front-api/app";
import AdmZip from "adm-zip";
import { PassThrough } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/lock", () => ({
  executeWithLock: vi.fn(async (_lockName: string, fn: () => unknown) => fn()),
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

describe("GET /api/w/:wId/files/path/:canonicalPath?archive=zip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preflights a mount-root archive without opening file streams", async () => {
    const { workspace, conversation } = await setup();
    const mountPath = `conversation-${conversation.sId}`;
    const gcsRoot = `w/${workspace.sId}/conversations/${conversation.sId}/files/`;
    fileStorageMock.setFilesByPrefix((prefix) =>
      prefix === gcsRoot
        ? [
            {
              name: `${gcsRoot}report.txt`,
              metadata: { contentType: "text/plain", size: "5" },
            },
          ]
        : null
    );

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/files/path/${mountPath}?archive=zip`,
      { method: "HEAD" }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("Content-Disposition")).toContain(
      'filename="conversation-'
    );
    expect(fileStorageMock.readStreamCalls).toHaveLength(0);
  });

  it("streams a folder as a ZIP rooted at the folder name", async () => {
    const { workspace, conversation } = await setup();
    const folderPath = `conversation-${conversation.sId}/reports`;
    const gcsRoot = `w/${workspace.sId}/conversations/${conversation.sId}/files/reports/`;
    const readmePath = `${gcsRoot}readme.md`;
    const summaryPath = `${gcsRoot}q1/summary.txt`;
    fileStorageMock.setFilesByPrefix((prefix) =>
      prefix === gcsRoot
        ? [
            {
              name: `${gcsRoot}empty/`,
              metadata: { contentType: "application/x-directory", size: "0" },
            },
            {
              name: readmePath,
              metadata: { contentType: "text/markdown", size: "6" },
            },
            {
              name: summaryPath,
              metadata: { contentType: "text/plain", size: "7" },
            },
          ]
        : null
    );
    fileStorageMock.setFileExists(
      (path) => path === readmePath || path === summaryPath
    );
    fileStorageMock.setFileContent((path) => {
      if (path === readmePath) {
        return "readme";
      }
      if (path === summaryPath) {
        return "summary";
      }
      return null;
    });

    const segments = folderPath.split("/").map(encodeURIComponent).join("/");
    const response = await honoApp.request(
      `/api/w/${workspace.sId}/files/path/${segments}?archive=zip`
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("Content-Disposition")).toContain(
      'filename="reports.zip"'
    );
    const archiveBuffer = Buffer.from(await response.arrayBuffer());
    expect(fileStorageMock.readStreamCalls).toEqual([summaryPath, readmePath]);
    expect(archiveBuffer.subarray(0, 2).toString("ascii")).toBe("PK");
    const zip = new AdmZip(archiveBuffer);
    expect(zip.getEntries().map((entry) => entry.entryName)).toEqual([
      "reports/",
      "reports/empty/",
      "reports/q1/summary.txt",
      "reports/readme.md",
    ]);
    expect(zip.readAsText("reports/q1/summary.txt")).toBe("summary");
    expect(zip.readAsText("reports/readme.md")).toBe("readme");
  });

  it("rejects archive requests for files", async () => {
    const { workspace, conversation } = await setup();
    setExistingFiles(["/files/report.txt"]);

    const segments = `conversation-${conversation.sId}/report.txt`
      .split("/")
      .map(encodeURIComponent)
      .join("/");
    const response = await honoApp.request(
      `/api/w/${workspace.sId}/files/path/${segments}?archive=zip`
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
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

describe("POST /api/w/:wId/files/path/:canonicalPath?action=extract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function archive(entries: { path: string; content?: string }[]): Buffer {
    const zip = new AdmZip();
    for (const entry of entries) {
      if (entry.content === undefined) {
        zip.addFile(`${entry.path.replace(/\/+$/, "")}/`, Buffer.alloc(0));
      } else {
        zip.addFile(entry.path, Buffer.from(entry.content));
      }
    }
    return zip.toBuffer();
  }

  function extractRequest(
    workspace: { sId: string },
    canonicalPath: string,
    body: Buffer,
    query = "?action=extract"
  ) {
    const segments = canonicalPath.split("/").map(encodeURIComponent).join("/");
    return honoApp.request(
      `/api/w/${workspace.sId}/files/path/${segments}${query}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/zip" },
        body: new Uint8Array(body),
      }
    );
  }

  it("extracts the archive into the destination folder", async () => {
    const { workspace, conversation } = await setup();

    const response = await extractRequest(
      workspace,
      `conversation-${conversation.sId}/inbox`,
      archive([
        { path: "reports/a.txt", content: "alpha" },
        { path: "reports/nested/b.txt", content: "bravo" },
      ])
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      directoriesCreated: 0,
      filesWritten: 2,
      skippedEntryCount: 0,
    });
    const gcsRoot = `w/${workspace.sId}/conversations/${conversation.sId}/files`;
    expect(fileStorageMock.saveFileCalls).toContainEqual({
      filePath: `${gcsRoot}/inbox/reports/a.txt`,
      content: Buffer.from("alpha"),
      contentType: "text/plain",
    });
    expect(fileStorageMock.saveFileCalls).toContainEqual({
      filePath: `${gcsRoot}/inbox/reports/nested/b.txt`,
      content: Buffer.from("bravo"),
      contentType: "text/plain",
    });
  });

  it("extracts at a mount root", async () => {
    const { workspace, conversation } = await setup();

    const response = await extractRequest(
      workspace,
      `conversation-${conversation.sId}`,
      archive([{ path: "notes.md", content: "# hi" }])
    );

    expect(response.status).toBe(200);
    expect(fileStorageMock.saveFileCalls).toContainEqual({
      filePath: `w/${workspace.sId}/conversations/${conversation.sId}/files/notes.md`,
      content: Buffer.from("# hi"),
      contentType: "text/markdown",
    });
  });

  it("returns 400 without the extract action", async () => {
    const { workspace, conversation } = await setup();

    const response = await extractRequest(
      workspace,
      `conversation-${conversation.sId}/inbox`,
      archive([{ path: "a.txt", content: "alpha" }]),
      ""
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("returns 400 when the body is not a ZIP archive", async () => {
    const { workspace, conversation } = await setup();

    const response = await extractRequest(
      workspace,
      `conversation-${conversation.sId}/inbox`,
      Buffer.from("not a zip at all")
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("returns 404 when the destination mount does not exist", async () => {
    const { workspace } = await setup();

    const response = await extractRequest(
      workspace,
      "conversation-doesnotexist/inbox",
      archive([{ path: "a.txt", content: "alpha" }])
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("file_not_found");
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });
});

const setupRevisionedFile = async () => {
  const { workspace, conversation, auth } = await setup();
  const path = `conversation-${conversation.sId}/notes.json`;
  const mountPath = `w/${workspace.sId}/conversations/${conversation.sId}/files/notes.json`;
  const content = '{"arbitrary":"ordinary JSON file"}';
  fileStorageMock.setObject(mountPath, content);
  const loaded = await request(workspace, path);
  const etag = loaded.headers.get("ETag");
  assert(etag);
  return { workspace, auth, path, mountPath, content, loaded, etag };
};

describe("conditional updates through Files paths", () => {
  beforeEach(() => {
    fileStorageMock.enableVersioning();
    fileStorageMock.setFileExists(
      (path) => fileStorageMock.getObject(path) !== undefined
    );
    fileStorageMock.setFileMetadata(() => ({
      contentType: "application/json",
      size: "32",
    }));
  });

  it("reads ordinary JSON, conditionally saves it, and reopens the saved bytes", async () => {
    const { workspace, path, loaded, etag } = await setupRevisionedFile();
    expect(loaded.status).toBe(200);
    expect(await loaded.json()).toEqual({ arbitrary: "ordinary JSON file" });
    expect(loaded.headers.get(DUST_FILE_CAN_WRITE_HEADER)).toBe("true");

    const edited = '{"anything":[1,2,3]}';
    const saved = await request(workspace, path, {
      method: "PUT",
      headers: { "If-Match": etag, "Content-Type": "application/json" },
      body: edited,
    });
    expect(saved.status).toBe(200);
    expect(await saved.text()).toBe("");
    const savedEtag = saved.headers.get("ETag");
    expect(savedEtag).not.toBe(etag);

    const reopened = await request(workspace, path);
    expect(await reopened.text()).toBe(edited);
    expect(reopened.headers.get("ETag")).toBe(savedEtag);
  });

  it("supports conditional updates in the authenticated user's GCS mount", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      role: "user",
    });
    const path = `user-${user.sId}/notes.json`;
    const mountPath = `w/${workspace.sId}/users/${user.sId}/files/notes.json`;
    fileStorageMock.setObject(mountPath, "{}");

    const loaded = await request(workspace, path);
    expect(loaded.status).toBe(200);
    expect(loaded.headers.get(DUST_FILE_CAN_WRITE_HEADER)).toBe("true");
    const etag = loaded.headers.get("ETag");
    assert(etag);

    const saved = await request(workspace, path, {
      method: "PUT",
      headers: { "If-Match": etag },
      body: '{"updated":true}',
    });
    expect(saved.status).toBe(200);
    expect(saved.headers.get("ETag")).not.toBe(etag);
    expect(fileStorageMock.getObject(mountPath)).toBe('{"updated":true}');

    const stale = await request(workspace, path, {
      method: "PUT",
      headers: { "If-Match": etag },
      body: "{}",
    });
    expect(stale.status).toBe(412);
    expect(fileStorageMock.getObject(mountPath)).toBe('{"updated":true}');
  });

  it("allows only one competing write for the same revision", async () => {
    const { workspace, path, mountPath, etag } = await setupRevisionedFile();
    const edits = ['{"writer":1}', '{"writer":2}'];
    const results = await Promise.all(
      edits.map((body) =>
        request(workspace, path, {
          method: "PUT",
          headers: { "If-Match": etag },
          body,
        })
      )
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 412]);
    const winner = results.findIndex((result) => result.status === 200);
    expect(fileStorageMock.getObject(mountPath)).toBe(edits[winner]);
  });

  it("protects Markdown from an agent edit made after loading", async () => {
    const { workspace, conversation } = await setup();
    const path = `conversation-${conversation.sId}/notes.md`;
    const mountPath = `w/${workspace.sId}/conversations/${conversation.sId}/files/notes.md`;
    fileStorageMock.setFileMetadata(() => ({
      contentType: "text/markdown",
      size: "7",
    }));
    fileStorageMock.setObject(mountPath, "# First");
    const loaded = await request(workspace, path);
    const etag = loaded.headers.get("ETag");
    assert(etag);
    fileStorageMock.setObject(mountPath, "# Agent edit");

    const response = await request(workspace, path, {
      method: "PUT",
      headers: { "If-Match": etag },
      body: "# Browser edit",
    });
    expect(response.status).toBe(412);
    expect(fileStorageMock.getObject(mountPath)).toBe("# Agent edit");
  });

  it("does not recreate a deleted file from an outdated revision", async () => {
    const { workspace, path, mountPath, etag } = await setupRevisionedFile();
    await getPrivateUploadBucket().delete(mountPath);

    const response = await request(workspace, path, {
      method: "PUT",
      headers: { "If-Match": etag, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(412);
    expect(fileStorageMock.getObject(mountPath)).toBeUndefined();
  });

  it("pins streamed bytes to the returned revision when another writer updates during the read", async () => {
    const { workspace, path, mountPath, content, etag } =
      await setupRevisionedFile();
    fileStorageMock.setFileMetadata((storagePath) => {
      if (storagePath !== mountPath) {
        return null;
      }
      fileStorageMock.setObject(mountPath, '{"newer":true}');
      return {
        contentType: "application/json",
        size: "32",
        generation: etag.slice(1, -1),
      };
    });

    const response = await request(workspace, path);
    expect(await response.text()).toBe(content);
    expect(response.headers.get("ETag")).toBe(etag);
  });

  it.each([
    'W/"1"',
    '"1", "2"',
    "*",
    "1",
    '"0"',
  ])("rejects unsupported If-Match %s without writing", async (etag) => {
    const { workspace, path, mountPath, content } = await setupRevisionedFile();
    const response = await request(workspace, path, {
      method: "PUT",
      headers: { "If-Match": etag },
      body: "{}",
    });
    expect(response.status).toBe(400);
    expect(fileStorageMock.getObject(mountPath)).toBe(content);
  });

  it("returns this write's revision even if another writer saves before the response", async () => {
    const { workspace, path, mountPath, etag } = await setupRevisionedFile();
    const bucket = getInspectablePrivateUploadBucket();
    const file = bucket.file(mountPath);
    const getFile = vi.mocked(bucket.file).getMockImplementation();
    assert(getFile);
    const save = vi.mocked(file.save).getMockImplementation();
    assert(save);
    vi.mocked(file.save).mockImplementation(async (...args) => {
      await save(...args);
      fileStorageMock.setObject(mountPath, '{"laterWriter":true}');
    });
    vi.mocked(bucket.file).mockImplementation((path) =>
      path === mountPath ? file : getFile(path)
    );

    const saved = await request(workspace, path, {
      method: "PUT",
      headers: { "If-Match": etag },
      body: '{"myWrite":true}',
    });
    expect(saved.status).toBe(200);
    const reloaded = await request(workspace, path);
    expect(await reloaded.text()).toBe('{"laterWriter":true}');
    expect(saved.headers.get("ETag")).not.toBe(reloaded.headers.get("ETag"));
  });

  it("exposes read-only Pod access and rejects writes even with its current ETag", async () => {
    const { workspace, auth, globalGroup } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(
      workspace,
      auth.getNonNullableUser().id
    );
    await SpaceFactory.attachGroup(pod, globalGroup, "project_viewer");
    const path = `pod-${pod.sId}/notes.json`;
    const mountPath = `w/${workspace.sId}/pods/${pod.sId}/files/notes.json`;
    fileStorageMock.setObject(mountPath, "{}");
    await createPrivateApiMockRequest({ role: "user", workspace });

    const loaded = await request(workspace, path);
    const etag = loaded.headers.get("ETag");
    assert(etag);
    expect(loaded.status).toBe(200);
    expect(loaded.headers.get(DUST_FILE_CAN_WRITE_HEADER)).toBe("false");
    const head = await request(workspace, path, { method: "HEAD" });
    expect(head.headers.get(DUST_FILE_CAN_WRITE_HEADER)).toBe("false");

    const saved = await request(workspace, path, {
      method: "PUT",
      headers: { "If-Match": etag },
      body: '{"unauthorized":true}',
    });
    expect(saved.status).toBe(403);
    expect(fileStorageMock.getObject(mountPath)).toBe("{}");
  });

  it("does not expose private Pod files to another workspace member", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(
      workspace,
      auth.getNonNullableUser().id
    );
    const path = `pod-${pod.sId}/private.json`;
    const mountPath = `w/${workspace.sId}/pods/${pod.sId}/files/private.json`;
    fileStorageMock.setObject(mountPath, "{}");
    await createPrivateApiMockRequest({ role: "user", workspace });

    const loaded = await request(workspace, path);
    expect(loaded.status).toBe(403);
    const saved = await request(workspace, path, {
      method: "PUT",
      headers: { "If-Match": '"1"' },
      body: '{"unauthorized":true}',
    });
    expect(saved.status).toBe(403);
    expect(fileStorageMock.getObject(mountPath)).toBe("{}");
  });

  it("rejects a conditional write when storage cannot enforce the revision", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(
      workspace,
      auth.getNonNullableUser().id,
      { name: "[Dust FS] Test" }
    );
    const path = `pod-${pod.sId}/notes.json`;
    const saved = await request(workspace, path, {
      method: "PUT",
      headers: { "If-Match": '"1"', "Content-Type": "application/json" },
      body: "{}",
    });
    expect(saved.status).toBe(400);
    expect((await saved.json()).error.message).toContain(
      "does not support conditional"
    );
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("preserves overwrite behavior for callers without If-Match", async () => {
    const { workspace, path, mountPath } = await setupRevisionedFile();
    const response = await request(workspace, path, {
      method: "PUT",
      body: '{"overwrite":true}',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("ETag")).toBeTruthy();
    expect(fileStorageMock.getObject(mountPath)).toBe('{"overwrite":true}');
  });
});
