import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { setupAgentOwner } from "@app/tests/utils/AgentOwnerFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getOverview(workspace: { sId: string }, aId: string) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/agent_configurations/${aId}/observability/overview?days=30`
  );
}

async function setupHiddenAgent(role: MembershipRoleType) {
  const { workspace } = await createPrivateApiMockRequest({ role });
  const { agentOwnerAuth } = await setupAgentOwner(workspace, "user");
  const agent = await AgentConfigurationFactory.createTestAgent(
    agentOwnerAuth,
    { scope: "hidden" }
  );
  return { workspace, agent };
}

describe("GET /api/w/:wId/assistant/agent_configurations/:aId/observability/overview", () => {
  it("returns the overview to a reader of the agent", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "user",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    const response = await getOverview(workspace, agent.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      feedbacks: {
        positiveFeedbacks: 0,
        negativeFeedbacks: 0,
        timePeriodSec: 30 * 24 * 60 * 60,
      },
    });
  });

  it("returns 404 to a manager for a hidden agent they cannot read", async () => {
    const { workspace, agent } = await setupHiddenAgent("manager");

    const response = await getOverview(workspace, agent.sId);

    expect(response.status).toBe(404);
  });

  it("lets an admin read a hidden agent they cannot read", async () => {
    const { workspace, agent } = await setupHiddenAgent("admin");

    const response = await getOverview(workspace, agent.sId);

    expect(response.status).toBe(200);
  });
});
