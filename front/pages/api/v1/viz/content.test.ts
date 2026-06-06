import type { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { generateVizAccessToken } from "@app/lib/api/viz/access_tokens";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { frameContentType } from "@app/types/files";
import type { ModelId } from "@app/types/shared/model_id";
import { Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { PassThrough } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import handler from "./content";

function makeMockFs(): DustFileSystem {
  return {
    stat: vi
      .fn()
      .mockResolvedValue(new Ok({ contentType: "text/plain", sizeBytes: 100 })),
    read: vi.fn().mockResolvedValue(new Ok(new PassThrough())),
  } as unknown as DustFileSystem;
}

describe("/api/v1/viz/content endpoint tests", () => {
  let workspace: LightWorkspaceType;
  let auth: Authenticator;

  beforeEach(async () => {
    vi.clearAllMocks();

    const { workspace: w, authenticator: a } = await createResourceTest({
      role: "user",
    });

    workspace = w;
    auth = a;
  });

  function mockFetchByShareToken(
    frameFile: FileResource,
    opts: {
      content?: string;
      shareScope?: "public" | "workspace";
      conversationSpaceId?: string | null;
    } = {}
  ) {
    const {
      content = "<html><h1>Interactive Frame</h1></html>",
      shareScope = "public",
      conversationSpaceId = null,
    } = opts;

    vi.spyOn(FileResource, "fetchByShareTokenWithContent").mockResolvedValue({
      file: frameFile,
      content,
      shareScope,
      shareableFileId: 1 as unknown as ModelId,
      workspace,
      conversationSpaceId,
      authorizedFileAccess: null,
      fs: makeMockFs(),
    });
  }

  it("should return frame content with valid JWT access token", async () => {
    const frameFile = await FileFactory.create(auth, null, {
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

    const accessToken = generateVizAccessToken({
      contentType: frameContentType,
      fileToken,
      workspaceId: workspace.sId,
      shareScope: "public",
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    mockFetchByShareToken(frameFile);

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      content: "<html><h1>Interactive Frame</h1></html>",
      contentType: frameContentType,
      metadata: {
        conversationId: "conversation-A",
      },
    });
  });

  it("should reject requests without Authorization header", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
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
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
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
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      headers: {
        authorization: "Bearer   ",
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
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
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

  it("should reject expired JWT token using time mocking", async () => {
    vi.useFakeTimers();

    const frameFile = await FileFactory.create(auth, null, {
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

    // Generate token with current time.
    const accessToken = generateVizAccessToken({
      contentType: frameContentType,
      fileToken,
      workspaceId: workspace.sId,
      shareScope: "public",
    });

    // Advance time by 2 hours to expire the token (default expiry is 1 minute).
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      headers: {
        authorization: `Bearer ${accessToken}`,
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

    vi.useRealTimers();
  });

  it("should reject when content is not found", async () => {
    const frameFile = await FileFactory.create(auth, null, {
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

    const accessToken = generateVizAccessToken({
      contentType: frameContentType,
      fileToken,
      workspaceId: workspace.sId,
      shareScope: "public",
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    vi.spyOn(FileResource, "fetchByShareTokenWithContent").mockResolvedValue(
      null
    );

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "file_not_found",
        message: "Content not found.",
      },
    });
  });

  it("should work with workspace scoped content", async () => {
    const frameFile = await FileFactory.create(auth, null, {
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

    const accessToken = generateVizAccessToken({
      contentType: frameContentType,
      fileToken,
      workspaceId: workspace.sId,
      shareScope: "workspace",
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    mockFetchByShareToken(frameFile, {
      content: "<html><h1>Workspace Frame</h1></html>",
      shareScope: "workspace",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      content: "<html><h1>Workspace Frame</h1></html>",
      contentType: frameContentType,
      metadata: {
        conversationId: "conversation-A",
      },
    });
  });
});
