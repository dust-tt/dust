import { AgentResource } from "@app/lib/resources/agent_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { setupAgentOwner } from "@app/tests/utils/AgentOwnerFactory";
import { createPokeApiMockRequest } from "@app/tests/utils/generic_poke_api_tests";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { honoApp } from "@front-api/app";
import assert from "assert";
import { describe, expect, it } from "vitest";

function exportAgent(workspace: { sId: string }, aId: string) {
  return honoApp.request(
    `/api/poke/workspaces/${workspace.sId}/agent_configurations/${aId}/export`
  );
}

async function setup() {
  const { workspace } = await createPokeApiMockRequest({
    isSuperUser: true,
    role: "admin",
  });
  const { agentOwnerAuth } = await setupAgentOwner(workspace, "user");
  return { workspace, agentOwnerAuth };
}

describe("GET /api/poke/workspaces/:wId/agent_configurations/:aId/export", () => {
  it("exports the content of a hidden agent the superuser does not edit", async () => {
    const { workspace, agentOwnerAuth } = await setup();
    const agent = await AgentConfigurationFactory.createTestAgent(
      agentOwnerAuth,
      {
        name: "Hidden Export",
        scope: "hidden",
        instructions: "Private instructions.",
      }
    );

    const response = await exportAgent(workspace, agent.sId);

    expect(response.status).toBe(200);
    const { assistant } = await response.json();
    expect(assistant).toMatchObject({
      name: "Hidden Export",
      scope: "hidden",
      instructions: "Private instructions.",
    });
  });

  it("returns 404 for an unknown agent", async () => {
    const { workspace } = await setup();

    const response = await exportAgent(workspace, "unknown-agent");

    expect(response.status).toBe(404);
  });

  it("rejects an archived agent", async () => {
    const { workspace, agentOwnerAuth } = await setup();
    const agent =
      await AgentConfigurationFactory.createTestAgent(agentOwnerAuth);
    const resource = await AgentResource.fetchById(agentOwnerAuth, agent.sId);
    assert(resource);
    expect((await resource.archive(agentOwnerAuth)).isOk()).toBe(true);

    const response = await exportAgent(workspace, agent.sId);

    expect(response.status).toBe(400);
  });

  it("rejects a global agent", async () => {
    const { workspace } = await setup();

    const response = await exportAgent(workspace, GLOBAL_AGENTS_SID.HELPER);

    expect(response.status).toBe(400);
  });
});
