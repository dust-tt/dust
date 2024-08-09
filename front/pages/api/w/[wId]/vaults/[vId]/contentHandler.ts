import type { ContentNodeType, WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import {
  getManagedDataSourceContent,
  getUnmanagedDataSourceContent,
} from "@app/lib/api/vaults";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { apiError } from "@app/logger/withlogging";

export type LightContentNode = {
  internalId: string;
  parentInternalId: string | null;
  type: ContentNodeType;
  title: string;
  expandable: boolean;
  preventSelection?: boolean;
  dustDocumentId: string | null;
  lastUpdatedAt: number | null;
};

export type GetDataSourceContentResponseBody = {
  nodes: LightContentNode[];
};

export const getContentHandler = async (
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetDataSourceContentResponseBody>>,
  dataSource: DataSourceResource,
  rootNodes: string[] | null
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

  let parentId: string | null = null;
  if (req.query.parentId && typeof req.query.parentId === "string") {
    parentId = req.query.parentId;
  }

  const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
  const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

  const content = dataSource.connectorId
    ? await getManagedDataSourceContent(
        dataSource.connectorId,
        "read",
        rootNodes,
        parentId,
        viewType
      )
    : await getUnmanagedDataSourceContent(dataSource, viewType, limit, offset);

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
    nodes: content.value,
  });
  return;
};
