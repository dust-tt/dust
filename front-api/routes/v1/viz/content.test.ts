import { generateVizAccessToken } from "@app/lib/api/viz/access_tokens";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { frameContentType } from "@app/types/files";
import type { LightWorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

  function request(headers: Record<string, string> = {}) {
    return honoApp.request("/api/v1/viz/content", { headers });
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

    vi.spyOn(FileResource, "fetchByShareTokenWithContent").mockResolvedValue({
      file: frameFile,
      content: "<html><h1>Interactive Frame</h1></html>",
      shareScope: "public",
      conversationSpaceId: null,
    });

    const response = await request({
      authorization: `Bearer ${accessToken}`,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      content: "<html><h1>Interactive Frame</h1></html>",
      contentType: frameContentType,
      metadata: {
        conversationId: "conversation-A",
      },
    });
  });

  it("should reject requests without Authorization header", async () => {
    const response = await request();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        type: "workspace_auth_error",
        message: "Authorization header required.",
      },
    });
  });

  it("should reject malformed Authorization header", async () => {
    const response = await request({
      authorization: "InvalidFormat token123",
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        type: "workspace_auth_error",
        message: "Authorization header must use Bearer token format.",
      },
    });
  });

  it("should reject empty Bearer token", async () => {
    // The WHATWG Headers layer used by the HTTP transport trims trailing
    // whitespace from header values, so "Bearer   " arrives as "Bearer" and is
    // rejected as a malformed Bearer header (the pure-whitespace-token branch is
    // not reachable over real HTTP).
    const response = await request({
      authorization: "Bearer   ",
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        type: "workspace_auth_error",
        message: "Authorization header must use Bearer token format.",
      },
    });
  });

  it("should reject invalid JWT token", async () => {
    const response = await request({
      authorization: "Bearer invalid.jwt.token",
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
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

    const response = await request({
      authorization: `Bearer ${accessToken}`,
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
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

    vi.spyOn(FileResource, "fetchByShareTokenWithContent").mockResolvedValue(
      null
    );

    const response = await request({
      authorization: `Bearer ${accessToken}`,
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
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

    vi.spyOn(FileResource, "fetchByShareTokenWithContent").mockResolvedValue({
      file: frameFile,
      content: "<html><h1>Workspace Frame</h1></html>",
      shareScope: "workspace",
      conversationSpaceId: null,
    });

    const response = await request({
      authorization: `Bearer ${accessToken}`,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      content: "<html><h1>Workspace Frame</h1></html>",
      contentType: frameContentType,
      metadata: {
        conversationId: "conversation-A",
      },
    });
  });
});
