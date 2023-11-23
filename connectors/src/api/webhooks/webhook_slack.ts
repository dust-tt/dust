import { Request, Response } from "express";

import { botAnswerMessageWithErrorHandling } from "@connectors/connectors/slack/bot";
import { getBotUserIdMemoized } from "@connectors/connectors/slack/temporal/activities";
import {
  launchSlackSyncOneMessageWorkflow,
  launchSlackSyncOneThreadWorkflow,
} from "@connectors/connectors/slack/temporal/client";
import { launchSlackGarbageCollectWorkflow } from "@connectors/connectors/slack/temporal/client";
import { APIErrorWithStatusCode } from "@connectors/lib/error";
import { Connector } from "@connectors/lib/models";
import { SlackChannel, SlackConfiguration } from "@connectors/lib/models/slack";
import { Ok } from "@connectors/lib/result";
import logger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";

type SlackWebhookReqBody = {
  type?: string;
  challenge?: string;
  team_id?: string;
  event?: {
    bot_id?: string;
    channel?: string;
    subtype?: "message_changed";
    user?: string;
    ts?: string; // slack message id
    thread_ts?: string; // slack thread id
    type?: string; // event type (eg: message)
    channel_type?: "channel" | "im" | "mpim";
    text: string; // content of the message
    message?: {
      bot_id?: string;
    };
  };
};

type SlackWebhookResBody =
  | { challenge: string }
  | null
  | APIErrorWithStatusCode;

