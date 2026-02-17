import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import apiConfig from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

// Post because of the request body.
export type PostNotionUrlStatusResponseBody = WithAPIErrorResponse<{
  notion: {
    exists: boolean;
    type?: "page" | "database";
  };
  dust: {
    synced: boolean;
    lastSync?: string;
    breadcrumbs?: Array<{
      id: string;
      title: string;
      type: "page" | "database" | "workspace";
    }>;
  };
  summary: string;
}>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PostNotionUrlStatusResponseBody>,
  auth: Authenticator
): Promise<void> {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only admins can check Notion URL status",
      },
    });
  }

  const owner = auth.getNonNullableWorkspace();
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

  const dataSource = await DataSourceResource.fetchById(auth, dsId);

  if (!dataSource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "Data source not found",
      },
    });
  }

  if (dataSource.connectorProvider !== "notion") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Data source is not a Notion connector",
      },
    });
  }

  const flags = await getFeatureFlags(owner);
  if (!flags.includes("advanced_notion_management")) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "feature_flag_not_found",
        message: "Advanced Notion management feature is not enabled",
      },
    });
  }

  if (!dataSource.connectorId) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Data source does not have a connector",
      },
    });
  }

  const connectorId = dataSource.connectorId;

  switch (req.method) {
    case "POST": {
      const { url } = req.body;

      if (!url || typeof url !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Missing or invalid 'url' in request body",
          },
        });
      }

      const connectorsAPI = new ConnectorsAPI(
        apiConfig.getConnectorsAPIConfig(),
        logger
      );

      const statusRes = await connectorsAPI.getNotionUrlStatus({
        connectorId,
        url,
      });

      if (statusRes.isErr()) {
        logger.error(
          {
            workspaceId: owner.sId,
            dataSourceId: dataSource.sId,
            error: statusRes.error,
          },
          "Failed to get Notion URL status"
        );
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to check URL status",
          },
        });
      }

      return res.status(200).json(statusRes.value);
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "Method not supported",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
