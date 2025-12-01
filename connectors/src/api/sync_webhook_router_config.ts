import type { Request, Response } from "express";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";

import { connectorsConfig } from "@connectors/connectors/shared/config";
import { NotionConnectorState } from "@connectors/lib/models/notion";
import { WebhookRouterConfigService } from "@connectors/lib/webhook_router_config";
import logger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import type { WithConnectorsAPIErrorReponse } from "@connectors/types";

type WebhookRouterEntryParams = {
  provider: "slack" | "notion";
  providerWorkspaceId: string;
};

type WebhookRouterEntryResBody = WithConnectorsAPIErrorReponse<{
  success: boolean;
}>;

const SyncWebhookRouterEntryBodySchema = t.type({
  signingSecret: t.string,
});

type SyncWebhookRouterEntryReqBody = t.TypeOf<
  typeof SyncWebhookRouterEntryBodySchema
>;

/**
 * POST /webhooks_router_entries/:webhook_secret/:provider/:providerWorkspaceId
 * Sync webhook router configuration entry for this region.
 * Looks up all connectors for the given providerWorkspaceId and updates the entry.
 */
const _syncWebhookRouterEntryHandler = async (
  req: Request<
    WebhookRouterEntryParams,
    WebhookRouterEntryResBody,
    SyncWebhookRouterEntryReqBody
  >,
  res: Response<WebhookRouterEntryResBody>
) => {
  const { provider, providerWorkspaceId } = req.params;

  const bodyValidation = SyncWebhookRouterEntryBodySchema.decode(req.body);
  if (isLeft(bodyValidation)) {
    const pathError = reporter.formatValidationErrors(bodyValidation.left);

    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${pathError}`,
      },
    });
  }

  const { signingSecret } = bodyValidation.right;
  const region = connectorsConfig.getCurrentRegion();

  try {
    let connectorIds: number[] = [];

    if (provider === "notion") {
      // Find all connectors for this Notion workspace in this region
      const notionConnectorStates = await NotionConnectorState.findAll({
        where: { notionWorkspaceId: providerWorkspaceId },
      });

      if (notionConnectorStates.length > 0) {
        // Get connector IDs for all connectors in this workspace
        const connectors = await ConnectorResource.fetchByIds(
          "notion",
          notionConnectorStates.map((state) => state.connectorId)
        );
        connectorIds = connectors.map((c: ConnectorResource) => c.id);

        logger.info(
          { notionWorkspaceId: providerWorkspaceId, connectorIds },
          `Found ${connectorIds.length} Notion connectors in region ${region}`
        );
      } else {
        logger.info(
          { notionWorkspaceId: providerWorkspaceId },
          "No Notion connectors found in this region"
        );
      }
    } else if (provider === "slack") {
      // Find all connectors for this Slack team in this region
      const slackConfig =
        await SlackConfigurationResource.fetchByActiveBot(providerWorkspaceId);

      if (slackConfig) {
        // Get the connector for this Slack configuration
        const connector = await ConnectorResource.fetchById(
          slackConfig.connectorId
        );
        if (connector) {
          connectorIds = [connector.id];

          logger.info(
            { slackTeamId: providerWorkspaceId, connectorIds },
            `Found Slack connector in region ${region}`
          );
        }
      } else {
        logger.info(
          { slackTeamId: providerWorkspaceId },
          "No Slack configuration found in this region"
        );
      }
    } else {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Unsupported provider '${provider}'`,
        },
      });
    }

    // Sync the entry for this region
    const service = new WebhookRouterConfigService();
    await service.syncEntry(
      provider,
      providerWorkspaceId,
      signingSecret,
      region,
      connectorIds
    );

    logger.info(
      { provider, providerWorkspaceId, region, connectorIds },
      `Successfully synced webhook router entry`
    );

    return res.status(200).json({
      success: true,
    });
  } catch (error) {
    logger.error(
      { error, provider, providerWorkspaceId },
      "Failed to sync webhook router entry"
    );

    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to sync webhook router entry",
      },
    });
  }
};

export const syncWebhookRouterEntryHandler = withLogging(
  _syncWebhookRouterEntryHandler
);
