import { apiConfig } from "@connectors/lib/api/config";
import { getSlackClient, getSlackUserInfo } from "@connectors/connectors/slack/lib/slack_client";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import { getHeaderFromUserEmail } from "@connectors/types";

export async function submitFeedbackToAPI({
  conversationId,
  messageId,
  workspaceId,
  slackUserId,
  slackTeamId,
  thumbDirection,
  feedbackContent,
}: {
  conversationId: string;
  messageId: string;
  workspaceId: string;
  slackUserId: string;
  slackTeamId: string;
  thumbDirection: "up" | "down";
  feedbackContent: string;
}) {
  try {
    // Get the Slack configuration to find the connector
    const slackConfig = await SlackConfigurationResource.fetchByActiveBot(slackTeamId);
    if (!slackConfig) {
      logger.error(
        { slackTeamId },
        "Failed to find Slack configuration for team"
      );
      return;
    }

    // Get the connector using the configuration's connector ID
    const connector = await ConnectorResource.fetchById(slackConfig.connectorId);
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
      const slackUserInfo = await getSlackUserInfo(connector.id, slackClient, slackUserId);
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
