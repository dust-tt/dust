import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it } from "vitest";

function planModeUrl(wId: string, cId: string) {
  return `/api/w/${wId}/assistant/conversations/${cId}/plan_mode`;
}

describe("DELETE /api/w/[wId]/assistant/conversations/[cId]/plan_mode", () => {
  beforeEach(() => {
    fileStorageMock.reset();
  });

  // Closing is idempotent: a stale card, another tab, or the agent closing the plan first leaves
  // no active plan, and the HTTP path treats that as success rather than a 500.
  it("returns 200 when there is no active plan to close", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "DELETE",
      role: "user",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    fileStorageMock.setFileExists(() => false);

    const response = await honoApp.request(
      planModeUrl(workspace.sId, conversation.sId),
      { method: "DELETE" }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });
});
