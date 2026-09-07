import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { setupAgentOwner } from "@app/tests/utils/AgentOwnerFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function exportYaml(workspace: { sId: string }, aId: string) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/agent_configurations/${aId}/export/yaml`
  );
}

describe("GET /api/w/:wId/assistant/agent_configurations/:aId/export/yaml", () => {
  it("does not export an unpublished agent to a non-editor admin", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });
    await SpaceFactory.defaults(auth);

    const { agentOwnerAuth } = await setupAgentOwner(workspace, "user");
    const agent = await AgentConfigurationFactory.createTestAgent(
      agentOwnerAuth,
      { scope: "hidden" }
    );

    const response = await exportYaml(workspace, agent.sId);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error.type).toBe("agent_configuration_not_found");
  });

  it("exports an agent to one of its editors", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });
    await SpaceFactory.defaults(auth);

    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      scope: "hidden",
    });

    const response = await exportYaml(workspace, agent.sId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.yamlContent).toContain(agent.instructions);
  });
});
