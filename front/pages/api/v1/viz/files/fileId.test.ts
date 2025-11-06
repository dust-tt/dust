import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { Readable } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { generateVizAccessToken } from "@app/lib/api/viz/access_tokens";
import { FileResource } from "@app/lib/resources/file_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { LightWorkspaceType } from "@app/types";
import { frameContentType } from "@app/types/files";

import handler from "./[fileId]";

describe("/api/v1/viz/files/[fileId] security tests", () => {
  let workspace: LightWorkspaceType;

  beforeEach(async () => {
    vi.resetAllMocks();

    const { workspace: w } = await createResourceTest({
      role: "user",
    });

    workspace = w;
  });

  it("should only allow access to files from the same conversation as the frame (usecase: 'conversation')", async () => {
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

    const fileToken = frameShareInfo?.shareUrl.split("/").at(-1);
    if (!fileToken) {
      throw new Error("No file token found");
    }

    // Generate JWT access token.
    const accessToken = generateVizAccessToken({
      fileToken,
      workspaceId: workspace.sId,
      shareScope: "public",
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: {
        fileId: targetFile.sId,
      },
      headers: {
        authorization: `Bearer ${accessToken}`,
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

    const fileToken = frameShareInfo?.shareUrl.split("/").at(-1);
    if (!fileToken) {
      throw new Error("No file token found");
    }

    // Generate JWT access token.
    const accessToken = generateVizAccessToken({
      fileToken,
      workspaceId: workspace.sId,
      shareScope: "public",
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: {
        fileId: targetFile.sId,
      },
      headers: {
        authorization: `Bearer ${accessToken}`,
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

  it("should reject access to files if sharedScope has changed", async () => {
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

    const fileToken = frameShareInfo?.shareUrl.split("/").at(-1);
    if (!fileToken) {
      throw new Error("No file token found");
    }

    // Generate JWT access token.
    const accessToken = generateVizAccessToken({
      fileToken,
      workspaceId: workspace.sId,
      // Generating token with 'public' scope.
      shareScope: "public",
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: {
        fileId: targetFile.sId,
      },
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    vi.spyOn(FileResource, "fetchByShareTokenWithContent").mockResolvedValue({
      file: frameFile,
      content: "<html>Frame content</html>",
      // Current share scope is now 'workspace'.
      shareScope: "workspace",
    });

    vi.spyOn(FileResource.prototype, "getSharedReadStream").mockReturnValue(
      // Mocked stream content.
      Readable.from(["File content"])
    );

    await handler(req, res);

    // Should fail - frame scope has changed.
    expect(res._getStatusCode()).toBe(404);
  });

  it("should reject access to files from different conversations", async () => {
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

    const fileToken = frameShareInfo?.shareUrl.split("/").at(-1);
    if (!fileToken) {
      throw new Error("No file token found");
    }

    // Target file from conversation B (should be rejected).
    const targetFile = await FileFactory.create(workspace, null, {
      contentType: "text/plain",
      fileName: "target.txt",
      fileSize: 500,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: "conversation-B" }, // Different conversation!
    });

    // Generate JWT access token for frame from conversation A
    const accessToken = generateVizAccessToken({
      fileToken,
      workspaceId: workspace.sId,
      shareScope: "public",
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: {
        fileId: targetFile.sId,
      },
      headers: {
        authorization: `Bearer ${accessToken}`,
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

    const fileToken = frameShareInfo?.shareUrl.split("/").at(-1);
    if (!fileToken) {
      throw new Error("No file token found");
    }

    // Target file with different use case (should be rejected).
    const targetFile = await FileFactory.create(workspace, null, {
      contentType: "image/png",
      fileName: "avatar.png",
      fileSize: 2000,
      status: "ready",
      useCase: "avatar", // Different use case.
    });

    // Generate JWT access token
    const accessToken = generateVizAccessToken({
      fileToken,
      workspaceId: workspace.sId,
      shareScope: "public",
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: {
        fileId: targetFile.sId,
      },
      headers: {
        authorization: `Bearer ${accessToken}`,
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

    const fileToken = frameShareInfo?.shareUrl.split("/").at(-1);
    if (!fileToken) {
      throw new Error("No file token found");
    }

    // Target file with different use case (should be rejected).
    const targetFile = await FileFactory.create(workspace, null, {
      contentType: "image/png",
      fileName: "avatar.png",
      fileSize: 2000,
      status: "ready",
      useCase: "avatar", // Different use case.
    });

    // Generate JWT access token
    const accessToken = generateVizAccessToken({
      fileToken,
      workspaceId: workspace.sId,
      shareScope: "public",
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: {
        fileId: targetFile.sId,
      },
      headers: {
        authorization: `Bearer ${accessToken}`,
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

  it("should reject requests without Authorization header", async () => {
    const targetFile = await FileFactory.create(workspace, null, {
      contentType: "text/plain",
      fileName: "target.txt",
      fileSize: 500,
      status: "ready",
      useCase: "conversation",
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: {
        fileId: targetFile.sId,
      },
      // No Authorization header
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "workspace_auth_error",
        message: "Authorization header required.",
      },
    });
  });

  it("should reject malformed Authorization header", async () => {
    const targetFile = await FileFactory.create(workspace, null, {
      contentType: "text/plain",
      fileName: "target.txt",
      fileSize: 500,
      status: "ready",
      useCase: "conversation",
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: {
        fileId: targetFile.sId,
      },
      headers: {
        authorization: "InvalidFormat token123",
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "workspace_auth_error",
        message: "Authorization header must use Bearer token format.",
      },
    });
  });

  it("should reject empty Bearer token", async () => {
    const targetFile = await FileFactory.create(workspace, null, {
      contentType: "text/plain",
      fileName: "target.txt",
      fileSize: 500,
      status: "ready",
      useCase: "conversation",
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: {
        fileId: targetFile.sId,
      },
      headers: {
        authorization: "Bearer   ", // Empty token with spaces
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "workspace_auth_error",
        message: "Access token is required.",
      },
    });
  });

  it("should reject invalid JWT token", async () => {
    const targetFile = await FileFactory.create(workspace, null, {
      contentType: "text/plain",
      fileName: "target.txt",
      fileSize: 500,
      status: "ready",
      useCase: "conversation",
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: {
        fileId: targetFile.sId,
      },
      headers: {
        authorization: "Bearer invalid.jwt.token",
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "workspace_auth_error",
        message: "Invalid or expired access token.",
      },
    });
  });
});
