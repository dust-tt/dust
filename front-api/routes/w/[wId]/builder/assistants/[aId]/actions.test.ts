import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPServerConfigurationFactory } from "@app/tests/utils/AgentMCPServerConfigurationFactory";
import { setupAgentOwner } from "@app/tests/utils/AgentOwnerFactory";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getActions(workspace: { sId: string }, aId: string) {
  return honoApp.request(
    `/api/w/${workspace.sId}/builder/assistants/${aId}/actions`
  );
}

async function createHiddenAgentWithTool(
  workspace: Awaited<
    ReturnType<typeof createPrivateApiMockRequest>
  >["workspace"],
  ownerAuth: Authenticator
) {
  const { globalSpace } = await SpaceFactory.defaults(
    await Authenticator.internalAdminForWorkspace(workspace.sId)
  );
  const agent = await AgentConfigurationFactory.createTestAgent(ownerAuth, {
    name: "Hidden Tool Agent",
    scope: "hidden",
  });
  const server = await RemoteMCPServerFactory.create(workspace);
  const mcpServerView = await MCPServerViewFactory.create(
    workspace,
    server.sId,
    globalSpace
  );
  await AgentMCPServerConfigurationFactory.create(ownerAuth, globalSpace, {
    agent,
    mcpServerView,
  });
  return agent;
}

describe("GET /api/w/:wId/builder/assistants/:aId/actions", () => {
  it("returns the agent's tools to its editor", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "user",
    });
    const agent = await createHiddenAgentWithTool(workspace, auth);

    const response = await getActions(workspace, agent.sId);

    expect(response.status).toBe(200);
    expect((await response.json()).actions).toHaveLength(1);
  });

  it("returns not found to a member for a hidden agent they cannot read", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });
    const { agentOwnerAuth } = await setupAgentOwner(workspace, "user");
    const agent = await createHiddenAgentWithTool(workspace, agentOwnerAuth);

    const response = await getActions(workspace, agent.sId);

    expect(response.status).toBe(404);
  });

  it("returns not found for a global agent", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });

    const response = await getActions(workspace, GLOBAL_AGENTS_SID.DUST);

    expect(response.status).toBe(404);
  });
});
