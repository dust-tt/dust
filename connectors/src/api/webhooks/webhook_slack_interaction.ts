import type { Request, Response } from "express";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";

import type { SlackWebhookResBody } from "@connectors/api/webhooks/slack/utils";
import {
  botReplaceMention,
  botValidateToolExecution,
} from "@connectors/connectors/slack/bot";
import {
  SlackBlockIdStaticAgentConfigSchema,
  SlackBlockIdToolValidationSchema,
} from "@connectors/connectors/slack/chat/stream_conversation_handler";
import { submitFeedbackToAPI } from "@connectors/connectors/slack/feedback_api";
import {
  getSlackClientForTeam,
  openFeedbackModal,
} from "@connectors/connectors/slack/feedback_modal";
import logger from "@connectors/logger/logger";
import { withLogging } from "@connectors/logger/withlogging";

export const STATIC_AGENT_CONFIG = "static_agent_config";
export const APPROVE_TOOL_EXECUTION = "approve_tool_execution";
export const REJECT_TOOL_EXECUTION = "reject_tool_execution";
export const LEAVE_FEEDBACK = "leave_feedback";
export const LEAVE_FEEDBACK_UP = "leave_feedback_up";
export const LEAVE_FEEDBACK_DOWN = "leave_feedback_down";

const ToolValidationActionsCodec = t.union([
  t.literal(APPROVE_TOOL_EXECUTION),
  t.literal(REJECT_TOOL_EXECUTION),
]);

const FeedbackActionSchema = t.type({
  type: t.string,
  action_id: t.union([
    t.literal(LEAVE_FEEDBACK_UP),
    t.literal(LEAVE_FEEDBACK_DOWN),
  ]),
  block_id: t.string,
  action_ts: t.string,
  value: t.string,
  text: t.type({
    type: t.string,
    text: t.string,
    emoji: t.boolean,
  }),
});

const StaticAgentConfigSchema = t.type({
  type: t.string,
  action_id: t.literal(STATIC_AGENT_CONFIG),
  block_id: t.string,
  selected_option: t.type({
    text: t.type({
      type: t.string,
      text: t.string,
    }),
    value: t.string,
  }),
  action_ts: t.string,
});

const ToolValidationActionsSchema = t.type({
  type: t.string,
  action_id: ToolValidationActionsCodec,
  block_id: t.string,
  action_ts: t.string,
  value: t.string,
});

export type RequestToolPermissionActionValueParsed = {
  status: "approved" | "rejected";
  agentName: string;
  toolName: string;
};

const BlockActionsPayloadSchema = t.type({
  type: t.literal("block_actions"),
  team: t.type({
    id: t.string,
    domain: t.string,
  }),
  channel: t.type({
    id: t.string,
    name: t.string,
  }),
  container: t.type({
    message_ts: t.string,
    channel_id: t.string,
    thread_ts: t.string,
  }),
  user: t.type({
    id: t.string,
  }),
  actions: t.array(
    t.union([
      StaticAgentConfigSchema,
      ToolValidationActionsSchema,
      FeedbackActionSchema,
    ])
  ),
  trigger_id: t.union([t.string, t.undefined]),
  response_url: t.string,
});

const ViewSubmissionPayloadSchema = t.type({
  type: t.literal("view_submission"),
  team: t.type({
    id: t.string,
    domain: t.string,
  }),
  user: t.type({
    id: t.string,
  }),
  view: t.type({
    id: t.string,
    callback_id: t.string,
    private_metadata: t.string,
    state: t.type({
      values: t.record(
        t.string,
        t.record(
          t.string,
          t.union([
            t.type({
              type: t.string,
              value: t.union([t.string, t.null]),
            }),
            t.type({
              type: t.string,
              selected_option: t.union([
                t.type({
                  value: t.string,
                }),
                t.null,
              ]),
            }),
          ])
        )
      ),
    }),
  }),
});

export const SlackInteractionPayloadSchema = t.union([
  BlockActionsPayloadSchema,
  ViewSubmissionPayloadSchema,
]);

