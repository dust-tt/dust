import type { PublicPostConversationsRequestBody } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { Readable } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Redis connection to prevent REDIS_URI errors
vi.mock("@app/lib/api/redis", () => ({
  getRedisClient: vi.fn().mockReturnValue({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    ttl: vi.fn().mockResolvedValue(-1),
    del: vi.fn().mockResolvedValue(1),
  }),
}));

// Mock the cache utility to prevent Redis calls
vi.mock("@app/lib/utils/cache", async () => {
  const actual = await vi.importActual("@app/lib/utils/cache");
  return {
    ...actual,
    cacheWithRedis: vi.fn().mockImplementation((fn, resolver, options) => {
      // Return a function that bypasses caching and calls the original function
      return async (...args: any[]) => {
        // For seat counting, return a mock value directly
        const key = resolver(...args);
        if (key.includes("seats") || key.includes("active")) {
          return 100; // Mock 100 active seats
        }
        // For other cached functions, call the original
        return await fn(...args);
      };
    }),
    invalidateCacheWithRedis: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock the rate limiter functions
vi.mock("@app/lib/utils/rate_limiter", () => ({
  rateLimiter: vi.fn().mockResolvedValue(999), // Return high number = no limit
  getTimeframeSecondsFromLiteral: vi.fn().mockReturnValue(60),
}));

// Mock rate limit key generators
vi.mock("@app/lib/api/assistant/rate_limits", () => ({
  makeMessageRateLimitKeyForWorkspace: vi
    .fn()
    .mockReturnValue("test-message-key"),
  makeAgentMentionsRateLimitKeyForWorkspace: vi
    .fn()
    .mockReturnValue("test-mentions-key"),
}));

// Mock seat counting functions directly
vi.mock("@app/lib/plans/usage/seats", () => ({
  countActiveSeatsInWorkspace: vi.fn().mockResolvedValue(100),
  countActiveSeatsInWorkspaceCached: vi.fn().mockResolvedValue(100),
}));

import { generateVizAccessToken } from "@app/lib/api/viz/access_tokens";
import { mentionAgent } from "@app/lib/mentions";
import { FileResource } from "@app/lib/resources/file_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { LightWorkspaceType } from "@app/types";
import { frameContentType } from "@app/types/files";

import publicConversationsHandler from "../../w/[wId]/assistant/conversations/index";
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

  describe("conversation hierarchy access tests", () => {
    it("should allow access to files from sub-conversations created by agent handover", async () => {
      const {
        req: parentReq,
        res: parentRes,
        workspace,
        key,
      } = await createPublicApiMockRequest({
        method: "POST",
      });

      // Create parent conversation A using API.
      const parentBody: PublicPostConversationsRequestBody = {
        title: "Parent Conversation",
        visibility: "unlisted",
        depth: 0,
        message: {
          content: `${mentionAgent({
            name: "noop",
            sId: "noop",
          })} Hello from parent`,
          mentions: [{ configurationId: "noop" }],
          context: {
            timezone: "UTC",
            username: "test-user",
            fullName: "Test User",
            email: "test@example.com",
            profilePictureUrl: null,
            origin: "web",
          },
        },
      };

      parentReq.body = parentBody;
      parentReq.query.wId = workspace.sId;

      await publicConversationsHandler(parentReq, parentRes);

      expect(parentRes._getStatusCode()).toBe(200);
      const parentData = parentRes._getJSONData();
      const parentConversation = parentData.conversation;
      const parentMessageId = parentData.message.sId;

      console.log("Parent conversation created:", parentConversation.id);

      const { req: childReq, res: childRes } = await createPublicApiMockRequest(
        {
          method: "POST",
        }
      );

      // Use a new request to avoid state carry-over. But reuse same workspace and key.
      childReq.headers = {
        authorization: "Bearer " + key.secret,
      };
      childReq.query.wId = workspace.sId;

      // Create sub-conversation B that references parent message using API.
      const body: PublicPostConversationsRequestBody = {
        title: "Child Conversation",
        visibility: "unlisted",
        depth: 1,
        message: {
          content: `${mentionAgent({
            name: "noop",
            sId: "noop",
          })} Hello from child`,
          mentions: [{ configurationId: "noop" }],
          context: {
            timezone: "UTC",
            username: "test-user",
            fullName: "Test User",
            email: "test@example.com",
            profilePictureUrl: null,
            origin: "web",
            originMessageId: parentMessageId, // This creates the hierarchy!
          },
        },
      };

      childReq.body = body;

      await publicConversationsHandler(childReq, childRes);

      expect(childRes._getStatusCode()).toBe(200);
      const childData = childRes._getJSONData();
      const childConversation = childData.conversation;

      console.log("Child conversation created:", childConversation.id);

      // Create frame file in parent conversation A.
      const frameFile = await FileFactory.create(workspace, null, {
        contentType: frameContentType,
        fileName: "frame.html",
        fileSize: 1000,
        status: "ready",
        useCase: "conversation",
        useCaseMetadata: { conversationId: parentConversation.sId },
      });

      // Create target file in sub-conversation B.
      const targetFile = await FileFactory.create(workspace, null, {
        contentType: "text/plain",
        fileName: "sub-conversation-file.txt",
        fileSize: 500,
        status: "ready",
        useCase: "conversation",
        useCaseMetadata: { conversationId: childConversation.sId },
      });

      const frameShareInfo = await frameFile.getShareInfo();
      const fileToken = frameShareInfo?.shareUrl.split("/").at(-1);
      if (!fileToken) {
        throw new Error("No file token found");
      }

      const accessToken = generateVizAccessToken({
        fileToken,
        workspaceId: workspace.sId,
        shareScope: "public",
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { fileId: targetFile.sId },
        headers: { authorization: `Bearer ${accessToken}` },
      });

      vi.spyOn(FileResource, "fetchByShareTokenWithContent").mockResolvedValue({
        file: frameFile,
        content: "<html>Frame content</html>",
        shareScope: "public",
      });

      vi.spyOn(FileResource.prototype, "getSharedReadStream").mockReturnValue(
        Readable.from(["Sub-conversation file content"])
      );

      await handler(req, res);

      // Should succeed - file from sub-conversation should be accessible
      expect(res._getStatusCode()).toBe(200);
    });

    it("should reject access to files from unrelated conversations", async () => {
      const {
        req: parentReq,
        res: parentRes,
        workspace,
        key,
      } = await createPublicApiMockRequest({
        method: "POST",
      });

      // Create conversation A using API.
      const parentBody: PublicPostConversationsRequestBody = {
        title: "Parent Conversation",
        visibility: "unlisted",
        message: {
          content: `${mentionAgent({
            name: "noop",
            sId: "noop",
          })} Hello from parent`,
          mentions: [{ configurationId: "noop" }],
          context: {
            timezone: "UTC",
            username: "test-user",
            fullName: "Test User",
            email: "test@example.com",
            profilePictureUrl: null,
            origin: "web",
          },
        },
      };

      parentReq.body = parentBody;
      parentReq.query.wId = workspace.sId;

      await publicConversationsHandler(parentReq, parentRes);

      expect(parentRes._getStatusCode()).toBe(200);
      const parentData = parentRes._getJSONData();
      const conversationA = parentData.conversation;

      const { req: otherReq, res: otherRes } = await createPublicApiMockRequest(
        {
          method: "POST",
        }
      );

      // Use a new request to avoid state carry-over. But reuse same workspace and key.
      otherReq.headers = {
        authorization: "Bearer " + key.secret,
      };
      otherReq.query.wId = workspace.sId;

      // Create another unrelated conversation B using API.
      const body: PublicPostConversationsRequestBody = {
        title: "Another Conversation",
        visibility: "unlisted",
        depth: 0,
        message: {
          content: `${mentionAgent({
            name: "noop",
            sId: "noop",
          })} Hello from child`,
          mentions: [{ configurationId: "noop" }],
          context: {
            timezone: "UTC",
            username: "test-user",
            fullName: "Test User",
            email: "test@example.com",
            profilePictureUrl: null,
            origin: "web",
          },
        },
      };

      otherReq.body = body;

      await publicConversationsHandler(otherReq, otherRes);

      expect(otherRes._getStatusCode()).toBe(200);
      const childData = otherRes._getJSONData();
      const conversationB = childData.conversation;

      // Create frame file in conversation A.
      const frameFile = await FileFactory.create(workspace, null, {
        contentType: frameContentType,
        fileName: "frame.html",
        fileSize: 1000,
        status: "ready",
        useCase: "conversation",
        useCaseMetadata: { conversationId: conversationA.sId },
      });

      // Create target file in unrelated conversation B.
      const targetFile = await FileFactory.create(workspace, null, {
        contentType: "text/plain",
        fileName: "sub-conversation-file.txt",
        fileSize: 500,
        status: "ready",
        useCase: "conversation",
        useCaseMetadata: { conversationId: conversationB.sId },
      });

      const frameShareInfo = await frameFile.getShareInfo();
      const fileToken = frameShareInfo?.shareUrl.split("/").at(-1);
      if (!fileToken) {
        throw new Error("No file token found");
      }

      const accessToken = generateVizAccessToken({
        fileToken,
        workspaceId: workspace.sId,
        shareScope: "public",
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { fileId: targetFile.sId },
        headers: { authorization: `Bearer ${accessToken}` },
      });

      vi.spyOn(FileResource, "fetchByShareTokenWithContent").mockResolvedValue({
        file: frameFile,
        content: "<html>Frame content</html>",
        shareScope: "public",
      });

      vi.spyOn(FileResource.prototype, "getSharedReadStream").mockReturnValue(
        Readable.from(["Sub-conversation file content"])
      );

      await handler(req, res);

      // Should fail - file from unrelated conversation.
      expect(res._getStatusCode()).toBe(404);
    });
  });
});
