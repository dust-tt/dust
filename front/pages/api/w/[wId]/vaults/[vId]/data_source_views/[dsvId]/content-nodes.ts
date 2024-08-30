import type {
  DataSourceViewContentNode,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import { ContentNodesViewTypeCodec, removeNulls } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import {
  filterAndCropContentNodesByView,
  getContentNodesForManagedDataSourceView,
  getContentNodesForStaticDataSourceView,
} from "@app/lib/api/data_source_view";
import { getOffsetPaginationParams } from "@app/lib/api/pagination";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { apiError } from "@app/logger/withlogging";

const DEFAULT_LIMIT = 100;

const GetContentNodesRequestBodBaseSchema = t.type({
  internalIds: t.array(t.union([t.string, t.null])),
  viewType: ContentNodesViewTypeCodec,
});

const GetContentNodesRequestBodySchema = t.intersection([
  GetContentNodesRequestBodBaseSchema,
  t.type({
    includeChildren: t.undefined,
  }),
]);

const GetContentNodeChildrenRequestBodySchema = t.intersection([
  GetContentNodesRequestBodBaseSchema,
  t.type({
    includeChildren: t.literal(true),
  }),
]);

const GetContentNodesOrChildrenRequestBody = t.union([
  GetContentNodeChildrenRequestBodySchema,
  GetContentNodesRequestBodySchema,
]);

export type GetDataSourceViewContentNodes = {
  nodes: DataSourceViewContentNode[];
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
  const { dsvId, vId } = req.query;
  if (typeof dsvId !== "string" || typeof vId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid request query parameters.",
      },
    });
  }

  const dataSourceView = await DataSourceViewResource.fetchById(auth, dsvId);

  if (
    !dataSourceView ||
    vId !== dataSourceView.vault.sId ||
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

  const bodyValidation = GetContentNodesOrChildrenRequestBody.decode(req.body);
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

  const { includeChildren, internalIds, viewType } = bodyValidation.right;

  if (includeChildren && internalIds.length > 1) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "When fetching children, only one internal id should be provided.",
      },
    });
  }

  const paginationRes = getOffsetPaginationParams(req, {
    defaultLimit: DEFAULT_LIMIT,
    defaultOffset: 0,
  });
  if (paginationRes.isErr()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_pagination_parameters",
        message: "Invalid pagination parameters",
      },
    });
  }

  let contentNodes: DataSourceViewContentNode[];

  if (dataSourceView.dataSource.connectorId) {
    const contentNodesRes = await getContentNodesForManagedDataSourceView(
      dataSourceView,
      {
        includeChildren: includeChildren === true,
        internalIds: removeNulls(internalIds),
        viewType,
      }
    );

    if (contentNodesRes.isErr()) {
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: contentNodesRes.error.message,
        },
      });
    }

    contentNodes = contentNodesRes.value;
  } else {
    if (internalIds.length > 0) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Internal ids should not be provided for static data sources.",
        },
      });
    }

    const contentNodesRes = await getContentNodesForStaticDataSourceView(
      dataSourceView,
      viewType,
      paginationRes.value
    );

    if (contentNodesRes.isErr()) {
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: contentNodesRes.error.message,
        },
      });
    }

    contentNodes = contentNodesRes.value;
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
