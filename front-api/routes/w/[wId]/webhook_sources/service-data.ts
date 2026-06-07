import config from "@app/lib/api/config";
import { checkConnectionOwnership } from "@app/lib/api/oauth";
import { WEBHOOK_SERVICES } from "@app/lib/api/triggers/built-in-webhooks/services";
import logger from "@app/logger/logger";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import type { GetServiceDataResponseType } from "@app/types/triggers/webhooks";
import { isWebhookProvider } from "@app/types/triggers/webhooks";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const GetServiceDataQuerySchema = z.object({
  connectionId: z.string().min(1, "connectionId is required"),
  provider: z.string().min(1, "provider is required"),
});

// Mounted at /api/w/:wId/webhook_sources/service-data.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  validate("query", GetServiceDataQuerySchema),
  async (ctx): HandlerResult<GetServiceDataResponseType> => {
    const auth = ctx.get("auth");

    const { connectionId, provider } = ctx.req.valid("query");

    if (!isWebhookProvider(provider)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Invalid provider: ${provider}. Must be a valid webhook provider.`,
        },
      });
    }

    const ownershipCheck = await checkConnectionOwnership(auth, connectionId);
    if (ownershipCheck.isErr()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "Connection does not belong to this user/workspace",
        },
      });
    }

    const oauthAPI = new OAuthAPI(config.getOAuthAPIConfig(), logger);

    const metadataRes = await oauthAPI.getConnectionMetadata({
      connectionId,
    });

    if (metadataRes.isErr()) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "invalid_request_error",
          message: "Connection not found",
        },
      });
    }

    if (metadataRes.value.connection.provider !== provider) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "Connection is not made for this provider",
        },
      });
    }

    const tokenRes = await oauthAPI.getAccessToken({ connectionId });

    if (tokenRes.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to get access token",
        },
      });
    }

    const accessToken = tokenRes.value.access_token;

    const serviceDataResult =
      await WEBHOOK_SERVICES[provider].getServiceData(accessToken);

    if (serviceDataResult.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: serviceDataResult.error.message,
        },
      });
    }

    return ctx.json({
      serviceData: serviceDataResult.value,
    });
  }
);

export default app;
