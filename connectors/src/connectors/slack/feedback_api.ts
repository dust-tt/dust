import type { Block, KnownBlock } from "@slack/web-api";

import { makeFeedbackSubmittedBlock } from "@connectors/connectors/slack/chat/blocks";
import {
  getSlackClient,
  getSlackUserInfo,
} from "@connectors/connectors/slack/lib/slack_client";
import { apiConfig } from "@connectors/lib/api/config";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import { getHeaderFromUserEmail } from "@connectors/types";

// Helper to check if block is feedback question block
function isFeedbackQuestionBlock(block: unknown): boolean {
  if (typeof block !== "object" || block === null) {
    return false;
  }

  // Check basic structure
  const b = block as Record<string, unknown>;
  if (b.type !== "context" || !Array.isArray(b.elements)) {
    return false;
  }

  // Check first element
  const elements = b.elements as unknown[];
  if (elements.length === 0) {
    return false;
  }

  const firstElement = elements[0];
  if (typeof firstElement !== "object" || firstElement === null) {
    return false;
  }

  const el = firstElement as Record<string, unknown>;
  return el.type === "mrkdwn" && el.text === "Was this answer helpful?";
}

// Type guard for valid Slack blocks
function isValidSlackBlock(block: unknown): block is Block | KnownBlock {
  return (
    typeof block === "object" &&
    block !== null &&
    "type" in block &&
    typeof (block as Record<string, unknown>).type === "string"
  );
}

