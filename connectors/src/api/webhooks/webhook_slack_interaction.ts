import type { APIErrorWithStatusCode } from "@dust-tt/types";
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
  message: t.type({
    ts: t.string,
    thread_ts: t.string,
    bot_id: t.string,
    metadata: t.type({
      event_payload: t.type({
        message_id: t.number,
      }),
    }),
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

type SlackWebhookResBody =
  | { challenge: string }
  | null
  | APIErrorWithStatusCode;

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

  const params = {
    slackTeamId: payload.team.id,
    slackChannel: payload.channel.id,
    slackUserId: payload.user.id,
    slackBotId: payload.message.bot_id,
    slackMessageTs: payload.message.ts,
    slackThreadTs: payload.message.thread_ts,
  };

  for (const action of payload.actions) {
    if (action.action_id === STATIC_AGENT_CONFIG) {
      const messageId = payload.message.metadata.event_payload.message_id;
      const selectedOption = action.selected_option?.value;
      if (selectedOption && messageId) {
        const botRes = await botReplaceMention(
          messageId,
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
