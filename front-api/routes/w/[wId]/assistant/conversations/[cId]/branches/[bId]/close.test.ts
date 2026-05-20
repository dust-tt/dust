import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCloseBranch } = vi.hoisted(() => ({
  mockCloseBranch: vi.fn(),
}));

vi.mock("@app/lib/api/assistant/conversation/branches", () => ({
  closeConversationBranch: mockCloseBranch,
}));

import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";

const CONVERSATION_SID = "conv_test123";
const BRANCH_SID = "cbranch_test123";

async function setupTest() {
  const { workspace, auth } = await createPrivateApiMockRequest({
    method: "POST",
    role: "admin",
  });
  return { workspace, auth };
}

function postClose(workspace: { sId: string }, cId: string, bId: string) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/conversations/${cId}/branches/${bId}/close`,
    { method: "POST" }
  );
}

describe("POST /api/w/:wId/assistant/conversations/:cId/branches/:bId/close", () => {
  beforeEach(() => {
    mockCloseBranch.mockReset();
  });

  it("should return 404 when conversation is missing", async () => {
    const { workspace, auth } = await setupTest();
    mockCloseBranch.mockResolvedValue({
      isErr: () => true,
      error: { code: "conversation_not_found" },
    });

    const response = await postClose(workspace, CONVERSATION_SID, BRANCH_SID);

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("conversation_not_found");
    expect(mockCloseBranch).toHaveBeenCalledWith(expect.anything(), {
      branchId: BRANCH_SID,
      conversationId: CONVERSATION_SID,
    });
    // Sanity check: ensure auth was resolved.
    expect(auth.getNonNullableWorkspace().sId).toBe(workspace.sId);
  });

  it("should return 404 when branch is missing", async () => {
    const { workspace } = await setupTest();
    mockCloseBranch.mockResolvedValue({
      isErr: () => true,
      error: { code: "branch_not_found" },
    });

    const response = await postClose(workspace, CONVERSATION_SID, BRANCH_SID);

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("branch_not_found");
  });

  it("should close branch and return closed branch id", async () => {
    const { workspace } = await setupTest();
    mockCloseBranch.mockResolvedValue({
      isErr: () => false,
      value: { conversationDeleted: false },
    });

    const response = await postClose(workspace, CONVERSATION_SID, BRANCH_SID);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.closedBranchId).toBe(BRANCH_SID);
    expect(body.conversationDeleted).toBe(false);
    expect(mockCloseBranch).toHaveBeenCalledWith(expect.anything(), {
      branchId: BRANCH_SID,
      conversationId: CONVERSATION_SID,
    });
  });
});
