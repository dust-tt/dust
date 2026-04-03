import handler from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/files/download";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { RequestMethod } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetFileContentType, mockCreateReadStream } = vi.hoisted(() => ({
  mockGetFileContentType: vi.fn().mockResolvedValue("application/pdf"),
  mockCreateReadStream: vi.fn().mockReturnValue({
    on: vi.fn().mockReturnThis(),
    pipe: vi.fn(),
  }),
}));

vi.mock("@app/lib/file_storage", () => ({
  getPrivateUploadBucket: () => ({
    getFileContentType: mockGetFileContentType,
    file: () => ({
      createReadStream: mockCreateReadStream,
    }),
  }),
}));

async function setupTest(method: RequestMethod = "POST") {
  const { req, res, auth, workspace } = await createPrivateApiMockRequest({
    method,
  });

  const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
    name: "Test Agent",
    description: "Test Agent Description",
  });

  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agentConfig.sId,
    messagesCreatedAt: [],
  });

  req.query.wId = workspace.sId;
  req.query.cId = conversation.sId;

  return { req, res, workspace, auth: auth, conversation };
}

describe("POST /api/w/[wId]/assistant/conversations/[cId]/files/download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 405 for non-POST methods", async () => {
    const { req, res, workspace, conversation } = await setupTest("GET");
    req.body = {
      filePath: `w/${workspace.sId}/conversations/${conversation.sId}/files/report.pdf`,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });

  it("should return 400 when filePath is missing", async () => {
    const { req, res } = await setupTest();
    req.body = {};

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("should return 403 for path traversal with '..'", async () => {
    const { req, res, workspace, conversation } = await setupTest();
    req.body = {
      filePath: `w/${workspace.sId}/conversations/${conversation.sId}/files/../../other/secret.txt`,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error.type).toBe("workspace_auth_error");
  });

  it("should return 403 for path outside conversation scope", async () => {
    const { req, res, workspace } = await setupTest();
    req.body = {
      filePath: `w/${workspace.sId}/conversations/other_conv/files/secret.txt`,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error.type).toBe("workspace_auth_error");
  });

  it("should return 403 for path targeting a different workspace", async () => {
    const { req, res, conversation } = await setupTest();
    req.body = {
      filePath: `w/other_workspace/conversations/${conversation.sId}/files/file.txt`,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error.type).toBe("workspace_auth_error");
  });

  it("should normalize triple slashes before GCS access", async () => {
    const { req, res, workspace, conversation } = await setupTest();
    // Triple slashes pass the old startsWith check and don't contain "..",
    // but without normalization the raw path is sent to GCS as-is which could
    // resolve to an unintended object.
    req.body = {
      filePath: `w/${workspace.sId}/conversations/${conversation.sId}/files///report.pdf`,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(mockGetFileContentType).toHaveBeenCalledWith(
      `w/${workspace.sId}/conversations/${conversation.sId}/files/report.pdf`
    );
  });

  it("should succeed for a valid file path", async () => {
    const { req, res, workspace, conversation } = await setupTest();
    req.body = {
      filePath: `w/${workspace.sId}/conversations/${conversation.sId}/files/report.pdf`,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(mockCreateReadStream).toHaveBeenCalled();
  });
});
