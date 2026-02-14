import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import type { WithAPIErrorResponse } from "@app/types/error";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetOAuthMetadataResponseBody = {
  metadata: Record<string, unknown>;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetOAuthMetadataResponseBody | void>
  >,
  auth: Authenticator,
): Promise<void> {
  const { dsId } = req.query;
  if (typeof dsId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  // fetchById enforces through auth the authorization (workspace here mainly).
  const dataSource = await DataSourceResource.fetchById(auth, dsId);
  if (!dataSource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  if (!dataSource.connectorId) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "data_source_not_managed",
        message: "The data source you requested is not managed.",
      },
    });
  }

  if (!dataSource.canAdministrate(auth)) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "data_source_auth_error",
        message: "Only workspace admins can access data source OAuth metadata.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      // Fetch connector details from connectors service
      const connectorsAPI = new ConnectorsAPI(
        config.getConnectorsAPIConfig(),
        logger,
      );

      const connectorRes = await connectorsAPI.getConnector(
        dataSource.connectorId.toString(),
      );

      if (connectorRes.isErr()) {
        logger.error(
          {
            connectorId: dataSource.connectorId,
            error: connectorRes.error,
          },
          "Failed to fetch connector details",
        );
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to fetch connector details.",
          },
        });
      }

      const connectionId = connectorRes.value.connectionId;

      if (!connectionId) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "connector_oauth_connection_not_found",
            message: "No OAuth connection found for this connector.",
          },
        });
      }

      // Fetch OAuth connection metadata
      const oauthAPI = new OAuthAPI(config.getOAuthAPIConfig(), logger);
      const metadataRes = await oauthAPI.getConnectionMetadata({
        connectionId,
      });

      if (metadataRes.isErr()) {
        logger.error(
          {
            connectionId,
            error: metadataRes.error,
          },
          "Failed to fetch OAuth connection metadata",
        );
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to fetch OAuth connection metadata.",
          },
        });
      }

      // Extract relevant metadata fields, excluding sensitive system fields
      const { connection } = metadataRes.value;
      const metadata = connection.metadata || {};

      delete metadata.client_secret;
      delete metadata.refresh_token;

      res.status(200).json({ metadata });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
