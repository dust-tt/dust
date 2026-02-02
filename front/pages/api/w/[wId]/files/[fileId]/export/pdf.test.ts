import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { frameContentType } from "@app/types";

import handler from "./pdf";

// Mock DocumentRenderer to avoid actual rendering service calls.
vi.mock("@app/types", async (importOriginal) => {
  const mod = (await importOriginal()) as any;

  return {
    ...mod,
    DocumentRenderer: class MockDocumentRenderer {
      exportToPdf = vi.fn().mockResolvedValue({
        isOk: () => true,
        isErr: () => false,
        value: Buffer.from("mock-pdf-content"),
      });
    },
  };
});

// Mock config to return a document renderer URL.
vi.mock("@app/lib/api/config", () => ({
  default: {
    getDocumentRendererUrl: vi.fn().mockReturnValue("http://localhost:3100"),
    getVizPublicUrl: vi.fn().mockReturnValue("https://viz.dust.tt"),
    getAppUrl: vi.fn().mockReturnValue("http://localhost:3000"),
    getClientFacingUrl: vi.fn().mockReturnValue("http://localhost:3000"),
    getVizJwtSecret: vi.fn().mockReturnValue("test-secret"),
  },
}));

describe("POST /api/w/[wId]/files/[fileId]/export/pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 404 when file does not exist", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    req.query = {
      ...req.query,
      fileId: "non-existent-file",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  });

  it("should return 400 when file is not a frame", async () => {
    const { req, res, workspace, user, authenticator } =
      await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [new Date()],
    });

    // Create a non-frame file (PDF).
    const file = await FileFactory.create(workspace, user, {
      contentType: "application/pdf",
      fileName: "test.pdf",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: {
        conversationId: conversation.sId,
      },
    });

    req.query = {
      ...req.query,
      fileId: file.sId,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Only Frame files can be exported as PDF.",
      },
    });
  });

  it("should return 404 when user cannot access conversation", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    // Create a frame file with a non-existent conversation.
    const file = await FileFactory.create(workspace, user, {
      contentType: frameContentType,
      fileName: "test.frame",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: {
        conversationId: "non-existent-conversation",
      },
    });

    req.query = {
      ...req.query,
      fileId: file.sId,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  });

  it("should return 400 for invalid orientation value", async () => {
    const { req, res, workspace, user, authenticator } =
      await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(workspace, user, {
      contentType: frameContentType,
      fileName: "test.frame",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: {
        conversationId: conversation.sId,
      },
    });

    req.query = {
      ...req.query,
      fileId: file.sId,
    };

    req.body = {
      orientation: "invalid-orientation",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("should export PDF successfully with default orientation", async () => {
    const { req, res, workspace, user, authenticator } =
      await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(workspace, user, {
      contentType: frameContentType,
      fileName: "test.frame",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: {
        conversationId: conversation.sId,
      },
    });

    req.query = {
      ...req.query,
      fileId: file.sId,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getHeaders()["content-type"]).toBe("application/pdf");
    expect(res._getHeaders()["content-disposition"]).toContain(
      'attachment; filename="test.pdf"'
    );
  });

  it("should export PDF successfully with landscape orientation", async () => {
    const { req, res, workspace, user, authenticator } =
      await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(workspace, user, {
      contentType: frameContentType,
      fileName: "my-frame.frame",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: {
        conversationId: conversation.sId,
      },
    });

    req.query = {
      ...req.query,
      fileId: file.sId,
    };

    req.body = {
      orientation: "landscape",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getHeaders()["content-type"]).toBe("application/pdf");
    expect(res._getHeaders()["content-disposition"]).toContain(
      'attachment; filename="my-frame.pdf"'
    );
  });

  it("should return 405 for non-POST methods", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    req.query = {
      ...req.query,
      fileId: "some-file",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "method_not_supported_error",
        message: "Only POST method is supported.",
      },
    });
  });
});
