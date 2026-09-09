import type { UnsavedServerSideMCPServerConfigurationType } from "@app/lib/actions/types/agent";
import { AgentActionConfigurationResource } from "@app/lib/resources/agent/agent_action_configuration_resource";
import { AgentSearchDocumentResource } from "@app/lib/resources/agent/agent_search_document_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { launchIndexAgentSearchWorkflow } from "@app/temporal/es_indexation/client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { describe, expect, it, vi } from "vitest";

describe("standalone agent tool indexation", () => {
  it("indexes committed tools, suppresses rolled-back writes and rejects a foreign agent", async () => {
    const {
      authenticator: auth,
      workspace,
      globalSpace,
    } = await createResourceTest({ role: "admin" });
    const server = await RemoteMCPServerFactory.create(workspace);
    const view = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      globalSpace
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const other = await createResourceTest({ role: "admin" });
    const foreign = await AgentConfigurationFactory.createTestAgent(
      other.authenticator
    );
    const action: UnsavedServerSideMCPServerConfigurationType = {
      type: "mcp_server_configuration",
      name: "indexed_tool",
      description: "Standalone indexed tool",
      mcpServerViewId: view.sId,
      dataSources: null,
      tables: null,
      childAgentId: null,
      timeFrame: null,
      jsonSchema: null,
      additionalConfiguration: {},
      dustAppConfiguration: null,
      secretName: null,
      dustProject: null,
    };
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();
    const rollback = new Error("Rollback standalone tool");
    await expect(
      withTransaction(
        async (transaction) => {
          const result =
            await AgentActionConfigurationResource.createAgentActionConfiguration(
              auth,
              action,
              agent,
              { transaction }
            );
          expect(result.isOk()).toBe(true);
          expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();
          throw rollback;
        },
        undefined,
        { useSavepoint: true }
      )
    ).rejects.toBe(rollback);
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(auth, agent.sId)
    ).toMatchObject({ tools: [] });
    expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();

    const result =
      await AgentActionConfigurationResource.createAgentActionConfiguration(
        auth,
        action,
        agent
      );
    expect(result.isOk()).toBe(true);
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(auth, agent.sId)
    ).toMatchObject({ tools: [view.sId] });
    expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      agentId: agent.sId,
    });

    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();
    await expect(
      AgentActionConfigurationResource.createAgentActionConfiguration(
        auth,
        action,
        foreign
      )
    ).rejects.toThrow(
      "Agent configuration must belong to the caller's workspace."
    );
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(
        other.authenticator,
        foreign.sId
      )
    ).toMatchObject({ tools: [] });
    expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();
  });
});
