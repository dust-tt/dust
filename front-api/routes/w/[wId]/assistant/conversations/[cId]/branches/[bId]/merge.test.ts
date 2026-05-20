import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockMergeBranch } = vi.hoisted(() => ({
  mockMergeBranch: vi.fn(),
}));

vi.mock("@app/lib/api/assistant/conversation/branches", () => ({
  mergeConversationBranch: mockMergeBranch,
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

function postMerge(workspace: { sId: string }, cId: string, bId: string) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/conversations/${cId}/branches/${bId}/merge`,
    { method: "POST" }
  );
}

describe("POST /api/w/:wId/assistant/conversations/:cId/branches/:bId/merge", () => {
  beforeEach(() => {
    mockMergeBranch.mockReset();
  });

  it("should return 404 when conversation is missing", async () => {
    const { workspace, auth } = await setupTest();
    mockMergeBranch.mockResolvedValue({
      isErr: () => true,
      error: { code: "conversation_not_found" },
    });

    const response = await postMerge(workspace, CONVERSATION_SID, BRANCH_SID);

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("conversation_not_found");
    expect(mockMergeBranch).toHaveBeenCalledWith(expect.anything(), {
      branchId: BRANCH_SID,
      conversationId: CONVERSATION_SID,
    });
    // Sanity check: ensure auth was resolved.
    expect(auth.getNonNullableWorkspace().sId).toBe(workspace.sId);
  });

  it("should return 404 when branch is missing", async () => {
    const { workspace } = await setupTest();
    mockMergeBranch.mockResolvedValue({
      isErr: () => true,
      error: { code: "branch_not_found" },
    });

    const response = await postMerge(workspace, CONVERSATION_SID, BRANCH_SID);

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("branch_not_found");
  });

  it("should merge branch and return merged message ids", async () => {
    const { workspace } = await setupTest();
    mockMergeBranch.mockResolvedValue({
      isErr: () => false,
      value: {
        mergedUserMessageId: "msg_user_1",
        mergedAgentMessageIds: ["msg_agent_1"],
      },
    });

    const response = await postMerge(workspace, CONVERSATION_SID, BRANCH_SID);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.mergedUserMessageId).toBe("msg_user_1");
    expect(body.mergedAgentMessageIds).toEqual(["msg_agent_1"]);
    expect(mockMergeBranch).toHaveBeenCalledWith(expect.anything(), {
      branchId: BRANCH_SID,
      conversationId: CONVERSATION_SID,
    });
  });
});
