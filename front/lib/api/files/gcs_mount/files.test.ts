import {
  createGCSMountFile,
  type GCSMountFileEntry,
} from "@app/lib/api/files/gcs_mount/files";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/file_storage", () => ({
  getPrivateUploadBucket: vi.fn(),
}));

vi.mock("@app/lib/api/config", () => ({
  default: {
    getClientFacingUrl: vi.fn(() => "https://dust.tt"),
  },
}));

function makeAuth(workspaceId: string): Authenticator {
  return {
    getNonNullableWorkspace: () => ({ sId: workspaceId }),
  } as unknown as Authenticator;
}

const WORKSPACE_ID = "ws123";
const CONVERSATION_ID = "conv456";

describe("createGCSMountFile", () => {
  let saveMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    saveMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      file: vi.fn(() => ({ save: saveMock })),
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);
  });

  it("writes to the correct GCS path", async () => {
    const auth = makeAuth(WORKSPACE_ID);
    const content = Buffer.from("hello");

    await createGCSMountFile(
      auth,
      { useCase: "conversation", conversationId: CONVERSATION_ID },
      {
        fileName: "report.txt",
        content,
        contentType: "text/plain",
      }
    );

    expect(saveMock).toHaveBeenCalledWith(content, {
      contentType: "text/plain",
    });
    const bucket = vi.mocked(getPrivateUploadBucket)();
    expect(bucket.file).toHaveBeenCalledWith(
      `w/${WORKSPACE_ID}/conversations/${CONVERSATION_ID}/files/report.txt`
    );
  });

  it("returns a correctly shaped GCSMountFileEntry", async () => {
    const auth = makeAuth(WORKSPACE_ID);
    const content = Buffer.from("hello world");

    const entry = await createGCSMountFile(
      auth,
      { useCase: "conversation", conversationId: CONVERSATION_ID },
      { fileName: "notes.txt", content, contentType: "text/plain" }
    );

    expect(entry).toMatchObject<Partial<GCSMountFileEntry>>({
      fileName: "notes.txt",
      path: "conversation/notes.txt",
      sizeBytes: content.length,
      contentType: "text/plain",
      fileId: null,
      thumbnailUrl: null,
    });
    expect(entry.lastModifiedMs).toBeGreaterThan(0);
  });

  it("sets thumbnailUrl for image content types", async () => {
    const auth = makeAuth(WORKSPACE_ID);

    const entry = await createGCSMountFile(
      auth,
      { useCase: "conversation", conversationId: CONVERSATION_ID },
      {
        fileName: "photo.png",
        content: Buffer.from("png data"),
        contentType: "image/png",
      }
    );

    expect(entry.thumbnailUrl).toBe(
      `https://dust.tt/api/w/${WORKSPACE_ID}/assistant/conversations/${CONVERSATION_ID}/files/thumbnail?filePath=${encodeURIComponent("photo.png")}`
    );
  });

  it("leaves thumbnailUrl null for non-image content types", async () => {
    const auth = makeAuth(WORKSPACE_ID);

    const entry = await createGCSMountFile(
      auth,
      { useCase: "conversation", conversationId: CONVERSATION_ID },
      {
        fileName: "data.csv",
        content: Buffer.from("a,b"),
        contentType: "text/csv",
      }
    );

    expect(entry.thumbnailUrl).toBeNull();
  });
});
