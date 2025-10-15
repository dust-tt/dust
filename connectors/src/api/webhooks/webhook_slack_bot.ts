import type { Request, Response } from "express";

import {
  isChannelCreatedEvent,
  onChannelCreation,
} from "@connectors/api/webhooks/slack/created_channel";
import type {
  SlackWebhookReqBody,
  SlackWebhookResBody,
} from "@connectors/api/webhooks/slack/utils";
import {
  handleChatBot,
  isAppMentionMessage,
  isSlackWebhookEventReqBody,
  withTrace,
} from "@connectors/api/webhooks/slack/utils";
import { getBotUserIdMemoized } from "@connectors/connectors/slack/lib/bot_user_helpers";
import { getSlackClient } from "@connectors/connectors/slack/lib/slack_client";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import mainLogger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";

const _webhookSlackBotAPIHandler = async (
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
    if (!isSlackWebhookEventReqBody(req.body)) {
      return apiError(req, res, {
        api_error: {
          type: "invalid_request_error",
          message: "Missing required fields in request body",
        },
        status_code: 400,
      });
    }
    const reqBody = req.body;
    const { team_id: teamId } = reqBody;
    if (!teamId) {
      return apiError(req, res, {
        api_error: {
          type: "invalid_request_error",
          message: "Missing team_id in request body",
        },
        status_code: 400,
      });
    }

    const logger = mainLogger.child({
      connectorType: "slack_bot",
      slackTeamId: teamId,
    });

    const slackConfigurations =
      await SlackConfigurationResource.listForTeamId(teamId);
    if (slackConfigurations.length === 0) {
      const error: {
        type: "connector_configuration_not_found";
        message: string;
      } = {
        type: "connector_configuration_not_found",
        message: `Slack configuration not found for teamId ${teamId}`,
      };

      const requestFromRouter =
        req.headers["x-dust-clientid"] == "slack-webhook-router";

      if (requestFromRouter) {
        // If the request is coming from the router, we don't want to log the error as it's expected, and it floods Datadog with non-actionable errors
        // Nonetheless, we return the 421 as the router will handle it
        return res.status(421).json({ error });
      }

      return apiError(req, res, {
        api_error: error,
        status_code: 421,
      });
    }

    const { event } = reqBody;
    logger.info(
      {
        event: {
          type: event.type,
          channelType: event.channel_type,
          channelName: event.channel,
        },
      },
      "Processing webhook event"
    );

    try {
      switch (event.type) {
        case "app_mention": {
          await withTrace({
            "slack.team_id": teamId,
            "slack.app": "slack_bot",
          })(handleChatBot)(req, res, logger);
          break;
        }
        /**
         * `message` handler.
         */
        case "message": {
          if (event.channel_type === "im") {
            // Got a private message
            if (
              event.subtype === "message_changed" ||
              event.subtype === "message_deleted"
            ) {
              // Ignore message_changed and message_deleted events in private messages
              return res.status(200).send();
            }
            const slackConfig =
              await SlackConfigurationResource.fetchByActiveBot(teamId);
            if (!slackConfig) {
              return apiError(req, res, {
                api_error: {
                  type: "connector_configuration_not_found",
                  message: `Slack configuration not found for teamId ${teamId}. Are you sure the bot is not enabled?`,
                },
                status_code: 421,
              });
            }
            const connector = await ConnectorResource.fetchById(
              slackConfig.connectorId
            );
            if (!connector) {
              return apiError(req, res, {
                api_error: {
                  type: "connector_not_found",
                  message: `Connector ${slackConfig.connectorId} not found`,
                },
                status_code: 404,
              });
            }

            const slackClient = await getSlackClient(slackConfig.connectorId);

            const myUserId = await getBotUserIdMemoized(
              slackClient,
              slackConfig.connectorId
            );
            if (event.user === myUserId) {
              // Message sent from the bot itself.
              return res.status(200).send();
            }
            // Message from an actual user (a human)
            await withTrace({
              "slack.team_id": teamId,
              "slack.app": "slack_bot",
            })(handleChatBot)(req, res, logger);
          } else if (event.channel_type === "channel") {
            if (
              !event.bot_id &&
              event.channel &&
              event.ts &&
              event.user &&
              !event.subtype
            ) {
              const slackConfig =
                await SlackConfigurationResource.fetchByActiveBot(teamId);
              if (slackConfig) {
                // Check if the channel has an enhanced default agent configured
                const channel =
                  await SlackConfigurationResource.findChannelWithAutoRespond(
                    slackConfig.connectorId,
                    event.channel
                  );

                if (channel && channel.agentConfigurationId) {
                  logger.info(
                    {
                      slackChannelId: event.channel,
                      agentConfigurationId: channel.agentConfigurationId,
                      autoRespondWithoutMention:
                        channel.autoRespondWithoutMention,
                    },
                    "Found enhanced default agent for channel - processing message"
                  );

                  // Avoid double processing since we already handle app mention events
                  const isAppMention = await isAppMentionMessage(
                    event.text,
                    teamId
                  );
                  if (isAppMention) {
                    return res.status(200).send();
                  }

                  await withTrace({
                    "slack.team_id": teamId,
                    "slack.app": "slack_bot",
                  })(handleChatBot)(req, res, logger);
                }
              }
            }
          }
          break;
        }
        case "channel_created": {
          if (isChannelCreatedEvent(event)) {
            const onChannelCreationRes = await onChannelCreation({
              event,
              logger,
              provider: "slack_bot",
            });
            if (onChannelCreationRes.isErr()) {
              return apiError(req, res, {
                api_error: {
                  type: "internal_server_error",
                  message: onChannelCreationRes.error.message,
                },
                status_code: 500,
              });
            } else {
              return res.status(200).send();
            }
          } else {
            logger.error(
              {
                eventChannel: event.channel,
              },
              "Invalid channel object"
            );
            return apiError(req, res, {
              api_error: {
                type: "unexpected_response_format",
                message: `Invalid channel object: ${event.channel} `,
              },
              status_code: 400,
            });
          }
        }
        default: {
          logger.info(
            {
              event: {
                type: event.type,
                channelType: event.channel_type,
                channelName: event.channel,
              },
            },
            "Webhook event type not supported"
          );
          break;
        }
      }
    } catch (e) {
      if (e instanceof ExternalOAuthTokenError) {
        // Prevent 500 when we receive webhooks after a de-auth which can happen at times.
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "connector_oauth_error",
            message: e.message,
          },
        });
      }
      // Unexpected error
      throw e;
    }

    // returns 200 on all non supported messages types because slack will retry
    // indefinitely otherwise.
    return res.status(200).end();
  }
};

export const webhookSlackBotAPIHandler = withLogging(
  _webhookSlackBotAPIHandler
);
