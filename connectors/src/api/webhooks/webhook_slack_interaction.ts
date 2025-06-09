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
export const APPROVE_TOOL_EXECUTION = "approve_tool_execution";
export const REJECT_TOOL_EXECUTION = "reject_tool_execution";

const ToolValidationActionsCodec = t.union([
  t.literal(APPROVE_TOOL_EXECUTION),
  t.literal(REJECT_TOOL_EXECUTION),
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
  value: t.string,
});

export type RequestToolPermissionActionValueParsed = {
  status: "approved" | "rejected";
  agentName: string;
  toolName: string;
};

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
  response_url: t.string,
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
  const responseUrl = payload.response_url;

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
    } else if (
      action.action_id === APPROVE_TOOL_EXECUTION ||
      action.action_id === REJECT_TOOL_EXECUTION
    ) {
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
        responseUrl,
        slackTeamId: payload.team.id,
        slackChannel: payload.channel.id,
        slackUserId: payload.user.id,
        slackBotId: botId,
        slackThreadTs: slackThreadTs,
        slackMessageTs: messageTs,
      };

      const {
        status: approved,
        agentName,
        toolName,
      } = JSON.parse(action.value) as RequestToolPermissionActionValueParsed;

      const text = `Agent \`@${agentName}\`'s request to use tool \`${toolName}\` was ${
        approved === "approved" ? "✅ approved" : "❌ rejected"
      }`;

      const validationRes = await botValidateToolExecution(
        {
          actionId,
          approved,
          conversationId,
          messageId,
          slackBotMessageId,
          text,
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
