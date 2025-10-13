import type { WebClient } from "@slack/web-api";

import { getSlackClient } from "@connectors/connectors/slack/lib/slack_client";
import logger from "@connectors/logger/logger";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";

export const FEEDBACK_MODAL_SUBMIT = "feedback_modal_submit";

export interface FeedbackModalMetadata {
  conversationId: string;
  messageId: string;
  workspaceId: string;
  slackUserId: string;
  preselectedThumb?: "up" | "down";
  slackChannelId: string;
  slackMessageTs: string;
  slackThreadTs: string;
}

export async function openFeedbackModal({
  slackClient,
  triggerId,
  conversationId,
  messageId,
  workspaceId,
  slackUserId,
  preselectedThumb,
  slackChannelId,
  slackMessageTs,
  slackThreadTs,
}: {
  slackClient: WebClient;
  triggerId: string;
  conversationId: string;
  messageId: string;
  workspaceId: string;
  slackUserId: string;
  preselectedThumb?: "up" | "down";
  slackChannelId: string;
  slackMessageTs: string;
  slackThreadTs: string;
}) {
  try {
    const metadata: FeedbackModalMetadata = {
      conversationId,
      messageId,
      workspaceId,
      slackUserId,
      preselectedThumb,
      slackChannelId,
      slackMessageTs,
      slackThreadTs,
    };

    await slackClient.views.open({
      trigger_id: triggerId,
      view: {
        type: "modal",
        callback_id: FEEDBACK_MODAL_SUBMIT,
        private_metadata: JSON.stringify(metadata),
        title: {
          type: "plain_text",
          text: "Leave Feedback",
        },
        submit: {
          type: "plain_text",
          text: "Submit",
        },
        close: {
          type: "plain_text",
          text: "Cancel",
        },
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "Help us improve by sharing your feedback about this response.",
            },
          },
          {
            type: "input",
            block_id: "feedback_rating",
            label: {
              type: "plain_text",
              text: "How was this response?",
            },
            element: {
              type: "radio_buttons",
              action_id: "rating_selection",
              initial_option: preselectedThumb
                ? {
                    text: {
                      type: "plain_text",
                      text:
                        preselectedThumb === "up"
                          ? "👍 Helpful"
                          : "👎 Not helpful",
                    },
                    value: preselectedThumb,
                  }
                : undefined,
              options: [
                {
                  text: {
                    type: "plain_text",
                    text: "👍 Helpful",
                  },
                  value: "up",
                },
                {
                  text: {
                    type: "plain_text",
                    text: "👎 Not helpful",
                  },
                  value: "down",
                },
              ],
            },
          },
          {
            type: "input",
            block_id: "feedback_text",
            label: {
              type: "plain_text",
              text: "Additional feedback",
            },
            element: {
              type: "plain_text_input",
              action_id: "feedback_input",
              multiline: true,
              placeholder: {
                type: "plain_text",
                text: "Tell us more about your experience...",
              },
            },
            optional: true,
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "_By submitting feedback, you agree to share your conversation internally with the agent's editors._",
            },
          },
        ],
      },
    });
  } catch (error) {
    logger.error(
      {
        error,
        conversationId,
        messageId,
        workspaceId,
      },
      "Failed to open feedback modal"
    );
  }
}

export async function getSlackClientForTeam(
  slackTeamId: string
): Promise<WebClient> {
  const slackConfig =
    await SlackConfigurationResource.fetchByActiveBot(slackTeamId);
  if (!slackConfig) {
    throw new Error(
      `Failed to find Slack configuration for team ${slackTeamId}`
    );
  }

  const slackClient = await getSlackClient(slackConfig.connectorId);
  if (!slackClient) {
    throw new Error(`Failed to get Slack client for team ${slackTeamId}`);
  }
  return slackClient;
}
