import type { Request, Response } from "express";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";

import { connectorsConfig } from "@connectors/connectors/shared/config";
import { NotionConnectorStateModel } from "@connectors/lib/models/notion";
import { WebhookRouterConfigService } from "@connectors/lib/webhook_router_config";
import logger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import type { WithConnectorsAPIErrorReponse } from "@connectors/types";

type WebhookRouterEntryParams = {
  provider: "slack" | "notion";
  providerWorkspaceId: string;
};

type WebhookRouterEntryResBody = WithConnectorsAPIErrorReponse<{
  success: boolean;
}>;

const SyncWebhookRouterEntryBodySchema = t.partial({
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

  let connectorIds: number[] = [];

  if (provider === "notion") {
    // Find all connectors for this Notion workspace in this region
    const notionConnectorStates = await NotionConnectorStateModel.findAll({
      where: { notionWorkspaceId: providerWorkspaceId },
    });

    if (notionConnectorStates.length > 0) {
      // Get connector IDs for all connectors in this workspace
      connectorIds = notionConnectorStates.map((state) => state.connectorId);

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
    const slackConfigs =
      await SlackConfigurationResource.listForTeamId(providerWorkspaceId);

    if (slackConfigs.length > 0) {
      // Get the connector for this Slack configuration
      connectorIds = slackConfigs.map(
        (c: SlackConfigurationResource) => c.connectorId
      );

      logger.info(
        { slackTeamId: providerWorkspaceId, connectorIds },
        `Found ${connectorIds.length} Slack connectors in region ${region}`
      );
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

  // If signingSecret was provided but no connectors found, return error
  if (signingSecret && connectorIds.length === 0) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `No connectors found for provider '${provider}' and providerWorkspaceId '${providerWorkspaceId}' in region '${region}'. Cannot sync with provided signing secret.`,
      },
    });
  }

  // Check if signing secret differs from existing entry
  const service = new WebhookRouterConfigService();
  if (signingSecret) {
    const existingEntry = await service.getEntry(provider, providerWorkspaceId);
    if (existingEntry && existingEntry.signingSecret !== signingSecret) {
      logger.warn(
        {
          provider,
          providerWorkspaceId,
        },
        "Signing secret differs from existing entry - updating to new secret"
      );
    }
  }

  // Sync the entry for this region
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
};

export const syncWebhookRouterEntryHandler = withLogging(
  _syncWebhookRouterEntryHandler
);
