import type { WithAPIErrorResponse, WorkspaceDomain } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getWorkspaceVerifiedDomain } from "@app/lib/api/workspace";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";

export type ListMemberEmailsResponseBody = {
  verified_domains: WorkspaceDomain[];
};

/**
 * @swagger
 * /api/v1/w/{wId}/verified_domains:
 *   get:
 *     summary: Get verified domains
 *     description: Get the verified domain for the workspace identified by {wId}.
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
 *         description: The verified domain
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Workspace'
 *       404:
 *         description: The workspace was not found
 *       405:
 *         description: Method not supported
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<ListMemberEmailsResponseBody>>
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
      const verifiedDomain = await getWorkspaceVerifiedDomain(owner);

      return res
        .status(200)
        .json({ verified_domains: verifiedDomain ? [verifiedDomain] : [] });

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
