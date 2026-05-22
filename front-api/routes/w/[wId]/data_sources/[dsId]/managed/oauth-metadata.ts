import config from "@app/lib/api/config";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

export type GetOAuthMetadataResponseBody = {
  metadata: Record<string, unknown>;
};

// Mounted at /api/w/:wId/data_sources/:dsId/managed/oauth-metadata.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<GetOAuthMetadataResponseBody> => {
  const auth = ctx.get("auth");
  const dsId = ctx.req.param("dsId") ?? "";

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

  if (!dataSource.connectorId) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "data_source_not_managed",
        message: "The data source you requested is not managed.",
      },
    });
  }

  if (!dataSource.canAdministrate(auth)) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "data_source_auth_error",
        message: "Only workspace admins can access data source OAuth metadata.",
      },
    });
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
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to fetch connector details.",
      },
    });
  }

  const connectionId = connectorRes.value.connectionId;
  if (!connectionId) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "connector_oauth_connection_not_found",
        message: "No OAuth connection found for this connector.",
      },
    });
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
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to fetch OAuth connection metadata.",
      },
    });
  }

  // Extract relevant metadata fields, excluding sensitive system fields.
  const { connection } = metadataRes.value;
  const metadata = connection.metadata || {};

  delete metadata.client_secret;
  delete metadata.refresh_token;

  return ctx.json({ metadata });
});

export default app;
