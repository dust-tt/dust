import type {
  DataSourceCategory,
  DataSourceInfo,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getAPIKey } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import { apiError, withLogging } from "@app/logger/withlogging";

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
  workspaceAuth: Authenticator,
  vault: VaultResource
) => {
  const dataSourceViews = await DataSourceViewResource.listByVault(
    workspaceAuth,
    vault
  );

  const dataSourceByName: { [key: number]: DataSourceResource } = {};

  const dataSources = await DataSourceResource.listByVault(
    workspaceAuth,
    vault
  );

  for (const view of dataSourceViews) {
    const dataSource = await view.fetchDataSource(workspaceAuth);
    if (dataSource) {
      dataSourceByName[dataSource.id] = dataSource;
    }
  }

  return [
    ...dataSourceViews.map((view) => {
      const dataSource = dataSourceByName[view.dataSourceId];
      return {
        ...dataSource.toJSON(),
        ...view.toJSON(),
        usage: 0,
        category: getDataSourceCategory(dataSource),
      };
    }),
    ...dataSources.map((dataSource) => ({
      ...dataSource.toJSON(),
      usage: 0,
      category: getDataSourceCategory(dataSource),
    })),
  ];
};

/**
 * @swagger
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetVaultDataSourcesResponseBody>>
): Promise<void> {
  const keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    return apiError(req, res, keyRes.error);
  }
  const { workspaceAuth } = await Authenticator.fromKey(
    keyRes.value,
    req.query.wId as string
  );

  const owner = workspaceAuth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace you requested was not found.",
      },
    });
  }

  const vault = await VaultResource.fetchById(
    workspaceAuth,
    req.query.vId as string
  );

  if (!vault) {
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

      const all = await getDataSourceInfos(workspaceAuth, vault);

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

export default withLogging(handler);
