import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { setupAgentOwner } from "@app/tests/utils/AgentOwnerFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getFeedbacks(workspace: { sId: string }, aId: string) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/agent_configurations/${aId}/feedbacks`
  );
}

describe("GET /api/w/:wId/assistant/agent_configurations/:aId/feedbacks", () => {
  it("returns not found to a member for a hidden agent they do not edit", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });
    const { agentOwnerAuth } = await setupAgentOwner(workspace, "user");
    const agent = await AgentConfigurationFactory.createTestAgent(
      agentOwnerAuth,
      { scope: "hidden" }
    );

    const response = await getFeedbacks(workspace, agent.sId);

    expect(response.status).toBe(404);
  });

  it("returns the feedbacks to an admin for a hidden agent they do not edit", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });
    const { agentOwnerAuth } = await setupAgentOwner(workspace, "user");
    const agent = await AgentConfigurationFactory.createTestAgent(
      agentOwnerAuth,
      { scope: "hidden" }
    );

    const response = await getFeedbacks(workspace, agent.sId);

    expect(response.status).toBe(200);
    expect((await response.json()).feedbacks).toEqual([]);
  });
});
