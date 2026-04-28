import handler from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/files/[...rel]";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { Err, Ok } from "@app/types/shared/result";
import type { RequestMethod } from "node-mocks-http";
import { PassThrough } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetFileContentType, mockCreateReadStream } = vi.hoisted(() => ({
  mockGetFileContentType: vi.fn(),
  mockCreateReadStream: vi.fn(),
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

vi.mock("@app/lib/resources/conversation_resource", () => ({
  ConversationResource: {
    fetchById: vi.fn().mockResolvedValue({ sId: "conv_abc" }),
  },
}));

vi.mock("@app/lib/file_storage", () => ({
  getPrivateUploadBucket: () => ({
    getFileContentType: mockGetFileContentType,
    file: () => ({ createReadStream: mockCreateReadStream }),
  }),
}));

const WORKSPACE_SID = "ws_test123";
const CONVERSATION_SID = "conv_abc";

async function setupTest(rel: string[], method: RequestMethod = "GET") {
  const { req, res } = await createPublicApiMockRequest({ method });

  req.query = { wId: WORKSPACE_SID, cId: CONVERSATION_SID, rel };
  req.auth = {
    getNonNullableWorkspace: () => ({ sId: WORKSPACE_SID }),
  };

  return { req, res };
}

describe("GET /api/w/[wId]/assistant/conversations/[cId]/files/[...rel]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetFileContentType.mockResolvedValue(new Ok("image/png"));
    mockCreateReadStream.mockReturnValue(
      Object.assign(new PassThrough(), {
        pipe: vi.fn(),
      })
    );
    const { ConversationResource } = await import(
      "@app/lib/resources/conversation_resource"
    );
    vi.mocked(ConversationResource.fetchById).mockResolvedValue({
      sId: CONVERSATION_SID,
    } as never);
  });

  it("should stream a file for a valid path", async () => {
    const { req, res } = await setupTest(["chart.png"]);
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(res.getHeader("Content-Type")).toBe("image/png");
  });

  it("should stream a nested file path", async () => {
    const { req, res } = await setupTest(["tool_outputs", "report.csv"]);
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(mockGetFileContentType).toHaveBeenCalledWith(
      expect.stringContaining("tool_outputs/report.csv")
    );
  });

  it("should return 404 when GCS file does not exist", async () => {
    mockGetFileContentType.mockResolvedValue(new Err(new Error("not found")));
    const { req, res } = await setupTest(["missing.png"]);
    await handler(req, res);
    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: { type: "file_not_found", message: "File not found." },
    });
  });

  it("should reject path traversal attempts", async () => {
    const { req, res } = await setupTest(["..", "..", "etc", "passwd"]);
    await handler(req, res);
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "workspace_auth_error",
        message: "Access denied: path is outside conversation scope.",
      },
    });
  });

  it("should return 404 when conversation is not found", async () => {
    const { ConversationResource } = await import(
      "@app/lib/resources/conversation_resource"
    );
    vi.mocked(ConversationResource.fetchById).mockResolvedValue(null);

    const { req, res } = await setupTest(["chart.png"]);
    await handler(req, res);
    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "conversation_not_found",
        message: "Conversation not found.",
      },
    });
  });

  it("should reject non-GET methods", async () => {
    const { req, res } = await setupTest(["chart.png"], "POST");
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  it("should reject missing rel segments", async () => {
    const { req, res } = await setupTest([]);
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it("should use conversation-scoped GCS path", async () => {
    const { req, res } = await setupTest(["chart.png"]);
    await handler(req, res);
    expect(mockGetFileContentType).toHaveBeenCalledWith(
      `w/${WORKSPACE_SID}/conversations/${CONVERSATION_SID}/files/chart.png`
    );
  });
});
