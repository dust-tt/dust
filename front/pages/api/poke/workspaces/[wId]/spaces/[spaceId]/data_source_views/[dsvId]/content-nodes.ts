/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { getContentNodesForDataSourceView } from "@app/lib/api/data_source_view";
import {
  getCursorPaginationParams,
  SortingParamsCodec,
} from "@app/lib/api/pagination";
import type { PokeGetDataSourceViewContentNodes } from "@app/lib/api/poke/data_source_views";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { apiError } from "@app/logger/withlogging";
import { ContentNodesViewTypeCodec } from "@app/types/connectors/content_nodes";
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

// This endpoints serves two purposes:
// 1. Fetch content nodes for a given data source view.
// 2. Fetch children of a given content node.
// It always apply the data source view filter to the content nodes.
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeGetDataSourceViewContentNodes>>,
  session: SessionWithUser
): Promise<void> {
  const { wId } = req.query;
  if (typeof wId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace you're trying to modify was not found.",
      },
    });
  }

  const auth = await Authenticator.fromSuperUserSession(session, wId);

  const owner = auth.workspace();
  if (!owner || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_view_not_found",
        message: "Could not find the data source view.",
      },
    });
  }

  const { dsvId, spaceId } = req.query;
  if (typeof dsvId !== "string" || typeof spaceId !== "string") {
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
    spaceId !== dataSourceView.space.sId ||
    !dataSourceView.canReadOrAdministrate(auth)
  ) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_view_not_found",
        message: "The data source view you requested was not found.",
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

export default withSessionAuthenticationForPoke(handler);
