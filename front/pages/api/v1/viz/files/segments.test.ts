import type { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { generateVizAccessToken } from "@app/lib/api/viz/access_tokens";
import { DustError } from "@app/lib/error";
import { FileResource } from "@app/lib/resources/file_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { frameContentType } from "@app/types/files";
import type { ModelId } from "@app/types/shared/model_id";
import { Err, Ok } from "@app/types/shared/result";
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a minimal DustFileSystem-compatible mock. */
function makeMockFs({
  found = true,
}: {
  found?: boolean;
} = {}): DustFileSystem {
  return {
    stat: vi
      .fn()
      .mockResolvedValue(
        found
          ? new Ok({ contentType: "image/png", sizeBytes: 100 })
          : new Ok(null)
      ),
    read: vi
      .fn()
      .mockResolvedValue(found ? new Ok(new PassThrough()) : new Ok(null)),
  } as unknown as DustFileSystem;
}

describe("/api/v1/viz/files/[...segments] security tests", () => {
  let workspace: LightWorkspaceType;
  let auth: Awaited<ReturnType<typeof createResourceTest>>["authenticator"];

  beforeEach(async () => {
    vi.clearAllMocks();
    const setup = await createResourceTest({ role: "user" });
    workspace = setup.workspace;
    auth = setup.authenticator;
  });

  /**
   * Creates a real frame file in the test DB and returns its share JWT.
   * The share token is real so that WorkspaceResource.fetchByModelId (called
   * by the handler after fetchByShareToken) resolves to the correct workspace.
   */
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

    return { frameFile, accessToken, fileToken };
  }

  /**
   * Stubs fetchByShareToken so no DB round-trip is needed for the token
   * lookup. WorkspaceResource.fetchByModelId still runs against the real DB
   * (frameFile.workspaceId points to the test workspace created in beforeEach).
   */
  function mockFetchByShareToken(
    frameFile: FileResource,
    opts: {
      shareScope?: "public" | "workspace";
      conversationSpaceId?: string | null;
      fs?: DustFileSystem;
    } = {}
  ) {
    const {
      shareScope = "public",
      conversationSpaceId = null,
      fs = makeMockFs({ found: true }),
    } = opts;

    vi.spyOn(FileResource, "fetchByShareToken").mockResolvedValue(
      new Ok({
        file: frameFile,
        shareScope,
        shareableFileId: 1 as unknown as ModelId,
        workspace,
        conversationSpaceId,
        authorizedFileAccess: null,
        fs,
      })
    );
    return fs;
  }

  // -------------------------------------------------------------------------
  // Auth / token checks (no DB setup needed)
  // -------------------------------------------------------------------------

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

    // Scope validation happens before fetchByShareToken; no need to mock it.
    mockFetchByShareToken(frameFile);
    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  // -------------------------------------------------------------------------
  // fetchByShareToken failure
  // -------------------------------------------------------------------------

  it("should return 404 when the share token is not found", async () => {
    const { accessToken } = await makeFrameAndToken({});

    vi.spyOn(FileResource, "fetchByShareToken").mockResolvedValue(
      new Err(new DustError("file_not_found", "Share not found"))
    );

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { segments: ["conversation", "chart.png"] },
      headers: { authorization: `Bearer ${accessToken}` },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: { type: "file_not_found", message: "File not found." },
    });
  });

  it("should reject when shareScope has changed since token was issued", async () => {
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    // Token says "public" but mock returns "workspace" — scope has changed.
    const { frameFile, accessToken } = await makeFrameAndToken(
      { conversationId: conversation.sId },
      "public"
    );

    mockFetchByShareToken(frameFile, { shareScope: "workspace" });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { segments: ["conversation", "chart.png"] },
      headers: { authorization: `Bearer ${accessToken}` },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
  });

  it("should reject non-frame files used as the frame", async () => {
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

    // The token resolves to a non-frame file.
    mockFetchByShareToken(nonFrameFile);

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { segments: ["conversation", "chart.png"] },
      headers: { authorization: `Bearer ${accessToken}` },
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

  // -------------------------------------------------------------------------
  // Path traversal
  // -------------------------------------------------------------------------

  it("should reject path traversal attempts", async () => {
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const { frameFile, accessToken } = await makeFrameAndToken({
      conversationId: conversation.sId,
    });

    mockFetchByShareToken(frameFile);

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { segments: ["conversation", "..", "..", "etc", "passwd"] },
      headers: { authorization: `Bearer ${accessToken}` },
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

  // -------------------------------------------------------------------------
  // Legacy conversation scope
  // -------------------------------------------------------------------------

  it("should serve a file for a legacy conversation-scoped path", async () => {
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const { frameFile, accessToken } = await makeFrameAndToken({
      conversationId: conversation.sId,
    });

    mockFetchByShareToken(frameFile);

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { segments: ["conversation", "chart.png"] },
      headers: { authorization: `Bearer ${accessToken}` },
    });

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

    mockFetchByShareToken(frameFile);

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { segments: ["conversation", "chart.png"] },
      headers: { authorization: `Bearer ${accessToken}` },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
  });

  it("should reject when frame has no conversation context for a legacy conversation path", async () => {
    const { frameFile, accessToken } = await makeFrameAndToken({}); // No conversationId.

    mockFetchByShareToken(frameFile);

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { segments: ["conversation", "chart.png"] },
      headers: { authorization: `Bearer ${accessToken}` },
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

  // -------------------------------------------------------------------------
  // Legacy project scope
  // -------------------------------------------------------------------------

  it("should serve a file for a project-scoped frame (spaceId in metadata)", async () => {
    const { frameFile, accessToken } = await makeFrameAndToken({
      spaceId: "vlt_someSpaceId",
    });

    mockFetchByShareToken(frameFile);

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { segments: ["pod", "chart.png"] },
      headers: { authorization: `Bearer ${accessToken}` },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
  });

  it("should serve a file via conversationSpaceId when frame has no spaceId in metadata", async () => {
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const { frameFile, accessToken } = await makeFrameAndToken({
      conversationId: conversation.sId,
    });

    // conversationSpaceId is resolved by fetchByShareToken from the conversation's space.
    mockFetchByShareToken(frameFile, {
      conversationSpaceId: "vlt_derivedSpaceId",
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { segments: ["pod", "chart.png"] },
      headers: { authorization: `Bearer ${accessToken}` },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
  });

  it("should reject a legacy project path when frame has no project context", async () => {
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const { frameFile, accessToken } = await makeFrameAndToken({
      conversationId: conversation.sId,
    });

    // No spaceId in metadata and no conversationSpaceId.
    mockFetchByShareToken(frameFile, { conversationSpaceId: null });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { segments: ["pod", "chart.png"] },
      headers: { authorization: `Bearer ${accessToken}` },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Frame has no project context for this path.",
      },
    });
  });

  // -------------------------------------------------------------------------
  // File not found via the FS
  // -------------------------------------------------------------------------

  it("should return 404 when the scoped file does not exist", async () => {
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const { frameFile, accessToken } = await makeFrameAndToken({
      conversationId: conversation.sId,
    });

    // fs.stat returns Ok(null) → file not found.
    mockFetchByShareToken(frameFile, { fs: makeMockFs({ found: false }) });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { segments: ["conversation", "missing.png"] },
      headers: { authorization: `Bearer ${accessToken}` },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: { type: "file_not_found", message: "File not found." },
    });
  });

  // -------------------------------------------------------------------------
  // Canonical conversation scope
  // -------------------------------------------------------------------------

  it("should serve a file for a canonical conversation-scoped path", async () => {
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const { frameFile, accessToken } = await makeFrameAndToken({
      conversationId: conversation.sId,
    });

    mockFetchByShareToken(frameFile);

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: {
        segments: [`conversation-${conversation.sId}`, "chart.png"],
      },
      headers: { authorization: `Bearer ${accessToken}` },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
  });

  it("should reject a canonical conversation path when the ID does not match the frame", async () => {
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const { frameFile, accessToken } = await makeFrameAndToken({
      conversationId: conversation.sId,
    });

    mockFetchByShareToken(frameFile);

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      // Intentionally wrong conversation ID.
      query: { segments: ["conversation-different_conv_id", "chart.png"] },
      headers: { authorization: `Bearer ${accessToken}` },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "workspace_auth_error",
        message: "Access denied: conversation ID does not match frame context.",
      },
    });
  });

  it("should resolve sourceConversationId for canonical conversation paths on promoted frames", async () => {
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    // Promoted frame: only sourceConversationId, no conversationId.
    const { frameFile, accessToken } = await makeFrameAndToken({
      spaceId: "vlt_someSpaceId",
      sourceConversationId: conversation.sId,
    });

    mockFetchByShareToken(frameFile);

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: {
        segments: [`conversation-${conversation.sId}`, "chart.png"],
      },
      headers: { authorization: `Bearer ${accessToken}` },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
  });

  // -------------------------------------------------------------------------
  // Canonical pod scope
  // -------------------------------------------------------------------------

  it("should serve a file for a canonical pod-scoped path", async () => {
    const podId = "vlt_mypod";
    const { frameFile, accessToken } = await makeFrameAndToken({
      spaceId: podId,
    });

    mockFetchByShareToken(frameFile);

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { segments: [`pod-${podId}`, "data.csv"] },
      headers: { authorization: `Bearer ${accessToken}` },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
  });

  it("should resolve pod ID from conversationSpaceId for a canonical pod path", async () => {
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });
    const derivedSpaceId = "vlt_derivedSpace";

    const { frameFile, accessToken } = await makeFrameAndToken({
      conversationId: conversation.sId,
    });

    mockFetchByShareToken(frameFile, { conversationSpaceId: derivedSpaceId });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { segments: [`pod-${derivedSpaceId}`, "shared.md"] },
      headers: { authorization: `Bearer ${accessToken}` },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
  });

  it("should reject a canonical pod path when the ID does not match the frame", async () => {
    const { frameFile, accessToken } = await makeFrameAndToken({
      spaceId: "vlt_correctpod",
    });

    mockFetchByShareToken(frameFile);

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      // Intentionally wrong pod ID.
      query: { segments: ["pod-vlt_wrongpod", "data.csv"] },
      headers: { authorization: `Bearer ${accessToken}` },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "workspace_auth_error",
        message: "Access denied: pod ID does not match frame context.",
      },
    });
  });

  it("should reject a canonical path with a missing resource ID", async () => {
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const { frameFile, accessToken } = await makeFrameAndToken({
      conversationId: conversation.sId,
    });

    mockFetchByShareToken(frameFile);

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      // "conversation-" with no ID after the dash.
      query: { segments: ["conversation-", "chart.png"] },
      headers: { authorization: `Bearer ${accessToken}` },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });
});
