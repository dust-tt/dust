import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { isAgentMessageType } from "@app/types/assistant/conversation";
import { AUTO_COMPLEX_MODEL_ID } from "@app/types/assistant/models/auto";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function retry(body?: unknown) {
  const { workspace, auth } = await createPrivateApiMockRequest({
    role: "user",
    method: "POST",
  });

  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    messagesCreatedAt: [new Date()],
  });

  const agentMessage = conversation.content.flat().find(isAgentMessageType);
  if (!agentMessage) {
    throw new Error("Just-created conversation has no agent message.");
  }

  const response = await honoApp.request(
    `/api/w/${workspace.sId}/assistant/conversations/${conversation.sId}/messages/${agentMessage.sId}/retry?blocked_only=false`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }
  );

  return { response, agentMessage };
}

describe("POST /api/w/:wId/assistant/conversations/:cId/messages/:mId/retry", () => {
  // Clients that predate the model-selection body POST with a JSON content type
  // and no body at all; the endpoint must keep accepting that.
  it("retries without a request body", async () => {
    const { response, agentMessage } = await retry();

    expect(response.status).toBe(200);
    const { message } = await response.json();
    expect(message.version).toBe(agentMessage.version + 1);
  });

  it("runs the retry on the model selection given in the body", async () => {
    const { response } = await retry({
      modelSelection: {
        providerId: AUTO_COMPLEX_MODEL_ID,
        modelId: AUTO_COMPLEX_MODEL_ID,
        reasoningEffort: "none",
      },
    });

    expect(response.status).toBe(200);
    const { message } = await response.json();
    expect(message.modelResolutionMethod).toBe(AUTO_COMPLEX_MODEL_ID);
  });
});
