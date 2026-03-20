import handler from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/sandbox/files/download";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import type { RequestMethod } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetFileContentType, mockCreateReadStream } = vi.hoisted(() => ({
  mockGetFileContentType: vi.fn().mockResolvedValue("application/pdf"),
  mockCreateReadStream: vi.fn().mockReturnValue({
    on: vi.fn().mockReturnThis(),
    pipe: vi.fn(),
  }),
}));

vi.mock("@app/lib/api/auth_wrappers", async () => {
  const actual = await vi.importActual("@app/lib/api/auth_wrappers");
  return {
    ...actual,
    withSessionAuthenticationForWorkspace: (handler: any) => {
      return async (req: any, res: any) => {
        return handler(req, res, req.auth);
      };
    },
  };
});

vi.mock("@app/lib/api/assistant/conversation/fetch", () => ({
  getLightConversation: vi.fn().mockResolvedValue({ isErr: () => false }),
}));

vi.mock("@app/lib/file_storage", () => ({
  getPrivateUploadBucket: () => ({
    getFileContentType: mockGetFileContentType,
    file: () => ({
      createReadStream: mockCreateReadStream,
    }),
  }),
}));

const WORKSPACE_SID = "ws_test123";
const CONVERSATION_SID = "conv_abc";

async function setupTest(method: RequestMethod = "POST") {
  const { req, res } = await createPublicApiMockRequest({ method });

  req.query = { wId: WORKSPACE_SID, cId: CONVERSATION_SID };
  req.auth = {
    getNonNullableWorkspace: () => ({ sId: WORKSPACE_SID }),
  };

  return { req, res };
}

describe("POST /api/w/[wId]/assistant/conversations/[cId]/sandbox/files/download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 405 for non-POST methods", async () => {
    const { req, res } = await setupTest("GET");

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
    const { req, res } = await setupTest();
    req.body = {
      filePath: `w/${WORKSPACE_SID}/conversations/${CONVERSATION_SID}/files/../../other/secret.txt`,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error.type).toBe("workspace_auth_error");
  });

  it("should return 403 for path outside conversation scope", async () => {
    const { req, res } = await setupTest();
    req.body = {
      filePath: `w/${WORKSPACE_SID}/conversations/other_conv/files/secret.txt`,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error.type).toBe("workspace_auth_error");
  });

  it("should return 403 for path targeting a different workspace", async () => {
    const { req, res } = await setupTest();
    req.body = {
      filePath: `w/other_workspace/conversations/${CONVERSATION_SID}/files/file.txt`,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error.type).toBe("workspace_auth_error");
  });

  it("should succeed for a valid file path", async () => {
    const { req, res } = await setupTest();
    req.body = {
      filePath: `w/${WORKSPACE_SID}/conversations/${CONVERSATION_SID}/files/report.pdf`,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(mockCreateReadStream).toHaveBeenCalled();
  });
});
