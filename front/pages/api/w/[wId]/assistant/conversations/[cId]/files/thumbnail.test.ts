import { createConversation } from "@app/lib/api/assistant/conversation";
import { getConversationFilesBasePath } from "@app/lib/api/files/mount_path";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileResource } from "@app/lib/resources/file_resource";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Err, Ok } from "@app/types/shared/result";
import { PassThrough } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

import handler from "./thumbnail";

function makeReadStream() {
  return new PassThrough();
}

function makeBucket(
  overrides: Partial<{ getFileContentType: any; createReadStream: any }> = {}
) {
  const readStream = overrides.createReadStream ?? vi.fn().mockReturnValue(makeReadStream());
  return {
    getFileContentType:
      overrides.getFileContentType ??
      vi.fn().mockResolvedValue(new Ok("image/png")),
    file: vi.fn().mockReturnValue({ createReadStream: readStream }),
  };
}

async function setup() {
  const { req, res, workspace, auth } = await createPrivateApiMockRequest({
    method: "GET",
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
  return { req, res, workspace, auth, conversation, basePath };
}

describe("GET /api/w/[wId]/assistant/conversations/[cId]/files/thumbnail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 405 for non-GET methods", async () => {
    const { req, res } = await createPrivateApiMockRequest({ method: "POST" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  it("returns 400 when filePath query param is missing", async () => {
    const { req, res, workspace, conversation } = await setup();
    req.query = { wId: workspace.sId, cId: conversation.sId };
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 403 for path outside conversation scope", async () => {
    const { req, res, workspace, conversation } = await setup();
    req.query = {
      wId: workspace.sId,
      cId: conversation.sId,
      filePath: `w/${workspace.sId}/conversations/other_conv/files/image.png`,
    };
    await handler(req, res);
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error.type).toBe("workspace_auth_error");
  });

  it("streams from FileResource when one is associated with the path", async () => {
    const { req, res, workspace, auth, conversation, basePath } = await setup();

    const file = await FileFactory.create(auth, auth.getNonNullableUser(), {
      contentType: "image/png",
      fileName: "generated.png",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
    });
    const mountPath = `${basePath}generated.png`;
    await FileModel.update(
      { mountFilePath: mountPath },
      { where: { id: file.id, workspaceId: workspace.id } }
    );

    const spy = vi
      .spyOn(FileResource.prototype, "getContentReadStream")
      .mockReturnValue(makeReadStream() as any);

    req.query = { wId: workspace.sId, cId: conversation.sId, filePath: mountPath };
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res.getHeader("Content-Type")).toBe("image/png");
    expect(res.getHeader("Cache-Control")).toBe("private, max-age=3600");
    expect(spy).toHaveBeenCalled();
  });

  it("falls back to GCS when no FileResource is associated with the path", async () => {
    const { req, res, workspace, conversation, basePath } = await setup();

    const bucket = makeBucket();
    vi.mocked(getPrivateUploadBucket).mockReturnValue(bucket as any);

    const mountPath = `${basePath}sandbox_output.png`;
    req.query = { wId: workspace.sId, cId: conversation.sId, filePath: mountPath };
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res.getHeader("Content-Type")).toBe("image/png");
    expect(bucket.getFileContentType).toHaveBeenCalledWith(mountPath);
    expect(bucket.file).toHaveBeenCalledWith(mountPath);
  });

  it("returns 400 for a FileResource-backed non-image file", async () => {
    const { req, res, workspace, auth, conversation, basePath } = await setup();

    const file = await FileFactory.create(auth, auth.getNonNullableUser(), {
      contentType: "text/plain",
      fileName: "report.txt",
      fileSize: 512,
      status: "ready",
      useCase: "conversation",
    });
    const mountPath = `${basePath}report.txt`;
    await FileModel.update(
      { mountFilePath: mountPath },
      { where: { id: file.id, workspaceId: workspace.id } }
    );

    req.query = { wId: workspace.sId, cId: conversation.sId, filePath: mountPath };
    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 400 for a GCS non-image file", async () => {
    const { req, res, workspace, conversation, basePath } = await setup();

    const bucket = makeBucket({
      getFileContentType: vi.fn().mockResolvedValue(new Ok("text/plain")),
    });
    vi.mocked(getPrivateUploadBucket).mockReturnValue(bucket as any);

    const mountPath = `${basePath}report.txt`;
    req.query = { wId: workspace.sId, cId: conversation.sId, filePath: mountPath };
    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 404 when no FileResource and GCS file not found", async () => {
    const { req, res, workspace, conversation, basePath } = await setup();

    const bucket = makeBucket({
      getFileContentType: vi
        .fn()
        .mockResolvedValue(new Err(new Error("not found"))),
    });
    vi.mocked(getPrivateUploadBucket).mockReturnValue(bucket as any);

    const mountPath = `${basePath}missing.png`;
    req.query = { wId: workspace.sId, cId: conversation.sId, filePath: mountPath };
    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData().error.type).toBe("file_not_found");
  });
});
