// @vitest-environment node: adm-zip requires Node builtins (Buffer, zlib).
// This directive makes them available in the test environment.

import { createConversation } from "@app/lib/api/assistant/conversation";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileResource } from "@app/lib/resources/file_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import {
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
  init?: RequestInit,
  query = ""
) {
  const segments = canonicalPath.split("/").map(encodeURIComponent).join("/");
  return honoApp.request(
    `/api/w/${workspace.sId}/files/path/${segments}${query}`,
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

describe("GET /api/w/:wId/files/path/:canonicalPath?archive=1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("zips every file under the folder with paths relative to it", async () => {
    const { workspace, conversation } = await setup();

    fileStorageMock.setFilesByPrefix((prefix) =>
      prefix.endsWith("/files/my-frame/")
        ? [
            {
              name: `${prefix}manifest.json`,
              metadata: { contentType: "application/json", size: "2" },
            },
            {
              name: `${prefix}src/index.tsx`,
              metadata: { contentType: "text/typescript", size: "2" },
            },
          ]
        : null
    );
    fileStorageMock.setFileExists((filePath) =>
      filePath.includes("/files/my-frame/")
    );
    fileStorageMock.setFileContent(() => "{}");

    const response = await request(
      workspace,
      `conversation-${conversation.sId}/my-frame`,
      undefined,
      "?archive=1"
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("Content-Disposition")).toContain(
      'filename="my-frame.zip"'
    );

    const zip = new AdmZip(Buffer.from(await response.arrayBuffer()));
    expect(
      zip
        .getEntries()
        .map((entry) => entry.entryName)
        .sort()
    ).toEqual(["manifest.json", "src/index.tsx"]);
  });

  it("returns 404 for an empty or missing folder", async () => {
    const { workspace, conversation } = await setup();

    const response = await request(
      workspace,
      `conversation-${conversation.sId}/nope`,
      undefined,
      "?archive=1"
    );

    expect(response.status).toBe(404);
  });
});

describe("POST /api/w/:wId/files/path/:canonicalPath?archive=1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeArchive(files: Record<string, string>): Buffer {
    const zip = new AdmZip();
    for (const [relPath, content] of Object.entries(files)) {
      zip.addFile(relPath, Buffer.from(content, "utf-8"));
    }
    return zip.toBuffer();
  }

  function importRequest(
    workspace: { sId: string },
    canonicalPath: string,
    archive: Buffer
  ) {
    const body = new FormData();
    body.append(
      "file",
      new File([new Uint8Array(archive)], "my-frame.zip", {
        type: "application/zip",
      })
    );
    return request(
      workspace,
      canonicalPath,
      { method: "POST", body },
      "?archive=1"
    );
  }

  const manifest = JSON.stringify({
    version: 1,
    name: "My Frame",
    description: "Imported.",
  });

  it("extracts the files into the folder and registers the Frame", async () => {
    const { workspace, auth, conversation } = await setup();
    // Written objects must read back for the registration to find the manifest.
    fileStorageMock.setFileExists((filePath) =>
      filePath.includes("/files/my-frame/")
    );

    const response = await importRequest(
      workspace,
      `conversation-${conversation.sId}/my-frame`,
      makeArchive({ "manifest.json": manifest, "src/index.tsx": "export {};" })
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.fileCount).toBe(2);
    expect(typeof body.frameId).toBe("string");

    const basePath = `w/${workspace.sId}/conversations/${conversation.sId}/files/my-frame`;
    expect(fileStorageMock.saveFileCalls).toContainEqual(
      expect.objectContaining({
        filePath: `${basePath}/manifest.json`,
        contentType: "application/json",
      })
    );
    expect(fileStorageMock.saveFileCalls).toContainEqual(
      expect.objectContaining({ filePath: `${basePath}/src/index.tsx` })
    );

    const frame = await FileResource.fetchById(auth, body.frameId);
    expect(frame?.isFrameV2).toBe(true);
    expect(frame?.mountFilePath).toBe(`${basePath}/manifest.json`);
  });

  it("imports a plain folder without registering anything", async () => {
    const { workspace, conversation } = await setup();

    const response = await importRequest(
      workspace,
      `conversation-${conversation.sId}/docs`,
      makeArchive({ "readme.md": "# Hi" })
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ fileCount: 1, frameId: null });
  });

  it("returns 409 when the folder already has files", async () => {
    const { workspace, conversation } = await setup();
    fileStorageMock.setFilesByPrefix((prefix) =>
      prefix.endsWith("/files/my-frame/")
        ? [
            {
              name: `${prefix}manifest.json`,
              metadata: { contentType: "application/json", size: "2" },
            },
          ]
        : null
    );

    const response = await importRequest(
      workspace,
      `conversation-${conversation.sId}/my-frame`,
      makeArchive({ "manifest.json": manifest })
    );

    expect(response.status).toBe(409);
    expect(fileStorageMock.saveFileCalls).toEqual([]);
  });

  it("rejects archives with unsafe entry paths", async () => {
    const { workspace, conversation } = await setup();

    // adm-zip normalises names passed to addFile, so rename the entry after the fact.
    const zip = new AdmZip();
    zip.addFile("escape.txt", Buffer.from("nope", "utf-8"));
    zip.getEntries()[0].entryName = "../escape.txt";

    const response = await importRequest(
      workspace,
      `conversation-${conversation.sId}/my-frame`,
      zip.toBuffer()
    );

    expect(response.status).toBe(400);
    expect(fileStorageMock.saveFileCalls).toEqual([]);
  });

  it("requires ?archive=1", async () => {
    const { workspace, conversation } = await setup();

    const response = await request(
      workspace,
      `conversation-${conversation.sId}/my-frame`,
      { method: "POST", body: new FormData() }
    );

    expect(response.status).toBe(400);
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
