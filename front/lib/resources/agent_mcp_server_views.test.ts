import { AgentDataSourceConfigurationModel } from "@app/lib/models/agent/actions/data_sources";
import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import { invalidateAgentResourceCaches } from "@app/lib/resources/agent_resource_cache";
import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { launchIndexAgentSearchWorkflow } from "@app/temporal/es_indexation/client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPServerConfigurationFactory } from "@app/tests/utils/AgentMCPServerConfigurationFactory";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import type { ModelId } from "@app/types/shared/model_id";
import { describe, expect, it, vi } from "vitest";

vi.mock(
  import("@app/lib/resources/agent_resource_cache"),
  async (importOriginal) => {
    const original = await importOriginal();
    return {
      ...original,
      invalidateAgentResourceCaches: vi.fn(
        original.invalidateAgentResourceCaches
      ),
    };
  }
);

function linkTo(
  workspaceId: ModelId,
  view: DataSourceViewResource,
  mcpServerConfigurationId: ModelId
) {
  return AgentDataSourceConfigurationModel.create({
    workspaceId,
    dataSourceId: view.dataSource.id,
    dataSourceViewId: view.id,
    mcpServerConfigurationId,
    tagsMode: null,
    tagsIn: null,
    tagsNotIn: null,
  });
}

describe("destroyAgentMCPServerConfigurationsForViews", () => {
  it("removes the tools of a view restricted to skills and refreshes the affected agents", async () => {
    const {
      authenticator: auth,
      globalSpace,
      workspace,
    } = await createResourceTest({ role: "admin" });
    const server = await RemoteMCPServerFactory.create(workspace, {
      name: "Restricted server",
    });
    const view = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      globalSpace
    );
    const otherServer = await RemoteMCPServerFactory.create(workspace, {
      name: "Other server",
    });
    const otherView = await MCPServerViewFactory.create(
      workspace,
      otherServer.sId,
      globalSpace
    );

    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Affected agent",
    });
    const unaffectedAgent = await AgentConfigurationFactory.createTestAgent(
      auth,
      { name: "Unaffected agent" }
    );
    await AgentMCPServerConfigurationFactory.create(auth, globalSpace, {
      agent,
      mcpServerView: view,
    });
    const otherTool = await AgentMCPServerConfigurationFactory.create(
      auth,
      globalSpace,
      { agent: unaffectedAgent, mcpServerView: otherView }
    );

    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();
    vi.mocked(invalidateAgentResourceCaches).mockClear();

    const result = await view.updateIsRestrictedToSkills(auth, true);
    expect(result.isOk()).toBe(true);

    const remainingTools = await AgentMCPServerConfigurationModel.findAll({
      where: { workspaceId: workspace.id },
    });
    expect(remainingTools.map((tool) => tool.id)).toEqual([otherTool.id]);

    expect(invalidateAgentResourceCaches).toHaveBeenCalledExactlyOnceWith(
      workspace.id,
      [agent.sId],
      undefined
    );
    expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      agentId: agent.sId,
    });
  });
});

describe("destroyAgentMCPServerConfigurationsForDataSourceView", () => {
  it("removes the tools linked to a hard-deleted data source view and refreshes the affected agents", async () => {
    const {
      authenticator: auth,
      globalSpace,
      workspace,
    } = await createResourceTest({ role: "admin" });
    const deletedView = await DataSourceViewFactory.folder(
      workspace,
      globalSpace
    );
    const keptView = await DataSourceViewFactory.folder(workspace, globalSpace);
    const server = await RemoteMCPServerFactory.create(workspace, {
      name: "Search server",
    });
    const mcpServerView = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      globalSpace
    );

    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Affected agent",
    });
    const unaffectedAgent = await AgentConfigurationFactory.createTestAgent(
      auth,
      { name: "Unaffected agent" }
    );
    const tool = await AgentMCPServerConfigurationFactory.create(
      auth,
      globalSpace,
      { agent, mcpServerView }
    );
    const otherTool = await AgentMCPServerConfigurationFactory.create(
      auth,
      globalSpace,
      { agent: unaffectedAgent, mcpServerView }
    );
    // The affected tool also links a surviving view: the whole tool goes, with all its links.
    await linkTo(workspace.id, deletedView, tool.id);
    await linkTo(workspace.id, keptView, tool.id);
    const otherLink = await linkTo(workspace.id, keptView, otherTool.id);

    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();
    vi.mocked(invalidateAgentResourceCaches).mockClear();

    const result = await deletedView.delete(auth, { hardDelete: true });
    expect(result.isOk()).toBe(true);

    const remainingTools = await AgentMCPServerConfigurationModel.findAll({
      where: { workspaceId: workspace.id },
    });
    expect(remainingTools.map(({ id }) => id)).toEqual([otherTool.id]);
    const remainingLinks = await AgentDataSourceConfigurationModel.findAll({
      where: { workspaceId: workspace.id },
    });
    expect(remainingLinks.map(({ id }) => id)).toEqual([otherLink.id]);

    expect(invalidateAgentResourceCaches).toHaveBeenCalledExactlyOnceWith(
      workspace.id,
      [agent.sId],
      undefined
    );
    expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      agentId: agent.sId,
    });
  });
});

describe("destroyAgentMCPServerConfigurationsForDataSource", () => {
  it("removes the tools linked to a hard-deleted data source and refreshes the affected agents", async () => {
    const {
      authenticator: auth,
      globalSpace,
      workspace,
    } = await createResourceTest({ role: "admin" });
    const deletedView = await DataSourceViewFactory.folder(
      workspace,
      globalSpace
    );
    const keptView = await DataSourceViewFactory.folder(workspace, globalSpace);
    const server = await RemoteMCPServerFactory.create(workspace, {
      name: "Search server",
    });
    const mcpServerView = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      globalSpace
    );

    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Affected agent",
    });
    const unaffectedAgent = await AgentConfigurationFactory.createTestAgent(
      auth,
      { name: "Unaffected agent" }
    );
    const tool = await AgentMCPServerConfigurationFactory.create(
      auth,
      globalSpace,
      { agent, mcpServerView }
    );
    const otherTool = await AgentMCPServerConfigurationFactory.create(
      auth,
      globalSpace,
      { agent: unaffectedAgent, mcpServerView }
    );
    // The affected tool also links a surviving data source: the whole tool goes, with all its links.
    await linkTo(workspace.id, deletedView, tool.id);
    await linkTo(workspace.id, keptView, tool.id);
    const otherLink = await linkTo(workspace.id, keptView, otherTool.id);

    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();
    vi.mocked(invalidateAgentResourceCaches).mockClear();

    const result = await deletedView.dataSource.delete(auth, {
      hardDelete: true,
    });
    expect(result.isOk()).toBe(true);

    const remainingTools = await AgentMCPServerConfigurationModel.findAll({
      where: { workspaceId: workspace.id },
    });
    expect(remainingTools.map(({ id }) => id)).toEqual([otherTool.id]);
    const remainingLinks = await AgentDataSourceConfigurationModel.findAll({
      where: { workspaceId: workspace.id },
    });
    expect(remainingLinks.map(({ id }) => id)).toEqual([otherLink.id]);

    expect(invalidateAgentResourceCaches).toHaveBeenCalledExactlyOnceWith(
      workspace.id,
      [agent.sId],
      undefined
    );
    expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      agentId: agent.sId,
    });
  });
});
