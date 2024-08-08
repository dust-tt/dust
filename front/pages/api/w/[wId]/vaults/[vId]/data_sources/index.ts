import type {
  DataSourceCategory,
  DataSourceInfo,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import { apiError } from "@app/logger/withlogging";

export type GetVaultDataSourcesResponseBody = {
  dataSources: DataSourceInfo[];
};

export const getDataSourceCategory = (
  dataSource: DataSourceResource
): DataSourceCategory => {
  if (!dataSource.connectorProvider) {
    return "files";
  }

  if (dataSource.connectorProvider === "webcrawler") {
    return "webfolder";
  }

  return "managed";
};

export const getDataSourceInfos = async (
  auth: Authenticator,
  vault: VaultResource
) => {
  const dataSourceViews = await DataSourceViewResource.listByVault(auth, vault);
  const dataSources = await DataSourceResource.listByVault(auth, vault);

  return [
    ...dataSourceViews.map((view) => {
      return {
        ...view.dataSource?.toJSON(),
        ...view.toJSON(),
        usage: 0,
        category: getDataSourceCategory(view.dataSource as DataSourceResource),
      };
    }),
    ...dataSources.map((dataSource) => ({
      ...dataSource.toJSON(),
      usage: 0,
      category: getDataSourceCategory(dataSource),
    })),
  ];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetVaultDataSourcesResponseBody>>,
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

  switch (req.method) {
    case "GET":
      const category =
        req.query.category && typeof req.query.category === "string"
          ? req.query.category
          : null;

      const all = await getDataSourceInfos(auth, vault);

      res.status(200).json({
        dataSources: all.filter(
          (dataSourceInfo) => !category || dataSourceInfo.category === category
        ),
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
