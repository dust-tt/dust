import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { Readable } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FileResource } from "@app/lib/resources/file_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { frameContentType } from "@app/types/files";

import handler from "./[fileId]";

describe("/api/v1/public/frames/[token]/files/[fileId] security tests", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should only allow access to files from the same conversation as the frame (usecase: 'conversation')", async () => {
    const workspace = await WorkspaceFactory.basic();

    // Create frame file with conversation context.
    const frameFile = await FileFactory.create(workspace, null, {
      contentType: frameContentType,
      fileName: "frame.html",
      fileSize: 1000,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: "conversation-A" },
    });

    const frameShareInfo = await frameFile.getShareInfo();

    // Create target file in same conversation.
    const targetFile = await FileFactory.create(workspace, null, {
      contentType: "text/plain",
      fileName: "target.txt",
      fileSize: 500,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: "conversation-A" },
    });

    const token = frameShareInfo?.shareUrl.split("/").at(-1);

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: {
        fileId: targetFile.sId,
        token,
      },
    });

    vi.spyOn(FileResource, "fetchByShareTokenWithContent").mockResolvedValue({
      file: frameFile,
      content: "<html>Frame content</html>",
      shareScope: "public",
    });

    vi.spyOn(FileResource.prototype, "getSharedReadStream").mockReturnValue(
      // Mocked stream content.
      Readable.from(["File content"])
    );

    await handler(req, res);

    // Should succeed - file from same conversation.
    expect(res._getStatusCode()).toBe(200);
  });

  it("should only allow access to files from the same conversation as the frame (usecase: 'tool_output')", async () => {
    const workspace = await WorkspaceFactory.basic();

    // Create frame file with conversation context.
    const frameFile = await FileFactory.create(workspace, null, {
      contentType: frameContentType,
      fileName: "frame.html",
      fileSize: 1000,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: "conversation-A" },
    });

    const frameShareInfo = await frameFile.getShareInfo();

    // Create target file in same conversation.
    const targetFile = await FileFactory.create(workspace, null, {
      contentType: "text/plain",
      fileName: "target.txt",
      fileSize: 500,
      status: "ready",
      useCase: "tool_output",
      useCaseMetadata: { conversationId: "conversation-A" },
    });

    const token = frameShareInfo?.shareUrl.split("/").at(-1);

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: {
        fileId: targetFile.sId,
        token,
      },
    });

    vi.spyOn(FileResource, "fetchByShareTokenWithContent").mockResolvedValue({
      file: frameFile,
      content: "<html>Frame content</html>",
      shareScope: "public",
    });

    vi.spyOn(FileResource.prototype, "getSharedReadStream").mockReturnValue(
      // Mocked stream content.
      Readable.from(["File content"])
    );

    await handler(req, res);

    // Should succeed - file from same conversation.
    expect(res._getStatusCode()).toBe(200);
  });

  it("should reject access to files from different conversations", async () => {
    const workspace = await WorkspaceFactory.basic();

    // Frame from conversation A.
    const frameFile = await FileFactory.create(workspace, null, {
      contentType: frameContentType,
      fileName: "frame.html",
      fileSize: 1000,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: "conversation-A" },
    });

    const frameShareInfo = await frameFile.getShareInfo();

    const token = frameShareInfo?.shareUrl.split("/").at(-1);

    // Target file from conversation B (should be rejected).
    const targetFile = await FileFactory.create(workspace, null, {
      contentType: "text/plain",
      fileName: "target.txt",
      fileSize: 500,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: "conversation-B" }, // Different conversation!
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: {
        fileId: targetFile.sId,
        token,
      },
    });

    vi.spyOn(FileResource, "fetchByShareTokenWithContent").mockResolvedValue({
      file: frameFile,
      content: "<html>Frame content</html>",
      shareScope: "public",
    });

    await handler(req, res);

    // Should fail - file from different conversation.
    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  });

  it("should reject access to non-conversation files", async () => {
    const workspace = await WorkspaceFactory.basic();

    // Frame from conversation.
    const frameFile = await FileFactory.create(workspace, null, {
      contentType: frameContentType,
      fileName: "frame.html",
      fileSize: 1000,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: "conversation-A" },
    });

    const frameShareInfo = await frameFile.getShareInfo();

    const token = frameShareInfo?.shareUrl.split("/").at(-1);

    // Target file with different use case (should be rejected).
    const targetFile = await FileFactory.create(workspace, null, {
      contentType: "image/png",
      fileName: "avatar.png",
      fileSize: 2000,
      status: "ready",
      useCase: "avatar", // Different use case.
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: {
        fileId: targetFile.sId,
        token,
      },
    });

    vi.spyOn(FileResource, "fetchByShareTokenWithContent").mockResolvedValue({
      file: frameFile,
      content: "<html>Frame content</html>",
      shareScope: "public",
    });

    await handler(req, res);

    // Should fail - wrong use case.
    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  });

  it("should reject access when frame has no conversation context", async () => {
    const workspace = await WorkspaceFactory.basic();

    // Frame from conversation.
    const frameFile = await FileFactory.create(workspace, null, {
      contentType: frameContentType,
      fileName: "frame.html",
      fileSize: 1000,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: {}, // Missing conversationId!
    });

    const frameShareInfo = await frameFile.getShareInfo();

    const token = frameShareInfo?.shareUrl.split("/").at(-1);

    // Target file with different use case (should be rejected).
    const targetFile = await FileFactory.create(workspace, null, {
      contentType: "image/png",
      fileName: "avatar.png",
      fileSize: 2000,
      status: "ready",
      useCase: "avatar", // Different use case.
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: {
        fileId: targetFile.sId,
        token,
      },
    });

    vi.spyOn(FileResource, "fetchByShareTokenWithContent").mockResolvedValue({
      file: frameFile,
      content: "<html>Frame content</html>",
      shareScope: "public",
    });

    await handler(req, res);

    // Should fail - frame missing conversation context.
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Frame missing conversation context.",
      },
    });
  });

  it("should reject access when file is not a frame", async () => {
    const workspace = await WorkspaceFactory.basic();

    // Frame from conversation.
    const frameFile = await FileFactory.create(workspace, null, {
      contentType: frameContentType,
      fileName: "frame.html",
      fileSize: 1000,
      status: "ready",
      useCase: "avatar", // Different use case.
    });

    const frameShareInfo = await frameFile.getShareInfo();
    expect(frameShareInfo?.shareUrl).toBeUndefined();
  });
});
