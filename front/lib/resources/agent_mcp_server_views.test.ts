import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import { invalidateAgentResourceCaches } from "@app/lib/resources/agent_resource_cache";
import { launchIndexAgentSearchWorkflow } from "@app/temporal/es_indexation/client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPServerConfigurationFactory } from "@app/tests/utils/AgentMCPServerConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
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
