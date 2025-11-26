import type { Request, Response } from "express";

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

export const deleteWebhookRouterEntryHandler = withLogging(
  _deleteWebhookRouterEntryHandler
);
