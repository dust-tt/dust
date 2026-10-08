import { AgentDataSourceConfigurationModel } from "@app/lib/models/agent/actions/data_sources";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPServerConfigurationFactory } from "@app/tests/utils/AgentMCPServerConfigurationFactory";
import { setupAgentOwner } from "@app/tests/utils/AgentOwnerFactory";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
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

  it("exports an unpublished agent to a non-editor admin with the admin_can_see_private_entities flag", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });
    await SpaceFactory.defaults(auth);
    await FeatureFlagFactory.basic(auth, "admin_can_see_private_entities");

    const { agentOwnerAuth } = await setupAgentOwner(workspace, "user");
    const agent = await AgentConfigurationFactory.createTestAgent(
      agentOwnerAuth,
      { scope: "hidden" }
    );

    const response = await exportYaml(workspace, agent.sId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.yamlContent).toContain(agent.instructions);
  });

  it("exports to an admin with the admin_can_see_private_entities flag an agent using data from a project they are not in", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });
    await SpaceFactory.defaults(auth);
    await FeatureFlagFactory.basic(auth, "admin_can_see_private_entities");

    const project = await SpaceFactory.project(workspace);
    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      project
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const mcpServerConfiguration =
      await AgentMCPServerConfigurationFactory.create(auth, project, {
        agent,
        mcpServerView: await MCPServerViewFactory.internal(
          workspace,
          "search",
          project
        ),
      });
    await AgentDataSourceConfigurationModel.create({
      workspaceId: workspace.id,
      dataSourceId: dataSourceView.dataSource.id,
      dataSourceViewId: dataSourceView.id,
      mcpServerConfigurationId: mcpServerConfiguration.id,
      tagsMode: null,
      tagsIn: null,
      tagsNotIn: null,
    });

    const response = await exportYaml(workspace, agent.sId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.yamlContent).toContain(dataSourceView.sId);
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
