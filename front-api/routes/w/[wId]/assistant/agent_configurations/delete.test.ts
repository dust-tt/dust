import { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { setupAgentOwner } from "@app/tests/utils/AgentOwnerFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function deleteAgents(workspace: { sId: string }, agentIds: string[]) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/agent_configurations/delete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentConfigurationIds: agentIds }),
    }
  );
}

describe("POST /api/w/:wId/assistant/agent_configurations/delete", () => {
  it("lets a non-editor admin archive agents, including one built on a space they cannot read", async () => {
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
    const visibleAgent = await AgentConfigurationFactory.createTestAgent(
      agentOwnerAuth,
      { name: "Visible Agent" }
    );
    const restrictedAgent = await AgentConfigurationFactory.createTestAgent(
      agentOwnerAuth,
      { name: "Restricted Agent", requestedSpaceIds: [restrictedSpace.id] }
    );

    const response = await deleteAgents(workspace, [
      visibleAgent.sId,
      restrictedAgent.sId,
    ]);

    expect(response.status).toBe(200);
    expect((await response.json()).archived).toBe(2);
    const agents = await AgentResource.fetchByIds(internalAdminAuth, [
      visibleAgent.sId,
      restrictedAgent.sId,
    ]);
    expect(agents.map((a) => a.status)).toEqual(["archived", "archived"]);
  });

  it("archives nothing when the member does not hold admin on one of the agents", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "user",
    });
    const ownAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Own Agent",
    });
    const { agentOwnerAuth } = await setupAgentOwner(workspace, "user");
    const otherAgent = await AgentConfigurationFactory.createTestAgent(
      agentOwnerAuth,
      { name: "Other Agent", scope: "visible" }
    );

    const response = await deleteAgents(workspace, [
      ownAgent.sId,
      otherAgent.sId,
    ]);

    expect(response.status).toBe(403);
    const agents = await AgentResource.fetchByIds(agentOwnerAuth, [
      ownAgent.sId,
      otherAgent.sId,
    ]);
    expect(agents.map((a) => a.status)).toEqual(["active", "active"]);
  });
});
