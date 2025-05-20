import type { Request, Response } from "express";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";

import {
  botReplaceMention,
  botValidateToolExecution,
} from "@connectors/connectors/slack/bot";
import logger from "@connectors/logger/logger";
import { withLogging } from "@connectors/logger/withlogging";

export const STATIC_AGENT_CONFIG = "static_agent_config";
export const TOOL_VALIDATION_ACTIONS = [
  "approve_tool_execution",
  "reject_tool_execution",
] as const;

const [first, second] = TOOL_VALIDATION_ACTIONS;
const ToolValidationActionsCodec = t.union([
  t.literal(first),
  t.literal(second),
]);

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
});

export const SlackInteractionPayloadSchema = t.type({
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
    t.union([StaticAgentConfigSchema, ToolValidationActionsSchema])
  ),
});

type SlackWebhookResBody = { challenge: string } | null;

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

  for (const action of payload.actions) {
    if (action.action_id === STATIC_AGENT_CONFIG) {
      const { slackChatBotMessage, slackThreadTs, messageTs, botId } =
        JSON.parse(action.block_id);

      const params = {
        slackTeamId: payload.team.id,
        slackChannel: payload.channel.id,
        slackUserId: payload.user.id,
        slackBotId: botId,
        slackThreadTs: slackThreadTs,
        slackMessageTs: messageTs,
      };

      const selectedOption = action.selected_option?.value;
      if (selectedOption && slackChatBotMessage) {
        const botRes = await botReplaceMention(
          slackChatBotMessage,
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
    } else if (TOOL_VALIDATION_ACTIONS.includes(action.action_id)) {
      const {
        workspaceId,
        conversationId,
        messageId,
        actionId,
        slackThreadTs,
        messageTs,
        botId,
        slackBotMessageId,
      } = JSON.parse(action.block_id);

      const params = {
        slackTeamId: payload.team.id,
        slackChannel: payload.channel.id,
        slackUserId: payload.user.id,
        slackBotId: botId,
        slackThreadTs: slackThreadTs,
        slackMessageTs: messageTs,
      };

      const approved =
        action.action_id === "approve_tool_execution" ? "approved" : "rejected";

      const validationRes = await botValidateToolExecution(
        {
          actionId,
          approved,
          conversationId,
          messageId,
          slackBotMessageId,
        },
        params
      );

      if (validationRes.isErr()) {
        logger.error(
          {
            error: validationRes.error,
            workspaceId,
            conversationId,
            messageId,
            actionId,
            approved,
          },
          "Failed to validate tool execution"
        );
      }
    }
  }
};

export const webhookSlackInteractionsAPIHandler = withLogging(
  _webhookSlackInteractionsAPIHandler
);
