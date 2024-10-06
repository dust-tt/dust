import type { APIErrorWithStatusCode } from "@dust-tt/types";
import type { Request, Response } from "express";

import { botReplaceMention } from "@connectors/connectors/slack/bot";
import logger from "@connectors/logger/logger";
import { withLogging } from "@connectors/logger/withlogging";

type SlackInteractionPayload = {
  team?: {
    id: string;
    domain: string;
  };
  channel?: {
    id: string;
    name: string;
  };
  message?: {
    ts: string;
    thread_ts?: string;
    bot_id?: string;
    metadata?: {
      event_payload?: {
        message_id: string;
      };
    };
  };
  user?: {
    id: string;
  };
  actions?: {
    action_id: string;
    block_id: string;
    text: {
      type: string;
      text: string;
    };
    selected_option?: {
      text: {
        type: string;
        text: string;
      };
      value: string;
    };
    value: string;
    type: string;
    action_ts: string;
  }[];
};

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
  const payload: SlackInteractionPayload = JSON.parse(req.body.payload);

  if (
    !payload.team?.id ||
    !payload.channel?.id ||
    !payload.message?.ts ||
    !payload.user?.id ||
    !payload.actions
  ) {
    logger.error(
      {
        payload,
      },
      `Missing required fields in slack reactions payload`
    );
    return;
  }
  console.log(payload);
  for (const action of payload.actions) {
    if (action.action_id === "static_agent_config") {
      const messageId = payload.message.metadata?.event_payload?.message_id;
      const selected_option = action.selected_option?.value;
      if (selected_option && messageId) {
        const params = {
          slackTeamId: payload.team.id,
          slackChannel: payload.channel.id,
          slackUserId: payload.user.id,
          slackBotId: payload.message.bot_id ?? null,
          slackMessageTs: payload.message.ts,
          slackThreadTs: payload.message.thread_ts ?? null,
        };
        const botRes = await botReplaceMention(
          messageId,
          selected_option,
          params
        );

        if (botRes.isErr()) {
          logger.error(
            {
              error: botRes.error,
              ...params,
            },
            `Failed to post new message in slack`
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
