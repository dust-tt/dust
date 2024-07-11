import type { AppType, WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getApps } from "@app/lib/api/app";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";

export type GetAppsResponseBody = {
  apps: AppType[];
};

/**
 * @swagger
 * /api/v1/w/{wId}/apps:
 *   get:
 *     summary: List apps
 *     description: Get all apps of a workspace.
 *     tags:
 *       - Apps
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
 *         description: Apps of the workspace
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Workspace'
 *       400:
 *         description: Bad Request. Missing or invalid parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       500:
 *         description: Internal Server Error.
 *       404:
 *         description: Workspace not found.
 *       405:
 *         description: Method not supported.
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetAppsResponseBody>>
): Promise<void> {
  const keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    return apiError(req, res, keyRes.error);
  }
  const { auth } = await Authenticator.fromKey(
    keyRes.value,
    req.query.wId as string
  );

  const apps = await getApps(auth);

  switch (req.method) {
    case "GET":
      res.status(200).json({ apps });
      return;

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
