import type {
  ContentNode,
  VaultType,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import {
  getManagedDataSourceContent,
  getUnmanagedDataSourceContent,
} from "@app/lib/api/vaults";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { apiError } from "@app/logger/withlogging";

export type GetVaultResponseBody = {
  vault: VaultType;
};

export type GetDataSourceContentResponseBody = {
  resources: ContentNode[];
};

export const getContentHandler = async (
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetDataSourceContentResponseBody>>,
  dataSource: DataSourceResource,
  parentIds: string[] | null
): Promise<void> => {
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

  if (req.query.parentId && typeof req.query.parentId === "string") {
    parentIds = [req.query.parentId];
  }

  const content = dataSource.connectorId
    ? await getManagedDataSourceContent(
        dataSource.connectorId,
        "read",
        parentIds,
        viewType
      )
    : await getUnmanagedDataSourceContent(dataSource, parentIds, viewType);

  if (content.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `An error occurred while retrieving the data source permissions.`,
      },
    });
  }

  res.status(200).json({
    resources: content.value,
  });
  return;
};
