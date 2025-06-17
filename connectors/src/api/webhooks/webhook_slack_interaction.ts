import type { Request, Response } from "express";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";

import {
  botReplaceMention,
  botValidateToolExecution,
} from "@connectors/connectors/slack/bot";
import {
  SlackBlockIdStaticAgentConfigSchema,
  SlackBlockIdToolValidationSchema,
} from "@connectors/connectors/slack/chat/stream_conversation_handler";
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
        const pathError = reporter.formatValidationErrors(valueValidation.left);
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
    }
  }
};

export const webhookSlackInteractionsAPIHandler = withLogging(
  _webhookSlackInteractionsAPIHandler
);
