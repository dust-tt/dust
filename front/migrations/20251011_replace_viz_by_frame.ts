import assert from "assert";
import chunk from "lodash/chunk";
import type { Logger } from "pino";

import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import { INTERNAL_MCP_SERVERS } from "@app/lib/actions/mcp_internal_actions/constants";
import { createAgentActionConfiguration } from "@app/lib/api/assistant/configuration/actions";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types";

const CHUNK_SIZE = 100;
const CONCURRENCY = 5;

// Frame uses the interactive_content internal MCP server.
async function updateLegacyVizByFrame(
  workspace: LightWorkspaceType,
  logger: Logger,
  { execute }: { execute: boolean }
) {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const agentWithVisualization = await AgentConfiguration.findAll({
    where: {
      visualizationEnabled: true,
      workspaceId: workspace.id,
    },
  });

  logger.info(
    {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      agentCount: agentWithVisualization.length,
    },
    "Found agents with visualization enabled"
  );

  if (agentWithVisualization.length === 0) {
    return;
  }

  const agentChunks = chunk(agentWithVisualization, CHUNK_SIZE);

  await concurrentExecutor(
    agentChunks,
    async (agentChunk) => {
      const agents = await getAgentConfigurations(auth, {
        agentIds: agentChunk.map((a) => a.sId),
        variant: "full",
      });

      // Ensure that the internal MCP server views exist.
      await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);

      // Get the MCP server view for interactive_content.
      const interactiveContentMCPServerView =
        await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
          auth,
          "interactive_content"
        );

      assert(
        interactiveContentMCPServerView,
        "MCP server view for interactive_content should exist"
      );

      await concurrentExecutor(
        agents,
        async (agentConfiguration) => {
          // First, check if the action already exists.
          const hasInteractiveContentAction = agentConfiguration.actions.some(
            (action) =>
              action.type === "mcp_server_configuration" &&
              action.name === "interactive_content"
          );

          if (hasInteractiveContentAction) {
            logger.info(
              {
                workspaceId: workspace.id,
                workspaceName: workspace.name,
                agentId: agentConfiguration.sId,
                agentName: agentConfiguration.name,
              },
              "Agent already has frame action, skipping"
            );
            return;
          }

          const { serverInfo } = INTERNAL_MCP_SERVERS["interactive_content"];

          if (execute) {
            // Create the action for interactive_content.
            await createAgentActionConfiguration(
              auth,
              {
                type: "mcp_server_configuration",
                name: "interactive_content",
                description: serverInfo.description,
                icon: serverInfo.icon,
                mcpServerViewId: interactiveContentMCPServerView.sId,
                internalMCPServerId:
                  interactiveContentMCPServerView.internalMCPServerId,
                dataSources: null,
                reasoningModel: null,
                tables: null,
                childAgentId: null,
                additionalConfiguration: {},
                dustAppConfiguration: null,
                timeFrame: null,
                jsonSchema: null,
              } as ServerSideMCPServerConfigurationType,
              agentConfiguration
            );
          }

          logger.info(
            {
              workspaceId: workspace.id,
              workspaceName: workspace.name,
              agentId: agentConfiguration.sId,
              agentName: agentConfiguration.name,
            },
            "Added frame action to agent"
          );
        },
        { concurrency: CONCURRENCY }
      );
    },
    {
      concurrency: CONCURRENCY,
    }
  );

  // Finally, disable visualization on all agents that had it enabled.
  if (execute) {
    await AgentConfiguration.update(
      { visualizationEnabled: false },
      {
        where: {
          id: agentWithVisualization.map((a) => a.id),
          workspaceId: workspace.id,
        },
      }
    );
  }
}

makeScript({}, async ({ execute }, logger) => {
  await runOnAllWorkspaces(async (workspace) =>
    updateLegacyVizByFrame(workspace, logger, { execute })
  );
});
