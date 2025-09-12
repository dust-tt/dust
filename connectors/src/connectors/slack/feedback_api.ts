import { apiConfig } from "@connectors/lib/api/config";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

export async function submitFeedbackToAPI({
  conversationId,
  messageId,
  workspaceId,
  slackUserId,
  thumbDirection,
  feedbackContent,
}: {
  conversationId: string;
  messageId: string;
  workspaceId: string;
  slackUserId: string;
  thumbDirection: "up" | "down";
  feedbackContent: string;
}) {
  try {
    // Get the connector to access the workspace
    const connector = await ConnectorResource.findByWorkspaceIdAndType(
      workspaceId,
      "slack"
    );

    if (!connector) {
      logger.error(
        { workspaceId },
        "Failed to find Slack connector for workspace"
      );
      return;
    }

    // Submit feedback using the existing API endpoint
    // The API expects the feedback to be submitted to the messages endpoint
    const response = await fetch(
      `${apiConfig.getDustFrontAPIUrl()}/api/w/${workspaceId}/assistant/conversations/${conversationId}/messages/${messageId}/feedbacks`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${connector.workspaceAPIKey}`,
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
          workspaceId,
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
        workspaceId,
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
