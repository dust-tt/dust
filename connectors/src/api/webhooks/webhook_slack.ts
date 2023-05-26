import { Request, Response } from "express";

import {
  getAccessToken,
  whoAmI,
} from "@connectors/connectors/slack/temporal/activities";
import {
  launchSlackBotJoinedWorkflow,
  launchSlackSyncOneMessageWorkflow,
  launchSlackSyncOneThreadWorkflow,
} from "@connectors/connectors/slack/temporal/client";
import { launchSlackGarbageCollectWorkflow } from "@connectors/connectors/slack/temporal/client";
import { Connector, SlackConfiguration } from "@connectors/lib/models";
import logger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorsAPIErrorResponse } from "@connectors/types/errors";

type SlackWebhookReqBody = {
  type?: string;
  challenge?: string;
  team_id?: string;
  event?: {
    channel?: string;
    user?: string;
    ts?: string; // slack message id
    thread_ts?: string; // slack thread id
    type?: string; // event type (eg: message)
  };
};

type SlackWebhookResBody =
  | { challenge: string }
  | null
  | ConnectorsAPIErrorResponse;

const _webhookSlackAPIHandler = async (
  req: Request<
    Record<string, string>,
    SlackWebhookResBody,
    SlackWebhookReqBody
  >,
  res: Response<SlackWebhookResBody>
) => {
  if (req.body.type === "url_verification" && req.body.challenge) {
    return res.status(200).send({
      challenge: req.body.challenge,
    });
  } else if (req.body.type === "event_callback") {
    if (!req.body.team_id) {
      return res.status(400).send({
        error: {
          message: "Missing team_id in request body",
        },
      });
    }
    const slackConfiguration = await SlackConfiguration.findOne({
      where: {
        slackTeamId: req.body.team_id,
      },
    });
    if (!slackConfiguration) {
      return res.status(404).send({
        error: {
          message: `Slack configuration not found for teamId ${req.body.team_id}`,
        },
      });
    }

    if (req.body.event?.type === "message") {
      if (req.body.team_id) {
        let workflowRes = null;
        if (req.body.event?.channel && req.body.event?.thread_ts) {
          workflowRes = await launchSlackSyncOneThreadWorkflow(
            slackConfiguration.connectorId.toString(),
            req.body.event.channel,
            req.body.event.thread_ts
          );
        } else if (req.body.event?.channel && req.body.event?.ts) {
          workflowRes = await launchSlackSyncOneMessageWorkflow(
            slackConfiguration.connectorId.toString(),
            req.body.event.channel,
            req.body.event.ts
          );
        } else {
          return res.status(400).send({
            error: {
              message: `Webhook message without thread id or message id.`,
            },
          });
        }

        if (workflowRes.isErr()) {
          return res.status(500).send({
            error: {
              message: workflowRes.error.message,
            },
          });
        } else {
          logger.info(
            {
              type: req.body.event.type,
              channel: req.body.event.channel,
              ts: req.body.event.ts,
              thread_ts: req.body.event.thread_ts,
              user: req.body.event.user,
            },
            `Successfully processed Slack Webhook`
          );
          return res.status(200).send();
        }
      }
    } else if (req.body.event?.type === "member_joined_channel") {
      if (!req.body.event?.channel || !req.body.event?.user) {
        return res.status(400).send({
          error: {
            message:
              "Missing channel or user in request body for member_joined_channel event",
          },
        });
      }
      const connector = await Connector.findByPk(
        slackConfiguration.connectorId
      );
      if (!connector) {
        return res.status(500).send({
          error: {
            message: `Connector not found for id ${slackConfiguration.connectorId}`,
          },
        });
      }

      if (!connector.nangoConnectionId) {
        return res.status(500).send({
          error: {
            message: `Connector ${connector.id} does not have a nango connection id`,
          },
        });
      }

      const slackAccessToken = await getAccessToken(
        // TODO: deprecate_nango_connection_id_2023-06-06
        connector.connectionId || connector.nangoConnectionId
      );
      const myUserId = await whoAmI(slackAccessToken);
      if (myUserId !== req.body.event.user) {
        return res.status(200).send();
      }
      const launchRes = await launchSlackBotJoinedWorkflow(
        slackConfiguration.connectorId.toString(),
        req.body.event.channel
      );
      logger.info(
        {
          type: req.body.event.type,
          channel: req.body.event.channel,
          user: req.body.event.user,
        },
        `Successfully processed Slack Webhook`
      );
      if (launchRes.isErr()) {
        return res.status(500).send({
          error: {
            message: launchRes.error.message,
          },
        });
      }
    } else if (
      req.body.event?.type &&
      ["channel_left", "channel_deleted"].includes(req.body.event?.type)
    ) {
      if (!req.body.event?.channel) {
        return apiError(req, res, {
          api_error: {
            type: "invalid_request_error",
            message:
              "Missing channel in request body for [channel_left, channel_deleted] event",
          },
          status_code: 400,
        });
      }
      const launchRes = await launchSlackGarbageCollectWorkflow(
        slackConfiguration.connectorId.toString()
      );
      if (launchRes.isErr()) {
        return apiError(req, res, {
          api_error: {
            type: "internal_server_error",
            message: launchRes.error.message,
          },
          status_code: 500,
        });
      }
      return res.status(200).send();
    }
  }

  // returns 200 on all non supported messages types because slack will retry
  // indefinitely otherwise.
  return res.status(200).end();
};

export const webhookSlackAPIHandler = withLogging(_webhookSlackAPIHandler);
/**
 * Webhhok payload example. Can be handy for working on it.
 * This is what Slack sends us when a new message is posted in a channel.
 * 
 * {
  token: '6OiSmwn7QoyS8A3yL6tddCHd',
  team_id: 'T050RH73H9P',
  context_team_id: 'T050RH73H9P',
  context_enterprise_id: null,
  api_app_id: 'A04T6G3E9FY',
  event: {
    client_msg_id: 'af462834-af02-4f6b-82cf-a1f20150cdab',
    type: 'message',
    text: 'waiting for webhook….',
    user: 'U0506AXSHN2',
    ts: '1682680228.216339',
    blocks: [ [Object] ],
    team: 'T050RH73H9P',
    channel: 'C050DRFBYGK',
    event_ts: '1682680228.216339',
    channel_type: 'channel'
  },
  type: 'event_callback',
  event_id: 'Ev055EA9CB6X',
  event_time: 1682680228,
  authorizations: [
    {
      enterprise_id: null,
      team_id: 'T050RH73H9P',
      user_id: 'U04VCU7TB9V',
      is_bot: true,
      is_enterprise_install: false
    }
  ],
  is_ext_shared_channel: false,
  event_context: '4-eyJldCI6Im1lc3NhZ2UiLCJ0aWQiOiJUMDUwUkg3M0g5UCIsImFpZCI6IkEwNFQ2RzNFOUZZIiwiY2lkIjoiQzA1MERSRkJZR0sifQ'
}
 */