const _webhookSlackInteractionsAPIHandler = async (
  req: Request<
    Record<string, string>,
    SlackWebhookResBody,
    {
      payload: string;
    }
  >,
  res: Response<SlackWebhookResBody>
) => {
  res.status(200).end();

  const rawPayload = JSON.parse(req.body.payload);
  const bodyValidation = SlackInteractionPayloadSchema.decode(rawPayload);
  if (isLeft(bodyValidation)) {
    const pathError = reporter.formatValidationErrors(bodyValidation.left);

    logger.error(
      {
        error: pathError,
        payload: rawPayload,
      },
      "Invalid payload in slack interactions"
    );

    return;
  }

  const payload = bodyValidation.right;

  // Handle view submissions (modal submits)
  if (payload.type === "view_submission") {
    await handleViewSubmission(payload);
    return;
  }

  // Handle block actions (button clicks)
  if (payload.type === "block_actions") {
    const responseUrl = payload.response_url;
    for (const action of payload.actions) {
      if (action.action_id === STATIC_AGENT_CONFIG) {
        const blockIdValidation = SlackBlockIdStaticAgentConfigSchema.decode(
          JSON.parse(action.block_id)
        );

        if (isLeft(blockIdValidation)) {
          const pathError = reporter.formatValidationErrors(
            blockIdValidation.left
          );
          logger.error(
            {
              error: pathError,
              blockId: action.block_id,
            },
            "Invalid block_id format in slack interactions"
          );
          return;
        }

        const { slackChatBotMessageId, slackThreadTs, messageTs, botId } =
          blockIdValidation.right;

        const params = {
          slackTeamId: payload.team.id,
          slackChannel: payload.channel.id,
          slackUserId: payload.user.id,
          slackBotId: botId,
          slackThreadTs: slackThreadTs,
          slackMessageTs: messageTs || "",
        };

        const selectedOption = action.selected_option?.value;
        if (selectedOption && slackChatBotMessageId) {
          const botRes = await botReplaceMention(
            slackChatBotMessageId,
            selectedOption,
            params
          );

          if (botRes.isErr()) {
            logger.error(
              {
                error: botRes.error,
                ...params,
              },
              "Failed to post new message in slack"
            );
            return;
          }
        }
      } else if (
        action.action_id === APPROVE_TOOL_EXECUTION ||
        action.action_id === REJECT_TOOL_EXECUTION
      ) {
        const blockIdValidation = SlackBlockIdToolValidationSchema.decode(
          JSON.parse(action.block_id)
        );

        if (isLeft(blockIdValidation)) {
          const pathError = reporter.formatValidationErrors(
            blockIdValidation.left
          );
          logger.error(
            {
              error: pathError,
              blockId: action.block_id,
            },
            "Invalid block_id format in tool validation"
          );
          return;
        }

        const {
          workspaceId,
          conversationId,
          messageId,
          actionId,
          slackThreadTs,
          messageTs,
          botId,
          slackChatBotMessageId,
        } = blockIdValidation.right;

        const valueValidation = t
          .type({
            status: t.union([t.literal("approved"), t.literal("rejected")]),
            agentName: t.string,
            toolName: t.string,
          })
          .decode(JSON.parse(action.value));

        if (isLeft(valueValidation)) {
          const pathError = reporter.formatValidationErrors(
            valueValidation.left
          );
          logger.error(
            {
              error: pathError,
              value: action.value,
            },
            "Invalid value format in tool validation"
          );
          return;
        }

        const { status: approved, agentName, toolName } = valueValidation.right;

        const text = `Agent \`@${agentName}\`'s request to use tool \`${toolName}\` was ${
          approved === "approved" ? "✅ approved" : "❌ rejected"
        }`;

        const validationRes = await botValidateToolExecution(
          {
            actionId,
            approved,
            conversationId,
            messageId,
            slackChatBotMessageId,
            text,
          },
          {
            responseUrl,
            slackTeamId: payload.team.id,
            slackChannel: payload.channel.id,
            slackUserId: payload.user.id,
            slackBotId: botId,
            slackThreadTs: slackThreadTs,
            slackMessageTs: messageTs || "",
          }
        );

        if (validationRes.isErr()) {
          logger.error(
            {
              error: validationRes.error,
              workspaceId,
              conversationId,
              messageId,
              actionId,
            },
            "Failed to validate tool execution"
          );
        }
      } else if (
        action.action_id === LEAVE_FEEDBACK_UP ||
        action.action_id === LEAVE_FEEDBACK_DOWN
      ) {
        // Handle feedback button click - open modal
        const feedbackAction = action as t.TypeOf<typeof FeedbackActionSchema>;
        const buttonData = JSON.parse(feedbackAction.value || "{}");
        const { conversationId, messageId, workspaceId, preselectedThumb } =
          buttonData;

        if (payload.trigger_id) {
          // Open the feedback modal
          await openFeedbackModal({
            slackClient: await getSlackClientForTeam(payload.team.id),
            triggerId: payload.trigger_id,
            conversationId,
            messageId,
            workspaceId,
            slackUserId: payload.user.id,
            preselectedThumb,
            slackChannelId: payload.container.channel_id,
            slackMessageTs: payload.container.message_ts,
            slackThreadTs: payload.container.thread_ts,
          });
        }
      }
    }
  }
};

async function handleViewSubmission(
  payload: t.TypeOf<typeof ViewSubmissionPayloadSchema>
) {
  const { callback_id, private_metadata, state } = payload.view;

  if (callback_id === "feedback_modal_submit") {
    const metadata = JSON.parse(private_metadata) as {
      conversationId: string;
      messageId: string;
      workspaceId: string;
      slackUserId: string;
      slackChannelId: string;
      slackMessageTs: string;
      slackThreadTs: string;
    };

    // Extract feedback values from the modal
    const ratingSelection = state.values.feedback_rating?.rating_selection;
    const ratingValue =
      ratingSelection && "selected_option" in ratingSelection
        ? ratingSelection.selected_option?.value
        : undefined;

    const feedbackInput = state.values.feedback_text?.feedback_input;
    const feedbackText =
      feedbackInput && "value" in feedbackInput
        ? feedbackInput.value || ""
        : "";

    if (ratingValue) {
      // Submit feedback to the API
      await submitFeedbackToAPI({
        conversationId: metadata.conversationId,
        messageId: metadata.messageId,
        workspaceId: metadata.workspaceId,
        slackUserId: metadata.slackUserId,
        slackTeamId: payload.team.id,
        thumbDirection: ratingValue as "up" | "down",
        feedbackContent: feedbackText,
        slackChannelId: metadata.slackChannelId,
        slackMessageTs: metadata.slackMessageTs,
        slackThreadTs: metadata.slackThreadTs,
      });
    }
  }
}

export const webhookSlackInteractionsAPIHandler = withLogging(
  _webhookSlackInteractionsAPIHandler
);
