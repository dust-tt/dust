import type { Request, Response } from "express";

import type {
  TeamsWebhookReqBody,
  TeamsWebhookResBody,
} from "@connectors/api/webhooks/teams/utils";
import {
  handleTeamsChatBot,
  isTeamsWebhookEventReqBody,
  withTeamsTrace,
} from "@connectors/api/webhooks/teams/utils";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import mainLogger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";

const _webhookTeamsBotAPIHandler = async (
  req: Request<
    Record<string, string>,
    TeamsWebhookResBody,
    TeamsWebhookReqBody
  >,
  res: Response<TeamsWebhookResBody>
) => {
  if (req.body.type === "message") {
    if (!isTeamsWebhookEventReqBody(req.body)) {
      return apiError(req, res, {
        api_error: {
          type: "invalid_request_error",
          message: "Missing required fields in request body",
        },
        status_code: 400,
      });
    }

    const reqBody = req.body;
    const { tenantId } = reqBody;
    
    if (!tenantId) {
      return apiError(req, res, {
        api_error: {
          type: "invalid_request_error",
          message: "Missing tenantId in request body",
        },
        status_code: 400,
      });
    }

    const logger = mainLogger.child({
      connectorType: "teams_bot",
      teamsTenantId: tenantId,
    });

    // Find Microsoft connector for this tenant
    const connectors = await ConnectorResource.listByType("microsoft", {});
    
    let targetConnector: ConnectorResource | null = null;
    for (const connector of connectors) {
      // Check if this connector belongs to the same tenant
      // This would require tenant ID matching logic based on your Microsoft connector setup
      // For now, we'll use the first available Microsoft connector
      // TODO: Implement proper tenant matching
      if (connector.connectionId) {
        targetConnector = connector;
        break;
      }
    }

    if (!targetConnector) {
      return apiError(req, res, {
        api_error: {
          type: "connector_configuration_not_found",
          message: `Microsoft connector not found for tenantId ${tenantId}`,
        },
        status_code: 421,
      });
    }

    const { activity } = reqBody;
    logger.info(
      {
        activity: {
          type: activity.type,
          channelId: activity.channelId,
          conversationId: activity.conversation?.id,
        },
      },
      "Processing Teams webhook event"
    );

    try {
      switch (activity.type) {
        case "message": {
          // Handle direct messages and channel messages
          if (activity.text && activity.from?.id) {
            await withTeamsTrace({
              "teams.tenant_id": tenantId,
              "teams.app": "teams_bot",
            })(handleTeamsChatBot)(req, res, logger, targetConnector);
          }
          break;
        }
        default: {
          logger.info(
            {
              activity: {
                type: activity.type,
                channelId: activity.channelId,
                conversationId: activity.conversation?.id,
              },
            },
            "Teams webhook activity type not supported"
          );
          break;
        }
      }
    } catch (e) {
      if (e instanceof ExternalOAuthTokenError) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "connector_oauth_error",
            message: e.message,
          },
        });
      }
      throw e;
    }

    return res.status(200).end();
  }

  // Unknown message type
  return res.status(200).end();
};

export const webhookTeamsBotAPIHandler = withLogging(
  _webhookTeamsBotAPIHandler
);