export async function submitFeedbackToAPI({
  conversationId,
  messageId,
  workspaceId,
  slackUserId,
  slackTeamId,
  thumbDirection,
  feedbackContent,
  slackChannelId,
  slackMessageTs,
  slackThreadTs,
}: {
  conversationId: string;
  messageId: string;
  workspaceId: string;
  slackUserId: string;
  slackTeamId: string;
  thumbDirection: "up" | "down";
  feedbackContent: string;
  slackChannelId: string;
  slackMessageTs: string;
  slackThreadTs: string;
}) {
  try {
    // Get the Slack configuration to find the connector
    const slackConfig =
      await SlackConfigurationResource.fetchByActiveBot(slackTeamId);
    if (!slackConfig) {
      logger.error(
        { slackTeamId },
        "Failed to find Slack configuration for team"
      );
      return;
    }

    // Get the connector using the configuration's connector ID
    const connector = await ConnectorResource.fetchById(
      slackConfig.connectorId
    );
    if (!connector) {
      logger.error(
        { workspaceId, connectorId: slackConfig.connectorId },
        "Failed to find connector"
      );
      return;
    }

    // Use the connector's workspace ID, not the one from the metadata
    const actualWorkspaceId = connector.workspaceId;

    // Get the Slack user's email
    let userEmail: string | undefined = undefined;
    try {
      const slackClient = await getSlackClient(connector.id);
      const slackUserInfo = await getSlackUserInfo(
        connector.id,
        slackClient,
        slackUserId
      );
      userEmail = slackUserInfo.email || undefined;
    } catch (error) {
      logger.warn(
        {
          error,
          slackUserId,
          connectorId: connector.id,
        },
        "Failed to get Slack user email for feedback"
      );
    }

    logger.info(
      {
        connectorId: connector.id,
        connectorWorkspaceId: actualWorkspaceId,
        metadataWorkspaceId: workspaceId,
        hasAPIKey: !!connector.workspaceAPIKey,
        apiKeyLength: connector.workspaceAPIKey?.length,
        userEmail,
        apiUrl: apiConfig.getDustFrontAPIUrl(),
        feedbackUrl: `${apiConfig.getDustFrontAPIUrl()}/api/v1/w/${actualWorkspaceId}/assistant/conversations/${conversationId}/messages/${messageId}/feedbacks`,
      },
      "Submitting feedback with connector details"
    );

    // Submit feedback using the existing API endpoint
    // The API expects the feedback to be submitted to the messages endpoint
    const response = await fetch(
      `${apiConfig.getDustFrontAPIUrl()}/api/v1/w/${actualWorkspaceId}/assistant/conversations/${conversationId}/messages/${messageId}/feedbacks`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${connector.workspaceAPIKey}`,
          ...getHeaderFromUserEmail(userEmail),
        },
        body: JSON.stringify({
          thumbDirection,
          feedbackContent,
          isConversationShared: true, // Since they're submitting feedback via Slack, we consider it shared
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      logger.error(
        {
          conversationId,
          messageId,
          actualWorkspaceId,
          metadataWorkspaceId: workspaceId,
          slackUserId,
          status: response.status,
          error: errorData,
        },
        "Failed to submit feedback to API"
      );
      return;
    }

    logger.info(
      {
        conversationId,
        messageId,
        actualWorkspaceId,
        slackUserId,
        thumbDirection,
      },
      "Feedback submitted successfully from Slack"
    );

    // Update the Slack message to show feedback has been submitted
    try {
      const slackClient = await getSlackClient(connector.id);

      logger.info(
        {
          slackChannelId,
          slackMessageTs,
          slackThreadTs,
          conversationId,
          messageId,
        },
        "Attempting to update Slack message after feedback"
      );

      // Get all messages in the thread to find the assistant's message
      const threadResult = await slackClient.conversations.replies({
        channel: slackChannelId,
        ts: slackThreadTs,
      });

      if (threadResult.messages) {
        // Find the assistant's message with our timestamp
        const currentMessage = threadResult.messages.find(
          (msg) => msg.ts === slackMessageTs
        );

        if (currentMessage) {
          const currentBlocks = currentMessage.blocks || [];

          logger.info(
            {
              messageTs: currentMessage.ts,
              blockCount: currentBlocks.length,
              blockTypes: currentBlocks.map((b) => b.type),
              hasText: !!currentMessage.text,
              textPreview: currentMessage.text?.substring(0, 100),
            },
            "Retrieved message to update"
          );

          // Find and replace the feedback blocks
          const updatedBlocks: (Block | KnownBlock)[] = [];
          let skipNextAction = false;

          for (let i = 0; i < currentBlocks.length; i++) {
            const block = currentBlocks[i];

            if (!block) {
              continue;
            }

            // Check if this is the feedback context block
            if (isFeedbackQuestionBlock(block)) {
              // Replace with "Feedback submitted" block
              const feedbackBlocks = makeFeedbackSubmittedBlock();
              for (const feedbackBlock of feedbackBlocks) {
                if (isValidSlackBlock(feedbackBlock)) {
                  updatedBlocks.push(feedbackBlock);
                }
              }
              // Mark to skip the next actions block
              skipNextAction = true;
              continue;
            }

            // Check if this is the actions block following feedback
            const blockObj = block as Record<string, unknown>;
            if (skipNextAction && blockObj.type === "actions") {
              // Skip the actions block with thumbs that follows the feedback context
              skipNextAction = false;
              // Don't add this block to updatedBlocks
              continue;
            }

            // Keep all other blocks (message content, footnotes, footer, etc.)
            if (isValidSlackBlock(block)) {
              updatedBlocks.push(block);
            }
          }

          // Update the message with the same text but updated blocks
          await slackClient.chat.update({
            channel: slackChannelId,
            ts: slackMessageTs,
            blocks: updatedBlocks,
            text: currentMessage.text || "",
          });

          logger.info(
            {
              slackChannelId,
              slackMessageTs,
              conversationId,
              messageId,
            },
            "Updated Slack message to show feedback submitted"
          );
        } else {
          logger.warn(
            {
              slackChannelId,
              slackMessageTs,
              slackThreadTs,
              conversationId,
              messageId,
            },
            "Could not find message to update after feedback submission"
          );
        }
      }
    } catch (error) {
      logger.error(
        {
          error,
          slackChannelId,
          slackMessageTs,
          slackThreadTs,
          conversationId,
          messageId,
        },
        "Failed to update Slack message after feedback submission"
      );
    }
  } catch (error) {
    logger.error(
      {
        conversationId,
        messageId,
        workspaceId,
        slackUserId,
        error,
      },
      "Error submitting feedback to API"
    );
  }
}
