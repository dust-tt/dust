import config from "@app/lib/api/config";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

// Mounted at /api/w/:wId/data_sources/:dsId/managed/notion/webhook_config.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const dsId = c.req.param("dsId") ?? "";

  const dataSource = await DataSourceResource.fetchById(auth, dsId);
  if (!dataSource) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  if (!dataSource.connectorId || dataSource.connectorProvider !== "notion") {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "data_source_error",
        message:
          "The data source you requested is not a managed Notion data source.",
      },
    });
  }

  const connectorAPIConfig = config.getConnectorsAPIConfig();
  const connectorsAPI = new ConnectorsAPI(connectorAPIConfig, logger);

  // Get the Notion workspace ID.
  const workspaceIdRes = await connectorsAPI.getNotionWorkspaceId(
    dataSource.connectorId
  );

  if (workspaceIdRes.isErr()) {
    logger.error(
      {
        connectorId: dataSource.connectorId,
        error: workspaceIdRes.error,
      },
      "Failed to get Notion workspace ID"
    );
    return apiError(c, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to get Notion workspace ID",
        connectors_error: workspaceIdRes.error,
      },
    });
  }

  const notionWorkspaceId = workspaceIdRes.value.notionWorkspaceId;
  const webhookUrl = `https://webhook-router.dust.tt/notion/${notionWorkspaceId}`;

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
      return c.json({ webhookUrl, verificationToken: null });
    }

    logger.error(
      {
        error: webhookRouterRes.error,
        notionWorkspaceId,
      },
      "Failed to get webhook router entry"
    );
    return apiError(c, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to get webhook router entry",
        connectors_error: webhookRouterRes.error,
      },
    });
  }

  return c.json({
    webhookUrl,
    verificationToken: webhookRouterRes.value.signingSecret,
  });
});

export default app;