async function handleChatBot(req: Request, res: Response) {
  const slackMessage = req.body.event.text;
  const slackTeamId = req.body.team_id;
  const slackChannel = req.body.event.channel;
  const slackUserId = req.body.event.user;
  const slackMessageTs = req.body.event.ts;
  const slackThreadTs = req.body.event.thread_ts || null;
  if (
    !slackMessage ||
    !slackTeamId ||
    !slackChannel ||
    !slackUserId ||
    !slackMessageTs
  ) {
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: "Missing required fields in request body",
      },
      status_code: 400,
    });
  }

  // We need to answer 200 quickly to Slack, otherwise they will retry the HTTP request.
  res.status(200).send();

  const botRes = await botAnswerMessageWithErrorHandling(
    slackMessage,
    slackTeamId,
    slackChannel,
    slackUserId,
    slackMessageTs,
    slackThreadTs
  );
  if (botRes.isErr()) {
    logger.error(
      {
        error: botRes.error,
        slackMessage,
        slackTeamId,
        slackChannel,
        slackUserId,
        slackMessageTs,
      },
      "Failed to answer to Slack message"
    );
  }
}

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
  }

  if (req.body.type === "event_callback") {
    if (!req.body.team_id) {
      return apiError(req, res, {
        api_error: {
          type: "invalid_request_error",
          message: "Missing team_id in request body",
        },
        status_code: 400,
      });
    }
    const slackConfigurations = await SlackConfiguration.findAll({
      where: {
        slackTeamId: req.body.team_id,
      },
    });
    if (slackConfigurations.length === 0) {
      return apiError(req, res, {
        api_error: {
          type: "connector_configuration_not_found",
          message: `Slack configuration not found for teamId ${req.body.team_id}`,
        },
        status_code: 404,
      });
    }

    switch (req.body.event?.type) {
      case "app_mention": {
        await handleChatBot(req, res);
        break;
      }
      /**
       * `message` handler.
       */
      case "message": {
        if (!req.body.team_id) {
          return apiError(req, res, {
            api_error: {
              type: "invalid_request_error",
              message: "Missing team_id in request body for message event",
            },
            status_code: 400,
          });
        }
        if (req.body.event?.channel_type === "im") {
          //Got a private message
          if (req.body.event.subtype === "message_changed") {
            // Ignore message_changed events in private messages
            return res.status(200).send();
          }
          const slackConfig = await SlackConfiguration.findOne({
            where: {
              slackTeamId: req.body.team_id,
              botEnabled: true,
            },
          });
          if (!slackConfig) {
            return apiError(req, res, {
              api_error: {
                type: "connector_configuration_not_found",
                message: `Slack configuration not found for teamId ${req.body.team_id}. Are you sure the bot is not enabled?`,
              },
              status_code: 404,
            });
          }
          const connector = await Connector.findByPk(slackConfig.connectorId);
          if (!connector) {
            return apiError(req, res, {
              api_error: {
                type: "connector_not_found",
                message: `Connector ${slackConfig.connectorId} not found`,
              },
              status_code: 404,
            });
          }

          const myUserId = await getBotUserIdMemoized(slackConfig.connectorId);
          if (req.body.event?.user === myUserId) {
            // Message sent from the bot itself.
            return res.status(200).send();
          }
          // Message from an actual user (a human)
          await handleChatBot(req, res);
          break;
        } else if (req.body.event?.channel_type === "channel") {
          if (!req.body.event?.channel) {
            return apiError(req, res, {
              api_error: {
                type: "invalid_request_error",
                message: "Missing channel in request body for message event",
              },
              status_code: 400,
            });
          }

          const channel = req.body.event.channel;
          let err: Error | null = null;

          if (req.body.event?.thread_ts) {
            const thread_ts = req.body.event.thread_ts;
            const results = await Promise.all(
              slackConfigurations.map(async (c) => {
                const slackChannel = await SlackChannel.findOne({
                  where: {
                    connectorId: c.connectorId,
                    slackChannelId: channel,
                  },
                });
                if (!slackChannel) {
                  logger.info(
                    {
                      connectorId: c.connectorId,
                      slackChannelId: channel,
                    },
                    "Skipping wehbook: Slack channel not yet in DB"
                  );
                  return new Ok(undefined);
                }
                if (!["read", "read_write"].includes(slackChannel.permission)) {
                  logger.info(
                    {
                      connectorId: c.connectorId,
                      slackChannelId: channel,
                      permission: slackChannel.permission,
                    },
                    "Ignoring message because channel permission is not read or read_write"
                  );
                  return new Ok(undefined);
                }
                return launchSlackSyncOneThreadWorkflow(
                  c.connectorId,
                  channel,
                  thread_ts
                );
              })
            );
            for (const r of results) {
              if (r.isErr()) {
                err = r.error;
              }
            }
          } else if (req.body.event?.ts) {
            const ts = req.body.event.ts;
            const results = await Promise.all(
              slackConfigurations.map(async (c) => {
                const slackChannel = await SlackChannel.findOne({
                  where: {
                    connectorId: c.connectorId,
                    slackChannelId: channel,
                  },
                });
                if (!slackChannel) {
                  logger.info(
                    {
                      connectorId: c.connectorId,
                      slackChannelId: channel,
                    },
                    "Skipping wehbook: Slack channel not yet in DB"
                  );
                  return new Ok(undefined);
                }
                if (!["read", "read_write"].includes(slackChannel.permission)) {
                  logger.info(
                    {
                      connectorId: c.connectorId,
                      slackChannelId: channel,
                      permission: slackChannel.permission,
                    },
                    "Ignoring message because channel permission is not read or read_write"
                  );
                  return new Ok(undefined);
                }
                return launchSlackSyncOneMessageWorkflow(
                  c.connectorId,
                  channel,
                  ts
                );
              })
            );
            for (const r of results) {
              if (r.isErr()) {
                err = r.error;
              }
            }
          } else {
            return apiError(req, res, {
              api_error: {
                type: "invalid_request_error",
                message: `Webhook message without 'thread_ts' or message 'ts'.`,
              },
              status_code: 400,
            });
          }

          if (err) {
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: err.message,
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
        break;
      }

      /**
       * `channel_left`, `channel_deleted` handler.
       */
      case "channel_left":
      case "channel_deleted": {
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

        let err: Error | null = null;

        const results = await Promise.all(
          slackConfigurations.map((c) => {
            return launchSlackGarbageCollectWorkflow(c.connectorId);
          })
        );
        for (const r of results) {
          if (r.isErr()) {
            err = r.error;
          }
        }

        if (err) {
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: err.message,
            },
          });
        } else {
          logger.info(
            {
              type: req.body.event.type,
            },
            `Successfully processed Slack Webhook`
          );
          return res.status(200).send();
        }
        break;
      }
    }

    // returns 200 on all non supported messages types because slack will retry
    // indefinitely otherwise.
    return res.status(200).end();
  }
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
