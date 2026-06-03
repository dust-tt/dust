import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { frameContentType } from "@app/types/files";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/types/shared/document_renderer", async (importOriginal) => {
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

function url(workspace: { sId: string }, fileId: string) {
  return `/api/w/${workspace.sId}/files/${fileId}/export/pdf`;
}

function postPdf(
  workspace: { sId: string },
  fileId: string,
  body: unknown = {}
) {
  return honoApp.request(url(workspace, fileId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/w/:wId/files/:fileId/export/pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 404 when file does not exist", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const response = await postPdf(workspace, "non-existent-file");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  });

  it("should return 400 when file is not a frame", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(auth, user, {
      contentType: "application/pdf",
      fileName: "test.pdf",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: {
        conversationId: conversation.sId,
      },
    });

    const response = await postPdf(workspace, file.sId);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Only Frame files can be exported as PDF.",
      },
    });
  });

  it("should return 404 when user cannot access conversation", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "test.frame",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: {
        conversationId: "non-existent-conversation",
      },
    });

    const response = await postPdf(workspace, file.sId);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  });

  it("should return 400 for invalid orientation value", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "test.frame",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: {
        conversationId: conversation.sId,
      },
    });

    const response = await postPdf(workspace, file.sId, {
      orientation: "invalid-orientation",
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("should export PDF successfully with default orientation", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "test.frame",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: {
        conversationId: conversation.sId,
      },
    });

    const response = await postPdf(workspace, file.sId);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain(
      'attachment; filename="test.pdf"'
    );
  });

  it("should export PDF successfully with landscape orientation", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "my-frame.frame",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: {
        conversationId: conversation.sId,
      },
    });

    const response = await postPdf(workspace, file.sId, {
      orientation: "landscape",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain(
      'attachment; filename="my-frame.pdf"'
    );
  });

  it("should sanitize non-ASCII characters in Content-Disposition filename", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "Résumé données.frame",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: {
        conversationId: conversation.sId,
      },
    });

    const response = await postPdf(workspace, file.sId);

    expect(response.status).toBe(200);
    const disposition = response.headers.get("content-disposition") ?? "";
    // ASCII fallback should replace non-ASCII chars with underscores.
    expect(disposition).toContain('filename="R_sum_ donn_es.pdf"');
    // RFC 5987 filename* should contain the UTF-8 encoded original name.
    expect(disposition).toContain("filename*=UTF-8''");
    expect(disposition).toContain(encodeURIComponent("Résumé données.pdf"));
  });
});
