import { Authenticator } from "@app/lib/auth";
import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import fs from "fs";

makeScript(
  {
    workspaceId: {
      type: "string" as const,
      demandOption: true,
      description: "Workspace sId",
    },
    mcpServerViewId: {
      type: "string" as const,
      demandOption: true,
      description: "MCP server view sId",
    },
    agentNamesFile: {
      type: "string" as const,
      demandOption: true,
      description: "Path to a file with agent names, one per line",
    },
  },
  async ({ workspaceId, mcpServerViewId, agentNamesFile, execute }, logger) => {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace) {
      logger.error({ workspaceId }, "Workspace not found");
      return;
    }

    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
    const workspaceModelId = auth.getNonNullableWorkspace().id;

    const mcpServerView = await MCPServerViewResource.fetchById(
      auth,
      mcpServerViewId
    );
    if (!mcpServerView) {
      logger.error({ mcpServerViewId }, "MCP server view not found");
      return;
    }

    logger.info(
      {
        mcpServerViewId: mcpServerView.sId,
        mcpServerViewModelId: mcpServerView.id,
        serverType: mcpServerView.serverType,
      },
      "Found MCP server view"
    );

    const fileContent = fs.readFileSync(agentNamesFile, "utf-8");
    const agentNames = fileContent
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (agentNames.length === 0) {
      logger.error("No agent names found in file");
      return;
    }

    logger.info({ agentNames }, "Agent names to process");

    for (const agentName of agentNames) {
      // Find the latest active agent configuration with this name.
      const agentConfig = await AgentConfigurationModel.findOne({
        where: {
          workspaceId: workspaceModelId,
          name: agentName,
          status: "active",
        },
        order: [["version", "DESC"]],
      });

      if (!agentConfig) {
        logger.warn({ agentName }, "No active agent configuration found");
        continue;
      }

      // Check if this MCP server is already configured for this agent.
      const existingConfig = await AgentMCPServerConfigurationModel.findOne({
        where: {
          workspaceId: workspaceModelId,
          agentConfigurationId: agentConfig.id,
          mcpServerViewId: mcpServerView.id,
        },
      });

      if (existingConfig) {
        logger.info(
          { agentName, agentSId: agentConfig.sId },
          "MCP server already configured for agent, skipping"
        );
        continue;
      }

      logger.info(
        {
          agentName,
          agentSId: agentConfig.sId,
          agentVersion: agentConfig.version,
        },
        execute
          ? "Adding MCP server to agent"
          : "Would add MCP server to agent (dry run)"
      );

      if (execute) {
        await AgentMCPServerConfigurationModel.create({
          sId: generateRandomModelSId(),
          agentConfigurationId: agentConfig.id,
          workspaceId: workspaceModelId,
          mcpServerViewId: mcpServerView.id,
          internalMCPServerId: mcpServerView.internalMCPServerId,
          additionalConfiguration: {},
          timeFrame: null,
          jsonSchema: null,
          appId: null,
          secretName: null,
          name: null,
          singleToolDescriptionOverride: null,
        });

        logger.info({ agentName }, "MCP server added to agent");
      }
    }
  }
);
