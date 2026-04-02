import handler from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/branches/[bId]/close";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import type { RequestMethod } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCloseBranch } = vi.hoisted(() => ({
  mockCloseBranch: vi.fn(),
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

vi.mock("@app/lib/api/assistant/conversation/branches", () => ({
  closeConversationBranch: mockCloseBranch,
}));

const WORKSPACE_SID = "ws_test123";
const CONVERSATION_SID = "conv_test123";
const BRANCH_SID = "cbranch_test123";

async function setupTest(method: RequestMethod = "POST") {
  const { req, res } = await createPublicApiMockRequest({ method });

  req.query = { wId: WORKSPACE_SID, cId: CONVERSATION_SID, bId: BRANCH_SID };
  req.auth = {
    getNonNullableWorkspace: () => ({ sId: WORKSPACE_SID }),
    getNonNullableUser: () => ({ id: 7 }),
  };

  return { req, res };
}

describe("POST /api/w/[wId]/assistant/conversations/[cId]/branches/[bId]/close", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 405 for non-POST methods", async () => {
    const { req, res } = await setupTest("GET");

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });

  it("should return 404 when conversation is missing", async () => {
    const { req, res } = await setupTest();
    mockCloseBranch.mockResolvedValue({
      isErr: () => true,
      error: { code: "conversation_not_found" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData().error.type).toBe("conversation_not_found");
  });

  it("should return 404 when branch is missing", async () => {
    const { req, res } = await setupTest();
    mockCloseBranch.mockResolvedValue({
      isErr: () => true,
      error: { code: "branch_not_found" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData().error.type).toBe("branch_not_found");
  });

  it("should close branch and return closed branch id", async () => {
    const { req, res } = await setupTest();
    mockCloseBranch.mockResolvedValue({
      isErr: () => false,
      value: { closedBranchId: 456 },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().closedBranchId).toBe(BRANCH_SID);
    expect(mockCloseBranch).toHaveBeenCalledWith(req.auth, {
      branchId: BRANCH_SID,
      conversationId: CONVERSATION_SID,
    });
  });
});
