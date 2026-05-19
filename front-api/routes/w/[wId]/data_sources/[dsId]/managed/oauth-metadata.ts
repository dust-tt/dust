import { Hono } from "hono";

import config from "@app/lib/api/config";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { OAuthAPI } from "@app/types/oauth/oauth_api";

// Mounted at /api/w/:wId/data_sources/:dsId/managed/oauth-metadata.
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

  if (!dataSource.connectorId) {
    return c.json(
      {
        error: {
          type: "data_source_not_managed",
          message: "The data source you requested is not managed.",
        },
      },
      400
    );
  }

  if (!dataSource.canAdministrate(auth)) {
    return c.json(
      {
        error: {
          type: "data_source_auth_error",
          message:
            "Only workspace admins can access data source OAuth metadata.",
        },
      },
      403
    );
  }

  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );

  const connectorRes = await connectorsAPI.getConnector(
    dataSource.connectorId.toString()
  );

  if (connectorRes.isErr()) {
    logger.error(
      {
        connectorId: dataSource.connectorId,
        error: connectorRes.error,
      },
      "Failed to fetch connector details"
    );
    return c.json(
      {
        error: {
          type: "internal_server_error",
          message: "Failed to fetch connector details.",
        },
      },
      500
    );
  }

  const connectionId = connectorRes.value.connectionId;
  if (!connectionId) {
    return c.json(
      {
        error: {
          type: "connector_oauth_connection_not_found",
          message: "No OAuth connection found for this connector.",
        },
      },
      404
    );
  }

  const oauthAPI = new OAuthAPI(config.getOAuthAPIConfig(), logger);
  const metadataRes = await oauthAPI.getConnectionMetadata({ connectionId });

  if (metadataRes.isErr()) {
    logger.error(
      {
        connectionId,
        error: metadataRes.error,
      },
      "Failed to fetch OAuth connection metadata"
    );
    return c.json(
      {
        error: {
          type: "internal_server_error",
          message: "Failed to fetch OAuth connection metadata.",
        },
      },
      500
    );
  }

  // Extract relevant metadata fields, excluding sensitive system fields.
  const { connection } = metadataRes.value;
  const metadata = connection.metadata || {};

  delete metadata.client_secret;
  delete metadata.refresh_token;

  return c.json({ metadata });
});

export default app;
