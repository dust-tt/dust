import type { PostWorkspaceSearchResponseBodyType } from "@dust-tt/client";
import { SearchRequestBodySchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import {
  getContentNodeFromCoreNode,
  NON_SEARCHABLE_NODES_MIME_TYPES,
} from "@app/lib/api/content_nodes";
import { getCursorPaginationParams } from "@app/lib/api/pagination";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { getSearchFilterFromDataSourceViews } from "@app/lib/search";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { CoreAPI, removeNulls } from "@app/types";

/**
 * @swagger
 * /api/v1/w/{wId}/search:
 *   post:
 *     summary: Search for nodes in the workspace
 *     description: Search for nodes in the workspace
 *     tags:
 *       - Search
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: The search query
 *               includeDataSources:
 *                 type: array
 *                 description: List of data source IDs to include in search
 *                 items:
 *                   type: string
 *               viewType:
 *                 type: string
 *                 description: Type of view to filter results
 *               spaceIds:
 *                 type: array
 *                 description: List of space IDs to search in
 *                 items:
 *                   type: string
 *               nodeIds:
 *                 type: array
 *                 description: List of specific node IDs to search
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Search results retrieved successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Space not found
 *       405:
 *         description: Method not allowed
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PostWorkspaceSearchResponseBodyType>
  >,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const r = SearchRequestBodySchema.safeParse(req.body);

  if (r.error) {
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: fromError(r.error).toString(),
      },
      status_code: 400,
    });
  }

  const { query, includeDataSources, viewType, spaceIds, nodeIds } = r.data;

  const spaces = await SpaceResource.listWorkspaceSpacesAsMember(auth);
  if (!spaces.length) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "No accessible spaces found.",
      },
    });
  }
  const availableSpaceIds = new Set(spaces.map((s) => s.sId));
  if (spaceIds && spaceIds.some((sId) => !availableSpaceIds.has(sId))) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "Invalid space ids.",
      },
    });
  }

  const spacesToSearch = spaces.filter(
    (s) => !spaceIds || spaceIds.includes(s.sId)
  );

  const allDatasourceViews = await DataSourceViewResource.listBySpaces(
    auth,
    spacesToSearch
  );

  if (!allDatasourceViews.length) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "No datasource views found in accessible spaces.",
      },
    });
  }

  const searchFilterResult = getSearchFilterFromDataSourceViews(
    auth.getNonNullableWorkspace(),
    allDatasourceViews,
    {
      excludedNodeMimeTypes: NON_SEARCHABLE_NODES_MIME_TYPES,
      includeDataSources,
      viewType,
      nodeIds,
    }
  );
  const paginationRes = getCursorPaginationParams(req);
  if (paginationRes.isErr()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_pagination_parameters",
        message: "Invalid pagination parameters",
      },
    });
  }

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const searchRes = await coreAPI.searchNodes({
    query,
    filter: searchFilterResult,
    options: {
      limit: paginationRes.value?.limit,
      cursor: paginationRes.value?.cursor ?? undefined,
    },
  });

  if (searchRes.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: searchRes.error.message,
      },
    });
  }

  const nodes = removeNulls(
    searchRes.value.nodes.map((node) => {
      const matchingViews = allDatasourceViews.filter(
        (dsv) =>
          dsv.dataSource.dustAPIDataSourceId === node.data_source_id &&
          (!dsv.parentsIn ||
            node.parents?.some(
              (p) => !dsv.parentsIn || dsv.parentsIn.includes(p)
            ))
      );

      if (matchingViews.length === 0) {
        return null;
      }

      return {
        ...getContentNodeFromCoreNode(node, viewType),
        dataSource: matchingViews[0].dataSource.toJSON(),
        dataSourceViews: matchingViews.map((dsv) => dsv.toJSON()),
      };
    })
  );

  return res
    .status(200)
    .json({ nodes, warningCode: searchRes.value.warning_code });
}

export default withPublicAPIAuthentication(handler);
