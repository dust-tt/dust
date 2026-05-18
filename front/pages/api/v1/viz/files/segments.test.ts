import { generateVizAccessToken } from "@app/lib/api/viz/access_tokens";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileResource } from "@app/lib/resources/file_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { frameContentType } from "@app/types/files";
import type { LightWorkspaceType } from "@app/types/user";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { PassThrough } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

import handler from "./[...segments]";

vi.mock("@app/lib/utils/rate_limiter", () => ({
  rateLimiter: vi.fn().mockResolvedValue(999),
  getTimeframeSecondsFromLiteral: vi.fn().mockReturnValue(60),
}));

vi.mock("@app/lib/plans/usage/seats", () => ({
  countActiveSeatsInWorkspace: vi.fn().mockResolvedValue(100),
  countActiveSeatsInWorkspaceCached: vi.fn().mockResolvedValue(100),
  invalidateActiveSeatsCache: vi.fn().mockResolvedValue(undefined),
}));

describe("/api/v1/viz/files/[...segments] security tests", () => {
  let workspace: LightWorkspaceType;
  let auth: Awaited<ReturnType<typeof createResourceTest>>["authenticator"];

  beforeEach(async () => {
    vi.clearAllMocks();
    const setup = await createResourceTest({ role: "user" });
    workspace = setup.workspace;
    auth = setup.authenticator;
  });

  // Call this AFTER makeFrameAndToken so file creation uses the global mock,
  // and the handler gets the success bucket via mockReturnValueOnce.
  function mockGcsFound() {
    vi.mocked(getPrivateUploadBucket).mockReturnValueOnce({
      getFileContentType: vi.fn().mockResolvedValue({
        isOk: () => true,
        isErr: () => false,
        value: "image/png",
      }),
      file: vi.fn().mockReturnValue({
        createReadStream: vi.fn().mockReturnValue(new PassThrough()),
      }),
    } as never);
  }

  async function makeFrameAndToken(
    useCaseMetadata: Record<string, string>,
    shareScope: "public" | "workspace" = "public"
  ) {
    const frameFile = await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "frame.html",
      fileSize: 1000,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata,
    });

    const frameShareInfo = await frameFile.getShareInfo();
    const fileToken = frameShareInfo?.shareUrl.split("/").at(-1);
    if (!fileToken) {
      throw new Error("No file token found");
    }

    const accessToken = generateVizAccessToken({
      contentType: frameContentType,
      fileToken,
      workspaceId: workspace.sId,
      shareScope,
    });

    return { frameFile, accessToken };
  }

  it("should serve a GCS file for a valid conversation-scoped path", async () => {
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const { frameFile, accessToken } = await makeFrameAndToken({
      conversationId: conversation.sId,
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { segments: ["conversation", "chart.png"] },
      headers: { authorization: `Bearer ${accessToken}` },
    });

    vi.spyOn(FileResource, "fetchByShareTokenWithContent").mockResolvedValue({
      file: frameFile,
      content: "<html>Frame content</html>",
      shareScope: "public",
    });

    mockGcsFound();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
  });

  it("should resolve conversationId from sourceConversationId for promoted frames", async () => {
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    // Promoted frame: spaceId + sourceConversationId, no conversationId.
    const { frameFile, accessToken } = await makeFrameAndToken({
      spaceId: "vlt_someSpaceId",
      sourceConversationId: conversation.sId,
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { segments: ["conversation", "chart.png"] },
      headers: { authorization: `Bearer ${accessToken}` },
    });

    vi.spyOn(FileResource, "fetchByShareTokenWithContent").mockResolvedValue({
      file: frameFile,
      content: "<html>Frame content</html>",
      shareScope: "public",
    });

    mockGcsFound();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
  });

  it("should reject when frame has no conversation context", async () => {
    const { frameFile, accessToken } = await makeFrameAndToken({}); // No conversationId.

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { segments: ["conversation", "chart.png"] },
      headers: { authorization: `Bearer ${accessToken}` },
    });

    vi.spyOn(FileResource, "fetchByShareTokenWithContent").mockResolvedValue({
      file: frameFile,
      content: "<html>Frame content</html>",
      shareScope: "public",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Frame has no conversation context for this path.",
      },
    });
  });

  it("should reject when shareScope has changed since token was issued", async () => {
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const { frameFile, accessToken } = await makeFrameAndToken(
      { conversationId: conversation.sId },
      "public"
    );

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { segments: ["conversation", "chart.png"] },
      headers: { authorization: `Bearer ${accessToken}` },
    });

    vi.spyOn(FileResource, "fetchByShareTokenWithContent").mockResolvedValue({
      file: frameFile,
      content: "<html>Frame content</html>",
      shareScope: "workspace", // Changed from "public".
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
  });

  it("should reject path traversal attempts", async () => {
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const { frameFile, accessToken } = await makeFrameAndToken({
      conversationId: conversation.sId,
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { segments: ["conversation", "..", "..", "etc", "passwd"] },
      headers: { authorization: `Bearer ${accessToken}` },
    });

    vi.spyOn(FileResource, "fetchByShareTokenWithContent").mockResolvedValue({
      file: frameFile,
      content: "<html>Frame content</html>",
      shareScope: "public",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "workspace_auth_error",
        message: "Access denied: path is outside allowed scope.",
      },
    });
  });

  it("should reject an invalid scope segment", async () => {
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const { frameFile, accessToken } = await makeFrameAndToken({
      conversationId: conversation.sId,
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { segments: ["invalid_scope", "chart.png"] },
      headers: { authorization: `Bearer ${accessToken}` },
    });

    vi.spyOn(FileResource, "fetchByShareTokenWithContent").mockResolvedValue({
      file: frameFile,
      content: "<html>Frame content</html>",
      shareScope: "public",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("should return 404 when GCS file does not exist", async () => {
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const { frameFile, accessToken } = await makeFrameAndToken({
      conversationId: conversation.sId,
    });

    // Default mock already returns isErr: () => true — file not found.

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { segments: ["conversation", "missing.png"] },
      headers: { authorization: `Bearer ${accessToken}` },
    });

    vi.spyOn(FileResource, "fetchByShareTokenWithContent").mockResolvedValue({
      file: frameFile,
      content: "<html>Frame content</html>",
      shareScope: "public",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: { type: "file_not_found", message: "File not found." },
    });
  });

  it("should reject requests without Authorization header", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { segments: ["conversation", "chart.png"] },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
  });

  it("should reject invalid JWT token", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { segments: ["conversation", "chart.png"] },
      headers: { authorization: "Bearer invalid.jwt.token" },
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

  it("should reject non-GET methods", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { segments: ["conversation", "chart.png"] },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });

  it("should reject non-frame files as the frame", async () => {
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const nonFrameFile = await FileFactory.create(auth, null, {
      contentType: "image/png",
      fileName: "avatar.png",
      fileSize: 1000,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    const { accessToken } = await makeFrameAndToken({
      conversationId: conversation.sId,
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { segments: ["conversation", "chart.png"] },
      headers: { authorization: `Bearer ${accessToken}` },
    });

    vi.spyOn(FileResource, "fetchByShareTokenWithContent").mockResolvedValue({
      file: nonFrameFile,
      content: "",
      shareScope: "public",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Only frame files can be shared publicly.",
      },
    });
  });
});
