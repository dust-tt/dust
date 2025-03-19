import type { PostWorkspaceSearchResponseBodyType } from "@dust-tt/client";
import { SearchRequestBodySchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import { handleSearch } from "@app/lib/api/search";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

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

  const searchResult = await handleSearch(req, auth, r.data);

  if (searchResult.isErr()) {
    return apiError(req, res, {
      status_code: searchResult.error.status,
      api_error: searchResult.error.error,
    });
  }

  return res.status(200).json(searchResult.value);
}

export default withPublicAPIAuthentication(handler);
