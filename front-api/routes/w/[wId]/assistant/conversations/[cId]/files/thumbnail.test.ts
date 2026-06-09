import { createConversation } from "@app/lib/api/assistant/conversation";
import { getConversationFilesBasePath } from "@app/lib/api/files/mount_path";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileResource } from "@app/lib/resources/file_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Err, Ok } from "@app/types/shared/result";
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
  overrides: Partial<{ getFileContentType: any; createReadStream: any }> = {}
) {
  const readStream =
    overrides.createReadStream ?? vi.fn().mockReturnValue(makeReadStream());
  return {
    getFileContentType:
      overrides.getFileContentType ??
      vi.fn().mockResolvedValue(new Ok("image/png")),
    file: vi.fn().mockReturnValue({ createReadStream: readStream }),
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
  const basePath = getConversationFilesBasePath({
    workspaceId: workspace.sId,
    conversationId: conversation.sId,
  });
  return { workspace, auth, conversation, basePath };
}

function thumbnail(workspace: { sId: string }, cId: string, filePath?: string) {
  const qs = filePath ? `?filePath=${encodeURIComponent(filePath)}` : "";
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/conversations/${cId}/files/thumbnail${qs}`
  );
}

describe("GET /api/w/:wId/assistant/conversations/:cId/files/thumbnail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when filePath query param is missing", async () => {
    const { workspace, conversation } = await setup();

    const response = await thumbnail(workspace, conversation.sId);

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("returns 403 for path traversal attempt", async () => {
    const { workspace, conversation } = await setup();

    const response = await thumbnail(
      workspace,
      conversation.sId,
      "conversation/../../secret.txt"
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("workspace_auth_error");
  });

  it("streams from FileResource when one is associated with the path", async () => {
    const { workspace, auth, conversation } = await setup();

    const file = await FileFactory.create(auth, auth.getNonNullableUser(), {
      contentType: "image/png",
      fileName: "generated.png",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
    });
    await file.setUseCaseMetadata(auth, { conversationId: conversation.sId });

    const spy = vi
      .spyOn(FileResource.prototype, "getContentReadStream")
      .mockReturnValue(makeReadStream() as any);

    const response = await thumbnail(
      workspace,
      conversation.sId,
      "conversation/generated.png"
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=3600");
    expect(spy).toHaveBeenCalled();
  });

  it("falls back to GCS when no FileResource is associated with the path", async () => {
    const { workspace, conversation, basePath } = await setup();

    const bucket = makeBucket();
    vi.mocked(getPrivateUploadBucket).mockReturnValueOnce(bucket as any);

    const response = await thumbnail(
      workspace,
      conversation.sId,
      "conversation/sandbox_output.png"
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(bucket.getFileContentType).toHaveBeenCalledWith(
      `${basePath}sandbox_output.png`
    );
    expect(bucket.file).toHaveBeenCalledWith(`${basePath}sandbox_output.png`);
  });

  it("returns 400 for a FileResource-backed non-image file", async () => {
    const { workspace, auth, conversation } = await setup();

    const file = await FileFactory.create(auth, auth.getNonNullableUser(), {
      contentType: "text/plain",
      fileName: "report.txt",
      fileSize: 512,
      status: "ready",
      useCase: "conversation",
    });
    await file.setUseCaseMetadata(auth, { conversationId: conversation.sId });

    const response = await thumbnail(
      workspace,
      conversation.sId,
      "conversation/report.txt"
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("returns 400 for a GCS non-image file", async () => {
    const { workspace, conversation } = await setup();

    const bucket = makeBucket({
      getFileContentType: vi.fn().mockResolvedValue(new Ok("text/plain")),
    });
    vi.mocked(getPrivateUploadBucket).mockReturnValueOnce(bucket as any);

    const response = await thumbnail(
      workspace,
      conversation.sId,
      "conversation/report.txt"
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("returns 404 when no FileResource and GCS file not found", async () => {
    const { workspace, conversation } = await setup();

    const bucket = makeBucket({
      getFileContentType: vi
        .fn()
        .mockResolvedValue(new Err(new Error("not found"))),
    });
    vi.mocked(getPrivateUploadBucket).mockReturnValueOnce(bucket as any);

    const response = await thumbnail(
      workspace,
      conversation.sId,
      "conversation/missing.png"
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("file_not_found");
  });
});
