import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SandboxFactory } from "@app/tests/utils/SandboxFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setup() {
  const { workspace, auth } = await createPrivateApiMockRequest({
    isSuperUser: true,
    role: "admin",
  });

  const agentConfiguration =
    await AgentConfigurationFactory.createTestAgent(auth);
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agentConfiguration.sId,
    messagesCreatedAt: [new Date()],
  });

  return { auth, conversation, workspace };
}

function configUrl(workspaceId: string, conversationId: string) {
  return `/api/poke/workspaces/${workspaceId}/conversations/${conversationId}/config`;
}

describe("GET /api/poke/workspaces/:wId/conversations/:cId/config", () => {
  it("returns the sandbox provider id and status when the conversation owns one", async () => {
    const { auth, conversation, workspace } = await setup();

    const sandbox = await SandboxFactory.create(auth, conversation, {
      status: "sleeping",
    });

    const response = await honoApp.request(
      configUrl(workspace.sId, conversation.sId)
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.sandbox).toEqual({
      providerId: sandbox.providerId,
      status: "sleeping",
    });
  });

  it("returns a null sandbox when the conversation owns none", async () => {
    const { conversation, workspace } = await setup();

    const response = await honoApp.request(
      configUrl(workspace.sId, conversation.sId)
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.sandbox).toBeNull();
  });
});
