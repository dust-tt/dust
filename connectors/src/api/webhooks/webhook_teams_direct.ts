import axios from "axios";
import type { Request, Response } from "express";

import {
  createErrorAdaptiveCard,
  createThinkingAdaptiveCard,
} from "@connectors/connectors/teams/adaptive_cards";
import { botAnswerTeamsMessage } from "@connectors/connectors/teams/bot";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

// Store message references for streaming updates
const streamingMessages = new Map<string, string>(); // conversationId -> activityId

/**
 * Direct Teams webhook handler bypassing Bot Framework
 * Handles Teams messages without Azure Bot Service registration
 */
export async function teamsDirectWebhook(req: Request, res: Response) {
  logger.info("Received direct Teams webhook");

  try {
    const activity = req.body;

    logger.info(
      {
        activityType: activity.type,
        activityName: activity.name,
        conversationId: activity.conversation?.id,
        text: activity.text,
        from: activity.from,
        serviceUrl: activity.serviceUrl,
      },
      "Received Teams activity (direct)"
    );

    // Handle different activity types
    switch (activity.type) {
      case "message":
        await handleDirectMessage(activity, req, res);
        break;

      case "invoke":
        await handleDirectInvoke(activity, req, res);
        break;

      default:
        logger.info({ activityType: activity.type }, "Unhandled activity type");
        res.status(200).json({});
        break;
    }
  } catch (error) {
    logger.error({ error }, "Error in direct Teams webhook");
    res.status(500).json({ error: "Internal server error" });
  }
}

async function handleDirectMessage(activity: any, req: Request, res: Response) {
  // Check if it's an adaptive card submit
  if (activity.value?.action === "ask_agent") {
    await handleDirectAgentSelection(activity, res);
    return;
  }

  // Handle regular text messages
  if (activity.text?.trim()) {
    await handleDirectTextMessage(activity, res);
  } else {
    res.status(200).json({});
  }
}

async function handleDirectInvoke(activity: any, req: Request, res: Response) {
  // Handle message extensions (compose extensions)
  if (activity.name === "composeExtension/query") {
    await handleDirectMessageExtension(activity, res);
  } else {
    res.status(200).json({});
  }
}

async function handleDirectAgentSelection(activity: any, res: Response) {
  const { agentId, agentName, originalMessage } = activity.value;

  logger.info(
    { agentId, agentName, originalMessage },
    "Handling agent selection from adaptive card (direct)"
  );

  // Send thinking message using direct Teams API
  await sendDirectTeamsMessage(activity, createThinkingAdaptiveCard());

  // Clean the message and add agent mention
  const cleanMessage = originalMessage
    .replace(/^[@+~][a-zA-Z0-9_-]+\\s*/, "")
    .trim();
  const agentMessage = `@${agentName} ${cleanMessage}`;

  await processDirectTeamsMessage(activity, agentMessage, res);
}

async function handleDirectTextMessage(activity: any, res: Response) {
  logger.info(
    { text: activity.text },
    "Handling regular text message (direct)"
  );

  // Send thinking message using direct Teams API
  await sendDirectTeamsMessage(activity, createThinkingAdaptiveCard());

  await processDirectTeamsMessage(activity, activity.text, res);
}

