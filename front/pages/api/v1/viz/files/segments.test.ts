import { generateVizAccessToken } from "@app/lib/api/viz/access_tokens";
import * as authorizedFileAccessModule from "@app/lib/api/viz/authorized_file_access";
import { computeFrameContentHash } from "@app/lib/api/viz/authorized_file_access_policy";
import { FileResource } from "@app/lib/resources/file_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import {
  type AuthorizedFileAccessAllowlist,
  frameContentType,
} from "@app/types/files";
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
   * Stubs fetchByShareTokenWithContent so no DB round-trip is needed for the
   * token lookup. WorkspaceResource.fetchByModelId still runs against the real
   * DB (frameFile.workspaceId points to the test workspace created in beforeEach).
   */
  const FRAME_CONTENT_FOR_ALLOWLIST = "export default function Frame() {}";

  function allowlistForCanonicalPath(
    canonicalPath: string,
    legacyPath?: string
  ): AuthorizedFileAccessAllowlist {
    return {
      computedByUserId: auth.user()!.sId,
      frameContentHash: computeFrameContentHash(FRAME_CONTENT_FOR_ALLOWLIST),
      refs: [
        {
          kind: "canonical_path",
          ref: canonicalPath,
          ...(legacyPath ? { legacyPath } : {}),
          fileName: canonicalPath.split("/").pop() ?? canonicalPath,
        },
      ],
    };
  }

  function mockAllowlistedFileRead() {
    return vi
      .spyOn(authorizedFileAccessModule, "readAllowlistedScopedVizFile")
      .mockResolvedValue(
        new Ok({
          contentType: "image/png",
          stream: new PassThrough(),
        })
      );
  }

  function mockAuthorizedScopedPathAccess(
    frameFile: FileResource,
    canonicalPath: string,
    legacyPath?: string
  ) {
    mockFetchByShareToken(frameFile, {
      authorizedFileAccess: allowlistForCanonicalPath(
        canonicalPath,
        legacyPath
      ),
    });
    vi.spyOn(
      authorizedFileAccessModule,
      "assertVizFileAuthorized"
    ).mockResolvedValue("authorized");
    mockAllowlistedFileRead();
  }

  function mockFetchByShareToken(
    frameFile: FileResource,
    opts: {
      shareScope?: "public" | "workspace";
      authorizedFileAccess?: AuthorizedFileAccessAllowlist | null;
    } = {}
  ) {
    const { shareScope = "public", authorizedFileAccess = null } = opts;

    let resolvedAllowlist = authorizedFileAccess;
    if (authorizedFileAccess) {
      resolvedAllowlist = {
        ...authorizedFileAccess,
        frameContentHash: computeFrameContentHash(FRAME_CONTENT_FOR_ALLOWLIST),
      };
    }

    vi.spyOn(FileResource, "fetchByShareTokenWithContent").mockResolvedValue({
      file: frameFile,
      content: FRAME_CONTENT_FOR_ALLOWLIST,
      shareScope,
      shareableFileId: 1 as unknown as ModelId,
      workspace,
      authorizedFileAccess: resolvedAllowlist,
    });
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

    // Scope validation happens before fetchByShareTokenWithContent; no need to mock it.
    mockFetchByShareToken(frameFile);
    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  // -------------------------------------------------------------------------
  // fetchByShareTokenWithContent failure
  // -------------------------------------------------------------------------

  it("should return 404 when the share token is not found", async () => {
    const { accessToken } = await makeFrameAndToken({});

    vi.spyOn(FileResource, "fetchByShareTokenWithContent").mockResolvedValue(
      null
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

  it("should return 404 when frame has no authorized file access allowlist", async () => {
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

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: { type: "file_not_found", message: "File not found." },
    });
  });

  it("should return 404 when the allowlisted scoped file does not exist", async () => {
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const { frameFile, accessToken } = await makeFrameAndToken({
      conversationId: conversation.sId,
    });

    const canonicalPath = `conversation-${conversation.sId}/missing.png`;
    mockFetchByShareToken(frameFile, {
      authorizedFileAccess: allowlistForCanonicalPath(
        canonicalPath,
        "conversation/missing.png"
      ),
    });
    vi.spyOn(
      authorizedFileAccessModule,
      "assertVizFileAuthorized"
    ).mockResolvedValue("authorized");
    vi.spyOn(
      authorizedFileAccessModule,
      "readAllowlistedScopedVizFile"
    ).mockResolvedValue(new Err(undefined));

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

    mockAuthorizedScopedPathAccess(
      frameFile,
      `conversation-${conversation.sId}/chart.png`
    );

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

  it("should reject a canonical conversation path that is not allowlisted", async () => {
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const { frameFile, accessToken } = await makeFrameAndToken({
      conversationId: conversation.sId,
    });

    mockAuthorizedScopedPathAccess(
      frameFile,
      `conversation-${conversation.sId}/allowed.png`
    );

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { segments: ["conversation-different_conv_id", "chart.png"] },
      headers: { authorization: `Bearer ${accessToken}` },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: { type: "file_not_found", message: "File not found." },
    });
  });

  it("should serve an allowlisted canonical conversation path on promoted frames", async () => {
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const { frameFile, accessToken } = await makeFrameAndToken({
      spaceId: "vlt_someSpaceId",
      sourceConversationId: conversation.sId,
    });

    mockAuthorizedScopedPathAccess(
      frameFile,
      `conversation-${conversation.sId}/chart.png`
    );

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

    mockAuthorizedScopedPathAccess(frameFile, `pod-${podId}/data.csv`);

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { segments: [`pod-${podId}`, "data.csv"] },
      headers: { authorization: `Bearer ${accessToken}` },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
  });

  it("should serve an allowlisted canonical pod path from another pod", async () => {
    const derivedSpaceId = "vlt_derivedSpace";

    const { frameFile, accessToken } = await makeFrameAndToken({
      conversationId: "conv_test",
    });

    mockAuthorizedScopedPathAccess(
      frameFile,
      `pod-${derivedSpaceId}/shared.md`
    );

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { segments: [`pod-${derivedSpaceId}`, "shared.md"] },
      headers: { authorization: `Bearer ${accessToken}` },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
  });

  it("should reject a canonical pod path that is not allowlisted", async () => {
    const { frameFile, accessToken } = await makeFrameAndToken({
      spaceId: "vlt_correctpod",
    });

    mockAuthorizedScopedPathAccess(frameFile, `pod-vlt_correctpod/allowed.csv`);

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { segments: ["pod-vlt_wrongpod", "data.csv"] },
      headers: { authorization: `Bearer ${accessToken}` },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: { type: "file_not_found", message: "File not found." },
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

  // -------------------------------------------------------------------------
  // Authorized file access allowlist
  // -------------------------------------------------------------------------

  describe("authorized file access allowlist", () => {
    it("should serve an allowlisted scoped path ref", async () => {
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });

      const { frameFile, accessToken } = await makeFrameAndToken({
        conversationId: conversation.sId,
      });

      const canonicalPath = `conversation-${conversation.sId}/chart.png`;
      mockFetchByShareToken(frameFile, {
        authorizedFileAccess: {
          computedByUserId: auth.user()!.sId,
          frameContentHash: "hash",
          refs: [
            {
              kind: "canonical_path",
              ref: canonicalPath,
              legacyPath: "conversation/chart.png",
              fileName: "chart.png",
            },
          ],
        },
      });

      vi.spyOn(
        authorizedFileAccessModule,
        "assertVizFileAuthorized"
      ).mockResolvedValue("authorized");
      mockAllowlistedFileRead();

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { segments: ["conversation", "chart.png"] },
        headers: { authorization: `Bearer ${accessToken}` },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
    });

    it("should serve an allowlisted file from a different pod than the frame", async () => {
      const framePodId = "vlt_framePod";
      const otherPodId = "vlt_otherPod";
      const otherPodPath = `pod-${otherPodId}/chart.png`;

      const { frameFile, accessToken } = await makeFrameAndToken({
        spaceId: framePodId,
      });

      mockFetchByShareToken(frameFile, {
        authorizedFileAccess: {
          computedByUserId: auth.user()!.sId,
          frameContentHash: "hash",
          refs: [
            {
              kind: "canonical_path",
              ref: otherPodPath,
              fileName: "chart.png",
            },
          ],
        },
      });

      vi.spyOn(
        authorizedFileAccessModule,
        "assertVizFileAuthorized"
      ).mockResolvedValue("authorized");
      const readSpy = mockAllowlistedFileRead();

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { segments: [`pod-${otherPodId}`, "chart.png"] },
        headers: { authorization: `Bearer ${accessToken}` },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(readSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          canonicalScopedPath: otherPodPath,
        })
      );
    });

    it("should serve an allowlisted legacy path without frame conversation context", async () => {
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });

      // Frame metadata lacks conversationId; legacy resolution would 400 without allowlist.
      const { frameFile, accessToken } = await makeFrameAndToken({});

      const canonicalPath = `conversation-${conversation.sId}/chart.png`;
      mockFetchByShareToken(frameFile, {
        authorizedFileAccess: {
          computedByUserId: auth.user()!.sId,
          frameContentHash: "hash",
          refs: [
            {
              kind: "canonical_path",
              ref: canonicalPath,
              legacyPath: "conversation/chart.png",
              fileName: "chart.png",
            },
          ],
        },
      });

      vi.spyOn(
        authorizedFileAccessModule,
        "assertVizFileAuthorized"
      ).mockResolvedValue("authorized");
      mockAllowlistedFileRead();

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { segments: ["conversation", "chart.png"] },
        headers: { authorization: `Bearer ${accessToken}` },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
    });

    it("should return 404 instead of 403 when a canonical path is not allowlisted", async () => {
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });

      const { frameFile, accessToken } = await makeFrameAndToken({
        conversationId: conversation.sId,
      });

      mockFetchByShareToken(frameFile, {
        authorizedFileAccess: {
          computedByUserId: auth.user()!.sId,
          frameContentHash: "hash",
          refs: [
            {
              kind: "canonical_path",
              ref: `conversation-${conversation.sId}/allowed.png`,
              fileName: "allowed.png",
            },
          ],
        },
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: {
          segments: ["conversation-different_conv_id", "chart.png"],
        },
        headers: { authorization: `Bearer ${accessToken}` },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
      expect(res._getJSONData()).toEqual({
        error: { type: "file_not_found", message: "File not found." },
      });
    });

    it("should reject a scoped path ref that is not on the allowlist", async () => {
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });

      const { frameFile, accessToken } = await makeFrameAndToken({
        conversationId: conversation.sId,
      });

      const allowedPath = `conversation-${conversation.sId}/allowed.png`;
      mockFetchByShareToken(frameFile, {
        authorizedFileAccess: {
          computedByUserId: auth.user()!.sId,
          frameContentHash: "hash",
          refs: [
            {
              kind: "canonical_path",
              ref: allowedPath,
              legacyPath: "conversation/allowed.png",
              fileName: "allowed.png",
            },
          ],
        },
      });

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
  });
});
