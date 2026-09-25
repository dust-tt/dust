import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { setupAgentOwner } from "@app/tests/utils/AgentOwnerFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getLastAuthor(workspace: { sId: string }, aId: string) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/agent_configurations/${aId}/last_author`
  );
}

describe("GET /api/w/:wId/assistant/agent_configurations/:aId/last_author", () => {
  it("returns not found to a member for a hidden agent they do not edit", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });
    const { agentOwnerAuth } = await setupAgentOwner(workspace, "user");
    const agent = await AgentConfigurationFactory.createTestAgent(
      agentOwnerAuth,
      { scope: "hidden" }
    );

    const response = await getLastAuthor(workspace, agent.sId);

    expect(response.status).toBe(404);
  });

  it("returns the last author to an admin for an agent built on a space they cannot read", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });
    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const { agentOwner, agentOwnerAuth } = await setupAgentOwner(
      workspace,
      "user"
    );
    const restrictedSpace = await SpaceFactory.regular(workspace);
    await restrictedSpace.addMembers(internalAdminAuth, {
      userIds: [agentOwner.sId],
    });
    const agent = await AgentConfigurationFactory.createTestAgent(
      agentOwnerAuth,
      { scope: "visible", requestedSpaceIds: [restrictedSpace.id] }
    );

    const response = await getLastAuthor(workspace, agent.sId);

    expect(response.status).toBe(200);
    const { user } = await response.json();
    expect(user.sId).toBe(agentOwner.sId);
  });
});
