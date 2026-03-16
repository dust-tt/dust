/**
 * @swagger
 * /api/w/{wId}/assistant/mentions/suggestions:
 *   get:
 *     summary: Get mention suggestions
 *     description: Returns mention suggestions for the workspace.
 *     tags:
 *       - Private Mentions
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: query
 *         name: query
 *         required: false
 *         description: Search query to filter suggestions
 *         schema:
 *           type: string
 *       - in: query
 *         name: select
 *         required: false
 *         description: Filter by type (agents, users, or both)
 *         schema:
 *           type: string
 *           enum: [agents, users]
 *       - in: query
 *         name: current
 *         required: false
 *         description: Whether to include only current mentions
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *       - in: query
 *         name: spaceId
 *         required: false
 *         description: Filter suggestions by space
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 suggestions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PrivateMentionSuggestion'
 *       401:
 *         description: Unauthorized
 */
import { suggestionsOfMentions } from "@app/lib/api/assistant/conversation/mention_suggestions";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { RichMention } from "@app/types/assistant/mentions";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

type MentionSuggestionsResponseBody = {
  suggestions: RichMention[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<MentionSuggestionsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const { select: selectParam, current, spaceId: spaceIdParam } = req.query;

  const spaceId = isString(spaceIdParam) ? spaceIdParam : undefined;

  const { query: queryParam } = req.query;
  const query = isString(queryParam) ? queryParam.trim().toLowerCase() : "";

  // Parse select parameter: can be "agents", "users", ["agents", "users"], or undefined.
  const select = (() => {
    if (!selectParam) {
      return { agents: true, users: true };
    }

    const selectValues = isString(selectParam) ? [selectParam] : selectParam;
    const agents = selectValues.includes("agents");
    const users = selectValues.includes("users");

    return { agents, users };
  })();

  const suggestions = await suggestionsOfMentions(auth, {
    query,
    select,
    current: current === "true",
    spaceId,
  });

  return res.status(200).json({ suggestions });
}

export default withSessionAuthenticationForWorkspace(handler);
