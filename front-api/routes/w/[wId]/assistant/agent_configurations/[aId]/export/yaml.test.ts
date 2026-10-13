import { AgentDataSourceConfigurationModel } from "@app/lib/models/agent/actions/data_sources";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPServerConfigurationFactory } from "@app/tests/utils/AgentMCPServerConfigurationFactory";
import { setupAgentOwner } from "@app/tests/utils/AgentOwnerFactory";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { CoreAPI } from "@app/types/core/core_api";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

// Creates an agent of the caller whose search tool uses a folder view, restricted to `parentsIn`.
// The view lives in the global space, or in a project the caller is not a member of.
async function createAgentUsingFolder({
  inProject = false,
  parentsIn,
}: {
  inProject?: boolean;
  parentsIn: string[] | null;
}) {
  const { workspace, auth } = await createPrivateApiMockRequest({
    role: "admin",
  });
  const { globalSpace } = await SpaceFactory.defaults(auth);
  const dataSourceView = await DataSourceViewFactory.folder(
    workspace,
    inProject ? await SpaceFactory.project(workspace) : globalSpace
  );
  const agent = await AgentConfigurationFactory.createTestAgent(auth, {
    scope: "hidden",
  });
  const mcpServerConfiguration =
    await AgentMCPServerConfigurationFactory.create(auth, globalSpace, {
      agent,
      mcpServerView: await MCPServerViewFactory.internal(
        workspace,
        "search",
        globalSpace
      ),
    });
  await AgentDataSourceConfigurationModel.create({
    workspaceId: workspace.id,
    dataSourceId: dataSourceView.dataSource.id,
    dataSourceViewId: dataSourceView.id,
    mcpServerConfigurationId: mcpServerConfiguration.id,
    parentsIn,
    tagsMode: null,
    tagsIn: null,
    tagsNotIn: null,
  });

  return { workspace, auth, agent, dataSourceView };
}

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
    const { agentOwnerAuth } = await setupAgentOwner(workspace, "user");
    const agent = await AgentConfigurationFactory.createTestAgent(
      agentOwnerAuth,
      { requestedSpaceIds: [project.id] }
    );
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

  it("exports the stored selected resources without resolving them", async () => {
    const { workspace, agent, dataSourceView } = await createAgentUsingFolder({
      parentsIn: ["deleted-folder"],
    });
    const searchNodes = vi.spyOn(CoreAPI.prototype, "searchNodes");

    const response = await exportYaml(workspace, agent.sId);

    expect(response.status).toBe(200);
    expect(searchNodes).not.toHaveBeenCalled();
    const data = await response.json();
    expect(data.yamlContent).toContain(dataSourceView.sId);
    expect(data.yamlContent).toContain("deleted-folder");
    expect(data.yamlContent).toContain("is_select_all: false");
  });

  it("returns a 403 for an agent using data from a space the caller cannot read", async () => {
    const { workspace, agent } = await createAgentUsingFolder({
      inProject: true,
      parentsIn: null,
    });

    const response = await exportYaml(workspace, agent.sId);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error.type).toBe("data_source_auth_error");
  });

  it("returns a 404 for an agent using a deleted data source view", async () => {
    const { workspace, auth, agent, dataSourceView } =
      await createAgentUsingFolder({ parentsIn: null });
    await dataSourceView.delete(auth, { hardDelete: false });

    const response = await exportYaml(workspace, agent.sId);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error.type).toBe("data_source_view_not_found");
  });
});
