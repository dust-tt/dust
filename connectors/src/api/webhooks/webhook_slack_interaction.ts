import type { Request, Response } from "express";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";

import { botReplaceMention } from "@connectors/connectors/slack/bot";
import logger from "@connectors/logger/logger";
import { withLogging } from "@connectors/logger/withlogging";

export const STATIC_AGENT_CONFIG = "static_agent_config";

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
    t.type({
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
    })
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
    logger.error(
      {
        error: bodyValidation.left,
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
    }
  }
};

export const webhookSlackInteractionsAPIHandler = withLogging(
  _webhookSlackInteractionsAPIHandler
);
