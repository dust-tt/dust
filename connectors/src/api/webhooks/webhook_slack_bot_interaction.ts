import {
  botAnswerUserQuestion,
  botReplaceMention,
  botValidateToolExecution,
  // biome-ignore lint/suspicious/noImportCycles: ignored using `--suppress`
} from "@connectors/connectors/slack/bot";
import {
  getAuthResponseUrlRedisKey,
  SlackBlockIdStaticAgentConfigSchema,
  SlackBlockIdToolValidationSchema,
  SlackUserQuestionActionValueSchema,
  // biome-ignore lint/suspicious/noImportCycles: ignored using `--suppress`
} from "@connectors/connectors/slack/chat/stream_conversation_handler";
// biome-ignore lint/suspicious/noImportCycles: ignored using `--suppress`
import { submitFeedbackToAPI } from "@connectors/connectors/slack/feedback_api";
import {
  getSlackClientForTeam,
  openFeedbackModal,
} from "@connectors/connectors/slack/feedback_modal";
import logger from "@connectors/logger/logger";
import { withLogging } from "@connectors/logger/withlogging";
import { redisClient } from "@connectors/types/shared/redis_client";
import type { Request, Response } from "express";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";

export const STATIC_AGENT_CONFIG = "static_agent_config";
export const APPROVE_TOOL_EXECUTION = "approve_tool_execution";
export const REJECT_TOOL_EXECUTION = "reject_tool_execution";
export const AUTHENTICATE_TOOL = "authenticate_tool";
export const LEAVE_FEEDBACK_UP = "leave_feedback_up";
export const LEAVE_FEEDBACK_DOWN = "leave_feedback_down";
export const ANSWER_USER_QUESTION_SUBMIT = "answer_user_question_submit";
export const ANSWER_USER_QUESTION_SKIP = "answer_user_question_skip";
// Block IDs / action IDs for reading state.values when Submit is clicked.
export const USER_QUESTION_TEXT_BLOCK_ID = "question_text_input";
export const USER_QUESTION_TEXT_ACTION_ID = "question_text_element";
export const USER_QUESTION_OPTIONS_BLOCK_ID = "question_options";
export const USER_QUESTION_OPTIONS_ACTION_ID = "question_checkboxes";

const ToolValidationActionsCodec = t.union([
  t.literal(APPROVE_TOOL_EXECUTION),
  t.literal(REJECT_TOOL_EXECUTION),
]);

