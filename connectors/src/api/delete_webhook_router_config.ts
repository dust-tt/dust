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
  providerWorkspaceId: string;
};

type WebhookRouterEntryResBody = WithConnectorsAPIErrorReponse<{
  success: boolean;
}>;

/**
 * DELETE /webhooks/router_entries/:provider/:providerWorkspaceId
 * Delete a webhook router configuration entry.
 */
const _deleteWebhookRouterEntryHandler = async (
  req: Request<WebhookRouterEntryParams, WebhookRouterEntryResBody, never>,
  res: Response<WebhookRouterEntryResBody>
) => {
  const { provider, providerWorkspaceId } = req.params;

  try {
    const service = new WebhookRouterConfigService();
    await service.deleteEntry(provider, providerWorkspaceId);

    logger.info(
      { provider, providerWorkspaceId },
      "Successfully deleted webhook router entry"
    );

    return res.status(200).json({
      success: true,
    });
  } catch (error) {
    logger.error(
      { error, provider, providerWorkspaceId },
      "Failed to delete webhook router entry"
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
            : "Failed to delete webhook router entry",
      },
    });
  }
};

export const deleteWebhookRouterEntryHandler = withLogging(
  _deleteWebhookRouterEntryHandler
);
