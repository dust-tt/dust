import type { Request, Response } from "express";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";

import { connectorsConfig } from "@connectors/connectors/shared/config";
import { NotionConnectorState } from "@connectors/lib/models/notion";
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

const AddWebhookRouterEntryBodySchema = t.intersection([
  t.type({
    signing_secret: t.string,
  }),
  t.partial({
    regions: t.array(t.union([t.literal("US"), t.literal("EU")])),
  }),
]);

type AddWebhookRouterEntryReqBody = t.TypeOf<
  typeof AddWebhookRouterEntryBodySchema
>;

/**
 * POST /webhooks/router_entries/:provider/:providerWorkspaceId
 * Add or update a webhook router configuration entry.
 *
 * PATCH /webhooks/router_entries/:provider/:providerWorkspaceId
 * Merge regions with existing entry (or create if doesn't exist).
 */
const _addWebhookRouterEntryHandler = async (
  req: Request<
    WebhookRouterEntryParams,
    WebhookRouterEntryResBody,
    AddWebhookRouterEntryReqBody
  >,
  res: Response<WebhookRouterEntryResBody>,
  merge: boolean = false
) => {
  const { provider, providerWorkspaceId } = req.params;

  if (provider === "notion") {
    // Validate that the Notion workspace exists. It's a normal condition for it
    // not to exist, since firebase will send this request to all regions, and
    // only one region will have the Notion workspace.
    const notionConnectorState = await NotionConnectorState.findOne({
      where: { notionWorkspaceId: providerWorkspaceId },
    });

    if (!notionConnectorState) {
      logger.info(
        { notionWorkspaceId: providerWorkspaceId },
        "Received request to add webhook router entry for unknown Notion workspace"
      );
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "not_found",
          message: `Notion workspace ${providerWorkspaceId} not found`,
        },
      });
    }
  } else if (provider == "slack") {
    // Make sure providerWorkspaceId is a valid Slack team id
    const slackConfig =
      await SlackConfigurationResource.fetchByTeamId(providerWorkspaceId);
    if (!slackConfig) {
      logger.info(
        { slackTeamId: providerWorkspaceId },
        "Received request to add webhook router entry for unknown Slack team"
      );
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "not_found",
          message: `Slack team ${providerWorkspaceId} not found`,
        },
      });
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

  const bodyValidation = AddWebhookRouterEntryBodySchema.decode(req.body);
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

  // If no regions are specified, default to the current region
  const { signing_secret, regions: bodyRegions } = bodyValidation.right;
  const regions = bodyRegions ?? [connectorsConfig.getCurrentShortRegion()];

  try {
    const service = new WebhookRouterConfigService();
    await service.addEntry(
      provider,
      providerWorkspaceId,
      {
        signing_secret,
        regions,
      },
      { merge }
    );

    logger.info(
      { provider, providerWorkspaceId, merge },
      `Successfully added webhook router entry`
    );

    return res.status(200).json({
      success: true,
    });
  } catch (error) {
    logger.error(
      { error, provider, providerWorkspaceId, merge },
      `Failed to add webhook router entry`
    );

    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message:
          error instanceof Error
            ? error.message
            : `Failed to add webhook router entry`,
      },
    });
  }
};

export const addWebhookRouterEntryHandler = withLogging(
  (
    req: Request<
      WebhookRouterEntryParams,
      WebhookRouterEntryResBody,
      AddWebhookRouterEntryReqBody
    >,
    res: Response<WebhookRouterEntryResBody>
  ) => _addWebhookRouterEntryHandler(req, res, false)
);

export const patchWebhookRouterEntryHandler = withLogging(
  (
    req: Request<
      WebhookRouterEntryParams,
      WebhookRouterEntryResBody,
      AddWebhookRouterEntryReqBody
    >,
    res: Response<WebhookRouterEntryResBody>
  ) => _addWebhookRouterEntryHandler(req, res, true)
);
