import type { WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getMembers } from "@app/lib/api/workspace";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";

export type ListMemberEmailsResponseBody = {
  emails: string[];
};

/**
 * @swagger
 * /api/v1/w/{wId}/members/emails:
 *   get:
 *     summary: List member emails
 *     description: List the emails of all members in the workspace identified by {wId}.
 *     tags:
 *       - Workspace
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: Unique string identifier for the workspace
 *         schema:
 *           type: string
 *       - in: query
 *         name: activeOnly
 *         required: false
 *         description: Whether to list only active members
 *         schema:
 *           type: boolean
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: The emails
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 emails:
 *                   type: array
 *                   items:
 *                     type: string
 *                     description: Email address of a workspace member
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

  const { activeOnly } = req.query;

  switch (req.method) {
    case "GET":
      const allMembers = await getMembers(auth, {
        activeOnly: !!activeOnly,
      });

      return res.status(200).json({ emails: allMembers.map((m) => m.email) });

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
