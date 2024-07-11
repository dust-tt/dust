import type {
  WhitelistableFeature,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getAPIKey } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";

export type WorkspaceFeatureFlagsResponseBody = {
  feature_flags: WhitelistableFeature[];
};

/**
 * @swagger
 * /api/v1/w/{wId}/feature_flags:
 *   get:
 *     summary: List feature flags
 *     description: Get the feature flags for the workspace identified by {wId}.
 *     tags:
 *       - Workspace
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: Unique string identifier for the workspace
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Feature flags for the workspace
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 feature_flags:
 *                   type: array
 *                   items:
 *                     type: string
 *                     description: Feature flags enabled for the workspace
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<WorkspaceFeatureFlagsResponseBody>>
): Promise<void> {
  const keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    return apiError(req, res, keyRes.error);
  }
  const { auth } = await Authenticator.fromKey(
    keyRes.value,
    req.query.wId as string
  );

  const owner = auth.workspace();
  const isSystemKey = keyRes.value.isSystem;
  if (!owner || !isSystemKey || !auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      return res.status(200).json({ feature_flags: owner.flags });

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
