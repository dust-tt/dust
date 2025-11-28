import type { NonAttribute } from "sequelize";

import { AgentMCPServerConfiguration } from "@app/lib/models/agent/actions/mcp";
import { MCPServerViewModel } from "@app/lib/models/agent/actions/mcp_server_view";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

async function main({ execute }: { execute: boolean }) {
  // Fetch all AgentMCPServerConfiguration records
  const configurations = await AgentMCPServerConfiguration.findAll({
    include: [
      {
        model: MCPServerViewModel,
        as: "mcpServerView",
      },
    ],
  });

  logger.info(
    `Found ${configurations.length} AgentMCPServerConfiguration records`
  );

  let updatedCount = 0;
  for (const config of configurations) {
    const mcpServerView = config.mcpServerView;

    // Only update if the MCPServerView has an internalMCPServerId and it's different from the current one
    if (
      mcpServerView.internalMCPServerId &&
      mcpServerView.internalMCPServerId !== config.internalMCPServerId
    ) {
      logger.info(
        `Updating AgentMCPServerConfiguration ${config.sId} from ${config.internalMCPServerId} to ${mcpServerView.internalMCPServerId}`
      );

      if (execute) {
        await config.update({
          internalMCPServerId: mcpServerView.internalMCPServerId,
        });
      }
      updatedCount++;
    }
  }

  logger.info(
    `Updated ${updatedCount} AgentMCPServerConfiguration records${
      execute ? "" : " (dry run)"
    }`
  );
}

makeScript(
  {
    execute: {
      type: "boolean",
      description: "Whether to execute the changes",
      default: false,
    },
  },
  main
);
