import config from "@app/lib/api/config";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import type { GetNotionWebhookConfigResponseBody } from "@app/types/api/data_sources/managed_notion";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  dsId: z.string(),
});

// Mounted at /api/w/:wId/data_sources/:dsId/managed/notion/webhook_config.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetNotionWebhookConfigResponseBody> => {
    const auth = ctx.get("auth");
    const { dsId } = ctx.req.valid("param");

    const dataSource = await DataSourceResource.fetchById(auth, dsId);
    if (!dataSource) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "data_source_not_found",
          message: "The data source you requested was not found.",
        },
      });
    }

    if (!dataSource.connectorId || dataSource.connectorProvider !== "notion") {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "data_source_error",
          message:
            "The data source you requested is not a managed Notion data source.",
        },
      });
    }

    if (!dataSource.canAdministrate(auth)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "data_source_auth_error",
          message:
            "Only workspace administrators can configure Notion webhooks.",
        },
      });
    }

    ctx.header("Cache-Control", "no-store");

    const connectorAPIConfig = config.getConnectorsAPIConfig();
    const connectorsAPI = new ConnectorsAPI(connectorAPIConfig, logger);

    const registrationRes = await connectorsAPI.createNotionWebhookRegistration(
      dataSource.connectorId
    );

    if (registrationRes.isErr()) {
      logger.error(
        {
          connectorId: dataSource.connectorId,
          error: registrationRes.error,
        },
        "Failed to create Notion webhook registration"
      );
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to create Notion webhook registration",
          connectors_error: registrationRes.error,
        },
      });
    }

    const { notionWorkspaceId, registrationToken } = registrationRes.value;
    const webhookUrl = `https://webhook-router.dust.tt/notion/${encodeURIComponent(
      notionWorkspaceId
    )}/${encodeURIComponent(registrationToken)}`;

    // Try to get the verification token from the webhooks router.
    const webhookRouterRes = await connectorsAPI.getWebhookRouterEntry({
      provider: "notion",
      providerWorkspaceId: notionWorkspaceId,
      webhookSecret: connectorAPIConfig.webhookSecret,
    });

    if (webhookRouterRes.isErr()) {
      // 404 is expected when the webhook hasn't been set up yet.
      if (
        webhookRouterRes.error.type === "not_found" ||
        webhookRouterRes.error.type === "connector_not_found"
      ) {
        return ctx.json({ webhookUrl, verificationToken: null });
      }

      logger.error(
        {
          error: webhookRouterRes.error,
          notionWorkspaceId,
        },
        "Failed to get webhook router entry"
      );
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to get webhook router entry",
          connectors_error: webhookRouterRes.error,
        },
      });
    }

    return ctx.json({
      webhookUrl,
      verificationToken: webhookRouterRes.value.signingSecret,
    });
  }
);

export default app;
