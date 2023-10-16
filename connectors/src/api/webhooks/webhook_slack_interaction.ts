import { Request, Response } from "express";

import { botAnswerMessageWithErrorHandling } from "@connectors/connectors/slack/bot";
import { APIErrorWithStatusCode } from "@connectors/lib/error";
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
  };
  user?: {
    id: string;
  };
  state?: {
    values: {
      [key: string]: {
        [key: string]: {
          selected_option?: {
            value: string;
          };
        };
      };
    };
  };
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
  const agentConfigId =
    payload.state?.values?.agentConfigId?.static_selectAgentConfig
      ?.selected_option?.value;
  if (!agentConfigId) {
    logger.error(
      {
        payload,
      },
      `Missing agentConfigId in slack reactions payload`
    );
    return;
  }
  // returns 200 on all non supported messages types because slack will retry
  // indefinitely otherwise.
  if (
    !payload.team?.id ||
    !payload.channel?.id ||
    !payload.message?.ts ||
    !payload.user?.id
  ) {
    logger.error(
      {
        payload,
      },
      `Missing required fields in slack reactions payload`
    );
    return res.status(200).end();
  }

  const botRes = await botAnswerMessageWithErrorHandling({
    message: "",
    slackTeamId: payload.team.id,
    slackChannel: payload.channel.id,
    slackUserId: payload.user.id,
    slackMessageTs: payload.message.ts,
    slackThreadTs: payload.message?.thread_ts || null,
    mentionOverride: [agentConfigId],
  });
  if (botRes.isErr()) {
    logger.error(
      {
        error: botRes.error,
        payload: payload,
      },
      "Failed to handle Slack reaction"
    );
  }
};

export const webhookSlackInteractionsAPIHandler = withLogging(
  _webhookSlackInteractionsAPIHandler
);
