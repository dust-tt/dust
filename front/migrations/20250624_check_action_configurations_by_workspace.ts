import { AgentBrowseConfiguration } from "@app/lib/models/assistant/actions/browse";
import { AgentDustAppRunConfiguration } from "@app/lib/models/assistant/actions/dust_app_run";
import { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
import { AgentProcessConfiguration } from "@app/lib/models/assistant/actions/process";
import { AgentRetrievalConfiguration } from "@app/lib/models/assistant/actions/retrieval";
import { AgentTablesQueryConfiguration } from "@app/lib/models/assistant/actions/tables_query";
import { AgentWebsearchConfiguration } from "@app/lib/models/assistant/actions/websearch";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const actionConfigurations = [
  {
    type: "retrieval",
    model: AgentRetrievalConfiguration,
  },
  {
    type: "websearch",
    model: AgentWebsearchConfiguration,
  },
  {
    type: "browse",
    model: AgentBrowseConfiguration,
  },
  {
    type: "mcp_server",
    model: AgentMCPServerConfiguration,
  },
  {
    type: "dust_app_run",
    model: AgentDustAppRunConfiguration,
  },
  {
    type: "tables_query",
    model: AgentTablesQueryConfiguration,
  },
  {
    type: "process",
    model: AgentProcessConfiguration,
  },
] as const;

makeScript({}, async () => {
  logger.info("Analyzing action configurations by type and workspace...");

  for (const { type, model } of actionConfigurations) {
    console.log(`\n${type.toUpperCase()} CONFIGURATIONS:`);
    console.log("=".repeat(50));

    const configs = await (model as any).findAll({
      include: [
        {
          model: AgentConfiguration,
          as: "agentConfiguration",
          required: true,
          where: {
            status: "active",
          },
          include: [
            {
              model: WorkspaceModel,
              as: "workspace",
              required: true,
              attributes: ["sId", "name"],
            },
          ],
        },
      ],
      attributes: ["id", "agentConfigurationId"],
      order: [
        [
          { model: AgentConfiguration, as: "agentConfiguration" },
          { model: WorkspaceModel, as: "workspace" },
          "name",
          "ASC",
        ],
      ],
    });

    const workspaceCount = new Set(
      configs.map((c: any) => c.agentConfiguration.workspace.id)
    ).size;

    if (configs.length === 0) {
      console.log("  No active agent configurations found for this type.");
    } else {
      console.log(
        `  Found ${configs.length} configuration(s) across ${workspaceCount} workspace(s):\n`
      );

      const workspaceGroups: Record<string, number> = {};

      configs.forEach((config: any) => {
        const workspace = config.agentConfiguration.workspace;
        const wsKey = `${workspace.sId} (${workspace.name})`;
        workspaceGroups[wsKey] = (workspaceGroups[wsKey] || 0) + 1;
      });

      Object.entries(workspaceGroups)
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([workspace, count]) => {
          console.log(`  ${workspace}: ${count} configuration(s)`);
        });
    }
  }

  console.log("\nSUMMARY:");
  console.log("=".repeat(50));

  for (const { type, model } of actionConfigurations) {
    const count = await (model as any).count({
      include: [
        {
          model: AgentConfiguration,
          as: "agentConfiguration",
          required: true,
          where: {
            status: "active",
          },
        },
      ],
    });

    const workspaceCount = await (model as any).count({
      distinct: true,
      col: "workspaceId",
      include: [
        {
          model: AgentConfiguration,
          as: "agentConfiguration",
          required: true,
          where: {
            status: "active",
          },
        },
      ],
    });

    console.log(
      `${type}: ${workspaceCount} workspaces, ${count} configurations`
    );
  }
});
