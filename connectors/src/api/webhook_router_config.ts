import type { Request, Response } from "express";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";

import { connectorsConfig } from "@connectors/connectors/shared/config";
import { NotionConnectorState } from "@connectors/lib/models/notion";
import {
  WebhookRouterConfigService,
  WebhookRouterEntryNotFoundError,
} from "@connectors/lib/webhook_router_config";
import logger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import type { WithConnectorsAPIErrorReponse } from "@connectors/types";

type WebhookRouterEntryParams = {
  provider: "slack" | "notion";
  appId: string;
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
 * Wrapper for webhook router operations that handles errors and logging.
 */
async function executeWebhookRouterOperation(
  req: Request<WebhookRouterEntryParams>,
  res: Response<WebhookRouterEntryResBody>,
  operation: () => Promise<void>,
  operationName: string
): Promise<Response<WebhookRouterEntryResBody> | void> {
  const { provider, appId } = req.params;

  try {
    await operation();

    logger.info(
      { provider, appId },
      `${operationName} webhook router entry operation was successful`
    );

    return res.status(200).json({
      success: true,
    });
  } catch (error) {
    logger.error(
      { error, provider, appId },
      `Failed to ${operationName} webhook router entry`
    );

    // Check if it's a not found error
    if (error instanceof WebhookRouterEntryNotFoundError) {
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "not_found",
          message: error.message,
        },
      });
    }

    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message:
          error instanceof Error
            ? error.message
            : `Failed to ${operationName} webhook router entry`,
      },
    });
  }
}

/**
 * POST /webhooks/router_entries/:provider/:appId
 * Add or update a webhook router configuration entry.
 */
const _addWebhookRouterEntryHandler = async (
  req: Request<
    WebhookRouterEntryParams,
    WebhookRouterEntryResBody,
    AddWebhookRouterEntryReqBody
  >,
  res: Response<WebhookRouterEntryResBody>
) => {
  const { provider, appId } = req.params;

  if (provider === "notion") {
    // Validate that the Notion workspace exists. It's a normal condition for it
    // not to exist, since firebase will send this request to all regions, and
    // only one region will have the Notion workspace.
    const notionConnectorState = await NotionConnectorState.findOne({
      where: { notionWorkspaceId: appId },
    });

    if (!notionConnectorState) {
      logger.info(
        { notionWorkspaceId: appId },
        "Received request to add webhook router entry for unknown Notion workspace"
      );
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "not_found",
          message: `Notion workspace ${appId} not found`,
        },
      });
    }
  } else if (provider == "slack") {
    // TODO: make sure appId is valid Slack app ID
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

  return executeWebhookRouterOperation(
    req,
    res,
    async () => {
      const service = new WebhookRouterConfigService();
      await service.addEntry(provider, appId, {
        signing_secret,
        regions,
      });
    },
    "add"
  );
};

/**
 * DELETE /webhooks/router_entries/:provider/:appId
 * Delete a webhook router configuration entry.
 */
const _deleteWebhookRouterEntryHandler = async (
  req: Request<WebhookRouterEntryParams, WebhookRouterEntryResBody, never>,
  res: Response<WebhookRouterEntryResBody>
) => {
  const { provider, appId } = req.params;

  return executeWebhookRouterOperation(
    req,
    res,
    async () => {
      const service = new WebhookRouterConfigService();
      await service.deleteEntry(provider, appId);
    },
    "delete"
  );
};

// Export handlers wrapped with logging
export const addWebhookRouterEntryHandler = withLogging(
  _addWebhookRouterEntryHandler
);

export const deleteWebhookRouterEntryHandler = withLogging(
  _deleteWebhookRouterEntryHandler
);
