import { WebClient } from "@slack/web-api";
import type { Channel } from "@slack/web-api/dist/response/ConversationsListResponse";

import config from "@app/lib/api/config";
import { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
import { MCPServerConnection } from "@app/lib/models/assistant/actions/mcp_server_connection";
import { MCPServerViewModel } from "@app/lib/models/assistant/actions/mcp_server_view";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { makeScript } from "@app/scripts/helpers";
import { OAuthAPI } from "@app/types";

type ChannelWithIdAndName = Omit<Channel, "id" | "name"> & {
  id: string;
  name: string;
};

async function getPublicChannels(
  slackClient: WebClient
): Promise<ChannelWithIdAndName[]> {
  const channels: Channel[] = [];

  let cursor: string | undefined = undefined;
  do {
    const response = await slackClient.conversations.list({
      cursor,
      limit: 100,
      exclude_archived: true,
      types: "public_channel",
    });
    if (!response.ok) {
      throw new Error(response.error);
    }
    channels.push(...(response.channels ?? []));
    cursor = response.response_metadata?.next_cursor;
  } while (cursor);

  return channels
    .filter((c) => !!c.id && !!c.name)
    .map((c) => ({
      ...c,
      id: c.id!,
      name: c.name!,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

makeScript(
  {
    agentMcpServerConfigurationId: {
      type: "string",
      required: true,
      description: "The agent_mcp_server_configurations id to process",
    },
  },
  async ({ agentMcpServerConfigurationId, execute }, logger) => {
    logger.info(
      `Starting migration for agent MCP server configuration: ${agentMcpServerConfigurationId}`
    );

    // Get the agent MCP server configuration
    const mcpServerConfig = await AgentMCPServerConfiguration.findByPk(
      agentMcpServerConfigurationId
    );
    if (!mcpServerConfig) {
      logger.error(
        `Agent MCP server configuration ${agentMcpServerConfigurationId} not found`
      );
      return;
    }

    // Check if additionalConfiguration has channels
    const additionalConfig = mcpServerConfig.additionalConfiguration as any;
    if (
      !additionalConfig?.channels ||
      !Array.isArray(additionalConfig.channels)
    ) {
      logger.info(
        `No channels found in additionalConfiguration for ${agentMcpServerConfigurationId}`
      );
      return;
    }

    const channelIds: string[] = additionalConfig.channels;
    logger.info(`Found ${channelIds.length} channel IDs to process`);

    // Get the MCP server view
    const mcpServerView = await MCPServerViewModel.findByPk(
      mcpServerConfig.mcpServerViewId
    );
    if (!mcpServerView) {
      logger.error(
        `MCP server view ${mcpServerConfig.mcpServerViewId} not found`
      );
      return;
    }

    // Get the MCP server connection
    const mcpServerConnection = await MCPServerConnection.findOne({
      where: {
        internalMCPServerId: mcpServerView.internalMCPServerId,
        connectionType: "workspace",
      },
    });
    if (!mcpServerConnection) {
      logger.error(
        `MCP server connection not found for internal server ID: ${mcpServerView.internalMCPServerId}`
      );
      return;
    }

    // Get the OAuth access token
    const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
    const tokenResult = await oauthApi.getAccessToken({
      connectionId: mcpServerConnection.connectionId,
    });

    if (tokenResult.isErr()) {
      logger.error(
        `Failed to get access token for connection ${mcpServerConnection.connectionId}: ${tokenResult.error.message}`
      );
      return;
    }

    const accessToken = tokenResult.value.access_token;

    // Initialize Slack client and get public channels
    const slackClient = new WebClient(accessToken, {
      timeout: 10000,
      rejectRateLimitedCalls: false,
      retryConfig: {
        retries: 1,
        factor: 1,
      },
    });

    let channels: ChannelWithIdAndName[];
    try {
      channels = await getPublicChannels(slackClient);
      logger.info(`Retrieved ${channels.length} public channels from Slack`);
    } catch (error) {
      logger.error(`Failed to retrieve Slack channels: ${error}`);
      return;
    }

    // Map channel IDs to names
    const channelNames: string[] = [];
    for (const channelId of channelIds) {
      const channel = channels.find((c) => c.id === channelId);
      if (channel) {
        channelNames.push(`#${channel.name}`);
        logger.info(`Mapped channel ID ${channelId} to #${channel.name}`);
      } else {
        logger.warn(`Could not find channel name for ID ${channelId}`);
      }
    }

    if (channelNames.length === 0) {
      logger.warn(`No channel names could be mapped from the provided IDs`);
      return;
    }

    // Generate the instruction text
    const instructionText = `When using the Slack search tool, only search within the following channels: ${channelNames.join(", ")}`;
    logger.info(`Generated instruction text: ${instructionText}`);

    // Get the agent configuration with workspace context
    const agentConfig = await AgentConfiguration.findOne({
      where: {
        id: mcpServerConfig.agentConfigurationId,
        workspaceId: mcpServerConfig.workspaceId,
      },
    });

    if (!agentConfig) {
      logger.error(
        `Agent configuration ${mcpServerConfig.agentConfigurationId} not found`
      );
      return;
    }

    // Only process active configurations
    if (agentConfig.status !== "active") {
      logger.info(
        `Skipping agent configuration ${agentConfig.id} with status ${agentConfig.status}`
      );
      return;
    }

    // Check if the instruction text is already present
    const currentInstructions = agentConfig.instructions || "";
    if (currentInstructions.includes(instructionText)) {
      logger.info(
        `Instruction text already present in agent configuration ${agentConfig.id}`
      );
      return;
    }

    // Update the agent configuration with the new instruction
    if (execute) {
      const updatedInstructions = currentInstructions
        ? `${currentInstructions}\n\n${instructionText}`
        : instructionText;

      await agentConfig.update({
        instructions: updatedInstructions,
      });

      logger.info(
        `Updated agent configuration ${agentConfig.id} with channel restriction instructions`
      );

      // Clear the additionalConfiguration field after processing
      await mcpServerConfig.update({
        additionalConfiguration: {},
      });

      logger.info(
        `Cleared additionalConfiguration for MCP server configuration ${agentMcpServerConfigurationId}`
      );
    } else {
      logger.info(
        `[DRY RUN] Would update agent configuration ${agentConfig.id} with channel restriction instructions`
      );
      logger.info(
        `[DRY RUN] Would clear additionalConfiguration for MCP server configuration ${agentMcpServerConfigurationId}`
      );
    }

    logger.info(
      `Migration completed for agent MCP server configuration: ${agentMcpServerConfigurationId}`
    );
  }
);