const FeedbackActionSchema = t.type({
  type: t.literal("button"),
  action_id: t.union([
    t.literal(LEAVE_FEEDBACK_UP),
    t.literal(LEAVE_FEEDBACK_DOWN),
  ]),
  block_id: t.string,
  action_ts: t.string,
  value: t.string,
  text: t.type({
    type: t.literal("plain_text"),
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

const AuthenticateToolActionSchema = t.type({
  type: t.literal("button"),
  action_id: t.literal(AUTHENTICATE_TOOL),
  block_id: t.string,
  action_ts: t.string,
  value: t.string,
});

const AnswerUserQuestionButtonSchema = t.type({
  type: t.literal("button"),
  action_id: t.union([
    t.literal(ANSWER_USER_QUESTION_SUBMIT),
    t.literal(ANSWER_USER_QUESTION_SKIP),
  ]),
  block_id: t.string,
  action_ts: t.string,
  value: t.string,
});

export type RequestToolPermissionActionValueParsed = {
  status: "approved" | "rejected";
  agentName: string;
  toolName: string;
};

const BlockActionsStateSchema = t.record(
  t.string,
  t.record(t.string, t.unknown)
);

type BlockActionsState = t.TypeOf<typeof BlockActionsStateSchema>;

const RadioStateSchema = t.type({
  selected_option: t.type({ value: t.string }),
});

const CheckboxStateSchema = t.type({
  selected_options: t.array(t.type({ value: t.string })),
});

const TextInputStateSchema = t.type({
  value: t.union([t.string, t.null]),
});

function getStateSelectedOptions(
  state: { values: BlockActionsState } | undefined,
  blockId: string,
  actionId: string
): number[] {
  const el = state?.values?.[blockId]?.[actionId];
  const radio = RadioStateSchema.decode(el);
  if (!isLeft(radio)) {
    return [parseInt(radio.right.selected_option.value)];
  }
  const checkboxes = CheckboxStateSchema.decode(el);
  if (!isLeft(checkboxes)) {
    return checkboxes.right.selected_options.map((o) => parseInt(o.value));
  }
  return [];
}

function getStateTextValue(
  state: { values: BlockActionsState } | undefined,
  blockId: string,
  actionId: string
): string | undefined {
  const el = state?.values?.[blockId]?.[actionId];
  const decoded = TextInputStateSchema.decode(el);
  if (isLeft(decoded) || !decoded.right.value) {
    return undefined;
  }
  return decoded.right.value;
}

const BlockActionsPayloadSchema = t.intersection([
  t.type({
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
    actions: t.array(t.unknown),
    trigger_id: t.union([t.string, t.undefined]),
    response_url: t.string,
  }),
  t.partial({
    state: t.type({ values: BlockActionsStateSchema }),
  }),
]);

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

const KnownActionSchema = t.union([
  StaticAgentConfigSchema,
  ToolValidationActionsSchema,
  FeedbackActionSchema,
  AuthenticateToolActionSchema,
  AnswerUserQuestionButtonSchema,
]);

export const SlackInteractionPayloadSchema = t.union([
  BlockActionsPayloadSchema,
  ViewSubmissionPayloadSchema,
]);

type SlackWebhookResBody = { challenge: string } | null;

const _webhookSlackBotInteractionsAPIHandler = async (
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

    for (const rawAction of payload.actions) {
      const actionDecoded = KnownActionSchema.decode(rawAction);
      if (isLeft(actionDecoded)) {
        continue;
      }
      const action = actionDecoded.right;

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

        const text = `Agent \`${agentName}\`'s request to use tool \`${toolName}\` was ${
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
        logger.info(
          {
            action_id: action.action_id,
            block_id: action.block_id,
            value: action.value,
            type: action.type,
            trigger_id: payload.trigger_id,
          },
          "[Slack] Feedback button clicked"
        );

        const feedbackAction = action as t.TypeOf<typeof FeedbackActionSchema>;
        const buttonData = JSON.parse(feedbackAction.value || "{}");
        const { conversationId, messageId, workspaceId, preselectedThumb } =
          buttonData;

        if (payload.trigger_id) {
          try {
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
              responseUrl,
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
        } else {
          logger.warn("No trigger_id available for feedback modal");
        }
      } else if (action.action_id === AUTHENTICATE_TOOL) {
        const { workspaceId, messageId } = JSON.parse(action.value);
        const redisKey = getAuthResponseUrlRedisKey(workspaceId, messageId);
        const redis = await redisClient({ origin: "slack_auth" });
        await redis.set(redisKey, responseUrl, { EX: 1800 });
      } else if (
        action.action_id === ANSWER_USER_QUESTION_SUBMIT ||
        action.action_id === ANSWER_USER_QUESTION_SKIP
      ) {
        const valueValidation = SlackUserQuestionActionValueSchema.decode(
          JSON.parse(action.value)
        );

        if (isLeft(valueValidation)) {
          const pathError = reporter.formatValidationErrors(
            valueValidation.left
          );
          logger.error(
            {
              error: pathError,
              value: action.value,
            },
            "Invalid value format in user question answer"
          );
          return;
        }

        const {
          workspaceId,
          conversationId,
          messageId,
          actionId,
          slackChatBotMessageId,
        } = valueValidation.right;

        let answer: { selectedOptions: number[]; customResponse?: string };

        if (action.action_id === ANSWER_USER_QUESTION_SUBMIT) {
          const selectedOptions = getStateSelectedOptions(
            payload.state,
            USER_QUESTION_OPTIONS_BLOCK_ID,
            USER_QUESTION_OPTIONS_ACTION_ID
          );
          const customResponse =
            selectedOptions.length === 0
              ? getStateTextValue(
                  payload.state,
                  USER_QUESTION_TEXT_BLOCK_ID,
                  USER_QUESTION_TEXT_ACTION_ID
                )
              : undefined;
          answer = { selectedOptions, customResponse };
        } else {
          answer = { selectedOptions: [] };
        }

        const answerRes = await botAnswerUserQuestion({
          actionId,
          answer,
          conversationId,
          messageId,
          slackChatBotMessageId,
          responseUrl,
          slackTeamId: payload.team.id,
          slackChannel: payload.channel.id,
          slackThreadTs: payload.container.thread_ts,
        });

        if (answerRes.isErr()) {
          logger.error(
            {
              error: answerRes.error,
              workspaceId,
              conversationId,
              messageId,
              actionId,
            },
            "Failed to answer user question"
          );
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
      responseUrl: string;
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
        responseUrl: metadata.responseUrl,
      });
    }
  }
}

export const webhookSlackBotInteractionsAPIHandler = withLogging(
  _webhookSlackBotInteractionsAPIHandler
);
