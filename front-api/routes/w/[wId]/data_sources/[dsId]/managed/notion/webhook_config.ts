import { Hono } from "hono";

import config from "@app/lib/api/config";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";

// Mounted at /api/w/:wId/data_sources/:dsId/managed/notion/webhook_config.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const dsId = c.req.param("dsId") ?? "";

  const dataSource = await DataSourceResource.fetchById(auth, dsId);
  if (!dataSource) {
    return c.json(
      {
        error: {
          type: "data_source_not_found",
          message: "The data source you requested was not found.",
        },
      },
      404
    );
  }

  if (!dataSource.connectorId || dataSource.connectorProvider !== "notion") {
    return c.json(
      {
        error: {
          type: "data_source_error",
          message:
            "The data source you requested is not a managed Notion data source.",
        },
      },
      400
    );
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
    return c.json(
      {
        error: {
          type: "internal_server_error",
          message: "Failed to get Notion workspace ID",
          connectors_error: workspaceIdRes.error,
        },
      },
      500
    );
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
    return c.json(
      {
        error: {
          type: "internal_server_error",
          message: "Failed to get webhook router entry",
          connectors_error: webhookRouterRes.error,
        },
      },
      500
    );
  }

  return c.json({
    webhookUrl,
    verificationToken: webhookRouterRes.value.signingSecret,
  });
});

export default app;
