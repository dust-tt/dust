import type { ContentNode, WithAPIErrorResponse } from "@dust-tt/types";
import { ConnectorsAPI } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export type GetDataSourceContentResponseBody = {
  resources: ContentNode[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetDataSourceContentResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace you requested was not found.",
      },
    });
  }

  const vault = await VaultResource.fetchById(auth, req.query.vId as string);

  if (!vault || !auth.hasPermission([vault.acl()], "read")) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "vault_not_found",
        message: "The vault you requested was not found.",
      },
    });
  }

  const dataSourceView = await DataSourceViewResource.fetchById(
    auth,
    req.query.dsvId as string
  );
  const dataSource = dataSourceView?.dataSource;

  if (!dataSourceView || !dataSource || dataSourceView.vaultId !== vault.id) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const viewType = req.query.viewType;
      if (
        !viewType ||
        typeof viewType !== "string" ||
        (viewType !== "tables" && viewType !== "documents")
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid viewType. Required: tables | documents",
          },
        });
      }

      let parentIds: string[] | null = dataSourceView.parentsIn;
      if (req.query.parentId && typeof req.query.parentId === "string") {
        parentIds = [req.query.parentId];
      }

      if (!dataSource.connectorId) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "data_source_error",
            message: "Invalid datasource.",
          },
        });
      }
      const connectorsAPI = new ConnectorsAPI(
        config.getConnectorsAPIConfig(),
        logger
      );

      const contentNodes = [];
      if (!parentIds) {
        contentNodes.push(
          await connectorsAPI.getConnectorPermissions({
            connectorId: dataSource.connectorId,
            filterPermission: "read",
            viewType,
          })
        );
      } else {
        for (const parentId of parentIds) {
          contentNodes.push(
            await connectorsAPI.getConnectorPermissions({
              connectorId: dataSource.connectorId,
              parentId,
              filterPermission: "read",
              viewType,
            })
          );
        }
      }
      if (contentNodes.some((r) => r.isErr())) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `An error occurred while retrieving the data source permissions.`,
          },
        });
      }
      const permissions = contentNodes.flatMap((r) =>
        r.isOk() ? r.value.resources : []
      );

      res.status(200).json({
        resources: permissions,
      });
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