async function handleDirectMessageExtension(activity: any, res: Response) {
  try {
    const query = activity.value;
    logger.info({ query }, "Handling message extension query (direct)");

    // Get agents from the teams_agents endpoint
    const agentsUrl = `${process.env.PUBLIC_API_URL || "http://localhost:3002"}/webhooks/${process.env.WEBHOOK_SECRET || "mywebhooksecret"}/teams_agents`;

    const response = await axios.get(agentsUrl, { timeout: 5000 });
    const agents = response.data.agents || [];

    // Filter agents based on search query
    const searchTerm = query.parameters?.searchQuery?.toLowerCase() || "";
    const filteredAgents = agents.filter(
      (agent: any) =>
        agent.name.toLowerCase().includes(searchTerm) ||
        agent.description?.toLowerCase().includes(searchTerm)
    );

    // Return agent results
    const results = filteredAgents.slice(0, 10).map((agent: any) => ({
      contentType: "application/vnd.microsoft.card.hero",
      content: {
        title: agent.name,
        subtitle: agent.description || `Ask ${agent.name} a question`,
        tap: {
          type: "imBack",
          value: `@${agent.name} `,
        },
      },
    }));

    const composeResponse = {
      composeExtension: {
        type: "result",
        attachmentLayout: "list",
        attachments:
          results.length > 0
            ? results
            : [
                {
                  contentType: "application/vnd.microsoft.card.hero",
                  content: {
                    title: "No agents found",
                    subtitle: `No agents match "${searchTerm}"`,
                    tap: {
                      type: "imBack",
                      value: "@dust ",
                    },
                  },
                },
              ],
      },
    };

    res.status(200).json(composeResponse);
  } catch (error) {
    logger.error({ error }, "Error handling message extension (direct)");
    res.status(200).json({
      composeExtension: {
        type: "result",
        attachments: [],
      },
    });
  }
}

async function processDirectTeamsMessage(
  activity: any,
  message: string,
  res: Response
) {
  try {
    // Find the connector for this Teams conversation
    const connectors = await ConnectorResource.listByType("microsoft", {});

    if (connectors.length === 0) {
      logger.error("No Microsoft connector found for Teams message");
      await sendDirectTeamsMessage(
        activity,
        createErrorAdaptiveCard({
          error: "No Microsoft connector configured",
          workspaceId: "unknown",
        })
      );
      res.status(200).json({});
      return;
    }

    const connector = connectors[0];

    // Prepare response callback for streaming
    const responseCallback = {
      serviceUrl: activity.serviceUrl,
      conversationId: activity.conversation.id,
      activityId: activity.id,
      userId: activity.from.id,
      streamingMessages,
      // Custom direct sender for non-Bot Framework approach
      sendDirectMessage: (content: any) =>
        sendDirectTeamsMessage(activity, content),
    };

    // Process the message through the existing bot logic
    const params = {
      tenantId: activity.conversation?.tenantId || "unknown-tenant",
      conversationId: activity.conversation.id,
      userId: activity.from.id,
      userAadObjectId: activity.from.aadObjectId,
      activityId: activity.id,
      channelId: activity.channelId,
      replyToId: activity.replyToId,
    };

    const result = await botAnswerTeamsMessage(
      message,
      params,
      connector,
      responseCallback
    );

    if (result.isErr()) {
      logger.error(
        { error: result.error },
        "Error processing Teams message (direct)"
      );
      await sendDirectTeamsMessage(
        activity,
        createErrorAdaptiveCard({
          error: result.error.message,
          workspaceId: connector.workspaceId,
        })
      );
    }

    res.status(200).json({});
  } catch (error) {
    logger.error({ error }, "Error processing Teams message (direct)");
    await sendDirectTeamsMessage(
      activity,
      createErrorAdaptiveCard({
        error: "An unexpected error occurred",
        workspaceId: "unknown",
      })
    );
    res.status(200).json({});
  }
}

async function sendDirectTeamsMessage(activity: any, content: any) {
  try {
    // This would require implementing direct Teams API calls
    // For now, log what we would send
    logger.info(
      {
        serviceUrl: activity.serviceUrl,
        conversationId: activity.conversation?.id,
        content: typeof content === "string" ? content : "AdaptiveCard",
      },
      "Would send direct Teams message"
    );

    // TODO: Implement direct Teams REST API calls
    // This requires proper authentication with the Teams service
    // using the App Registration credentials
  } catch (error) {
    logger.error({ error }, "Failed to send direct Teams message");
  }
}

// Export the streaming messages map for use in bot logic
export { streamingMessages };
