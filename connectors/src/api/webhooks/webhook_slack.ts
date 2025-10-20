import { DustAPI, removeNulls } from "@dust-tt/client";
import { JSON } from "@jsonjoy.com/util/lib/json-brand";
import type { Request, Response } from "express";

import {
  isChannelCreatedEvent,
  onChannelCreation,
} from "@connectors/api/webhooks/slack/created_channel";
import { handleDeprecatedChatBot } from "@connectors/api/webhooks/slack/deprecated_bot";
import type {
  SlackWebhookReqBody,
  SlackWebhookResBody,
} from "@connectors/api/webhooks/slack/utils";
import { isSlackWebhookEventReqBody } from "@connectors/api/webhooks/slack/utils";
import { getBotUserIdMemoized } from "@connectors/connectors/slack/lib/bot_user_helpers";
import { updateSlackChannelInConnectorsDb } from "@connectors/connectors/slack/lib/channels";
import {
  getSlackClient,
  reportSlackUsage,
} from "@connectors/connectors/slack/lib/slack_client";
import {
  getSlackChannelSourceUrl,
  slackChannelInternalIdFromSlackChannelId,
} from "@connectors/connectors/slack/lib/utils";
import {
  launchSlackGarbageCollectWorkflow,
  launchSlackSyncOneMessageWorkflow,
  launchSlackSyncOneThreadWorkflow,
} from "@connectors/connectors/slack/temporal/client";
import { apiConfig } from "@connectors/lib/api/config";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { upsertDataSourceFolder } from "@connectors/lib/data_sources";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import { SlackChannel } from "@connectors/lib/models/slack";
import mainLogger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import { INTERNAL_MIME_TYPES } from "@connectors/types";

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
      connectorType: "slack",
      slackTeamId: teamId,
    });

    const slackConfigurations =
      await SlackConfigurationResource.listForTeamId(teamId);
    if (slackConfigurations.length === 0) {
      return apiError(req, res, {
        api_error: {
          type: "connector_configuration_not_found",
          message: `Slack configuration not found for teamId ${teamId}`,
        },
        status_code: 404,
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
          await handleDeprecatedChatBot(req, res, logger);
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
                status_code: 404,
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
            await handleDeprecatedChatBot(req, res, logger);
            break;
          } else if (event.channel_type === "channel") {
            if (!event.channel) {
              return apiError(req, res, {
                api_error: {
                  type: "invalid_request_error",
                  message: "Missing channel in request body for message event",
                },
                status_code: 400,
              });
            }

            const channel = event.channel;
            let err: Error | null = null;

            // Get valid slack configurations for this channel once
            const validConfigurations = await Promise.all(
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
                    "Skipping webhook: Slack channel not yet in DB"
                  );
                  return null;
                }

                if (slackChannel.skipReason) {
                  logger.info(
                    {
                      connectorId: c.connectorId,
                      slackChannelId: channel,
                      skipReason: slackChannel.skipReason,
                    },
                    `Ignoring message because channel is skipped: ${slackChannel.skipReason}`
                  );
                  return null;
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
                  return null;
                }

                // Check if workspace is in maintenance mode
                const connector = await ConnectorResource.fetchById(
                  c.connectorId
                );
                if (!connector) {
                  logger.info(
                    {
                      connectorId: c.connectorId,
                      slackChannelId: channel,
                    },
                    "Skipping webhook: Connector not found"
                  );
                  return null;
                }

                const dataSourceConfig =
                  dataSourceConfigFromConnector(connector);
                const dustAPI = new DustAPI(
                  {
                    url: apiConfig.getDustFrontAPIUrl(),
                  },
                  {
                    apiKey: dataSourceConfig.workspaceAPIKey,
                    workspaceId: dataSourceConfig.workspaceId,
                  },
                  logger
                );

                // Make a simple API call to check if workspace is accessible
                const spacesRes = await dustAPI.getSpaces();
                if (spacesRes.isErr()) {
                  logger.info(
                    {
                      connectorId: connector.id,
                      slackTeamId: teamId,
                      slackChannelId: channel,
                      workspaceId: dataSourceConfig.workspaceId,
                      error: spacesRes.error.message,
                    },
                    "Skipping webhook: workspace is unavailable (likely in maintenance)"
                  );
                  return null;
                }

                return c;
              })
            );

            const activeConfigurations = removeNulls(validConfigurations);

            if (activeConfigurations.length === 0) {
              logger.info(
                {
                  channel,
                  slackTeamId: teamId,
                },
                "No active configurations for channel"
              );
              return res.status(200).send();
            }

            // Handle channel rename
            if (event.subtype === "channel_name") {
              const slackChannelId = event.channel;
              const slackChannelName = event.name;

              if (!slackChannelName) {
                return apiError(req, res, {
                  status_code: 500,
                  api_error: {
                    type: "invalid_request_error",
                    message:
                      "Missing new channel name in request body for channel rename",
                  },
                });
              }
              try {
                await concurrentExecutor(
                  activeConfigurations,
                  async (c) => {
                    const connector = await ConnectorResource.fetchById(
                      c.connectorId
                    );
                    if (!connector) {
                      logger.error({
                        connector,
                        slackChannelId: channel,
                        slackTeamId: c.slackTeamId,
                        message: `Connector ${c.connectorId} not found`,
                      });
                      return;
                    }

                    await upsertDataSourceFolder({
                      dataSourceConfig:
                        dataSourceConfigFromConnector(connector),
                      folderId:
                        slackChannelInternalIdFromSlackChannelId(
                          slackChannelId
                        ),
                      parents: [
                        slackChannelInternalIdFromSlackChannelId(
                          slackChannelId
                        ),
                      ],
                      parentId: null,
                      title: `#${slackChannelName}`,
                      mimeType: INTERNAL_MIME_TYPES.SLACK.CHANNEL,
                      sourceUrl: getSlackChannelSourceUrl(slackChannelId, c),
                      providerVisibility: "public",
                    });
                    return updateSlackChannelInConnectorsDb({
                      slackChannelId,
                      slackChannelName,
                      connectorId: c.connectorId,
                    });
                  },
                  { concurrency: 2 }
                );

                logger.info(
                  {
                    type: event.type,
                    channel: event.channel,
                    oldName: event.old_name,
                    newName: event.name,
                    slackTeamId: teamId,
                  },
                  "Successfully processed Slack channel rename"
                );
                return res.status(200).send();
              } catch (e) {
                return apiError(req, res, {
                  status_code: 500,
                  api_error: {
                    type: "internal_server_error",
                    message: e instanceof Error ? e.message : JSON.stringify(e),
                  },
                });
              }
            } else if (event.subtype === "message_deleted") {
              // Handle message deletion
              if (!event.deleted_ts) {
                logger.info(
                  {
                    event,
                  },
                  "Ignoring message_deleted event without deleted_ts"
                );
                return res.status(200).send();
              }

              const eventThreadTimestamp = event.thread_ts;
              if (eventThreadTimestamp) {
                // If message was in a thread, re-sync the whole thread
                const results = await Promise.all(
                  activeConfigurations.map((c) =>
                    launchSlackSyncOneThreadWorkflow(
                      c.connectorId,
                      channel,
                      eventThreadTimestamp
                    )
                  )
                );
                for (const r of results) {
                  if (r.isErr()) {
                    err = r.error;
                  }
                }
              } else {
                // If it was a non-threaded message, re-sync the week's messages
                // here event.deleted_ts corresponds to the message timestamp
                const messageTs = event.deleted_ts;
                const results = await Promise.all(
                  activeConfigurations.map((c) =>
                    launchSlackSyncOneMessageWorkflow(
                      c.connectorId,
                      channel,
                      messageTs
                    )
                  )
                );
                for (const r of results) {
                  if (r.isErr()) {
                    err = r.error;
                  }
                }
              }
            }
            // Handle normal message
            else if (event.thread_ts) {
              const thread_ts = event.thread_ts;
              const results = await Promise.all(
                activeConfigurations.map((c) =>
                  launchSlackSyncOneThreadWorkflow(
                    c.connectorId,
                    channel,
                    thread_ts
                  )
                )
              );
              for (const r of results) {
                if (r.isErr()) {
                  err = r.error;
                }
              }
            } else if (event.ts) {
              const ts = event.ts;
              const results = await Promise.all(
                activeConfigurations.map((c) =>
                  launchSlackSyncOneMessageWorkflow(c.connectorId, channel, ts)
                )
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
            }

            logger.info(
              {
                type: event.type,
                channel: event.channel,
                ts: event.ts,
                thread_ts: event.thread_ts,
                user: event.user,
                slackTeamId: teamId,
              },
              `Successfully processed Slack Webhook`
            );
            return res.status(200).send();
          }
          break;
        }
        case "channel_created": {
          if (isChannelCreatedEvent(event)) {
            const onChannelCreationRes = await onChannelCreation({
              event,
              logger,
              provider: "slack",
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
        // message on private channels to draw attention on data sensitivity
        case "member_joined_channel": {
          if (!event.channel) {
            return apiError(req, res, {
              api_error: {
                type: "invalid_request_error",
                message:
                  "Missing channel in request body for channel_joined event",
              },
              status_code: 400,
            });
          }

          const slackConfig =
            await SlackConfigurationResource.fetchByActiveBot(teamId);

          if (!slackConfig) {
            return apiError(req, res, {
              api_error: {
                type: "connector_configuration_not_found",
                message: `Slack configuration not found for teamId ${teamId}. Are you sure the bot is not enabled?`,
              },
              status_code: 404,
            });
          }

          const slackClient = await getSlackClient(slackConfig.connectorId);

          const myUserId = await getBotUserIdMemoized(
            slackClient,
            slackConfig.connectorId
          );

          // if the bot is not the one joining the channel, ignore
          if (event.user !== myUserId) {
            return res.status(200).send();
          }

          reportSlackUsage({
            connectorId: slackConfig.connectorId,
            method: "conversations.info",
            channelId: event.channel,
          });
          const channelInfo = await slackClient.conversations.info({
            channel: event.channel,
          });

          if (channelInfo?.channel?.is_private) {
            reportSlackUsage({
              connectorId: slackConfig.connectorId,
              method: "chat.postMessage",
              channelId: event.channel,
            });
            await slackClient.chat.postMessage({
              channel: event.channel,
              text: "You can now talk to Dust in this channel. ⚠️ If private channel synchronization has been allowed on your Dust workspace, admins will now be able to synchronize data from this channel.",
            });
          }

          return res.status(200).send();
        }
        /**
         * `channel_left`, `channel_deleted` handler.
         */
        case "channel_left":
        case "channel_deleted": {
          if (!event.channel) {
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
                type: event.type,
              },
              `Successfully processed Slack Webhook`
            );
            return res.status(200).send();
          }
        }
        case "channel_rename":
          break;
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

export const webhookSlackAPIHandler = withLogging(_webhookSlackAPIHandler);
