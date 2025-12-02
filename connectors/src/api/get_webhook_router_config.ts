import type { Request, Response } from "express";

import { WebhookRouterConfigService } from "@connectors/lib/webhook_router_config";
import logger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import type { WithConnectorsAPIErrorReponse } from "@connectors/types";

type WebhookRouterEntryParams = {
  provider: "slack" | "notion";
  providerWorkspaceId: string;
};

type GetWebhookRouterEntryResBody = WithConnectorsAPIErrorReponse<{
  signingSecret: string;
}>;

/**
 * GET /webhooks_router_entries/:webhook_secret/:provider/:providerWorkspaceId
 * Get a webhook router configuration entry signing secret.
 */
const _getWebhookRouterEntryHandler = async (
  req: Request<WebhookRouterEntryParams, GetWebhookRouterEntryResBody>,
  res: Response<GetWebhookRouterEntryResBody>
) => {
  const { provider, providerWorkspaceId } = req.params;

  const service = new WebhookRouterConfigService();
  const entry = await service.getEntry(provider, providerWorkspaceId);

  if (!entry) {
    logger.info(
      { provider, providerWorkspaceId },
      "Webhook router entry not found"
    );

    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "not_found",
        message: `Webhook router entry not found for provider '${provider}' and providerWorkspaceId '${providerWorkspaceId}'`,
      },
    });
  }

  logger.info(
    { provider, providerWorkspaceId },
    "Successfully retrieved webhook router entry"
  );

  return res.status(200).json({
    signingSecret: entry.signingSecret,
  });
};

export const getWebhookRouterEntryHandler = withLogging(
  _getWebhookRouterEntryHandler
);
