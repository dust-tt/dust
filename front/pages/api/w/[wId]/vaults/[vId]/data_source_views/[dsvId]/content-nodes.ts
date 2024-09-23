import type {
  DataSourceViewContentNode,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import { ContentNodesViewTypeCodec, removeNulls } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getContentNodesForDataSourceView } from "@app/lib/api/data_source_view";
import { getOffsetPaginationParams } from "@app/lib/api/pagination";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { apiError } from "@app/logger/withlogging";

const GetContentNodesOrChildrenRequestBody = t.type({
  internalIds: t.union([t.array(t.union([t.string, t.null])), t.undefined]),
  parentId: t.union([t.string, t.undefined]),
  viewType: ContentNodesViewTypeCodec,
});

export type GetDataSourceViewContentNodes = {
  nodes: DataSourceViewContentNode[];
  total: number;
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
        message: "Invalid path parameters.",
      },
    });
  }

  const dataSourceView = await DataSourceViewResource.fetchById(auth, dsvId);

  if (
    !dataSourceView ||
    vId !== dataSourceView.vault.sId ||
    !dataSourceView.canList(auth)
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

  const { internalIds, parentId, viewType } = bodyValidation.right;

  if (parentId && internalIds) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Cannot fetch with parentId and internalIds at the same time.",
      },
    });
  }

  const paginationRes = getOffsetPaginationParams(req);
  if (paginationRes.isErr()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_pagination_parameters",
        message: "Invalid pagination parameters",
      },
    });
  }

  const contentNodesRes = await getContentNodesForDataSourceView(
    dataSourceView,
    {
      internalIds: internalIds ? removeNulls(internalIds) : undefined,
      parentId,
      pagination: paginationRes.value,
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

  return res.status(200).json(contentNodesRes.value);
}

export default withSessionAuthenticationForWorkspace(handler);
