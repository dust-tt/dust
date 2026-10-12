import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { setupAgentOwner } from "@app/tests/utils/AgentOwnerFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MAX_AGENT_SUGGESTED_PROMPTS } from "@app/types/api/assistant/configuration/suggested_prompts";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/assistant/recent_authors", () => ({
  agentConfigurationWasUpdatedBy: vi.fn(),
}));

function suggestedPromptsUrl(workspace: { sId: string }, aId: string) {
  return `/api/w/${workspace.sId}/assistant/agent_configurations/${aId}/suggested_prompts`;
}

function putSuggestedPrompts(
  workspace: { sId: string },
  aId: string,
  suggestedPrompts: string[]
) {
  return honoApp.request(suggestedPromptsUrl(workspace, aId), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ suggestedPrompts }),
  });
}

async function setupEditedAgent() {
  const { workspace, user } = await createPrivateApiMockRequest({
    role: "user",
  });
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  const agent = await AgentConfigurationFactory.createTestAgent(auth, {
    scope: "visible",
  });

  return { workspace, agent };
}

describe("/api/w/:wId/assistant/agent_configurations/:aId/suggested_prompts", () => {
  it("replaces the prompts and returns them in order", async () => {
    const { workspace, agent } = await setupEditedAgent();

    await putSuggestedPrompts(workspace, agent.sId, ["first", "second"]);
    const putResponse = await putSuggestedPrompts(workspace, agent.sId, [
      "third",
      "first",
    ]);
    expect(putResponse.status).toBe(200);

    const getResponse = await honoApp.request(
      suggestedPromptsUrl(workspace, agent.sId)
    );
    expect(getResponse.status).toBe(200);
    expect(await getResponse.json()).toEqual({
      suggestedPrompts: ["third", "first"],
    });
  });

  it("rejects more prompts than the limit", async () => {
    const { workspace, agent } = await setupEditedAgent();

    const response = await putSuggestedPrompts(
      workspace,
      agent.sId,
      Array.from(
        { length: MAX_AGENT_SUGGESTED_PROMPTS + 1 },
        (_, index) => `prompt ${index}`
      )
    );

    expect(response.status).toBe(400);
  });

  it("rejects updates from a member who does not edit the agent", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });
    const { agentOwnerAuth } = await setupAgentOwner(workspace, "user");
    const agent = await AgentConfigurationFactory.createTestAgent(
      agentOwnerAuth,
      { scope: "visible" }
    );

    const response = await putSuggestedPrompts(workspace, agent.sId, ["hi"]);

    expect(response.status).toBe(403);
  });
});
