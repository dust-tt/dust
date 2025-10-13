import type { Block, KnownBlock } from "@slack/web-api";

import { makeFeedbackSubmittedBlock } from "@connectors/connectors/slack/chat/blocks";
import {
  getSlackClient,
  getSlackUserInfoMemoized,
} from "@connectors/connectors/slack/lib/slack_client";
import { RATE_LIMITS } from "@connectors/connectors/slack/ratelimits";
import { apiConfig } from "@connectors/lib/api/config";
import { throttleWithRedis } from "@connectors/lib/throttle";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import { getHeaderFromUserEmail } from "@connectors/types";

// Helper to check if block is feedback question block
function isFeedbackQuestionBlock(block: unknown): boolean {
  if (typeof block !== "object" || block === null) {
    return false;
  }

  const b = block as Record<string, unknown>;
  if (b.type !== "context" || !Array.isArray(b.elements)) {
    return false;
  }

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
    const slackConfig =
      await SlackConfigurationResource.fetchByActiveBot(slackTeamId);
    if (!slackConfig) {
      logger.error(
        { slackTeamId },
        "Failed to find Slack configuration for team"
      );
      return;
    }

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

    const connectorWId = connector.workspaceId;

    let userEmail: string | undefined = undefined;
    try {
      const slackClient = await getSlackClient(connector.id);
      const slackUserInfo = await getSlackUserInfoMemoized(
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

    const response = await fetch(
      `${apiConfig.getDustFrontAPIUrl()}/api/v1/w/${connectorWId}/assistant/conversations/${conversationId}/messages/${messageId}/feedbacks`,
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
          isConversationShared: true, // Since they're submitting feedback via Slack, we consider it shared (there's a warning in the modal).
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      logger.error(
        {
          conversationId,
          messageId,
          connectorWId,
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
        connectorWId,
        slackUserId,
        thumbDirection,
      },
      "Feedback submitted from Slack"
    );

    // Update the Slack message to show feedback has been submitted
    try {
      const slackClient = await getSlackClient(connector.id);
      const threadResult = await slackClient.conversations.replies({
        channel: slackChannelId,
        ts: slackThreadTs,
      });

      if (threadResult.messages) {
        const currentMessage = threadResult.messages.find(
          (msg) => msg.ts === slackMessageTs
        );

        if (currentMessage) {
          const currentBlocks = currentMessage.blocks || [];
          const updatedBlocks: (Block | KnownBlock)[] = [];
          let skipNextAction = false;

          for (let i = 0; i < currentBlocks.length; i++) {
            const block = currentBlocks[i];

            if (!block) {
              continue;
            }

            if (isFeedbackQuestionBlock(block)) {
              const feedbackBlocks = makeFeedbackSubmittedBlock();
              for (const feedbackBlock of feedbackBlocks) {
                if (isValidSlackBlock(feedbackBlock)) {
                  updatedBlocks.push(feedbackBlock);
                }
              }
              skipNextAction = true;
              continue;
            }

            const blockObj = block as Record<string, unknown>;
            if (skipNextAction && blockObj.type === "actions") {
              skipNextAction = false;
              continue;
            }

            // Keep all other blocks (message content, footnotes, footer, etc.)
            if (isValidSlackBlock(block)) {
              updatedBlocks.push(block);
            }
          }

          await throttleWithRedis(
            RATE_LIMITS["chat.update"],
            `${connector.id}-chat-update`,
            false,
            async () =>
              slackClient.chat.update({
                channel: slackChannelId,
                ts: slackMessageTs,
                blocks: updatedBlocks,
                text: currentMessage.text || "",
              }),
            { source: "submitFeedbackToAPI" }
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
