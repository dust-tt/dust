import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { setupAgentOwner } from "@app/tests/utils/AgentOwnerFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPokeApiMockRequest } from "@app/tests/utils/generic_poke_api_tests";
import { Ok } from "@app/types/shared/result";
import { describe, expect, it, vi } from "vitest";

// Token counting calls the core API, which tests do not run.
vi.mock("@app/lib/tokenization", () => ({
  tokenCountForTexts: vi.fn(
    async (texts: string[]) => new Ok(texts.map(() => 1))
  ),
}));

import { honoApp } from "@front-api/app";

function renderConversation(
  workspace: { sId: string },
  cId: string,
  body: unknown
) {
  return honoApp.request(
    `/api/poke/workspaces/${workspace.sId}/conversations/${cId}/render`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

async function setup() {
  const { workspace, auth } = await createPokeApiMockRequest({
    isSuperUser: true,
    role: "admin",
  });
  const { agentOwnerAuth } = await setupAgentOwner(workspace, "user");
  const agent = await AgentConfigurationFactory.createTestAgent(
    agentOwnerAuth,
    { scope: "hidden", instructions: "Answer like a pirate." }
  );
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agent.sId,
    messagesCreatedAt: [],
  });
  await ConversationFactory.createUserMessage({
    auth,
    workspace,
    conversation,
    content: "Hello",
  });
  return { workspace, agent, conversation };
}

describe("POST /api/poke/workspaces/:wId/conversations/:cId/render", () => {
  it("renders the system prompt with the instructions of a hidden agent", async () => {
    const { workspace, agent, conversation } = await setup();

    const response = await renderConversation(workspace, conversation.sId, {
      agentId: agent.sId,
      excludeActions: true,
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.systemPrompt).toContain("Answer like a pirate.");
  });

  it("returns 404 for an unknown agent", async () => {
    const { workspace, conversation } = await setup();

    const response = await renderConversation(workspace, conversation.sId, {
      agentId: "unknown-agent",
    });

    expect(response.status).toBe(404);
  });
});
