import type {
  ContentNodeWithParentIds,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import { ConnectorsAPI } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { filterAndCropContentNodesByView } from "@app/lib/api/data_source_view";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

const GetContentNodesRequestBodySchema = t.type({
  // TODO(2024-08-28 flav) Remove optional once the frontend is updated to use the new API.
  includeChildren: t.union([t.boolean, t.undefined]),
  internalIds: t.array(t.string),
});

export type GetDataSourceViewContentNodes = {
  nodes: ContentNodeWithParentIds[];
};

// This endpoints serves two purposes:
// 1. Fetch content nodes for a given data source view.
// 2. Fetch children of a given content node.
// It always apply the data source view filter to the content nodes.
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetDataSourceViewContentNodes>>,
  auth: Authenticator
): Promise<void> {
  const dataSourceView = await DataSourceViewResource.fetchById(
    auth,
    req.query.dsvId as string
  );

  if (
    !dataSourceView ||
    req.query.vId !== dataSourceView.vault.sId ||
    !dataSourceView.canRead(auth)
  ) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_view_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const { dataSource } = dataSourceView;

  // Only managed data sources can be queried for content nodes.
  if (dataSource.connectorId === null) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "data_source_not_managed",
        message: "The data source view you requested is not managed.",
      },
    });
  }

  const bodyValidation = GetContentNodesRequestBodySchema.decode(req.body);
  if (isLeft(bodyValidation)) {
    const pathError = reporter.formatValidationErrors(bodyValidation.left);

    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${pathError}`,
      },
      status_code: 400,
    });
  }

  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );

  const { includeChildren, internalIds } = bodyValidation.right;

  let contentNodes: ContentNodeWithParentIds[];

  // If the request is for children, we need to fetch the children of the internal ids.
  if (includeChildren) {
    if (internalIds.length !== 1) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "When fetching children, only one internal id should be provided.",
        },
      });
    }

    const [parentInternalId] = internalIds;

    const connectorsRes = await connectorsAPI.getConnectorPermissions({
      connectorId: dataSource.connectorId,
      filterPermission: "read",
      includeParents: true,
      parentId: parentInternalId,
      viewType: "documents",
    });

    if (connectorsRes.isErr()) {
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message:
            "An error occurred while fetching the resources' children content nodes.",
        },
      });
    }

    contentNodes = connectorsRes.value.resources;
  } else {
    const connectorsRes = await connectorsAPI.getContentNodes({
      connectorId: dataSource.connectorId,
      includeParents: true,
      internalIds,
    });
    if (connectorsRes.isErr()) {
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message:
            "An error occurred while fetching the resources' content nodes.",
        },
      });
    }

    contentNodes = connectorsRes.value.nodes;
  }

  const contentNodesInView = filterAndCropContentNodesByView(
    dataSourceView,
    contentNodes
  );

  return res.status(200).json({
    nodes: contentNodesInView,
  });
}

export default withSessionAuthenticationForWorkspace(handler);
