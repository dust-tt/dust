import type { TurnContext } from "botbuilder";
import { z } from "zod";

import { sendTextMessage } from "@connectors/api/webhooks/teams/bot_messaging_utils";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { MicrosoftBotConfigurationResource } from "@connectors/resources/microsoft_bot_resources";

/**
 * Zod schema for validating tool approval data from Teams adaptive cards
 * This ensures all fields are present, non-empty, and of the correct type
 */
export const ToolApprovalDataSchema = z.object({
  agentName: z.string().min(1, "Agent name is required"),
  toolName: z.string().min(1, "Tool name is required"),
  conversationId: z.string().min(1, "Conversation ID is required"),
  messageId: z.string().min(1, "Message ID is required"),
  actionId: z.string().min(1, "Action ID is required"),
  workspaceId: z.string().min(1, "Workspace ID is required"),
  microsoftBotMessageId: z.number().int().positive("Invalid message ID"),
});

/**
 * Type definition for tool approval data (inferred from schema)
 */
export type ToolApprovalData = z.infer<typeof ToolApprovalDataSchema>;

export async function getConnector(context: TurnContext) {
  // Extract tenant ID from Teams context
  let tenantId: string | undefined;

  // Teams provides tenant ID in multiple possible locations
  if (context.activity.channelData?.tenant?.id) {
    tenantId = context.activity.channelData.tenant.id;
  } else if (context.activity.conversation?.tenantId) {
    tenantId = context.activity.conversation.tenantId;
  } else if (context.activity.channelData?.tenantId) {
    tenantId = context.activity.channelData.tenantId;
  }

  if (!tenantId) {
    logger.error("No tenant ID found in Teams context");
    return;
  }

  logger.info({ tenantId }, "Found tenant ID in Teams context");

  // Find the bot configuration for this tenant
  const botConfig =
    await MicrosoftBotConfigurationResource.fetchByTenantId(tenantId);

  if (!botConfig || !botConfig.botEnabled) {
    logger.error(
      { tenantId },
      "No Microsoft Bot configuration found for tenant"
    );
    return;
  }

  // Get the corresponding connector
  const connector = await ConnectorResource.fetchById(botConfig.connectorId);

  if (!connector) {
    logger.error(
      {
        connectorId: botConfig.connectorId,
        tenantId,
      },
      "Connector not found for bot configuration"
    );
    await sendTextMessage(
      context,
      "❌ Microsoft Teams Integration is not enabled for your Organization."
    );
    return;
  }

  logger.info(
    {
      connectorId: connector.id,
      tenantId,
      workspaceId: connector.workspaceId,
    },
    "Found matching Microsoft Bot connector"
  );

  return connector;
}

/**
 * Validates and parses tool approval data from untrusted user input
 * @param data - Raw data from Teams adaptive card action
 * @returns Parsed and validated ToolApprovalData or null if invalid
 */
export function validateToolApprovalData(
  data: unknown
): ToolApprovalData | null {
  const result = ToolApprovalDataSchema.safeParse(data);

  if (!result.success) {
    logger.warn(
      {
        error: result.error.flatten(),
        receivedData: data,
      },
      "Invalid tool approval data received from Teams"
    );
    return null;
  }

  return result.data;
}
