import type { LightAgentConfigurationType, Result } from "@dust-tt/client";
import { DustAPI, Err, Ok } from "@dust-tt/client";

import { apiConfig } from "@connectors/lib/api/config";
import type { Logger } from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import { ConnectorResource as ConnectorResourceClass } from "@connectors/resources/connector_resource";
import { DiscordConfigurationResource } from "@connectors/resources/discord_configuration_resource";
import { getHeaderFromUserEmail } from "@connectors/types/shared/headers";

/**
 * Get available agents for a Discord user.
 *
 * @param connector - The connector resource for the workspace
 * @param userEmail - Optional user email for permission filtering
 * @param logger - Logger instance
 */
export async function getAvailableAgents(
  connector: ConnectorResource,
  logger: Logger,
  userEmail?: string
): Promise<Result<LightAgentConfigurationType[], Error>> {
  try {
    const dustAPI = new DustAPI(
      { url: apiConfig.getDustFrontAPIUrl() },
      {
        workspaceId: connector.workspaceId,
        apiKey: connector.workspaceAPIKey,
        extraHeaders: {
          ...getHeaderFromUserEmail(userEmail),
        },
      },
      logger
    );

    const agentConfigurationsRes = await dustAPI.getAgentConfigurations({});
    if (agentConfigurationsRes.isErr()) {
      logger.error(
        { error: agentConfigurationsRes.error },
        "Failed to get agent configurations"
      );
      return new Err(new Error(agentConfigurationsRes.error.message));
    }

    const activeAgents = agentConfigurationsRes.value.filter(
      (ac) => ac.status === "active"
    );

    logger.info(
      {
        workspaceId: connector.workspaceId,
        totalAgents: agentConfigurationsRes.value.length,
        activeAgents: activeAgents.length,
        userEmail: userEmail,
      },
      "Retrieved available agents for Discord user"
    );

    return new Ok(activeAgents);
  } catch (error) {
    logger.error(
      { error, workspaceId: connector.workspaceId },
      "Error getting available agents for Discord user"
    );
    return new Err(new Error(`Failed to get agents: ${error}`));
  }
}

/**
 * Format agents list for Discord response.
 */
export function formatAgentsList(
  agents: LightAgentConfigurationType[]
): string {
  if (agents.length === 0) {
    return "No active agents found in this workspace.";
  }

  const agentsList = agents
    .map((agent, index) => {
      const description = agent.description ? ` - ${agent.description}` : "";
      return `${index + 1}. **${agent.name}**${description}`;
    })
    .join("\n");

  return `**Published Agents (${agents.length}):**\n\n${agentsList}`;
}

/**
 * Get connector from Discord guild ID. Looks up the Discord configuration for the guild and
 * returns the associated connector.
 *
 * @param guildId - Discord guild (server) ID
 * @param logger - Logger instance
 */
export async function getConnectorFromGuildId(
  guildId: string,
  logger: Logger
): Promise<Result<ConnectorResource, Error>> {
  try {
    const discordConfigs =
      await DiscordConfigurationResource.listForGuildId(guildId);

    if (discordConfigs.length === 0) {
      return new Err(
        new Error("No Dust workspace is connected to this Discord server.")
      );
    }

    const enabledConfig = discordConfigs.find((config) => config.botEnabled);

    if (!enabledConfig) {
      return new Err(
        new Error("The Dust bot is not enabled for this Discord server.")
      );
    }

    const connector = await ConnectorResourceClass.fetchById(
      enabledConfig.connectorId
    );

    if (!connector) {
      logger.error(
        { connectorId: enabledConfig.connectorId, guildId },
        "Connector not found for Discord configuration"
      );
      return new Err(new Error("Connector not found."));
    }

    return new Ok(connector);
  } catch (error) {
    logger.error({ error, guildId }, "Error getting connector from guild ID");
    return new Err(new Error(`Failed to get connector: ${error}`));
  }
}
