import { AgentMCPServerConfiguration } from "@app/lib/models/agent/actions/mcp";
import { AgentReasoningConfiguration } from "@app/lib/models/agent/actions/reasoning";
import { AgentConfiguration } from "@app/lib/models/agent/agent";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

/**
 * Deletes reasoning configurations and their associated resources for all agents.
 * This script performs cascading deletions in the correct order to avoid foreign key constraints.
 */
async function deleteReasoningConfigurationAndRelatedResources(
  reasoningConfig: AgentReasoningConfiguration & {
    agent_mcp_server_configuration: AgentMCPServerConfiguration & {
      agent_configuration: AgentConfiguration;
    };
  },
  logger: Logger,
  execute: boolean
): Promise<boolean> {
  const mcpServerConfigurationId = reasoningConfig.mcpServerConfigurationId;
  const agent =
    reasoningConfig.agent_mcp_server_configuration.agent_configuration;

  logger.info(
    {
      reasoningConfigId: reasoningConfig.sId,
      mcpServerConfigurationId,
      agentId: agent.sId,
      agentName: agent.name,
      modelId: agent.modelId,
      providerId: agent.providerId,
    },
    execute
      ? "Deleting reasoning configuration and related resources"
      : "Would delete reasoning configuration and related resources"
  );

  // If in dry run, return early.
  if (!execute) {
    return true;
  }

  try {
    // Delete in the correct order to avoid foreign key constraint violations
    // 1. Delete agent_reasoning_configurations
    await AgentReasoningConfiguration.destroy({
      where: {
        mcpServerConfigurationId,
      },
    });

    // 2. Finally delete agent_mcp_server_configurations
    await AgentMCPServerConfiguration.destroy({
      where: {
        id: mcpServerConfigurationId,
      },
    });

    logger.info(
      {
        reasoningConfigId: reasoningConfig.sId,
        mcpServerConfigurationId,
      },
      "Successfully deleted reasoning configuration and all related resources"
    );

    return true;
  } catch (error) {
    logger.error(
      {
        reasoningConfigId: reasoningConfig.sId,
        mcpServerConfigurationId,
        error,
      },
      "Failed to delete reasoning configuration and related resources"
    );
    return false;
  }
}

makeScript({}, async ({ execute }, logger) => {
  logger.info(
    { execute },
    "Starting removal of reasoning configurations for all agents"
  );

  // Get all reasoning configurations with agent information

  const reasoningConfigurations = await AgentReasoningConfiguration.findAll({
    attributes: ["id", "sId", "mcpServerConfigurationId"],
    include: [
      {
        model: AgentMCPServerConfiguration,
        required: true,
        include: [
          {
            model: AgentConfiguration,
            required: true,
            attributes: [
              "id",
              "sId",
              "name",
              "modelId",
              "providerId",
              "status",
            ],
          },
        ],
      },
    ],
  });

  if (reasoningConfigurations.length === 0) {
    logger.info("No reasoning configurations found");
    return;
  }

  // Calculate agent counts
  const totalAgentsImpacted = reasoningConfigurations.length;
  const activeAgentsImpacted = reasoningConfigurations.filter(
    (config) =>
      // @ts-expect-error type not inferred with include clause
      config.agent_mcp_server_configuration.agent_configuration.status ===
      "active"
  ).length;

  logger.info(
    {
      totalAgentsImpacted,
      activeAgentsImpacted,
    },
    `Found ${totalAgentsImpacted} reasoning configurations impacting ${activeAgentsImpacted} active agents.`
  );

  let successCount = 0;
  let failureCount = 0;

  // Process each reasoning configuration
  for (const reasoningConfig of reasoningConfigurations) {
    const success = await deleteReasoningConfigurationAndRelatedResources(
      reasoningConfig as AgentReasoningConfiguration & {
        agent_mcp_server_configuration: AgentMCPServerConfiguration & {
          agent_configuration: AgentConfiguration;
        };
      },
      logger,
      execute
    );

    if (success) {
      successCount++;
    } else {
      failureCount++;
    }
  }

  logger.info(
    {
      total: reasoningConfigurations.length,
      successful: successCount,
      failed: failureCount,
      execute,
    },
    execute
      ? `Finished deleting ${successCount} reasoning configurations for all agents`
      : `Finished dry run of reasoning configuration deletion for all agents`
  );
});
