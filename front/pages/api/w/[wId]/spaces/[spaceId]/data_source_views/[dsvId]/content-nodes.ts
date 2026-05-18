/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
// @migration-target: front-api/routes/w/spaces/data_source_views.ts
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getContentNodesForDataSourceView } from "@app/lib/api/data_source_view";
import {
  getCursorPaginationParams,
  SortingParamsCodec,
} from "@app/lib/api/pagination";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { apiError } from "@app/logger/withlogging";
import { ContentNodesViewTypeCodec } from "@app/types/connectors/content_nodes";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import type { WithAPIErrorResponse } from "@app/types/error";
import { removeNulls } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const GetContentNodesOrChildrenRequestBody = z.object({
  internalIds: z.array(z.string().nullable()).optional(),
  parentId: z.string().optional(),
  viewType: ContentNodesViewTypeCodec,
  sorting: SortingParamsCodec.optional(),
});
export type GetContentNodesOrChildrenRequestBodyType = z.infer<
  typeof GetContentNodesOrChildrenRequestBody
>;

export type GetDataSourceViewContentNodes = {
  nodes: DataSourceViewContentNode[];
  total: number;
  totalIsAccurate: boolean;
  nextPageCursor: string | null;
};

// This endpoints serves two purposes:
// 1. Fetch content nodes for a given data source view.
// 2. Fetch children of a given content node.
// It always apply the data source view filter to the content nodes.
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetDataSourceViewContentNodes>>,
  auth: Authenticator,
  { dataSourceView }: { dataSourceView: DataSourceViewResource }
): Promise<void> {
  if (!dataSourceView.canReadOrAdministrate(auth)) {
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

  const bodyValidation = GetContentNodesOrChildrenRequestBody.safeParse(
    req.body
  );
  if (!bodyValidation.success) {
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${fromError(bodyValidation.error).toString()}`,
      },
      status_code: 400,
    });
  }

  const { internalIds, parentId, viewType, sorting } = bodyValidation.data;

  if (parentId && internalIds) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Cannot fetch with parentId and internalIds at the same time.",
      },
    });
  }

  const paginationRes = getCursorPaginationParams(req.query);
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
      sorting,
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

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    dataSourceView: { requireCanReadOrAdministrate: true },
  })
);
